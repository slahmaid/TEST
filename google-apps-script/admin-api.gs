/**
 * Prumysl — Admin API for the admin panel (prumyslmarocadmin2026/).
 *
 * Add this file NEXT TO all-orders.gs (main store) — and next to crimping-pliers-orders.gs (PE store) —
 * in the same Apps Script project (Apps Script editor › + › Script › name it "admin-api").
 * It shares SHEET_NAME / setupSheet() / getOrdersSheet_() with the file beside it.
 *
 * Layout of the « Orders » sheet (columns A–G are NOT changed, the old admin keeps working):
 *   A–G  Date · Name · City · Phone Number · Product · Quantity · Price   (written by the site)
 *   H    Order Statut   ← status, updated by the admin panel and coloured like the panel
 *   I    (your own column — never read or written by this script)
 *   J Order ID · K Note · L Updated · M History · N Source · O SD Card (نعم / لا)
 *   P Stock (what was taken from the depot when the order was shipped — managed by stock-api.gs)
 *   Q SIFT (SIFT.ma parcel id, tracking number, delivery status — managed by sift-api.gs)
 *
 * Setup (once per Apps Script project) — see ADMIN-SETUP.md:
 *   1. Project Settings › Script properties › add  ADMIN_KEY = <your secret, 8+ characters>
 *      (use the SAME key in both projects so one login opens both stores).
 *   2. Deploy › Manage deployments › ✏️ › Version: New version › Deploy (the /exec URL stays the same).
 *
 * Protocol (POST, body = JSON as text/plain):  { action: 'auth' | 'list' | 'update', key: <ADMIN_KEY or session token>, ... }
 * The admin key never leaves Google: the panel stores only a signed, expiring session token.
 */

var ADMIN_API_VERSION = 7; // 4 = order editing · 5 = seller logins + stock · 6 = SIFT delivery · 7 = order-confirmer accounts
// what a seller account (e.g. Ali) may do: his own van sales and the van stock — nothing else
var ADMIN_SELLER_ACTIONS = ['auth', 'stock_view', 'sale_add', 'sales_list', 'sale_cancel'];
// what an order-confirmer account (e.g. Reda, confirming by phone) may do: the orders and sending them to SIFT — no totals, stock or settings
var ADMIN_CONFIRMER_ACTIONS = ['auth', 'list', 'update', 'sift_push'];
var ADMIN_ROLES = ['seller', 'confirmer'];
var ADMIN_COL = { status: 8, id: 10, note: 11, updated: 12, hist: 13, source: 14, sd: 15, stock: 16, sift: 17 }; // H, J…P, Q
var ADMIN_TOTAL_COLS = 17; // A..Q
var ADMIN_STATUS_HEADER = 'Order Statut';
var ADMIN_EXTRA_FIRST = 10; // J
var ADMIN_EXTRA_HEADERS = ['Order ID', 'Note', 'Updated', 'History', 'Source', 'SD Card', 'Stock', 'SIFT']; // J..Q
// products whose name already says it includes a memory card (when column O is still empty)
var ADMIN_SD_RE = /carte\s*m[ée]moire|memory\s*card|micro\s*sd|\bsd\b|بطاقة\s*(ال)?ذاكرة|ذاكرة\s*sd/i;
var ADMIN_STATUSES = ['جديد', 'مؤكد', 'تم الشحن', 'تم التسليم', 'ملغي', 'مرتجع'];
// same colours as the admin panel's status pills: [text, background]
var ADMIN_STATUS_COLORS = {
  'جديد': ['#e0402a', '#fbe8e5'],
  'مؤكد': ['#202895', '#e4e5f2'],
  'تم الشحن': ['#b07000', '#f6eee0'],
  'تم التسليم': ['#17803f', '#e3f0e8'],
  'ملغي': ['#6b6b78', '#ededef'],
  'مرتجع': ['#7b3fb2', '#efe8f6']
};
// statuses typed by hand in the sheet (French / English / other spellings) → panel status
var ADMIN_STATUS_ALIASES = {
  'new': 'جديد', 'nouvelle': 'جديد', 'nouveau': 'جديد', 'pending': 'جديد', 'en attente': 'جديد', 'جديدة': 'جديد',
  'confirmed': 'مؤكد', 'confirmée': 'مؤكد', 'confirmee': 'مؤكد', 'confirmé': 'مؤكد', 'confirme': 'مؤكد', 'تم التأكيد': 'مؤكد', 'مؤكدة': 'مؤكد',
  'shipped': 'تم الشحن', 'expédiée': 'تم الشحن', 'expediee': 'تم الشحن', 'expédié': 'تم الشحن', 'en cours': 'تم الشحن', 'قيد الشحن': 'تم الشحن', 'في الطريق': 'تم الشحن',
  'delivered': 'تم التسليم', 'livrée': 'تم التسليم', 'livree': 'تم التسليم', 'livré': 'تم التسليم', 'livre': 'تم التسليم', 'مسلم': 'تم التسليم', 'تم التوصيل': 'تم التسليم',
  'cancelled': 'ملغي', 'canceled': 'ملغي', 'annulée': 'ملغي', 'annulee': 'ملغي', 'annulé': 'ملغي', 'ملغى': 'ملغي', 'ملغية': 'ملغي',
  'returned': 'مرتجع', 'retournée': 'مرتجع', 'retournee': 'مرتجع', 'retour': 'مرتجع', 'مرجع': 'مرتجع'
};
var ADMIN_TZ = 'Africa/Casablanca';
var ADMIN_MIN_KEY = 8;
var ADMIN_MAX_TRIES = 5;
var ADMIN_LOCK_SECONDS = 900;
var ADMIN_SESSION_HOURS = 12;
var ADMIN_REMEMBER_DAYS = 30;
var ADMIN_LAYOUT_VERSION = '3';

