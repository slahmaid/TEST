(function () {
    'use strict';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.querySelectorAll('.reveal').forEach(function (el) {
            el.classList.add('is-visible');
        });
        return;
    }

    var SELECTORS = [
        '.home-hero',
        '.hero-section',
        '.section-divider',
        '.section-head',
        '.feature-box',
        '.feature-row',
        '.review-card',
        '.gallery-item',
        '.product-card',
        '.benefit-card',
        '.use-case-card',
        '.step-card',
        '.trust-item',
        '.faq-item',
        '.order-form',
        '.hero-price-bar',
        '.trust-strip',
        '.home-video-wrap',
        '.short-video-embed'
    ].join(',');

    function init() {
        var nodes = document.querySelectorAll(SELECTORS);
        if (!nodes.length) {
            return;
        }

        nodes.forEach(function (el, index) {
            el.classList.add('reveal');
            el.style.setProperty('--reveal-delay', String((index % 5) * 70) + 'ms');
        });

        if (!('IntersectionObserver' in window)) {
            nodes.forEach(function (el) {
                el.classList.add('is-visible');
            });
            return;
        }

        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
        );

        nodes.forEach(function (el) {
            observer.observe(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
