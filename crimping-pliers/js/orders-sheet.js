/**
 * Google Sheet + Admin panel order drop (no Firebase).
 * Crimping pliers — dedicated sheet (not the main Prumysl orders URL).
 */
(function (global) {
    var ORDERS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxipqw5BU47MnNPHIUqF4iM6D5D2pCYs_0yGcUpY_5zyCqe7M_m6LT7EShsn-zbmZo/exec';

    function detectSource() {
        return 'crimping-pliers';
    }

    function normalizePhone(raw) {
        if (global.PrumyslPhone && global.PrumyslPhone.normalizeMoroccoPhone) {
            return global.PrumyslPhone.normalizeMoroccoPhone(raw);
        }
        var d = String(raw || '').replace(/\D/g, '');
        if (d.length === 12 && d.indexOf('212') === 0) d = '0' + d.slice(3);
        return /^0[67]\d{8}$/.test(d) ? d : '';
    }

    function defaultProduct() {
        return 'بانس';
    }

    function normalizeOrder(order) {
        var quantity = parseInt(order.quantity, 10);
        if (isNaN(quantity) || quantity < 1) quantity = 1;
        var priceRaw = order.price;
        var price = priceRaw === '' || priceRaw == null ? null : parseFloat(String(priceRaw).replace(',', '.'));
        if (price != null && isNaN(price)) price = null;
        var phone = normalizePhone(order.phone);
        var source = String(order.source || detectSource());
        var product = String(order.product || '').trim() || defaultProduct();
        return {
            name: String(order.name || '').trim(),
            city: String(order.city || '').trim(),
            phone: phone,
            product: product,
            quantity: quantity,
            price: price,
            status: 'new',
            source: source
        };
    }

    function adminOrdersUrl() {
        if (global.PRUMYSL_ADMIN_ORDERS_URL) return String(global.PRUMYSL_ADMIN_ORDERS_URL);
        return 'http://localhost:5173/api/incoming-orders';
    }

    function submitOrderToAdmin(order) {
        var url = adminOrdersUrl();
        if (!url) return;

        var payload = {
            name: order.name || '',
            city: order.city || '',
            phone: order.phone || '',
            product: order.product || '',
            quantity: order.quantity != null ? order.quantity : '',
            price: order.price != null ? order.price : '',
            source: order.source || detectSource(),
            status: order.status || 'new',
            createdAt: new Date().toLocaleString('en-US', { hour12: false })
        };

        try {
            global.fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).then(function (res) {
                if (!res.ok) {
                    console.warn('[Prumysl] Admin order HTTP', res.status);
                    return;
                }
                console.info('[Prumysl] Order sent to admin panel');
            }).catch(function (err) {
                console.warn('[Prumysl] Admin panel unreachable (sheet still saved):', err && err.message ? err.message : err);
            });
        } catch (err) {
            console.warn('[Prumysl] Admin order failed:', err);
        }
    }

    function submitOrderToSheet(order) {
        var data = normalizeOrder(order || {});
        if (!data.phone) {
            console.warn('[Prumysl] Order skipped: phone must be 06/07 + 8 digits');
            return;
        }

        if (ORDERS_SCRIPT_URL) {
            var body = new URLSearchParams();
            body.set('name', data.name || '');
            body.set('city', data.city || '');
            body.set('phone', data.phone || '');
            body.set('product', data.product || '');
            body.set('quantity', String(data.quantity != null ? data.quantity : ''));
            body.set('price', String(data.price != null ? data.price : ''));
            global.fetch(ORDERS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: body,
                keepalive: true
            }).catch(function () {});
        }

        submitOrderToAdmin(data);
    }

    global.submitOrderToSheet = submitOrderToSheet;
    global.submitOrderToFirebase = function (order) {
        submitOrderToSheet(order);
    };
})(typeof window !== 'undefined' ? window : this);
