/**
 * Prumysl — Google Sheet orders + Ozon Express proxy
 *
 * Sheet columns: Date | Name | City | Phone Number | Product | Quantity | Price
 *
 * Setup:
 * 1. Create a Google Sheet → Extensions → Apps Script → paste this file.
 * 2. Run setupSheet once (authorize when prompted).
 * 3. Run setupOzonCredentials('YOUR_CLIENT_ID', 'YOUR_API_KEY') once (see OZON-SETUP.md).
 * 4. Deploy → New deployment → Web app: Execute as Me, Who has access: Anyone.
 * 5. Copy the /exec URL into js/orders-sheet.js and admin/js/admin-app.js → ORDERS_SCRIPT_URL
 */

var SHEET_NAME = 'Orders';
var HEADERS = ['Date', 'Name', 'City', 'Phone Number', 'Product', 'Quantity', 'Price'];

function parseIsoDate_(value) {
  if (!value) return '';
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

function getOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
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

/**
 * Run once from the Apps Script editor (do not commit real keys to git):
 *   setupOzonCredentials('85582', 'your-api-key-here');
 */
function setupOzonCredentials(clientId, apiKey) {
  PropertiesService.getScriptProperties().setProperties({
    OZON_CLIENT_ID: String(clientId || '').trim(),
    OZON_API_KEY: String(apiKey || '').trim()
  });
  Logger.log('Ozon credentials saved in Script Properties.');
}

/**
 * Easiest one-time setup from the Apps Script editor:
 * 1. Set CLIENT_ID and API_KEY below (your Ozon Compte values).
 * 2. Choose saveOzonCredentialsNow in the Run menu → Run.
 * 3. Clear the two lines (leave '') and Save — do not leave keys in the file.
 */
function saveOzonCredentialsNow() {
  var CLIENT_ID = '';
  var API_KEY = '';
  if (!CLIENT_ID || !API_KEY) {
    throw new Error('Edit saveOzonCredentialsNow: set CLIENT_ID and API_KEY, then Run again.');
  }
  setupOzonCredentials(CLIENT_ID, API_KEY);
  Logger.log('Done. Clear CLIENT_ID/API_KEY in this function, Save, then test ?action=ozon_test');
}

function getOzonCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('OZON_CLIENT_ID');
  var apiKey = props.getProperty('OZON_API_KEY');
  if (!clientId || !apiKey) return null;
  return { clientId: clientId, apiKey: apiKey };
}

function ozonCredentialsMissingMessage_() {
  return 'Ozon credentials missing. In Apps Script: Project Settings → Script properties → add OZON_CLIENT_ID and OZON_API_KEY, OR run saveOzonCredentialsNow() once.';
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetOrdersResponse_(p) {
  setupSheet();
  var sheet = getOrdersSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return jsonOut_({ status: 'ok', rows: [], lastRow: lastRow });
  }

  var fromRow = parseInt(p && p.fromRow ? p.fromRow : '2', 10);
  if (isNaN(fromRow) || fromRow < 2) fromRow = 2;
  if (fromRow > lastRow) {
    return jsonOut_({ status: 'ok', rows: [], lastRow: lastRow });
  }

  var values = sheet.getRange(fromRow, 1, lastRow - fromRow + 1, HEADERS.length).getValues();
  var rows = values.map(function (r, idx) {
    var rowNumber = fromRow + idx;
    var qty = parseInt(r[5], 10);
    if (isNaN(qty) || qty < 1) qty = 1;
    var price = r[6] === '' || r[6] == null ? null : parseFloat(String(r[6]).replace(',', '.'));
    if (price != null && isNaN(price)) price = null;
    return {
      rowNumber: rowNumber,
      date: parseIsoDate_(r[0]),
      name: String(r[1] || '').trim(),
      city: String(r[2] || '').trim(),
      phone: String(r[3] || '').replace(/\D/g, ''),
      product: String(r[4] || '').trim(),
      quantity: qty,
      price: price
    };
  });

  return jsonOut_({
    status: 'ok',
    rows: rows,
    lastRow: lastRow
  });
}

