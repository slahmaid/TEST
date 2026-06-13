/**
 * Thank-you conversion: real order only. Meta Purchase + TikTok Purchase/CompletePayment.
 * Campaign toggles apply on landing pages (InitiateCheckout), not here.
 */
(function (global) {
    var CURRENCY = 'MAD';

    function orderSourceFromMeta(meta) {
        if (!meta) return null;
        if (meta.isSaqr) return 'saqr';
        var k = meta.key || '';
        if (k === 'projectors' || k === 'projector' || k === '300w' || k === '400w') return 'projectors';
        if (k === 'moka-pro-max' || k === '1_camera' || k === '2_camera') return 'moka-pro-max';
        if (k.indexOf('moka') !== -1) return 'moka';
        return null;
    }

    function normalizeValue(v) {
        var n = typeof v === 'number' ? v : parseInt(String(v || '').replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    global.prumyslThankYouSourceFromMeta = orderSourceFromMeta;

    global.prumyslShouldTrackThankYou = function (source) {
        if (!source || typeof global.prumyslThankYouOrderConfirmed !== 'function') return false;
        return global.prumyslThankYouOrderConfirmed(source);
    };

    function runTtq(fn) {
        if (typeof global.ttq === 'undefined' || typeof global.ttq.ready !== 'function') return;
        global.ttq.ready(function () {
            try {
                var idRaw = sessionStorage.getItem('prumysl_ttq_ident');
                if (idRaw) {
                    var o = JSON.parse(idRaw);
                    global.ttq.identify({
                        phone_number: o.phone_number,
                        external_id: o.external_id
                    });
                    sessionStorage.removeItem('prumysl_ttq_ident');
                }
            } catch (_) {}
            fn();
        });
    }

    global.prumyslFireThankYouConversion = function (opts) {
        if (!opts || !opts.pp) return;
        var source = opts.source || orderSourceFromMeta(opts.meta);
        if (!global.prumyslShouldTrackThankYou(source)) return;

        var value = normalizeValue(opts.pp.value);
        if (value == null) return;

        var pp = {
            contentId: opts.pp.contentId,
            contentName: opts.pp.contentName,
            value: value,
            numItems: Math.max(1, parseInt(opts.pp.numItems, 10) || 1)
        };
        var isSaqr = !!opts.isSaqr || !!(opts.meta && opts.meta.isSaqr);

        if (typeof global.prumyslFbqPurchase === 'function') {
            global.prumyslFbqPurchase(pp);
        }

        runTtq(function () {
            var contents = [{
                content_id: pp.contentId,
                content_type: 'product',
                content_name: pp.contentName
            }];
            var payload = { contents: contents, value: pp.value, currency: CURRENCY };
            if (isSaqr) global.ttq.track('CompletePayment', payload);
            else global.ttq.track('Purchase', payload);
        });
    };
})(typeof window !== 'undefined' ? window : this);