function adminPrefix_() {
  return (typeof ADMIN_ORDER_PREFIX === 'string' && ADMIN_ORDER_PREFIX) ? ADMIN_ORDER_PREFIX : 'PR';
}

function adminOut_(obj) {
  obj.version = ADMIN_API_VERSION;
  obj.service = 'prumysl-admin';
  obj.store = adminPrefix_();
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** GET ?action=admin_ping — lets the panel check the script is up to date before sending anything. */
function adminPingResponse_() {
  return adminOut_({ ok: true, ping: true });
}

/** True when doPost received a JSON admin call (the shop's order forms send form-encoded data, never JSON). */
function isAdminRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) return false;
  var c = String(e.postData.contents).replace(/^\s+/, '');
  if (c.charAt(0) !== '{') return false;
  try {
    var d = JSON.parse(c);
    return !!d && typeof d.action === 'string' && /^[a-z_]{2,30}$/.test(d.action) && 'key' in d;
  } catch (err) {
    return false;
  }
}

/** The row the site's order forms append (A..N). Used by doPost in all-orders.gs / crimping-pliers-orders.gs. */
function adminNewOrderRow_(base, source) {
  var row = base.slice(0, 7);
  while (row.length < 7) row.push('');
  row.push('جديد');                       // H Order Statut
  row.push('');                           // I (your column — left empty)
  row.push('', '', '', '');               // J Order ID (given by the admin API) · K Note · L Updated · M History
  row.push(String(source || '').trim());  // N Source
  row.push('');                           // O SD Card (empty = read from the product name)
  row.push('');                           // P Stock
  row.push('');                           // Q SIFT
  return row;
}

function adminApi_(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return adminOut_({ ok: false, error: 'bad_action' }); }
  try {
    var auth = adminCheck_(d.key, d.user);
    if (!auth.ok) return adminOut_(auth);
    // sellers (e.g. Ali on the road trip) only reach the van-sales actions, never the orders or the totals
    if (auth.role === 'seller' && ADMIN_SELLER_ACTIONS.indexOf(d.action) < 0) return adminOut_({ ok: false, error: 'forbidden' });
    if (auth.role === 'confirmer' && ADMIN_CONFIRMER_ACTIONS.indexOf(d.action) < 0) return adminOut_({ ok: false, error: 'forbidden' });
    if (d.action === 'auth') return adminOut_({ ok: true, token: adminMakeToken_(!!d.remember, auth), role: auth.role, user: auth.user, name: auth.name });
    if (d.action === 'list') return adminList_();
    if (d.action === 'update') return adminUpdate_(d, auth);
    if (d.action === 'sellers_list') return adminOut_({ ok: true, sellers: adminSellersPublic_() });
    if (d.action === 'sellers_save') return adminOut_(adminSellerSave_(d));
    if (d.action === 'sellers_delete') return adminOut_(adminSellerDelete_(d));
    if (typeof siftApi_ === 'function') {
      var sr = siftApi_(d, auth);
      if (sr) return adminOut_(sr);
    }
    if (typeof stockApi_ === 'function') {
      var res = stockApi_(d, auth);
      if (res) return adminOut_(res);
    }
    return adminOut_({ ok: false, error: 'bad_action' });
  } catch (err) {
    return adminOut_({ ok: false, error: 'server', detail: String(err && err.message || err) });
  }
}

// ---------- auth ----------
function adminSecret_() {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_KEY') || '').trim();
}

