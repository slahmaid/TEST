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
        if (k === 'Projector2.0' || k === 'projector2') return 'Projector2.0';
        if (k === 'guard-corps' || k === 'guardcorps') return 'guard-corps';
        if (k === 'mmpm300' || k === 'bundle' || k === 'BUNDLE-MOKA-300W') return 'mmpm300';
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

    /**
     * Fire TikTok identify + track immediately.
     * Do NOT gate on ttq.ready — the base pixel stub queues calls; waiting on ready
     * often never runs the callback, so Purchase never appears in Pixel Helper.
     */
    function runTtq(fn) {
        if (typeof global.ttq === 'undefined') return;
        try {
            var idRaw = sessionStorage.getItem('prumysl_ttq_ident');
            if (idRaw) {
                var o = JSON.parse(idRaw);
                if (o && (o.phone_number || o.external_id || o.email)) {
                    global.ttq.identify({
                        email: o.email || undefined,
                        phone_number: o.phone_number || undefined,
                        external_id: o.external_id || undefined
                    });
                }
                sessionStorage.removeItem('prumysl_ttq_ident');
            }
        } catch (_) {}
        try { fn(); } catch (_) {}
    }

    global.prumyslFireThankYouConversion = function (opts) {
        if (!opts || !opts.pp) return false;
        var source = opts.source || orderSourceFromMeta(opts.meta);
        if (!global.prumyslShouldTrackThankYou(source)) return false;

        var value = normalizeValue(opts.pp.value);
        if (value == null) return false;

        var pp = {
            contentId: opts.pp.contentId,
            contentName: opts.pp.contentName,
            value: value,
            numItems: Math.max(1, parseInt(opts.pp.numItems, 10) || 1)
        };
        var isSaqr = !!opts.isSaqr || !!(opts.meta && opts.meta.isSaqr);

        if (typeof global.prumyslTrackPurchase === 'function') {
            global.prumyslTrackPurchase({
                contentId: pp.contentId,
                contentName: pp.contentName,
                value: pp.value,
                numItems: pp.numItems,
                isSaqr: isSaqr
            });
            return true;
        }

        if (typeof global.prumyslFbqPurchase === 'function') {
            global.prumyslFbqPurchase(pp);
        }

        if (typeof global.prumyslGoogleAdsPurchase === 'function') {
            global.prumyslGoogleAdsPurchase({
                value: pp.value,
                source: source,
                contentId: pp.contentId,
                transactionId: source + '-' + pp.contentId + '-' + Date.now()
            });
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
        return true;
    };
})(typeof window !== 'undefined' ? window : this);