function parsePostParams_(e) {
  var p = {};
  if (e && e.parameter) {
    var keys = Object.keys(e.parameter);
    for (var i = 0; i < keys.length; i++) {
      p[keys[i]] = e.parameter[keys[i]];
    }
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

function productLabel_(p) {
  if (p.product) return String(p.product).trim();

  if (p.model) {
    var m = String(p.model).toLowerCase();
    if (m === '300w') return 'بروجيكتور شمسي 300 واط';
    if (m === '400w') return 'بروجيكتور شمسي 400 واط';
    return 'بروجيكتور شمسي ' + String(p.model).trim();
  }

  if (p.product_offer === '2_camera') return 'كاميرا موكا (عرض ×2)';
  if (p.product_offer === '1_camera') return 'كاميرا موكا';

  return '';
}

function parseQuantity_(p) {
  if (p.quantity) {
    var q = parseInt(p.quantity, 10);
    if (!isNaN(q) && q > 0) return q;
  }
  if (p.product_offer === '2_camera') return 2;
  return 1;
}

function parsePrice_(p) {
  if (p.price) {
    var price = parseFloat(String(p.price).replace(',', '.'));
    if (!isNaN(price) && price >= 0) return price;
  }
  return '';
}

function buildOzonProductsJson_(p) {
  if (p.products) return String(p.products).trim();
  var ref = String(p['product-ref'] || p.productRef || '').trim();
  var qnty = parseInt(p['product-qnty'] || p.quantity || p.qnty || '1', 10);
  if (!ref) return '';
  if (isNaN(qnty) || qnty < 1) qnty = 1;
  return JSON.stringify([{ ref: ref, qnty: qnty }]);
}

function extractOzonBlock_(ozon) {
  if (!ozon) return null;
  return ozon['ADD-PARCEL'] || ozon['add-parcel'] || ozon.ADD_PARCEL || ozon;
}

function extractOzonNewParcel_(block) {
  if (!block) return null;
  return block['NEW-PARCEL'] || block['NEW_PARCEL'] || block.newParcel || null;
}

function trackingFromObject_(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (obj['TRACKING-NUMBER']) return String(obj['TRACKING-NUMBER']);
  if (obj.TRACKING_NUMBER) return String(obj.TRACKING_NUMBER);
  if (obj.trackingNumber) return String(obj.trackingNumber);
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toUpperCase().replace(/-/g, '_') === 'TRACKING_NUMBER') {
      return String(obj[keys[i]]);
    }
  }
  return '';
}

function isOzonAddParcelSuccess_(ozon) {
  var block = extractOzonBlock_(ozon);
  if (!block) return false;
  return String(block.RESULT || block.result || '').toUpperCase() === 'SUCCESS';
}

function extractOzonTracking_(ozon) {
  if (!ozon) return '';
  if (typeof ozon === 'string') {
    try { ozon = JSON.parse(ozon); } catch (e) { return ''; }
  }
  var block = extractOzonBlock_(ozon);
  var newParcel = extractOzonNewParcel_(block);
  var sources = [newParcel, block, ozon];
  for (var i = 0; i < sources.length; i++) {
    var t = trackingFromObject_(sources[i]);
    if (t) return t;
  }
  return '';
}

function extractOzonErrorMessage_(ozon) {
  var block = extractOzonBlock_(ozon);
  if (!block) return '';
  var result = String(block.RESULT || block.result || '').toUpperCase();
  if (result === 'SUCCESS') return '';
  if (result === 'ERROR') {
    return String(block.MESSAGE || block.message || 'Ozon error');
  }
  return '';
}

function normalizePhoneOzon_(phone) {
  var p = String(phone || '').replace(/\D/g, '');
  if (p.indexOf('212') === 0 && p.length >= 12) p = '0' + p.slice(3);
  if (p.length === 9 && (p.charAt(0) === '6' || p.charAt(0) === '7')) p = '0' + p;
  return p;
}

function parseOzonCities_(rawText) {
  var data = JSON.parse(rawText);
  var citiesObj = data.CITIES || data.cities || data;
  var list = [];
  if (!citiesObj || typeof citiesObj !== 'object') return list;

  var keys = Object.keys(citiesObj);
  for (var i = 0; i < keys.length; i++) {
    var c = citiesObj[keys[i]];
    if (!c) continue;
    var id = c.ID != null ? c.ID : c.id;
    var name = c.NAME != null ? c.NAME : c.name;
    if (id == null || !name) continue;
    list.push({
      id: String(id),
      name: String(name),
      ref: c.REF != null ? String(c.REF) : ''
    });
  }
  list.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });
  return list;
}