function adminSign_(msg, secret) {
  var raw = Utilities.computeHmacSha256Signature(msg, secret);
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

function adminSafeEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Session tokens.  v2.<exp>.<role>.<user>.<ver>.<signature>
 *   role = admin | seller ; user = seller id (latin letters/digits) ; ver changes when the seller's password
 *   is changed or the account is switched off, which signs that seller out everywhere.
 * v1.<exp>.<signature> tokens from earlier versions stay valid for the admin.
 */
function adminMakeToken_(remember, auth) {
  var exp = Math.floor(Date.now() / 1000) + (remember ? ADMIN_REMEMBER_DAYS * 86400 : ADMIN_SESSION_HOURS * 3600);
  var member = auth && ADMIN_ROLES.indexOf(auth.role) >= 0;
  var head = 'v2.' + exp + '.' + (member ? auth.role + '.' + auth.user + '.' + auth.ver : 'admin.admin.0');
  return head + '.' + adminSign_(head, adminSecret_());
}

function adminFail_(cache, bucket, nowS) {
  var fk = 'adm_fails' + bucket, lk = 'adm_locked' + bucket;
  var fails = Number(cache.get(fk) || 0) + 1;
  if (fails >= ADMIN_MAX_TRIES) {
    cache.put(lk, String(nowS + ADMIN_LOCK_SECONDS), ADMIN_LOCK_SECONDS);
    cache.remove(fk);
    return { ok: false, error: 'locked', retryIn: ADMIN_LOCK_SECONDS };
  }
  cache.put(fk, String(fails), ADMIN_LOCK_SECONDS);
  return { ok: false, error: 'bad_key', left: ADMIN_MAX_TRIES - fails };
}

function adminCheck_(key, user) {
  var secret = adminSecret_();
  if (!secret) return { ok: false, error: 'no_admin_key', reason: 'missing', min: ADMIN_MIN_KEY };
  if (secret.length < ADMIN_MIN_KEY) return { ok: false, error: 'no_admin_key', reason: 'short', min: ADMIN_MIN_KEY };

  var cache = CacheService.getScriptCache();
  var nowS = Math.floor(Date.now() / 1000);
  key = String(key || '');

  // --- session tokens ---
  var m2 = key.match(/^v2\.(\d{10})\.(admin|seller|confirmer)\.([a-z0-9_-]{1,30})\.(\d{1,10})\.([A-Za-z0-9_-]+)$/);
  if (m2) {
    var head = key.slice(0, key.lastIndexOf('.'));
    if (!adminSafeEq_(m2[5], adminSign_(head, secret)) || Number(m2[1]) <= nowS) return { ok: false, error: 'expired' };
    if (m2[2] === 'admin') return { ok: true, role: 'admin', user: 'admin', name: 'المدير' };
    var s = adminSellers_()[m2[3]];
    if (!s || !s.active || String(s.ver) !== m2[4] || (s.role || 'seller') !== m2[2]) return { ok: false, error: 'expired' };
    return { ok: true, role: s.role || 'seller', user: m2[3], name: s.name, ver: s.ver };
  }
  if (/^v1\.\d{10}\.[A-Za-z0-9_-]+$/.test(key)) {
    var parts = key.split('.');
    if (adminSafeEq_(parts[2], adminSign_('v1.' + parts[1], secret)) && Number(parts[1]) > nowS) return { ok: true, role: 'admin', user: 'admin', name: 'المدير' };
    return { ok: false, error: 'expired' }; // expired, or ADMIN_KEY was changed (signs every device out)
  }

  // --- login with user name + password ---
  var uid = String(user || '').trim().toLowerCase();
  if (!uid || uid === 'admin') {
    var lockedUntil = Number(cache.get('adm_locked') || 0);
    if (lockedUntil > nowS) return { ok: false, error: 'locked', retryIn: lockedUntil - nowS };
    if (key && adminSafeEq_(key, secret)) { cache.remove('adm_fails'); return { ok: true, role: 'admin', user: 'admin', name: 'المدير' }; }
    return adminFail_(cache, '', nowS);
  }
  if (!/^[a-z0-9_-]{2,30}$/.test(uid)) return { ok: false, error: 'bad_key' };
  var bucket = '_' + uid;
  var sl = Number(cache.get('adm_locked' + bucket) || 0);
  if (sl > nowS) return { ok: false, error: 'locked', retryIn: sl - nowS };
  var seller = adminSellers_()[uid];
  if (seller && seller.active && key && adminSafeEq_(adminHash_(seller.salt, key), seller.hash)) {
    cache.remove('adm_fails' + bucket);
    return { ok: true, role: seller.role || 'seller', user: uid, name: seller.name, ver: seller.ver };
  }
  return adminFail_(cache, bucket, nowS);
}

// ---------- seller accounts (managed by the admin from the panel › البائعون) ----------
// Stored in the script property SELLERS as JSON { id: { name, role, salt, hash, ver, active } } — passwords are only kept hashed.
// role: 'seller' (road-trip sales, van stock) or 'confirmer' (orders by phone, no totals).
function adminSellers_() {
  try { var v = JSON.parse(PropertiesService.getScriptProperties().getProperty('SELLERS') || '{}'); return v && typeof v === 'object' ? v : {}; } catch (err) { return {}; }
}
function adminSaveSellers_(all) {
  PropertiesService.getScriptProperties().setProperty('SELLERS', JSON.stringify(all));
}
function adminHash_(salt, pw) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(pw), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}
function adminSellersPublic_() {
  var all = adminSellers_();
  return Object.keys(all).sort().map(function (id) { return { id: id, name: all[id].name, role: all[id].role || 'seller', active: !!all[id].active }; });
}
function adminSellerSave_(d) {
  var id = String(d.id || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,30}$/.test(id) || id === 'admin') return { ok: false, error: 'bad_field', field: 'seller_id' };
  var name = String(d.name == null ? '' : d.name).replace(/\s+/g, ' ').trim().slice(0, 40);
  var all = adminSellers_();
  var s = all[id];
  var pw = d.password == null ? '' : String(d.password);
  if (!s && pw.length < 6) return { ok: false, error: 'bad_field', field: 'password' };
  if (pw && pw.length < 6) return { ok: false, error: 'bad_field', field: 'password' };
  if (!s) s = { name: name || id, role: 'seller', salt: '', hash: '', ver: 1, active: true };
  if (name) s.name = name;
  if (d.role != null) {
    if (ADMIN_ROLES.indexOf(String(d.role)) < 0) return { ok: false, error: 'bad_field', field: 'role' };
    if ((s.role || 'seller') !== String(d.role)) { s.role = String(d.role); s.ver = Number(s.ver || 0) + 1; }
  }
  if (pw) { s.salt = Utilities.getUuid(); s.hash = adminHash_(s.salt, pw); s.ver = Number(s.ver || 0) + 1; }
  if (d.active != null) {
    var act = d.active === true || d.active === 'true';
    if (act !== !!s.active) { s.active = act; s.ver = Number(s.ver || 0) + 1; }
  }
  all[id] = s;
  adminSaveSellers_(all);
  return { ok: true, sellers: adminSellersPublic_() };
}
function adminSellerDelete_(d) {
  var id = String(d.id || '').trim().toLowerCase();
  var all = adminSellers_();
  if (!all[id]) return { ok: false, error: 'not_found' };
  delete all[id];
  adminSaveSellers_(all);
  return { ok: true, sellers: adminSellersPublic_() };
}

