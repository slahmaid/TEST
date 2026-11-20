/**
 * Crimping pliers — Google Sheet orders only
 * Columns: Date | Name | City | Phone Number | Product | Quantity | Price
 * Admin panel (admin-panel/): add admin-api.gs to this project and set the ADMIN_KEY script property
 * (same key as the main store) — see ADMIN-SETUP.md. Orders here get IDs PE-1001, PE-1002…
 */
var ADMIN_ORDER_PREFIX = 'PE';
var SHEET_NAME = 'Orders';
var HEADERS = ['Date', 'Name', 'City', 'Phone Number', 'Product', 'Quantity', 'Price'];

function getOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function setupSheet() {
  var sheet = getOrdersSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parsePostParams_(e) {
  var p = {};
  if (e && e.parameter) {
    var keys = Object.keys(e.parameter);
    for (var i = 0; i < keys.length; i++) p[keys[i]] = e.parameter[keys[i]];
  }
  if (Object.keys(p).length) return p;

  if (e && e.postData && e.postData.contents) {
    var type = String(e.postData.type || '').toLowerCase();
    if (type.indexOf('application/x-www-form-urlencoded') !== -1) {
      var pairs = String(e.postData.contents).split('&');
      for (var j = 0; j < pairs.length; j++) {
        var eq = pairs[j].indexOf('=');
        var key = decodeURIComponent((eq >= 0 ? pairs[j].substring(0, eq) : pairs[j]).replace(/\+/g, ' '));
        var val = decodeURIComponent((eq >= 0 ? pairs[j].substring(eq + 1) : '').replace(/\+/g, ' '));
        p[key] = val;
      }
    }
  }
  return p;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'admin_ping' && typeof adminPingResponse_ === 'function') return adminPingResponse_();
  return ContentService.createTextOutput('Crimping pliers orders OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    // JSON calls from the admin panel (admin-api.gs)
    if (typeof isAdminRequest_ === 'function' && isAdminRequest_(e)) return adminApi_(e);

    var p = parsePostParams_(e);
    setupSheet();

    var quantity = parseInt(p.quantity, 10);
    if (isNaN(quantity) || quantity < 1) quantity = 1;

    var price = '';
    if (p.price) {
      var n = parseFloat(String(p.price).replace(',', '.'));
      if (!isNaN(n) && n >= 0) price = n;
    }

    var base = [
      new Date(),
      String(p.name || '').trim(),
      String(p.city || '').trim(),
      String(p.phone || '').replace(/\D/g, ''),
      String(p.product || 'بانس').trim(),
      quantity,
      price
    ];
    // with admin-api.gs: H = status « جديد », J–N = admin columns (column I is never written)
    getOrdersSheet_().appendRow(typeof adminNewOrderRow_ === 'function'
      ? adminNewOrderRow_(base, p.source || 'PE')
      : base);

    return jsonOut_({ status: 'ok' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}
