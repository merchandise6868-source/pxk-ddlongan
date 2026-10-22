/**
 * TAB 🧺 TỔ MAY XUẤT KHO (tab-maykho)
 * - Nhập: tổ may ghi số giao kho trong ngày theo ART · PO · size (bảng kiểu Excel, Ctrl+V dán khối, ô ART trống = dòng trên).
 *   Tài khoản gắn tổ nào thì chỉ nhập / xem tổ đó (server ép).
 * - Đối chiếu cuối ngày: tổ may báo so với phiếu xuất kho thật cùng ngày của chuyền đó, báo lệch theo PO / size.
 * Khách hàng theo thanh bên (window.KH). Quy tắc Telex: keydown bỏ qua isComposing, không vẽ lại ô đang gõ.
 */
(function () {
  const { esc, fmt, fmt0, api, toast, normKey, normSize, khSizes, viDate, today, downloadCsv, once, seq, latest, $ } = window.U;
  const C = () => window.Catalog || { khach: [], po: [], byId: () => null };
  const khId = () => (window.KH ? window.KH.one() : null);
  const qty = v => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10) || 0;
  const BLANK = 8;

  const S = {
    sub: 'nhap', ngay: today(), to: '', tos: [], coDinh: '',
    rows: [], editId: null, dirty: false, list: [], dc: null,
  };
  const emptyRow = () => ({ art: '', po: '', sizes: {} });
  const newRows = () => Array.from({ length: BLANK }, emptyRow);
  const toTen = ma => S.tos.find(t => t.ma === ma)?.ten || ma;

  function render() {
    const root = $('tmk-root');
    root.innerHTML = `
      <header class="ui-page-head"><h2>Tổ may xuất kho</h2>
        <p>Tổ may ghi số giao kho trong ngày theo ART · PO · size. Cuối ngày đối chiếu với <b>phiếu xuất kho thật</b> cùng ngày của chuyền đó.</p></header>
      <nav class="ui-tabs v3-subs">
        <button type="button" class="ui-tab ${S.sub === 'nhap' ? 'active' : ''}" data-sub="nhap">📝 Nhập số giao kho</button>
        <button type="button" class="ui-tab ${S.sub === 'dc' ? 'active' : ''}" data-sub="dc">⚖️ Đối chiếu cuối ngày</button>
      </nav>
      <div class="ui-panel v3-filter">
        <label class="ui-field"><span class="ui-label">Ngày</span><input type="date" class="ui-input" id="tmk-ngay" value="${esc(S.ngay)}"></label>
        <label class="ui-field"><span class="ui-label">Tổ may</span>${S.coDinh
          ? `<div class="v3-fixed">${esc(toTen(S.coDinh))} (${esc(S.coDinh)})</div>`
          : `<select class="ui-input" id="tmk-to">${S.sub === 'dc' ? '<option value="">Tất cả tổ may</option>' : '<option value="">Chọn tổ</option>'}${S.tos.map(t =>
            `<option value="${esc(t.ma)}" ${S.to === t.ma ? 'selected' : ''}>${esc(t.ten)} (${esc(t.ma)})</option>`).join('')}</select>`}</label>
        ${S.sub === 'dc' ? '<div class="v3-filter-btns"><button type="button" class="ui-btn ui-btn-primary" data-act="dc-load">Đối chiếu</button><button type="button" class="ui-btn ui-btn-ghost" data-act="dc-csv">⬇ Tải CSV</button></div>' : ''}
      </div>
      <div id="tmk-pane"></div>`;
    if (S.sub === 'nhap') renderNhap(); else loadDc();
  }

  /* ---------------- NHẬP ---------------- */
  function cols() {
    const kh = C().byId(khId());
    const base = khSizes(kh);
    const used = new Set(S.rows.flatMap(r => Object.keys(r.sizes).filter(s => qty(r.sizes[s]))));
    return [...base, ...[...used].filter(s => !base.includes(s))];
  }
  const COLS = () => [{ k: 'art', t: 'ART' }, { k: 'po', t: 'PO' }, ...cols().map(s => ({ k: 'sz', s, t: s }))];
  function effArts() { let last = ''; return S.rows.map(r => { if (String(r.art).trim()) last = String(r.art).trim(); return last; }); }
  const rowTot = r => Object.values(r.sizes).reduce((a, v) => a + qty(v), 0);

  function renderNhap() {
    const pane = $('tmk-pane');
    if (!khId()) { pane.innerHTML = '<section class="ui-panel"><p class="v3-need-kh">Chọn <b>1 khách hàng</b> ở thanh bên trái để nhập số giao kho.</p></section>'; return; }
    if (!S.rows.length) S.rows = newRows();
    pane.innerHTML = `
      ${S.editId ? `<div class="ui-return-note v3-editing"><span>Đang sửa một lần nhập đã lưu</span><button type="button" class="ui-btn ui-btn-ghost" data-act="new">Hủy sửa, nhập mới</button></div>` : ''}
      <section class="ui-panel v3-form">
        <p class="sheet-help">Dùng như Excel: bấm ô rồi gõ · mũi tên / <kbd>Tab</kbd> / <kbd>Enter</kbd> đi ô · kéo chuột chọn vùng ·
          <kbd>Ctrl+C</kbd> <kbd>Ctrl+V</kbd> (dán khối từ Excel theo đúng thứ tự cột: ART · PO · các size) · <kbd>Delete</kbd> xóa ·
          <kbd>Ctrl+D</kbd> điền xuống · <kbd>Ctrl+Z</kbd> hoàn tác · chuột phải chèn / xóa dòng. Ô ART trống = cùng ART dòng trên; gõ PO có trong đơn hàng thì ART tự điền.</p>
        <div class="sheet-wrap" id="tmk-grid"></div>
        <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="add-rows">＋ Thêm 5 dòng</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="del-rows">Xóa dòng đang chọn</button><div class="ui-flex-fill"></div>
          <span class="v3-grand">Tổng: <b id="tmk-grand">0</b> đôi</span>
          <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="save">💾 Lưu số giao kho</button></div>
      </section>
      <section class="ui-panel"><h3 class="ui-panel-title">Đã nhập ngày ${esc(viDate(S.ngay))}</h3><div id="tmk-list"><div class="v3-empty">Đang tải...</div></div></section>`;
    renderGrid();
    loadList();
  }

  /** Bảng nhập kiểu Excel (sheet.js): ART · PO · size; bên phải cột Tổng */
  function renderGrid() {
    const cols = COLS().map(c => ({ key: c.k === 'sz' ? 'sz:' + c.s : c.k, title: c.t, num: c.k === 'sz', width: c.k === 'art' ? 130 : c.k === 'po' ? 120 : 56 }));
    S.sheet = window.Sheet.create($('tmk-grid'), {
      cols, rows: S.rows, newRow: emptyRow,
      get: (r, key) => { if (key.startsWith('sz:')) { const n = qty(r.sizes[key.slice(3)]); return n ? fmt(n) : ''; } return r[key] || ''; },
      set: (r, key, v) => { if (key.startsWith('sz:')) { const s = key.slice(3); if (qty(v)) r.sizes[s] = v; else delete r.sizes[s]; } else r[key] = v; },
      placeholder: (r, key, i) => (key === 'art' && !String(r.art).trim() ? effArts()[i] || '' : ''),
      extraHead: () => '<th class="sheet-num">Tổng</th>',
      extraCells: r => `<td class="sheet-x"><b>${fmt(rowTot(r))}</b></td>`,
      onChange: i => {
        S.dirty = true;
        // Gõ PO có trong đơn hàng -> tự điền ART nếu ô ART trống
        const r = i !== null && i !== undefined ? S.rows[i] : null;
        if (r && String(r.po).trim() && !String(r.art).trim()) {
          const hit = C().po.find(p => p.khach_hang_id === khId() && normKey(p.po) === normKey(r.po));
          if (hit && normKey(effArts()[i]) !== normKey(hit.art)) {
            r.art = hit.art;
            const a = document.querySelector(`#tmk-grid .sheet-in[data-r="${i}"][data-c="0"]`); if (a) a.value = hit.art;
          }
        }
        grand();
      },
    });
    grand();
  }
  function grand() { const g = $('tmk-grand'); if (g) g.textContent = fmt0(S.rows.reduce((a, r) => a + rowTot(r), 0)); }

  async function loadList() {
    const to = S.coDinh || S.to;
    const p = new URLSearchParams({ ngay: S.ngay });
    if (to) p.set('ma_bo_phan', to);
    const n = seq('tm-list');
    try {
      const data = (await api('/api/tomay/xuat?' + p)).data;
      if (!latest('tm-list', n)) return;
      S.list = data;
      const box = $('tmk-list');
      if (!box) return;
      if (!S.list.length) { box.innerHTML = '<div class="v3-empty">Chưa nhập lần nào trong ngày này.</div>'; return; }
      box.innerHTML = `<table class="v3-table v3-table-mini"><thead><tr><th>Tổ</th><th>Khách hàng</th><th>ART · PO</th><th class="r">Tổng</th><th>Người nhập</th><th></th></tr></thead>
        <tbody>${S.list.map((x, i) => {
          const g = new Map();
          x.lines.forEach(l => { const k = `${l.art} · ${l.po}`; g.set(k, (g.get(k) || 0) + l.so_luong); });
          return `<tr class="${x.id === S.editId ? 'v3-row-on' : ''}"><td>${esc(toTen(x.ma_bo_phan))}</td><td>${esc((C().byId(x.khach_hang_id) || {}).ten_ngan || '')}</td>
            <td><small>${[...g].slice(0, 5).map(([k, v]) => `${esc(k)} (${fmt0(v)})`).join('<br>')}${g.size > 5 ? `<br>+ ${g.size - 5} PO` : ''}</small></td>
            <td class="r"><b>${fmt0(x.tong_sl)}</b></td><td>${esc(x.nguoi)}</td>
            <td class="nowrap"><button type="button" class="ui-btn-sm" data-act="edit" data-i="${i}">Sửa</button>
              <button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="del" data-i="${i}">Xóa</button></td></tr>`;
        }).join('')}</tbody></table>`;
    } catch (err) { const box = $('tmk-list'); if (box) box.innerHTML = `<div class="v3-empty">Lỗi tải: ${esc(err.message)}</div>`; }
  }

  function save() { return once('tm-save', saveCore); }
  async function saveCore() {
    const to = S.coDinh || S.to;
    if (!to) { toast('Chọn tổ may trước', 'error'); return; }
    S.sheet?.markErrors({});
    const body = { ngay: S.ngay, ma_bo_phan: to, khach_hang_id: khId(),
      lines: S.rows.map(r => ({ art: r.art, po: r.po, sizes: Object.entries(r.sizes).filter(([, v]) => qty(v)).map(([size, v]) => ({ size, so_luong: qty(v) })) })) };
    try {
      const r = S.editId ? await api(`/api/tomay/xuat/${S.editId}`, 'PUT', body) : await api('/api/tomay/xuat', 'POST', body);
      toast(r.message, 'success');
      S.editId = null; S.dirty = false; S.rows = newRows();
      renderNhap();
    } catch (err) {
      const loi = {};
      err.message.split('\n').forEach(m => { const n = (m.match(/^Dòng (\d+)/) || [])[1]; if (n) loi[n - 1] = m; });
      S.sheet?.markErrors(loi);
      toast('Chưa lưu được:\n' + err.message, 'error');
    }
  }

  function editEntry(x) {
    if (S.dirty && !confirm('Bỏ số đang nhập dở?')) return;
    if (window.KH && !window.KH.set(x.khach_hang_id)) return;
    const m = new Map();
    x.lines.forEach(l => {
      const k = `${normKey(l.art)}|${normKey(l.po)}`;
      if (!m.has(k)) m.set(k, { art: l.art, po: l.po, sizes: {} });
      const r = m.get(k);
      r.sizes[normSize(l.size)] = (r.sizes[normSize(l.size)] || 0) + l.so_luong;
    });
    S.rows = [...m.values(), emptyRow(), emptyRow()];
    S.editId = x.id; S.dirty = false;
    if (!S.coDinh) S.to = x.ma_bo_phan;
    S.ngay = x.ngay;
    render();
  }

  /* ---------------- ĐỐI CHIẾU ---------------- */
  async function loadDc() {
    const pane = $('tmk-pane');
    pane.innerHTML = '<div class="v3-empty">Đang đối chiếu...</div>';
    const p = new URLSearchParams({ ngay: S.ngay });
    if (S.coDinh || S.to) p.set('ma_bo_phan', S.coDinh || S.to);
    if (khId()) p.set('khach_hang_id', khId());
    const n = seq('tm-dc');
    try {
      const data = (await api('/api/tomay/doichieu?' + p)).data;
      if (!latest('tm-dc', n)) return;
      S.dc = data;
      renderDc();
    } catch (err) { pane.innerHTML = `<div class="v3-empty">Lỗi: ${esc(err.message)}</div>`; }
  }
  function renderDc() {
    const pane = $('tmk-pane');
    if (!pane || S.sub !== 'dc') return;
    const lechTxt = v => (v ? `<b class="v3-neg">${v > 0 ? '+' : ''}${fmt0(v)}</b>` : '<span class="v3-ok">✓</span>');
    pane.innerHTML = (window.KH && khId() ? `<p class="ui-hint v3-mb">Chỉ đối chiếu khách <b>${esc(window.KH.name())}</b> – chọn Tất cả khách hàng ở thanh bên để đối chiếu cả ngày.</p>` : '')
      + S.dc.map(g => `<section class="ui-panel v3-td-card">
        <div class="v3-td-head"><div><b class="v3-td-po">${esc(g.ten)}</b> <span class="ui-muted">(${esc(g.ma_bo_phan)}) · ${viDate(S.ngay)}</span>
          ${!g.rows.length ? '<span class="ui-badge">Không có số liệu</span>' : g.so_lech ? `<span class="ui-badge ui-badge-warn">Lệch ${g.so_lech} dòng</span>` : '<span class="ui-badge ui-badge-ok">Khớp hết</span>'}</div>
          <div><span class="v3-chip">Tổ may báo <b>${fmt0(g.tong_tm)}</b></span><span class="v3-chip">Phiếu xuất kho <b>${fmt0(g.tong_pk)}</b></span><span class="v3-chip">Lệch ${lechTxt(g.lech)}</span></div></div>
        ${g.rows.length ? `<div class="v3-table-wrap"><table class="v3-table v3-table-mini">
          <thead><tr><th>ART</th><th>PO</th><th class="r">Tổ may báo</th><th class="r">Phiếu xuất kho</th><th class="r">Lệch</th><th>Size lệch (tổ báo / phiếu)</th></tr></thead>
          <tbody>${g.rows.map(r => `<tr class="${r.khop ? '' : 'v3-row-on'}"><td><b>${esc(r.art)}</b></td><td>${esc(r.po)}</td>
            <td class="r">${fmt0(r.tong_tm)}</td><td class="r">${fmt0(r.tong_pk)}</td><td class="r">${lechTxt(r.lech)}</td>
            <td><small>${r.sizes.filter(s => s.tm !== s.pk).map(s => `<i>${esc(s.size)}</i>: ${fmt0(s.tm)} / ${fmt0(s.pk)}`).join(' · ') || ''}</small></td></tr>`).join('')}</tbody></table></div>` : ''}
      </section>`).join('');
  }
  function dcCsv() {
    if (!S.dc) { toast('Bấm Đối chiếu trước', 'info'); return; }
    const rows = [['Ngày', 'Tổ', 'ART', 'PO', 'Size', 'Tổ may báo', 'Phiếu xuất kho', 'Lệch']];
    S.dc.forEach(g => g.rows.forEach(r => r.sizes.forEach(s => rows.push([S.ngay, g.ma_bo_phan, r.art, r.po, s.size, s.tm, s.pk, s.lech]))));
    if (rows.length === 1) { toast('Chưa có số liệu', 'info'); return; }
    downloadCsv(`doi-chieu-to-may-${S.ngay}.csv`, rows);
  }

  /* ---------------- SỰ KIỆN ---------------- */
  function onChange(e) {
    const t = e.target;
    if (t.id === 'tmk-ngay') { S.ngay = t.value || today(); if (S.sub === 'nhap') { const h = document.querySelector('#tmk-pane .ui-panel-title'); if (h) h.textContent = `Đã nhập ngày ${viDate(S.ngay)}`; loadList(); } else loadDc(); return; }
    if (t.id === 'tmk-to') { S.to = t.value; if (S.sub === 'nhap') loadList(); else loadDc(); return; }
  }
  async function onClick(e) {
    const sub = e.target.closest('.v3-subs .ui-tab');
    if (sub) { S.sub = sub.dataset.sub; if (S.sub === 'dc' && !S.coDinh && S.to && !S.tos.some(t => t.ma === S.to)) S.to = ''; render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'save') save();
      if (act === 'new') { S.editId = null; S.dirty = false; S.rows = newRows(); renderNhap(); }
      if (act === 'add-rows') S.sheet?.addRows(5);
      if (act === 'del-rows') S.sheet?.deleteRows();
      if (act === 'edit') editEntry(S.list[+b.dataset.i]);
      if (act === 'del') {
        const x = S.list[+b.dataset.i];
        if (!confirm(`Xóa lần nhập ${fmt0(x.tong_sl)} đôi của ${toTen(x.ma_bo_phan)}?`)) return;
        toast((await api(`/api/tomay/xuat/${x.id}`, 'DELETE')).message, 'info');
        if (S.editId === x.id) { S.editId = null; S.rows = newRows(); renderNhap(); } else loadList();
      }
      if (act === 'dc-load') loadDc();
      if (act === 'dc-csv') dcCsv();
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ---------------- KHỞI ĐỘNG ---------------- */
  async function show() {
    await window.AuthReady;
    if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
    const root = $('tmk-root');
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      try { const r = await api('/api/tomay/to'); S.tos = r.data; S.coDinh = r.co_dinh || ''; } catch (err) { toast(err.message, 'error'); }
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
    }
    render();
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-maykho"]')?.addEventListener('click', show);
    if (window.KH) window.KH.guard(id => (S.dirty && id !== khId() ? 'Số giao kho của tổ may đang nhập chưa lưu sẽ bị bỏ.' : ''));
    window.addEventListener('kh-changed', () => {
      if (!$('tmk-root')?.dataset.ready) return;
      S.rows = newRows(); S.editId = null; S.dirty = false;
      if ($('tab-maykho')?.classList.contains('active')) render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