// ---------- sheet ----------
function adminSheet_() {
  setupSheet();
  var sheet = getOrdersSheet_();

  // H: your status column — keep its title, only name it when empty
  var hHead = sheet.getRange(1, ADMIN_COL.status);
  if (!String(hHead.getValue() || '').trim()) hHead.setValue(ADMIN_STATUS_HEADER).setFontWeight('bold');

  // J..N: admin columns
  var head = sheet.getRange(1, ADMIN_EXTRA_FIRST, 1, ADMIN_EXTRA_HEADERS.length).getValues()[0];
  var fix = false;
  for (var i = 0; i < ADMIN_EXTRA_HEADERS.length; i++) {
    var cur = String(head[i] || '').trim();
    if (!cur) { fix = true; continue; }
    if (cur !== ADMIN_EXTRA_HEADERS[i]) {
      throw new Error('Column ' + String.fromCharCode(64 + ADMIN_EXTRA_FIRST + i) + '1 of sheet "' + SHEET_NAME +
        '" already holds "' + cur + '" — expected "' + ADMIN_EXTRA_HEADERS[i] + '". Move that data, then retry.');
    }
  }
  if (fix) {
    sheet.getRange(1, ADMIN_EXTRA_FIRST, 1, ADMIN_EXTRA_HEADERS.length).setValues([ADMIN_EXTRA_HEADERS]).setFontWeight('bold');
  }

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ADMIN_LAYOUT') !== ADMIN_LAYOUT_VERSION) {
    var lock = adminLock_();
    if (lock) {
      try {
        // re-check under the lock: a parallel call may have done it meanwhile
        if (props.getProperty('ADMIN_LAYOUT') !== ADMIN_LAYOUT_VERSION) {
          adminRepairOldRows_(sheet);
          adminStatusColors_(sheet);
          props.setProperty('ADMIN_LAYOUT', ADMIN_LAYOUT_VERSION);
        }
      } finally {
        lock.releaseLock();
      }
    }
  }
  return sheet;
}

/**
 * Colours column H like the admin panel (conditional formatting, so it also works for new rows
 * and for statuses typed by hand). Our previous rules are replaced; your other rules are kept.
 */
function adminStatusColors_(sheet) {
  var maxRows = Math.max(sheet.getMaxRows(), 2);
  var range = sheet.getRange(2, ADMIN_COL.status, maxRows - 1, 1);
  var kept = sheet.getConditionalFormatRules().filter(function (rule) {
    var cond = rule.getBooleanCondition && rule.getBooleanCondition();
    if (!cond || cond.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO) return true;
    var v = String((cond.getCriteriaValues() || [])[0] || '');
    if (ADMIN_STATUSES.indexOf(v) < 0) return true;
    return !rule.getRanges().some(function (r) { return r.getColumn() === ADMIN_COL.status; });
  });
  var ours = ADMIN_STATUSES.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s)
      .setFontColor(ADMIN_STATUS_COLORS[s][0])
      .setBackground(ADMIN_STATUS_COLORS[s][1])
      .setBold(true)
      .setRanges([range])
      .build();
  });
  sheet.setConditionalFormatRules(ours.concat(kept));
}

