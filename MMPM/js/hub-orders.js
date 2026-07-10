(function () {
    'use strict';

    var PRODUCTS = {
        moka: {
            label: 'كاميرا موكا',
            price: 599,
            source: 'moka',
            thankYou: '../moka/thank-you/',
            contentId: 'MOKA-4G-DUAL',
            pendingKey: 'moka'
        },
        'moka-pro-max': {
            label: 'موكا برو ماكس',
            price: 699,
            source: 'moka-pro-max',
            thankYou: '../moka-pro-max/thank-you/',
            contentId: 'MOKA-PRO-MAX',
            pendingKey: 'moka-pro-max'
        }
    };

    function getProductConfig(form) {
        var key = form.getAttribute('data-product-key') || 'moka';
        return PRODUCTS[key] || PRODUCTS.moka;
    }

    function buildThankYouUrl(form, cfg, name) {
        var thankYouBase = form.getAttribute('data-thank-you') || cfg.thankYou;
        var formData = new FormData(form);
        var product = formData.get('product_offer') || '1_camera';
        var connection = formData.get('connection_type') || '4G SIM';
        var quantity = product === '2_camera' ? 2 : 1;
        var price = cfg.price * quantity;
        var params = new URLSearchParams();

        params.set('ordered', '1');
        params.set('name', name);
        params.set('product', product);
        params.set('quantity', String(quantity));
        params.set('price', String(price));

        if (cfg.pendingKey === 'moka-pro-max') {
            params.set('connection', connection);
        }

        return thankYouBase + '?' + params.toString();
    }

    function redirectToThankYou(url) {
        window.location.replace(url);
    }

    function fireInitiateCheckout(cfg) {
        if (typeof fbq === 'undefined') return;
        fbq('track', 'InitiateCheckout', {
            content_type: 'product',
            content_ids: [cfg.contentId],
            currency: 'MAD',
            value: cfg.price,
            num_items: 1
        });
    }

    function trackCheckoutIntent(form, cfg) {
        if (form.dataset.checkoutIntentTracked === '1') return;
        form.dataset.checkoutIntentTracked = '1';
        if (typeof fbq !== 'undefined') {
            fbq('track', 'AddToCart', {
                content_type: 'product',
                content_ids: [cfg.contentId],
                currency: 'MAD',
                value: cfg.price,
                num_items: 1
            });
        }
        fireInitiateCheckout(cfg);
    }

    function ensureInitiateCheckoutOnSubmit(form, cfg) {
        if (form.dataset.checkoutIntentTracked === '1') return;
        form.dataset.checkoutIntentTracked = '1';
        fireInitiateCheckout(cfg);
    }

    function bindHubForms() {
        document.querySelectorAll('form.hub-order-form').forEach(function (form) {
            form.addEventListener('focusin', function (e) {
                var t = e.target;
                if (!t || t.tagName !== 'INPUT') return;
                var field = t.getAttribute('name');
                if (field !== 'name' && field !== 'city' && field !== 'phone') return;
                trackCheckoutIntent(form, getProductConfig(form));
            });

            form.addEventListener('submit', function (e) {
                e.preventDefault();

                var cfg = getProductConfig(form);
                var phoneInput = form.querySelector('input[name="phone"]');
                if (!phoneInput) return;

                var cleanPhone = window.PrumyslPhone
                    ? window.PrumyslPhone.normalizeMoroccoPhone(phoneInput.value)
                    : phoneInput.value.replace(/\D/g, '');
                var phoneErr = window.PrumyslPhone
                    ? window.PrumyslPhone.validateMoroccoPhone(phoneInput.value)
                    : (cleanPhone.length === 10 ? '' : 'المرجو إدخال رقم هاتف صحيح.');
                phoneInput.value = cleanPhone;

                if (!cleanPhone || phoneErr) {
                    alert(phoneErr || 'المرجو إدخال رقم هاتف صحيح.');
                    phoneInput.focus();
                    return;
                }

                var submitBtn = form.querySelector('.hub-submit-btn');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'جاري تأكيد الطلب...';
                }

                var formData = new FormData(form);
                var name = formData.get('name') || '';
                var city = formData.get('city') || '';
                var redirectUrl = buildThankYouUrl(form, cfg, name);
                var order = {
                    name: name,
                    city: city,
                    phone: cleanPhone,
                    product: cfg.label,
                    quantity: 1,
                    price: cfg.price,
                    source: cfg.source
                };

                try {
                    if (typeof submitOrderToSheet === 'function') {
                        submitOrderToSheet(order);
                    }
                    if (typeof submitOrderToFirebase === 'function') {
                        submitOrderToFirebase(order);
                    }
                    if (typeof prumyslSetOrderPending === 'function') {
                        prumyslSetOrderPending(cfg.pendingKey);
                    }

                    ensureInitiateCheckoutOnSubmit(form, cfg);

                    if (typeof fbq !== 'undefined') {
                        fbq('track', 'Lead', {
                            content_name: cfg.label,
                            content_ids: [cfg.contentId],
                            currency: 'MAD',
                            value: cfg.price
                        });
                    }
                } finally {
                    setTimeout(function () {
                        redirectToThankYou(redirectUrl);
                    }, 450);
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHubForms);
    } else {
        bindHubForms();
    }
})();
