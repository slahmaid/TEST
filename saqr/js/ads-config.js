/**
 * Toggle paid ad conversion tracking per product.
 * Set *Active to true only while that product's TikTok/Meta campaign is running.
 */
(function (global) {
    global.PRUMYSL_ADS = global.PRUMYSL_ADS || {
        saqrActive: false,
        projectorsActive: false,
        mokaActive: false,
        mokaProMaxActive: false
    };
    global.prumyslSaqrAdsActive = function () {
        return !!(global.PRUMYSL_ADS && global.PRUMYSL_ADS.saqrActive);
    };
    global.prumyslProjectorsAdsActive = function () {
        return !!(global.PRUMYSL_ADS && global.PRUMYSL_ADS.projectorsActive);
    };
    global.prumyslMokaAdsActive = function () {
        return !!(global.PRUMYSL_ADS && global.PRUMYSL_ADS.mokaActive);
    };
    global.prumyslMokaProMaxAdsActive = function () {
        return !!(global.PRUMYSL_ADS && global.PRUMYSL_ADS.mokaProMaxActive);
    };
})(typeof window !== 'undefined' ? window : this);