/**
 * One-time repair of orders saved by the first version of this script, which wrote the status in I
 * and the source in M. Only rows that look exactly like that are touched: H empty, I = "جديد",
 * J–L empty and M empty or a page name (moka, saqr…).
 */
function adminRepairOldRows_(sheet) {
  var last = sheet.getLastRow();
  if (last <= 1) return;
  var values = sheet.getRange(2, 1, last - 1, ADMIN_TOTAL_COLS).getValues();
  var cells = [];          // A1 refs of the rows to fix (H, I, M)
  var sources = [];        // new content of column N (ours), written in one call
  var touched = false;
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var src = String(r[12] || '').trim();
    var curN = r[13] == null ? '' : r[13];
    if (!String(r[7] || '').trim() && String(r[8] || '').trim() === 'جديد' &&
        !String(r[9] || '').trim() && !String(r[10] || '').trim() && !String(r[11] || '').trim() &&
        (!src || /^[A-Za-z][A-Za-z0-9.-]{0,40}$/.test(src))) {
      cells.push(i + 2);
      if (src && !String(curN).trim()) { curN = src; touched = true; }
    }
    sources.push([curN]);
  }
  if (!cells.length) return;
  // batched writes (one call per column), only on the matching cells — formulas elsewhere in I are left as they are
  sheet.getRangeList(cells.map(function (n) { return 'H' + n; })).setValue('جديد');
  sheet.getRangeList(cells.map(function (n) { return 'I' + n; })).clearContent();
  sheet.getRangeList(cells.map(function (n) { return 'M' + n; })).clearContent();
  if (touched) sheet.getRange(2, ADMIN_COL.source, sources.length, 1).setValues(sources);
}

function adminLock_() {
  var lock = LockService.getScriptLock();
  return lock.tryLock(15000) ? lock : null;
}

function adminNextId_(props) {
  var seq = Number(props.getProperty('ADMIN_SEQ') || 1000) + 1;
  props.setProperty('ADMIN_SEQ', String(seq));
  return adminPrefix_() + '-' + seq;
}

/**
 * Reads the order date of column A. Dates typed or pasted as text are read day-first (12/06/2026 = 12 June),
 * as in Morocco — JavaScript would read them month-first (6 December) and put old orders on top as "future" ones.
 * A date in the future that makes sense with day and month swapped (a cell typed day-first in a sheet set to a
 * US locale) is swapped back.
 */
function adminDate_(v) {
  var d = null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    d = v;
  } else if (v !== '' && v != null) {
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T,]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?/);
    if (m) {
      var y = Number(m[3]); if (y < 100) y += 2000;
      d = new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
      if (d.getMonth() !== Number(m[2]) - 1) d = null; // e.g. 31/02 or month > 12
    } else {
      d = new Date(s);
    }
    if (d && isNaN(d.getTime())) d = null;
  }
  if (d && d.getTime() > Date.now() + 36 * 3600e3 && d.getDate() <= 12) {
    var sw = new Date(d.getFullYear(), d.getDate() - 1, d.getMonth() + 1, d.getHours(), d.getMinutes(), d.getSeconds());
    if (sw.getTime() <= Date.now() + 36 * 3600e3 && sw.getDate() === d.getMonth() + 1) d = sw;
  }
  return d;
}

function adminStatus_(v) {
  var s = String(v || '').trim();
  if (ADMIN_STATUSES.indexOf(s) >= 0) return s;
  var alias = ADMIN_STATUS_ALIASES[s.toLowerCase()];
  return alias || 'جديد';
}

function adminHist_(v) {
  if (!v) return [];
  try { var h = JSON.parse(v); return Object.prototype.toString.call(h) === '[object Array]' ? h : []; } catch (err) { return []; }
}

function adminFmt_(v) {
  return v instanceof Date ? Utilities.formatDate(v, ADMIN_TZ, 'dd/MM/yyyy HH:mm') : String(v || '');
}

function adminSd_(v, product) {
  var s = String(v || '').trim().toLowerCase();
  if (s === 'نعم' || s === 'yes' || s === 'oui' || s === 'true' || s === '1') return true;
  if (s === 'لا' || s === 'no' || s === 'non' || s === 'false' || s === '0') return false;
  return ADMIN_SD_RE.test(String(product || ''));
}

