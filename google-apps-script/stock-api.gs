/**
 * Prumysl — Stock & road-trip sales (main store's Apps Script project only, next to all-orders.gs + admin-api.gs).
 *
 * Three new tabs are created in the orders spreadsheet the first time the panel opens « المخزون »:
 *   Products     : Product ID · Name · Price · Active · Online names · SD card · Depot · Shop · Van · Updated
 *   Stock moves  : every change of stock (added, moved, counted, sold, online order…), never edited
 *   Van sales    : every sale recorded on the trip or in the shop (seller, product, qty, price, customer…)
 *
 * Locations:  depot = المستودع · shop = المحل · van = السيارة (one van stock shared by all sellers)
 * Online orders: when an order is set to « تم الشحن » / « تم التسليم » its quantity leaves the DEPOT
 * (matched by product name / « Online names »; plus one SD card product per unit when the order has an SD card).
 * If it goes back to another status (ملغي، مرتجع…), the same quantities return to the depot.
 *
 * Permissions (admin-api.gs › ADMIN_PERMS): sales, sales_all, stock_view, stock_edit, products — ticked per account by the admin.
 */

var STOCK_ACTIONS = ['stock_view', 'products_save', 'stock_move', 'sale_add', 'sales_list', 'sale_cancel', 'moves_list'];
var STOCK_LOCS = { depot: 'المستودع', shop: 'المحل', van: 'السيارة' };
var STOCK_LOC_COL = { depot: 7, shop: 8, van: 9 }; // G, H, I in « Products »
var STOCK_SHEETS = {
  products: { name: 'Products', headers: ['Product ID', 'Name', 'Price', 'Active', 'Online names', 'SD card', 'Depot', 'Shop', 'Van', 'Updated'] },
  moves: { name: 'Stock moves', headers: ['Date', 'Type', 'Product ID', 'Product', 'Qty', 'From', 'To', 'By', 'Ref', 'Note'] },
  sales: { name: 'Van sales', headers: ['Sale ID', 'Date', 'Day', 'Seller', 'Seller name', 'Product ID', 'Product', 'Qty', 'Unit price', 'Total', 'From', 'Customer', 'Phone', 'City', 'Note', 'Status'] }
};
var STOCK_SHIPPED = ['تم الشحن', 'تم التسليم'];

// ---------- entry point (called by adminApi_ after the login check) ----------
function stockApi_(d, auth) {
  if (STOCK_ACTIONS.indexOf(d.action) < 0) return null;
  // what this account may see / do (permissions were already checked per action in adminApi_)
  var caps = {
    admin: auth.role === 'admin',
    full: adminCan_(auth, 'stock_view') || adminCan_(auth, 'stock_edit') || adminCan_(auth, 'products'),  // whole stock, all fields
    all: adminCan_(auth, 'sales_all'),                                                                    // every seller's sales
    pick: adminCan_(auth, 'stock_edit')                                                                    // sell from any place
  };
  if (d.action === 'stock_view') return stockView_(caps, auth);
  if (d.action === 'sales_list') return stockSalesList_(d, caps, auth);
  if (d.action === 'moves_list') return stockMovesList_(d);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };
  try {
    if (d.action === 'products_save') return stockProductSave_(d, auth);
    if (d.action === 'stock_move') return stockMove_(d, auth);
    if (d.action === 'sale_add') return stockSaleAdd_(d, caps, auth);
    if (d.action === 'sale_cancel') return stockSaleCancel_(d, caps, auth);
  } finally {
    lock.releaseLock();
  }
  return null;
}

