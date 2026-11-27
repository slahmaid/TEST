/* Prumysl — المخزون ومبيعات الرحلة (stock, road-trip sales, products, seller accounts).
   Uses the bridge window.PRUMYSL from admin.js and the main store's Google script (stock-api.gs + admin-api.gs v5).
   Admin: everything. Seller (e.g. Ali): records sales from the shared van stock, sees only his own sales and the van stock. */
(function () {
  'use strict';
  const P = window.PRUMYSL;
  if (!P) return;
  const { esc, dh, num, toast, errText, isAuthErr } = P;
  const $ = (s, r) => (r || document).querySelector(s);
  const root = $('#stockView'), nav = $('#viewNav'), topTitle = $('#topTitle');
  const LOCS = { depot: 'المستودع', shop: 'المحل', van: 'السيارة' };
  const LOW = 2;                       // van stock at or under this is shown in orange
  const LS_VIEW = 'prumysl-admin-view';
  const VIEWS_ADMIN = [['orders', 'الطلبات'], ['trip', 'المبيعات اليومية'], ['stock', 'المخزون'], ['products', 'المنتجات'], ['sellers', 'البائعون'], ['delivery', 'التوصيل (SIFT)']];
  const TITLES = { orders: 'الطلبات', trip: 'المبيعات اليومية', stock: 'المخزون', products: 'المنتجات', sellers: 'البائعون', delivery: 'التوصيل · SIFT' };

  const S = { view: 'orders', products: [], sellers: [], sales: [], summary: null, moves: [], day: '', dayTo: '', loaded: {}, busy: false,
    modal: null, moveFilter: '', editProduct: null, sift: {}, siftBusy: '' };
  const isAdmin = () => P.who.role === 'admin';
  // permissions ticked per account in « البائعون » (admin-api.gs › ADMIN_PERMS); the admin has them all
  const can = (p) => isAdmin() || (P.who.perms || []).indexOf(p) >= 0;
  const PERMS = [
    ['orders', 'الطلبات', 'الطلبات: عرض، تأكيد، إلغاء، تعديل، ملاحظات، إرسال إلى SIFT'],
    ['orders_add', 'طلب يدوي', 'إضافة طلب يدوي (واتساب / هاتف / المحل)'],
    ['orders_money', 'المبالغ', 'رؤية المبالغ الإجمالية للطلبات وتصدير CSV'],
    ['sales', 'المبيعات', 'تسجيل المبيعات من السيارة (يرى مبيعاته هو)'],
    ['sales_all', 'كل المبيعات', 'رؤية كل المبيعات والإيرادات وإلغاؤها'],
    ['stock_view', 'رؤية المخزون', 'رؤية المخزون كاملاً (المستودع، المحل، السيارة) وحركاته'],
    ['stock_edit', 'تعديل المخزون', 'إضافة / نقل / جرد / إخراج المخزون، والبيع من أي مكان'],
    ['products', 'المنتجات', 'إضافة المنتجات وتغيير الأسعار']
  ];
  const PRESETS = { seller: ['sales'], confirmer: ['orders', 'orders_add'], custom: [] };
  const permLabel = (k) => (PERMS.find((p) => p[0] === k) || [k, k])[1];
  // the screens this account can open
  function allowed() {
    if (isAdmin()) return VIEWS_ADMIN.map((v) => v[0]);
    const v = [];
    if (can('orders') || can('orders_add')) v.push('orders');
    if (can('sales') || can('sales_all')) v.push('trip');
    if (can('stock_view') || can('stock_edit')) v.push('stock');
    if (can('products')) v.push('products');
    return v.length ? v : ['trip'];
  }
  const prodById = (id) => S.products.find((p) => p.id === id);
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function today() { return P.dayOf(P.now()); }

  async function call(action, extra) {
    try { return await P.api(action, extra); }
    catch (e) {
      if (isAuthErr(e)) { P.signOut(errText(e)); throw e; }
      if (e.code === 'bad_action' || (P.version && P.version < 5)) e.message = 'old';
      throw e;
    }
  }
  function err(e) {
    if (e && (e.message === 'old' || e.code === 'bad_action')) return 'المخزون يحتاج تحديث سكربت Google: أضف ملف stock-api.gs والنسخة الجديدة من admin-api.gs في مشروع المتجر الرئيسي، ثم Deploy › New version.';
    if (e && e.code === 'bad_field') return ({ name: 'اسم المنتج مطلوب.', price: 'السعر غير صحيح.', qty: 'الكمية غير صحيحة.', to: 'اختر المكان.', from: 'اختر المكان.', seller_id: 'اسم المستخدم: حروف لاتينية صغيرة وأرقام فقط (مثال: ali).', password: 'كلمة السر 6 أحرف على الأقل.' })[e.data.field] || errText(e);
    return errText(e);
  }

  // ---------- navigation ----------
  function renderNav() {
    const ok = allowed();
    if (ok.length < 2) { nav.hidden = true; return; }
    nav.hidden = false;
    nav.innerHTML = VIEWS_ADMIN.filter((v) => ok.indexOf(v[0]) >= 0).map((v) => '<button type="button" role="tab" class="vtab' + (S.view === v[0] ? ' on' : '') + '" data-view="' + v[0] + '" aria-selected="' + (S.view === v[0]) + '">' + v[1] + '</button>').join('');
  }
  function go(view) {
    const ok = allowed();
    if (ok.indexOf(view) < 0) view = ok[0];
    S.view = view;
    try { localStorage.setItem(LS_VIEW, view); } catch (e) {}
    renderNav();
    topTitle.textContent = ok.length === 1 && view === 'trip' ? 'مبيعات الرحلة' : TITLES[view];
    const tag = document.querySelector('.top-tag'); if (tag) tag.textContent = isAdmin() ? 'الإدارة' : P.who.name || 'الحساب';
    const orders = view === 'orders';
    P.showOrders(orders);
    root.hidden = orders;
    if (orders) return;
    render();
    refresh(false);
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); });

  // ---------- data ----------
  async function refresh(manual) {
    if (S.busy || S.view === 'orders') return;
    S.busy = true;
    const view = S.view;
    try {
      if (view === 'delivery') {
        // one card per store; a store whose script is old or not connected shows its own message
        const res = await Promise.allSettled(P.stores.map((st) => P.isConnected(st.id) ? P.apiFor(st.id, 'sift_status') : Promise.reject({ code: 'not_connected' })));
        res.forEach((r, i) => { S.sift[P.stores[i].id] = r.status === 'fulfilled' ? r.value : { failed: r.reason && r.reason.code === 'not_connected' ? 'هذا المتجر غير متصل باللوحة.' : err(r.reason) }; });
        S.loaded.delivery = true; S.error = '';
        if (manual) toast('تم التحديث');
        return;
      }
      const jobs = [call('stock_view').then((d) => { S.products = d.products || []; if (d.sellers) S.sellers = d.sellers; })];
      if (view === 'trip') jobs.push(call('sales_list', { from: S.day || today(), to: S.dayTo || S.day || today() }).then((d) => { S.sales = d.sales || []; S.summary = d.summary; }));
      if (view === 'stock') jobs.push(call('moves_list', { limit: 120 }).then((d) => { S.moves = d.moves || []; }));
      if (view === 'sellers') jobs.push(call('sellers_list').then((d) => { S.sellers = d.sellers || []; }));
      await Promise.all(jobs);
      S.loaded[view] = true; S.error = '';
      if (manual) toast('تم التحديث');
    } catch (e) {
      S.error = err(e);
      if (manual || !S.loaded[view]) toast(S.error, true);
    } finally {
      S.busy = false;
      if (S.view === view) render();
    }
  }

  // ---------- render ----------
  function render() {
    if (S.view === 'orders') return;
    const body = { trip: tripHtml, stock: stockHtml, products: productsHtml, sellers: sellersHtml, delivery: deliveryHtml }[S.view]();
    const errBox = S.error ? '<div class="store-warn"><p>' + esc(S.error) + '</p></div>' : '';
    const keep = captureForm();
    root.innerHTML = errBox + body + (S.modal ? modalHtml() : '');
    restoreForm(keep);
  }
  // keep what is being typed in the sale form when the screen is redrawn
  function captureForm() {
    const f = root.querySelector('#saleForm');
    if (!f) return null;
    const v = {};
    f.querySelectorAll('input, select, textarea').forEach((x) => { if (x.id) v[x.id] = x.value; });
    return v;
  }
  function restoreForm(v) {
    if (!v) return;
    Object.keys(v).forEach((id) => { const x = root.querySelector('#' + id); if (x) x.value = v[id]; });
    updateSaleTotal();
  }
  const loading = (what) => '<div class="empty"><strong>جارٍ التحميل…</strong>' + esc(what) + '</div>';
  const qtyCls = (n) => (n < 0 ? ' neg' : n <= LOW ? ' low' : '');

  // ===== المبيعات اليومية / مبيعات الرحلة =====
  function tripHtml() {
    const admin = isAdmin();
    const allSales = can('sales_all');     // every seller's sales and revenue
    const pick = can('stock_edit');        // may sell from the depot / shop
    const day = S.day || today();
    const sum = S.summary || { count: 0, items: 0, revenue: 0 };
    const active = S.products.filter((p) => p.active !== false);
    const kpis = allSales
      ? '<div class="kpi dark"><span class="kpi-l">إيرادات ' + (S.dayTo && S.dayTo !== day ? 'الفترة' : day === today() ? 'اليوم' : 'اليوم المختار') + '</span><span class="kpi-v">' + num(sum.revenue) + '<small>درهم</small></span><span class="kpi-s">' + sum.count + ' عملية بيع · ' + sum.items + ' قطعة</span></div>' +
        Object.keys(sum.bySeller || {}).map((n) => '<div class="kpi"><span class="kpi-l">' + esc(n) + '</span><span class="kpi-v">' + num(sum.bySeller[n].revenue) + '<small>درهم</small></span><span class="kpi-s">' + sum.bySeller[n].count + ' عملية · ' + sum.bySeller[n].items + ' قطعة</span></div>').join('') +
        Object.keys(sum.byFrom || {}).map((f) => '<div class="kpi"><span class="kpi-l">من ' + esc(f) + '</span><span class="kpi-v">' + num(sum.byFrom[f]) + '<small>درهم</small></span><span class="kpi-s">حسب مكان البيع</span></div>').join('')
      : '<div class="kpi accent"><span class="kpi-l">مبيعاتي ' + (day === today() ? 'اليوم' : day) + '</span><span class="kpi-v">' + num(sum.revenue) + '<small>درهم</small></span><span class="kpi-s">' + sum.count + ' عملية بيع · ' + sum.items + ' قطعة</span></div>' +
        '<div class="kpi"><span class="kpi-l">قطع في السيارة</span><span class="kpi-v">' + active.reduce((t, p) => t + Math.max(0, p.van || 0), 0) + '</span><span class="kpi-s">' + active.filter((p) => (p.van || 0) > 0).length + ' منتج متوفر</span></div>';

    const opts = active.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + ' — ' + num(p.price) + ' درهم · السيارة: ' + (p.van || 0) + '</option>').join('');
    const form = !can('sales') ? '' : !S.products.length && S.loaded.trip
      ? '<div class="empty"><strong>لا توجد منتجات بعد</strong>' + (admin ? 'أضف منتجاتك من قسم «المنتجات».' : 'اطلب من المدير إضافة المنتجات.') + '</div>'
      : '<form class="d-card sale-card" id="saleForm" novalidate><div class="d-row"><span class="d-h">تسجيل بيع جديد</span><span class="sale-total" id="saleTotal"></span></div>' +
        '<div class="egrid">' +
          '<label class="efld wide"><span>المنتج</span><select id="sProduct" required><option value="">— اختر المنتج —</option>' + opts + '</select></label>' +
          '<label class="efld"><span>الكمية</span><div class="stepper"><button type="button" data-step="-1" aria-label="ناقص">−</button><input id="sQty" type="number" min="1" max="1000" value="1" inputmode="numeric" dir="ltr"><button type="button" data-step="1" aria-label="زائد">+</button></div></label>' +
          '<label class="efld"><span>سعر القطعة (درهم)</span><input id="sPrice" type="number" min="0" step="1" inputmode="decimal" dir="ltr" placeholder="سعر المنتج"></label>' +
          (pick ? '<label class="efld"><span>البيع من</span><select id="sFrom"><option value="van">السيارة</option><option value="shop">المحل</option><option value="depot">المستودع</option></select></label>' : '') +
            (admin ? '<label class="efld"><span>البائع</span><select id="sSeller"><option value="admin">أنا (المدير)</option>' + S.sellers.filter((s) => s.active).map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select></label>' : '') +
          '<label class="efld"><span>اسم الزبون (اختياري)</span><input id="sCustomer" maxlength="80" autocomplete="off"></label>' +
          '<label class="efld"><span>هاتف الزبون (اختياري)</span><input id="sPhone" maxlength="16" inputmode="tel" dir="ltr" autocomplete="off"></label>' +
          '<label class="efld"><span>المدينة (اختياري)</span><input id="sCity" maxlength="80" autocomplete="off"></label>' +
          '<label class="efld"><span>ملاحظة (اختياري)</span><input id="sNote" maxlength="200" autocomplete="off"></label>' +
        '</div><p class="edit-err" id="saleErr" role="alert" hidden></p>' +
        '<div class="d-row edit-act"><button type="submit" class="btn btn-accent btn-lg" id="saleBtn">تسجيل البيع</button></div></form>';

    const rows = S.sales.map((s) => {
      const canCancel = !s.cancelled && (allSales || s.day === today());
      return '<tr class="' + (s.cancelled ? 'is-cancel' : '') + '"><td class="c-date"><span dir="ltr">' + esc(s.at.slice(allSales && S.dayTo ? 0 : 11)) + '</span></td>' +
        '<td class="c-name">' + esc(s.product) + '</td><td class="num">' + s.qty + '</td><td class="num">' + dh(s.price) + '</td><td class="num c-tot">' + dh(s.total) + '</td>' +
        (allSales ? '<td>' + esc(s.sellerName || s.seller) + '</td><td>' + esc(s.from) + '</td>' : '') +
        '<td>' + esc([s.customer, s.city].filter(Boolean).join(' · ') || '—') + (s.phone ? ' <span dir="ltr" class="muted">' + esc(s.phone) + '</span>' : '') + '</td>' +
        '<td class="c-act">' + (s.cancelled ? '<span class="pill" data-k="canc">ملغاة</span>' : canCancel ? '<button type="button" class="qbtn x" data-cancel-sale="' + esc(s.id) + '">إلغاء</button>' : '') + '</td></tr>';
    }).join('');
    const list = '<div class="d-card"><div class="d-row"><span class="d-h">' + (allSales ? 'المبيعات' : 'مبيعاتي') + ' <b class="cnt">' + S.sales.length + '</b></span>' +
      '<div class="day-pick"><label><span>اليوم</span><input type="date" id="tDay" value="' + esc(day) + '" max="' + esc(today()) + '"></label>' +
      (allSales ? '<label><span>إلى</span><input type="date" id="tDayTo" value="' + esc(S.dayTo || '') + '" max="' + esc(today()) + '"></label>' : '') +
      (day !== today() || S.dayTo ? '<button type="button" class="btn btn-ghost-d btn-sm" data-today>اليوم</button>' : '') + '</div></div>' +
      (S.loaded.trip ? (S.sales.length ? '<div class="table-wrap tw-auto"><table class="otable stable"><thead><tr><th>الوقت</th><th>المنتج</th><th class="num">الكمية</th><th class="num">السعر</th><th class="num">المجموع</th>' + (allSales ? '<th>البائع</th><th>من</th>' : '') + '<th>الزبون</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty"><strong>لا توجد مبيعات</strong>' + (day === today() ? 'سجّل أول بيع اليوم من النموذج أعلاه.' : 'لا توجد مبيعات في هذا اليوم.') + '</div>') : loading('المبيعات')) + '</div>';

    const van = !allSales ? '<div class="d-card"><span class="d-h">مخزون السيارة</span><div class="van-list">' +
      (active.length ? active.slice().sort((a, b) => (b.van || 0) - (a.van || 0)).map((p) => '<div class="van-item' + qtyCls(p.van || 0) + '"><b>' + esc(p.name) + '</b><span>' + num(p.price) + ' درهم</span><strong>' + (p.van || 0) + '</strong></div>').join('') : '<p class="muted">لا شيء بعد.</p>') +
      '</div></div>' : '';

    return '<section class="kpis"><div class="kpi-grid kpi-auto">' + kpis + '</div></section><div class="vstack">' + form + list + van + '</div>';
  }
  function updateSaleTotal() {
    const f = root.querySelector('#saleForm'); if (!f) return;
    const p = prodById(f.querySelector('#sProduct').value);
    const priceIn = f.querySelector('#sPrice');
    if (p && document.activeElement !== priceIn && priceIn.dataset.for !== p.id) { priceIn.value = p.price; priceIn.dataset.for = p.id; }
    const qty = parseInt(f.querySelector('#sQty').value, 10) || 0;
    const price = parseFloat(priceIn.value);
    const out = f.querySelector('#saleTotal');
    if (!p) { out.textContent = ''; return; }
    const total = (isNaN(price) ? p.price : price) * qty;
    const from = (f.querySelector('#sFrom') || {}).value || 'van';
    const left = (p[from] != null ? p[from] : p.van || 0) - qty;
    out.innerHTML = 'المجموع: <b>' + dh(total) + '</b>' + (left < 0 ? ' <em class="neg-t">المخزون غير كافٍ (' + LOCS[from] + ': ' + (left + qty) + ')</em>' : '');
  }
  async function submitSale(f) {
    const errEl = f.querySelector('#saleErr'), btn = f.querySelector('#saleBtn');
    const v = (id) => (f.querySelector('#' + id) || {}).value;
    const p = prodById(v('sProduct'));
    const showErr = (m) => { errEl.hidden = false; errEl.textContent = m; };
    if (!p) return showErr('اختر المنتج.');
    const qty = parseInt(v('sQty'), 10);
    if (!(qty >= 1 && qty <= 1000)) return showErr('الكمية غير صحيحة.');
    const price = v('sPrice') === '' ? p.price : parseFloat(String(v('sPrice')).replace(',', '.'));
    if (!(price >= 0)) return showErr('السعر غير صحيح.');
    const from = v('sFrom') || 'van';
    const have = p[from] != null ? p[from] : p.van || 0;
    if (have - qty < 0 && !confirm('المخزون في ' + LOCS[from] + ' هو ' + have + ' فقط. تسجيل البيع على أي حال؟')) return;
    errEl.hidden = true; btn.disabled = true; btn.textContent = 'جارٍ التسجيل…';
    try {
      const d = await call('sale_add', { product: p.id, qty: qty, price: price, from: from, seller: v('sSeller'), customer: v('sCustomer'), phone: v('sPhone'), city: v('sCity'), note: v('sNote') });
      toast('تم تسجيل البيع ' + d.sale.id + ' · ' + dh(d.sale.total));
      f.reset(); f.querySelector('#sPrice').dataset.for = '';
      await refresh(false);
    } catch (e) {
      showErr('لم يُسجَّل البيع. ' + err(e));
      btn.disabled = false; btn.textContent = 'تسجيل البيع';
    }
  }
  async function cancelSale(id) {
    if (!confirm('إلغاء عملية البيع ' + id + '؟ ستعود الكمية إلى المخزون.')) return;
    try { await call('sale_cancel', { id: id }); toast('تم إلغاء البيع ' + id); await refresh(false); }
    catch (e) { toast(err(e), true); }
  }

  // ===== المخزون =====
  function stockHtml() {
    if (!S.loaded.stock && !S.products.length) return loading('المخزون');
    const ps = S.products;
    const t = { depot: 0, shop: 0, van: 0, value: 0 };
    ps.forEach((p) => { t.depot += p.depot || 0; t.shop += p.shop || 0; t.van += p.van || 0; t.value += ((p.depot || 0) + (p.shop || 0) + (p.van || 0)) * (p.price || 0); });
    const kpis = '<div class="kpi dark"><span class="kpi-l">قيمة المخزون</span><span class="kpi-v">' + num(t.value) + '<small>درهم</small></span><span class="kpi-s">بسعر البيع</span></div>' +
      ['depot', 'shop', 'van'].map((l) => '<div class="kpi"><span class="kpi-l">' + LOCS[l] + '</span><span class="kpi-v">' + t[l] + '</span><span class="kpi-s">قطعة</span></div>').join('');
    const rows = ps.map((p) => {
      const tot = (p.depot || 0) + (p.shop || 0) + (p.van || 0);
      return '<tr class="' + (p.active === false ? 'is-off' : '') + '"><td class="c-name">' + esc(p.name) + (p.sd ? ' <i class="sd-tag">SD</i>' : '') + (p.active === false ? ' <span class="muted">(موقوف)</span>' : '') + '</td>' +
        '<td class="num">' + dh(p.price) + '</td>' +
        ['depot', 'shop', 'van'].map((l) => '<td class="num"><span class="qn' + qtyCls(p[l] || 0) + '">' + (p[l] || 0) + '</span></td>').join('') +
        '<td class="num c-tot">' + tot + '</td>' +
        (can('stock_edit') ? '<td class="c-act"><span class="qa"><button type="button" class="qbtn" data-move="transfer" data-p="' + esc(p.id) + '">نقل</button><button type="button" class="qbtn e" data-move="add" data-p="' + esc(p.id) + '">+ إضافة</button>' +
        '<button type="button" class="qbtn x" data-move="count" data-p="' + esc(p.id) + '">جرد</button><button type="button" class="qbtn x" data-move="remove" data-p="' + esc(p.id) + '">إخراج</button></span></td>' : '<td></td>') + '</tr>';
    }).join('');
    const table = ps.length
      ? '<div class="table-wrap tw-auto"><table class="otable stable"><thead><tr><th>المنتج</th><th class="num">السعر</th><th class="num">المستودع</th><th class="num">المحل</th><th class="num">السيارة</th><th class="num">المجموع</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty"><strong>لا توجد منتجات</strong>أضف منتجاتك من قسم «المنتجات»، ثم عُد هنا لإدخال الكميات.</div>';
    const movesFor = S.moveFilter ? S.moves.filter((m) => m.productId === S.moveFilter) : S.moves;
    const moves = '<div class="d-card"><div class="d-row"><span class="d-h">آخر حركات المخزون</span><label class="sel"><span class="sr">المنتج</span><select id="mvFilter"><option value="">كل المنتجات</option>' +
      ps.map((p) => '<option value="' + esc(p.id) + '"' + (S.moveFilter === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label></div>' +
      (movesFor.length ? '<ul class="hist moves">' + movesFor.slice(0, 80).map((m) => '<li data-k="' + moveKey(m.type) + '"><span><b>' + esc(m.type) + '</b> · ' + esc(m.product) + (m.qty ? ' × ' + m.qty : '') +
        (m.from || m.to ? ' <span class="muted">' + esc([m.from, m.to].filter(Boolean).join(' ← ')) + '</span>' : '') + (m.ref ? ' <bdi class="muted">' + esc(m.ref) + '</bdi>' : '') + (m.note ? '<br><small class="muted">' + esc(m.note) + '</small>' : '') +
        (m.by ? '<br><small class="muted">' + esc(m.by) + '</small>' : '') + '</span><time dir="ltr">' + esc(m.at) + '</time></li>').join('') + '</ul>' : '<p class="muted">لا توجد حركات بعد.</p>') + '</div>';
    return '<section class="kpis"><div class="kpi-head"><h2>المخزون حسب المكان</h2>' + (ps.length && can('stock_edit') ? '<button type="button" class="btn btn-accent" data-move="transfer" data-p="" data-preset="load">تحميل السيارة من المستودع</button>' : '') + '</div><div class="kpi-grid kpi-auto">' + kpis + '</div></section>' +
      '<div class="vstack"><div class="d-card">' + table + '</div>' + moves + '</div>';
  }
  function moveKey(type) {
    if (/بيع/.test(type) && !/إلغاء/.test(type)) return 'done';
    if (/أونلاين/.test(type)) return /إرجاع/.test(type) ? 'ret' : 'ship';
    if (/إضافة|إلغاء/.test(type)) return 'conf';
    if (/إخراج/.test(type)) return 'new';
    return 'canc';
  }

  // ----- stock modal (add / transfer / count / remove) -----
  function openMove(type, productId, preset) {
    S.modal = { type: type, product: productId || '', from: preset === 'load' ? 'depot' : type === 'transfer' ? 'depot' : 'depot', to: preset === 'load' || type === 'transfer' ? 'van' : 'depot' };
    render();
    setTimeout(() => { const q = root.querySelector('#mQty'); if (q) q.focus(); }, 40);
  }
  function modalHtml() {
    const m = S.modal;
    const T = { add: 'إضافة مخزون (وصول سلعة)', transfer: 'نقل بين الأماكن', count: 'جرد: إدخال العدد الحقيقي', remove: 'إخراج (تالف / ضائع / هدية)' }[m.type];
    const locSel = (id, val, label) => '<label class="efld"><span>' + label + '</span><select id="' + id + '">' + Object.keys(LOCS).map((k) => '<option value="' + k + '"' + (val === k ? ' selected' : '') + '>' + LOCS[k] + '</option>').join('') + '</select></label>';
    const p = prodById(m.product);
    return '<div class="smodal" role="dialog" aria-modal="true" aria-label="' + esc(T) + '"><form class="d-card smodal-card" id="moveForm" novalidate><div class="d-row"><span class="d-h">' + esc(T) + '</span><button type="button" class="d-close dark" data-close-modal aria-label="إغلاق">✕</button></div>' +
      '<div class="egrid">' +
        '<label class="efld wide"><span>المنتج</span><select id="mProduct">' + S.products.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === m.product ? ' selected' : '') + '>' + esc(x.name) + ' — م: ' + (x.depot || 0) + ' · مح: ' + (x.shop || 0) + ' · س: ' + (x.van || 0) + '</option>').join('') + '</select></label>' +
        (m.type === 'transfer' ? locSel('mFrom', m.from, 'من') + locSel('mTo', m.to, 'إلى') : m.type === 'remove' ? locSel('mFrom', m.from, 'من') : locSel('mTo', m.to, m.type === 'count' ? 'المكان' : 'إلى')) +
        '<label class="efld"><span>' + (m.type === 'count' ? 'العدد الحقيقي الموجود' : 'الكمية') + '</span><input id="mQty" type="number" min="' + (m.type === 'count' ? 0 : 1) + '" step="1" inputmode="numeric" dir="ltr"' + (m.type === 'count' && p ? ' value="' + (p[m.to] || 0) + '"' : '') + '></label>' +
        '<label class="efld wide"><span>ملاحظة (اختياري)</span><input id="mNote" maxlength="300" autocomplete="off"></label>' +
      '</div><p class="edit-err" id="moveErr" role="alert" hidden></p>' +
      '<div class="d-row edit-act"><button type="button" class="btn btn-ghost-d" data-close-modal>إلغاء</button><button type="submit" class="btn btn-accent">حفظ</button></div></form></div>';
  }
  async function submitMove(f) {
    const v = (id) => (f.querySelector('#' + id) || {}).value;
    const errEl = f.querySelector('#moveErr');
    const qty = parseInt(v('mQty'), 10);
    const m = S.modal;
    if (isNaN(qty) || qty < (m.type === 'count' ? 0 : 1)) { errEl.hidden = false; errEl.textContent = 'أدخل الكمية.'; return; }
    if (m.type === 'transfer' && v('mFrom') === v('mTo')) { errEl.hidden = false; errEl.textContent = 'اختر مكانين مختلفين.'; return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      const d = await call('stock_move', { type: m.type, product: v('mProduct'), qty: qty, from: v('mFrom'), to: v('mTo'), note: v('mNote') });
      const i = S.products.findIndex((x) => x.id === d.product.id); if (i >= 0) S.products[i] = d.product;
      S.modal = null;
      toast('تم حفظ حركة المخزون · ' + d.product.name);
      render(); refresh(false);
    } catch (e) {
      errEl.hidden = false; errEl.textContent = err(e); btn.disabled = false; btn.textContent = 'حفظ';
    }
  }

  // ===== المنتجات =====
  function productsHtml() {
    const e = S.editProduct;
    const p = e && e !== 'new' ? prodById(e) : null;
    const form = e ? '<form class="d-card edit-card" id="prodForm" novalidate><div class="d-row"><span class="d-h">' + (p ? 'تعديل المنتج <bdi>' + esc(p.id) + '</bdi>' : 'منتج جديد') + '</span></div><div class="egrid">' +
        '<label class="efld wide"><span>اسم المنتج</span><input id="pName" maxlength="120" value="' + esc(p ? p.name : '') + '" autocomplete="off"></label>' +
        '<label class="efld"><span>السعر (درهم)</span><input id="pPrice" type="number" min="0" step="1" inputmode="decimal" dir="ltr" value="' + esc(p ? p.price : '') + '"></label>' +
        '<label class="efld"><span>الحالة</span><select id="pActive"><option value="1"' + (!p || p.active ? ' selected' : '') + '>متوفر للبيع</option><option value="0"' + (p && !p.active ? ' selected' : '') + '>موقوف</option></select></label>' +
        (p ? '' : ['depot', 'shop', 'van'].map((l) => '<label class="efld"><span>الكمية في ' + LOCS[l] + '</span><input id="pQ_' + l + '" type="number" min="0" step="1" value="0" inputmode="numeric" dir="ltr"></label>').join('')) +
        '<label class="efld wide"><span>أسماء المنتج في طلبات الموقع (اختياري، اسم في كل سطر)</span><textarea id="pOnline" rows="2" maxlength="500" placeholder="مثال: موكا برو ماكس&#10;Moka Pro Max">' + esc(p ? p.online : '') + '</textarea><small class="muted">تُستعمل لخصم الطلبات الأونلاين من المستودع عند الشحن.</small></label>' +
        '<label class="chk2 wide"><input type="checkbox" id="pSd"' + (p && p.sd ? ' checked' : '') + '><span>هذا المنتج بطاقة ذاكرة SD (تُخصم تلقائياً مع الطلبات التي فيها بطاقة)</span></label>' +
      '</div><p class="edit-err" id="prodErr" role="alert" hidden></p><div class="d-row edit-act"><button type="button" class="btn btn-ghost-d" data-prod-cancel>إلغاء</button><button type="submit" class="btn btn-accent">حفظ المنتج</button></div></form>' : '';
    const rows = S.products.map((x) => '<tr class="' + (x.active === false ? 'is-off' : '') + '"><td class="c-id"><bdi>' + esc(x.id) + '</bdi></td><td class="c-name">' + esc(x.name) + (x.sd ? ' <i class="sd-tag">SD</i>' : '') + '</td>' +
      '<td class="num c-tot">' + dh(x.price) + '</td><td>' + (x.active === false ? '<span class="pill" data-k="canc">موقوف</span>' : '<span class="pill" data-k="done">متوفر</span>') + '</td>' +
      '<td class="muted small">' + esc(String(x.online || '').split(/\n/).filter(Boolean).join(' · ') || '—') + '</td>' +
      '<td class="c-act"><button type="button" class="qbtn e" data-prod-edit="' + esc(x.id) + '">تعديل / السعر</button></td></tr>').join('');
    return '<section class="kpis"><div class="kpi-head"><h2>المنتجات <b class="cnt">' + S.products.length + '</b></h2><button type="button" class="btn btn-accent" data-prod-new>+ منتج جديد</button></div></section>' +
      '<div class="vstack">' + form + '<div class="d-card">' + (S.products.length ? '<div class="table-wrap tw-auto"><table class="otable stable"><thead><tr><th>الرمز</th><th>المنتج</th><th class="num">السعر</th><th>الحالة</th><th>أسماء الطلبات</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : S.loaded.products ? '<div class="empty"><strong>لا توجد منتجات بعد</strong>اضغط «منتج جديد» لإضافة أول منتج.</div>' : loading('المنتجات')) + '</div></div>';
  }
  async function submitProduct(f) {
    const v = (id) => (f.querySelector('#' + id) || {}).value;
    const errEl = f.querySelector('#prodErr');
    const name = v('pName').trim();
    const price = parseFloat(String(v('pPrice')).replace(',', '.'));
    if (!name) { errEl.hidden = false; errEl.textContent = 'اسم المنتج مطلوب.'; return; }
    if (!(price >= 0)) { errEl.hidden = false; errEl.textContent = 'السعر غير صحيح.'; return; }
    const id = S.editProduct !== 'new' ? S.editProduct : '';
    const data = { id: id, name: name, price: price, active: v('pActive') === '1', online: v('pOnline'), sd: f.querySelector('#pSd').checked };
    if (!id) ['depot', 'shop', 'van'].forEach((l) => { data[l] = parseInt(v('pQ_' + l), 10) || 0; });
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      const d = await call('products_save', data);
      S.products = d.products; S.editProduct = null;
      toast(id ? 'تم حفظ المنتج' : 'تمت إضافة المنتج ' + name);
      render();
    } catch (e) { errEl.hidden = false; errEl.textContent = err(e); btn.disabled = false; btn.textContent = 'حفظ المنتج'; }
  }

  // ===== التوصيل (SIFT.ma) =====
  function deliveryHtml() {
    if (!S.loaded.delivery) return loading('حالة الربط مع SIFT');
    const row = (ok, txt) => '<li class="' + (ok ? 'ok' : 'no') + '"><span>' + (ok ? '✓' : '✕') + '</span>' + txt + '</li>';
    const cards = P.stores.map((st) => {
      const x = S.sift[st.id] || {};
      const busy = S.siftBusy.indexOf(st.id) === 0;
      if (x.failed) return '<div class="d-card"><span class="d-h">' + esc(st.label) + '</span><p class="edit-err">' + esc(x.failed) + '</p></div>';
      return '<div class="d-card sift-set"><div class="d-row"><span class="d-h">' + esc(st.label) + '</span>' + (x.connected ? '<span class="pill" data-k="done">متصل</span>' : '<span class="pill" data-k="canc">غير متصل</span>') + '</div>' +
        '<ul class="checks">' +
          row(x.hasKey, x.hasKey ? 'مفتاح SIFT مُعدّ في Google Apps Script' : 'أضف المفتاح: Apps Script › Project Settings › Script properties › <b dir="ltr">SIFT_API_KEY</b>') +
          (x.hasKey ? row(x.connected, x.connected ? 'SIFT يقبل المفتاح' : 'SIFT رفض الاتصال: ' + esc(x.message || '')) : '') +
          row(x.webhook, x.webhook ? 'التحديث التلقائي مفعّل: SIFT يرسل تغيّر الحالة إلى اللوحة' : 'التحديث التلقائي غير مفعّل بعد') +
          '<li class="info"><span>↻</span>آخر مزامنة: ' + (x.lastSync ? '<bdi dir="ltr">' + esc(String(x.lastSync).replace('T', ' ').slice(0, 16)) + ' UTC</bdi>' : 'لم تتم بعد') + '</li>' +
        '</ul>' +
        '<div class="d-row edit-act">' +
          '<button type="button" class="btn btn-ghost-d" data-sift="sift_sync" data-store="' + st.id + '"' + (x.connected && !busy ? '' : ' disabled') + '>' + (S.siftBusy === st.id + ':sift_sync' ? 'جارٍ المزامنة…' : 'مزامنة الحالات الآن') + '</button>' +
          '<button type="button" class="btn btn-accent" data-sift="sift_setup" data-store="' + st.id + '"' + (x.connected && !busy ? '' : ' disabled') + '>' + (S.siftBusy === st.id + ':sift_setup' ? 'جارٍ التفعيل…' : x.webhook ? 'إعادة تفعيل التحديث التلقائي' : 'تفعيل التحديث التلقائي') + '</button>' +
        '</div></div>';
    }).join('');
    return '<section class="kpis"><div class="kpi-head"><h2>التوصيل · SIFT.ma</h2></div>' +
      '<p class="muted">عند الضغط على «تأكيد» يُرسل الطلب إلى SIFT ويُحجز، ويُحفظ رقم التتبع في الطلب. حالات SIFT (تم الاستلام، في الطريق، تم التسليم، مرتجع…) تُحدّث حالة الطلب في اللوحة تلقائياً. كل متجر له حساب SIFT ومفتاح خاص به.</p></section>' +
      '<div class="vstack">' + cards + '</div>';
  }
  async function siftAction(storeId, action) {
    S.siftBusy = storeId + ':' + action; render();
    try {
      const d = await P.apiFor(storeId, action, {});
      if (action === 'sift_sync') toast('مزامنة SIFT: ' + (d.checked || 0) + ' طلب، ' + (d.changed || 0) + ' تغيّر');
      else toast('تم تفعيل التحديث التلقائي من SIFT');
      if (d.changed) P.reloadOrders();
    } catch (e) { toast(err(e), true); }
    S.siftBusy = '';
    S.loaded.delivery = false; render(); refresh(false);
  }

  // ===== البائعون =====
  function sellersHtml() {
    const boxes = (list) => '<div class="perm-grid">' + PERMS.map((p) => '<label class="chk2"><input type="checkbox" data-perm="' + p[0] + '"' + (list.indexOf(p[0]) >= 0 ? ' checked' : '') + '><span>' + esc(p[2]) + '</span></label>').join('') + '</div>';
    const rows = S.sellers.map((s) => '<div class="seller-row' + (s.active ? '' : ' is-off') + '"><div><b>' + esc(s.name) + '</b><span dir="ltr" class="muted"> ' + esc(s.id) + '</span><br>' +
        ((s.perms || []).length ? (s.perms || []).map((k) => '<i class="ptag">' + esc(permLabel(k)) + '</i>').join('') : '<small class="muted">بدون صلاحيات</small>') + '</div>' +
      '<span class="pill" data-k="' + (s.active ? 'done' : 'canc') + '">' + (s.active ? 'مفعّل' : 'موقوف') + '</span>' +
      '<span class="qa"><button type="button" class="qbtn" data-seller-perms="' + esc(s.id) + '">الصلاحيات</button><button type="button" class="qbtn e" data-seller-pw="' + esc(s.id) + '">كلمة سر جديدة</button><button type="button" class="qbtn x" data-seller-toggle="' + esc(s.id) + '">' + (s.active ? 'إيقاف' : 'تفعيل') + '</button><button type="button" class="qbtn x" data-seller-del="' + esc(s.id) + '">حذف</button></span>' +
      (S.permEdit === s.id ? '<form class="perm-edit" data-perm-form="' + esc(s.id) + '">' + boxes(s.perms || []) + '<div class="d-row edit-act"><button type="button" class="btn btn-ghost-d btn-sm" data-perm-cancel>إلغاء</button><button type="submit" class="btn btn-accent btn-sm">حفظ الصلاحيات</button></div></form>' : '') +
      '</div>').join('');
    return '<section class="kpis"><div class="kpi-head"><h2>حسابات البائعين</h2></div><p class="muted">اختر لكل حساب ما يستطيع فعله. التغيير يُطبَّق مباشرة بدون إعادة الدخول. الحسابات وإعدادات SIFT تبقى للمدير فقط.</p></section>' +
      '<div class="vstack"><form class="d-card" id="sellerForm" novalidate><span class="d-h">إضافة بائع</span><div class="egrid">' +
        '<label class="efld"><span>الاسم (يظهر في المبيعات)</span><input id="slName" maxlength="40" placeholder="علي" autocomplete="off"></label>' +
        '<label class="efld"><span>اسم المستخدم للدخول (حروف لاتينية)</span><input id="slId" maxlength="30" placeholder="ali" dir="ltr" autocapitalize="none" autocomplete="off"></label>' +
        '<label class="efld wide"><span>نقطة البداية</span><select id="slRole"><option value="seller">بائع (الرحلة)</option><option value="confirmer">تأكيد الطلبات (الهاتف)</option><option value="custom">مخصص</option></select></label>' +
        '<div class="efld wide"><span>الصلاحيات</span>' + boxes(PRESETS.seller) + '</div>' +
        '<label class="efld wide"><span>كلمة السر (6 أحرف على الأقل)</span><input id="slPw" type="text" maxlength="60" dir="ltr" autocomplete="new-password"></label>' +
      '</div><p class="edit-err" id="sellerErr" role="alert" hidden></p><div class="d-row edit-act"><button type="submit" class="btn btn-accent">إنشاء الحساب</button></div></form>' +
      '<div class="d-card"><span class="d-h">البائعون</span>' + (S.sellers.length ? '<div class="seller-list">' + rows + '</div>' : S.loaded.sellers ? '<p class="muted">لا يوجد بائعون بعد.</p>' : loading('البائعون')) + '</div></div>';
  }
  async function sellerAction(action, data, okMsg) {
    try {
      const d = await call(action, data);
      S.sellers = d.sellers || S.sellers;
      // an order-confirmer must also exist in the other stores' scripts (pliers), with the same password
      const acc = S.sellers.find((x) => x.id === data.id) || {};
      // accounts that handle orders must also exist in the pliers store's script
      const ordersPerm = (list) => (list || []).some((p) => p === 'orders' || p === 'orders_add');
      const mirror = ordersPerm(data.perms || acc.perms) || (action === 'sellers_delete' && data.mirror);
      if (mirror) {
        const others = P.stores.filter((st) => st.id !== 'main' && P.isConnected(st.id));
        const res = await Promise.allSettled(others.map((st) => P.apiFor(st.id, action, data)));
        const bad = res.map((r, i) => r.status === 'rejected' ? others[i].label + ': ' + err(r.reason) : '').filter(Boolean);
        if (bad.length) toast('لم يُنسخ الحساب إلى ' + bad.join(' · ') + ' — اضغط «كلمة سر جديدة» لنسخه مع كلمة السر.', true);
      }
      toast(okMsg); render(); return true;
    } catch (e) { toast(err(e), true); return false; }
  }

  // ---------- events ----------
  root.addEventListener('click', (e) => {
    const t = e.target;
    const st = t.closest('[data-step]');
    if (st) { const q = root.querySelector('#sQty'); q.value = Math.max(1, (parseInt(q.value, 10) || 1) + Number(st.dataset.step)); updateSaleTotal(); return; }
    const sb = t.closest('[data-sift]'); if (sb) return siftAction(sb.dataset.store, sb.dataset.sift);
    const cs = t.closest('[data-cancel-sale]'); if (cs) return cancelSale(cs.dataset.cancelSale);
    if (t.closest('[data-today]')) { S.day = ''; S.dayTo = ''; S.loaded.trip = false; render(); return refresh(false); }
    const mv = t.closest('[data-move]'); if (mv) return openMove(mv.dataset.move, mv.dataset.p || (S.products[0] || {}).id, mv.dataset.preset);
    if (t.closest('[data-close-modal]') || t.classList.contains('smodal')) { S.modal = null; return render(); }
    if (t.closest('[data-prod-new]')) { S.editProduct = 'new'; render(); const n = root.querySelector('#pName'); if (n) n.focus(); return; }
    const pe = t.closest('[data-prod-edit]'); if (pe) { S.editProduct = pe.dataset.prodEdit; render(); root.querySelector('#prodForm').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (t.closest('[data-prod-cancel]')) { S.editProduct = null; return render(); }
    const pm = t.closest('[data-seller-perms]'); if (pm) { S.permEdit = S.permEdit === pm.dataset.sellerPerms ? '' : pm.dataset.sellerPerms; return render(); }
    if (t.closest('[data-perm-cancel]')) { S.permEdit = ''; return render(); }
    const sp = t.closest('[data-seller-pw]');
    if (sp) { const pw = prompt('كلمة السر الجديدة لـ ' + sp.dataset.sellerPw + ' (6 أحرف على الأقل):'); if (pw) sellerAction('sellers_save', { id: sp.dataset.sellerPw, password: pw }, 'تم تغيير كلمة السر — سيُطلب منه الدخول من جديد'); return; }
    const sg = t.closest('[data-seller-toggle]');
    if (sg) { const s = S.sellers.find((x) => x.id === sg.dataset.sellerToggle); sellerAction('sellers_save', { id: s.id, active: !s.active }, s.active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب'); return; }
    const sd = t.closest('[data-seller-del]');
    if (sd && confirm('حذف حساب ' + sd.dataset.sellerDel + '؟ مبيعاته تبقى مسجلة.')) { const acc = S.sellers.find((x) => x.id === sd.dataset.sellerDel) || {}; sellerAction('sellers_delete', { id: sd.dataset.sellerDel, mirror: (acc.perms || []).some((p) => p === 'orders' || p === 'orders_add') }, 'تم حذف الحساب'); }
  });
  root.addEventListener('input', (e) => { if (e.target.closest('#saleForm')) updateSaleTotal(); });
  root.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'sProduct' || id === 'sFrom') { const pr = root.querySelector('#sPrice'); if (id === 'sProduct') pr.dataset.for = ''; updateSaleTotal(); }
    if (id === 'tDay' || id === 'tDayTo') { S.day = root.querySelector('#tDay').value || ''; const to = root.querySelector('#tDayTo'); S.dayTo = to ? to.value : ''; if (S.dayTo && S.dayTo < S.day) S.dayTo = ''; S.loaded.trip = false; render(); refresh(false); }
    if (id === 'mvFilter') { S.moveFilter = e.target.value; render(); }
    if (id === 'slRole') { const list = PRESETS[e.target.value] || []; root.querySelectorAll('#sellerForm [data-perm]').forEach((c) => { c.checked = list.indexOf(c.dataset.perm) >= 0; }); }
    if (id === 'mProduct' || id === 'mTo') {
      const m = S.modal; if (!m) return;
      m.product = root.querySelector('#mProduct').value; const to = root.querySelector('#mTo'); if (to) m.to = to.value; const fr = root.querySelector('#mFrom'); if (fr) m.from = fr.value;
      if (m.type === 'count') { const p = prodById(m.product); root.querySelector('#mQty').value = p ? p[m.to] || 0 : 0; }
    }
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'saleForm') submitSale(f);
    else if (f.id === 'moveForm') submitMove(f);
    else if (f.id === 'prodForm') submitProduct(f);
    else if (f.dataset.permForm) {
      const perms = [...f.querySelectorAll('[data-perm]:checked')].map((c) => c.dataset.perm);
      sellerAction('sellers_save', { id: f.dataset.permForm, perms: perms }, 'تم حفظ الصلاحيات').then((ok) => { if (ok) { S.permEdit = ''; render(); } });
    }
    else if (f.id === 'sellerForm') {
      const v = (id) => f.querySelector('#' + id).value.trim();
      const errEl = f.querySelector('#sellerErr');
      const id = v('slId').toLowerCase();
      if (!/^[a-z0-9_-]{2,30}$/.test(id) || id === 'admin') { errEl.hidden = false; errEl.textContent = err({ code: 'bad_field', data: { field: 'seller_id' } }); return; }
      if (v('slPw').length < 6) { errEl.hidden = false; errEl.textContent = err({ code: 'bad_field', data: { field: 'password' } }); return; }
      const perms = [...f.querySelectorAll('[data-perm]:checked')].map((c) => c.dataset.perm);
      sellerAction('sellers_save', { id: id, name: v('slName') || id, password: v('slPw'), role: perms.indexOf('orders') >= 0 ? 'confirmer' : 'seller', perms: perms }, 'تم إنشاء حساب ' + (v('slName') || id) + ' — الدخول باسم المستخدم «' + id + '»').then((ok) => { if (ok) f.reset(); });
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.modal) { S.modal = null; render(); } });

  // ---------- public (called by admin.js) ----------
  let timer = null;
  window.PRUMYSL_STOCK = {
    start() {
      S.loaded = {}; S.error = '';
      const saved = lsGet(LS_VIEW);
      go(saved || 'orders');
      clearInterval(timer);
      timer = setInterval(() => { if (!document.hidden && !root.hidden && !S.modal && !document.activeElement.closest('#stockView form')) refresh(false); }, 60000);
    },
    refresh: refresh,
    perms() { renderNav(); if (allowed().indexOf(S.view) < 0) go(allowed()[0]); else if (S.view !== 'orders') render(); },
    reset() { clearInterval(timer); S.products = []; S.sales = []; S.sellers = []; S.moves = []; S.loaded = {}; S.modal = null; S.editProduct = null; S.day = S.dayTo = ''; root.innerHTML = ''; root.hidden = true; nav.hidden = true; topTitle.textContent = 'الطلبات'; const tag = document.querySelector('.top-tag'); if (tag) tag.textContent = 'الإدارة'; }
  };
  // admin.js runs first: when a saved session already opened the app, start here
  if (!$('#app').hidden && P.connected) window.PRUMYSL_STOCK.start();
})();
