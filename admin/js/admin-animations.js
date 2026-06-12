/**
 * Prumysl Admin — GSAP motion (respects prefers-reduced-motion)
 */
(function (global) {
    var reduced = false;
    var mm = null;

    function init() {
        reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (global.gsap && global.gsap.defaults) {
            global.gsap.defaults({ ease: 'power3.out', duration: reduced ? 0 : 0.55 });
        }
    }

    function dur(fast) {
        if (reduced) return 0;
        return fast ? 0.35 : 0.55;
    }

    function animateLoginEnter() {
        if (!global.gsap || reduced) return;
        var card = document.querySelector('.login-card');
        var brand = document.querySelector('.login-brand');
        var fields = document.querySelectorAll('.login-card .form-group');
        if (!card) return;

        global.gsap.set(card, { autoAlpha: 0, y: 28, scale: 0.97 });
        if (brand) global.gsap.set(brand, { autoAlpha: 0, y: -12 });
        global.gsap.set(fields, { autoAlpha: 0, y: 16 });

        var tl = global.gsap.timeline();
        tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.65, ease: 'power3.out' });
        if (brand) tl.to(brand, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.35');
        tl.to(fields, { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.4 }, '-=0.3');
    }

    function animateDashboardEnter() {
        if (!global.gsap || reduced) return;
        var sidebar = document.querySelector('.admin-sidebar');
        var header = document.querySelector('.admin-topbar');
        var stats = document.querySelectorAll('.stat-card');
        var toolbar = document.querySelector('.toolbar');
        var panel = document.querySelector('.orders-panel');

        var targets = [sidebar, header, toolbar, panel].filter(Boolean);
        global.gsap.set(targets, { autoAlpha: 0, y: 18 });
        global.gsap.set(stats, { autoAlpha: 0, y: 22, scale: 0.96 });

        var tl = global.gsap.timeline();
        if (sidebar) {
            global.gsap.set(sidebar, { autoAlpha: 0, x: 24 });
            tl.to(sidebar, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'power2.out' });
        }
        if (header) tl.to(header, { autoAlpha: 1, y: 0, duration: 0.45 }, '-=0.25');
        tl.to(stats, { autoAlpha: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.45, ease: 'back.out(1.4)' }, '-=0.2');
        if (toolbar) tl.to(toolbar, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.15');
        if (panel) tl.to(panel, { autoAlpha: 1, y: 0, duration: 0.5 }, '-=0.2');
    }

    function animateStatValues(prev, next, els) {
        if (!global.gsap || reduced || !els) return;
        var keys = ['total', 'new', 'today', 'revenue'];
        keys.forEach(function (key, i) {
            var el = els[key];
            if (!el) return;
            var from = Number(prev[key]) || 0;
            var to = Number(next[key]) || 0;
            if (from === to) {
                el.textContent = key === 'revenue' ? to.toLocaleString('ar-MA') : String(to);
                return;
            }
            var obj = { val: from };
            global.gsap.to(obj, {
                val: to,
                duration: 0.6,
                ease: 'power2.out',
                onUpdate: function () {
                    var v = Math.round(obj.val);
                    el.textContent = key === 'revenue' ? v.toLocaleString('ar-MA') : String(v);
                }
            });
            global.gsap.fromTo(el.parentElement, { scale: 1 }, { scale: 1.03, duration: 0.15, yoyo: true, repeat: 1 }, 0);
        });
    }

    function animateTableRows() {
        if (!global.gsap || reduced) return;
        var rows = document.querySelectorAll('#ordersBody tr');
        if (!rows.length) return;
        global.gsap.from(rows, {
            autoAlpha: 0,
            x: 24,
            duration: 0.35,
            stagger: 0.04,
            ease: 'power2.out',
            clearProps: 'transform'
        });
    }

    function crossfadeViews(hideEl, showEl, onComplete) {
        if (!global.gsap || reduced) {
            if (hideEl) hideEl.classList.add('hidden');
            if (showEl) showEl.classList.remove('hidden');
            if (onComplete) onComplete();
            return;
        }
        var tl = global.gsap.timeline({ onComplete: onComplete });
        if (hideEl && !hideEl.classList.contains('hidden')) {
            tl.to(hideEl, {
                autoAlpha: 0,
                y: -12,
                duration: 0.25,
                clearProps: 'transform',
                onComplete: function () {
                    hideEl.classList.add('hidden');
                    if (global.gsap) global.gsap.set(hideEl, { clearProps: 'transform' });
                }
            });
        } else if (hideEl) {
            hideEl.classList.add('hidden');
        }
        if (showEl) {
            showEl.classList.remove('hidden');
            global.gsap.set(showEl, { autoAlpha: 0, y: 16 });
            tl.to(showEl, {
                autoAlpha: 1,
                y: 0,
                duration: 0.4,
                ease: 'power3.out',
                clearProps: 'transform'
            }, '-=0.05');
        }
    }

    function shakeError(el) {
        if (!global.gsap || !el || reduced) return;
        global.gsap.fromTo(el, { x: 0 }, { x: 8, duration: 0.06, repeat: 5, yoyo: true, ease: 'power1.inOut' });
    }

    function loadingPulse(el) {
        if (!global.gsap || !el || reduced) return;
        global.gsap.to(el, { opacity: 0.45, duration: 0.7, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }

    function killLoadingPulse(el) {
        if (!global.gsap || !el) return;
        global.gsap.killTweensOf(el);
        global.gsap.set(el, { opacity: 1 });
    }

    init();

    global.PrAdminAnim = {
        animateLoginEnter: animateLoginEnter,
        animateDashboardEnter: animateDashboardEnter,
        animateStatValues: animateStatValues,
        animateTableRows: animateTableRows,
        crossfadeViews: crossfadeViews,
        shakeError: shakeError,
        loadingPulse: loadingPulse,
        killLoadingPulse: killLoadingPulse
    };
})(typeof window !== 'undefined' ? window : this);