// ---------- sheets ----------
function stockSheet_(key) {
  var def = STOCK_SHEETS[key];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(def.headers);
    sh.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function stockNow_() { return Utilities.formatDate(new Date(), ADMIN_TZ, 'dd/MM/yyyy HH:mm'); }
function stockToday_() { return Utilities.formatDate(new Date(), ADMIN_TZ, 'yyyy-MM-dd'); }
function stockNum_(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }
function stockInt_(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function stockBool_(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return v === true || s === 'true' || s === 'نعم' || s === 'yes' || s === 'oui' || s === '1'; }
// keep the leading 0 of phone numbers (Google Sheets would turn 0612… into the number 612…)
function stockPhoneCell_(v) { var p = String(v || '').replace(/[^\d+]/g, '').slice(0, 16); return p ? "'" + p : ''; }
function stockActive_(v) { var s = String(v == null ? '' : v).trim(); return s === '' || stockBool_(v); }

function stockProducts_() {
  var sh = stockSheet_('products');
  var last = sh.getLastRow();
  if (last <= 1) return [];
  return sh.getRange(2, 1, last - 1, 10).getValues().map(function (r, i) {
    return {
      row: i + 2, id: String(r[0] || '').trim(), name: String(r[1] || '').trim(), price: stockNum_(r[2]),
      active: stockActive_(r[3]), online: String(r[4] || ''), sd: stockBool_(r[5]),
      depot: stockInt_(r[6]), shop: stockInt_(r[7]), van: stockInt_(r[8]),
      updated: r[9] instanceof Date ? Utilities.formatDate(r[9], ADMIN_TZ, 'dd/MM/yyyy HH:mm') : String(r[9] || '')
    };
  }).filter(function (p) { return p.id && p.name; });
}
function stockFind_(products, id) {
  id = String(id || '').trim();
  for (var i = 0; i < products.length; i++) if (products[i].id === id) return products[i];
  return null;
}
/** Adds delta to one location of a product and writes it to the sheet (no lock here: callers hold it). */
function stockApply_(p, loc, delta) {
  p[loc] = stockInt_(p[loc]) + delta;
  var sh = stockSheet_('products');
  sh.getRange(p.row, STOCK_LOC_COL[loc]).setValue(p[loc]);
  sh.getRange(p.row, 10).setValue(stockNow_());
}
function stockLog_(type, p, qty, from, to, by, ref, note) {
  stockSheet_('moves').appendRow([new Date(), type, p.id, p.name, qty, from ? STOCK_LOCS[from] || from : '', to ? STOCK_LOCS[to] || to : '', by || '', ref || '', note || '']);
}
function stockPublic_(p, admin) {
  if (admin) return { id: p.id, name: p.name, price: p.price, active: p.active, online: p.online, sd: p.sd, depot: p.depot, shop: p.shop, van: p.van, updated: p.updated };
  return { id: p.id, name: p.name, price: p.price, sd: p.sd, van: p.van };
}

// ---------- actions ----------
function stockView_(caps, auth) {
  var products = stockProducts_().filter(function (p) { return caps.full || p.active; });
  var out = { ok: true, today: stockToday_(), role: auth.role, user: auth.user, name: auth.name, products: products.map(function (p) { return stockPublic_(p, caps.full); }) };
  if (caps.admin) out.sellers = adminSellersPublic_();
  return out;
}

function stockProductSave_(d, auth) {
  var name = String(d.name == null ? '' : d.name).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) return { ok: false, error: 'bad_field', field: 'name' };
  var price = stockNum_(d.price);
  if (!(price >= 0) || price > 1000000) return { ok: false, error: 'bad_field', field: 'price' };
  var online = String(d.online == null ? '' : d.online).replace(/\r/g, '').trim().slice(0, 500);
  var sh = stockSheet_('products');
  var products = stockProducts_();
  var p = d.id ? stockFind_(products, d.id) : null;
  if (d.id && !p) return { ok: false, error: 'not_found' };
  var now = stockNow_();
  if (!p) {
    var props = PropertiesService.getScriptProperties();
    var seq = Number(props.getProperty('STOCK_SEQ') || 100) + 1;
    props.setProperty('STOCK_SEQ', String(seq));
    var id = 'P' + seq;
    var depot = Math.max(0, stockInt_(d.depot)), shop = Math.max(0, stockInt_(d.shop)), van = Math.max(0, stockInt_(d.van));
    sh.appendRow([id, name, price, d.active === false ? 'لا' : 'نعم', online, d.sd ? 'نعم' : 'لا', depot, shop, van, now]);
    p = stockFind_(stockProducts_(), id);
    stockLog_('منتج جديد', p, 0, '', '', auth.name, '', 'السعر ' + price);
    ['depot', 'shop', 'van'].forEach(function (loc) { if (p[loc]) stockLog_('إضافة مخزون', p, p[loc], '', loc, auth.name, '', 'كمية البداية'); });
  } else {
    var changes = [];
    if (p.name !== name) changes.push('الاسم: ' + p.name + ' ← ' + name);
    if (p.price !== price) changes.push('السعر: ' + p.price + ' ← ' + price);
    var active = d.active == null ? p.active : !!d.active;
    var sd = d.sd == null ? p.sd : !!d.sd;
    if (active !== p.active) changes.push(active ? 'تفعيل' : 'إيقاف');
    sh.getRange(p.row, 2, 1, 5).setValues([[name, price, active ? 'نعم' : 'لا', online, sd ? 'نعم' : 'لا']]);
    sh.getRange(p.row, 10).setValue(now);
    if (changes.length) stockLog_('تعديل منتج', { id: p.id, name: name }, 0, '', '', auth.name, '', changes.join(' · '));
  }
  return { ok: true, products: stockProducts_().map(function (x) { return stockPublic_(x, true); }) };
}

/** type: add (to) · remove (from, loss/damage) · transfer (from → to) · count (set the real count at "at") */
function stockMove_(d, auth) {
  var type = String(d.type || '');
  var products = stockProducts_();
  var p = stockFind_(products, d.product);
  if (!p) return { ok: false, error: 'not_found' };
  var qty = stockInt_(d.qty);
  var note = String(d.note || '').slice(0, 300);
  var from = String(d.from || ''), to = String(d.to || '');
  if (type === 'count') {
    if (!STOCK_LOC_COL[to] || qty < 0 || qty > 100000) return { ok: false, error: 'bad_field', field: 'qty' };
    var delta = qty - p[to];
    if (delta) {
      stockApply_(p, to, delta);
      stockLog_('جرد', p, delta, '', to, auth.name, '', 'العدد الحقيقي ' + qty + (note ? ' — ' + note : ''));
    }
  } else {
    if (qty < 1 || qty > 100000) return { ok: false, error: 'bad_field', field: 'qty' };
    if (type === 'add') {
      if (!STOCK_LOC_COL[to]) return { ok: false, error: 'bad_field', field: 'to' };
      stockApply_(p, to, qty);
      stockLog_('إضافة مخزون', p, qty, '', to, auth.name, '', note);
    } else if (type === 'remove') {
      if (!STOCK_LOC_COL[from]) return { ok: false, error: 'bad_field', field: 'from' };
      stockApply_(p, from, -qty);
      stockLog_('إخراج (تالف / ضائع)', p, qty, from, '', auth.name, '', note);
    } else if (type === 'transfer') {
      if (!STOCK_LOC_COL[from] || !STOCK_LOC_COL[to] || from === to) return { ok: false, error: 'bad_field', field: 'to' };
      stockApply_(p, from, -qty);
      stockApply_(p, to, qty);
      stockLog_('نقل', p, qty, from, to, auth.name, '', note);
    } else {
      return { ok: false, error: 'bad_field', field: 'type' };
    }
  }
  return { ok: true, product: stockPublic_(p, true) };
}

function stockSaleRow_(r, i) {
  return {
    row: i + 2, id: String(r[0] || ''), at: r[1] instanceof Date ? Utilities.formatDate(r[1], ADMIN_TZ, 'dd/MM/yyyy HH:mm') : String(r[1] || ''),
    ts: r[1] instanceof Date ? r[1].getTime() : 0,
    day: r[2] instanceof Date ? Utilities.formatDate(r[2], ADMIN_TZ, 'yyyy-MM-dd') : String(r[2] || ''),
    seller: String(r[3] || ''), sellerName: String(r[4] || ''), productId: String(r[5] || ''), product: String(r[6] || ''),
    qty: stockInt_(r[7]), price: stockNum_(r[8]), total: stockNum_(r[9]), from: String(r[10] || ''),
    customer: String(r[11] || ''), phone: String(r[12] || '').replace(/^'/, ''), city: String(r[13] || ''), note: String(r[14] || ''),
    cancelled: String(r[15] || '').trim() === 'ملغاة'
  };
}
function stockSales_() {
  var sh = stockSheet_('sales');
  var last = sh.getLastRow();
  if (last <= 1) return [];
  return sh.getRange(2, 1, last - 1, 16).getValues().map(stockSaleRow_).filter(function (s) { return s.id; });
}

function stockSaleAdd_(d, caps, auth) {
  var products = stockProducts_();
  var p = stockFind_(products, d.product);
  if (!p || (!caps.full && !p.active)) return { ok: false, error: 'not_found' };
  var qty = stockInt_(d.qty);
  if (qty < 1 || qty > 1000) return { ok: false, error: 'bad_field', field: 'qty' };
  var price = d.price == null || d.price === '' ? p.price : stockNum_(d.price);
  if (!(price >= 0) || price > 1000000) return { ok: false, error: 'bad_field', field: 'price' };
  var from = caps.pick && STOCK_LOC_COL[d.from] ? String(d.from) : 'van';   // only « stock_edit » may sell from the depot / shop
  var seller = auth.user, sellerName = auth.name;
  if (caps.admin && d.seller && d.seller !== 'admin') {
    var s = adminSellers_()[String(d.seller)];
    if (s) { seller = String(d.seller); sellerName = s.name; }
  }
  var text = function (x, max) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, max); };
  var props = PropertiesService.getScriptProperties();
  var seq = Number(props.getProperty('SALE_SEQ') || 1000) + 1;
  props.setProperty('SALE_SEQ', String(seq));
  var id = 'V-' + seq;
  var total = Math.round(price * qty * 100) / 100;
  stockSheet_('sales').appendRow([id, new Date(), stockToday_(), seller, sellerName, p.id, p.name, qty, price, total, STOCK_LOCS[from],
    text(d.customer, 80), stockPhoneCell_(d.phone), text(d.city, 80), text(d.note, 200), '']);
  stockApply_(p, from, -qty);
  stockLog_('بيع', p, qty, from, '', sellerName, id, price !== p.price ? 'سعر البيع ' + price + ' (السعر العادي ' + p.price + ')' : '');
  var sales = stockSales_();
  var sale = sales.filter(function (x) { return x.id === id; })[0];
  return { ok: true, sale: sale, product: stockPublic_(p, caps.full), lowStock: p[from] < 0 };
}

