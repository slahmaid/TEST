/**
 * Prumysl — SIFT.ma delivery connection (add next to admin-api.gs, in the main store's project AND in the pliers project:
 * each store has its own SIFT store, so each project gets its own key).
 *
 * Setup (once per project):
 *   Project Settings › Script properties › add  SIFT_API_KEY = <the key from app.sift.ma › Intégrations › Clés API>
 *   (the key is never written in these files nor sent to the panel).
 *   Then in the admin panel › التوصيل › « تفعيل التحديث التلقائي » registers the webhook with SIFT.
 *
 * Flow:
 *   • An order set to « مؤكد » in the panel is created in SIFT (customOrderNo = our order number, idempotent) and booked:
 *     the tracking number is saved in column Q « SIFT » and in the order's history.
 *   • SIFT sends shipment.status_changed to this script's /exec URL (?sift=<secret token>). Apps Script cannot read the
 *     request's signature header, so the message is only used as a hint: the script re-reads the shipment from SIFT's API
 *     with the key and only trusts that answer.
 *   • SIFT status → panel status: picked up / with the carrier → « تم الشحن », delivered → « تم التسليم »,
 *     returned → « مرتجع », cancelled → « ملغي ». Stock moves follow (stock-api.gs) as for any status change.
 *   • « مزامنة الآن » in the panel (or the optional 15-minute trigger, installSiftTrigger) catches anything missed.
 */

var SIFT_BASE = 'https://app.sift.ma/api/v1';
var SIFT_COL = 17; // Q
var SIFT_HEADER = 'SIFT';
var SIFT_LABELS = {
  draft: 'مسودة', pickup_requested: 'طلب الاستلام', pickup_scheduled: 'استلام مبرمج', out_for_pickup: 'في الطريق للاستلام',
  pickup_failed: 'فشل الاستلام', picked_up: 'تم الاستلام', at_sift_hub: 'في مستودع SIFT', ready_for_carrier: 'جاهز للناقل',
  on_hold_at_hub: 'متوقف في المستودع', handed_to_carrier: 'عند الناقل', in_transit: 'في الطريق', out_for_delivery: 'خرج للتوصيل',
  at_pickup_point: 'في نقطة الاستلام', no_answer: 'الزبون لا يجيب', unreachable: 'الهاتف غير متاح', attempt_failed: 'محاولة فاشلة',
  postponed: 'مؤجل', delivery_issue: 'مشكل في التوصيل', refused: 'رفض الاستلام', return_pending: 'إرجاع قيد الانتظار',
  returning_to_hub: 'في طريق الإرجاع', return_at_hub: 'الإرجاع في المستودع', return_scheduled: 'إرجاع مبرمج',
  return_out_for_delivery: 'الإرجاع في الطريق إليك', return_delivery_failed: 'فشل تسليم الإرجاع', return_handed_over: 'تم تسليم الإرجاع',
  delivered: 'تم التسليم', returned: 'مرتجع', cancelled: 'ملغى', lost: 'ضائع'
};
var SIFT_BEFORE_PICKUP = ['draft', 'pickup_requested', 'pickup_scheduled', 'out_for_pickup', 'pickup_failed'];
var SIFT_ACTIONS = ['sift_status', 'sift_setup', 'sift_sync', 'sift_push'];

function siftKey_() { return String(PropertiesService.getScriptProperties().getProperty('SIFT_API_KEY') || '').trim(); }

/** SIFT shipment status → panel status ('' = leave the panel status as it is). */
function siftPanelStatus_(st) {
  if (!st) return '';
  if (st === 'delivered') return 'تم التسليم';
  if (st === 'returned' || st === 'return_handed_over') return 'مرتجع';
  if (st === 'cancelled') return 'ملغي';
  if (st === 'lost') return '';
  if (SIFT_BEFORE_PICKUP.indexOf(st) >= 0) return '';
  return 'تم الشحن';
}

/** One call to SIFT's API. Returns { ok, status, data, error, message }. */
function siftFetch_(method, path, body, idem) {
  var key = siftKey_();
  if (!key) return { ok: false, error: 'SIFT_NO_KEY', message: 'مفتاح SIFT غير مُعدّ (SIFT_API_KEY في خصائص السكربت).' };
  var opt = { method: method, muteHttpExceptions: true, followRedirects: true, headers: { 'x-api-key': key, Accept: 'application/json' } };
  if (idem) opt.headers['Idempotency-Key'] = idem;
  if (body != null) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var resp;
  try { resp = UrlFetchApp.fetch(SIFT_BASE + path, opt); } catch (err) { return { ok: false, error: 'SIFT_NETWORK', message: String(err && err.message || err) }; }
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }
  if (code >= 200 && code < 300) return { ok: true, status: code, data: data };
  var e = data && (data.error || data) || {};
  var ecode = code === 401 ? 'HTTP_401' : code === 403 ? 'HTTP_403' : String(e.code || e.error || ('HTTP_' + code));
  return { ok: false, status: code, error: ecode, message: String(e.message || e.detail || e.title || text || '').slice(0, 300), data: data };
}

