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
    const orders = C().po.filter(p => p.khach_hang_id === khId() && String(p.po || '').trim() && String(p.art || '').trim());
    pane.innerHTML = `
      ${S.editId ? `<div class="ui-return-note v3-editing"><span>Đang sửa một lần nhập đã lưu</span><button type="button" class="ui-btn ui-btn-ghost" data-act="new">Hủy sửa, nhập mới</button></div>` : ''}
      <section class="ui-panel v3-form">
        <p class="ui-hint">Copy trong Excel các cột <b>ART · PO · các size</b> theo đúng thứ tự cột của bảng, bấm vào ô bắt đầu rồi <b>Ctrl+V</b>. Ô ART trống = cùng ART dòng trên.</p>
        <div class="v3-table-wrap dd-wrap" id="tmk-grid"></div>
        <datalist id="tmk-dl-art">${[...new Set(orders.map(o => o.art.trim()))].map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>
        <datalist id="tmk-dl-po">${orders.map(o => `<option value="${esc(o.po)}">${esc(o.art)}</option>`).join('')}</datalist>
        <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="add-rows">＋ Thêm 5 dòng</button><div class="ui-flex-fill"></div>
          <span class="v3-grand">Tổng: <b id="tmk-grand">0</b> đôi</span>
          <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="save">💾 Lưu số giao kho</button></div>
      </section>
      <section class="ui-panel"><h3 class="ui-panel-title">Đã nhập ngày ${esc(viDate(S.ngay))}</h3><div id="tmk-list"><div class="v3-empty">Đang tải...</div></div></section>`;
    renderGrid();
    loadList();
  }

  function renderGrid() {
    const C2 = COLS();
    S.cols = C2; // cột cố định theo lần vẽ
    const arts = effArts();
    $('tmk-grid').innerHTML = `<table class="v3-table dd-grid">
      <thead><tr><th class="c">#</th>${C2.map(c => `<th class="${c.k === 'sz' ? 'c v3-sz' : ''}">${c.k === 'sz' ? `<i>${esc(c.t)}</i>` : esc(c.t)}</th>`).join('')}<th class="r">Tổng</th><th></th></tr></thead>
      <tbody>${S.rows.map((r, i) => `<tr data-r="${i}"><td class="c ui-muted">${i + 1}</td>
        ${C2.map((c, ci) => `<td class="dd-td-${c.k}"><input class="dd-cell${c.k === 'sz' ? ' dd-num' : ''}" data-r="${i}" data-c="${ci}" autocomplete="off"
          ${c.k === 'sz' ? 'inputmode="numeric"' : `list="tmk-dl-${c.k}"`}
          value="${esc(c.k === 'sz' ? (qty(r.sizes[c.s]) ? fmt(qty(r.sizes[c.s])) : '') : r[c.k])}"
          ${c.k === 'art' && !String(r.art).trim() && arts[i] ? `placeholder="${esc(arts[i])}"` : ''}></td>`).join('')}
        <td class="r"><b data-tot="${i}">${fmt(rowTot(r))}</b></td>
        <td class="c"><button type="button" class="ui-btn-sm dd-del" data-act="del-row" data-r="${i}" title="Bỏ dòng này">🗑</button></td></tr>`).join('')}</tbody></table>`;
    grand();
  }
  function grand() { const g = $('tmk-grand'); if (g) g.textContent = fmt0(S.rows.reduce((a, r) => a + rowTot(r), 0)); }
  function focusCell(r, c) { const el = document.querySelector(`#tmk-grid .dd-cell[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select?.(); } }

  function pasteBlock(r0, c0, text) {
    const C2 = S.cols || COLS();
    let rows = String(text).replace(/\r/g, '').split('\n');
    if (rows.length && rows[rows.length - 1] === '') rows.pop();
    rows = rows.map(l => l.split('\t')).filter(cells => !cells.some(x => /^(po|art|m[aã] h[aà]ng|size)$/i.test(String(x).trim())));
    if (!rows.length) return;
    rows.forEach((cells, i) => {
      while (S.rows.length <= r0 + i) S.rows.push(emptyRow());
      const r = S.rows[r0 + i];
      cells.forEach((v, j) => {
        const c = C2[c0 + j];
        if (!c) return;
        v = String(v ?? '').trim();
        if (c.k === 'sz') { const n = qty(v); if (n) r.sizes[c.s] = n; else delete r.sizes[c.s]; } else r[c.k] = v;
      });
    });
    S.rows.push(emptyRow(), emptyRow());
    S.dirty = true;
    renderGrid();
    toast(`Đã dán ${rows.length} dòng`, 'success');
  }

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
    document.querySelectorAll('#tmk-grid tr.dd-err').forEach(tr => tr.classList.remove('dd-err'));
    const body = { ngay: S.ngay, ma_bo_phan: to, khach_hang_id: khId(),
      lines: S.rows.map(r => ({ art: r.art, po: r.po, sizes: Object.entries(r.sizes).filter(([, v]) => qty(v)).map(([size, v]) => ({ size, so_luong: qty(v) })) })) };
    try {
      const r = S.editId ? await api(`/api/tomay/xuat/${S.editId}`, 'PUT', body) : await api('/api/tomay/xuat', 'POST', body);
      toast(r.message, 'success');
      S.editId = null; S.dirty = false; S.rows = newRows();
      renderNhap();
    } catch (err) {
      err.message.split('\n').forEach(m => { const n = (m.match(/^Dòng (\d+)/) || [])[1]; const tr = n && document.querySelector(`#tmk-grid tr[data-r="${n - 1}"]`); if (tr) tr.classList.add('dd-err'); });
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
  function onInput(e) {
    const t = e.target;
    if (!t.classList.contains('dd-cell')) return;
    const r = S.rows[+t.dataset.r], c = (S.cols || COLS())[+t.dataset.c];
    if (!r || !c) return;
    if (c.k === 'sz') r.sizes[c.s] = t.value; else r[c.k] = t.value;
    S.dirty = true;
    t.closest('tr')?.classList.remove('dd-err');
    const tot = document.querySelector(`#tmk-grid [data-tot="${t.dataset.r}"]`); if (tot) tot.textContent = fmt(rowTot(r));
    grand();
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'tmk-ngay') { S.ngay = t.value || today(); if (S.sub === 'nhap') { const h = document.querySelector('#tmk-pane .ui-panel-title'); if (h) h.textContent = `Đã nhập ngày ${viDate(S.ngay)}`; loadList(); } else loadDc(); return; }
    if (t.id === 'tmk-to') { S.to = t.value; if (S.sub === 'nhap') loadList(); else loadDc(); return; }
    if (t.classList.contains('dd-num')) { const n = qty(t.value); t.value = n ? fmt(n) : ''; }
    if (t.classList.contains('dd-cell') && (S.cols || COLS())[+t.dataset.c]?.k === 'po') {
      // Gõ PO có trong đơn hàng -> tự điền ART nếu ô ART trống
      const r = S.rows[+t.dataset.r];
      const hit = C().po.find(p => p.khach_hang_id === khId() && normKey(p.po) === normKey(t.value));
      if (hit && !String(r.art).trim() && normKey(effArts()[+t.dataset.r]) !== normKey(hit.art)) {
        r.art = hit.art;
        const a = document.querySelector(`#tmk-grid .dd-cell[data-r="${t.dataset.r}"][data-c="0"]`); if (a) a.value = hit.art;
      }
    }
  }
  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (!t.classList.contains('dd-cell')) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      if (r + 1 >= S.rows.length) { S.rows.push(emptyRow()); renderGrid(); }
      focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp' && r > 0) { e.preventDefault(); t.dispatchEvent(new Event('change', { bubbles: true })); focusCell(r - 1, c); }
  }
  function onPaste(e) {
    const t = e.target;
    if (!t.classList?.contains('dd-cell')) return;
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    pasteBlock(+t.dataset.r, +t.dataset.c, text);
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
      if (act === 'add-rows') { for (let i = 0; i < 5; i++) S.rows.push(emptyRow()); renderGrid(); }
      if (act === 'del-row') { S.rows.splice(+b.dataset.r, 1); if (!S.rows.length) S.rows.push(emptyRow()); S.dirty = true; renderGrid(); }
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
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeydown);
      root.addEventListener('paste', onPaste);
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