function adminRowToOrder_(r, rowNumber) {
  var d = adminDate_(r[0]);
  var qty = parseInt(r[5], 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  var total = parseFloat(String(r[6] == null ? '' : r[6]).replace(',', '.'));
  if (isNaN(total)) total = 0;
  return {
    id: String(r[ADMIN_COL.id - 1] || ''),
    row: rowNumber,
    ts: d ? d.getTime() : 0,
    day: d ? Utilities.formatDate(d, ADMIN_TZ, 'yyyy-MM-dd') : '',
    recu: d ? Utilities.formatDate(d, ADMIN_TZ, 'dd/MM/yyyy HH:mm') : String(r[0] || ''),
    name: String(r[1] || '').trim(),
    city: String(r[2] || '').trim(),
    phone: String(r[3] || '').replace(/\D/g, '').replace(/^([67]\d{8})$/, '0$1'),
    product: String(r[4] || '').trim(),
    qty: qty,
    total: total,
    status: adminStatus_(r[ADMIN_COL.status - 1]),
    note: String(r[ADMIN_COL.note - 1] || ''),
    updated: adminFmt_(r[ADMIN_COL.updated - 1]),
    hist: adminHist_(r[ADMIN_COL.hist - 1]),
    source: String(r[ADMIN_COL.source - 1] || ''),
    sd: adminSd_(r[ADMIN_COL.sd - 1], r[4]),
    stock: (function () { try { return (JSON.parse(r[ADMIN_COL.stock - 1] || '{}') || {}).state || ''; } catch (err) { return ''; } })(),
    sift: (function () {
      try {
        var s = JSON.parse(r[ADMIN_COL.sift - 1] || 'null');
        if (!s || typeof s !== 'object') return null;
        return { tracking: s.tracking || '', status: s.status || '', label: (typeof SIFT_LABELS !== 'undefined' && SIFT_LABELS[s.status]) || s.status || '',
          state: s.state || '', error: s.error || '', message: s.error && typeof siftErrText_ === 'function' ? siftErrText_(s.error, s.message) : '' };
      } catch (err) { return null; }
    })()
  };
}

function adminIsEmptyRow_(r) {
  for (var i = 0; i < 7; i++) if (String(r[i] == null ? '' : r[i]).trim() !== '') return false;
  return true;
}

function adminList_() {
  var sheet = adminSheet_();
  var last = sheet.getLastRow();
  var today = Utilities.formatDate(new Date(), ADMIN_TZ, 'yyyy-MM-dd');
  if (last <= 1) return adminOut_({ ok: true, now: Date.now(), today: today, orders: [] });

  var values = sheet.getRange(2, 1, last - 1, ADMIN_TOTAL_COLS).getValues();
  var idIdx = ADMIN_COL.id - 1;

  // give an Order ID (column J) to rows that don't have one yet
  var missing = values.some(function (r) { return !adminIsEmptyRow_(r) && !String(r[idIdx] || '').trim(); });
  if (missing) {
    var lock = adminLock_();
    if (!lock) return adminOut_({ ok: false, error: 'busy' });
    try {
      // re-read under the lock: another call may have stamped them meanwhile
      last = sheet.getLastRow();
      values = sheet.getRange(2, 1, last - 1, ADMIN_TOTAL_COLS).getValues();
      var props = PropertiesService.getScriptProperties();
      var ids = [];
      var changed = false;
      for (var j = 0; j < values.length; j++) {
        var id = String(values[j][idIdx] || '').trim();
        if (!id && !adminIsEmptyRow_(values[j])) { id = adminNextId_(props); values[j][idIdx] = id; changed = true; }
        ids.push([id]);
      }
      if (changed) sheet.getRange(2, ADMIN_COL.id, ids.length, 1).setValues(ids);
    } finally {
      lock.releaseLock();
    }
  }

  var orders = [];
  for (var k = 0; k < values.length; k++) {
    if (adminIsEmptyRow_(values[k])) continue;
    orders.push(adminRowToOrder_(values[k], k + 2));
  }
  return adminOut_({ ok: true, now: Date.now(), today: today, orders: orders });
}

function adminUpdate_(d, auth) {
  var who = auth && auth.role !== 'admin' ? auth.name : '';
  var id = String(d.id || '').trim();
  if (!id) return adminOut_({ ok: false, error: 'not_found' });
  var hasStatus = d.status != null;
  var hasNote = d.note != null;
  if (hasStatus && ADMIN_STATUSES.indexOf(String(d.status)) < 0) return adminOut_({ ok: false, error: 'bad_status' });
  var edit = adminCleanEdit_(d.edit);
  if (edit.error) return adminOut_({ ok: false, error: 'bad_field', field: edit.error });

  var sheet = adminSheet_();
  var lock = adminLock_();
  if (!lock) return adminOut_({ ok: false, error: 'busy' });
  try {
    var last = sheet.getLastRow();
    if (last <= 1) return adminOut_({ ok: false, error: 'not_found' });
    var col = sheet.getRange(2, ADMIN_COL.id, last - 1, 1).getValues();
    var rowNumber = 0;
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]).trim() === id) { rowNumber = i + 2; break; }
    }
    if (!rowNumber) return adminOut_({ ok: false, error: 'not_found' });

    var r = sheet.getRange(rowNumber, 1, 1, ADMIN_TOTAL_COLS).getValues()[0];
    var S = ADMIN_COL.status - 1, N = ADMIN_COL.note - 1, U = ADMIN_COL.updated - 1, Hh = ADMIN_COL.hist - 1;
    var cur = adminStatus_(r[S]);
    var hist = adminHist_(r[Hh]);
    var at = Utilities.formatDate(new Date(), ADMIN_TZ, 'dd/MM/yyyy HH:mm');
    var changed = false;
    var writeStatus = false;

    if (hasStatus && String(d.status) !== cur) {
      hist.push(who ? { at: at, from: cur, to: String(d.status), who: who } : { at: at, from: cur, to: String(d.status) });
      r[S] = String(d.status);
      writeStatus = changed = true;
    } else if (String(r[S] || '').trim() !== cur) {
      // empty or hand-typed (e.g. "Livrée") → write the panel's Arabic status so H stays coloured
      r[S] = cur;
      writeStatus = true;
    }
    if (hasNote) {
      var note = String(d.note).slice(0, 1000).trim();
      if (note !== String(r[N] || '')) {
        hist.push({ at: at, note: (note ? 'تعديل الملاحظة الداخلية' : 'حذف الملاحظة الداخلية') + (who ? ' — ' + who : '') });
        r[N] = note;
        changed = true;
      }
    }
    // order data (B name · C city/address · D phone · E product · F quantity · G amount · O SD card)
    var EDIT_COLS = { name: 1, city: 2, phone: 3, product: 4, qty: 5, total: 6 };
    var LABELS = { name: 'الاسم', city: 'المدينة / العنوان', phone: 'الهاتف', product: 'المنتج', qty: 'الكمية', total: 'المبلغ', sd: 'بطاقة SD' };
    var diffs = [];
    var writeData = false, writeSd = false;
    Object.keys(EDIT_COLS).forEach(function (k) {
      if (!(k in edit.v)) return;
      var idx = EDIT_COLS[k];
      var before = k === 'qty' ? (parseInt(r[idx], 10) || 1) : k === 'total' ? (parseFloat(String(r[idx]).replace(',', '.')) || 0) : String(r[idx] == null ? '' : r[idx]).trim();
      if (String(before) === String(edit.v[k])) return;
      diffs.push(LABELS[k] + ': ' + (before === '' ? '—' : before) + ' ← ' + edit.v[k]);
      r[idx] = edit.v[k];
      writeData = true;
    });
    if ('sd' in edit.v) {
      var sdBefore = adminSd_(r[ADMIN_COL.sd - 1], r[4]);
      var sdCell = String(r[ADMIN_COL.sd - 1] || '').trim();
      var sdNew = edit.v.sd ? 'نعم' : 'لا';
      if (sdBefore !== edit.v.sd) diffs.push(LABELS.sd + ': ' + (sdBefore ? 'نعم' : 'لا') + ' ← ' + sdNew);
      if (sdCell !== sdNew) { r[ADMIN_COL.sd - 1] = sdNew; writeSd = true; }
    }
    if (diffs.length) {
      hist.push({ at: at, note: 'تعديل الطلب' + (who ? ' (' + who + ')' : '') + ' — ' + diffs.join(' · ') });
      changed = true;
    }
    if (writeData) sheet.getRange(rowNumber, 2, 1, 6).setValues([[r[1], r[2], r[3], r[4], r[5], r[6]]]);
    if (writeSd) sheet.getRange(rowNumber, ADMIN_COL.sd).setValue(r[ADMIN_COL.sd - 1]);
    if (writeStatus) sheet.getRange(rowNumber, ADMIN_COL.status).setValue(r[S]);
    // stock: shipped / delivered online orders leave the depot, cancelled / returned ones come back (stock-api.gs)
    if (hasStatus && typeof stockOrderHook_ === 'function') {
      var sk = stockOrderHook_(r, String(r[S]), at);
      if (sk) {
        r[ADMIN_COL.stock - 1] = sk.cell;
        sheet.getRange(rowNumber, ADMIN_COL.stock).setValue(sk.cell);
        if (sk.note) { hist.push({ at: at, note: sk.note }); changed = true; }
      }
    }
    // SIFT.ma: « مؤكد » creates and books the parcel, « ملغي » before pickup cancels it there (sift-api.gs)
    var siftResult = null;
    if (hasStatus && writeStatus && typeof siftOrderHook_ === 'function') {
      var sf = siftOrderHook_(r, String(r[S]));
      if (sf) {
        r[ADMIN_COL.sift - 1] = sf.cell;
        sheet.getRange(rowNumber, ADMIN_COL.sift).setValue(sf.cell);
        if (sf.note) { hist.push({ at: at, note: sf.note }); changed = true; }
        siftResult = sf.sift;
      }
    }
    if (changed) {
      if (hist.length > 60) hist = hist.slice(-60);
      r[U] = at;
      r[Hh] = JSON.stringify(hist);
      sheet.getRange(rowNumber, ADMIN_COL.note, 1, 3).setValues([[r[N], r[U], r[Hh]]]);
    }
    return adminOut_({ ok: true, order: adminRowToOrder_(r, rowNumber), sift: siftResult ? { tracking: siftResult.tracking || '', error: siftResult.error ? siftErrText_(siftResult.error, siftResult.message) : '' } : null });
  } finally {
    lock.releaseLock();
  }
}

