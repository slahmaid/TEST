/**
 * Load gtag.js and configure Google Tag + Google Ads conversion ID.
 */
(function (w, d) {
    'use strict';

    if (w.__prumyslGoogleAdsInit) return;
    w.__prumyslGoogleAdsInit = true;

    var cfg = w.PRUMYSL_GOOGLE_ADS || {};
    var gtId = cfg.googleTagId || 'GT-KDQ5746N';
    var awId = cfg.conversionId || 'AW-18332173824';

    w.dataLayer = w.dataLayer || [];
    function gtag() { w.dataLayer.push(arguments); }
    w.gtag = w.gtag || gtag;
    gtag('js', new Date());

    var s = d.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gtId);
    (d.head || d.documentElement).appendChild(s);

    gtag('config', gtId);
    if (awId && awId !== gtId) gtag('config', awId);
})(typeof window !== 'undefined' ? window : this, typeof document !== 'undefined' ? document : {});
