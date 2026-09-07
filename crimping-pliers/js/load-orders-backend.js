/**
 * Loads Prumysl order backend: Google Sheet + Admin panel (no Firebase).
 * Usage (from product folder): <script src="js/load-orders-backend.js"></script>
 * Usage (from site root):       <script src="js/load-orders-backend.js" data-base="../js/"></script>
 */
(function () {
    var script = document.currentScript;
    var base = (script && script.getAttribute('data-base')) || 'js/';
    if (base.slice(-1) !== '/') base += '/';

    var appChain = [
        base + 'phone-ma.js',
        base + 'orders-sheet.js',
        base + 'orders-backend.js'
    ];

    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = url;
            s.async = false;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error(url)); };
            document.head.appendChild(s);
        });
    }

    function loadSequential(urls, start) {
        var i = start || 0;
        if (i >= urls.length) return Promise.resolve();
        return loadScript(urls[i]).then(function () {
            return loadSequential(urls, i + 1);
        });
    }

    loadSequential(appChain, 0)
        .then(function () {
            document.dispatchEvent(new CustomEvent('prumysl-orders-ready'));
        })
        .catch(function (err) {
            console.warn('[Prumysl] Order backend load issue:', err && err.message ? err.message : err);
            document.dispatchEvent(new CustomEvent('prumysl-orders-ready'));
        });
})();
