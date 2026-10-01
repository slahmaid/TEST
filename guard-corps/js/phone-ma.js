/**
 * Moroccan phone: 06/07 + 8 digits (10 total) or 212 + 9 digits (12 total).
 * Stored canonically as 10-digit local (06xxxxxxxx / 07xxxxxxxx).
 */
(function (global) {
    var LOCAL_RE = /^0[67]\d{8}$/;
    var INTL_RE = /^212[67]\d{8}$/;

    function digitsOnly(raw) {
        return String(raw || '').replace(/\D/g, '');
    }

    function normalizeMoroccoPhone(raw) {
        var d = digitsOnly(raw);
        if (d.length === 12 && d.indexOf('212') === 0) {
            d = '0' + d.slice(3);
        }
        return LOCAL_RE.test(d) ? d : '';
    }

    function validateMoroccoPhone(raw) {
        var d = digitsOnly(raw);
        if (d.charAt(0) === '2' || d.indexOf('212') === 0) {
            if (INTL_RE.test(d)) return '';
            return 'المرجو إدخال رقم بصيغة 212 متبوعاً بـ 9 أرقام (مثال: 212612345678).';
        }
        if (LOCAL_RE.test(d)) return '';
        if (d.length > 0 && d.length < 10) {
            return 'المرجو إدخال 10 أرقام تبدأ بـ 06 أو 07.';
        }
        return 'المرجو إدخال رقم هاتف مغربي صحيح (06 أو 07 مع 10 أرقام، أو 212 مع 12 رقماً).';
    }

    function restrictMoroccoPhoneInput(input) {
        if (input.dataset.maPhoneBound === '1') return;
        input.dataset.maPhoneBound = '1';
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('autocomplete', 'tel');
        if (!input.getAttribute('maxlength')) input.setAttribute('maxlength', '12');
        input.addEventListener('input', function () {
            var d = digitsOnly(input.value);
            if (d.charAt(0) === '2') d = d.slice(0, 12);
            else d = d.slice(0, 10);
            if (input.value !== d) input.value = d;
        });
    }

    function bindMoroccoPhoneInputs(root) {
        (root || document).querySelectorAll('input[name="phone"], #manualPhone').forEach(restrictMoroccoPhoneInput);
    }

    function init() {
        bindMoroccoPhoneInputs(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.PrumyslPhone = {
        digitsOnly: digitsOnly,
        normalizeMoroccoPhone: normalizeMoroccoPhone,
        validateMoroccoPhone: validateMoroccoPhone,
        bindMoroccoPhoneInputs: bindMoroccoPhoneInputs
    };
})(typeof window !== 'undefined' ? window : this);