/** Checks the fields sent by the panel's "تعديل الطلب" form. Returns { v: {...} } or { error: fieldName }. */
function adminCleanEdit_(e) {
  var v = {};
  if (!e || typeof e !== 'object') return { v: v };
  var text = function (x, max) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, max); };
  if (e.name != null) v.name = text(e.name, 120);
  if (e.city != null) v.city = text(e.city, 300);
  if (e.product != null) {
    v.product = text(e.product, 200);
    if (!v.product) return { error: 'product' };
  }
  if (e.phone != null) {
    var p = String(e.phone).replace(/\D/g, '');
    if (p.indexOf('212') === 0 && p.length === 12) p = '0' + p.slice(3);
    if (p.length === 9 && /^[5-7]/.test(p)) p = '0' + p;
    if (!/^0[5-7]\d{8}$/.test(p)) return { error: 'phone' };
    v.phone = p;
  }
  if (e.qty != null) {
    var q = parseInt(e.qty, 10);
    if (isNaN(q) || q < 1 || q > 999) return { error: 'qty' };
    v.qty = q;
  }
  if (e.total != null) {
    var ts = String(e.total).replace(/[\s\u00a0]/g, '');
    if (ts.indexOf('.') >= 0 || /^\d{1,3}(,\d{3})+$/.test(ts)) ts = ts.replace(/,/g, ''); // 1,299 or 1,299.50
    else ts = ts.replace(',', '.');                                                        // 12,5
    var t = parseFloat(ts);
    if (isNaN(t) || t < 0 || t > 1000000) return { error: 'total' };
    v.total = Math.round(t * 100) / 100;
  }
  if (e.sd != null) v.sd = e.sd === true || e.sd === 'true' || e.sd === 'نعم' || e.sd === 1;
  return { v: v };
}