function stockSaleCancel_(d, caps, auth) {
  var sales = stockSales_();
  var sale = sales.filter(function (x) { return x.id === String(d.id || ''); })[0];
  if (!sale) return { ok: false, error: 'not_found' };
  if (sale.cancelled) return { ok: true, sale: sale };
  if (!caps.all && (sale.seller !== auth.user || sale.day !== stockToday_())) return { ok: false, error: 'forbidden' };
  var products = stockProducts_();
  var p = stockFind_(products, sale.productId);
  var loc = 'van';
  Object.keys(STOCK_LOCS).forEach(function (k) { if (STOCK_LOCS[k] === sale.from) loc = k; });
  stockSheet_('sales').getRange(sale.row, 16).setValue('ملغاة');
  if (p) {
    stockApply_(p, loc, sale.qty);
    stockLog_('إلغاء بيع', p, sale.qty, '', loc, auth.name, sale.id, String(d.reason || '').slice(0, 200));
  }
  sale.cancelled = true;
  return { ok: true, sale: sale, product: p ? stockPublic_(p, caps.full) : null };
}

/** from / to = yyyy-MM-dd (default: today). A seller only gets his own sales and his own totals. */
function stockSalesList_(d, caps, auth) {
  var today = stockToday_();
  var from = /^\d{4}-\d{2}-\d{2}$/.test(d.from || '') ? d.from : today;
  var to = /^\d{4}-\d{2}-\d{2}$/.test(d.to || '') ? d.to : from;
  var list = stockSales_().filter(function (s) {
    return s.day >= from && s.day <= to && (caps.all || s.seller === auth.user);
  }).sort(function (a, b) { return b.ts - a.ts || b.row - a.row; });
  var sum = { count: 0, items: 0, revenue: 0, bySeller: {}, byFrom: {}, byProduct: {} };
  list.forEach(function (s) {
    if (s.cancelled) return;
    sum.count++; sum.items += s.qty; sum.revenue += s.total;
    var k = s.sellerName || s.seller;
    sum.bySeller[k] = sum.bySeller[k] || { count: 0, items: 0, revenue: 0 };
    sum.bySeller[k].count++; sum.bySeller[k].items += s.qty; sum.bySeller[k].revenue += s.total;
    sum.byFrom[s.from] = (sum.byFrom[s.from] || 0) + s.total;
    sum.byProduct[s.product] = (sum.byProduct[s.product] || 0) + s.qty;
  });
  sum.revenue = Math.round(sum.revenue * 100) / 100;
  if (!caps.all) { delete sum.bySeller; delete sum.byFrom; }
  return { ok: true, from: from, to: to, today: today, sales: list.map(function (s) { delete s.row; return s; }), summary: sum };
}

