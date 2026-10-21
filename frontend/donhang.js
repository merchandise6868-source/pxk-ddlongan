/**
 * TAB ĐƠN HÀNG (dữ liệu gốc): quản lý theo ĐƠN – 1 đơn của 1 khách gồm nhiều ART, mỗi ART nhiều PO, số lượng theo size.
 * Nhập bằng bảng kiểu Excel: copy khối trong Excel, bấm vào ô rồi Ctrl+V là điền hết (tự thêm dòng).
 * Khách hàng theo thanh bên (window.KH); "Tất cả khách hàng" chỉ xem, không tạo đơn.
 * Quy tắc gõ Telex: input chỉ cập nhật dữ liệu, không vẽ lại ô đang gõ; keydown bỏ qua khi isComposing.
 */
(function () {
  const { esc, fmt, fmt0, api, toast, normSize, normKey, khSizes, viDate, today, $ } = window.U;
  const C = () => window.Catalog || { khach: [], khachAll: [], po: [], byId: () => null };
  const khId = () => (window.KH ? window.KH.one() : null);
  /** Số dán từ Excel: "1.000" / "1,000" / "1 000" -> 1000 */
  const qtyNum = v => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10) || 0;
  const BLANK_ROWS = 8;

  const S = {
    q: '', tt: 'con', list: [],
    view: 'list',      // 'list' | 'don'
    don: null,         // { id, isNew, khach_hang_id, so_don, ngay_giao, ghi_chu, lines: [...] }
    day: -1,           // dãy size đang hiện (-1 = tất cả)
    sel: new Set(), dirty: false,
  };
  const emptyLine = () => ({ id: null, art: '', po: '', mau: '', don_gia: '', sizes: {}, info: null });

  /* ---------------- KHUNG ---------------- */
  function renderShell() {
    $('dh-root').innerHTML = `
      <header class="ui-page-head"><h2>Đơn hàng</h2>
        <p>Mỗi đơn gồm nhiều ART, mỗi ART nhiều PO với số lượng theo size. Chỉ lệnh thả chuyền và theo dõi xuất hàng đều lấy từ đây.</p></header>
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
    try {
      const { data } = await api('/api/dondat?' + p);
      S.list = data;
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
        <td><b>${esc(d.so_don)}</b>${d.ghi_chu ? `<br><small class="ui-muted">${esc(d.ghi_chu)}</small>` : ''}</td>
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
  function newDon() {
    const kh = C().byId(khId());
    S.don = { id: 0, isNew: true, khach_hang_id: khId(), so_don: suggestSoDon(kh), ngay_giao: '', ghi_chu: '',
      lines: Array.from({ length: BLANK_ROWS }, emptyLine) };
    S.day = -1; S.sel.clear(); S.dirty = false; S.view = 'don';
    render();
    document.querySelector('#dh-view .dd-cell')?.focus();
  }
  async function openDon(d) {
    if (window.KH && !window.KH.set(d.khach_hang_id)) return; // đang xem Tất cả -> thanh bên theo khách của đơn
    try {
      const { data } = await api(`/api/dondat/${d.id}${d.id ? '' : `?khach_hang_id=${d.khach_hang_id}`}`);
      S.don = {
        id: data.id, isNew: !data.id, khach_hang_id: data.khach_hang_id, so_don: data.so_don || suggestSoDon(C().byId(data.khach_hang_id)),
        ngay_giao: data.ngay_giao || '', ghi_chu: data.ghi_chu || '',
        lines: data.lines.map(o => ({ id: o.id, art: o.art, po: o.po, mau: o.mau || '', don_gia: o.don_gia || '',
          sizes: Object.fromEntries(o.sizes.filter(s => s.dat).map(s => [s.size, s.dat])), info: o })),
      };
      S.don.lines.push(emptyLine(), emptyLine());
      S.day = -1; S.sel.clear(); S.dirty = false; S.view = 'don';
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
  const cellVal = (l, c) => (c.k === 'sz' ? (qtyNum(l.sizes[c.s]) ? fmt(qtyNum(l.sizes[c.s])) : '') : c.k === 'don_gia' ? (qtyNum(l.don_gia) ? fmt(qtyNum(l.don_gia)) : '') : (l[c.k] ?? ''));

  function renderDon() {
    const D = S.don;
    const kh = C().byId(D.khach_hang_id);
    const days = (kh && kh.day_size) || [];
    $('dh-view').innerHTML = `
      <div class="ui-return-note v3-editing"><span>${D.isNew ? (D.lines.some(l => l.id) ? 'Gom các PO lẻ vào một đơn' : 'Tạo đơn mới') : `Đơn <b>${esc(D.so_don)}</b>`} · khách <b>${esc(kh?.ten_ngan || '')}</b></span>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="close">← Về danh sách đơn</button></div>
      <section class="ui-panel v3-form">
        <div class="ui-fields">
          <div class="ui-field"><span class="ui-label">Khách hàng</span><div class="v3-fixed">${esc(kh?.ten_ngan || '')}</div></div>
          <label class="ui-field"><span class="ui-label">Số đơn <b class="ui-req">*</b></span><input type="text" class="ui-input ui-input-strong" data-h="so_don" value="${esc(D.so_don)}"></label>
          <label class="ui-field"><span class="ui-label">Ngày giao</span><input type="date" class="ui-input" data-h="ngay_giao" value="${esc(D.ngay_giao)}"></label>
          <label class="ui-field"><span class="ui-label">Ghi chú</span><input type="text" class="ui-input" data-h="ghi_chu" value="${esc(D.ghi_chu)}"></label>
        </div>
        <div class="v3-sizes-head">
          <span class="ui-label">Các PO của đơn</span>
          ${days.length > 1 ? `<span class="v3-days"><span class="ui-hint">Cột size:</span>${days.map((d, i) => `<button type="button" class="ui-chip ${i === S.day ? 'active' : ''}" data-act="day" data-day="${i}">${esc(d.ten)}</button>`).join('')}
            <button type="button" class="ui-chip ${S.day < 0 ? 'active' : ''}" data-act="day" data-day="-1">Tất cả size</button></span>` : ''}
        </div>
        <p class="ui-hint">Copy trong Excel các cột <b>đúng thứ tự cột của bảng</b> (ART · PO · Màu · Đơn giá · các size), bấm vào ô bắt đầu rồi <b>Ctrl+V</b>. Ô ART để trống = cùng ART dòng trên. Enter / mũi tên lên xuống để đi dòng.</p>
        <div class="v3-table-wrap dd-wrap" id="dd-grid"></div>
        <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="add-rows">＋ Thêm 5 dòng</button>
          <span class="ui-hint" id="dd-sel-note"></span><div class="ui-flex-fill"></div>
          ${D.isNew ? '' : '<button type="button" class="ui-btn ui-btn-ghost" data-act="tha" id="dd-tha" disabled>🧵 Thả chuyền PO đã chọn</button>'}</div>
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

  function renderGrid() {
    const D = S.don;
    const cols = columns();
    const arts = effArts();
    const saved = !D.isNew;
    $('dd-grid').innerHTML = `<table class="v3-table dd-grid">
      <thead><tr><th class="c">#</th>${saved ? '<th class="c">Thả</th>' : ''}
        ${cols.map(c => `<th class="${c.k === 'sz' ? 'c v3-sz' : ''} dd-h-${c.k}">${esc(c.t)}</th>`).join('')}
        <th class="r">Tổng</th>${saved ? '<th class="r">Đã thả</th><th class="r">Đã xuất</th><th class="r">Còn lại</th>' : ''}<th></th></tr></thead>
      <tbody>${D.lines.map((l, r) => {
        const locked = l.info && l.info.tong_tha > 0;
        return `<tr data-r="${r}">
          <td class="c ui-muted">${r + 1}</td>
          ${saved ? `<td class="c">${l.id ? `<input type="checkbox" class="dd-sel" ${S.sel.has(l.id) ? 'checked' : ''} aria-label="Chọn PO ${esc(l.po)}">` : ''}</td>` : ''}
          ${cols.map((c, ci) => `<td class="dd-td-${c.k}"><input class="dd-cell${c.num ? ' dd-num' : ''}" data-r="${r}" data-c="${ci}" ${c.num ? 'inputmode="numeric"' : ''}
            value="${esc(cellVal(l, c))}" ${c.k === 'art' && !String(l.art).trim() && arts[r] ? `placeholder="${esc(arts[r])}"` : ''} autocomplete="off"></td>`).join('')}
          <td class="r"><b data-tot="${r}">${fmt(rowTotal(l))}</b></td>
          ${saved ? (l.info ? `<td class="r">${fmt(l.info.tong_tha)}</td><td class="r">${fmt(l.info.tong_xuat + l.info.tong_dc)}</td>
            <td class="r ${l.info.con_phai_giao ? '' : 'v3-ok'}">${l.info.tong_dat ? (l.info.con_phai_giao ? fmt0(l.info.con_phai_giao) : '✓') : ''}</td>` : '<td></td><td></td><td></td>') : ''}
          <td class="c"><button type="button" class="ui-btn-sm dd-del" data-act="del-row" data-r="${r}" ${locked ? 'disabled title="PO đã thả chuyền, không bỏ được"' : 'title="Bỏ dòng này"'}>🗑</button></td></tr>`;
      }).join('')}</tbody></table>`;
    renderSum();
    renderSelNote();
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

  function renderSelNote() {
    const btn = $('dd-tha');
    if (!btn) return;
    const rows = S.don.lines.filter(l => l.id && S.sel.has(l.id));
    const arts = new Set(rows.map(l => normKey(l.art)));
    btn.disabled = !rows.length || arts.size !== 1;
    const note = $('dd-sel-note');
    if (note) note.innerHTML = rows.length ? (arts.size === 1 ? `Đã chọn ${rows.length} PO · ART <b>${esc(rows[0].art)}</b>` : '<span class="v3-neg">Chỉ thả chuyền được các PO cùng 1 ART</span>') : '';
  }

  /** Dán khối từ Excel bắt đầu tại ô (r, c) */
  function pasteBlock(r0, c0, text) {
    const cols = columns();
    let rows = String(text).replace(/\r/g, '').split('\n');
    if (rows.length && rows[rows.length - 1] === '') rows.pop();
    rows = rows.map(l => l.split('\t'));
    // Bỏ dòng tiêu đề (có chữ PO / ART / Mã hàng)
    rows = rows.filter(cells => !cells.some(x => /^(po|art|m[aã] h[aà]ng|size)$/i.test(String(x).trim())));
    if (!rows.length) return;
    const D = S.don;
    rows.forEach((cells, i) => {
      const r = r0 + i;
      while (D.lines.length <= r) D.lines.push(emptyLine());
      const l = D.lines[r];
      cells.forEach((v, j) => {
        const c = cols[c0 + j];
        if (!c) return;
        v = String(v ?? '').trim();
        if (c.k === 'sz') { const n = qtyNum(v); if (n) l.sizes[c.s] = n; else delete l.sizes[c.s]; }
        else if (c.k === 'don_gia') l.don_gia = qtyNum(v) || '';
        else l[c.k] = v;
      });
    });
    if (D.lines.length < r0 + rows.length + 2) D.lines.push(emptyLine(), emptyLine());
    S.dirty = true;
    renderGrid();
    toast(`Đã dán ${rows.length} dòng`, 'success');
    focusCell(r0 + rows.length - 1, c0);
  }

  function focusCell(r, c) {
    const el = document.querySelector(`#dd-grid .dd-cell[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); if (el.select) el.select(); }
  }

  async function saveDon() {
    const D = S.don;
    document.querySelectorAll('#dd-grid tr.dd-err').forEach(tr => { tr.classList.remove('dd-err'); tr.removeAttribute('title'); });
    const body = {
      khach_hang_id: D.khach_hang_id, so_don: D.so_don, ngay_giao: D.ngay_giao, ghi_chu: D.ghi_chu,
      lines: D.lines.map(l => ({ id: l.id, art: l.art, po: l.po, mau: l.mau, don_gia: qtyNum(l.don_gia),
        sizes: Object.entries(l.sizes).filter(([, v]) => qtyNum(v)).map(([size, v]) => ({ size, so_luong: qtyNum(v) })) })),
    };
    try {
      const r = D.id ? await api(`/api/dondat/${D.id}`, 'PUT', body) : await api('/api/dondat', 'POST', body);
      toast(r.message || 'Đã lưu đơn', 'success');
      S.dirty = false;
      await openDon({ id: r.id, khach_hang_id: D.khach_hang_id });
      if (window.Catalog) { await window.Catalog.load(); window.dispatchEvent(new Event('catalog-changed')); }
    } catch (err) {
      // Tô đỏ các dòng lỗi "Dòng n: ..."
      err.message.split('\n').forEach(m => {
        const n = (m.match(/^Dòng (\d+)/) || [])[1];
        const tr = n && document.querySelector(`#dd-grid tr[data-r="${n - 1}"]`);
        if (tr) { tr.classList.add('dd-err'); tr.title = m; }
      });
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
    if (t.dataset.h) { S.don[t.dataset.h] = t.value; S.dirty = true; return; }
    if (!t.classList.contains('dd-cell')) return;
    const r = +t.dataset.r, c = columns()[+t.dataset.c];
    const l = S.don.lines[r];
    if (!l || !c) return;
    if (c.k === 'sz') l.sizes[c.s] = t.value; else l[c.k] = t.value;
    S.dirty = true;
    t.closest('tr')?.classList.remove('dd-err');
    const tot = document.querySelector(`#dd-grid [data-tot="${r}"]`); if (tot) tot.textContent = fmt(rowTotal(l));
    renderSum();
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'dh-f-tt') { S.tt = t.value; loadList(); return; }
    if (t.classList.contains('dd-sel')) {
      const l = S.don.lines[+t.closest('tr').dataset.r];
      if (t.checked) S.sel.add(l.id); else S.sel.delete(l.id);
      renderSelNote(); return;
    }
    if (t.classList.contains('dd-num')) { const n = qtyNum(t.value); t.value = n ? fmt(n) : ''; }
    if (t.classList.contains('dd-cell') && columns()[+t.dataset.c]?.k === 'art') {
      // ART đổi -> cập nhật chữ mờ "cùng ART dòng trên" của các dòng dưới
      const arts = effArts();
      document.querySelectorAll('#dd-grid .dd-cell[data-c="0"]').forEach(el => {
        const r = +el.dataset.r;
        el.placeholder = !String(S.don.lines[r].art).trim() && arts[r] ? arts[r] : '';
      });
      renderSum();
    }
  }
  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (t.id === 'dh-f-q' && e.key === 'Enter') { S.q = t.value.trim(); loadList(); return; }
    if (!t.classList.contains('dd-cell')) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      if (r + 1 >= S.don.lines.length) { S.don.lines.push(emptyLine()); renderGrid(); }
      focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp' && r > 0) {
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      focusCell(r - 1, c);
    }
  }
  function onPaste(e) {
    const t = e.target;
    if (!t.classList || !t.classList.contains('dd-cell')) return;
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // 1 ô: dán bình thường
    e.preventDefault();
    pasteBlock(+t.dataset.r, +t.dataset.c, text);
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
    if (act === 'add-rows') { for (let i = 0; i < 5; i++) S.don.lines.push(emptyLine()); renderGrid(); }
    if (act === 'del-row') {
      const r = +b.dataset.r;
      const l = S.don.lines[r];
      if (l.id && !confirm(`Bỏ PO ${l.po} khỏi đơn? (Bấm Lưu đơn mới xóa hẳn)`)) return;
      S.don.lines.splice(r, 1);
      if (l.id) S.sel.delete(l.id);
      if (!S.don.lines.length) S.don.lines.push(emptyLine());
      S.dirty = true; renderGrid();
    }
    if (act === 'day') { S.day = parseInt(b.dataset.day, 10); renderDon(); }
    if (act === 'tha') {
      if (S.dirty) { toast('Lưu đơn trước khi thả chuyền', 'error'); return; }
      const rows = S.don.lines.filter(l => l.id && S.sel.has(l.id));
      if (!window.ChiLenh) { toast('Chưa tải được tab Chỉ lệnh', 'error'); return; }
      window.ChiLenh.openFromOrders(S.don.khach_hang_id, rows[0].art, rows.map(l => l.id));
    }
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
      root.addEventListener('paste', onPaste);
      render();
    } else if (S.view === 'list') loadList();
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