// ---------- one-time cleanup (run by hand from the Apps Script editor) ----------
/**
 * Empty rows = no Name (B), City (C), Phone (D), Product (E), Price (G) and no Note (K).
 * They were created on 26/11/2026 when the new admin panel sent stock requests to the previous script version.
 *   1. Run previewEmptyOrderRows  → View › Logs shows the rows it would delete (nothing is changed).
 *   2. Run removeEmptyOrderRows   → deletes exactly those rows.
 */
function adminEmptyRows_() {
  var sheet = getOrdersSheet_();
  var last = sheet.getLastRow();
  if (last <= 1) return { sheet: sheet, rows: [] };
  var values = sheet.getRange(2, 1, last - 1, Math.max(ADMIN_COL.note, Math.min(sheet.getLastColumn(), ADMIN_TOTAL_COLS))).getValues();
  var blank = function (v) { return String(v == null ? '' : v).trim() === ''; };
  var rows = [];
  values.forEach(function (r, i) {
    if (blank(r[1]) && blank(r[2]) && blank(r[3]) && blank(r[4]) && blank(r[6]) && blank(r[ADMIN_COL.note - 1])) {
      rows.push({ row: i + 2, date: r[0] instanceof Date ? Utilities.formatDate(r[0], ADMIN_TZ, 'dd/MM/yyyy HH:mm:ss') : String(r[0] || ''), id: String(r[ADMIN_COL.id - 1] || '') });
    }
  });
  return { sheet: sheet, rows: rows };
}
function previewEmptyOrderRows() {
  var res = adminEmptyRows_();
  res.rows.forEach(function (x) { Logger.log('row ' + x.row + ' · ' + x.date + (x.id ? ' · ' + x.id : '')); });
  Logger.log(res.rows.length + ' empty row(s) would be deleted. Nothing was changed.');
  return res.rows.length;
}
function removeEmptyOrderRows() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Busy, try again in a few seconds.');
  try {
    var res = adminEmptyRows_();
    // bottom-up so the row numbers above stay valid
    res.rows.slice().reverse().forEach(function (x) { res.sheet.deleteRow(x.row); });
    Logger.log(res.rows.length + ' empty row(s) deleted.');
    return res.rows.length;
  } finally {
    lock.releaseLock();
  }
}