function siftState_(cell) {
  try { var s = JSON.parse(cell || '{}'); return s && typeof s === 'object' ? s : {}; } catch (err) { return {}; }
}

/** City for SIFT: the part before " - " / "," of the city column (it often holds "CITY - address"). */
function siftSplitCity_(text) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  var m = t.split(/\s+-\s+|\s*[,،]\s*|\s*\/\s*/);
  return { city: (m[0] || t).trim(), address: t };
}

function siftRecipientPhone_(p) {
  var d = String(p || '').replace(/\D/g, '');
  if (d.length === 9 && /^[5-7]/.test(d)) d = '0' + d;
  return d;
}

/**
 * Creates (or finds, thanks to the idempotency key) the order in SIFT and books it.
 * r = order row (A..Q). Returns the new SIFT state object for column Q, plus a history note.
 */
function siftPushRow_(r) {
  var st = siftState_(r[SIFT_COL - 1]);
  var orderId = String(r[ADMIN_COL.id - 1] || '');
  var out = { state: st, note: '' };
  if (st.tracking) return out;                       // already booked
  var where = siftSplitCity_(r[2]);
  var qty = Math.max(1, parseInt(r[5], 10) || 1);
  var total = parseFloat(String(r[6] == null ? '' : r[6]).replace(',', '.')) || 0;
  var product = String(r[4] || '').trim() || 'طلب';
  var items = [{ name: product.slice(0, 200), quantity: qty }];
  if (adminSd_(r[ADMIN_COL.sd - 1], r[4]) && !ADMIN_SD_RE.test(product)) items.push({ name: 'بطاقة ذاكرة SD', quantity: qty });
  var body = {
    recipient: { name: String(r[1] || 'Client').trim().slice(0, 120) || 'Client', phone: siftRecipientPhone_(r[3]), address: where.address.slice(0, 500) || where.city, city: where.city.slice(0, 120) },
    description: items.map(function (x) { return x.name + (x.quantity > 1 ? ' × ' + x.quantity : ''); }).join(' + ').slice(0, 500),
    codAmountCents: Math.round(total * 100),
    customOrderNo: orderId,
    items: items
  };
  if (st.id) {
    // a draft is already in SIFT (e.g. refused for its city): send the corrected details before booking again
    var u = siftFetch_('patch', '/orders/' + encodeURIComponent(st.id), body);
    if (!u.ok && u.status !== 404) {
      st.error = u.error; st.message = u.message; st.at = stockNowSafe_();
      out.note = 'SIFT: تعذّر تحديث الطلب هناك — ' + siftErrText_(u.error, u.message);
      return out;
    }
    if (!u.ok) { delete st.id; st.retry = (st.retry || 0) + 1; }   // gone from SIFT (deleted there): create it again below
  }
  if (!st.id) {
    var c = siftFetch_('post', '/orders', body, 'prumysl-' + adminPrefix_() + '-' + orderId + (st.retry ? '-' + st.retry : ''));
    if (!c.ok) {
      st.error = c.error; st.message = c.message; st.at = stockNowSafe_();
      out.note = 'SIFT: لم يُرسل الطلب — ' + siftErrText_(c.error, c.message);
      return out;
    }
    st.id = c.data.id; st.state = c.data.state; st.tracking = c.data.trackingNumber || '';
    delete st.error; delete st.message;
  }
  if (!st.tracking) {
    var b = siftFetch_('post', '/orders/bookings', { orderIds: [st.id] });
    var res = b.ok && b.data && b.data.results ? b.data.results[0] || {} : {};
    if (b.ok && (res.status === 'booked' || res.result === 'booked' || res.trackingNumber)) {
      st.tracking = res.trackingNumber || ''; st.state = 'booked';
    } else {
      st.error = String(res.errorCode || res.code || b.error || res.status || 'NOT_BOOKED');
      st.message = String(res.message || b.message || '');
      st.state = 'draft';
    }
  }
  st.at = stockNowSafe_();
  if (st.tracking) { delete st.error; delete st.message; out.note = 'أُرسل إلى SIFT — رقم التتبع ' + st.tracking; }
  else out.note = 'SIFT: الطلب أُنشئ لكن لم يُحجز بعد — ' + siftErrText_(st.error, st.message);
  out.state = st;
  return out;
}

