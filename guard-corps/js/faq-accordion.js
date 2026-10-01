(function () {
    'use strict';

    document.querySelectorAll('.faq-question').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var item = btn.parentElement;
            var open = item.classList.toggle('active');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    });
})();