function ozonGetCitiesResponse_() {
  try {
    var resp = UrlFetchApp.fetch('https://api.ozonexpress.ma/cities', {
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = resp.getResponseCode();
    var text = resp.getContentText();
    if (code < 200 || code >= 300) {
      return jsonOut_({ status: 'error', message: 'Ozon cities HTTP ' + code, body: text.slice(0, 500) });
    }
    var cities = parseOzonCities_(text);
    return jsonOut_({ status: 'ok', cities: cities });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}

function ozonTestResponse_() {
  var creds = getOzonCredentials_();
  if (!creds) {
    return jsonOut_({ status: 'error', message: ozonCredentialsMissingMessage_() });
  }
  var cities = ozonGetCitiesResponse_();
  var citiesText = cities.getContent();
  var parsed = JSON.parse(citiesText);
  if (parsed.status !== 'ok') return jsonOut_(parsed);
  return jsonOut_({
    status: 'ok',
    message: 'Ozon API reachable. Client ID ' + creds.clientId + '. Cities: ' + parsed.cities.length
  });
}

function ozonAddParcelResponse_(p) {
  var creds = getOzonCredentials_();
  if (!creds) {
    return jsonOut_({ status: 'error', message: ozonCredentialsMissingMessage_() });
  }

  var receiver = String(p['parcel-receiver'] || p.receiver || '').trim();
  var phone = normalizePhoneOzon_(p['parcel-phone'] || p.phone);
  var cityId = String(p['parcel-city'] || p.cityId || '').trim();
  var address = String(p['parcel-address'] || p.address || '').trim();
  var priceNum = parseFloat(String(p['parcel-price'] || p.price || '0').replace(',', '.'));
  if (isNaN(priceNum)) priceNum = 0;

  if (!receiver) return jsonOut_({ status: 'error', message: 'parcel-receiver required' });
  if (!phone || !phone.match(/^0[67][0-9]{8}$/)) {
    return jsonOut_({ status: 'error', message: 'parcel-phone must be 06/07 + 8 digits' });
  }
  if (!cityId) return jsonOut_({ status: 'error', message: 'parcel-city (ID) required' });
  if (!address) return jsonOut_({ status: 'error', message: 'parcel-address required' });

  address = String(address).replace(/\s+/g, ' ').trim();

  var stock = String(p['parcel-stock'] || p.stock || '0');
  var payload = {
    'parcel-receiver': receiver,
    'parcel-phone': phone,
    'parcel-city': cityId,
    'parcel-address': address,
    'parcel-price': String(Math.round(priceNum)),
    'parcel-stock': stock
  };

  var declared = p['parcel-declared-value'] || p.declaredValue;
  if (declared) {
    payload['parcel-declared-value'] = String(declared);
  } else if (priceNum === 0 || priceNum > 5000) {
    payload['parcel-declared-value'] = String(Math.max(50, Math.round(priceNum) || 50));
  }

  if (p['parcel-note']) payload['parcel-note'] = String(p['parcel-note']);
  if (p['parcel-nature']) payload['parcel-nature'] = String(p['parcel-nature']);
  if (p['tracking-number']) payload['tracking-number'] = String(p['tracking-number']);
  if (p['parcel-open']) payload['parcel-open'] = String(p['parcel-open']);
  if (p['parcel-fragile']) payload['parcel-fragile'] = String(p['parcel-fragile']);
  if (p['parcel-replace']) payload['parcel-replace'] = String(p['parcel-replace']);

  var productsJson = buildOzonProductsJson_(p);
  if (stock === '1') {
    if (!productsJson) {
      return jsonOut_({
        status: 'error',
        message: 'نوع "مخزون" يتطلب حقل products (مراجع منتجات Ozon). استخدم "راماساج" أو أرسل products مثل [{"ref":"SKU001","qnty":1}].'
      });
    }
    payload.products = productsJson;
  } else if (productsJson) {
    payload.products = productsJson;
  }

  var url = 'https://api.ozonexpress.ma/customers/' +
    encodeURIComponent(creds.clientId) + '/' +
    encodeURIComponent(creds.apiKey) + '/add-parcel';

  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = resp.getResponseCode();
    var text = resp.getContentText();
    var ozon = null;
    try {
      ozon = JSON.parse(text);
    } catch (parseErr) {
      return jsonOut_({
        status: 'error',
        httpCode: code,
        message: 'Invalid JSON from Ozon',
        body: text.slice(0, 1000)
      });
    }

    var tracking = extractOzonTracking_(ozon);
    var ozonErr = extractOzonErrorMessage_(ozon);
    var ozonOk = isOzonAddParcelSuccess_(ozon);
    var ok = code >= 200 && code < 300 && ozonOk && !ozonErr;

    return jsonOut_({
      status: ok ? 'ok' : 'error',
      httpCode: code,
      tracking: tracking,
      message: ok
        ? (tracking ? '' : String((extractOzonBlock_(ozon) || {}).MESSAGE || 'New Parcel Added'))
        : (ozonErr || 'Ozon add-parcel failed'),
      ozon: ozon
    });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}

function extractOzonStatusLabel_(data, depth) {
  if (!data || depth > 8) return '';
  if (typeof data === 'string') {
    var s = String(data).trim();
    return s.length > 2 && s.length < 120 ? s : '';
  }
  if (typeof data !== 'object') return '';

  var keys = Object.keys(data);
  var i;
  for (i = 0; i < keys.length; i++) {
    var ku = String(keys[i]).toUpperCase().replace(/-/g, '_');
    if (ku === 'STATUS' || ku === 'SITUATION' || ku === 'STATUT' ||
        ku === 'PARCEL_STATUS' || ku === 'DELIVERY_STATUS') {
      var v = data[keys[i]];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
  }
  for (i = 0; i < keys.length; i++) {
    var nested = extractOzonStatusLabel_(data[keys[i]], depth + 1);
    if (nested) return nested;
  }
  return '';
}

function isDeliveredStatus_(label) {
  var n = String(label || '').toLowerCase();
  if (!n) return false;
  return n.indexOf('livré') !== -1 || n.indexOf('livre') !== -1 ||
    n.indexOf('delivered') !== -1 || n.indexOf('livr') !== -1 ||
    n.indexOf('مسلم') !== -1 || n.indexOf('تم التسليم') !== -1;
}

function ozonParcelStatusResponse_(p) {
  var creds = getOzonCredentials_();
  if (!creds) {
    return jsonOut_({ status: 'error', message: ozonCredentialsMissingMessage_() });
  }

  var tracking = String(p.tracking || p['tracking-number'] || '').trim();
  if (!tracking) {
    return jsonOut_({ status: 'error', message: 'tracking required' });
  }

  var suffixes = ['parcel-info', 'info-parcel', 'get-parcel-info', 'track-parcel'];
  var lastMsg = '';
  var s;

  for (s = 0; s < suffixes.length; s++) {
    var url = 'https://api.ozonexpress.ma/customers/' +
      encodeURIComponent(creds.clientId) + '/' +
      encodeURIComponent(creds.apiKey) + '/' + suffixes[s];

    try {
      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        payload: { 'tracking-number': tracking },
        muteHttpExceptions: true,
        followRedirects: true
      });
      var code = resp.getResponseCode();
      var text = resp.getContentText();
      if (code < 200 || code >= 300) {
        lastMsg = 'HTTP ' + code + ' (' + suffixes[s] + ')';
        continue;
      }

      var parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        lastMsg = 'Invalid JSON (' + suffixes[s] + ')';
        continue;
      }

      var label = extractOzonStatusLabel_(parsed, 0);
      if (!label && parsed && parsed.MESSAGE) label = String(parsed.MESSAGE);
      if (!label && parsed && parsed.message) label = String(parsed.message);

      if (label) {
        return jsonOut_({
          status: 'ok',
          tracking: tracking,
          ozonStatus: label,
          suggestDelivered: isDeliveredStatus_(label),
          endpoint: suffixes[s],
          ozon: parsed
        });
      }
      lastMsg = 'No status in response (' + suffixes[s] + ')';
    } catch (err) {
      lastMsg = String(err);
    }
  }

  return jsonOut_({
    status: 'error',
    message: lastMsg || 'Could not fetch parcel status from Ozon',
    tracking: tracking
  });
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'sheet_orders') return sheetOrdersResponse_(e.parameter || {});
  if (action === 'ozon_cities') return ozonGetCitiesResponse_();
  if (action === 'ozon_test') return ozonTestResponse_();
  if (action === 'ozon_add_parcel') return ozonAddParcelResponse_(e.parameter);
  if (action === 'ozon_parcel_status') return ozonParcelStatusResponse_(e.parameter);
  return ContentService.createTextOutput('Prumysl orders endpoint OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var p = parsePostParams_(e);
    if (p.action === 'ozon_add_parcel') return ozonAddParcelResponse_(p);

    setupSheet();
    var quantity = parseQuantity_(p);
    var price = parsePrice_(p);

    getOrdersSheet_().appendRow([
      new Date(),
      String(p.name || '').trim(),
      String(p.city || '').trim(),
      String(p.phone || '').replace(/\D/g, ''),
      productLabel_(p),
      quantity,
      price
    ]);

    return jsonOut_({ status: 'ok' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}
