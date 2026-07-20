/**
 * Google Ads purchase conversion — thank-you pages only.
 */
(function (global) {
    'use strict';

    function normalizeValue(v) {
        var n = typeof v === 'number' ? v : parseInt(String(v || '').replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    global.prumyslGoogleAdsPurchase = function (opts) {
        if (typeof global.gtag !== 'function' || !opts) return false;

        var cfg = global.PRUMYSL_GOOGLE_ADS || {};
        var value = normalizeValue(opts.value);
        if (value == null) return false;

        var eventName = cfg.purchaseEvent || 'ads_conversion_purchase';
        var currency = cfg.currency || 'MAD';
        var txId = opts.transactionId || opts.transaction_id;
        if (!txId) {
            txId = String(opts.source || opts.contentId || 'order') + '-' + Date.now();
        }

        global.gtag('event', eventName, {
            value: value,
            currency: currency,
            transaction_id: String(txId)
        });
        return true;
    };
})(typeof window !== 'undefined' ? window : this);
