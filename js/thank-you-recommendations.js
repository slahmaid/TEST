/**
 * Related products on thank-you pages — all catalog items except Guard Corps and the current product.
 */
(function (global) {
    var PRODUCTS = [
        {
            id: 'moka',
            name: 'كاميرا موكا الذكية',
            desc: 'عدستان، 12MP، 4G، V380 Pro',
            price: '599 درهم',
            image: 'images/Home-Moka.jpeg',
            href: 'moka/',
            tag: '4G'
        },
        {
            id: 'moka-pro-max',
            name: 'موكا برو ماكس',
            desc: '3 عدسات PTZ، زووم بصري 10×',
            price: '699 درهم',
            image: 'images/Home-Moka-Pro-Max.jpeg',
            href: 'moka-pro-max/',
            tag: 'الأكثر مبيعاً'
        },
        {
            id: 'saqr',
            name: 'كاميرا الصقر',
            desc: 'زووم بصري 36×، 24MP، 4G',
            price: '1999 درهم',
            image: 'saqr/images/Saqr.jpeg',
            href: 'saqr/',
            tag: 'زووم بعيد'
        },
        {
            id: 'projectors',
            name: 'بروجيكتور شمسي LED',
            desc: '300W أو 400W، ريموت، ضمان 3 سنوات',
            price: 'من 699 درهم',
            image: 'projectors/images/300W.webp',
            href: 'projectors/',
            tag: 'إضاءة خارجية'
        }
    ];

    var EXCLUDED = ['guard-corps'];

    function detectCurrentProduct() {
        var path = (global.location && global.location.pathname) || '';
        if (path.indexOf('/guard-corps/') !== -1) return 'guard-corps';
        if (path.indexOf('/moka-pro-max/') !== -1) return 'moka-pro-max';
        if (path.indexOf('/moka/') !== -1) return 'moka';
        if (path.indexOf('/saqr/') !== -1) return 'saqr';
        if (path.indexOf('/projectors/') !== -1) return 'projectors';
        return '';
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderRecommended() {
        var mount = document.getElementById('recommendedProducts');
        if (!mount) return;

        var current = detectCurrentProduct();
        var items = PRODUCTS.filter(function (p) {
            return EXCLUDED.indexOf(p.id) === -1 && p.id !== current;
        });

        if (!items.length) {
            mount.innerHTML = '';
            return;
        }

        var root = '../../';
        var cards = items.map(function (p) {
            var tag = p.tag
                ? '<span class="rec-card__tag">' + escapeHtml(p.tag) + '</span>'
                : '';
            var url = root + p.href;
            var img = root + p.image;
            return (
                '<article class="rec-card">' +
                '<a class="rec-card__media" href="' + escapeHtml(url) + '">' +
                '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '" class="loaded" width="200" height="150" decoding="async">' +
                '</a>' +
                '<div class="rec-card__body">' +
                tag +
                '<h3>' + escapeHtml(p.name) + '</h3>' +
                '<p>' + escapeHtml(p.desc) + '</p>' +
                '<div class="rec-card__footer">' +
                '<span class="rec-card__price">' + escapeHtml(p.price) + '</span>' +
                '<a class="rec-card__cta" href="' + escapeHtml(url) + '">عرض التفاصيل</a>' +
                '</div></div></article>'
            );
        }).join('');

        mount.innerHTML =
            '<section class="recommended-products" aria-labelledby="rec-heading">' +
            '<div class="recommended-products__inner">' +
            '<h2 id="rec-heading">منتجات قد تعجبك أيضاً</h2>' +
            '<p class="recommended-products__lead">اكتشف باقي حلول Prumysl للمراقبة والإضاءة الشمسية</p>' +
            '<div class="recommended-products__grid">' + cards + '</div>' +
            '</div></section>';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderRecommended);
    } else {
        renderRecommended();
    }

    global.prumyslRenderThankYouRecommendations = renderRecommended;
})(typeof window !== 'undefined' ? window : this);
