(function () {
    var root = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this;

    var STATUS_LABELS = {
        new: 'جديد',
        confirmed: 'مؤكد',
        shipped: 'قيد الشحن',
        delivered: 'تم التسليم',
        cancelled: 'ملغي'
    };

    var SOURCE_SHORT = {
        'admin-phone': 'هاتف',
        'admin-whatsapp': 'واتساب',
        'admin-store': 'معرض',
        'admin-manual': 'يدوي'
    };

    var ORDERS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwFR6sq_iWRbW47Nab2rwvyz43nva1BZdWiB_ZirRxXlQBz4LbWk83Vx1ej2ed2TYbC/exec';
    var SHEET_SYNC_INTERVAL_MS_DEFAULT = 45000;
    var SHEET_SYNC_LOOKBACK_ROWS = 60;
    var SHEET_SYNC_STATE_KEY = 'prumysl_sheet_sync_last_row';
    var SHEET_ZERO_RESET_DONE_KEY = 'prumysl_sheet_zero_reset_done_v1';
    var sheetSyncTimer = null;
    var sheetSyncBusy = false;
    var sheetSyncFirstRun = true;

    var ADMIN_EXCLUDED_PRODUCTS = { 'بروجيكتور شمسي': true };

    function isExcludedAdminProduct(name) {
        return !!ADMIN_EXCLUDED_PRODUCTS[String(name || '').trim()];
    }

    var PRODUCT_CATALOG = [
        { name: 'كاميرا موكا', unitPrice: 599 },
        { name: 'موكا برو ماكس', unitPrice: 699 },
        { name: 'كاميرا الصقر', unitPrice: 1999 },
        { name: 'بروجيكتور شمسي 300 واط', unitPrice: 699 },
        { name: 'بروجيكتور شمسي 400 واط', unitPrice: 799 },
        { name: 'منتج مخصص', unitPrice: null }
    ];

    var VIEW_TITLES = {
        orders: { title: 'إدارة الطلبات', subtitle: 'عرض وتعديل جميع الطلبات' },
        manual: { title: 'طلب يدوي', subtitle: 'إدخال طلب هاتفي أو واتساب' },
        ozon: { title: 'Ozon Express', subtitle: 'طلبات مُرسلة إلى Ozon وحالة التتبع' },
        inventory: { title: 'مخزون المنتجات', subtitle: 'كميات متبقية حسب الطلبات — يتحدّث مع كل طلب' }
    };

    var auth = null;
    var db = null;
    var unsubscribe = null;
    var allOrders = [];
    var selectedIds = new Set();
    var detailOrderId = null;
    var lastStats = { total: 0, new: 0, today: 0, revenue: 0 };
    var dashboardAnimated = false;
    var currentView = 'orders';

    var loginView = document.getElementById('loginView');
    var dashboardView = document.getElementById('dashboardView');
    var configWarn = document.getElementById('configWarn');
    var loginForm = document.getElementById('loginForm');
    var loginError = document.getElementById('loginError');
    var logoutBtn = document.getElementById('logoutBtn');
    var logoutBtnSidebar = document.getElementById('logoutBtnSidebar');
    var exportBtn = document.getElementById('exportBtn');
    var refreshBtn = document.getElementById('refreshBtn');
    var newOrderBtn = document.getElementById('newOrderBtn');
    var userEmailSidebar = document.getElementById('userEmailSidebar');
    var ordersBody = document.getElementById('ordersBody');
    var ordersCards = document.getElementById('ordersCards');
    var ordersLoading = document.getElementById('ordersLoading');
    var ordersEmpty = document.getElementById('ordersEmpty');
    var ordersCountBadge = document.getElementById('ordersCountBadge');
    var filterSearch = document.getElementById('filterSearch');
    var filterStatus = document.getElementById('filterStatus');
    var filterProduct = document.getElementById('filterProduct');
    var filterDate = document.getElementById('filterDate');
    var statTotal = document.getElementById('statTotal');
    var statNew = document.getElementById('statNew');
    var statToday = document.getElementById('statToday');
    var statRevenue = document.getElementById('statRevenue');
    var productChips = document.getElementById('productChips');
    var bulkBar = document.getElementById('bulkBar');
    var bulkCount = document.getElementById('bulkCount');
    var selectAllOrders = document.getElementById('selectAllOrders');
    var toastHost = document.getElementById('toastHost');
    var pageTitle = document.getElementById('pageTitle');
    var pageSubtitle = document.getElementById('pageSubtitle');
    var sheetSyncStatus = document.getElementById('sheetSyncStatus');
    var viewOrders = document.getElementById('viewOrders');
    var viewManual = document.getElementById('viewManual');
    var viewOzon = document.getElementById('viewOzon');
    var viewInventory = document.getElementById('viewInventory');
    var manualOrderForm = document.getElementById('manualOrderForm');
    var manualProduct = document.getElementById('manualProduct');
    var manualPrice = document.getElementById('manualPrice');
    var manualQty = document.getElementById('manualQty');
    var manualFormError = document.getElementById('manualFormError');
    var manualResetBtn = document.getElementById('manualResetBtn');
    var ozonStatsGrid = document.getElementById('ozonStatsGrid');
    var ozonOrdersBody = document.getElementById('ozonOrdersBody');
    var ozonEmpty = document.getElementById('ozonEmpty');
    var ozonCountBadge = document.getElementById('ozonCountBadge');
    var ozonFilterSearch = document.getElementById('ozonFilterSearch');
    var ozonFilterLocal = document.getElementById('ozonFilterLocal');
    var orderDetailModal = document.getElementById('orderDetailModal');
    var orderDetailBody = document.getElementById('orderDetailBody');
    var mobileBottomNav = document.getElementById('mobileBottomNav');
    var mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    var filterToggle = document.getElementById('filterToggle');
    var filterPanel = document.getElementById('filterPanel');
    var ozonPushModal = document.getElementById('ozonPushModal');
    var ozonPushForm = document.getElementById('ozonPushForm');
    var ozonFormError = document.getElementById('ozonFormError');
    var ozonExistingTracking = document.getElementById('ozonExistingTracking');
    var ozonCitySearch = document.getElementById('ozonCitySearch');
    var ozonCityId = document.getElementById('ozonCityId');
    var ozonOrderId = null;
    var ozonCitiesList = [];

    var anim = window.PrAdminAnim;
    var ozonApi = window.PrOzonDelivery;
    var inventoryMod = window.PrAdminInventory;

    function toast(msg, type) {
        if (!toastHost) return;
        var el = document.createElement('div');
        el.className = 'toast' + (type ? ' toast-' + type : '');
        el.textContent = msg;
        toastHost.appendChild(el);
        if (window.gsap) {
            gsap.fromTo(el, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35 });
            gsap.to(el, {
                autoAlpha: 0,
                y: -8,
                delay: 3.2,
                duration: 0.3,
                onComplete: function () { el.remove(); }
            });
        } else {
            setTimeout(function () { el.remove(); }, 3200);
        }
    }

    function getAdminConfig() {
        return root.PRUMYSL_ADMIN_CONFIG || {};
    }

    function getSheetSyncIntervalMs() {
        var cfg = getAdminConfig();
        var raw = Number(cfg.sheetSyncIntervalMs);
        if (!raw || isNaN(raw)) return SHEET_SYNC_INTERVAL_MS_DEFAULT;
        return Math.max(10000, raw);
    }

    function updateSheetSyncStatus(message, state) {
        if (!sheetSyncStatus) return;
        var suffix = '';
        if (state === 'ok') suffix = '✅';
        else if (state === 'error') suffix = '⚠️';
        else if (state === 'syncing') suffix = '⏳';
        sheetSyncStatus.textContent = 'مزامنة Google Sheet: ' + (message || '—') + (suffix ? ' ' + suffix : '');
    }

    function formatClockTime(d) {
        return d.toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function getConfig() {
        return root.PRUMYSL_FIREBASE_CONFIG || null;
    }

    function isConfigured(cfg) {
        if (!cfg || !cfg.apiKey || !cfg.projectId) return false;
        if (String(cfg.apiKey).indexOf('YOUR_') === 0) return false;
        return true;
    }

    function initFirebase() {
        var cfg = getConfig();
        if (typeof firebase === 'undefined') {
            if (configWarn) {
                configWarn.textContent = 'تعذر تحميل Firebase SDK. تحقق من الاتصال بالإنترنت.';
                configWarn.classList.remove('hidden');
            }
            return false;
        }
        if (!isConfigured(cfg)) {
            if (configWarn) configWarn.classList.remove('hidden');
            return false;
        }
        if (configWarn) configWarn.classList.add('hidden');
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        auth = firebase.auth();
        db = firebase.firestore();
        return true;
    }

    function firestoreErrorMessage(err) {
        var code = err && err.code ? err.code : '';
        if (code === 'permission-denied') {
            return 'صلاحيات Firestore مرفوضة. انشر القواعد من firebase/firestore.rules في Firebase Console ثم جرّب مرة أخرى.';
        }
        if (code === 'unavailable') {
            return 'Firestore غير متاح. تحقق من الاتصال بالإنترنت.';
        }
        if (code === 'failed-precondition' && String(err.message || '').indexOf('index') !== -1) {
            return 'مطلوب فهرس Firestore — افتح الرابط في رسالة الخطأ في Console المتصفح وأنشئ الفهرس.';
        }
        return (err && err.message) ? err.message : 'خطأ غير معروف';
    }

    function formatDate(ts) {
        if (!ts || !ts.toDate) return '—';
        return ts.toDate().toLocaleString('ar-MA', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function formatDateShort(ts) {
        if (!ts || !ts.toDate) return '—';
        var d = ts.toDate();
        var day = String(d.getDate()).padStart(2, '0');
        var mon = String(d.getMonth() + 1).padStart(2, '0');
        var h = String(d.getHours()).padStart(2, '0');
        var min = String(d.getMinutes()).padStart(2, '0');
        return day + '/' + mon + ' ' + h + ':' + min;
    }

    function formatPrice(price) {
        if (price == null || price === '') return '—';
        return Number(price).toLocaleString('ar-MA') + ' د.م';
    }

    function formatPriceCompact(price) {
        if (price == null || price === '') return '—';
        return Number(price).toLocaleString('ar-MA');
    }

    function truncateText(str, max) {
        var s = String(str || '');
        if (s.length <= max) return s;
        return s.slice(0, max - 1) + '…';
    }

    function sourceBadgeHtml(source) {
        if (!source) return '';
        var label = SOURCE_SHORT[source] || source.replace(/^admin-/, '').slice(0, 6);
        return '<span class="src-badge" title="' + escapeAttr(source) + '">' + escapeHtml(label) + '</span>';
    }

    function qtyPriceCell(order) {
        var qty = parseInt(order.quantity, 10) || 1;
        var total = order.price != null ? Number(order.price) : null;
        if (total == null || isNaN(total)) {
            return '<span class="cell-amount">×' + qty + '</span>';
        }
        var unit = Math.round(total / qty);
        return '<span class="cell-amount"><span class="cell-amount-qty">' + qty + '×</span>' +
            formatPriceCompact(unit) + '</span>';
    }

    function amountLabel(order) {
        var qty = parseInt(order.quantity, 10) || 1;
        var total = order.price != null ? Number(order.price) : null;
        if (total == null || isNaN(total)) return '×' + qty;
        return qty + '×' + formatPriceCompact(Math.round(total / qty)) + ' د.م';
    }

    function buildTableRowHtml(o) {
        var checked = selectedIds.has(o.id) ? ' checked' : '';
        var rowClass = ' class="order-row' + (o.status === 'new' ? ' row-new' : '') + '"';
        var productTitle = escapeAttr(o.product || '');
        var productShort = escapeHtml(truncateText(o.product, 28));
        var noteFlag = o.notes ? '<span class="note-flag" title="' + escapeAttr(o.notes) + '">●</span>' : '';
        var ozonFlag = o.ozonTracking ? '<span class="ozon-flag" title="Ozon: ' + escapeAttr(o.ozonTracking) + '">O</span>' : '';
        return '<tr data-id="' + o.id + '"' + rowClass + '>' +
            '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + o.id + '"' + checked + '></td>' +
            '<td class="col-date"><time>' + formatDateShort(o.createdAt) + '</time></td>' +
            '<td class="col-client"><span class="client-line">' +
            '<strong class="client-name">' + escapeHtml(o.name) + '</strong>' +
            '<span class="client-meta">' + escapeHtml(o.city) + sourceBadgeHtml(o.source) + '</span></span></td>' +
            '<td class="col-phone"><a class="phone-link phone-link--compact" href="' + telUrl(o.phone) + '" aria-label="اتصال ' + escapeAttr(o.phone) + '">' + escapeHtml(o.phone) + '</a></td>' +
            '<td class="col-product"><span class="cell-ellipsis" title="' + productTitle + '">' + productShort + '</span></td>' +
            '<td class="col-amount">' + qtyPriceCell(o) + '</td>' +
            '<td class="col-status">' + statusSelectHtml(o) + '</td>' +
            '<td class="col-actions actions-cell">' +
            '<div class="row-actions">' + noteFlag + ozonFlag +
            '<button type="button" class="btn-icon btn-view" data-id="' + o.id + '" title="عرض التفاصيل" aria-label="عرض">⎘</button>' +
            '<button type="button" class="btn-icon btn-icon-danger btn-delete" data-id="' + o.id + '" title="حذف" aria-label="حذف">×</button>' +
            '</div></td></tr>';
    }

    function buildOrderCardHtml(o) {
        var checked = selectedIds.has(o.id) ? ' checked' : '';
        var cardClass = 'order-card' + (o.status === 'new' ? ' order-card--new' : '');
        var notesHint = o.notes ? '<span class="order-card__note" title="' + escapeAttr(o.notes) + '">ملاحظة</span>' : '';
        return '<article class="' + cardClass + '" data-id="' + o.id + '">' +
            '<header class="order-card__head">' +
            '<label class="order-card__check"><input type="checkbox" class="row-check" data-id="' + o.id + '"' + checked + ' aria-label="تحديد الطلب"></label>' +
            '<div class="order-card__who"><strong>' + escapeHtml(o.name) + '</strong>' +
            '<span>' + escapeHtml(o.city) + sourceBadgeHtml(o.source) + '</span></div>' +
            '<time class="order-card__date">' + formatDateShort(o.createdAt) + '</time></header>' +
            '<p class="order-card__product">' + escapeHtml(o.product || '—') + notesHint + '</p>' +
            '<div class="order-card__meta">' +
            '<a class="phone-link phone-link--card" href="' + telUrl(o.phone) + '" aria-label="اتصال ' + escapeAttr(o.phone) + '"><i class="fa-solid fa-phone" aria-hidden="true"></i> اتصال ' + escapeHtml(o.phone) + '</a>' +
            '<span class="order-card__amount">' + escapeHtml(amountLabel(o)) + '</span></div>' +
            '<footer class="order-card__foot">' +
            '<div class="order-card__status-wrap">' + statusSelectHtml(o) + '</div>' +
            '<div class="order-card__actions">' +
            '<button type="button" class="btn btn-secondary btn-sm btn-view" data-id="' + o.id + '">تفاصيل</button>' +
            '<button type="button" class="btn btn-danger btn-sm btn-delete" data-id="' + o.id + '">حذف</button>' +
            '</div></footer></article>';
    }

    function syncNavActive(view) {
        document.querySelectorAll('.sidebar-nav a[data-view], .mobile-nav-item[data-view]').forEach(function (el) {
            el.classList.toggle('active', el.dataset.view === view);
        });
    }

    function normalizePhone(phone) {
        if (root.PrumyslPhone && root.PrumyslPhone.normalizeMoroccoPhone) {
            return root.PrumyslPhone.normalizeMoroccoPhone(phone);
        }
        return String(phone || '').replace(/\D/g, '');
    }

    function telUrl(phone) {
        var p = normalizePhone(phone);
        return 'tel:+212' + (p.charAt(0) === '0' ? p.slice(1) : p);
    }

    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function orderTimestamp(o) {
        return o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : 0;
    }

    function isToday(ts) {
        if (!ts || !ts.toDate) return false;
        var d = ts.toDate();
        var now = new Date();
        return d.getDate() === now.getDate() &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();
    }

    function passesDateFilter(o) {
        var mode = filterDate ? filterDate.value : 'all';
        if (mode === 'all') return true;
        var ts = orderTimestamp(o);
        if (!ts) return false;
        var now = Date.now();
        if (mode === 'today') return isToday(o.createdAt);
        if (mode === 'week') return now - ts <= 7 * 24 * 60 * 60 * 1000;
        if (mode === 'month') return now - ts <= 30 * 24 * 60 * 60 * 1000;
        return true;
    }

    function getFilteredOrders() {
        var q = (filterSearch.value || '').trim().toLowerCase();
        var status = filterStatus.value;
        var product = filterProduct.value;

        return allOrders.filter(function (o) {
            if (status && o.status !== status) return false;
            if (product && o.product.indexOf(product) === -1) return false;
            if (!passesDateFilter(o)) return false;
            if (!q) return true;
            var hay = [o.name, o.city, o.phone, o.product, o.notes, o.source].join(' ').toLowerCase();
            return hay.indexOf(q) !== -1;
        });
    }

    function computeStats(orders) {
        var list = orders || allOrders;
        var todayCount = 0;
        var newCount = 0;
        var revenue = 0;
        list.forEach(function (o) {
            if (o.status === 'new') newCount++;
            if (isToday(o.createdAt)) todayCount++;
            if (o.price != null && o.status !== 'cancelled') revenue += Number(o.price) || 0;
        });
        return { total: list.length, new: newCount, today: todayCount, revenue: revenue };
    }

    function updateStats(animate) {
        var stats = computeStats(getFilteredOrders());
        var els = { total: statTotal, new: statNew, today: statToday, revenue: statRevenue };
        if (animate && anim) anim.animateStatValues(lastStats, stats, els);
        else {
            statTotal.textContent = stats.total;
            statNew.textContent = stats.new;
            statToday.textContent = stats.today;
            statRevenue.textContent = stats.revenue.toLocaleString('ar-MA');
        }
        lastStats = stats;
        renderProductChips();
    }

    function renderProductChips() {
        if (!productChips) return;
        var counts = {};
        getFilteredOrders().forEach(function (o) {
            var key = o.product || '—';
            if (isExcludedAdminProduct(key)) return;
            counts[key] = (counts[key] || 0) + 1;
        });
        var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
        if (!keys.length) {
            productChips.innerHTML = '';
            return;
        }
        productChips.innerHTML = keys.slice(0, 8).map(function (k) {
            return '<button type="button" class="product-chip" data-product="' + escapeAttr(k) + '">' +
                escapeHtml(k) + ' <span>' + counts[k] + '</span></button>';
        }).join('');
        productChips.querySelectorAll('.product-chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                filterProduct.value = btn.dataset.product;
                renderTable(false);
            });
        });
    }

    function statusSelectHtml(order) {
        var html = '<select class="status-select status-select--compact" data-id="' + order.id + '">';
        Object.keys(STATUS_LABELS).forEach(function (key) {
            html += '<option value="' + key + '"' + (order.status === key ? ' selected' : '') + '>' + STATUS_LABELS[key] + '</option>';
        });
        return html + '</select>';
    }

    function updateBulkBar() {
        if (!bulkBar) return;
        if (selectedIds.size) {
            bulkBar.classList.remove('hidden');
            bulkCount.textContent = selectedIds.size + ' محدد';
        } else {
            bulkBar.classList.add('hidden');
        }
        if (selectAllOrders) {
            var rows = getFilteredOrders();
            selectAllOrders.checked = rows.length > 0 && rows.every(function (o) { return selectedIds.has(o.id); });
        }
    }

    function renderTable(animateRows) {
        var rows = getFilteredOrders();
        updateStats(true);

        if (ordersCountBadge) ordersCountBadge.textContent = rows.length;

        if (!rows.length) {
            ordersBody.innerHTML = '';
            if (ordersCards) ordersCards.innerHTML = '';
            ordersEmpty.classList.remove('hidden');
            updateBulkBar();
            return;
        }

        ordersEmpty.classList.add('hidden');
        ordersBody.innerHTML = rows.map(buildTableRowHtml).join('');
        if (ordersCards) ordersCards.innerHTML = rows.map(buildOrderCardHtml).join('');

        bindOrderEvents();
        updateBulkBar();
        if (animateRows && anim) anim.animateTableRows();
    }

    function bindOrderEvents() {
        var roots = [ordersBody];
        if (ordersCards) roots.push(ordersCards);

        roots.forEach(function (root) {
            if (!root) return;
            root.querySelectorAll('.status-select').forEach(function (el) {
                el.addEventListener('change', function () {
                    updateOrderField(el.dataset.id, { status: el.value });
                });
            });
            root.querySelectorAll('.order-row, .order-card').forEach(function (row) {
                row.addEventListener('click', function (e) {
                    if (e.target.closest('input, select, button, a, label')) return;
                    openOrderDetail(row.dataset.id);
                });
            });
            root.querySelectorAll('.btn-delete, .btn-view, .row-check, .phone-link, .status-select, .order-card__check').forEach(function (el) {
                el.addEventListener('click', function (e) { e.stopPropagation(); });
            });
            root.querySelectorAll('.btn-delete').forEach(function (el) {
                el.addEventListener('click', function () {
                    if (!confirm('حذف هذا الطلب نهائياً؟')) return;
                    deleteOrder(el.dataset.id);
                });
            });
            root.querySelectorAll('.btn-view').forEach(function (el) {
                el.addEventListener('click', function () { openOrderDetail(el.dataset.id); });
            });
            root.querySelectorAll('.row-check').forEach(function (el) {
                el.addEventListener('change', function () {
                    if (el.checked) selectedIds.add(el.dataset.id);
                    else selectedIds.delete(el.dataset.id);
                    renderTable(false);
                });
            });
        });
    }

    function updateOrderField(id, patch) {
        if (!db || !id) return;
        db.collection('orders').doc(id).update(patch)
            .then(function () { toast('تم التحديث', 'success'); })
            .catch(function (err) { toast('خطأ: ' + (err.message || err), 'error'); });
    }

    function deleteOrder(id) {
        if (!db || !id) return;
        selectedIds.delete(id);
        db.collection('orders').doc(id).delete()
            .then(function () { toast('تم الحذف', 'success'); })
            .catch(function (err) { toast('خطأ: ' + (err.message || err), 'error'); });
    }

    function bulkUpdateStatus(status) {
        var ids = Array.from(selectedIds);
        if (!ids.length) return;
        Promise.all(ids.map(function (id) {
            return db.collection('orders').doc(id).update({ status: status });
        })).then(function () {
            toast('تم تحديث ' + ids.length + ' طلب', 'success');
            selectedIds.clear();
            updateBulkBar();
        }).catch(function (err) { toast('خطأ: ' + err.message, 'error'); });
    }

    function bulkDelete() {
        var ids = Array.from(selectedIds);
        if (!ids.length || !confirm('حذف ' + ids.length + ' طلب؟')) return;
        Promise.all(ids.map(function (id) { return db.collection('orders').doc(id).delete(); }))
            .then(function () {
                toast('تم الحذف', 'success');
                selectedIds.clear();
                updateBulkBar();
            })
            .catch(function (err) { toast('خطأ: ' + err.message, 'error'); });
    }

    function buildOzonPayloadFromOrder(order, cities) {
        if (!order) return { error: 'طلب غير موجود' };
        var cityId = ozonApi.guessCityId(order.city, cities);
        if (!cityId) {
            return { error: 'مدينة Ozon غير معروفة: ' + (order.city || '—') };
        }
        var addrCheck = ozonApi.normalizeOzonAddress(ozonApi.buildAddress(order), {
            city: order.city || '',
            phone: ozonApi.formatPhoneDisplay(order.phone)
        });
        if (!addrCheck.ok) return { error: addrCheck.error };

        var price = order.price != null ? Math.round(Number(order.price)) : 0;
        var payload = {
            'parcel-receiver': String(order.name || '').trim() || 'عميل',
            'parcel-phone': ozonApi.formatPhoneDisplay(order.phone),
            'parcel-city': cityId,
            'parcel-address': addrCheck.address,
            'parcel-price': String(price),
            'parcel-stock': '0'
        };
        var nature = (order.product || '') + (order.quantity > 1 ? ' ×' + order.quantity : '');
        if (nature) payload['parcel-nature'] = nature;
        if (order.notes) payload['parcel-note'] = String(order.notes);
        var declared = ozonApi.declaredValueForPrice(order.price);
        if (declared) payload['parcel-declared-value'] = declared;
        return { payload: payload };
    }

    function bulkPushToOzon() {
        if (!ozonApi || !db) {
            toast('Ozon غير متاح', 'error');
            return;
        }
        var ids = Array.from(selectedIds);
        if (!ids.length) return;

        var orders = ids.map(function (id) {
            return allOrders.find(function (x) { return x.id === id; });
        }).filter(Boolean);

        var pending = orders.filter(function (o) { return !o.ozonTracking; });
        var skipped = orders.length - pending.length;

        if (!pending.length) {
            toast('الطلبات المحددة مُرسلة إلى Ozon مسبقاً', 'error');
            return;
        }

        var msg = 'إرسال ' + pending.length + ' طلب إلى Ozon Express؟\n(راماساج — تأكد من صحة العناوين في الطلبات)';
        if (skipped) msg += '\n(' + skipped + ' طلب لديه تتبع Ozon وسيُتخطى)';
        if (!confirm(msg)) return;

        var btn = document.getElementById('bulkOzonBtn');
        if (btn) btn.disabled = true;
        toast('جاري الإرسال إلى Ozon…', 'success');

        ozonApi.loadCities().then(function (cities) {
            var ok = 0;
            var fail = 0;
            var chain = Promise.resolve();

            pending.forEach(function (order) {
                chain = chain.then(function () {
                    var built = buildOzonPayloadFromOrder(order, cities);
                    if (built.error) {
                        fail++;
                        return;
                    }
                    return ozonApi.pushParcel(built.payload).then(function (result) {
                        if (!ozonApi.isOzonSuccess(result)) {
                            fail++;
                            return;
                        }
                        var tracking = ozonApi.extractTracking(result);
                        var patch = {
                            ozonPushedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            ozonStatus: tracking ? ('مسجّل — ' + tracking) : 'مسجّل في Ozon',
                            status: 'shipped'
                        };
                        if (tracking) patch.ozonTracking = tracking;
                        return db.collection('orders').doc(order.id).update(patch).then(function () {
                            ok++;
                        });
                    }).catch(function () {
                        fail++;
                    });
                });
            });

            return chain.then(function () {
                var summary = 'Ozon: نجح ' + ok + ' من ' + pending.length;
                if (fail) summary += ' — فشل ' + fail;
                toast(summary, fail && !ok ? 'error' : (fail ? 'error' : 'success'));
                selectedIds.clear();
                updateBulkBar();
            });
        }).catch(function (err) {
            toast(err.message || 'تعذر تحميل مدن Ozon', 'error');
        }).finally(function () {
            if (btn) btn.disabled = false;
        });
    }

    function sortOrdersNewestFirst(list) {
        return list.sort(function (a, b) {
            var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });
    }

    function applyOrdersSnapshot(snap) {
        ordersLoading.classList.add('hidden');
        if (anim) anim.killLoadingPulse(ordersLoading);
        allOrders = [];
        snap.forEach(function (doc) {
            var data = doc.data();
            data.id = doc.id;
            if (!data.status) data.status = 'new';
            if (!data.source) data.source = 'google-sheet';
            if (!data.product) data.product = 'طلب من Google Sheet';
            if (!data.quantity || isNaN(parseInt(data.quantity, 10))) data.quantity = 1;
            allOrders.push(data);
        });
        sortOrdersNewestFirst(allOrders);
        renderTable(true);
        if (currentView === 'ozon') renderOzonPage();
        if (inventoryMod) inventoryMod.onOrdersUpdated();
    }

    function subscribeOrders() {
        if (unsubscribe) unsubscribe();
        ordersLoading.classList.remove('hidden');
        ordersEmpty.classList.add('hidden');
        if (anim) anim.loadingPulse(ordersLoading);

        var query = db.collection('orders').orderBy('createdAt', 'desc').limit(5000);
        unsubscribe = query.onSnapshot(function (snap) {
            applyOrdersSnapshot(snap);
        }, function (err) {
            console.error('[Prumysl Admin] orders listener:', err);
            var needsIndex = err && err.code === 'failed-precondition' &&
                String(err.message || '').indexOf('index') !== -1;
            if (needsIndex) {
                unsubscribe = db.collection('orders').limit(5000).onSnapshot(function (snap) {
                    applyOrdersSnapshot(snap);
                    toast('تم تحميل الطلبات (بدون فهرس createdAt). أنشئ الفهرس من رابط Console إن ظهر.', 'error');
                }, function (err2) {
                    ordersLoading.classList.add('hidden');
                    if (anim) anim.killLoadingPulse(ordersLoading);
                    toast(firestoreErrorMessage(err2), 'error');
                });
                return;
            }
            ordersLoading.classList.add('hidden');
            if (anim) anim.killLoadingPulse(ordersLoading);
            toast(firestoreErrorMessage(err), 'error');
        });
    }

    function switchView(view) {
        if (view === 'inventory' && inventoryMod && auth && auth.currentUser &&
            !inventoryMod.isInventoryAdmin(auth.currentUser)) {
            view = 'orders';
        }
        currentView = view;
        syncNavActive(view);
        viewOrders.classList.toggle('hidden', view !== 'orders');
        viewManual.classList.toggle('hidden', view !== 'manual');
        viewOzon.classList.toggle('hidden', view !== 'ozon');
        if (viewInventory) viewInventory.classList.toggle('hidden', view !== 'inventory');
        var meta = VIEW_TITLES[view] || VIEW_TITLES.orders;
        if (pageTitle) pageTitle.textContent = meta.title;
        if (pageSubtitle) pageSubtitle.textContent = meta.subtitle;
        if (view === 'ozon') renderOzonPage();
        if (view === 'inventory' && inventoryMod) inventoryMod.renderInventoryPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function populateProductSelects() {
        var opts = PRODUCT_CATALOG.map(function (p) {
            return '<option value="' + escapeAttr(p.name) + '" data-price="' + (p.unitPrice != null ? p.unitPrice : '') + '">' + escapeHtml(p.name) + '</option>';
        }).join('');

        if (manualProduct) {
            manualProduct.innerHTML = '<option value="">— اختر المنتج —</option>' + opts;
        }
        if (filterProduct) {
            filterProduct.innerHTML = '<option value="">كل المنتجات</option>';
            PRODUCT_CATALOG.forEach(function (p) {
                if (p.name === 'منتج مخصص') return;
                var opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                filterProduct.appendChild(opt);
            });
        }
    }

    function syncManualPriceFromProduct() {
        if (!manualProduct || !manualPrice) return;
        var opt = manualProduct.options[manualProduct.selectedIndex];
        var price = opt ? opt.getAttribute('data-price') : '';
        if (price) manualPrice.value = price;
    }

    function calcLinePrice() {
        var unit = parseFloat(manualPrice.value);
        var qty = parseInt(manualQty.value, 10) || 1;
        if (isNaN(unit)) return null;
        return Math.round(unit * qty);
    }

    function resetManualForm() {
        if (!manualOrderForm) return;
        manualOrderForm.reset();
        if (manualQty) manualQty.value = '1';
        var statusEl = document.getElementById('manualStatus');
        if (statusEl) statusEl.value = 'confirmed';
        var syncEl = document.getElementById('manualSyncSheet');
        if (syncEl) syncEl.checked = true;
        if (manualFormError) manualFormError.textContent = '';
        syncManualPriceFromProduct();
    }

    function submitToSheet(order) {
        if (!ORDERS_SCRIPT_URL) return Promise.resolve();
        var body = new URLSearchParams();
        body.set('name', order.name);
        body.set('city', order.city);
        body.set('phone', order.phone);
        body.set('product', order.product);
        body.set('quantity', String(order.quantity));
        body.set('price', order.price != null ? String(order.price) : '');
        return fetch(ORDERS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: body, keepalive: true }).catch(function () {});
    }

    function parseSheetDateToTimestamp(value) {
        if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.firestore.Timestamp) return null;
        if (!value) return firebase.firestore.FieldValue.serverTimestamp();
        var d = new Date(value);
        if (isNaN(d.getTime())) return firebase.firestore.FieldValue.serverTimestamp();
        return firebase.firestore.Timestamp.fromDate(d);
    }

    function normalizeSheetPhone(phone) {
        if (root.PrumyslPhone && root.PrumyslPhone.normalizeMoroccoPhone) {
            var normalized = root.PrumyslPhone.normalizeMoroccoPhone(phone);
            if (normalized) return normalized;
        }
        var d = String(phone || '').replace(/\D/g, '');
        if (d.length === 12 && d.indexOf('212') === 0) d = '0' + d.slice(3);
        if (d.length === 9 && (d.charAt(0) === '6' || d.charAt(0) === '7')) d = '0' + d;
        return d;
    }

    function isValidSyncPhone(phone) {
        return /^0[67]\d{8}$/.test(String(phone || ''));
    }

    function fallbackSyncPhone(rowNumber) {
        var n = parseInt(rowNumber, 10);
        if (isNaN(n) || n < 0) n = 0;
        return '06' + String(n % 100000000).padStart(8, '0');
    }

    function isEmptySheetRow(row) {
        if (!row) return true;
        var name = String(row.name || '').trim();
        var city = String(row.city || '').trim();
        var phone = String(row.phone || '').trim();
        var product = String(row.product || '').trim();
        var price = row.price;
        var hasPrice = !(price == null || price === '' || isNaN(Number(price)));
        return !name && !city && !phone && !product && !hasPrice;
    }

    function loadSheetRows(fromRow) {
        if (!ORDERS_SCRIPT_URL) return Promise.resolve({ rows: [], lastRow: 1 });
        var url = ORDERS_SCRIPT_URL + '?action=sheet_orders&fromRow=' + encodeURIComponent(String(fromRow || 2));
        return fetch(url, { method: 'GET', cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('Google Sheet HTTP ' + res.status);
                }
                return res.text();
            })
            .then(function (text) {
                var payload;
                try {
                    payload = JSON.parse(text);
                } catch (parseErr) {
                    throw new Error('استجابة غير صالحة من Google Sheet');
                }
                if (!payload || payload.status !== 'ok') {
                    throw new Error((payload && payload.message) || 'تعذر تحميل طلبات Google Sheet');
                }
                return {
                    rows: Array.isArray(payload.rows) ? payload.rows : [],
                    lastRow: Number(payload.lastRow) || 1
                };
            });
    }

    function sheetSyncErrorMessage(err) {
        var code = err && err.code ? String(err.code) : '';
        if (code === 'permission-denied') {
            return 'صلاحيات Firestore — انشر firebase/firestore.rules ثم أعد المحاولة';
        }
        return (err && err.message) ? String(err.message) : 'خطأ غير معروف';
    }

    function getSheetSyncState() {
        try {
            var localLast = Number(localStorage.getItem(SHEET_SYNC_STATE_KEY) || '1');
            if (localLast >= 1) return Promise.resolve({ lastRow: localLast });
        } catch (_) {}
        return db.collection('system').doc('sheetSync').get().then(function (snap) {
            if (!snap.exists) return { lastRow: 1 };
            var data = snap.data() || {};
            var lastRow = Number(data.lastRow);
            if (!lastRow || lastRow < 1) lastRow = 1;
            return { lastRow: lastRow };
        }).catch(function () {
            return { lastRow: 1 };
        });
    }

    function saveSheetSyncState(lastRow) {
        var value = Number(lastRow) || 1;
        try {
            localStorage.setItem(SHEET_SYNC_STATE_KEY, String(value));
        } catch (_) {}
        return db.collection('system').doc('sheetSync').set({
            lastRow: Number(lastRow) || 1,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(function () {
            return null;
        });
    }

    function clearSheetSyncState() {
        try { localStorage.removeItem(SHEET_SYNC_STATE_KEY); } catch (_) {}
        return db.collection('system').doc('sheetSync').delete().catch(function () {
            return null;
        });
    }

    function purgeAllOrdersCollection() {
        var chunk = 300;
        function pass() {
            return db.collection('orders').limit(chunk).get().then(function (snap) {
                if (snap.empty) return 0;
                var batch = db.batch();
                var count = 0;
                snap.forEach(function (doc) {
                    batch.delete(doc.ref);
                    count++;
                });
                return batch.commit().then(function () {
                    return pass().then(function (next) { return count + next; });
                });
            });
        }
        return pass();
    }

    function ensureZeroResetBeforeSync() {
        try {
            if (localStorage.getItem(SHEET_ZERO_RESET_DONE_KEY) === '1') return Promise.resolve();
        } catch (_) {}
        return purgeAllOrdersCollection()
            .then(function () { return clearSheetSyncState(); })
            .then(function () {
                try { localStorage.setItem(SHEET_ZERO_RESET_DONE_KEY, '1'); } catch (_) {}
                sheetSyncFirstRun = true;
                toast('تم تصفير الطلبات والبدء من Google Sheet فقط', 'success');
            })
            .catch(function (err) {
                toast('تعذر تصفير الطلبات: ' + (err.message || err), 'error');
            });
    }

    function upsertSheetRows(rows) {
        if (!rows.length) return Promise.resolve(0);
        var chunkSize = 200;
        var index = 0;
        var imported = 0;

        function nextChunk() {
            if (index >= rows.length) return Promise.resolve(imported);
            var chunk = rows.slice(index, index + chunkSize);
            index += chunkSize;
            var batch = db.batch();
            chunk.forEach(function (row) {
                var rowNumber = Number(row.rowNumber);
                if (!rowNumber || rowNumber < 2) return;
                var docRef = db.collection('orders').doc('sheet-row-' + rowNumber);
                if (isEmptySheetRow(row)) {
                    batch.delete(docRef);
                    return;
                }
                var rawPhone = String(row.phone || '').trim();
                var normalizedPhone = normalizeSheetPhone(rawPhone);
                if (!isValidSyncPhone(normalizedPhone)) {
                    normalizedPhone = fallbackSyncPhone(rowNumber);
                }
                var normalizedProduct = String(row.product || '').trim() || 'طلب من Google Sheet';
                var notes = '';
                if (rawPhone && normalizedPhone !== rawPhone) {
                    notes = 'الهاتف الأصلي (Sheet): ' + rawPhone;
                }
                var payload = {
                    sheetRowNumber: rowNumber,
                    name: String(row.name || '').trim(),
                    city: String(row.city || '').trim(),
                    phone: normalizedPhone,
                    product: normalizedProduct,
                    quantity: Math.max(1, parseInt(row.quantity, 10) || 1),
                    source: 'google-sheet',
                    sheetPhoneRaw: rawPhone,
                    sheetPhoneNote: notes,
                    sheetSyncedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (row.price != null && row.price !== '' && !isNaN(Number(row.price))) {
                    payload.price = Number(row.price);
                }
                payload.createdAt = parseSheetDateToTimestamp(row.date);
                // status only on first create; mergeFields keeps admin status edits on later syncs
                var sheetMergeFields = [
                    'sheetRowNumber', 'name', 'city', 'phone', 'product', 'quantity',
                    'source', 'sheetPhoneRaw', 'sheetPhoneNote', 'sheetSyncedAt', 'price', 'createdAt'
                ];
                batch.set(docRef, Object.assign({ status: 'new' }, payload), { mergeFields: sheetMergeFields });
                imported++;
            });
            return batch.commit().then(nextChunk);
        }

        return nextChunk();
    }

    function syncSheetOrdersToFirestore(opts) {
        opts = opts || {};
        if (!db || !auth || !auth.currentUser || sheetSyncBusy) return Promise.resolve();
        sheetSyncBusy = true;
        updateSheetSyncStatus('جاري المزامنة...', 'syncing');
        return getSheetSyncState()
            .then(function (state) {
                var fromRow = opts.fullBackfill
                    ? 2
                    : Math.max(2, (Number(state.lastRow || 1) - SHEET_SYNC_LOOKBACK_ROWS + 1));
                return loadSheetRows(fromRow).then(function (payload) {
                    var rows = payload.rows || [];
                    return upsertSheetRows(rows).then(function (count) {
                        var nextLastRow = Math.max(Number(state.lastRow) || 1, Number(payload.lastRow) || 1);
                        return saveSheetSyncState(nextLastRow).then(function () {
                            updateSheetSyncStatus('آخر تحديث ' + formatClockTime(new Date()) + ' (' + count + ')', 'ok');
                            if (opts.notify && count > 0) {
                                toast('تمت مزامنة ' + count + ' طلب من Google Sheet', 'success');
                            }
                        });
                    });
                });
            })
            .catch(function (err) {
                console.error('[Prumysl Admin] sheet sync:', err);
                var msg = sheetSyncErrorMessage(err);
                updateSheetSyncStatus('فشل: ' + truncateText(msg, 48), 'error');
                if (opts.notify) {
                    toast('تعذر مزامنة Google Sheet: ' + msg, 'error');
                }
            })
            .finally(function () {
                sheetSyncBusy = false;
            });
    }

    function startSheetSyncLoop() {
        stopSheetSyncLoop();
        var syncEvery = getSheetSyncIntervalMs();
        updateSheetSyncStatus('جاهز — كل ' + Math.round(syncEvery / 1000) + 'ث', 'ok');
        syncSheetOrdersToFirestore({ fullBackfill: sheetSyncFirstRun, notify: false })
            .finally(function () { sheetSyncFirstRun = false; });
        sheetSyncTimer = setInterval(function () {
            syncSheetOrdersToFirestore({ notify: false });
        }, syncEvery);
    }

    function stopSheetSyncLoop() {
        if (sheetSyncTimer) {
            clearInterval(sheetSyncTimer);
            sheetSyncTimer = null;
        }
        updateSheetSyncStatus('متوقفة', '');
    }

    function buildManualOrderData() {
        var name = document.getElementById('manualName').value.trim();
        var city = document.getElementById('manualCity').value.trim();
        var phone = normalizePhone(document.getElementById('manualPhone').value);
        var product = manualProduct.value;
        var quantity = parseInt(manualQty.value, 10) || 1;
        if (quantity < 1) quantity = 1;
        var price = calcLinePrice();
        var status = document.getElementById('manualStatus').value;
        var source = document.getElementById('manualSource').value;
        var notes = document.getElementById('manualNotes').value.trim();

        if (!phone) {
            var phoneErr = root.PrumyslPhone && root.PrumyslPhone.validateMoroccoPhone
                ? root.PrumyslPhone.validateMoroccoPhone(document.getElementById('manualPhone').value)
                : 'رقم الهاتف غير صالح';
            throw new Error(phoneErr || 'رقم الهاتف غير صالح');
        }
        if (!product) throw new Error('اختر المنتج');

        var payload = {
            name: name,
            city: city,
            phone: phone,
            product: product,
            quantity: quantity,
            status: status,
            source: source,
            notes: notes
        };
        if (price != null && !isNaN(price)) payload.price = price;
        if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        return payload;
    }

    function createManualOrder(e) {
        e.preventDefault();
        if (manualFormError) manualFormError.textContent = '';

        if (!db || !auth) {
            toast('Firebase غير مُهيأ. تحقق من js/firebase-config.js', 'error');
            return;
        }
        if (!auth.currentUser) {
            toast('يجب تسجيل الدخول أولاً', 'error');
            return;
        }

        var btn = document.getElementById('manualSubmitBtn');
        if (btn) btn.disabled = true;

        var data;
        try {
            data = buildManualOrderData();
        } catch (err) {
            if (manualFormError) manualFormError.textContent = err.message;
            if (btn) btn.disabled = false;
            return;
        }

        var syncSheet = document.getElementById('manualSyncSheet').checked;

        submitToSheet({
            name: data.name,
            city: data.city,
            phone: data.phone,
            product: data.product,
            quantity: data.quantity,
            price: data.price
        }).then(function () {
                if (syncSheet) {
                    syncSheetOrdersToFirestore({ fullBackfill: true, notify: false });
                }
                toast('تم حفظ الطلب بنجاح', 'success');
                resetManualForm();
                switchView('orders');
            })
            .catch(function (err) {
                console.error('[Prumysl Admin] manual order:', err);
                var msg = firestoreErrorMessage(err);
                if (manualFormError) manualFormError.textContent = msg;
                toast(msg, 'error');
            })
            .finally(function () { if (btn) btn.disabled = false; });
    }

    function openOrderDetail(id) {
        var o = allOrders.find(function (x) { return x.id === id; });
        if (!o || !orderDetailModal) return;
        detailOrderId = id;
        orderDetailBody.innerHTML =
            '<dl class="detail-grid">' +
            '<dt>التاريخ</dt><dd>' + formatDate(o.createdAt) + '</dd>' +
            '<dt>العميل</dt><dd>' + escapeHtml(o.name) + '</dd>' +
            '<dt>المدينة</dt><dd>' + escapeHtml(o.city) + '</dd>' +
            '<dt>الهاتف</dt><dd dir="ltr">' + escapeHtml(o.phone) + '</dd>' +
            '<dt>المنتج</dt><dd>' + escapeHtml(o.product) + '</dd>' +
            '<dt>الكمية</dt><dd>' + escapeHtml(String(o.quantity)) + '</dd>' +
            '<dt>السعر</dt><dd>' + formatPrice(o.price) + '</dd>' +
            '<dt>الحالة</dt><dd>' + escapeHtml(STATUS_LABELS[o.status] || o.status) + '</dd>' +
            '<dt>المصدر</dt><dd>' + escapeHtml(o.source || '—') + '</dd>' +
            '<dt>ملاحظات</dt><dd><textarea class="detail-notes-input" rows="2" placeholder="ملاحظة داخلية...">' + escapeHtml(o.notes || '') + '</textarea></dd>' +
            (o.ozonTracking ? '<dt>Ozon</dt><dd dir="ltr"><code class="ozon-tracking-code">' + escapeHtml(o.ozonTracking) + '</code></dd>' : '') +
            '</dl>';
        orderDetailModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        var notesEl = orderDetailBody.querySelector('.detail-notes-input');
        if (notesEl) {
            notesEl.addEventListener('change', function () {
                updateOrderField(detailOrderId, { notes: notesEl.value.trim() });
            });
        }
    }

    function closeOrderDetail() {
        if (orderDetailModal) orderDetailModal.classList.add('hidden');
        document.body.style.overflow = '';
        detailOrderId = null;
    }

    function toggleOzonStockExtra() {
        var stockEl = document.getElementById('ozonStock');
        var extra = document.getElementById('ozonStockExtra');
        if (!stockEl || !extra) return;
        extra.classList.toggle('hidden', stockEl.value !== '1');
    }

    function closeOzonModal() {
        if (!ozonPushModal) return;
        ozonPushModal.classList.add('hidden');
        if (!orderDetailModal || orderDetailModal.classList.contains('hidden')) {
            document.body.style.overflow = '';
        }
        ozonOrderId = null;
        if (ozonFormError) ozonFormError.textContent = '';
    }

    function openOzonModalForOrder(orderId) {
        if (!ozonApi || !ozonPushModal) {
            toast('وحدة Ozon غير محمّلة', 'error');
            return;
        }
        var o = allOrders.find(function (x) { return x.id === orderId; });
        if (!o) return;
        ozonOrderId = orderId;

        document.getElementById('ozonReceiver').value = o.name || '';
        document.getElementById('ozonPhone').value = ozonApi.formatPhoneDisplay(o.phone);
        document.getElementById('ozonAddress').value = ozonApi.buildAddress(o);
        document.getElementById('ozonPrice').value = o.price != null ? Math.round(Number(o.price)) : '';
        document.getElementById('ozonDeclared').value = ozonApi.declaredValueForPrice(o.price);
        document.getElementById('ozonNature').value = (o.product || '') + (o.quantity > 1 ? ' ×' + o.quantity : '');
        document.getElementById('ozonNote').value = o.notes || '';
        document.getElementById('ozonStock').value = '0';
        var ozonRef = document.getElementById('ozonProductRef');
        if (ozonRef) ozonRef.value = '';
        toggleOzonStockExtra();
        document.getElementById('ozonOpen').value = '';
        document.getElementById('ozonFragile').value = '';
        if (ozonCitySearch) ozonCitySearch.value = o.city || '';

        if (ozonExistingTracking) {
            if (o.ozonTracking) {
                ozonExistingTracking.textContent = 'رقم تتبع Ozon الحالي: ' + o.ozonTracking;
                ozonExistingTracking.classList.remove('hidden');
            } else {
                ozonExistingTracking.classList.add('hidden');
                ozonExistingTracking.textContent = '';
            }
        }

        var btn = document.getElementById('ozonSubmitBtn');
        if (btn) btn.disabled = true;
        if (ozonCityId) ozonCityId.innerHTML = '<option value="">جاري تحميل المدن...</option>';

        ozonPushModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        ozonApi.loadCities().then(function (cities) {
            ozonCitiesList = cities;
            var guess = ozonApi.guessCityId(o.city, cities);
            ozonApi.fillCitySelect(ozonCityId, cities, guess);
            if (btn) btn.disabled = false;
        }).catch(function (err) {
            if (ozonCityId) ozonCityId.innerHTML = '<option value="">تعذر التحميل</option>';
            if (ozonFormError) ozonFormError.textContent = err.message || String(err);
            if (btn) btn.disabled = false;
            toast(err.message || 'تعذر تحميل مدن Ozon', 'error');
        });
    }

    function submitOzonParcel(e) {
        e.preventDefault();
        if (!ozonApi || !ozonOrderId) return;
        if (ozonFormError) ozonFormError.textContent = '';

        var receiver = document.getElementById('ozonReceiver').value.trim();
        var phone = ozonApi.formatPhoneDisplay(document.getElementById('ozonPhone').value);
        var cityId = ozonCityId ? ozonCityId.value : '';
        var address = document.getElementById('ozonAddress').value.trim();
        var price = document.getElementById('ozonPrice').value;
        var declared = document.getElementById('ozonDeclared').value;
        var stock = document.getElementById('ozonStock').value;
        var openVal = document.getElementById('ozonOpen').value;
        var fragile = document.getElementById('ozonFragile').value;
        var nature = document.getElementById('ozonNature').value.trim();
        var note = document.getElementById('ozonNote').value.trim();

        if (!receiver || !phone || !cityId || !address) {
            if (ozonFormError) ozonFormError.textContent = 'أكمل الحقول المطلوبة (المستلم، الهاتف، المدينة، العنوان).';
            return;
        }

        var orderForAddr = allOrders.find(function (x) { return x.id === ozonOrderId; });
        var cityLabel = '';
        if (ozonCityId && ozonCityId.selectedIndex >= 0) {
            cityLabel = ozonCityId.options[ozonCityId.selectedIndex].text || '';
            cityLabel = cityLabel.replace(/\s*\(#\d+\)\s*$/, '').trim();
        }
        var addrCheck = ozonApi.normalizeOzonAddress(address, {
            city: cityLabel || (orderForAddr && orderForAddr.city) || '',
            phone: phone
        });
        if (!addrCheck.ok) {
            if (ozonFormError) ozonFormError.textContent = addrCheck.error;
            return;
        }
        address = addrCheck.address;

        var payload = {
            'parcel-receiver': receiver,
            'parcel-phone': phone,
            'parcel-city': cityId,
            'parcel-address': address,
            'parcel-price': price,
            'parcel-stock': stock
        };
        if (declared) payload['parcel-declared-value'] = declared;
        if (nature) payload['parcel-nature'] = nature;
        if (note) payload['parcel-note'] = note;
        if (openVal) payload['parcel-open'] = openVal;
        if (fragile) payload['parcel-fragile'] = fragile;
        if (stock === '1') {
            var order = allOrders.find(function (x) { return x.id === ozonOrderId; });
            var refEl = document.getElementById('ozonProductRef');
            var ref = refEl ? refEl.value.trim() : '';
            if (!ref && order && order.product) ref = String(order.product).slice(0, 40);
            var qnty = order && order.quantity ? parseInt(order.quantity, 10) : 1;
            if (!ref) {
                if (ozonFormError) {
                    ozonFormError.textContent = 'نوع «مخزون Ozon» يتطلب مرجع منتج (ref) من حساب Ozon، أو اختر «راماساج».';
                }
                return;
            }
            payload.products = JSON.stringify([{ ref: ref, qnty: qnty > 0 ? qnty : 1 }]);
        }

        var submitBtn = document.getElementById('ozonSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        ozonApi.pushParcel(payload).then(function (result) {
            if (!ozonApi.isOzonSuccess(result)) {
                var failMsg = ozonApi.extractErrorMessage(result) ||
                    (result && result.message) ||
                    'فشل إرسال Ozon';
                throw new Error(failMsg);
            }
            var tracking = ozonApi.extractTracking(result);
            var patch = {
                ozonPushedAt: firebase.firestore.FieldValue.serverTimestamp(),
                ozonStatus: tracking ? ('مسجّل — ' + tracking) : 'مسجّل في Ozon',
                status: 'shipped'
            };
            if (tracking) patch.ozonTracking = tracking;

            return db.collection('orders').doc(ozonOrderId).update(patch).then(function () {
                toast(
                    tracking ? ('تم الإرسال إلى Ozon — تتبع: ' + tracking) : 'تم الإرسال إلى Ozon بنجاح',
                    'success'
                );
                closeOzonModal();
                closeOrderDetail();
            });
        }).catch(function (err) {
            var msg = err.message || String(err);
            if (ozonFormError) ozonFormError.textContent = msg;
            toast(msg, 'error');
        }).finally(function () {
            if (submitBtn) submitBtn.disabled = false;
        });
    }

    function duplicateDetailOrder() {
        var o = allOrders.find(function (x) { return x.id === detailOrderId; });
        if (!o) return;
        closeOrderDetail();
        switchView('manual');
        document.getElementById('manualName').value = o.name;
        document.getElementById('manualCity').value = o.city;
        document.getElementById('manualPhone').value = o.phone;
        manualProduct.value = o.product;
        manualQty.value = o.quantity || 1;
        if (o.price != null && o.quantity) {
            manualPrice.value = Math.round(Number(o.price) / Number(o.quantity));
        }
        document.getElementById('manualNotes').value = o.notes || '';
        toast('تم نسخ بيانات الطلب — عدّل ثم احفظ', 'success');
    }

    function getOzonOrders() {
        return allOrders.filter(function (o) {
            return !!(o.ozonTracking || o.ozonPushedAt);
        });
    }

    function ozonPushedTimestamp(o) {
        if (o.ozonPushedAt && o.ozonPushedAt.toMillis) return o.ozonPushedAt.toMillis();
        return orderTimestamp(o);
    }

    function getFilteredOzonOrders() {
        var q = ozonFilterSearch ? ozonFilterSearch.value.trim().toLowerCase() : '';
        var localStatus = ozonFilterLocal ? ozonFilterLocal.value : '';
        return getOzonOrders().filter(function (o) {
            if (localStatus && o.status !== localStatus) return false;
            if (!q) return true;
            var hay = [o.name, o.phone, o.city, o.product, o.ozonTracking, o.ozonStatus]
                .join(' ').toLowerCase();
            return hay.indexOf(q) !== -1;
        }).sort(function (a, b) {
            return ozonPushedTimestamp(b) - ozonPushedTimestamp(a);
        });
    }

    function ozonStatusLabel(o) {
        if (o.ozonStatus) return String(o.ozonStatus);
        if (o.status === 'delivered') return 'مُسلّم (محلي)';
        if (o.status === 'shipped') return 'قيد الشحن (محلي)';
        return 'مُرسل إلى Ozon';
    }

    function renderOzonPage() {
        if (!ozonOrdersBody) return;
        var list = getFilteredOzonOrders();
        var all = getOzonOrders();

        if (ozonCountBadge) ozonCountBadge.textContent = String(all.length);
        if (ozonEmpty) ozonEmpty.classList.toggle('hidden', list.length > 0);

        var delivered = all.filter(function (o) { return o.status === 'delivered'; }).length;
        var shipped = all.filter(function (o) { return o.status === 'shipped'; }).length;

        if (ozonStatsGrid) {
            ozonStatsGrid.innerHTML =
                '<div class="insight-card insight-card--ozon"><div class="label">مُرسلة إلى Ozon</div><div class="value">' + all.length + '</div></div>' +
                '<div class="insight-card"><div class="label">قيد الشحن</div><div class="value">' + shipped + '</div></div>' +
                '<div class="insight-card"><div class="label">تم التسليم</div><div class="value">' + delivered + '</div></div>' +
                '<div class="insight-card"><div class="label">بانتظار تحديث</div><div class="value">' +
                all.filter(function (o) { return !o.ozonStatus; }).length + '</div></div>';
        }

        ozonOrdersBody.innerHTML = list.map(function (o) {
            var pushed = o.ozonPushedAt ? formatDate(o.ozonPushedAt) : formatDate(o.createdAt);
            var tracking = o.ozonTracking || '—';
            var ozonBadge = escapeHtml(ozonStatusLabel(o));
            var trackCell = tracking !== '—'
                ? '<code class="ozon-tracking-code">' + escapeHtml(tracking) + '</code>'
                : '—';
            return '<tr data-id="' + o.id + '">' +
                '<td><time>' + pushed + '</time></td>' +
                '<td><strong>' + escapeHtml(o.name || '—') + '</strong><br><span class="cell-muted">' +
                escapeHtml(o.city || '') + ' · ' + escapeHtml(o.product || '') + '</span></td>' +
                '<td dir="ltr">' + trackCell + '</td>' +
                '<td><span class="ozon-status-pill">' + ozonBadge + '</span></td>' +
                '<td><span class="status-pill status-' + escapeAttr(o.status || 'new') + '">' +
                escapeHtml(STATUS_LABELS[o.status] || o.status) + '</span></td>' +
                '<td>' + formatPrice(o.price) + '</td>' +
                '<td class="ozon-row-actions">' +
                '<button type="button" class="btn btn-secondary btn-sm btn-ozon-refresh" data-id="' + o.id + '">تحديث</button> ' +
                '<button type="button" class="btn btn-ghost btn-sm btn-view" data-id="' + o.id + '">تفاصيل</button>' +
                '</td></tr>';
        }).join('');

        ozonOrdersBody.querySelectorAll('.btn-ozon-refresh').forEach(function (btn) {
            btn.addEventListener('click', function () {
                refreshOzonStatusForOrder(btn.dataset.id, btn);
            });
        });
        ozonOrdersBody.querySelectorAll('.btn-view').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openOrderDetail(btn.dataset.id);
            });
        });
    }

    function refreshOzonStatusForOrder(orderId, btn) {
        var o = allOrders.find(function (x) { return x.id === orderId; });
        if (!o || !o.ozonTracking || !ozonApi || !db) return;
        if (btn) btn.disabled = true;
        ozonApi.fetchParcelStatus(o.ozonTracking).then(function (result) {
            if (!result || result.status !== 'ok') {
                throw new Error((result && result.message) || 'تعذر جلب الحالة من Ozon');
            }
            var label = ozonApi.parseStatusLabel(result) || ozonStatusLabel(o);
            var patch = {
                ozonStatus: label,
                ozonStatusAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (result.suggestDelivered || ozonApi.isDeliveredLabel(label)) {
                patch.status = 'delivered';
            }
            return db.collection('orders').doc(orderId).update(patch);
        }).then(function () {
            toast('تم تحديث حالة Ozon', 'success');
            if (currentView === 'ozon') renderOzonPage();
        }).catch(function (err) {
            toast(err.message || 'تعذر تحديث الحالة', 'error');
        }).finally(function () {
            if (btn) btn.disabled = false;
        });
    }

    function bulkRefreshOzonStatuses() {
        var list = getFilteredOzonOrders().filter(function (o) { return o.ozonTracking; });
        if (!list.length) {
            toast('لا توجد طلبات بتتبع Ozon', 'error');
            return;
        }
        var btn = document.getElementById('ozonRefreshAllBtn');
        if (btn) btn.disabled = true;
        toast('جاري تحديث ' + list.length + ' طلب…', 'success');
        var chain = Promise.resolve();
        list.forEach(function (o) {
            chain = chain.then(function () {
                return ozonApi.fetchParcelStatus(o.ozonTracking).then(function (result) {
                    if (!result || result.status !== 'ok') return;
                    var label = ozonApi.parseStatusLabel(result) || o.ozonStatus || 'مُرسل';
                    var patch = {
                        ozonStatus: label,
                        ozonStatusAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (result.suggestDelivered || ozonApi.isDeliveredLabel(label)) {
                        patch.status = 'delivered';
                    }
                    return db.collection('orders').doc(o.id).update(patch);
                }).catch(function () {});
            });
        });
        chain.then(function () {
            toast('تم تحديث حالات Ozon', 'success');
            renderOzonPage();
        }).finally(function () {
            if (btn) btn.disabled = false;
        });
    }
    function showDashboard(user) {
        document.body.classList.add('admin-dashboard');
        var email = user.email || '';
        if (userEmailSidebar) userEmailSidebar.textContent = email;
        if (inventoryMod) {
            inventoryMod.applyNavVisibility(user);
            if (inventoryMod.isInventoryAdmin(user)) {
                inventoryMod.subscribeInventory();
            }
        }
        ensureZeroResetBeforeSync().then(function () {
        if (anim) {
            anim.crossfadeViews(loginView, dashboardView, function () {
                if (!dashboardAnimated) {
                    anim.animateDashboardEnter();
                    dashboardAnimated = true;
                }
                subscribeOrders();
                startSheetSyncLoop();
            });
        } else {
            loginView.classList.add('hidden');
            dashboardView.classList.remove('hidden');
            subscribeOrders();
            startSheetSyncLoop();
        }
        });
    }

    function showLogin() {
        document.body.classList.remove('admin-dashboard');
        dashboardAnimated = false;
        if (anim) anim.crossfadeViews(dashboardView, loginView);
        else {
            dashboardView.classList.add('hidden');
            loginView.classList.remove('hidden');
        }
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        stopSheetSyncLoop();
        if (inventoryMod) inventoryMod.teardown();
        allOrders = [];
        selectedIds.clear();
    }

    function exportCsv() {
        var rows = getFilteredOrders();
        if (!rows.length) { toast('لا توجد طلبات للتصدير', 'error'); return; }
        var headers = ['Date', 'Name', 'City', 'Phone', 'Product', 'Qty', 'Price', 'Status', 'Source', 'Notes'];
        var lines = [headers.join(',')];
        rows.forEach(function (o) {
            var date = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : '';
            lines.push([date, csvCell(o.name), csvCell(o.city), csvCell(o.phone), csvCell(o.product),
                o.quantity, o.price != null ? o.price : '', csvCell(o.status), csvCell(o.source), csvCell(o.notes)].join(','));
        });
        var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'prumysl-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('تم تصدير ' + rows.length + ' طلب', 'success');
    }

    function csvCell(v) {
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        loginError.textContent = '';
        var btn = loginForm.querySelector('.btn-login');
        if (btn) btn.disabled = true;
        auth.signInWithEmailAndPassword(
            document.getElementById('loginEmail').value.trim(),
            document.getElementById('loginPassword').value
        ).catch(function (err) {
            loginError.textContent = err.code === 'auth/invalid-credential'
                ? 'البريد أو كلمة المرور غير صحيحة.'
                : (err.message || 'فشل تسجيل الدخول');
            if (anim) anim.shakeError(loginForm);
        }).finally(function () { if (btn) btn.disabled = false; });
    });

    logoutBtn.addEventListener('click', function () { auth.signOut(); });
    if (logoutBtnSidebar) logoutBtnSidebar.addEventListener('click', function () { auth.signOut(); });
    exportBtn.addEventListener('click', exportCsv);
    refreshBtn.addEventListener('click', function () {
        if (auth.currentUser) {
            subscribeOrders();
            syncSheetOrdersToFirestore({ fullBackfill: true, notify: true });
            toast('جاري التحديث...');
        }
    });
    if (newOrderBtn) newOrderBtn.addEventListener('click', function () { switchView('manual'); });

    document.querySelectorAll('.sidebar-nav a[data-view], .mobile-nav-item[data-view]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();
            switchView(a.dataset.view);
        });
    });

    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', function () { auth.signOut(); });

    if (filterToggle && filterPanel) {
        filterToggle.addEventListener('click', function () {
            var open = filterPanel.classList.toggle('toolbar--open');
            filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    if (manualOrderForm) manualOrderForm.addEventListener('submit', createManualOrder);
    if (manualResetBtn) manualResetBtn.addEventListener('click', resetManualForm);
    if (manualProduct) manualProduct.addEventListener('change', syncManualPriceFromProduct);
    if (manualQty) manualQty.addEventListener('input', function () {
        var opt = manualProduct.options[manualProduct.selectedIndex];
        if (opt && opt.getAttribute('data-price')) syncManualPriceFromProduct();
    });

    if (selectAllOrders) {
        selectAllOrders.addEventListener('change', function () {
            getFilteredOrders().forEach(function (o) {
                if (selectAllOrders.checked) selectedIds.add(o.id);
                else selectedIds.delete(o.id);
            });
            renderTable(false);
        });
    }

    document.getElementById('bulkConfirmBtn').addEventListener('click', function () { bulkUpdateStatus('confirmed'); });
    var bulkOzonBtn = document.getElementById('bulkOzonBtn');
    if (bulkOzonBtn) bulkOzonBtn.addEventListener('click', bulkPushToOzon);
    document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDelete);
    document.getElementById('bulkClearBtn').addEventListener('click', function () {
        selectedIds.clear();
        renderTable(false);
    });

    if (document.getElementById('detailOzonBtn')) {
        document.getElementById('detailOzonBtn').addEventListener('click', function () {
            if (detailOrderId) openOzonModalForOrder(detailOrderId);
        });
    }
    if (ozonPushForm) ozonPushForm.addEventListener('submit', submitOzonParcel);
    if (ozonPushModal) {
        ozonPushModal.querySelectorAll('[data-close-ozon]').forEach(function (el) {
            el.addEventListener('click', closeOzonModal);
        });
    }
    if (ozonCitySearch) {
        ozonCitySearch.addEventListener('input', function () {
            if (ozonCitiesList.length) ozonApi.filterCitySelect(ozonCityId, ozonCitySearch.value, ozonCitiesList);
        });
    }
    var ozonStockEl = document.getElementById('ozonStock');
    if (ozonStockEl) ozonStockEl.addEventListener('change', toggleOzonStockExtra);
    if (document.getElementById('ozonTestBtn')) {
        document.getElementById('ozonTestBtn').addEventListener('click', function () {
            if (!ozonApi) return;
            var btn = document.getElementById('ozonTestBtn');
            if (btn) btn.disabled = true;
            ozonApi.testApi().then(function (r) {
                if (r.status === 'ok') toast(r.message || 'Ozon OK', 'success');
                else toast(r.message || 'فشل الاختبار', 'error');
            }).catch(function (err) {
                toast(err.message || String(err), 'error');
            }).finally(function () { if (btn) btn.disabled = false; });
        });
    }

    document.getElementById('detailDuplicateBtn').addEventListener('click', duplicateDetailOrder);
    document.getElementById('detailCallBtn').addEventListener('click', function () {
        var o = allOrders.find(function (x) { return x.id === detailOrderId; });
        if (o) window.location.href = telUrl(o.phone);
    });

    orderDetailModal.querySelectorAll('[data-close-modal]').forEach(function (el) {
        el.addEventListener('click', closeOrderDetail);
    });

    var filterTimer;
    function onFilterChange() {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(function () { renderTable(false); }, 180);
    }
    filterSearch.addEventListener('input', onFilterChange);
    filterStatus.addEventListener('change', onFilterChange);
    filterProduct.addEventListener('change', onFilterChange);
    var ozonFilterTimer;
    function onOzonFilterChange() {
        clearTimeout(ozonFilterTimer);
        ozonFilterTimer = setTimeout(function () { renderOzonPage(); }, 180);
    }
    if (ozonFilterSearch) ozonFilterSearch.addEventListener('input', onOzonFilterChange);
    if (ozonFilterLocal) ozonFilterLocal.addEventListener('change', onOzonFilterChange);
    var ozonRefreshAllBtn = document.getElementById('ozonRefreshAllBtn');
    if (ozonRefreshAllBtn) ozonRefreshAllBtn.addEventListener('click', bulkRefreshOzonStatuses);

    if (filterDate) filterDate.addEventListener('change', onFilterChange);

    if (!initFirebase()) {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        return;
    }

    populateProductSelects();
    resetManualForm();
    if (ozonApi) ozonApi.init(ORDERS_SCRIPT_URL);
    if (inventoryMod) {
        inventoryMod.init({
            db: db,
            getOrders: function () { return allOrders; },
            onToast: toast,
            productCatalog: PRODUCT_CATALOG
        });
    }

    auth.onAuthStateChanged(function (user) {
        if (user) showDashboard(user);
        else showLogin();
    });
})();
