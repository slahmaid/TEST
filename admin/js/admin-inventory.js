/**
 * Product inventory — main warehouse stock, shop stock, minus sold from orders.
 */
(function (global) {
    var INVENTORY_DOC = 'config';
    var db = null;
    var inventoryData = { products: {} };
    var unsubscribeInventory = null;
    var getOrders = function () { return []; };
    var onToast = function () {};
    var productCatalog = [];
    var permissionErrorShown = false;

    /** Display labels on inventory page only (Firestore keys stay Arabic product names). */
    var INVENTORY_DISPLAY_NAMES = {
        'بروجيكتور شمسي 300 واط': 'P300',
        'بروجيكتور شمسي 400 واط': 'P400',
        'كاميرا الصقر': 'Eagle',
        'كاميرا موكا': 'Q8-1',
        'موكا برو ماكس': 'Q10H',
        'كاميرا Guard Corps': 'Guard Corps'
    };

    var INVENTORY_EXCLUDED_PRODUCTS = { 'بروجيكتور شمسي': true };

    function isExcludedInventoryProduct(name) {
        return !!INVENTORY_EXCLUDED_PRODUCTS[String(name || '').trim()];
    }

    function inventoryDisplayName(productKey) {
        var key = String(productKey || '').trim();
        return INVENTORY_DISPLAY_NAMES[key] || key;
    }

    function getConfig() {
        return global.PRUMYSL_ADMIN_CONFIG || {};
    }

    var DEFAULT_INVENTORY_ADMIN_EMAILS = ['prumyslmaroc@gmail.com'];

    function inventoryAdminEmails() {
        var list = getConfig().inventoryAdminEmails || [];
        var normalized = list.map(function (e) {
            return String(e || '').trim().toLowerCase();
        }).filter(Boolean);
        return normalized.length ? normalized : DEFAULT_INVENTORY_ADMIN_EMAILS;
    }

    function isInventoryAdmin(user) {
        if (!user || !user.email) return false;
        var email = user.email.trim().toLowerCase();
        var allowed = inventoryAdminEmails();
        return allowed.length > 0 && allowed.indexOf(email) !== -1;
    }

    function applyNavVisibility(user) {
        var show = isInventoryAdmin(user);
        document.querySelectorAll('[data-nav-tier="inventory"]').forEach(function (el) {
            el.classList.toggle('hidden', !show);
        });
    }

    function parseQty(raw) {
        var val = parseInt(raw, 10);
        if (isNaN(val) || val < 0) val = 0;
        return val;
    }

    function productEntry(name) {
        return (inventoryData.products && inventoryData.products[name]) || {};
    }

    function defaultProductsFromCatalog() {
        var products = {};
        productCatalog.forEach(function (p) {
            if (!p.name || p.name === 'منتج مخصص' || isExcludedInventoryProduct(p.name)) return;
            products[p.name] = { onHand: 0, shopOnHand: 0 };
        });
        return products;
    }

    function computeSoldByProduct(orders) {
        var sold = {};
        orders.forEach(function (o) {
            if (o.status === 'cancelled') return;
            var name = String(o.product || '').trim() || '—';
            var qty = parseInt(o.quantity, 10);
            if (isNaN(qty) || qty < 1) qty = 1;
            sold[name] = (sold[name] || 0) + qty;
        });
        return sold;
    }

    function mergeProductRows(sold) {
        var names = {};
        productCatalog.forEach(function (p) {
            if (p.name && p.name !== 'منتج مخصص' && !isExcludedInventoryProduct(p.name)) {
                names[p.name] = true;
            }
        });
        Object.keys(sold).forEach(function (k) {
            if (!isExcludedInventoryProduct(k)) names[k] = true;
        });
        Object.keys(inventoryData.products || {}).forEach(function (k) {
            if (!isExcludedInventoryProduct(k)) names[k] = true;
        });
        return Object.keys(names).sort(function (a, b) {
            return inventoryDisplayName(a).localeCompare(inventoryDisplayName(b), 'en', { sensitivity: 'base' });
        });
    }

    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function renderInventoryPage() {
        var body = document.getElementById('inventoryBody');
        var empty = document.getElementById('inventoryEmpty');
        var statSkus = document.getElementById('inventoryStatSkus');
        var statSold = document.getElementById('inventoryStatSold');
        var statLow = document.getElementById('inventoryStatLow');
        var badge = document.getElementById('inventoryCountBadge');
        if (!body) return;

        var orders = getOrders();
        var sold = computeSoldByProduct(orders);
        var rows = mergeProductRows(sold);
        var totalSold = 0;
        var lowCount = 0;

        if (!rows.length) {
            body.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            if (badge) badge.textContent = '0';
            return;
        }
        if (empty) empty.classList.add('hidden');

        body.innerHTML = rows.map(function (name) {
            var entry = productEntry(name);
            var onHand = parseQty(entry.onHand);
            var shopOnHand = parseQty(entry.shopOnHand);
            var soldQty = sold[name] || 0;
            var available = onHand - soldQty;
            totalSold += soldQty;
            if (available <= 5) lowCount += 1;
            var rowClass = available <= 0 ? 'inventory-row inventory-row--out' :
                (available <= 5 ? 'inventory-row inventory-row--low' : 'inventory-row');
            var label = inventoryDisplayName(name);
            return '<tr class="' + rowClass + '" data-product="' + escapeAttr(name) + '">' +
                '<td><strong class="inventory-product-label" dir="ltr">' + escapeHtml(label) + '</strong></td>' +
                '<td class="col-onhand">' +
                '<input type="number" class="inventory-onhand-input" min="0" step="1" value="' + onHand + '" ' +
                'data-product="' + escapeAttr(name) + '" aria-label="المخزن الرئيسي ' + escapeAttr(label) + '">' +
                '</td>' +
                '<td class="col-shop">' +
                '<input type="number" class="inventory-shop-input" min="0" step="1" value="' + shopOnHand + '" ' +
                'data-product="' + escapeAttr(name) + '" data-prev-shop="' + shopOnHand + '" ' +
                'aria-label="المحل ' + escapeAttr(label) + '">' +
                '</td>' +
                '<td class="col-sold">' + soldQty + '</td>' +
                '<td class="col-available"><span class="inventory-available">' + available + '</span></td>' +
                '</tr>';
        }).join('');

        if (statSkus) statSkus.textContent = String(rows.length);
        if (statSold) statSold.textContent = String(totalSold);
        if (statLow) statLow.textContent = String(lowCount);
        if (badge) badge.textContent = String(rows.length);

        body.querySelectorAll('.inventory-onhand-input').forEach(function (input) {
            input.addEventListener('change', function () {
                saveMainOnHand(input.dataset.product, input.value);
            });
        });

        body.querySelectorAll('.inventory-shop-input').forEach(function (input) {
            input.addEventListener('change', function () {
                saveShopOnHand(input.dataset.product, input.value, input.getAttribute('data-prev-shop'));
            });
        });
    }

    function persistProducts(products, toastMsg) {
        if (!db) return Promise.resolve();
        return db.collection('inventory').doc(INVENTORY_DOC).set({
            products: products,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
            .then(function () {
                if (toastMsg) onToast(toastMsg, 'success');
            })
            .catch(function (err) {
                onToast('خطأ: ' + (err.message || err), 'error');
            });
    }

    function saveMainOnHand(productName, raw) {
        if (!db || !productName) return;
        var val = parseQty(raw);
        var products = Object.assign({}, inventoryData.products || {});
        products[productName] = Object.assign({}, products[productName] || {}, { onHand: val });
        persistProducts(products, 'تم حفظ المخزن الرئيسي: ' + inventoryDisplayName(productName));
    }

    function saveShopOnHand(productName, raw, prevRaw) {
        if (!db || !productName) return;
        var newShop = parseQty(raw);
        var prevShop = parseQty(prevRaw);
        var delta = newShop - prevShop;
        var entry = productEntry(productName);
        var onHand = parseQty(entry.onHand);
        var newMain = onHand + delta;
        if (newMain < 0) {
            onToast('لا يمكن أن يقل المخزن الرئيسي عن صفر', 'error');
            renderInventoryPage();
            return;
        }
        var products = Object.assign({}, inventoryData.products || {});
        products[productName] = Object.assign({}, products[productName] || {}, {
            shopOnHand: newShop,
            onHand: newMain
        });
        var label = inventoryDisplayName(productName);
        var msg = 'تم حفظ المحل: ' + label;
        if (delta !== 0) {
            msg += ' — المخزن الرئيسي ' + (delta > 0 ? '+' : '') + delta + ' → ' + newMain;
        }
        persistProducts(products, msg);
    }

    function isPermissionError(err) {
        var code = err && (err.code || err.name || '');
        var msg = String((err && err.message) || '');
        return code === 'permission-denied' || /permission/i.test(msg);
    }

    function showInventoryPermissionHelp(err) {
        if (permissionErrorShown) return;
        permissionErrorShown = true;
        console.error('[Prumysl Inventory]', err);
        onToast(
            'صلاحيات Firestore مرفوضة للمخزون. انشر firebase/firestore.rules في Firebase Console ' +
            'وتأكد أن بريدك prumyslmaroc@gmail.com مضاف في isInventoryAdmin().',
            'error'
        );
    }

    function ensureInventoryDoc() {
        if (!db) return Promise.resolve();
        return db.collection('inventory').doc(INVENTORY_DOC).get()
            .then(function (snap) {
                if (snap.exists) return;
                return db.collection('inventory').doc(INVENTORY_DOC).set({
                    products: defaultProductsFromCatalog(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            })
            .catch(function (err) {
                if (isPermissionError(err)) showInventoryPermissionHelp(err);
                else onToast('خطأ: ' + (err.message || err), 'error');
                throw err;
            });
    }

    function subscribeInventory() {
        if (!db) return;
        if (unsubscribeInventory) unsubscribeInventory();
        permissionErrorShown = false;
        ensureInventoryDoc().then(function () {
            unsubscribeInventory = db.collection('inventory').doc(INVENTORY_DOC)
                .onSnapshot(function (snap) {
                    if (snap.exists) {
                        var data = snap.data() || {};
                        inventoryData.products = data.products || {};
                    }
                    renderInventoryPage();
                }, function (err) {
                    if (isPermissionError(err)) showInventoryPermissionHelp(err);
                    else onToast('خطأ: ' + (err.message || err), 'error');
                });
        }).catch(function () { /* handled above */ });
    }

    function init(options) {
        db = options.db;
        getOrders = options.getOrders || getOrders;
        onToast = options.onToast || onToast;
        productCatalog = options.productCatalog || [];
    }

    function onOrdersUpdated() {
        renderInventoryPage();
    }

    function teardown() {
        if (unsubscribeInventory) {
            unsubscribeInventory();
            unsubscribeInventory = null;
        }
    }

    global.PrAdminInventory = {
        init: init,
        isInventoryAdmin: isInventoryAdmin,
        applyNavVisibility: applyNavVisibility,
        subscribeInventory: subscribeInventory,
        renderInventoryPage: renderInventoryPage,
        onOrdersUpdated: onOrdersUpdated,
        teardown: teardown,
        inventoryAdminEmails: inventoryAdminEmails
    };
})(typeof window !== 'undefined' ? window : this);
