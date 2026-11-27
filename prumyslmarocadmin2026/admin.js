/* Prumysl — لوحة إدارة الطلبات (prumyslmarocadmin2026/).
   Reads and updates the orders that the site's order forms send to the Google Apps Script web apps
   (same URLs as ORDERS_SCRIPT_URL in each product folder's js/orders-sheet.js). The admin side of those scripts lives in
   google-apps-script/admin-api.gs. The admin key is checked by Google, server-side: this page only keeps
   a signed, expiring session token. */
(function () {
  'use strict';
  // opened as …/index.html: show the clean address (no reload)
  if (/\/index\.html$/i.test(location.pathname)) {
    try { history.replaceState(history.state, '', location.pathname.replace(/index\.html$/i, '') + location.search + location.hash); } catch (err) { /* ignore */ }
  }

  // never usable inside a frame (clickjacking)
  if (window.top !== window.self) { document.body.textContent = ''; return; }

  // ===== Order backends: MUST be the same URLs as ORDERS_SCRIPT_URL in the site's js/orders-sheet.js files =====
  const STORES = [
    { id: 'main', prefix: 'PR', label: 'المتجر الرئيسي', tab: 'المتجر الرئيسي', url: 'https://script.google.com/macros/s/AKfycbwFR6sq_iWRbW47Nab2rwvyz43nva1BZdWiB_ZirRxXlQBz4LbWk83Vx1ej2ed2TYbC/exec' },
    { id: 'pe', prefix: 'PE', label: 'متجر البانس (PE)', tab: 'البانس', url: 'https://script.google.com/macros/s/AKfycbxipqw5BU47MnNPHIUqF4iM6D5D2pCYs_0yGcUpY_5zyCqe7M_m6LT7EShsn-zbmZo/exec' }
  ];

  const STATUSES = ['جديد', 'مؤكد', 'تم الشحن', 'تم التسليم', 'ملغي', 'مرتجع'];
  const SKEY = { 'جديد': 'new', 'مؤكد': 'conf', 'تم الشحن': 'ship', 'تم التسليم': 'done', 'ملغي': 'canc', 'مرتجع': 'ret' };
  const NEXT = {                                   // one-click actions from the list
    'جديد': [['تأكيد', 'مؤكد'], ['إلغاء', 'ملغي', 'x']],
    'مؤكد': [['شحن', 'تم الشحن'], ['إلغاء', 'ملغي', 'x']],
    'تم الشحن': [['تم التسليم', 'تم التسليم'], ['مرتجع', 'مرتجع', 'x']],
    'تم التسليم': [], 'ملغي': [['إعادة فتح', 'جديد', 'x']], 'مرتجع': []
  };
  const SOURCES = {
    moka: 'صفحة موكا', 'moka-pro-max': 'صفحة موكا برو ماكس', saqr: 'صفحة الصقر', 'guard-corps': 'صفحة GUARD CORPS',
    projectors: 'صفحة البروجيكتورات', PE: 'صفحة البانس', website: 'الموقع',
    'manual-whatsapp': 'طلب يدوي · واتساب', 'manual-phone': 'طلب يدوي · هاتف', 'manual-shop': 'طلب يدوي · المحل', 'manual-other': 'طلب يدوي'
  };
  const TZ = 'Africa/Casablanca';
  const PAGE = 50;
  const REFRESH_MS = 60000;
  const LS_KEY = 'prumysl-admin-tokens', LS_SEEN = 'prumysl-admin-seen', LS_PERIOD = 'prumysl-admin-period', LS_STORE = 'prumysl-admin-store';
  const TITLE = 'Prumysl — لوحة الطلبات';

  const $ = (s, r) => (r || document).querySelector(s);
  const el = {
    login: $('#login'), loginForm: $('#loginForm'), loginUser: $('#loginUser'), loginKey: $('#loginKey'), loginRemember: $('#loginRemember'), loginErr: $('#loginErr'), loginBtn: $('#loginBtn'),
    app: $('#app'), sync: $('#sync'), syncTxt: $('#syncTxt'), refresh: $('#refreshBtn'), logout: $('#logoutBtn'), newBadge: $('#newBadge'),
    period: $('#period'), storeTabs: $('#storeTabs'), kpis: $('#kpis'), chips: $('#chips'), q: $('#q'), from: $('#from'), to: $('#to'), sort: $('#sort'), product: $('#product'),
    reset: $('#resetBtn'), csv: $('#csvBtn'), manual: $('#manualBtn'), rows: $('#rows'), empty: $('#empty'), pager: $('#pager'), table: $('#otable'), warn: $('#storeWarn'),
    drawer: $('#drawer'), scrim: $('#scrim'), toasts: $('#toasts'), ordersView: $('#ordersView')
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  const S = {
    tokens: {}, orders: [], loaded: false, today: '', serverSkew: 0, lastSync: 0, busy: false, storeErr: {},
    period: lsGet(LS_PERIOD) || 'today', store: lsGet(LS_STORE) || 'all', status: 'all', q: '', from: '', to: '', sort: 'new', product: '', page: 0,
    open: null, editing: null, pending: {}, seen: readSeen(), ver: {}, who: { role: 'admin', user: 'admin', name: 'المدير' }
  };

  // ---------- utils ----------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  // comma, not space: in RTL text "1 999" splits into two numbers and shows as "999 1"; "1,999" stays one number
  function num(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function dh(n) { return num(n) + ' درهم'; }
  function dayOf(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  function hm(ms) { return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); }
  function now() { return Date.now() + S.serverSkew; }
  // search: ignore case, Latin accents, Arabic diacritics and hamza / ta marbuta / alif maqsura variants
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function wa212(tel) {
    let d = digits(tel);
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('212')) return d;
    if (d.startsWith('0')) return '212' + d.slice(1);
    if (d.length === 9) return '212' + d;
    return d;
  }
  function plural(n, one, two, many) { return n === 1 ? one : n === 2 ? two : n + ' ' + many; }
  function readSeen() { try { const v = JSON.parse(localStorage.getItem(LS_SEEN) || 'null'); return v && typeof v.ts === 'number' ? v : null; } catch (e) { return null; } }
  function saveSeen() { try { localStorage.setItem(LS_SEEN, JSON.stringify(S.seen)); } catch (e) {} }
  const storeOf = (id) => STORES.find((s) => s.id === id);
  const srcLabel = (s) => SOURCES[s] || s || '—';

  // ---------- API ----------
  class ApiError extends Error { constructor(code, data) { super(code); this.code = code; this.data = data || {}; } }
  async function http(url, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), (opts && opts.timeout) || 30000);
    let res, text;
    try {
      res = await fetch(url, Object.assign({ redirect: 'follow', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal }, opts));
      text = await res.text();
    } catch (e) {
      throw new ApiError(e && e.name === 'AbortError' ? 'timeout' : 'network');
    } finally { clearTimeout(t); }
    let data;
    try { data = JSON.parse(text); } catch (e) {
      throw new ApiError(/<html|<!doctype/i.test(text || '') ? 'html' : (res.ok ? 'old_script' : 'http_' + res.status));
    }
    if (!data || typeof data !== 'object') throw new ApiError('bad_reply');
    return data;
  }
  // The script's doPost also receives the site's order forms: before the first POST we make sure the deployed
  // version knows the admin protocol (an old version would append an empty order row instead).
  const pinged = {};
  async function ping(store) {
    if (pinged[store.id]) return;
    const d = await http(store.url + '?action=admin_ping', { method: 'GET' });
    if (d.service !== 'prumysl-admin' || !d.version) throw new ApiError('old_script');
    // the main store's script must not contain the PE file (and vice versa): order numbers would mix up
    if (store.prefix && d.store && d.store !== store.prefix) throw new ApiError('wrong_store', { got: d.store, want: store.prefix });
    pinged[store.id] = true;
    S.ver[store.id] = Number(d.version) || 0;
  }
  // editing orders (name, phone, city, product, quantity, amount, SD card) needs admin-api.gs version 4+
  const canEdit = (o) => (S.ver[o.store] || 0) >= 4;
  // Scripts before version 5 only understand auth / list / update: anything else would reach their order form
  // code and be saved as an EMPTY ORDER ROW. So newer actions are never sent to an older script.
  const BASIC_ACTIONS = ['auth', 'list', 'update'];
  async function api(store, action, extra, key) {
    if (!store || !store.url) throw new ApiError('no_endpoint');
    await ping(store);
    const oldScript = (S.ver[store.id] || 0) < 5;
    if (oldScript && (BASIC_ACTIONS.indexOf(action) < 0 || (action === 'auth' && extra && extra.user && extra.user !== 'admin'))) {
      throw new ApiError('old_script_stock', { version: S.ver[store.id] || 0 });
    }
    if (/^sift_/.test(action) && (S.ver[store.id] || 0) < 6) throw new ApiError('old_script_sift', { version: S.ver[store.id] || 0 });
    if (action === 'catalog' && (S.ver[store.id] || 0) < 9) throw new ApiError('old_script_manual', { version: S.ver[store.id] || 0 });
    if (action === 'order_add' && (S.ver[store.id] || 0) < 8) throw new ApiError('old_script_manual', { version: S.ver[store.id] || 0 });
    // the first list after an update stamps order numbers and colours column H: give Google more time
    const data = await http(store.url, { method: 'POST', timeout: action === 'list' ? 90000 : 45000, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, key: key != null ? key : S.tokens[store.id] || '' }, extra || {})) });
    if (data.version) S.ver[store.id] = Number(data.version) || 0;
    // permissions changed by the admin take effect without a new login
    if (data.perms && store.id === 'main' && S.who.role !== 'admin' && action !== 'auth' && JSON.stringify(data.perms) !== JSON.stringify(S.who.perms || [])) {
      S.who.perms = data.perms; keepTokens(!!lsGet(LS_KEY)); applyPerms();
    }
    if (data.ok !== true) throw new ApiError(data.error || 'unknown', data);
    return data;
  }
  function errText(e) {
    const c = e && e.code;
    const d = (e && e.data) || {};
    switch (c) {
      case 'bad_key': return 'مفتاح الدخول غير صحيح.' + (d.left != null ? ' تبقّى ' + plural(d.left, 'محاولة واحدة', 'محاولتان', 'محاولات') + ' قبل الحظر لمدة 15 دقيقة.' : '');
      case 'expired': return 'انتهت الجلسة: سجّل الدخول من جديد بمفتاح الإدارة.';
      case 'locked': return 'محاولات كثيرة خاطئة، أعد المحاولة بعد ' + Math.max(1, Math.ceil((d.retryIn || 900) / 60)) + ' دقيقة.';
      case 'no_admin_key': return (d.reason === 'short' ? 'مفتاح الإدارة قصير جداً' : 'مفتاح الإدارة غير مُعدّ') + ' في Google Apps Script › إعدادات المشروع › خصائص السكربت: أضف ADMIN_KEY (' + (d.min || 8) + ' أحرف على الأقل).';
      case 'old_script': return 'سكربت Google غير محدَّث: أضف ملف admin-api.gs والنسخة الجديدة من سكربت الطلبات، ثم Deploy › Manage deployments › ✏️ › New version › Deploy.';
      case 'html': return 'Google يطلب تسجيل الدخول: يجب أن يكون النشر بخيار «Who has access: Anyone».';
      case 'network': return 'لا يوجد اتصال بالإنترنت أو تعذّر الوصول إلى سكربت Google.';
      case 'wrong_store': return 'هذا الرابط يشغّل سكربت متجر آخر (' + d.got + ' بدل ' + d.want + '). في مشروع المتجر الرئيسي ضع all-orders.gs + admin-api.gs فقط، وفي مشروع البانس crimping-pliers-orders.gs + admin-api.gs فقط، ثم أعد النشر.';
      case 'forbidden': return 'هذا الحساب لا يملك صلاحية هذا الإجراء.';
      case 'old_script_manual': return 'الطلب اليدوي يحتاج النسخة الجديدة من admin-api.gs في Google Apps Script (ثم Deploy › New version).';
      case 'old_script_sift': return 'ربط SIFT يحتاج النسخة الجديدة من سكربت Google (النسخة الحالية ' + (d.version || '?') + '): أضف sift-api.gs والنسخ الجديدة من admin-api.gs وملف الطلبات، ثم Deploy › New version.';
      case 'sift': return 'SIFT: ' + (d.message || 'خطأ');
      case 'old_script_stock': return 'المخزون والبائعون يحتاجون تحديث سكربت Google (النسخة الحالية ' + (d.version || '?') + '): أضف stock-api.gs والنسخة الجديدة من admin-api.gs و all-orders.gs في مشروع المتجر الرئيسي، ثم Deploy › New version. لم يُرسَل أي شيء إلى الجدول.';
      case 'timeout': return 'Google لا يستجيب (انتهت المهلة). أعد المحاولة.';
      case 'not_found': return 'الطلب غير موجود في الجدول.';
      case 'busy': return 'السكربت مشغول، أعد المحاولة بعد ثوانٍ.';
      case 'bad_status': return 'الحالة مرفوضة من السكربت.';
      case 'bad_field': return ({ phone: 'رقم الهاتف غير صحيح (مثال: 0612345678).', qty: 'الكمية يجب أن تكون رقماً من 1 إلى 999.', total: 'المبلغ غير صحيح.', product: 'اسم المنتج مطلوب.' })[d.field] || 'قيمة غير صحيحة.';
      case 'old_script_edit': return 'تعديل الطلبات يحتاج النسخة الجديدة من admin-api.gs في Google Apps Script (ثم Deploy › New version).';
      case 'no_endpoint': return 'رابط السكربت غير موجود في admin.js (STORES).';
      case 'server': return 'خطأ في سكربت Google: ' + (d.detail || '');
      default: return 'خطأ: ' + (c || 'غير معروف');
    }
  }
  const isAuthErr = (e) => e && (e.code === 'bad_key' || e.code === 'expired' || e.code === 'locked' || e.code === 'no_admin_key');

  // ---------- toasts ----------
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.setAttribute('role', err ? 'alert' : 'status');
    t.textContent = msg;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, err ? 6500 : 3200);
  }

  // ---------- session ----------
  // What is stored is one signed, expiring session token per store (12 h, or 30 days with "تذكّرني"), never the key.
  const isToken = (k) => /^v[12]\.\d{10}\./.test(k || '');
  const LS_WHO = 'prumysl-admin-who';
  function storedTokens() {
    try {
      const v = JSON.parse(sessionStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY) || 'null');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function keepTokens(remember) {
    try {
      const v = JSON.stringify(S.tokens), w = JSON.stringify(S.who);
      sessionStorage.setItem(LS_KEY, v); sessionStorage.setItem(LS_WHO, w);
      if (remember) { localStorage.setItem(LS_KEY, v); localStorage.setItem(LS_WHO, w); } else { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_WHO); }
    } catch (e) {}
  }
  function dropTokens() { try { [LS_KEY, LS_WHO].forEach((k) => { sessionStorage.removeItem(k); localStorage.removeItem(k); }); } catch (e) {} }
  function storedWho() {
    try { const v = JSON.parse(sessionStorage.getItem(LS_WHO) || localStorage.getItem(LS_WHO) || 'null'); return v && v.role ? v : null; } catch (e) { return null; }
  }
  // permissions ticked by the admin in « البائعون » (the admin has them all)
  const can = (p) => S.who.role === 'admin' || (S.who.perms || []).indexOf(p) >= 0;
  const isSeller = () => !can('orders');            // no orders screen for this account
  const noMoney = () => !can('orders_money');       // no money totals / CSV
  function applyPerms() {
    if (el.app.hidden) return;
    el.manual.hidden = !can('orders_add');
    el.csv.hidden = noMoney();
    if (window.PRUMYSL_STOCK) window.PRUMYSL_STOCK.perms();
    if (!isSeller()) render();
  }
  const activeStores = () => STORES.filter((s) => S.tokens[s.id]);

  function showLogin(msg) {
    stopTimer(); closeDrawer(true);
    el.app.hidden = true; el.login.hidden = false;
    el.loginErr.hidden = !msg; el.loginErr.textContent = msg || '';
    el.loginKey.value = ''; el.loginBtn.disabled = false; el.loginBtn.textContent = 'دخول';
    document.title = TITLE;
    setTimeout(() => el.loginKey.focus(), 30);
  }
  function signOut(msg) { dropTokens(); S.tokens = {}; S.orders = []; S.loaded = false; S.who = { role: 'admin', user: 'admin', name: 'المدير' }; if (window.PRUMYSL_STOCK) window.PRUMYSL_STOCK.reset(); showLogin(msg); }
  el.loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const k = el.loginKey.value.trim();
    const user = (el.loginUser.value || '').trim().toLowerCase() || 'admin';
    if (!k) { el.loginErr.hidden = false; el.loginErr.textContent = 'أدخل كلمة السر.'; return; }
    el.loginBtn.disabled = true; el.loginBtn.textContent = 'جارٍ التحقق…'; el.loginErr.hidden = true;
    const remember = el.loginRemember.checked;
    // a seller (e.g. Ali) only exists in the main store's script: the stock and the trip sales live there
    const stores = user === 'admin' ? STORES : STORES.slice(0, 1);
    S.who = { role: 'admin', user: 'admin', name: 'المدير' };
    const results = await Promise.allSettled(stores.map((s) => api(s, 'auth', { remember: remember, user: user }, k)));
    const tokens = {}, errs = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && isToken(r.value.token)) {
        tokens[stores[i].id] = r.value.token;
        if (stores[i].id === 'main') S.who = { role: r.value.role || 'admin', user: r.value.user || 'admin', name: r.value.name || 'المدير', perms: r.value.perms || [] };
      } else errs.push({ store: stores[i], e: r.status === 'rejected' ? r.reason : new ApiError('bad_reply') });
    });
    if (!Object.keys(tokens).length) {
      const first = errs.find((x) => isAuthErr(x.e)) || errs[0];
      el.loginErr.hidden = false; el.loginErr.textContent = first ? errText(first.e) : 'تعذّر الدخول.';
      el.loginBtn.disabled = false; el.loginBtn.textContent = 'دخول';
      el.loginKey.select();
      return;
    }
    // an order-confirmer also confirms the pliers orders: same user name / password in the other stores' scripts
    if (S.who.role !== 'admin' && (can('orders') || can('orders_add')) && tokens.main) {
      const others = STORES.slice(1);
      const more = await Promise.allSettled(others.map((s) => api(s, 'auth', { remember: remember, user: user }, k)));
      more.forEach((r, i) => {
        if (r.status === 'fulfilled' && isToken(r.value.token) && r.value.role !== 'admin') tokens[others[i].id] = r.value.token;
        else errs.push({ store: others[i], e: r.status === 'rejected' ? r.reason : new ApiError('forbidden') });
      });
    }
    S.tokens = tokens; S.storeErr = {};
    errs.forEach((x) => { S.storeErr[x.store.id] = errText(x.e); });
    keepTokens(remember);
    el.loginKey.value = '';
    startApp();
  });
  el.logout.addEventListener('click', () => signOut(''));

  // ---------- data ----------
  async function load(manual) {
    if (S.busy) return;
    const stores = activeStores();
    if (!stores.length) { signOut(''); return; }
    S.busy = true; S.busySince = Date.now(); setSync('busy'); el.refresh.classList.add('spin');
    const tick = setInterval(() => { if (S.busy) setSync('busy'); }, 1000);
    try {
      const results = await Promise.allSettled(stores.map((s) => api(s, 'list')));
      const prevIds = new Set(S.orders.map(keyOf));
      const wasLoaded = S.loaded;
      let list = [], okCount = 0, authFail = null;
      results.forEach((r, i) => {
        const st = stores[i];
        if (r.status === 'fulfilled') {
          okCount++;
          delete S.storeErr[st.id];
          const d = r.value;
          S.serverSkew = (Number(d.now) || Date.now()) - Date.now();
          S.today = d.today || dayOf(now());
          (d.orders || []).forEach((o) => {
            o.store = st.id;
            const p = S.pending[keyOf(o)];
            list.push(p ? Object.assign(o, { status: p.to }) : o);
          });
        } else {
          const e = r.reason;
          if (isAuthErr(e)) { if (e.code === 'expired' || e.code === 'bad_key') authFail = authFail || e; delete S.tokens[st.id]; }
          S.storeErr[st.id] = errText(e);
          // keep the last known orders of a store that failed this time
          S.orders.filter((o) => o.store === st.id).forEach((o) => list.push(o));
        }
      });
      if (!okCount) {
        if (authFail || !activeStores().length) { signOut(errText(authFail || results[0].reason)); return; }
        const msg = errText(results[0].reason);
        setSync('err', msg);
        if (manual || !S.loaded) toast(msg, true);
        if (!S.loaded) renderEmptyError(msg);
        return;
      }
      if (authFail) keepTokens(!!lsGet(LS_KEY));
      S.orders = list;
      if (!S.seen) { S.seen = { ts: list.reduce((m, o) => Math.max(m, o.ts || 0), 0), ids: [] }; saveSeen(); }
      const fresh = list.filter((o) => isNew(o) && (!wasLoaded || !prevIds.has(keyOf(o))));
      if (wasLoaded && fresh.length) {
        toast(fresh.length === 1 ? 'طلب جديد: ' + fresh[0].id + ' — ' + fresh[0].name : fresh.length + ' طلبات جديدة');
        ding();
      }
      S.loaded = true; S.lastSync = Date.now();
      render();
      if (S.open) { const o = byId(S.open); if (o) renderDrawer(o, true); }
      setSync(Object.keys(S.storeErr).length ? 'warn' : 'ok');
      if (manual) toast('تم تحديث الطلبات (' + list.length + ')');
    } finally { clearInterval(tick); S.busy = false; el.refresh.classList.remove('spin'); if (el.sync.classList.contains('is-busy')) setSync(Object.keys(S.storeErr).length ? 'warn' : 'ok'); }
  }
  // short beep when a new order arrives (only after the page has been clicked once: browsers block sound before that)
  let audio = null;
  document.addEventListener('pointerdown', () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }, { once: true });
  function ding() {
    if (!audio) return;
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.55);
    } catch (e) {}
  }
  function setSync(kind, msg) {
    el.sync.classList.toggle('is-err', kind === 'err');
    el.sync.classList.toggle('is-warn', kind === 'warn');
    el.sync.classList.toggle('is-busy', kind === 'busy');
    if (kind === 'busy') {
      const sec = Math.floor((Date.now() - (S.busySince || Date.now())) / 1000);
      el.syncTxt.textContent = (S.loaded ? 'جارٍ التحديث…' : 'جارٍ التحميل…') + (sec >= 3 ? ' ' + sec + ' ث' : '') + (sec >= 15 ? ' · Google بطيء، يُرجى الانتظار' : '');
    }
    else if (kind === 'ok' || kind === 'warn') el.syncTxt.textContent = 'محدَّث · ' + hm(Date.now()) + ' · تلقائي كل 60 ث';
    else el.syncTxt.textContent = (S.lastSync ? 'غير متصل منذ ' + hm(S.lastSync) + ' · ' : '') + (msg || 'خطأ');
    el.sync.title = el.syncTxt.textContent;
    renderStoreWarn();
  }
  function renderStoreWarn() {
    const ids = Object.keys(S.storeErr).filter((id) => storeOf(id));
    el.warn.hidden = !ids.length || el.app.hidden;
    el.warn.innerHTML = ids.map((id) => '<p><b>' + esc(storeOf(id).label) + ':</b> ' + esc(S.storeErr[id]) +
      (S.tokens[id] ? '' : ' <span>(طلبات هذا المتجر غير معروضة)</span>') + '</p>').join('');
  }
  // an order is known by store + number: both sheets can hold the same number (old main rows numbered PE-…)
  const keyOf = (o) => o.store + ':' + o.id;
  const byId = (k) => S.orders.find((o) => keyOf(o) === k);
  function isNew(o) { return !!S.seen && o.ts > S.seen.ts && S.seen.ids.indexOf(keyOf(o)) < 0; }
  function markSeen(id) {
    if (!S.seen) return;
    if (id) { if (S.seen.ids.indexOf(id) < 0) { S.seen.ids.push(id); S.seen.ids = S.seen.ids.slice(-300); } }
    else { S.seen = { ts: S.orders.reduce((m, o) => Math.max(m, o.ts || 0), S.seen.ts), ids: [] }; }
    saveSeen();
  }

  // ---------- filters ----------
  function inPeriod(o, p) {
    if (p === 'today') return o.day === S.today;
    if (p === '7d') return o.ts && o.ts >= now() - 7 * 864e5;
    if (p === '30d') return o.ts && o.ts >= now() - 30 * 864e5;
    return true;
  }
  // the store tab (الكل / المتجر الرئيسي / البانس)
  const inStore = (o) => S.store === 'all' || o.store === S.store;
  const storeOrders = () => S.orders.filter(inStore);
  function matchBase(o) {
    if (!inStore(o)) return false;
    if (S.product && o.product !== S.product) return false;
    if (S.from && (!o.day || o.day < S.from)) return false;
    if (S.to && (!o.day || o.day > S.to)) return false;
    if (S.q) {
      const q = norm(S.q), qd = digits(S.q);
      const hay = norm([o.id, o.name, o.city, o.product, o.note, srcLabel(o.source), o.source].join(' '));
      const words = q.split(/\s+/).filter(Boolean);
      const textOk = words.every((w) => hay.indexOf(w) >= 0);
      const telOk = qd.length >= 3 && /^[\d\s+().-]+$/.test(S.q) && (digits(o.phone).indexOf(qd) >= 0 || wa212(o.phone).indexOf(qd) >= 0);
      if (!textOk && !telOk) return false;
    }
    return true;
  }
  function filtered() {
    const base = S.orders.filter(matchBase);
    const list = S.status === 'all' ? base : S.status === 'new' ? base.filter(isNew) : base.filter((o) => o.status === S.status);
    const cmp = {
      new: (a, b) => (b.ts - a.ts) || (b.row - a.row), old: (a, b) => (a.ts - b.ts) || (a.row - b.row),
      tdesc: (a, b) => b.total - a.total, tasc: (a, b) => a.total - b.total,
      name: (a, b) => String(a.name).localeCompare(String(b.name), 'ar'),
      status: (a, b) => (STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)) || (b.ts - a.ts)
    }[S.sort];
    return { base: base, list: list.slice().sort(cmp) };
  }

  // ---------- stats ----------
  function stats(p) {
    const list = storeOrders().filter((o) => inPeriod(o, p) && (!S.product || o.product === S.product));
    const by = {}; STATUSES.forEach((s) => (by[s] = 0));
    let due = 0, paid = 0;
    list.forEach((o) => {
      by[o.status] = (by[o.status] || 0) + 1;
      if (o.status === 'تم التسليم') paid += o.total;
      else if (o.status !== 'ملغي' && o.status !== 'مرتجع') due += o.total;
    });
    return { orders: list.length, toConfirm: by['جديد'], inProgress: by['مؤكد'] + by['تم الشحن'], delivered: by['تم التسليم'], due: due, paid: paid, by: by };
  }

  // ---------- render ----------
  const PERIOD_LBL = { today: 'اليوم', '7d': 'آخر 7 أيام', '30d': 'آخر 30 يوماً', all: 'منذ البداية' };
  function renderProducts() {
    const names = Array.from(new Set(storeOrders().map((o) => o.product).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    if (S.product && names.indexOf(S.product) < 0) names.unshift(S.product);
    const html = '<option value="">كل المنتجات</option>' + names.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
    if (el.product.dataset.h !== html) { el.product.innerHTML = html; el.product.dataset.h = html; }
    el.product.value = S.product;
  }
  function renderStoreTabs() {
    if (!storeOf(S.store)) S.store = 'all';
    const tab = (id, label, n, off) => '<button type="button" role="tab" class="stab' + (S.store === id ? ' on' : '') + (off ? ' off' : '') + '" data-store="' + id + '" aria-selected="' + (S.store === id) + '">' +
      esc(label) + (off ? ' <em>غير متصل</em>' : ' <b>' + n + '</b>') + '</button>';
    el.storeTabs.innerHTML = tab('all', 'كل المتاجر', S.orders.length) +
      STORES.map((st) => tab(st.id, st.tab || st.label, S.orders.filter((o) => o.store === st.id).length, !S.tokens[st.id])).join('');
  }
  function render() {
    renderStoreTabs();
    el.period.querySelectorAll('button').forEach((b) => { const on = b.dataset.p === S.period; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    renderProducts();
    const st = stats(S.period), todayN = storeOrders().filter((o) => o.day === S.today && (!S.product || o.product === S.product)).length;
    const lbl = PERIOD_LBL[S.period];
    const closed = st.by['ملغي'] + st.by['مرتجع'];
    el.kpis.innerHTML = [
      '<div class="kpi dark"><span class="kpi-l">الطلبات</span><span class="kpi-v">' + st.orders + '</span><span class="kpi-s">' + esc(lbl) + (S.period === 'today' ? '' : ' · ' + todayN + ' اليوم') + '</span></div>',
      '<button type="button" class="kpi" data-go="جديد"><i class="kpi-dot" data-k="new"></i><span class="kpi-l">بانتظار التأكيد</span><span class="kpi-v">' + st.toConfirm + '</span><span class="kpi-s">حالة «جديد»</span></button>',
      '<button type="button" class="kpi" data-go="مؤكد"><i class="kpi-dot" data-k="ship"></i><span class="kpi-l">قيد التنفيذ</span><span class="kpi-v">' + st.inProgress + '</span><span class="kpi-s">' + st.by['مؤكد'] + ' مؤكد · ' + st.by['تم الشحن'] + ' تم شحنه</span></button>',
      '<button type="button" class="kpi" data-go="تم التسليم"><i class="kpi-dot" data-k="done"></i><span class="kpi-l">تم التسليم</span><span class="kpi-v">' + st.delivered + '</span><span class="kpi-s">' + closed + ' ملغي / مرتجع</span></button>',
      noMoney() ? '' : '<div class="kpi accent"><span class="kpi-l">مبالغ قيد التحصيل</span><span class="kpi-v">' + num(st.due) + '<small>درهم</small></span><span class="kpi-s">جديد + مؤكد + تم الشحن</span></div>',
      noMoney() ? '' : '<div class="kpi"><span class="kpi-l">المبالغ المحصّلة</span><span class="kpi-v">' + num(st.paid) + '<small>درهم</small></span><span class="kpi-s">الطلبات المسلَّمة</span></div>'
    ].join('');
    const f = filtered();
    const cnt = {}; STATUSES.forEach((s) => (cnt[s] = 0));
    f.base.forEach((o) => (cnt[o.status] = (cnt[o.status] || 0) + 1));
    const newN = S.orders.filter(isNew).length;
    const chip = (v, label, n, k) => '<button type="button" role="tab" class="chip' + (S.status === v ? ' on' : '') + '" data-st="' + esc(v) + '" aria-selected="' + (S.status === v) + '" data-k="' + k + '"><i></i>' + esc(label) + ' <b>' + n + '</b></button>';
    el.chips.innerHTML = chip('all', 'الكل', f.base.length, 'all') + (newN ? chip('new', 'غير مُطّلع عليها', f.base.filter(isNew).length, 'new') : '') + STATUSES.map((s) => chip(s, s, cnt[s], SKEY[s])).join('');
    el.newBadge.hidden = !newN;
    el.newBadge.textContent = newN === 1 ? 'طلب جديد' : newN === 2 ? 'طلبان جديدان' : newN + ' طلبات جديدة';
    el.newBadge.title = 'عرض الطلبات غير المُطّلع عليها';
    document.title = (newN ? '(' + newN + ') ' : '') + TITLE;
    const pages = Math.max(1, Math.ceil(f.list.length / PAGE));
    if (S.page >= pages) S.page = pages - 1;
    const slice = f.list.slice(S.page * PAGE, S.page * PAGE + PAGE);
    el.rows.innerHTML = slice.map(rowHtml).join('');
    el.empty.hidden = !!slice.length;
    if (!slice.length) el.empty.innerHTML = (S.store !== 'all' && !S.tokens[S.store]) ? '<strong>' + esc(storeOf(S.store).label) + ' غير متصل</strong>' + esc(S.storeErr[S.store] || 'حدّث سكربت Google الخاص بهذا المتجر، ثم سجّل الخروج والدخول من جديد.') : storeOrders().length ? '<strong>لا توجد نتائج</strong>لا يوجد طلب يطابق الفلاتر.' : '<strong>لا توجد طلبات بعد</strong>الطلبات المُرسلة من صفحات الموقع ستظهر هنا تلقائياً.';
    el.pager.innerHTML = '<span>' + (f.list.length ? (S.page * PAGE + 1) + '–' + (S.page * PAGE + slice.length) + ' من ' + f.list.length : '0') + ' طلب' +
      (f.list.length !== storeOrders().length ? ' (بعد التصفية، ' + storeOrders().length + ' إجمالاً)' : '') + '</span>' +
      (pages > 1 ? '<span class="pg"><button type="button" class="btn btn-ghost-d" data-pg="-1"' + (S.page ? '' : ' disabled') + '>› السابق</button><button type="button" class="btn btn-ghost-d" data-pg="1"' + (S.page < pages - 1 ? '' : ' disabled') + '>التالي ‹</button></span>' : '');
    renderStoreWarn();
  }
  function rowHtml(o) {
    const acts = '<button type="button" class="qbtn e" data-edit title="تعديل الطلب" aria-label="تعديل الطلب ' + esc(o.id) + '">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg><span>تعديل</span></button>' +
      (NEXT[o.status] || []).map((a) => '<button type="button" class="qbtn' + (a[2] ? ' x' : '') + '" data-to="' + esc(a[1]) + '"' + (S.pending[keyOf(o)] ? ' disabled' : '') + '>' + esc(a[0]) + '</button>').join('');
    return '<tr data-id="' + esc(keyOf(o)) + '" class="' + (isNew(o) ? 'is-new' : '') + (S.open === keyOf(o) ? ' is-open' : '') + '" tabindex="0">' +
      '<td class="c-id"><bdi>' + esc(o.id) + '</bdi>' + (isNew(o) ? '<span class="new-tag">جديد</span>' : '') + '<span class="c-date-m" dir="ltr">' + esc(o.recu) + '</span></td>' +
      '<td class="c-date"><span dir="ltr">' + esc(o.recu) + '</span></td>' +
      '<td class="c-name">' + esc(o.name || '—') + '</td>' +
      '<td class="c-tel"><span dir="ltr">' + esc(o.phone) + '</span></td>' +
      '<td class="c-city">' + esc(o.city || '—') + '</td>' +
      '<td class="c-art"><span>' + esc(o.product) + (o.qty > 1 ? ' <em>× ' + esc(o.qty) + '</em>' : '') + (o.sd ? ' <i class="sd-tag">+ SD</i>' : '') + '</span></td>' +
      '<td class="num c-tot">' + dh(o.total) + '</td>' +
      '<td class="c-st"><span class="pill' + (S.pending[keyOf(o)] ? ' pending' : '') + '" data-k="' + SKEY[o.status] + '">' + esc(o.status) + '</span>' + siftMini(o) + '</td>' +
      '<td class="c-act"><span class="qa">' + acts + '</span></td></tr>';
  }
  function renderEmptyError(msg) {
    el.rows.innerHTML = '';
    el.empty.hidden = false;
    el.empty.innerHTML = '<strong>تعذّر التحميل</strong>' + esc(msg);
  }
  function skeleton() {
    el.rows.innerHTML = Array.from({ length: 8 }, () => '<tr class="skel">' + '<td></td>'.repeat(9) + '</tr>').join('');
    el.kpis.innerHTML = Array.from({ length: 6 }, () => '<div class="kpi"><span class="kpi-l">&nbsp;</span><span class="kpi-v">–</span><span class="kpi-s">&nbsp;</span></div>').join('');
  }

  // ---------- drawer ----------
  let lastFocus = null;
  function openDrawer(id) {
    const o = byId(id); if (!o) return;
    if (!S.open) lastFocus = document.activeElement;
    S.open = id;
    if (isNew(o)) markSeen(id);
    renderDrawer(o);
    el.drawer.hidden = false; el.scrim.hidden = false; document.body.classList.add('no-scroll');
    el.drawer.scrollTop = 0;
    el.drawer.focus({ preventScroll: true });
    render();
  }
  function closeDrawer(silent) {
    if (!S.open && el.drawer.hidden) return;
    S.open = null; S.editing = null;
    el.drawer.hidden = true; el.scrim.hidden = true; document.body.classList.remove('no-scroll');
    if (!silent) { render(); if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); }
  }
  function waText(o) {
    return 'السلام عليكم ' + (o.name || '') + '، شكراً على طلبك رقم ' + o.id + ' من Prumysl: ' + o.product + (o.qty > 1 ? ' × ' + o.qty : '') + (o.sd ? ' + بطاقة ذاكرة SD' : '') +
      ' — المجموع ' + dh(o.total) + ' يُدفع عند الاستلام. هل يمكنك تأكيد الطلب وعنوان التوصيل' + (o.city ? ' في ' + o.city : '') + '؟ شكراً لك!';
  }
  function histHtml(o) {
    const h = (o.hist && o.hist.length ? o.hist : []).slice().reverse();
    h.push({ at: o.recu, by: 'site' });
    return h.map((x) => {
      const k = x.to && SKEY[x.to] ? SKEY[x.to] : '';
      const txt = x.by === 'site' ? 'تم استلام الطلب من الموقع' + (o.source ? ' (' + esc(srcLabel(o.source)) + ')' : '') : x.note ? esc(x.note) : (x.from ? esc(x.from) + ' ← ' : '') + '<b>' + esc(x.to) + '</b>' + (x.who ? ' <span class="muted">· ' + esc(x.who) + '</span>' : x.by === 'sift' ? ' <span class="muted">· SIFT</span>' : '');
      return '<li' + (k ? ' data-k="' + k + '"' : '') + '><span>' + txt + '</span><time dir="ltr">' + esc(x.at || '') + '</time></li>';
    }).join('');
  }
  // ---------- product catalog for the order forms (names + prices from « المنتجات ») ----------
  // products sold by the pliers store: their orders go to the pliers store (and its own SIFT account)
  const STORE_ITEMS = { pe: ['بانس'] };
  S.catalog = [];
  async function loadCatalog() {
    if (!S.tokens.main) return;
    try { const d = await api(STORES[0], 'catalog'); S.catalog = d.products || []; } catch (e) { /* older script: names from past orders only */ }
  }
  const same = (a, b) => norm(a).replace(/\s+/g, ' ').trim() === norm(b).replace(/\s+/g, ' ').trim();
  const isPeItem = (name) => STORE_ITEMS.pe.some((x) => same(x, name));
  function catalogFor(storeId) {
    const list = S.catalog.filter((p) => !p.sd && (storeId === 'pe' ? isPeItem(p.name) : !isPeItem(p.name)));
    if (storeId === 'pe' && !list.length) return [{ name: 'بانس', price: 269 }];
    return list;
  }
  const findItem = (storeId, name) => catalogFor(storeId).find((p) => same(p.name, name));
  // datalist: catalog products with their price first, then other names already used in this store's orders
  function productOptions(storeId) {
    const cat = catalogFor(storeId);
    const past = Array.from(new Set(S.orders.filter((x) => x.store === storeId).map((x) => x.product).filter(Boolean)))
      .filter((n) => !cat.some((p) => same(p.name, n))).sort((a, b) => a.localeCompare(b, 'ar'));
    return cat.map((p) => '<option value="' + esc(p.name) + '" label="' + esc(p.price ? num(p.price) + ' درهم' : 'السعر غير محدد') + '"></option>').join('') +
      past.map((n) => '<option value="' + esc(n) + '"></option>').join('');
  }
  // product picked → amount = price × quantity (until the amount is typed by hand)
  function autoAmount(f, storeId, productId, qtyId, totalId) {
    const it = findItem(storeId, f.querySelector('#' + productId).value);
    const tot = f.querySelector('#' + totalId);
    if (!it || !it.price || tot.dataset.manual === '1') return;
    tot.value = Math.round(it.price * (parseInt(f.querySelector('#' + qtyId).value, 10) || 1));
  }
  function onFormInput(e) {
    const f = e.target.closest('form'); if (!f) return;
    const id = e.target.id;
    if (f.id === 'manualForm') {
      const storeSel = f.querySelector('#mStore');
      if (id === 'mProduct' && storeSel && S.tokens.pe) {
        // pliers belong to the pliers store: switch it so « مؤكد » goes to the pliers SIFT account
        const want = isPeItem(e.target.value) ? 'pe' : findItem('main', e.target.value) ? 'main' : '';
        if (want && storeSel.value !== want) { storeSel.value = want; f.querySelector('#mProducts').innerHTML = productOptions(want); showStoreHint(f); }
      }
      if (id === 'mStore') { f.querySelector('#mProducts').innerHTML = productOptions(e.target.value); showStoreHint(f); }
      if (id === 'mTotal') e.target.dataset.manual = e.target.value === '' ? '' : '1';
      if (id === 'mProduct' || id === 'mQty' || id === 'mStore') autoAmount(f, (storeSel && storeSel.value) || STORES.find((s) => S.tokens[s.id]).id, 'mProduct', 'mQty', 'mTotal');
    } else if (f.id === 'editForm') {
      const o = byId(S.editing); if (!o) return;
      if (id === 'edTotal') e.target.dataset.manual = '1';
      if (id === 'edProduct') f.querySelector('#edTotal').dataset.manual = '';
      if (id === 'edProduct' || (id === 'edQty' && f.querySelector('#edTotal').dataset.manual === '')) autoAmount(f, o.store, 'edProduct', 'edQty', 'edTotal');
    }
  }
  function showStoreHint(f) {
    const h = f.querySelector('#mStoreHint'), s = f.querySelector('#mStore');
    if (h && s) h.textContent = 'سيُرسل إلى SIFT الخاص بـ ' + ((storeOf(s.value) || {}).label || '') + ' عند التأكيد.';
  }

  // ---------- manual order (WhatsApp / phone / shop) ----------
  function manualFormHtml() {
    const stores = STORES.filter((s) => S.tokens[s.id]);
    const first = stores[0] ? stores[0].id : 'main';
    const fld = (id, label, input, wide) => '<label class="efld' + (wide ? ' wide' : '') + '" for="' + id + '"><span>' + label + '</span>' + input + '</label>';
    return '<form class="d-card edit-card" id="manualForm" novalidate><div class="d-row"><span class="d-h">طلب يدوي جديد</span><button type="button" class="d-close dark" data-close aria-label="إغلاق">✕</button></div>' +
      '<div class="egrid">' +
        (stores.length > 1 ? fld('mStore', 'المتجر', '<select id="mStore">' + stores.map((s) => '<option value="' + s.id + '">' + esc(s.label) + '</option>').join('') + '</select><small class="muted" id="mStoreHint"></small>', 1) : '') +
        fld('mName', 'الاسم', '<input id="mName" maxlength="120" autocomplete="off">') +
        fld('mPhone', 'الهاتف *', '<input id="mPhone" dir="ltr" inputmode="tel" maxlength="16" autocomplete="off" placeholder="06XXXXXXXX">') +
        fld('mCity', 'المدينة / العنوان', '<textarea id="mCity" rows="2" maxlength="300"></textarea>', 1) +
        fld('mProduct', 'المنتج *', '<input id="mProduct" list="mProducts" maxlength="200" autocomplete="off"><datalist id="mProducts">' + productOptions(first) + '</datalist>', 1) +
        fld('mQty', 'الكمية', '<input id="mQty" type="number" min="1" max="999" step="1" value="1" inputmode="numeric" dir="ltr">') +
        fld('mTotal', 'المبلغ الإجمالي (درهم) *', '<input id="mTotal" type="number" min="0" step="1" inputmode="decimal" dir="ltr">') +
        fld('mSource', 'مصدر الطلب', '<select id="mSource"><option value="whatsapp">واتساب</option><option value="phone">هاتف</option><option value="shop">المحل</option><option value="other">آخر</option></select>') +
        fld('mStatus', 'الحالة', '<select id="mStatus"><option value="مؤكد">مؤكد — يُرسل إلى SIFT مباشرة</option><option value="جديد">جديد — للتأكيد لاحقاً</option></select>') +
      '</div>' +
      '<div class="efld wide"><span>بطاقة ذاكرة SD</span>' + sdRadios({ sd: false }, 'mSd') + '</div>' +
      fld('mNote', 'ملاحظة داخلية (اختياري)', '<textarea id="mNote" rows="2" maxlength="1000"></textarea>', 1) +
      '<p class="edit-err" id="manualErr" role="alert" hidden></p>' +
      '<div class="d-row edit-act"><button type="button" class="btn btn-ghost-d" data-close>إلغاء</button><button type="submit" class="btn btn-accent" id="manualSave">حفظ الطلب</button></div></form>';
  }
  function openManual() {
    if (!can('orders_add')) return;
    if (!S.open) lastFocus = document.activeElement;
    S.open = null; S.editing = null;
    el.drawer.innerHTML = manualFormHtml();
    showStoreHint(el.drawer.querySelector('#manualForm'));
    // fresh names + prices (they may have just been changed in « المنتجات »)
    loadCatalog().then(() => { const f = el.drawer.querySelector('#manualForm'); if (f) { const s = f.querySelector('#mStore'); f.querySelector('#mProducts').innerHTML = productOptions(s ? s.value : STORES.find((x) => S.tokens[x.id]).id); } });
    el.drawer.hidden = false; el.scrim.hidden = false; document.body.classList.add('no-scroll');
    el.drawer.scrollTop = 0;
    setTimeout(() => { const n = el.drawer.querySelector('#mName'); if (n) n.focus(); }, 60);
  }
  async function saveManual(f) {
    const v = (id) => (f.querySelector('#' + id) || {}).value || '';
    const errEl = f.querySelector('#manualErr'), btn = f.querySelector('#manualSave');
    const showErr = (m, id) => { errEl.hidden = false; errEl.textContent = m; if (id) f.querySelector('#' + id).focus(); };
    const phone = normPhone(v('mPhone'));
    const qty = parseInt(v('mQty'), 10) || 1;
    const total = parseFloat(String(v('mTotal')).replace(',', '.'));
    if (!/^0[5-7]\d{8}$/.test(phone)) return showErr(errText(new ApiError('bad_field', { field: 'phone' })), 'mPhone');
    if (!v('mProduct').trim()) return showErr(errText(new ApiError('bad_field', { field: 'product' })), 'mProduct');
    if (!(qty >= 1 && qty <= 999)) return showErr(errText(new ApiError('bad_field', { field: 'qty' })), 'mQty');
    if (!(total >= 0)) return showErr(errText(new ApiError('bad_field', { field: 'total' })), 'mTotal');
    const storeId = v('mStore') || STORES.find((s) => S.tokens[s.id]).id;
    errEl.hidden = true; btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      const d = await api(storeOf(storeId), 'order_add', {
        name: v('mName').trim(), phone: phone, city: v('mCity').replace(/\s+/g, ' ').trim(), product: v('mProduct').replace(/\s+/g, ' ').trim(),
        qty: qty, total: total, sd: (f.querySelector('input[name="mSd"]:checked') || {}).value === '1',
        source: v('mSource'), status: v('mStatus'), note: v('mNote').trim()
      });
      toast('تمت إضافة الطلب ' + ((d.order && d.order.id) || ''));
      if (d.sift && d.sift.tracking) toast('SIFT · رقم التتبع ' + d.sift.tracking);
      else if (d.sift && d.sift.error) toast('SIFT: ' + d.sift.error, true);
      closeDrawer(); load(false);
    } catch (e) {
      if (isAuthErr(e)) { signOut(errText(e)); return; }
      btn.disabled = false; btn.textContent = 'حفظ الطلب';
      showErr('لم يُحفظ الطلب. ' + errText(e), e.code === 'bad_field' ? { phone: 'mPhone', qty: 'mQty', total: 'mTotal', product: 'mProduct' }[e.data.field] : null);
    }
  }

  // ---------- SIFT.ma delivery (sift-api.gs) ----------
  function siftMini(o) {
    const s = o.sift;
    if (!s) return '';
    if (s.error && !s.tracking) return '<small class="sift-mini err" title="' + esc(s.message || s.error) + '">SIFT ⚠</small>';
    return '<small class="sift-mini">' + (s.label ? esc(s.label) : 'SIFT') + (s.tracking ? ' · <bdi dir="ltr">' + esc(s.tracking) + '</bdi>' : '') + '</small>';
  }
  function siftCard(o) {
    const s = o.sift;
    const canSift = (S.ver[o.store] || 0) >= 6;
    if (!s) {
      if (!canSift || o.status !== 'مؤكد') return '';
      return '<div class="d-card sift-card"><div class="d-row"><span class="d-h">التوصيل · SIFT</span><button type="button" class="btn btn-accent btn-sm" data-sift-push>إرسال إلى SIFT</button></div>' +
        '<small class="muted">لم يُرسل هذا الطلب بعد. الطلبات تُرسل تلقائياً عند «تأكيد».</small></div>';
    }
    return '<div class="d-card sift-card' + (s.error && !s.tracking ? ' bad' : '') + '"><div class="d-row"><span class="d-h">التوصيل · SIFT</span>' +
      (s.label ? '<span class="pill" data-k="' + (s.status === 'delivered' ? 'done' : /return|refused/.test(s.status) ? 'ret' : s.status === 'cancelled' ? 'canc' : 'ship') + '">' + esc(s.label) + '</span>' : '') + '</div>' +
      (s.tracking ? '<div class="d-row"><span>رقم التتبع</span><span><bdi dir="ltr" class="trk">' + esc(s.tracking) + '</bdi> <button type="button" class="qbtn x" data-copy="' + esc(s.tracking) + '">نسخ</button></span></div>' : '') +
      (s.error && !s.tracking ? '<p class="edit-err">' + esc(s.message || s.error) + '</p><div class="d-row edit-act"><small class="muted">صحّح المدينة أو الهاتف من «تعديل الطلب» ثم أعد الإرسال.</small><button type="button" class="btn btn-accent btn-sm" data-sift-push>إعادة الإرسال إلى SIFT</button></div>' : '') +
      '</div>';
  }
  async function siftPush(id) {
    const o = byId(id); if (!o) return;
    const btn = el.drawer.querySelector('[data-sift-push]'); if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الإرسال…'; }
    try {
      const d = await api(storeOf(o.store), 'sift_push', { id: o.id });
      Object.assign(o, d.order, { store: o.store });
      if (o.sift && o.sift.tracking) toast('SIFT · ' + o.id + ' · رقم التتبع ' + o.sift.tracking);
      else toast('SIFT · ' + o.id + ': ' + ((o.sift && o.sift.message) || 'لم يُحجز بعد'), true);
    } catch (e) {
      toast(errText(e), true);
      if (isAuthErr(e)) { signOut(errText(e)); return; }
    }
    render(); if (S.open === id) renderDrawer(o);
  }

  function sdRadios(o, name, disabled) {
    return '<div class="sd-pick" role="radiogroup" aria-label="بطاقة ذاكرة SD">' +
      [[true, 'نعم، مع بطاقة SD'], [false, 'لا، بدون بطاقة']].map((x) => '<label class="rad' + (o.sd === x[0] ? ' on' : '') + '"><input type="radio" name="' + name + '" value="' + (x[0] ? '1' : '0') + '"' +
        (o.sd === x[0] ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span>' + x[1] + '</span></label>').join('') + '</div>';
  }
  // "تعديل الطلب": name, phone, city / address, product, quantity, amount, SD card
  function editFormHtml(o) {
    const fld = (id, label, input, wide) => '<label class="efld' + (wide ? ' wide' : '') + '" for="' + id + '"><span>' + label + '</span>' + input + '</label>';
    return '<form class="d-card edit-card" id="editForm" novalidate><div class="d-row"><span class="d-h">تعديل الطلب <bdi>' + esc(o.id) + '</bdi></span></div>' +
      '<div class="egrid">' +
        fld('edName', 'الاسم', '<input id="edName" maxlength="120" autocomplete="off" value="' + esc(o.name) + '">') +
        fld('edPhone', 'الهاتف', '<input id="edPhone" dir="ltr" inputmode="tel" maxlength="16" autocomplete="off" value="' + esc(o.phone) + '">') +
        fld('edCity', 'المدينة / العنوان', '<textarea id="edCity" rows="2" maxlength="300">' + esc(o.city) + '</textarea>', 1) +
        fld('edProduct', 'المنتج', '<input id="edProduct" list="edProducts" maxlength="200" autocomplete="off" value="' + esc(o.product) + '"><datalist id="edProducts">' + productOptions(o.store) + '</datalist>', 1) +
        fld('edQty', 'الكمية', '<input id="edQty" type="number" min="1" max="999" step="1" inputmode="numeric" dir="ltr" value="' + esc(o.qty) + '">') +
        fld('edTotal', 'المبلغ الإجمالي (درهم)', '<input id="edTotal" type="number" min="0" step="1" inputmode="decimal" dir="ltr" value="' + esc(o.total) + '">') +
      '</div>' +
      '<div class="efld wide"><span>بطاقة ذاكرة SD</span>' + sdRadios(o, 'edSd') + '</div>' +
      '<p class="edit-err" id="editErr" role="alert" hidden></p>' +
      '<div class="d-row edit-act"><button type="button" class="btn btn-ghost-d" data-edit-cancel>إلغاء</button><button type="submit" class="btn btn-accent" data-edit-save>حفظ التعديلات</button></div></form>';
  }
  function renderDrawer(o, fromRefresh) {
    if (fromRefresh && S.editing === keyOf(o)) return;   // never wipe the edit form while typing
    const ta = el.drawer.querySelector('#noteTa');
    const editing = fromRefresh && ta && (document.activeElement === ta || ta.value !== ta.defaultValue);
    const draft = editing ? ta.value : null;
    const tel = digits(o.phone);
    const unit = o.qty > 0 ? o.total / o.qty : o.total;
    const store = storeOf(o.store);
    el.drawer.innerHTML =
      '<div class="d-card d-head"><div class="d-row"><div><div class="d-id"><bdi>' + esc(o.id) + '</bdi> · <span dir="ltr">' + esc(o.recu) + '</span></div><h2 class="d-name" id="dTitle">' + esc(o.name || 'بدون اسم') + '</h2></div>' +
        '<button type="button" class="d-close" data-close aria-label="إغلاق (Esc)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>' +
        '<div class="d-row"><span class="d-meta"><span dir="ltr">' + esc(o.phone) + '</span> · ' + esc(o.city || '—') + '</span><span class="pill' + (S.pending[keyOf(o)] ? ' pending' : '') + '" data-k="' + SKEY[o.status] + '">' + esc(o.status) + '</span></div>' +
        '<div class="d-contact"><a class="btn btn-white" href="tel:' + esc(tel) + '">اتصال</a>' +
        '<a class="btn btn-wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + esc(wa212(o.phone)) + '?text=' + encodeURIComponent(waText(o)) + '">واتساب</a>' +
        '<button type="button" class="btn btn-ghost" data-copy="' + esc(o.phone) + '">نسخ الرقم</button></div></div>' +
      siftCard(o) +
      '<div class="d-card"><span class="d-h">الحالة</span><div class="d-status">' +
        STATUSES.map((s) => '<button type="button" class="sbtn' + (s === o.status ? ' on' : '') + '" data-k="' + SKEY[s] + '" data-to="' + esc(s) + '" aria-pressed="' + (s === o.status) + '"' + (S.pending[keyOf(o)] ? ' disabled' : '') + '>' + esc(s) + '</button>').join('') +
      '</div></div>' +
      (S.editing === keyOf(o) ? editFormHtml(o) :
      '<div class="d-card"><div class="d-row"><span class="d-h">المنتج</span><button type="button" class="btn btn-dark btn-sm" data-edit>✎ تعديل الطلب</button></div><div class="items">' +
        '<div class="item"><b>' + esc(o.product || '—') + (o.sd ? ' <i class="sd-tag">+ SD</i>' : '') + '</b><b>' + (o.qty > 1 ? '× ' + esc(o.qty) : '') + '</b><span>' + (o.qty > 1 ? 'سعر الوحدة ' + dh(unit) : 'قطعة واحدة') + '</span></div>' +
      '</div><div class="sd-row"><span>بطاقة ذاكرة SD</span>' + sdRadios(o, 'sdQuick', S.pending[keyOf(o)]) + '</div>' +
      '<div class="tots"><div><span>الكمية</span><span>' + esc(o.qty) + '</span></div>' +
        '<div><span>التوصيل</span><span>مجاني</span></div>' +
        '<div class="grand"><span>المبلغ المطلوب تحصيله</span><span>' + dh(o.total) + '</span></div></div></div>') +
      '<div class="d-card note"><div class="d-row"><span class="d-h">ملاحظة داخلية</span><small>' + (o.updated ? 'آخر تحديث <span dir="ltr">' + esc(o.updated) + '</span>' : '') + '</small></div>' +
        '<textarea id="noteTa" maxlength="1000" placeholder="مثال: الاتصال بعد الساعة 6 مساءً، العنوان بالتفصيل…">' + esc(o.note) + '</textarea>' +
        '<div class="d-row"><small>تظهر فقط في لوحة الإدارة وفي عمود Note بالجدول.</small><button type="button" class="btn btn-dark" data-note>حفظ الملاحظة</button></div></div>' +
      '<div class="d-card"><span class="d-h">السجل</span><ul class="hist">' + histHtml(o) + '</ul></div>' +
      '<div class="d-card"><span class="d-h">بيانات السطر في Google Sheet</span><dl class="fields">' +
        [['تاريخ الاستلام', o.recu, 0, 1], ['رقم الطلب', o.id, 0, 1], ['الاسم', o.name || '—'], ['الهاتف', o.phone, 0, 1], ['المدينة', o.city || '—'], ['الكمية', o.qty],
         ['المنتج', o.product || '—', 1], ['المبلغ (درهم)', o.total, 0, 1], ['بطاقة SD', o.sd ? 'نعم' : 'لا'], ['المتجر', store ? store.label : '—'], ['المصدر', srcLabel(o.source)], ['رقم السطر', o.row, 0, 1]]
          .map((f) => '<div' + (f[2] ? ' class="wide"' : '') + '><dt>' + esc(f[0]) + '</dt><dd' + (f[3] ? ' dir="ltr"' : '') + '>' + esc(f[1]) + '</dd></div>').join('') +
      '</dl></div>';
    if (draft != null) { const nt = el.drawer.querySelector('#noteTa'); if (nt) nt.value = draft; }
  }

  // ---------- actions ----------
  async function setStatus(id, to) {
    const o = byId(id);
    if (!o || o.status === to || S.pending[id]) return;
    const prev = { status: o.status, hist: o.hist, updated: o.updated };
    S.pending[id] = { to: to };
    o.status = to;
    o.hist = (o.hist || []).concat([{ at: '…', from: prev.status, to: to }]);
    render(); if (S.open === id) renderDrawer(o);
    try {
      const d = await api(storeOf(o.store), 'update', { id: o.id, status: to });
      delete S.pending[id];
      const cur = byId(id);
      if (cur) Object.assign(cur, d.order, { store: o.store });
      toast(o.id + ' ← ' + to);
      if (d.sift && d.sift.tracking) toast('SIFT · ' + o.id + ' · رقم التتبع ' + d.sift.tracking);
      else if (d.sift && d.sift.error) toast('SIFT · ' + o.id + ': ' + d.sift.error, true);
    } catch (e) {
      delete S.pending[id];
      const cur = byId(id);
      if (cur) Object.assign(cur, prev);
      toast('فشل التحديث، تمت إعادة الحالة (' + prev.status + '). ' + errText(e), true);
      if (isAuthErr(e)) { signOut(errText(e)); return; }
    }
    render(); const cur = byId(id); if (S.open === id && cur) renderDrawer(cur);
  }
  // ---------- edit order ----------
  function startEdit(id) {
    const o = byId(id); if (!o) return;
    if (!canEdit(o)) { toast(errText(new ApiError('old_script_edit')), true); return; }
    if (S.open !== id) openDrawer(id);
    S.editing = id;
    renderDrawer(o);
    loadCatalog().then(() => { const f = el.drawer.querySelector('#editForm'); const dl = f && f.querySelector('#edProducts'); if (dl) dl.innerHTML = productOptions(o.store); });
    const f = el.drawer.querySelector('#editForm');
    if (f) { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => { const n = el.drawer.querySelector('#edName'); if (n) n.focus({ preventScroll: true }); }, 60); }
  }
  function cancelEdit() {
    const o = byId(S.editing); S.editing = null;
    if (o && S.open === keyOf(o)) renderDrawer(o);
  }
  function normPhone(p) {
    let d = digits(p);
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('212') && d.length === 12) d = '0' + d.slice(3);
    if (d.length === 9 && /^[5-7]/.test(d)) d = '0' + d;
    return d;
  }
  async function sendEdit(o, edit, okMsg) {
    const d = await api(storeOf(o.store), 'update', { id: o.id, edit: edit });
    Object.assign(o, d.order, { store: o.store });
    toast(okMsg + ' · ' + o.id);
  }
  async function saveEdit() {
    const o = byId(S.editing); if (!o) return;
    const f = el.drawer.querySelector('#editForm'), err = el.drawer.querySelector('#editErr'), btn = f.querySelector('[data-edit-save]');
    const val = (id) => f.querySelector('#' + id).value;
    const showErr = (m, id) => { err.hidden = false; err.textContent = m; if (id) f.querySelector('#' + id).focus(); };
    const v = {
      name: val('edName').replace(/\s+/g, ' ').trim(), city: val('edCity').replace(/\s+/g, ' ').trim(), phone: normPhone(val('edPhone')),
      product: val('edProduct').replace(/\s+/g, ' ').trim(), qty: parseInt(val('edQty'), 10), total: parseFloat(String(val('edTotal')).replace(',', '.')),
      sd: (f.querySelector('input[name="edSd"]:checked') || {}).value === '1'
    };
    if (!/^0[5-7]\d{8}$/.test(v.phone)) return showErr(errText(new ApiError('bad_field', { field: 'phone' })), 'edPhone');
    if (!v.product) return showErr(errText(new ApiError('bad_field', { field: 'product' })), 'edProduct');
    if (!(v.qty >= 1 && v.qty <= 999)) return showErr(errText(new ApiError('bad_field', { field: 'qty' })), 'edQty');
    if (!(v.total >= 0 && v.total <= 1000000)) return showErr(errText(new ApiError('bad_field', { field: 'total' })), 'edTotal');
    const edit = {};
    Object.keys(v).forEach((k) => { if (String(v[k]) !== String(k === 'sd' ? !!o.sd : o[k] == null ? '' : o[k])) edit[k] = v[k]; });
    if (!Object.keys(edit).length) { toast('لا توجد تعديلات'); cancelEdit(); return; }
    err.hidden = true; btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      await sendEdit(o, edit, 'تم حفظ تعديلات الطلب');
      S.editing = null;
      render(); if (S.open === keyOf(o)) renderDrawer(o);
    } catch (e) {
      if (isAuthErr(e)) { signOut(errText(e)); return; }
      btn.disabled = false; btn.textContent = 'حفظ التعديلات';
      showErr('لم يتم الحفظ. ' + errText(e), e.code === 'bad_field' ? { phone: 'edPhone', qty: 'edQty', total: 'edTotal', product: 'edProduct' }[e.data.field] : null);
    }
  }
  async function setSd(id, on) {
    const o = byId(id);
    if (!o || !!o.sd === on || S.pending[id]) return;
    if (!canEdit(o)) { toast(errText(new ApiError('old_script_edit')), true); renderDrawer(o); return; }
    const prev = o.sd;
    S.pending[id] = { to: o.status };
    o.sd = on; render(); renderDrawer(o);
    try {
      await sendEdit(o, { sd: on }, on ? 'تمت إضافة بطاقة SD' : 'تمت إزالة بطاقة SD');
    } catch (e) {
      o.sd = prev;
      toast('لم يتم الحفظ. ' + errText(e), true);
      if (isAuthErr(e)) { delete S.pending[id]; signOut(errText(e)); return; }
    }
    delete S.pending[id];
    render(); if (S.open === id) renderDrawer(o);
  }

  async function saveNote(id) {
    const o = byId(id); const ta = el.drawer.querySelector('#noteTa'); const btn = el.drawer.querySelector('[data-note]');
    if (!o || !ta) return;
    const note = ta.value.trim();
    if (note === (o.note || '')) { toast('لم تتغيّر الملاحظة'); return; }
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      const d = await api(storeOf(o.store), 'update', { id: o.id, note: note });
      Object.assign(o, d.order, { store: o.store });
      toast('تم حفظ الملاحظة · ' + o.id);
      if (S.open === id) renderDrawer(o);
    } catch (e) {
      toast('لم يتم حفظ الملاحظة. ' + errText(e), true);
      if (isAuthErr(e)) { signOut(errText(e)); return; }
      btn.disabled = false; btn.textContent = 'حفظ الملاحظة';
    }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} t.remove();
    }
    toast('تم نسخ الرقم: ' + text);
  }
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                    // no formulas when opened in Excel / Sheets
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    const list = filtered().list;
    if (!list.length) { toast('لا يوجد ما يُصدَّر', true); return; }
    const head = ['تاريخ الاستلام', 'رقم الطلب', 'الاسم', 'الهاتف', 'المدينة', 'المنتج', 'بطاقة SD', 'الكمية', 'المبلغ (درهم)', 'الحالة', 'ملاحظة داخلية', 'آخر تحديث', 'المصدر', 'المتجر'];
    const lines = [head].concat(list.map((o) => [o.recu, o.id, o.name, o.phone, o.city, o.product, o.sd ? 'نعم' : 'لا', o.qty, o.total, o.status, o.note, o.updated, srcLabel(o.source), (storeOf(o.store) || {}).label || '']));
    const csv = '﻿' + lines.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'prumysl-orders-' + (S.store !== 'all' ? S.store + '-' : '') + dayOf(now()) + (S.status !== 'all' && SKEY[S.status] ? '-' + SKEY[S.status] : '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('تم تصدير ' + list.length + ' طلب (CSV)');
  }

  // ---------- events ----------
  el.period.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; S.period = b.dataset.p; try { localStorage.setItem(LS_PERIOD, S.period); } catch (x) {} render(); });
  el.kpis.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return;
    S.status = b.dataset.go; S.page = 0; render();
    document.querySelector('.board').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  el.chips.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; S.status = b.dataset.st; S.page = 0; render(); });
  el.newBadge.addEventListener('click', () => { S.status = 'new'; S.sort = 'new'; el.sort.value = 'new'; S.page = 0; render(); });
  let qT;
  el.q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { S.q = el.q.value.trim(); S.page = 0; render(); }, 120); });
  el.from.addEventListener('change', () => { S.from = el.from.value; S.page = 0; render(); });
  el.to.addEventListener('change', () => { S.to = el.to.value; S.page = 0; render(); });
  el.sort.addEventListener('change', () => { S.sort = el.sort.value; S.page = 0; render(); });
  el.storeTabs.addEventListener('click', (e) => { const b = e.target.closest('[data-store]'); if (!b) return;
    S.store = b.dataset.store; S.product = ''; S.status = 'all'; S.page = 0; try { localStorage.setItem(LS_STORE, S.store); } catch (x) {} render(); });
  el.product.addEventListener('change', () => { S.product = el.product.value; S.page = 0; render(); });
  el.reset.addEventListener('click', () => { S.q = S.from = S.to = S.product = ''; S.status = 'all'; S.sort = 'new'; S.page = 0; el.q.value = el.from.value = el.to.value = ''; el.sort.value = 'new'; markSeen(); render(); });
  el.csv.addEventListener('click', exportCsv);
  el.refresh.addEventListener('click', () => { if (el.ordersView.hidden && window.PRUMYSL_STOCK) window.PRUMYSL_STOCK.refresh(true); else load(true); });
  el.pager.addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; S.page += +b.dataset.pg; render(); el.table.scrollIntoView({ block: 'nearest' }); });
  el.rows.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    if (e.target.closest('[data-edit]')) { e.stopPropagation(); startEdit(tr.dataset.id); return; }
    const q = e.target.closest('[data-to]');
    if (q) { e.stopPropagation(); setStatus(tr.dataset.id, q.dataset.to); return; }
    openDrawer(tr.dataset.id);
  });
  el.rows.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-id]')) { e.preventDefault(); openDrawer(e.target.dataset.id); } });
  el.scrim.addEventListener('click', () => closeDrawer());
  el.drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeDrawer();
    if (e.target.closest('[data-edit-cancel]')) return cancelEdit();
    if (e.target.closest('[data-edit]') && S.open) return startEdit(S.open);
    const s = e.target.closest('[data-to]'); if (s && S.open) return setStatus(S.open, s.dataset.to);
    if (e.target.closest('[data-note]') && S.open) return saveNote(S.open);
    const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
    if (e.target.closest('[data-sift-push]') && S.open) return siftPush(S.open);
  });
  el.drawer.addEventListener('input', onFormInput);
  el.drawer.addEventListener('change', (e) => { if (e.target.id === 'mStore') onFormInput(e); });
  el.drawer.addEventListener('change', (e) => {
    const r = e.target.closest('input[type="radio"]'); if (!r || !S.open) return;
    r.closest('.sd-pick').querySelectorAll('.rad').forEach((l) => l.classList.toggle('on', l.contains(r)));
    if (r.name === 'sdQuick') setSd(S.open, r.value === '1');
  });
  el.drawer.addEventListener('submit', (e) => { if (e.target.id === 'editForm') { e.preventDefault(); saveEdit(); } else if (e.target.id === 'manualForm') { e.preventDefault(); saveManual(e.target); } });
  el.manual.addEventListener('click', openManual);
  document.addEventListener('keydown', (e) => {
    if (el.app.hidden || el.ordersView.hidden) return;
    if (e.key === 'Escape') { if (S.editing) { e.preventDefault(); cancelEdit(); } else if (S.open || !el.drawer.hidden) { e.preventDefault(); closeDrawer(); } return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    // physical keys, so the shortcuts also work with an Arabic keyboard layout
    if (e.code === 'Slash' || e.key === '/') { e.preventDefault(); el.q.focus(); el.q.select(); }
    else if (e.code === 'KeyR') { e.preventDefault(); load(true); }
  });

  // ---------- auto refresh (new orders from the site appear within 60 s) ----------
  let timer = null;
  function startTimer() { stopTimer(); timer = setInterval(() => { if (!document.hidden && !el.app.hidden && !isSeller()) load(false); }, REFRESH_MS); }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !el.app.hidden && !isSeller() && activeStores().length && Date.now() - S.lastSync > REFRESH_MS) load(false); });

  function startApp() {
    el.login.hidden = true; el.app.hidden = false;
    if (isSeller()) {
      // a seller never loads the orders: only the trip screen (his sales + the van stock)
      el.ordersView.hidden = true; el.sync.hidden = true; el.newBadge.hidden = true;
      if (window.PRUMYSL_STOCK) window.PRUMYSL_STOCK.start();
      return;
    }
    el.sync.hidden = false;
    el.csv.hidden = noMoney();
    el.manual.hidden = !can('orders_add');
    const tag = document.querySelector('.top-tag'); if (tag) tag.textContent = S.who.role !== 'admin' ? S.who.name : 'الإدارة';
    if (window.PRUMYSL_STOCK) window.PRUMYSL_STOCK.start();
    if (!S.loaded) skeleton();
    render(); load(false); startTimer();
  }

  // ---------- boot ----------
  const saved = storedTokens();
  const who = storedWho();
  if (who) S.who = who;
  STORES.forEach((s) => { if (isToken(saved[s.id]) && (!isSeller() || s.id === 'main')) S.tokens[s.id] = saved[s.id]; });
  if (activeStores().length) startApp(); else showLogin('');

  // bridge for stock.js (المخزون، مبيعات الرحلة، المنتجات، البائعون)
  window.PRUMYSL = {
    api: (action, extra) => api(STORES[0], action, extra), ApiError: ApiError,
    apiFor: (storeId, action, extra) => api(storeOf(storeId), action, extra), stores: STORES.map((s) => ({ id: s.id, label: s.label })),
    isConnected: (storeId) => !!S.tokens[storeId], errText: errText, isAuthErr: isAuthErr, signOut: signOut,
    esc: esc, num: num, dh: dh, toast: toast, dayOf: dayOf, now: now, hm: hm, norm: norm,
    get who() { return S.who; }, get connected() { return !!S.tokens.main; }, get version() { return S.ver.main || 0; },
    showOrders: (on) => { el.ordersView.hidden = !on || isSeller(); el.sync.hidden = !on || isSeller(); if (on && !isSeller()) render(); },
    reloadOrders: () => { if (!isSeller()) load(false); }
  };

  window.__prumyslOrdersAdmin = { get orders() { return S.orders; }, reload: load, stats: stats, filtered: filtered };    // for tests / console
})();