function stockMovesList_(d) {
  var sh = stockSheet_('moves');
  var last = sh.getLastRow();
  if (last <= 1) return { ok: true, moves: [] };
  var n = Math.min(last - 1, Math.max(1, Math.min(500, stockInt_(d.limit) || 150)));
  var vals = sh.getRange(last - n + 1, 1, n, 10).getValues();
  var moves = vals.map(function (r) {
    return { at: r[0] instanceof Date ? Utilities.formatDate(r[0], ADMIN_TZ, 'dd/MM/yyyy HH:mm') : String(r[0] || ''), type: String(r[1] || ''),
      productId: String(r[2] || ''), product: String(r[3] || ''), qty: stockInt_(r[4]), from: String(r[5] || ''), to: String(r[6] || ''),
      by: String(r[7] || ''), ref: String(r[8] || ''), note: String(r[9] || '') };
  }).reverse();
  if (d.product) moves = moves.filter(function (m) { return m.productId === String(d.product); });
  return { ok: true, moves: moves };
}

// ---------- online orders ----------
function stockNorm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
}
/**
 * Products for an order's product text.
 * A text listed exactly in the « Online names » of several products (a bundle, e.g. « باقة موكا + بروجيكتور 300W »
 * written in both « كاميرا موكا » and « بروجيكتور شمسي 300 واط ») takes all of them, one each per ordered unit.
 */
