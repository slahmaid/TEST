(function () {
    'use strict';

    var STORAGE_KEY = 'prumysl_lang';

    var STRINGS = {
        ar: {
            'top-bar': 'توصيل مجاني لجميع أنحاء المغرب 🇲🇦 + الدفع عند الاستلام',
            'moka-top-bar': 'توصيل مجاني لجميع المدن + الدفع عند الاستلام — كاميرا موكا 4G ☀️',
            'moka-pro-top-bar': 'توصيل مجاني لجميع المدن + الدفع عند الاستلام — أسرع ما يمكن 🚚',
            'saqr-top-bar': 'توصيل مجاني + الدفع عند الاستلام — كاميرا الصقر 36× ☀️',
            'projectors-top-bar': 'توصيل مجاني + الدفع عند الاستلام — بروجيكتور شمسي LED ☀️',
            'call-btn': 'اتصل بنا',
            'call-btn-order': 'اتصل بنا للطلب',
            'wa-btn': 'واتساب',
            'wa-btn-long': 'تواصل معنا على واتساب',
            'submit-btn': 'تأكيد الطلب الآن ✅ — الدفع عند الاستلام',
            'home-hero-title': 'حلول Prumysl الشمسية للمراقبة والإضاءة في المغرب',
            'home-hero-desc': 'كاميرات مراقبة ذكية وبروجيكتورات LED تعمل بالطاقة الشمسية — بدون فواتير كهرباء، مع توصيل مجاني والدفع عند الاستلام.',
            'products-heading': 'منتجاتنا',
            'products-sub': 'اختر المنتج المناسب لاحتياجك واطلب مباشرة من صفحة العرض',
            'faq-heading': 'الأسئلة الشائعة',
            'faq-sub': 'كل ما تحتاج تعرفو على الطلب والتوصيل والدفع عند Prumysl',
            'trust-video-heading': 'شاهد منتجاتنا في العمل'
        },
        fr: {
            'top-bar': 'Livraison gratuite partout au Maroc 🇲🇦 + paiement à la livraison',
            'moka-top-bar': 'Livraison gratuite + paiement à la livraison — Caméra Moka 4G ☀️',
            'moka-pro-top-bar': 'Livraison gratuite dans tout le Maroc + paiement à la livraison — Moka Pro Max 🚚',
            'saqr-top-bar': 'Livraison gratuite + paiement à la livraison — Caméra Saqr 36× ☀️',
            'projectors-top-bar': 'Livraison gratuite + paiement à la livraison — Projecteur solaire LED ☀️',
            'call-btn': 'Appelez-nous',
            'call-btn-order': 'Appelez pour commander',
            'wa-btn': 'WhatsApp',
            'wa-btn-long': 'Contactez-nous sur WhatsApp',
            'submit-btn': 'Confirmer la commande ✅ — paiement à la livraison',
            'home-hero-title': 'Solutions solaires Prumysl — surveillance et éclairage au Maroc',
            'home-hero-desc': 'Caméras intelligentes et projecteurs LED solaires — sans facture d\'électricité, livraison gratuite et paiement à la livraison.',
            'products-heading': 'Nos produits',
            'products-sub': 'Choisissez le produit adapté et commandez depuis la page dédiée',
            'faq-heading': 'Questions fréquentes',
            'faq-sub': 'Tout savoir sur la commande, la livraison et le paiement chez Prumysl',
            'trust-video-heading': 'Voir nos produits en action'
        }
    };

    function applyLang(lang) {
        var pack = STRINGS[lang] || STRINGS.ar;
        var html = document.documentElement;

        html.setAttribute('lang', lang === 'fr' ? 'fr' : 'ar');
        html.setAttribute('dir', lang === 'fr' ? 'ltr' : 'rtl');

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (!pack[key]) {
                return;
            }
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = pack[key];
            } else {
                el.textContent = pack[key];
            }
        });

        document.querySelectorAll('.lang-switch__btn').forEach(function (btn) {
            var active = btn.getAttribute('data-lang') === lang;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (_) {}
    }

    function init() {
        var saved = 'ar';
        try {
            saved = localStorage.getItem(STORAGE_KEY) || 'ar';
        } catch (_) {}

        if (saved !== 'ar' && saved !== 'fr') {
            saved = 'ar';
        }

        applyLang(saved);

        document.querySelectorAll('.lang-switch__btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                applyLang(btn.getAttribute('data-lang') || 'ar');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