function siftErrText_(code, msg) {
  var map = {
    SIFT_NO_KEY: 'مفتاح SIFT غير مُعدّ', CITY_UNKNOWN: 'المدينة غير معروفة عند SIFT (صحّحها في الطلب أو في SIFT)',
    NO_ASSIGNMENT: 'لا يوجد ناقل لهذه المدينة', STOCK_SHORT: 'المخزون في SIFT غير كافٍ', ORDER_NOT_BOOKABLE: 'الطلب غير قابل للحجز',
    FORBIDDEN: 'المفتاح لا يملك الصلاحية', HTTP_401: 'مفتاح SIFT غير صحيح', HTTP_403: 'المفتاح لا يملك الصلاحية', SIFT_NETWORK: 'تعذّر الاتصال بـ SIFT',
    VALIDATION_ERROR: 'بيانات ناقصة أو غير صحيحة'
  };
  return (map[code] || code || 'خطأ') + (msg && !map[code] ? ' (' + String(msg).slice(0, 160) + ')' : '');
}
function stockNowSafe_() { return Utilities.formatDate(new Date(), ADMIN_TZ, 'dd/MM/yyyy HH:mm'); }

/**
 * Called by adminUpdate_ inside its lock when the panel changes an order's status.
 * Returns { cell, note } for column Q / the history, or null.
 */
function siftOrderHook_(r, status) {
  if (!siftKey_()) return null;
  var st = siftState_(r[SIFT_COL - 1]);
  if (status === 'مؤكد' && !st.tracking) {
    var p = siftPushRow_(r);
    return { cell: JSON.stringify(p.state), note: p.note, sift: p.state };
  }
  // cancelled in the panel before SIFT picked it up: cancel it in SIFT too
  if (status === 'ملغي' && st.id && (!st.status || SIFT_BEFORE_PICKUP.indexOf(st.status) >= 0) && st.state !== 'cancelled') {
    var c = siftFetch_('post', '/orders/' + encodeURIComponent(st.id) + '/cancellation', {});
    if (c.ok) { st.state = 'cancelled'; st.status = 'cancelled'; return { cell: JSON.stringify(st), note: 'أُلغي الطلب في SIFT أيضاً', sift: st }; }
    return { cell: JSON.stringify(st), note: 'SIFT: تعذّر إلغاء الطلب هناك — ' + siftErrText_(c.error, c.message) + ' (ألغه يدوياً في SIFT)', sift: st };
  }
  return null;
}

// ---------- status updates from SIFT ----------
/** Finds the order row for a SIFT order / shipment. */
function siftFindRow_(values, siftId, customNo) {
  for (var i = 0; i < values.length; i++) {
    if (customNo && String(values[i][ADMIN_COL.id - 1]).trim() === String(customNo)) return i;
    if (siftId && siftState_(values[i][SIFT_COL - 1]).id === siftId) return i;
  }
  return -1;
}