function stockMatchAll_(text, products) {
  var t = stockNorm_(text);
  if (!t) return [];
  var exact = products.filter(function (p) {
    if (p.sd) return false;
    return [p.name].concat(String(p.online || '').split(/[\n,;،]+/)).some(function (c) { var n = stockNorm_(c); return n.length >= 2 && n === t; });
  });
  if (exact.length) return exact;
  var best = stockMatch_(text, products);
  return best ? [best] : [];
}
/** Best product for an order's product text: exact name / online name first, else the longest one contained in it. */
function stockMatch_(text, products) {
  var t = stockNorm_(text);
  if (!t) return null;
  var best = null, bestScore = 0;
  products.forEach(function (p) {
    if (p.sd) return;
    [p.name].concat(String(p.online || '').split(/[\n,;،]+/)).forEach(function (c) {
      var n = stockNorm_(c);
      if (n.length < 2) return;
      var score = t === n ? 10000 + n.length : (' ' + t + ' ').indexOf(' ' + n + ' ') >= 0 ? n.length : 0;
      if (score > bestScore) { bestScore = score; best = p; }
    });
  });
  return best;
}
/**
 * Called by adminUpdate_ (admin-api.gs) inside its lock when an order's status changes.
 * r = the order row (A..P), status = its new status. Returns { cell, note } for column P / the history, or null.
 */
function stockOrderHook_(r, status, at) {
  var state = {};
  try { state = JSON.parse(r[ADMIN_COL.stock - 1] || '{}') || {}; } catch (err) { state = {}; }
  var shipped = STOCK_SHIPPED.indexOf(status) >= 0;
  var out = state.state === 'out';
  var orderId = String(r[ADMIN_COL.id - 1] || '');
  if (shipped && !out) {
    var products = stockProducts_();
    var matched = stockMatchAll_(r[4], products);
    var p = matched[0];
    var qty = Math.max(1, stockInt_(r[5]) || 1);
    if (!p) return { cell: JSON.stringify({ state: 'none' }), note: 'لم يُخصم من المخزون: المنتج «' + String(r[4] || '') + '» غير موجود في قائمة المنتجات (أضفه أو أضف اسمه في «أسماء الطلبات»)' };
    var items = matched.map(function (m) { return { id: m.id, qty: qty }; });
    if (adminSd_(r[ADMIN_COL.sd - 1], r[4])) {
      var sdp = products.filter(function (x) { return x.sd && x.active; })[0];
      if (sdp) items.push({ id: sdp.id, qty: qty });
    }
    var names = [];
    items.forEach(function (it) {
      var pp = stockFind_(products, it.id);
      stockApply_(pp, 'depot', -it.qty);
      stockLog_('طلب أونلاين', pp, it.qty, 'depot', '', 'الموقع', orderId, status);
      names.push(pp.name + ' × ' + it.qty);
    });
    return { cell: JSON.stringify({ state: 'out', items: items }), note: 'خُصم من المستودع: ' + names.join('، ') };
  }
  if (!shipped && out) {
    var prods = stockProducts_();
    var back = [];
    (state.items || []).forEach(function (it) {
      var pp = stockFind_(prods, it.id);
      if (!pp) return;
      stockApply_(pp, 'depot', it.qty);
      stockLog_('إرجاع طلب أونلاين', pp, it.qty, '', 'depot', 'الموقع', orderId, status);
      back.push(pp.name + ' × ' + it.qty);
    });
    return { cell: JSON.stringify({ state: 'back', items: state.items || [] }), note: 'أُرجع إلى المستودع: ' + back.join('، ') };
  }
  return null;
}
