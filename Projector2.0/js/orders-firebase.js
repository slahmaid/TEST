/**
 * Saves orders to Firestore (all Prumysl landing pages).
 * Requires firebase-config.js + Firebase compat SDK on the page.
 */
(function (global) {
    var db = null;

    function getConfig() {
        return global.PRUMYSL_FIREBASE_CONFIG || null;
    }

    function isConfigured(cfg) {
        if (!cfg || !cfg.apiKey || !cfg.projectId) return false;
        if (cfg.apiKey.indexOf('YOUR_') === 0) return false;
        if (cfg.projectId.indexOf('YOUR_') === 0) return false;
        return true;
    }

    function initFirebase() {
        if (db) return db;

        var cfg = getConfig();
        if (!isConfigured(cfg)) return null;
        if (typeof firebase === 'undefined' || !firebase.firestore) return null;

        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(cfg);
            }
            db = firebase.firestore();
            return db;
        } catch (err) {
            console.error('[Prumysl] Firebase init error:', err);
            return null;
        }
    }

    function detectSource() {
        try {
            var path = (global.location && global.location.pathname) || '';
            if (path.indexOf('moka-pro-max') !== -1) return 'moka-pro-max';
            if (path.indexOf('/moka') !== -1) return 'moka';
            if (path.indexOf('saqr') !== -1) return 'saqr';
            if (path.indexOf('Projector2.0') !== -1) return 'Projector2.0';
            if (path.indexOf('projector') !== -1) return 'projectors';
            return 'website';
        } catch (_) {
            return 'website';
        }
    }

    function normalizeOrder(order) {
        var quantity = parseInt(order.quantity, 10);
        if (isNaN(quantity) || quantity < 1) quantity = 1;

        var priceRaw = order.price;
        var price = priceRaw === '' || priceRaw == null ? null : parseFloat(String(priceRaw).replace(',', '.'));
        if (price != null && isNaN(price)) price = null;

        var phone = String(order.phone || '');
        if (global.PrumyslPhone && global.PrumyslPhone.normalizeMoroccoPhone) {
            phone = global.PrumyslPhone.normalizeMoroccoPhone(phone);
        } else {
            phone = phone.replace(/\D/g, '');
        }

        var product = String(order.product || '').trim();
        if (!product) {
            var src = String(order.source || detectSource());
            var labels = {
                'moka': 'كاميرا موكا',
                'moka-pro-max': 'موكا برو ماكس',
                'saqr': 'كاميرا الصقر',
                'projectors': 'بروجيكتور شمسي',
                'Projector2.0': 'بروجيكتور 2.0'
            };
            product = labels[src] || 'طلب موقع';
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
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    function submitOrderToFirebase(order) {
        var firestore = initFirebase();
        if (!firestore) {
            console.warn('[Prumysl] Firestore not configured — copy js/firebase-config.example.js → js/firebase-config.js');
            return Promise.resolve();
        }

        var data = normalizeOrder(order);
        if (!data.phone) {
            console.warn('[Prumysl] Order skipped: invalid or missing phone');
            return Promise.resolve();
        }

        return firestore.collection('orders').add(data).then(function (ref) {
            console.info('[Prumysl] Order saved:', ref.id);
            return ref;
        }).catch(function (err) {
            console.error('[Prumysl] Firestore order failed:', err && err.code ? err.code : err);
            if (err && err.code === 'permission-denied') {
                console.error('[Prumysl] Publish firebase/firestore.rules in Firebase Console → Firestore → Rules');
            }
            throw err;
        });
    }

    global.submitOrderToFirebase = submitOrderToFirebase;
    global.prumyslFirebaseReady = function () {
        return !!initFirebase();
    };
})(typeof window !== 'undefined' ? window : this);