/** Applies a SIFT order (as returned by GET /orders or /shipments) to our sheet. Returns true when something changed. */
function siftApply_(sheet, values, o) {
  if (!o) return false;
  var ship = o.shipment || {};
  var i = siftFindRow_(values, o.id, o.customOrderNo);
  if (i < 0) return false;
  var r = values[i];
  var rowNumber = i + 2;
  var st = siftState_(r[SIFT_COL - 1]);
  var newSift = ship.status || (o.state === 'cancelled' ? 'cancelled' : st.status || '');
  var changed = false;
  if (!st.id && o.id) { st.id = o.id; changed = true; }
  if (o.trackingNumber && st.tracking !== o.trackingNumber) { st.tracking = o.trackingNumber; changed = true; }
  if (o.state && st.state !== o.state) { st.state = o.state; changed = true; }
  var hist = adminHist_(r[ADMIN_COL.hist - 1]);
  var at = stockNowSafe_();
  if (newSift && st.status !== newSift) {
    hist.push({ at: at, note: 'SIFT: ' + (SIFT_LABELS[newSift] || newSift) + (ship.rawStatusLabel ? ' — ' + ship.rawStatusLabel : '') });
    st.status = newSift; st.statusAt = ship.statusChangedAt || at; changed = true;
    delete st.error; delete st.message;
  }
  if (!changed) return false;
  // panel status follows SIFT (never back to « جديد » / « مؤكد »)
  var cur = adminStatus_(r[ADMIN_COL.status - 1]);
  var target = siftPanelStatus_(newSift);
  if (target && target !== cur && !(target === 'تم الشحن' && (cur === 'تم التسليم' || cur === 'مرتجع'))) {
    hist.push({ at: at, from: cur, to: target, by: 'sift' });
    r[ADMIN_COL.status - 1] = target;
    sheet.getRange(rowNumber, ADMIN_COL.status).setValue(target);
    if (typeof stockOrderHook_ === 'function') {
      var sk = stockOrderHook_(r, target, at);
      if (sk) {
        r[ADMIN_COL.stock - 1] = sk.cell;
        sheet.getRange(rowNumber, ADMIN_COL.stock).setValue(sk.cell);
        if (sk.note) hist.push({ at: at, note: sk.note });
      }
    }
  }
  if (hist.length > 60) hist = hist.slice(-60);
  r[SIFT_COL - 1] = JSON.stringify(st);
  r[ADMIN_COL.updated - 1] = at;
  r[ADMIN_COL.hist - 1] = JSON.stringify(hist);
  sheet.getRange(rowNumber, ADMIN_COL.updated, 1, 2).setValues([[at, r[ADMIN_COL.hist - 1]]]);
  sheet.getRange(rowNumber, SIFT_COL).setValue(r[SIFT_COL - 1]);
  return true;
}

/** Webhook from SIFT (POST …/exec?sift=<token>). The payload is only a hint: the order is re-read from SIFT's API. */
function siftWebhook_(e) {
  var token = String(PropertiesService.getScriptProperties().getProperty('SIFT_HOOK_TOKEN') || '');
  if (!token || !adminSafeEq_(String(e.parameter.sift || ''), token)) return jsonOut_({ ok: false });
  var d = {};
  try { d = JSON.parse(e.postData.contents || '{}') || {}; } catch (err) { d = {}; }
  var data = d.data || {};
  var hint = data.shipment || data.order || {};
  if (!hint.id && !hint.customOrderNo) return jsonOut_({ ok: true, ignored: true });
  var got = hint.id ? siftFetch_('get', '/orders/' + encodeURIComponent(hint.id)) : { ok: false };
  if (!got.ok) return jsonOut_({ ok: false, error: got.error });
  var sheet = adminSheet_();                      // before the lock: it may take the lock itself the first time
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return jsonOut_({ ok: false, error: 'busy' });
  try {
    var last = sheet.getLastRow();
    if (last <= 1) return jsonOut_({ ok: true });
    var values = sheet.getRange(2, 1, last - 1, ADMIN_TOTAL_COLS).getValues();
    var changed = siftApply_(sheet, values, got.data);
    return jsonOut_({ ok: true, changed: changed });
  } finally {
    lock.releaseLock();
  }
}

/** Reads every SIFT order changed since the last sync and applies it. */
function siftSync_(full) {
  var props = PropertiesService.getScriptProperties();
  var since = full ? '' : String(props.getProperty('SIFT_SYNC_FROM') || '');
  var started = new Date(Date.now() - 2 * 60000).toISOString();
  var items = [], cursor = '', pages = 0;
  do {
    var q = '?limit=100' + (since ? '&updatedFrom=' + encodeURIComponent(since) : '') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    var res = siftFetch_('get', '/orders' + q);
    if (!res.ok) return { ok: false, error: res.error, message: siftErrText_(res.error, res.message) };
    items = items.concat(res.data.items || []);
    cursor = res.data.nextCursor || '';
    pages++;
  } while (cursor && pages < 20);
  var sheet = adminSheet_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
  var changed = 0;
  try {
    var last = sheet.getLastRow();
    if (last > 1) {
      var values = sheet.getRange(2, 1, last - 1, ADMIN_TOTAL_COLS).getValues();
      items.forEach(function (o) { if (siftApply_(sheet, values, o)) changed++; });
    }
    props.setProperty('SIFT_SYNC_FROM', started);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, checked: items.length, changed: changed };
}

/** Optional: run once from the editor to also sync every 15 minutes (in case a webhook is missed). */
function installSiftTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'siftSyncTrigger') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('siftSyncTrigger').timeBased().everyMinutes(15).create();
  Logger.log('SIFT sync every 15 minutes: installed.');
}
function siftSyncTrigger() { siftSync_(false); }

