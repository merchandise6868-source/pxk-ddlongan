/**
 * TAB ĐƠN HÀNG (dữ liệu gốc): quản lý theo ĐƠN – 1 đơn của 1 khách gồm nhiều ART, mỗi ART nhiều PO, số lượng theo size.
 * Nhập bằng bảng kiểu Excel: copy khối trong Excel, bấm vào ô rồi Ctrl+V là điền hết (tự thêm dòng).
 * Khách hàng theo thanh bên (window.KH); "Tất cả khách hàng" chỉ xem, không tạo đơn.
 * Quy tắc gõ Telex: input chỉ cập nhật dữ liệu, không vẽ lại ô đang gõ; keydown bỏ qua khi isComposing.
 */
(function () {
  const { esc, fmt, fmt0, api, toast, normSize, normKey, khSizes, viDate, today, once, seq, latest, priceNum, $ } = window.U;
  const C = () => window.Catalog || { khach: [], khachAll: [], po: [], byId: () => null };
  const khId = () => (window.KH ? window.KH.one() : null);
  /** Số dán từ Excel: "1.000" / "1,000" / "1 000" -> 1000 */
  const qtyNum = v => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10) || 0;
  const BLANK_ROWS = 8;

  const S = {
    q: '', tt: 'con', list: [],
    dotMoi: null, dotMoiKh: null, // đợt gợi ý cho đơn mới của khách đang chọn
    view: 'list',      // 'list' | 'don'
    don: null,         // { id, isNew, khach_hang_id, so_don, ngay_giao, ghi_chu, lines: [...] }
    day: -1,           // dãy size đang hiện (-1 = tất cả)
    dirty: false,
  };
  const emptyLine = () => ({ id: null, art: '', po: '', mau: '', don_gia: '', sizes: {}, info: null });

  /* ---------------- KHUNG ---------------- */
  function renderShell() {
    $('dh-root').innerHTML = `
      <header class="ui-page-head"><h2>Đơn hàng</h2>
        <p>Mỗi đơn gồm nhiều ART, mỗi ART nhiều PO với số lượng theo size. Lập phiếu xuất lấy PO · ART · Màu và số còn lại từ đây.</p></header>
      <div id="dh-view"></div>`;
  }
  function render() {
    if (S.view === 'don' && S.don) renderDon(); else renderListView();
  }

  /* ============================================================
     DANH SÁCH ĐƠN
     ============================================================ */
  function renderListView() {
    const one = !!khId();
    $('dh-view').innerHTML = `
      <div class="ui-panel v3-filter">
        <label class="ui-field v3-grow"><span class="ui-label">Tìm</span><input type="search" class="ui-input" id="dh-f-q" value="${esc(S.q)}" placeholder="Số đơn, PO, ART"></label>
        <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="dh-f-tt">
          <option value="con" ${S.tt === 'con' ? 'selected' : ''}>Còn phải giao</option>
          <option value="du" ${S.tt === 'du' ? 'selected' : ''}>Đã giao đủ</option>
          <option value="all" ${S.tt === 'all' ? 'selected' : ''}>Tất cả</option></select></label>
        <div class="v3-filter-btns">
          <button type="button" class="ui-btn ui-btn-primary" data-act="new" ${one ? '' : 'disabled'}>＋ Tạo đơn mới</button>
        </div>
        ${one ? '' : '<p class="ui-hint">Muốn tạo đơn, hãy chọn 1 khách hàng ở thanh bên trái.</p>'}
      </div>
      <div class="ui-panel ui-panel-flush"><div class="v3-table-wrap" id="dh-list"><div class="v3-empty">Đang tải...</div></div></div>`;
    loadList();
  }

  async function loadList() {
    const p = new URLSearchParams({ trang_thai: S.tt });
    if (khId()) p.set('khach_hang_id', khId());
    if (S.q) p.set('q', S.q);
    const n = seq('dh-list');
    try {
      const data = await api('/api/dondat?' + p);
      if (!latest('dh-list', n)) return; // đã đổi khách / bộ lọc trong lúc chờ
      S.list = data.data;
      S.dotMoi = data.dot_moi; S.dotMoiKh = khId();
      renderList();
    } catch (err) { const box = $('dh-list'); if (box) box.innerHTML = `<div class="v3-empty">Lỗi tải đơn hàng: ${esc(err.message)}</div>`; }
  }

  function renderList() {
    const box = $('dh-list');
    if (!box || S.view !== 'list') return;
    if (!S.list.length) {
      box.innerHTML = `<div class="v3-empty">${S.tt === 'con' ? 'Không có đơn nào còn phải giao.' : 'Chưa có đơn hàng.'}${khId() ? ' Bấm <b>＋ Tạo đơn mới</b>.' : ''}${window.KH ? window.KH.emptyNote() : ''}</div>`;
      return;
    }
    const allKh = !khId();
    box.innerHTML = `<table class="v3-table">
      <thead><tr><th>Số đơn</th>${allKh ? '<th>Khách hàng</th>' : ''}<th>Ngày giao</th><th class="r">Số ART</th><th class="r">Số PO</th>
        <th class="r">Đặt</th><th class="r">Đã thả</th><th class="r">Đã xuất</th><th class="r">Còn lại</th><th></th></tr></thead>
      <tbody>${S.list.map((d, i) => `<tr>
        <td><b>${esc(d.so_don)}</b>${d.id ? ` <span class="ui-badge ui-badge-off">Đợt ${d.dot}</span>` : ''}${d.ghi_chu ? `<br><small class="ui-muted">${esc(d.ghi_chu)}</small>` : ''}</td>
        ${allKh ? `<td>${esc(d.khach_ten)}</td>` : ''}
        <td class="nowrap">${esc(viDate(d.ngay_giao))}</td>
        <td class="r">${d.so_art}</td><td class="r">${d.so_po}</td>
        <td class="r"><b>${fmt0(d.tong_dat)}</b></td><td class="r">${fmt(d.tong_tha)}</td><td class="r">${fmt(d.tong_xuat)}</td>
        <td class="r ${d.con_phai_giao ? '' : 'v3-ok'}"><b>${d.con_phai_giao ? fmt0(d.con_phai_giao) : '✓ đủ'}</b></td>
        <td class="nowrap"><button type="button" class="ui-btn-sm ui-btn-sm-primary" data-act="open" data-i="${i}">Mở đơn</button>
          ${d.id ? `<button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="del-don" data-i="${i}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${allKh ? 5 : 4}">${S.list.length} đơn</td>
        <td class="r">${fmt0(S.list.reduce((a, d) => a + d.tong_dat, 0))}</td><td class="r">${fmt0(S.list.reduce((a, d) => a + d.tong_tha, 0))}</td>
        <td class="r">${fmt0(S.list.reduce((a, d) => a + d.tong_xuat, 0))}</td><td class="r">${fmt0(S.list.reduce((a, d) => a + d.con_phai_giao, 0))}</td><td></td></tr></tfoot>
    </table>`;
  }

  /* ============================================================
     MÀN HÌNH 1 ĐƠN: BẢNG NHẬP KIỂU EXCEL
     ============================================================ */
  function suggestSoDon(kh) {
    const d = today().replace(/-/g, '').slice(2);
    const base = `${String(kh?.ma || 'DH').toUpperCase()}-${d}`;
    const used = new Set(S.list.map(x => normKey(x.so_don)));
    let s = base, n = 2;
    while (used.has(normKey(s))) s = `${base}-${n++}`;
    return s;
  }
  /** Đợt gợi ý cho đơn mới: sau mọi đợt đã có đơn / đã xuất phiếu của khách */
  async function dotMoi(kh) {
    if (S.dotMoiKh !== kh || !S.dotMoi) {
      try { S.dotMoi = (await api(`/api/dondat?khach_hang_id=${kh}&trang_thai=all`)).dot_moi; S.dotMoiKh = kh; } catch (_) { return 1; }
    }
    return S.dotMoi || 1;
  }
  async function newDon() {
    const kh = C().byId(khId());
    const dot = await dotMoi(khId());
    S.don = { id: 0, isNew: true, khach_hang_id: khId(), so_don: suggestSoDon(kh), dot, ngay_giao: '', ghi_chu: '',
      lines: Array.from({ length: BLANK_ROWS }, emptyLine) };
    S.day = -1; S.dirty = false; S.view = 'don';
    render();
    S.sheet?.focus(0, 0);
  }
  async function openDon(d) {
    if (window.KH && !window.KH.set(d.khach_hang_id)) return; // đang xem Tất cả -> thanh bên theo khách của đơn
    try {
      const { data } = await api(`/api/dondat/${d.id}${d.id ? '' : `?khach_hang_id=${d.khach_hang_id}`}`);
      S.don = {
        id: data.id, isNew: !data.id, khach_hang_id: data.khach_hang_id, so_don: data.so_don || suggestSoDon(C().byId(data.khach_hang_id)),
        dot: data.id ? data.dot : await dotMoi(data.khach_hang_id),
        ngay_giao: data.ngay_giao || '', ghi_chu: data.ghi_chu || '',
        lines: data.lines.map(o => ({ id: o.id, art: o.art, po: o.po, mau: o.mau || '', don_gia: o.don_gia || '',
          sizes: Object.fromEntries(o.sizes.filter(s => s.dat).map(s => [s.size, s.dat])), info: o })),
      };
      S.don.lines.push(emptyLine(), emptyLine());
      S.day = -1; S.dirty = false; S.view = 'don';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast('Không mở được đơn: ' + err.message, 'error'); }
  }

  /** Cột của bảng: ART · PO · Màu · Đơn giá · size... */
  function sizeCols() {
    const kh = C().byId(S.don.khach_hang_id);
    const days = (kh && kh.day_size) || [];
    const all = khSizes(kh);
    let cols = S.day >= 0 && days[S.day] ? (days[S.day].sizes || []).map(normSize) : all;
    // Size đã có số luôn hiện (kể cả size lạ không thuộc dãy)
    const used = new Set(S.don.lines.flatMap(l => Object.keys(l.sizes).filter(s => qtyNum(l.sizes[s]))));
    const extra = [...all, ...used].filter(s => used.has(s) && !cols.includes(s));
    return [...new Set([...cols, ...extra])];
  }
  function columns() {
    return [{ k: 'art', t: 'ART' }, { k: 'po', t: 'PO' }, { k: 'mau', t: 'Màu' }, { k: 'don_gia', t: 'Đơn giá', num: true },
      ...sizeCols().map(s => ({ k: 'sz', s, t: s, num: true }))];
  }
  /** ART thực của dòng: ô trống thì lấy ART dòng trên */
  function effArts() {
    let last = '';
    return S.don.lines.map(l => { if (String(l.art).trim()) last = String(l.art).trim(); return last; });
  }
  const rowTotal = l => Object.values(l.sizes).reduce((a, v) => a + qtyNum(v), 0);
  const cellVal = (l, c) => (c.k === 'sz' ? (qtyNum(l.sizes[c.s]) ? fmt(qtyNum(l.sizes[c.s])) : '') : c.k === 'don_gia' ? (priceNum(l.don_gia) ? fmt(priceNum(l.don_gia)) : '') : (l[c.k] ?? ''));

  function renderDon() {
    const D = S.don;
    const kh = C().byId(D.khach_hang_id);
    const days = (kh && kh.day_size) || [];
    $('dh-view').innerHTML = `
      <div class="ui-return-note v3-editing"><span>${D.isNew ? (D.lines.some(l => l.id) ? 'Gom các PO lẻ vào một đơn' : 'Tạo đơn mới') : `Đơn <b>${esc(D.so_don)}</b> · đợt <b>${esc(D.dot)}</b>`} · khách <b>${esc(kh?.ten_ngan || '')}</b></span>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="close">← Về danh sách đơn</button></div>
      <section class="ui-panel v3-form">
        <div class="ui-fields">
          <div class="ui-field"><span class="ui-label">Khách hàng</span><div class="v3-fixed">${esc(kh?.ten_ngan || '')}</div></div>
          <label class="ui-field"><span class="ui-label">Số đơn <b class="ui-req">*</b></span><input type="text" class="ui-input ui-input-strong" data-h="so_don" value="${esc(D.so_don)}"></label>
          <label class="ui-field"><span class="ui-label">Đơn hàng đợt <b class="ui-req">*</b> <span class="ui-label-note">phiếu xuất chỉ trừ vào đơn cùng đợt</span></span>
            <input type="number" min="1" max="999" step="1" class="ui-input ui-input-strong" data-h="dot" value="${esc(D.dot)}"
              title="Phiếu xuất kho chọn đợt nào thì trừ vào đơn của đợt đó. Phiếu cũ chưa ghi đợt được tính là đợt 1."></label>
          <label class="ui-field"><span class="ui-label">Ngày giao</span><input type="date" class="ui-input" data-h="ngay_giao" value="${esc(D.ngay_giao)}"></label>
          <label class="ui-field"><span class="ui-label">Ghi chú</span><input type="text" class="ui-input" data-h="ghi_chu" value="${esc(D.ghi_chu)}"></label>
        </div>
        <div class="v3-sizes-head">
          <span class="ui-label">Các PO của đơn</span>
          ${days.length > 1 ? `<span class="v3-days"><span class="ui-hint">Cột size:</span>${days.map((d, i) => `<button type="button" class="ui-chip ${i === S.day ? 'active' : ''}" data-act="day" data-day="${i}">${esc(d.ten)}</button>`).join('')}
            <button type="button" class="ui-chip ${S.day < 0 ? 'active' : ''}" data-act="day" data-day="-1">Tất cả size</button></span>` : ''}
        </div>
        <p class="sheet-help">Dùng như Excel: bấm ô rồi gõ · mũi tên / <kbd>Tab</kbd> / <kbd>Enter</kbd> đi ô · kéo chuột chọn vùng ·
          <kbd>Ctrl+C</kbd> <kbd>Ctrl+V</kbd> copy / dán (dán khối từ Excel theo <b>đúng thứ tự cột</b>: ART · PO · Màu · Đơn giá · các size) ·
          <kbd>Delete</kbd> xóa · <kbd>Ctrl+D</kbd> điền xuống · <kbd>Ctrl+Z</kbd> hoàn tác · <kbd>F2</kbd> sửa trong ô · chuột phải chèn / xóa dòng. Ô ART trống = cùng ART dòng trên.</p>
        <div class="sheet-wrap" id="dd-grid"></div>
        <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="add-rows">＋ Thêm 5 dòng</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="del-rows">Xóa dòng đang chọn</button></div>
        <div id="dd-sum" class="dd-sum"></div>
      </section>
      <div class="ui-actionbar v3-actionbar">
        <div class="v3-grand">Tổng đơn: <b id="dd-grand">0</b> đôi</div>
        <div class="ui-flex-fill"></div>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="close">Đóng</button>
        <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="save">💾 Lưu đơn</button>
      </div>`;
    renderGrid();
  }

  /** Bảng nhập kiểu Excel (sheet.js): cột ART · PO · Màu · Đơn giá · size; bên phải Tổng (+ Đã thả · Đã xuất · Còn lại khi đơn đã lưu) */
  function renderGrid() {
    const D = S.don;
    const saved = !D.isNew;
    const cols = columns().map(c => ({ key: c.k === 'sz' ? 'sz:' + c.s : c.k, title: c.t, num: !!c.num,
      width: c.k === 'art' ? 130 : c.k === 'po' ? 120 : c.k === 'mau' ? 96 : c.k === 'don_gia' ? 84 : 56 }));
    S.sheet = window.Sheet.create($('dd-grid'), {
      cols, rows: D.lines, newRow: emptyLine,
      get: (l, key) => (key.startsWith('sz:') ? cellVal(l, { k: 'sz', s: key.slice(3) }) : cellVal(l, { k: key })),
      set: (l, key, v) => {
        if (key.startsWith('sz:')) { const s = key.slice(3); if (qtyNum(v)) l.sizes[s] = v; else delete l.sizes[s]; }
        else l[key] = v;
      },
      placeholder: (l, key, r) => { if (key !== 'art' || String(l.art).trim()) return ''; return effArts()[r] || ''; },
      canDelete: l => (l.info && l.info.tong_tha > 0 ? `PO ${l.po} đã thả chuyền, không bỏ khỏi đơn được` : true),
      extraHead: () => `<th class="sheet-num">Tổng</th>${saved ? '<th class="sheet-num">Đã thả</th><th class="sheet-num">Đã xuất</th><th class="sheet-num">Còn lại</th>' : ''}`,
      extraCells: l => `<td class="sheet-x"><b>${fmt(rowTotal(l))}</b></td>${saved ? (l.info
        ? `<td class="sheet-x">${fmt(l.info.tong_tha)}</td><td class="sheet-x">${fmt(l.info.tong_xuat + l.info.tong_dc)}</td>
           <td class="sheet-x ${l.info.con_phai_giao ? '' : 'v3-ok'}">${l.info.tong_dat ? (l.info.con_phai_giao ? fmt0(l.info.con_phai_giao) : '✓') : ''}</td>`
        : '<td class="sheet-x"></td><td class="sheet-x"></td><td class="sheet-x"></td>') : ''}`,
      onChange: () => { S.dirty = true; renderSum(); },
    });
    renderSum();
  }

  /** Tổng theo từng ART + tổng đơn (chỉ vẽ phần chữ, không đụng ô đang gõ) */
  function renderSum() {
    const D = S.don;
    const arts = effArts();
    const by = new Map();
    D.lines.forEach((l, r) => {
      const t = rowTotal(l);
      if (!arts[r] || (!String(l.po).trim() && !t)) return;
      const k = normKey(arts[r]);
      if (!by.has(k)) by.set(k, { art: arts[r], po: 0, sl: 0 });
      const g = by.get(k); g.po++; g.sl += t;
    });
    const grand = D.lines.reduce((a, l) => a + rowTotal(l), 0);
    const box = $('dd-sum');
    if (box) box.innerHTML = by.size ? [...by.values()].map(g => `<span class="v3-chip">ART <b>${esc(g.art)}</b> · ${g.po} PO · <b>${fmt0(g.sl)}</b></span>`).join('') : '';
    const gr = $('dd-grand'); if (gr) gr.textContent = fmt0(grand);
  }


  function saveDon() { return once('dh-save', saveDonCore); }
  async function saveDonCore() {
    const D = S.don;
    S.sheet?.markErrors({});
    const body = {
      khach_hang_id: D.khach_hang_id, so_don: D.so_don, dot: parseInt(D.dot, 10) || null, ngay_giao: D.ngay_giao, ghi_chu: D.ghi_chu,
      lines: D.lines.map(l => ({ id: l.id, art: l.art, po: l.po, mau: l.mau, don_gia: priceNum(l.don_gia),
        sizes: Object.entries(l.sizes).filter(([, v]) => qtyNum(v)).map(([size, v]) => ({ size, so_luong: qtyNum(v) })) })),
    };
    try {
      const r = D.id ? await api(`/api/dondat/${D.id}`, 'PUT', body) : await api('/api/dondat', 'POST', body);
      toast(r.message || 'Đã lưu đơn', 'success');
      S.dirty = false;
      S.dotMoiKh = null; // đợt gợi ý tính lại
      await openDon({ id: r.id, khach_hang_id: D.khach_hang_id });
      if (window.Catalog) { await window.Catalog.load(); window.dispatchEvent(new Event('catalog-changed')); }
    } catch (err) {
      // Tô đỏ các dòng lỗi "Dòng n: ..."
      const loi = {};
      err.message.split('\n').forEach(m => { const n = (m.match(/^Dòng (\d+)/) || [])[1]; if (n) loi[n - 1] = m; });
      S.sheet?.markErrors(loi);
      toast('Chưa lưu được:\n' + err.message, 'error');
    }
  }

  function closeDon() {
    if (S.dirty && !confirm('Đơn đang nhập chưa lưu sẽ bị bỏ. Vẫn đóng?')) return;
    S.view = 'list'; S.don = null; S.dirty = false;
    render();
  }

  /* ---------------- SỰ KIỆN ---------------- */
  function onInput(e) {
    const t = e.target;
    if (!S.don) return;
    if (t.dataset.h) { S.don[t.dataset.h] = t.value; S.dirty = true; }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'dh-f-tt') { S.tt = t.value; loadList(); return; }
  }
  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (t.id === 'dh-f-q' && e.key === 'Enter') { S.q = t.value.trim(); loadList(); }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'new') { if (!khId()) { toast('Chọn 1 khách hàng ở thanh bên trái trước', 'error'); return; } newDon(); }
    if (act === 'open') openDon(S.list[+b.dataset.i]);
    if (act === 'del-don') {
      const d = S.list[+b.dataset.i];
      if (!confirm(`Xóa đơn ${d.so_don} cùng ${d.so_po} PO?`)) return;
      try { const r = await api(`/api/dondat/${d.id}`, 'DELETE'); toast(r.message, 'info'); loadList(); }
      catch (err) { toast(err.message, 'error'); }
    }
    if (act === 'close') closeDon();
    if (act === 'save') saveDon();
    if (act === 'add-rows') S.sheet?.addRows(5);
    if (act === 'del-rows') S.sheet?.deleteRows();
    if (act === 'day') { S.day = parseInt(b.dataset.day, 10); renderDon(); }
  }

  /* ---------------- KHỞI ĐỘNG ---------------- */
  async function show() {
    await window.AuthReady;
    const root = $('dh-root');
    if (!root) return;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
      renderShell();
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeydown);
      render();
    } else if (S.view === 'list') renderListView(); // vẽ lại cả khung lọc: thanh bên có thể đã đổi khách khi đang ở tab khác (nút Tạo đơn mới)
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-donhang"]')?.addEventListener('click', show);
    // Đơn đang nhập chưa lưu -> hỏi trước khi thanh bên đổi khách
    if (window.KH) window.KH.guard(id => (S.view === 'don' && S.don && S.dirty && id !== S.don.khach_hang_id
      ? `Đơn ${S.don.so_don || ''} đang nhập chưa lưu sẽ bị bỏ.` : ''));
    window.addEventListener('kh-changed', () => {
      if (!$('dh-root')?.dataset.ready) return;
      if (S.view === 'don' && S.don && S.don.khach_hang_id !== khId()) { S.view = 'list'; S.don = null; S.dirty = false; }
      if ($('tab-donhang')?.classList.contains('active')) render(); // tab khác: show() tự tải khi mở
    });
  }
  /** Gọi từ tab Chỉ lệnh sau khi lưu / hủy chỉ lệnh: cập nhật số đã thả */
  window.DonHang = {
    reload: () => {
      if (!$('dh-root')?.dataset.ready) return;
      if (S.view === 'don' && S.don && S.don.id && !S.dirty) openDon({ id: S.don.id, khach_hang_id: S.don.khach_hang_id });
      else if (S.view === 'list') loadList();
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
