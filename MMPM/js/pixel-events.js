/**
 * Prumysl dual-pixel helpers — Meta (fbq) + TikTok (ttq).
 * Standard funnel: PageView → ViewContent → AddToCart → InitiateCheckout → Purchase
 */
(function (global) {
    'use strict';

    var CURRENCY = 'MAD';

    function hasFbq() {
        return typeof global.fbq === 'function';
    }

    function runTtq(fn) {
        if (typeof global.ttq === 'undefined') return;
        if (typeof global.ttq.ready === 'function') {
            global.ttq.ready(fn);
            return;
        }
        try { fn(); } catch (_) {}
    }

    function num(v, fallback) {
        var n = typeof v === 'number' ? v : parseInt(String(v || '').replace(/[^\d.-]/g, ''), 10);
        return Number.isFinite(n) ? n : (fallback || 0);
    }

    function contentsPayload(opts) {
        var id = String(opts.contentId || opts.content_id || '');
        var name = String(opts.contentName || opts.content_name || '');
        return [{
            content_id: id,
            content_type: 'product',
            content_name: name
        }];
    }

    /** PageView — usually already in <head>; safe no-op duplicate if called again. */
    global.prumyslTrackPageView = function () {
        if (hasFbq()) {
            try { global.fbq('track', 'PageView'); } catch (_) {}
        }
        runTtq(function () {
            try { global.ttq.page(); } catch (_) {}
        });
    };

    global.prumyslTrackViewContent = function (opts) {
        if (!opts) return;
        var value = num(opts.value);
        var contentId = String(opts.contentId || '');
        if (!contentId) return;

        if (hasFbq()) {
            global.fbq('track', 'ViewContent', {
                content_type: 'product',
                content_ids: [contentId],
                content_name: String(opts.contentName || ''),
                currency: CURRENCY,
                value: value
            });
        }
        runTtq(function () {
            global.ttq.track('ViewContent', {
                contents: contentsPayload(opts),
                value: value,
                currency: CURRENCY
            });
        });
    };

    global.prumyslTrackAddToCart = function (opts) {
        if (!opts) return;
        var value = num(opts.value);
        var contentId = String(opts.contentId || '');
        var numItems = Math.max(1, num(opts.numItems, 1));
        if (!contentId) return;

        if (hasFbq()) {
            global.fbq('track', 'AddToCart', {
                content_type: 'product',
                content_ids: [contentId],
                currency: CURRENCY,
                value: value,
                num_items: numItems
            });
        }
        runTtq(function () {
            global.ttq.track('AddToCart', {
                contents: contentsPayload(opts),
                value: value,
                currency: CURRENCY
            });
        });
    };

    global.prumyslTrackInitiateCheckout = function (opts) {
        if (!opts) return;
        var value = num(opts.value);
        var contentId = String(opts.contentId || '');
        var numItems = Math.max(1, num(opts.numItems, 1));
        if (!contentId) return;

        if (hasFbq()) {
            global.fbq('track', 'InitiateCheckout', {
                content_type: 'product',
                content_ids: [contentId],
                currency: CURRENCY,
                value: value,
                num_items: numItems
            });
        }
        runTtq(function () {
            global.ttq.track('InitiateCheckout', {
                contents: contentsPayload(opts),
                value: value,
                currency: CURRENCY
            });
        });
    };

    /**
     * Checkout intent: AddToCart + InitiateCheckout once (Meta + TikTok).
     * Returns true if events fired, false if already tracked on this form.
     */
    global.prumyslTrackCheckoutIntent = function (form, opts) {
        if (!form || !opts) return false;
        if (form.dataset.checkoutIntentTracked === '1') return false;
        form.dataset.checkoutIntentTracked = '1';
        global.prumyslTrackAddToCart(opts);
        global.prumyslTrackInitiateCheckout(opts);
        return true;
    };

    /** Purchase — Meta Purchase + TikTok Purchase (or CompletePayment when isSaqr). */
    global.prumyslTrackPurchase = function (opts) {
        if (!opts) return false;
        var value = num(opts.value);
        var contentId = String(opts.contentId || '');
        if (!contentId || value <= 0) return false;
        var numItems = Math.max(1, num(opts.numItems, 1));
        var contentName = String(opts.contentName || '');

        if (typeof global.prumyslFbqPurchase === 'function') {
            global.prumyslFbqPurchase({
                contentId: contentId,
                contentName: contentName,
                value: value,
                numItems: numItems
            });
        } else if (hasFbq()) {
            global.fbq('track', 'Purchase', {
                content_type: 'product',
                content_ids: [contentId],
                content_name: contentName,
                currency: CURRENCY,
                value: value,
                num_items: numItems
            });
        }

        runTtq(function () {
            var payload = {
                contents: contentsPayload({ contentId: contentId, contentName: contentName }),
                value: value,
                currency: CURRENCY
            };
            if (opts.isSaqr) global.ttq.track('CompletePayment', payload);
            else global.ttq.track('Purchase', payload);
        });
        return true;
    };

    function sha256HexUtf8(str) {
        if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) {
            return Promise.resolve('');
        }
        var data = new TextEncoder().encode(String(str || ''));
        return global.crypto.subtle.digest('SHA-256', data).then(function (buf) {
            return Array.from(new Uint8Array(buf))
                .map(function (b) { return b.toString(16).padStart(2, '0'); })
                .join('');
        }).catch(function () { return ''; });
    }

    function normMaPhone(digits) {
        var d = String(digits || '').replace(/\D/g, '');
        if (d.length === 10 && d.charAt(0) === '0') return '212' + d.slice(1);
        if (d.length === 12 && d.indexOf('212') === 0) return d;
        if (d.length === 9 && d.charAt(0) === '6') return '212' + d;
        return d ? d : '';
    }

    /**
     * Hash phone (+ optional external id prefix) and store for thank-you ttq.identify.
     * Never pass raw email/phone to ttq.identify — TikTok requires SHA-256.
     */
    global.prumyslStoreTtqIdentify = function (phoneDigits, externalPrefix) {
        var norm = normMaPhone(phoneDigits);
        if (!norm) return Promise.resolve(false);
        var prefix = String(externalPrefix || 'prumysl') + '|';
        return Promise.all([
            sha256HexUtf8(norm),
            sha256HexUtf8(prefix + norm)
        ]).then(function (hashes) {
            var phoneHash = hashes[0];
            var extHash = hashes[1];
            if (!phoneHash || !extHash) return false;
            try {
                sessionStorage.setItem('prumysl_ttq_ident', JSON.stringify({
                    phone_number: phoneHash,
                    external_id: extHash
                }));
            } catch (_) {}
            return true;
        }).catch(function () { return false; });
    };

    /** TikTok PlaceAnOrder (form submit) — before redirect to thank-you Purchase. */
    global.prumyslTrackPlaceAnOrder = function (opts) {
        if (!opts) return;
        var value = num(opts.value);
        var contentId = String(opts.contentId || '');
        if (!contentId) return;
        runTtq(function () {
            global.ttq.track('PlaceAnOrder', {
                contents: contentsPayload(opts),
                value: value,
                currency: CURRENCY
            });
        });
    };
})(typeof window !== 'undefined' ? window : this);
