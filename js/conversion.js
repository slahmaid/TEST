/**
 * Prumysl — conversion helpers (phone, cities, UTM, sticky CTA, compact fold).
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'prumysl_attribution_v1';

    var MOROCCO_CITIES = [
        'الدار البيضاء',
        'الرباط',
        'سلا',
        'تمارة',
        'فاس',
        'مراكش',
        'طنجة',
        'أكادير',
        'مكناس',
        'وجدة',
        'القنيطرة',
        'تطوان',
        'آسفي',
        'المحمدية',
        'الجديدة',
        'الناظور',
        'بني ملال',
        'الخميسات',
        'تازة',
        'سطات',
        'العيون',
        'الخريبكة',
        'سيدي قاسم',
        'العرائش',
        'القصر الكبير',
        'الرشيدية',
        'ورزازات',
        'إفران',
        'تاوريرت',
        'برشيد',
        'سيدي سليمان',
        'الفقيه بن صالح',
        'بوزنيقة',
        'الداخلة',
        'العروي',
        'الصويرة',
        'سيدي إفني',
        'طانطان',
        'جرسيف',
        'ميدلت',
        'الحسيمة',
        'وزان',
        'تارودانت',
        'شفشاون',
        'أخرى'
    ];

    function readConfig() {
        var el = document.getElementById('prumysl-order-config');
        if (!el) return {};
        try {
            return JSON.parse(el.textContent) || {};
        } catch (_) {
            return {};
        }
    }

    function captureAttribution() {
        var params = new URLSearchParams(global.location.search);
        var data = {
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            utm_content: params.get('utm_content') || '',
            utm_term: params.get('utm_term') || '',
            fbclid: params.get('fbclid') || '',
            ttclid: params.get('ttclid') || '',
            landing_page: global.location.pathname.replace(/^\//, '') || 'index'
        };
        var hasNew = Object.keys(data).some(function (k) {
            return k !== 'landing_page' && data[k];
        });
        try {
            if (hasNew) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } else {
                var saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    var parsed = JSON.parse(saved);
                    Object.keys(parsed).forEach(function (key) {
                        if (!data[key] && parsed[key]) data[key] = parsed[key];
                    });
                }
            }
        } catch (_) {}
        return data;
    }

    var attribution = null;

    function getAttribution() {
        if (!attribution) attribution = captureAttribution();
        return Object.assign({}, attribution);
    }

    function validateMoroccanPhone(raw) {
        if (global.PrumyslPhone && global.PrumyslPhone.validateMoroccoPhone) {
            return global.PrumyslPhone.validateMoroccoPhone(raw);
        }
        var digits = String(raw || '').replace(/\D/g, '');
        if (digits.length !== 10) {
            return 'المرجو إدخال رقم هاتف مغربي من 10 أرقام.';
        }
        if (digits.charAt(0) !== '0' || (digits.charAt(1) !== '6' && digits.charAt(1) !== '7')) {
            return 'الرقم خاصو يبدأ بـ 06 أو 07.';
        }
        return '';
    }

    function bindPhoneInputs() {
        if (global.PrumyslPhone && global.PrumyslPhone.bindMoroccoPhoneInputs) {
            global.PrumyslPhone.bindMoroccoPhoneInputs(document);
            return;
        }
        document.querySelectorAll('form.order-form input[name="phone"]').forEach(function (input) {
            input.setAttribute('inputmode', 'numeric');
            input.setAttribute('autocomplete', 'tel');
            input.setAttribute('placeholder', '06XXXXXXXX');
            if (!input.getAttribute('maxlength')) input.setAttribute('maxlength', '12');
            input.addEventListener('input', function () {
                var d = input.value.replace(/\D/g, '');
                if (d.charAt(0) === '2') d = d.slice(0, 12);
                else d = d.slice(0, 10);
                input.value = d;
                input.classList.remove('field-invalid');
            });
        });
    }

    function upgradeCityFields() {
        document.querySelectorAll('form.order-form').forEach(function (form) {
            if (form.querySelector('select[name="city"]')) return;
            var input = form.querySelector('input[name="city"]');
            if (!input) return;
            var group = input.closest('.form-group');
            var label = group && group.querySelector('label');
            var select = document.createElement('select');
            select.name = 'city';
            select.className = 'city-select';
            select.setAttribute('aria-label', 'المدينة');

            var placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'اختر المدينة';
            placeholder.disabled = true;
            placeholder.selected = true;
            select.appendChild(placeholder);

            MOROCCO_CITIES.forEach(function (city) {
                var opt = document.createElement('option');
                opt.value = city;
                opt.textContent = city;
                select.appendChild(opt);
            });

            var prev = (input.value || '').trim();
            if (prev && MOROCCO_CITIES.indexOf(prev) !== -1) {
                select.value = prev;
            }

            input.replaceWith(select);
            if (label) label.setAttribute('for', select.id || '');
        });
    }

    function injectFoldBullets(cfg) {
        if (!cfg.bullets || !cfg.bullets.length) return;
        var order = document.getElementById('order');
        if (!order || order.querySelector('.order-fold-bullets')) return;

        var wrap = document.createElement('div');
        wrap.className = 'order-fold-bullets';
        wrap.setAttribute('role', 'list');
        cfg.bullets.forEach(function (text) {
            var pill = document.createElement('span');
            pill.className = 'order-fold-bullets__pill';
            pill.setAttribute('role', 'listitem');
            pill.textContent = text;
            wrap.appendChild(pill);
        });

        var form = order.querySelector('form.order-form');
        if (form) {
            order.querySelector('.container').insertBefore(wrap, form);
        }
    }

    function applyCompactMobile(cfg) {
        if (!cfg.compactMobile) return;
        document.body.classList.add('order-fold-compact');
    }

    function enhanceStickyCta(cfg) {
        var cta = document.getElementById('mobileCta');
        var btn = document.getElementById('goToOrder');
        var order = document.getElementById('order');
        if (!cta || !btn || !order) return;

        if (cfg.stickyCta) btn.textContent = cfg.stickyCta;
        if (cfg.priceLabel) {
            var priceEl = cta.querySelector('.mini-price');
            if (priceEl) priceEl.textContent = cfg.priceLabel;
        }

        cta.classList.add('mobile-cta--enhanced');

        btn.addEventListener('click', function () {
            order.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        function updateVisibility() {
            var mobile = global.matchMedia('(max-width: 768px)').matches;
            if (!mobile) {
                cta.style.display = 'none';
                return;
            }
            var rect = order.getBoundingClientRect();
            var inView = rect.top < global.innerHeight * 0.85 && rect.bottom > 0;
            cta.style.display = inView ? 'none' : 'block';
        }

        global.addEventListener('scroll', updateVisibility, { passive: true });
        global.addEventListener('resize', updateVisibility);
        updateVisibility();
    }

    function requireNameFields() {
        document.querySelectorAll('form.order-form input[name="name"]').forEach(function (input) {
            input.required = true;
            input.setAttribute('autocomplete', 'name');
        });
    }

    function injectAttributionFields() {
        var attr = getAttribution();
        document.querySelectorAll('form.order-form').forEach(function (form) {
            Object.keys(attr).forEach(function (key) {
                if (form.querySelector('input[name="' + key + '"]')) return;
                var hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = key;
                hidden.value = attr[key] || '';
                form.appendChild(hidden);
            });
        });
    }

    function bindSubmitGuards() {
        document.addEventListener(
            'submit',
            function (e) {
                var form = e.target;
                if (!form || !form.matches || !form.matches('form.order-form')) return;

                if (form.dataset.submitting === '1') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }

                var phoneInput = form.querySelector('[name="phone"]');
                if (phoneInput) {
                    var err = validateMoroccanPhone(phoneInput.value);
                    var clean = global.PrumyslPhone && global.PrumyslPhone.normalizeMoroccoPhone
                        ? global.PrumyslPhone.normalizeMoroccoPhone(phoneInput.value)
                        : phoneInput.value.replace(/\D/g, '');
                    phoneInput.value = clean;
                    if (err) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        phoneInput.classList.add('field-invalid');
                        global.alert(err);
                        phoneInput.focus();
                        return;
                    }
                }

                form.dataset.submitting = '1';
                var submitBtn = form.querySelector('.submit-btn[type="submit"], button.submit-btn');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.disabled = true;
                    if (!submitBtn.dataset.defaultLabel) {
                        submitBtn.dataset.defaultLabel = submitBtn.textContent;
                    }
                    submitBtn.textContent = 'جاري الإرسال…';
                }
            },
            true
        );
    }

    function wrapSheetSubmit() {
        if (typeof global.submitOrderToSheet !== 'function') return;
        var original = global.submitOrderToSheet;
        global.submitOrderToSheet = function (order) {
            return original(Object.assign({}, getAttribution(), order || {}));
        };
    }

    function init() {
        var cfg = readConfig();
        captureAttribution();
        wrapSheetSubmit();
        bindPhoneInputs();
        upgradeCityFields();
        requireNameFields();
        injectAttributionFields();
        injectFoldBullets(cfg);
        applyCompactMobile(cfg);
        enhanceStickyCta(cfg);
        bindSubmitGuards();
    }

    global.PrumyslConversion = {
        validateMoroccanPhone: validateMoroccanPhone,
        getAttribution: getAttribution,
        MOROCCO_CITIES: MOROCCO_CITIES
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
