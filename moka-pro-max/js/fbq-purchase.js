/**
 * Meta Pixel Purchase — always sends ISO 4217 currency + positive value (required for ROAS).
 */
(function (global) {
    var CURRENCY = 'MAD';

    function purchaseValue(v) {
        var n = typeof v === 'number' ? v : parseInt(String(v || '').replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    global.prumyslFbqPurchase = function (opts) {
        if (typeof global.fbq !== 'function' || !opts) return false;
        var value = purchaseValue(opts.value);
        if (value == null) return false;
        var contentId = opts.contentId || (opts.content_ids && opts.content_ids[0]);
        if (!contentId) return false;

        global.fbq('track', 'Purchase', {
            content_type: 'product',
            content_ids: [String(contentId)],
            content_name: String(opts.contentName || opts.content_name || ''),
            currency: CURRENCY,
            value: value,
            num_items: Math.max(1, parseInt(opts.numItems || opts.num_items, 10) || 1)
        });
        return true;
    };
})(typeof window !== 'undefined' ? window : this);