// ---------- admin actions (panel › التوصيل) ----------
function siftApi_(d, auth) {
  if (SIFT_ACTIONS.indexOf(d.action) < 0) return null;
  if (auth.role !== 'admin' && !(d.action === 'sift_push' && adminCan_(auth, 'orders'))) return { ok: false, error: 'forbidden' };
  var props = PropertiesService.getScriptProperties();
  if (d.action === 'sift_status') {
    var info = { ok: true, hasKey: !!siftKey_(), webhook: !!props.getProperty('SIFT_HOOK_ID'), lastSync: props.getProperty('SIFT_SYNC_FROM') || '' };
    if (info.hasKey) {
      var t = siftFetch_('get', '/orders?limit=1');
      info.connected = t.ok;
      if (!t.ok) info.message = siftErrText_(t.error, t.message);
    }
    return info;
  }
  if (d.action === 'sift_setup') {
    if (!siftKey_()) return { ok: false, error: 'sift', message: siftErrText_('SIFT_NO_KEY') };
    var url = ScriptApp.getService().getUrl();
    if (!url) return { ok: false, error: 'sift', message: 'افتح اللوحة عبر رابط النشر (exec) ثم أعد المحاولة.' };
    var token = props.getProperty('SIFT_HOOK_TOKEN');
    if (!token) { token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props.setProperty('SIFT_HOOK_TOKEN', token); }
    // remove every webhook that already points to this script (no duplicates), then register one
    var old = props.getProperty('SIFT_HOOK_ID');
    var existing = siftFetch_('get', '/webhook-endpoints');
    var list = existing.ok ? (Object.prototype.toString.call(existing.data) === '[object Array]' ? existing.data : (existing.data && (existing.data.items || existing.data.endpoints || existing.data.data)) || []) : [];
    var removed = 0;
    list.forEach(function (w) {
      var wid = w && (w.id || (w.endpoint && w.endpoint.id));
      var wurl = String(w && (w.url || (w.endpoint && w.endpoint.url)) || '');
      if (wid && (wurl.indexOf(url) === 0 || wid === old)) { if (siftFetch_('delete', '/webhook-endpoints/' + encodeURIComponent(wid)).ok) removed++; }
    });
    if (old && !list.length) siftFetch_('delete', '/webhook-endpoints/' + encodeURIComponent(old));
    var reg = siftFetch_('post', '/webhook-endpoints', { url: url + '?sift=' + token, eventTypes: ['shipment.created', 'shipment.status_changed', 'order.cancelled'], description: 'Prumysl admin panel (' + adminPrefix_() + ')' });
    if (!reg.ok) return { ok: false, error: 'sift', message: siftErrText_(reg.error, reg.message) };
    var newId = reg.data && ((reg.data.endpoint && reg.data.endpoint.id) || reg.data.id) || '';
    props.setProperty('SIFT_HOOK_ID', String(newId || 'registered'));
    return { ok: true, webhook: true, removed: removed };
  }
  if (d.action === 'sift_sync') {
    var s = siftSync_(!!d.full);
    return s.ok ? s : { ok: false, error: 'sift', message: s.message || s.error };
  }
  if (d.action === 'sift_push') {
    // retry sending one confirmed order (after fixing its city, phone…)
    var sheet = adminSheet_();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
    try {
      var last = sheet.getLastRow();
      var values = last > 1 ? sheet.getRange(2, 1, last - 1, ADMIN_TOTAL_COLS).getValues() : [];
      var i = siftFindRow_(values, '', String(d.id || ''));
      if (i < 0) return { ok: false, error: 'not_found' };
      var r = values[i];
      var p = siftPushRow_(r);
      var hist = adminHist_(r[ADMIN_COL.hist - 1]);
      var at = stockNowSafe_();
      if (p.note) hist.push({ at: at, note: p.note });
      r[SIFT_COL - 1] = JSON.stringify(p.state);
      r[ADMIN_COL.updated - 1] = at;
      r[ADMIN_COL.hist - 1] = JSON.stringify(hist.slice(-60));
      sheet.getRange(i + 2, ADMIN_COL.updated, 1, 2).setValues([[at, r[ADMIN_COL.hist - 1]]]);
      sheet.getRange(i + 2, SIFT_COL).setValue(r[SIFT_COL - 1]);
      return { ok: true, order: adminRowToOrder_(r, i + 2) };
    } finally {
      lock.releaseLock();
    }
  }
  return null;
}
