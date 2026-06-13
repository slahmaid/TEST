/**
 * Google Sheet + Firestore orders (works on prumysl.cc even without firebase-config.js on the same host).
 * Config is loaded from the GitHub Pages Actions deploy when local config is missing.
 */
(function (global) {
    var ORDERS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwFR6sq_iWRbW47Nab2rwvyz43nva1BZdWiB_ZirRxXlQBz4LbWk83Vx1ej2ed2TYbC/exec';
    var FIREBASE_VERSION = '10.14.1';
    var REMOTE_CONFIG_URL = 'https://slahmaid.github.io/TEST/js/firebase-config.js';
    var firebaseReady = null;
    var db = null;

    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            var s = global.document.createElement('script');
            s.src = url;
            s.async = false;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error(url)); };
            global.document.head.appendChild(s);
        });
    }

    function configUrls() {
        var urls = ['js/firebase-config.js', '/js/firebase-config.js', REMOTE_CONFIG_URL];
        var seen = {};
        return urls.filter(function (u) {
            if (seen[u]) return false;
            seen[u] = true;
            return true;
        });
    }

    function loadFirebaseConfig() {
        var urls = configUrls();
        var i = 0;
        function next() {
            if (i >= urls.length) return Promise.reject(new Error('firebase-config'));
            return loadScript(urls[i]).catch(function () {
                i += 1;
                return next();
            });
        }
        return next();
    }

    function ensureFirebase() {
        if (firebaseReady) return firebaseReady;
        if (typeof global.firebase !== 'undefined' && global.firebase.firestore && global.PRUMYSL_FIREBASE_CONFIG) {
            try {
                if (!global.firebase.apps.length) {
                    global.firebase.initializeApp(global.PRUMYSL_FIREBASE_CONFIG);
                }
                db = global.firebase.firestore();
                firebaseReady = Promise.resolve(db);
                return firebaseReady;
            } catch (e) {
                firebaseReady = null;
            }
        }
        firebaseReady = loadScript('https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-app-compat.js')
            .then(function () {
                return loadScript('https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-firestore-compat.js');
            })
            .then(loadFirebaseConfig)
            .then(function () {
                var cfg = global.PRUMYSL_FIREBASE_CONFIG;
                if (!cfg || !cfg.apiKey || !cfg.projectId) throw new Error('config');
                if (!global.firebase.apps.length) {
                    global.firebase.initializeApp(cfg);
                }
                db = global.firebase.firestore();
                return db;
            })
            .catch(function (err) {
                firebaseReady = null;
                console.warn('[Prumysl] Firebase not available for website orders:', err && err.message ? err.message : err);
                throw err;
            });
        return firebaseReady;
    }

    function detectSource() {
        try {
            var path = (global.location && global.location.pathname) || '';
            if (path.indexOf('guard-corps') !== -1) return 'guard-corps';
            if (path.indexOf('moka-pro-max') !== -1) return 'moka-pro-max';
            if (path.indexOf('/moka') !== -1) return 'moka';
            if (path.indexOf('saqr') !== -1) return 'saqr';
            if (path.indexOf('projector') !== -1) return 'projectors';
            return 'website';
        } catch (_) {
            return 'website';
        }
    }

    function normalizePhone(raw) {
        if (global.PrumyslPhone && global.PrumyslPhone.normalizeMoroccoPhone) {
            return global.PrumyslPhone.normalizeMoroccoPhone(raw);
        }
        var d = String(raw || '').replace(/\D/g, '');
        if (d.length === 12 && d.indexOf('212') === 0) d = '0' + d.slice(3);
        return /^0[67]\d{8}$/.test(d) ? d : '';
    }

    function normalizeOrder(order) {
        var quantity = parseInt(order.quantity, 10);
        if (isNaN(quantity) || quantity < 1) quantity = 1;
        var priceRaw = order.price;
        var price = priceRaw === '' || priceRaw == null ? null : parseFloat(String(priceRaw).replace(',', '.'));
        if (price != null && isNaN(price)) price = null;
        var phone = normalizePhone(order.phone);
        var product = String(order.product || '').trim();
        if (!product) {
            var labels = {
                moka: 'كاميرا موكا',
                'guard-corps': 'كاميرا Guard Corps',
                'moka-pro-max': 'موكا برو ماكس',
                saqr: 'كاميرا الصقر',
                projectors: 'بروجيكتور شمسي'
            };
            product = labels[order.source || detectSource()] || 'طلب موقع';
        }
        return {
            name: String(order.name || '').trim(),
            city: String(order.city || '').trim(),
            phone: phone,
            product: product,
            quantity: quantity,
            price: price,
            status: 'new',
            source: String(order.source || detectSource()),
            notes: '',
            createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    function submitOrderToFirebase(order) {
        return ensureFirebase().then(function (firestore) {
            var data = normalizeOrder(order);
            if (!data.phone) {
                console.warn('[Prumysl] Order skipped: phone must be 06/07 + 8 digits');
                return;
            }
            return firestore.collection('orders').add(data).then(function (ref) {
                console.info('[Prumysl] Order saved to admin:', ref.id);
            });
        }).catch(function (err) {
            console.error('[Prumysl] Firestore order failed:', err && err.code ? err.code : err);
        });
    }

    function submitOrderToSheet(order) {
        if (ORDERS_SCRIPT_URL) {
            var body = new URLSearchParams();
            body.set('name', order.name || '');
            body.set('city', order.city || '');
            body.set('phone', order.phone || '');
            body.set('product', order.product || '');
            body.set('quantity', String(order.quantity != null ? order.quantity : ''));
            body.set('price', String(order.price != null ? order.price : ''));
            global.fetch(ORDERS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: body,
                keepalive: true
            }).catch(function () {});
        }
    }

    var savedFirebaseSubmit = typeof global.submitOrderToFirebase === 'function'
        ? global.submitOrderToFirebase
        : null;

    global.submitOrderToSheet = submitOrderToSheet;
    if (!savedFirebaseSubmit) {
        global.submitOrderToFirebase = submitOrderToFirebase;
    }
})(typeof window !== 'undefined' ? window : this);
