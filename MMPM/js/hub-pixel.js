(function () {
    'use strict';

    var HUB_PRODUCTS = [
        {
            contentId: 'MOKA-4G-DUAL',
            contentName: 'كاميرا موكا',
            price: 599
        },
        {
            contentId: 'MOKA-PRO-MAX',
            contentName: 'موكا برو ماكس',
            price: 699
        }
    ];

    function trackViewContent() {
        if (typeof fbq === 'undefined') return;
        HUB_PRODUCTS.forEach(function (product) {
            fbq('track', 'ViewContent', {
                content_type: 'product',
                content_ids: [product.contentId],
                content_name: product.contentName,
                currency: 'MAD',
                value: product.price
            });
        });
    }

    function bindQuickContactClicks() {
        var row = document.querySelector('.contact-quick-row');
        if (!row || typeof fbq === 'undefined') return;

        row.querySelectorAll('a.contact-quick-btn').forEach(function (link) {
            link.addEventListener('click', function () {
                var channel = link.classList.contains('contact-quick-btn--call') ? 'phone' : 'whatsapp';
                fbq('trackCustom', 'QuickContactStripClick', {
                    content_category: channel,
                    content_name: 'header_to_hero_strip'
                });
            });
        });
    }

    function init() {
        trackViewContent();
        bindQuickContactClicks();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
