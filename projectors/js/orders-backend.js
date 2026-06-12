/**
 * Prumysl unified order API (Google Sheet + Firebase Firestore).
 * Call after prumysl-orders-ready or when submitOrderToSheet is defined.
 */
(function (global) {
    function submit(order) {
        if (typeof global.submitOrderToSheet === 'function') {
            return global.submitOrderToSheet(order);
        }
        console.warn('[Prumysl] Order backend not loaded yet');
        return Promise.resolve();
    }

    function ready(cb) {
        if (typeof global.submitOrderToSheet === 'function') {
            cb();
            return;
        }
        document.addEventListener('prumysl-orders-ready', function handler() {
            document.removeEventListener('prumysl-orders-ready', handler);
            cb();
        });
    }

    global.PrumyslOrders = {
        submit: submit,
        ready: ready,
        isFirebaseReady: function () {
            return typeof global.prumyslFirebaseReady === 'function' && global.prumyslFirebaseReady();
        }
    };
})(typeof window !== 'undefined' ? window : this);
