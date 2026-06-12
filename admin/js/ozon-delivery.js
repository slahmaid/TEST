/**
 * Ozon Express — admin UI (calls Google Apps Script proxy, not Ozon directly).
 */
(function (global) {
    var citiesCache = null;
    var citiesPromise = null;
    var scriptUrl = '';

    var CITY_ALIASES = {
        'الدار البيضاء': 'casablanca',
        'كازا': 'casablanca',
        'casa': 'casablanca',
        'الرباط': 'rabat',
        'سلا': 'sale',
        'القنيطرة': 'kenitra',
        'مراكش': 'marrakech',
        'فاس': 'fes',
        'طنجة': 'tanger',
        'أكادير': 'agadir',
        'مكناس': 'meknes',
        'وجدة': 'oujda',
        'تطوان': 'tetouan',
        'الجديدة': 'el jadida',
        'خريبكة': 'khouribga',
        'بني ملال': 'beni mellal',
        'آسفي': 'safi',
        'الناظور': 'nador',
        'العيون': 'laayoune'
    };

    function normalizeSearch(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[^\w\s\u0600-\u06FF-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function aliasForCity(text) {
        var n = normalizeSearch(text);
        if (CITY_ALIASES[n]) return CITY_ALIASES[n];
        var keys = Object.keys(CITY_ALIASES);
        for (var i = 0; i < keys.length; i++) {
            if (n.indexOf(normalizeSearch(keys[i])) !== -1) return CITY_ALIASES[keys[i]];
        }
        return n.replace(/[^a-z0-9\s-]/g, '').trim();
    }

    function parseApiResponse(r) {
        return r.text().then(function (text) {
            var body = (text || '').trim();
            if (!body) throw new Error('استجابة فارغة من الخادم');
            try {
                return JSON.parse(body);
            } catch (err) {
                if (body.indexOf('Prumysl orders endpoint') !== -1) {
                    throw new Error(
                        'نشر Google Script قديم: افتح Apps Script → الصق أحدث ملف all-orders.gs من GitHub → Deploy → إصدار جديد، ثم جرّب التحديث مرة أخرى.'
                    );
                }
                throw new Error('استجابة غير صالحة من الخادم: ' + body.slice(0, 80));
            }
        });
    }

    function apiGet(params) {
        if (!scriptUrl) return Promise.reject(new Error('ORDERS_SCRIPT_URL غير مُعرّف'));
        var qs = new URLSearchParams(params);
        return fetch(scriptUrl + '?' + qs.toString(), { method: 'GET', credentials: 'omit' })
            .then(parseApiResponse);
    }

    function loadCities(force) {
        if (citiesCache && !force) return Promise.resolve(citiesCache);
        if (citiesPromise && !force) return citiesPromise;
        citiesPromise = apiGet({ action: 'ozon_cities' })
            .then(function (data) {
                if (!data || data.status !== 'ok' || !data.cities) {
                    throw new Error((data && data.message) || 'تعذر تحميل مدن Ozon');
                }
                citiesCache = data.cities;
                return citiesCache;
            })
            .finally(function () { citiesPromise = null; });
        return citiesPromise;
    }

    function guessCityId(cityText, cities) {
        if (!cities || !cities.length) return '';
        var alias = aliasForCity(cityText);
        var raw = normalizeSearch(cityText);

        function score(c) {
            var name = normalizeSearch(c.name);
            if (name === raw || name === alias) return 100;
            if (alias && name.indexOf(alias) !== -1) return 80 - name.length * 0.01;
            if (raw && name.indexOf(raw) !== -1) return 70;
            if (raw && raw.indexOf(name) !== -1) return 65;
            return 0;
        }

        var best = null;
        var bestScore = 0;
        cities.forEach(function (c) {
            var s = score(c);
            if (s > bestScore) {
                bestScore = s;
                best = c;
            }
        });
        return best && bestScore >= 65 ? best.id : '';
    }

    function formatPhoneDisplay(phone) {
        var p = String(phone || '').replace(/\D/g, '');
        if (p.indexOf('212') === 0 && p.length >= 12) return '0' + p.slice(3);
        if (p.length === 9 && (p.charAt(0) === '6' || p.charAt(0) === '7')) return '0' + p;
        return p;
    }

    function buildAddress(order) {
        if (order.address && String(order.address).trim()) return String(order.address).trim();
        var parts = [];
        if (order.city) parts.push(String(order.city).trim());
        if (order.notes) parts.push(String(order.notes).trim());
        return parts.join('، ') || '';
    }

    function normalizeOzonAddress(address, opts) {
        opts = opts || {};
        var a = String(address || '').replace(/\s+/g, ' ').trim();
        var city = String(opts.city || '').trim();

        if (!a) {
            return { ok: false, address: '', error: 'العنوان مطلوب.' };
        }

        if (city && normalizeSearch(a) === normalizeSearch(city)) {
            return {
                ok: false,
                address: a,
                error: 'أضف الحي والشارع (اسم المدينة وحده غير كافٍ لـ Ozon).'
            };
        }

        return { ok: true, address: a };
    }

    function declaredValueForPrice(price) {
        var p = Number(price);
        if (isNaN(p)) return '';
        if (p === 0 || p > 5000) return String(Math.max(50, Math.round(p) || 50));
        return '';
    }

    function extractOzonBlock(oz) {
        if (!oz) return null;
        return oz['ADD-PARCEL'] || oz['add-parcel'] || oz.ADD_PARCEL || oz;
    }

    function extractOzonNewParcel(block) {
        if (!block) return null;
        return block['NEW-PARCEL'] || block['NEW_PARCEL'] || block.newParcel || null;
    }

    function trackingFromObject(obj) {
        if (!obj || typeof obj !== 'object') return '';
        if (obj['TRACKING-NUMBER']) return String(obj['TRACKING-NUMBER']);
        if (obj.TRACKING_NUMBER) return String(obj.TRACKING_NUMBER);
        if (obj.trackingNumber) return String(obj.trackingNumber);
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            if (String(keys[i]).toUpperCase().replace(/-/g, '_') === 'TRACKING_NUMBER') {
                return String(obj[keys[i]]);
            }
        }
        return '';
    }

    function isOzonSuccess(result) {
        if (!result) return false;
        if (result.status === 'ok') return true;
        var oz = result.ozon;
        if (typeof oz === 'string') {
            try { oz = JSON.parse(oz); } catch (e) { return false; }
        }
        var block = extractOzonBlock(oz);
        return block && String(block.RESULT || block.result || '').toUpperCase() === 'SUCCESS';
    }

    function extractTracking(result) {
        if (!result) return '';
        if (result.tracking) return String(result.tracking);
        var oz = result.ozon;
        if (!oz) return '';
        if (typeof oz === 'string') {
            try { oz = JSON.parse(oz); } catch (e) { return ''; }
        }
        var block = extractOzonBlock(oz);
        var newParcel = extractOzonNewParcel(block);
        var sources = [newParcel, block, oz];
        for (var i = 0; i < sources.length; i++) {
            var t = trackingFromObject(sources[i]);
            if (t) return t;
        }
        return '';
    }

    function extractErrorMessage(result) {
        if (!result) return '';
        if (isOzonSuccess(result)) return '';
        if (result.message && result.status === 'error') return String(result.message);
        var oz = result.ozon;
        if (typeof oz === 'string') {
            try { oz = JSON.parse(oz); } catch (e) { return ''; }
        }
        if (!oz) return '';
        var block = extractOzonBlock(oz);
        if (!block) return '';
        var r = String(block.RESULT || block.result || '').toUpperCase();
        if (r === 'SUCCESS') return '';
        if (r === 'ERROR') return String(block.MESSAGE || block.message || '');
        return '';
    }

    function pushParcel(formData) {
        var params = { action: 'ozon_add_parcel' };
        Object.keys(formData).forEach(function (k) {
            if (formData[k] != null && formData[k] !== '') params[k] = String(formData[k]);
        });
        return apiGet(params);
    }

    function testApi() {
        return apiGet({ action: 'ozon_test' });
    }

    function walkForStatus(obj, depth) {
        if (!obj || depth > 6) return '';
        if (typeof obj === 'string') {
            var s = obj.trim();
            return s.length > 2 && s.length < 120 ? s : '';
        }
        if (typeof obj !== 'object') return '';
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var ku = String(k).toUpperCase().replace(/-/g, '_');
            if (ku === 'STATUS' || ku === 'SITUATION' || ku === 'STATUT' || ku === 'PARCEL_STATUS') {
                var v = obj[k];
                if (typeof v === 'string' && v.trim()) return v.trim();
                if (typeof v === 'number') return String(v);
            }
        }
        for (var j = 0; j < keys.length; j++) {
            var nested = walkForStatus(obj[keys[j]], depth + 1);
            if (nested) return nested;
        }
        return '';
    }

    function isDeliveredLabel(label) {
        var n = normalizeSearch(label);
        if (!n) return false;
        return n.indexOf('livre') !== -1 || n.indexOf('delivered') !== -1 ||
            n.indexOf('livr') !== -1 || n.indexOf('مسلم') !== -1 || n.indexOf('تم التسليم') !== -1;
    }

    function fetchParcelStatus(tracking) {
        return apiGet({ action: 'ozon_parcel_status', tracking: String(tracking || '').trim() });
    }

    function parseStatusLabel(result) {
        if (!result || result.status !== 'ok') return '';
        if (result.ozonStatus) return String(result.ozonStatus);
        if (result.ozon) {
            var fromOzon = walkForStatus(result.ozon, 0);
            if (fromOzon) return fromOzon;
        }
        return '';
    }

    function fillCitySelect(selectEl, cities, selectedId) {
        if (!selectEl) return;
        var opts = ['<option value="">— اختر مدينة Ozon —</option>'];
        cities.forEach(function (c) {
            var sel = selectedId && String(selectedId) === String(c.id) ? ' selected' : '';
            opts.push('<option value="' + c.id + '"' + sel + '>' + c.name + ' (#' + c.id + ')</option>');
        });
        selectEl.innerHTML = opts.join('');
    }

    function filterCitySelect(selectEl, query, cities) {
        var q = normalizeSearch(query);
        if (!q) {
            fillCitySelect(selectEl, cities, selectEl.value);
            return;
        }
        var filtered = cities.filter(function (c) {
            return normalizeSearch(c.name).indexOf(q) !== -1 || String(c.id).indexOf(q) !== -1;
        });
        if (filtered.length > 80) filtered = filtered.slice(0, 80);
        fillCitySelect(selectEl, filtered, selectEl.value);
    }

    global.PrOzonDelivery = {
        init: function (url) {
            scriptUrl = String(url || '').replace(/\?$/, '');
        },
        loadCities: loadCities,
        guessCityId: guessCityId,
        formatPhoneDisplay: formatPhoneDisplay,
        buildAddress: buildAddress,
        normalizeOzonAddress: normalizeOzonAddress,
        declaredValueForPrice: declaredValueForPrice,
        pushParcel: pushParcel,
        testApi: testApi,
        isOzonSuccess: isOzonSuccess,
        extractTracking: extractTracking,
        extractErrorMessage: extractErrorMessage,
        fillCitySelect: fillCitySelect,
        filterCitySelect: filterCitySelect,
        fetchParcelStatus: fetchParcelStatus,
        parseStatusLabel: parseStatusLabel,
        isDeliveredLabel: isDeliveredLabel
    };
})(typeof window !== 'undefined' ? window : globalThis);
