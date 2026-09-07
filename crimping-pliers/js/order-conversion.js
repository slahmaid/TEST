/**
 * Fire Purchase/CompletePayment only after a real form submit (one-time, 30 min).
 */
(function (global) {
    var KEY = 'prumysl_order_pending';
    var DONE_PREFIX = 'prumysl_thankyou_done_';
    var MAX_AGE_MS = 30 * 60 * 1000;

    global.prumyslSetOrderPending = function (source) {
        if (!source) return;
        try {
            sessionStorage.setItem(KEY, JSON.stringify({ source: String(source), ts: Date.now() }));
            // New order → allow Purchase again on thank-you (clear prior one-fire lock).
            sessionStorage.removeItem(DONE_PREFIX + String(source));
        } catch (_) {}
    };

    global.prumyslConsumeOrderPending = function (source) {
        if (!source) return false;
        try {
            var raw = sessionStorage.getItem(KEY);
            if (!raw) return false;
            var o = JSON.parse(raw);
            // Only remove when source matches — otherwise keep token for the correct thank-you.
            if (!o || o.source !== String(source)) return false;
            if (!o.ts || Date.now() - o.ts > MAX_AGE_MS) {
                sessionStorage.removeItem(KEY);
                return false;
            }
            sessionStorage.removeItem(KEY);
            return true;
        } catch (_) {
            return false;
        }
    };

    /** Thank-you: confirmed order via session token or ?ordered=1 (one fire per product). */
    global.prumyslThankYouOrderConfirmed = function (source) {
        if (!source) return false;
        if (typeof global.prumyslConsumeOrderPending === 'function' && global.prumyslConsumeOrderPending(source)) {
            try {
                sessionStorage.setItem(DONE_PREFIX + String(source), String(Date.now()));
            } catch (_) {}
            return true;
        }
        try {
            var params = new URLSearchParams(global.location && global.location.search || '');
            if (params.get('ordered') !== '1') return false;
            var doneKey = DONE_PREFIX + source;
            if (sessionStorage.getItem(doneKey)) return false;
            sessionStorage.setItem(doneKey, String(Date.now()));
            return true;
        } catch (_) {
            return false;
        }
    };
})(typeof window !== 'undefined' ? window : this);
