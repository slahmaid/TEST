/**
 * Loads Prumysl order backend: Firebase SDK + config + Firestore + Google Sheet.
 * Usage (from product folder): <script src="js/load-orders-backend.js"></script>
 * Usage (from site root):       <script src="js/load-orders-backend.js" data-base="../js/"></script>
 */
(function () {
    var script = document.currentScript;
    var base = (script && script.getAttribute('data-base')) || 'js/';
    if (base.slice(-1) !== '/') base += '/';

    var FIREBASE_VERSION = '10.14.1';
    var sdkUrls = [
        'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-firestore-compat.js'
    ];

    function firebaseConfigUrls() {
        var urls = [
            base + 'firebase-config.js',
            '/js/firebase-config.js',
            'https://slahmaid.github.io/TEST/js/firebase-config.js'
        ];
        var seen = {};
        return urls.filter(function (u) {
            if (seen[u]) return false;
            seen[u] = true;
            return true;
        });
    }

    var appChain = [
        base + 'phone-ma.js',
        base + 'orders-firebase.js',
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

    function loadFirebaseConfig() {
        var urls = firebaseConfigUrls();
        var idx = 0;
        function tryNext() {
            if (idx >= urls.length) {
                console.warn('[Prumysl] Missing firebase-config.js — copy firebase-config.example.js or deploy via GitHub Actions secrets');
                return Promise.resolve();
            }
            return loadScript(urls[idx]).catch(function () {
                idx += 1;
                return tryNext();
            });
        }
        return tryNext();
    }

    function loadSequential(urls, start) {
        var i = start || 0;
        if (i >= urls.length) {
            return Promise.resolve();
        }
        return loadScript(urls[i]).catch(function (err) {
            if (i < 2) {
                console.warn('[Prumysl] Firebase SDK failed to load');
            }
            throw err;
        }).then(function () {
            return loadSequential(urls, i + 1);
        });
    }

    loadSequential(sdkUrls, 0)
        .then(loadFirebaseConfig)
        .then(function () { return loadSequential(appChain, 0); })
        .then(function () {
            document.dispatchEvent(new CustomEvent('prumysl-orders-ready'));
        })
        .catch(function () {
            document.dispatchEvent(new CustomEvent('prumysl-orders-ready'));
        });
})();
