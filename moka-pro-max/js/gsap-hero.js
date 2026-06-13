(function () {
    'use strict';

    if (typeof gsap === 'undefined') {
        return;
    }

    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
        var homeHero = document.querySelector('.home-hero');
        if (homeHero) {
            var h1 = homeHero.querySelector('h1');
            var lead = homeHero.querySelector('p');
            var pills = homeHero.querySelectorAll('.hero-pill');
            var targets = [h1, lead].filter(Boolean);

            if (targets.length) {
                gsap.from(targets, {
                    y: 32,
                    autoAlpha: 0,
                    duration: 0.85,
                    stagger: 0.14,
                    ease: 'power3.out'
                });
            }

            if (pills.length) {
                gsap.from(pills, {
                    y: 18,
                    autoAlpha: 0,
                    duration: 0.55,
                    stagger: 0.07,
                    delay: 0.28,
                    ease: 'power2.out'
                });
            }
            return;
        }

        var heroSection = document.querySelector('.hero-section');
        if (heroSection) {
            var heroImg = heroSection.querySelector('img, picture');
            if (heroImg) {
                gsap.from(heroImg, {
                    y: 24,
                    autoAlpha: 0,
                    duration: 0.8,
                    ease: 'power3.out'
                });
            }
        }

        var orderBits = document.querySelectorAll(
            '.order-title, .order-subtitle, .urgency-box, .hero-price-bar'
        );
        if (orderBits.length) {
            gsap.from(orderBits, {
                y: 28,
                autoAlpha: 0,
                duration: 0.75,
                stagger: 0.1,
                delay: 0.12,
                ease: 'power2.out'
            });
        }
    });
})();
