/**
 * TAB XUẤT THEO ĐƠN HÀNG
 * Mỗi PO: Đặt · Đã thả chuyền · Đã xuất (từ phiếu xuất kho) · Điều chỉnh · Còn phải giao, theo từng size.
 * Điều chỉnh khi giao sai size / giao dư / thiếu: ghi dòng +/− có lý do, phiếu xuất gốc giữ nguyên.
 * Khách hàng lấy theo thanh bên (window.KH).
 */
(function () {
  const { esc, toNum, fmt, fmt0, api, toast, viDate, downloadCsv, today, $ } = window.U;
  const C = () => window.Catalog || { khach: [], khachAll: [], byId: () => null };
  const LY_DO = ['Giao sai size', 'Giao dư', 'Giao thiếu', 'Khác'];
  const CACH = { dong_bo: 'dòng đồng bộ', dong_bo_chi_tiet: 'đồng bộ (nhỏ nhất các chi tiết)', cong: '' };

  const S = { q: '', tt: 'con', data: [], unmatched: [], open: new Set(), adj: null, ganSel: {} };
  const khId = () => (window.KH ? window.KH.one() : null);

  function renderShell() {
    $('td-root').innerHTML = `
      <header class="ui-page-head"><h2>Xuất theo đơn hàng</h2>
        <p>Số đã xuất lấy tự động từ phiếu xuất kho (khớp PO + ART của cùng khách hàng). Giao sai size thì ghi điều chỉnh, không cần sửa phiếu.</p></header>
      <div class="ui-panel v3-filter">
        <label class="ui-field v3-grow"><span class="ui-label">Tìm</span><input type="search" class="ui-input" id="td-f-q" placeholder="ART, PO, số phiếu"></label>
        <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="td-f-tt">
          <option value="con">Còn phải giao</option><option value="du">Đã giao đủ</option><option value="all">Tất cả</option></select></label>
        <div class="v3-filter-btns"><button type="button" class="ui-btn ui-btn-primary" data-act="filter">Lọc</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="csv">⬇ Tải Excel (CSV)</button></div>
      </div>
      <div id="td-list"><div class="v3-empty">Đang tải...</div></div>
      <div id="td-unmatched"></div>`;
    fillFilter();
  }
  function fillFilter() {
    const tt = $('td-f-tt'); if (tt) tt.value = S.tt;
    const q = $('td-f-q'); if (q) q.value = S.q;
  }

  async function load() {
    // Lấy đủ mọi trạng thái (để ô "Gán vào đơn hàng" có cả PO đã giao đủ), lọc trạng thái ở máy
    const p = new URLSearchParams({ trang_thai: 'all' });
    if (khId()) p.set('khach_hang_id', khId());
    if (S.q) p.set('q', S.q);
    const n = U.seq('td-load');
    try {
      const r = await api('/api/theodoi?' + p);
      if (!U.latest('td-load', n)) return;
      S.all = r.data; S.unmatched = r.unmatched;
      render();
    } catch (err) { $('td-list').innerHTML = `<div class="v3-empty">Lỗi tải: ${esc(err.message)}</div>`; }
  }

  function render() {
    S.data = (S.all || []).filter(o => S.tt === 'all' || o.trang_thai === S.tt);
    renderList(); renderUnmatched();
  }

  function renderList() {
    const box = $('td-list');
    if (!S.data.length) { box.innerHTML = `<div class="ui-panel"><div class="v3-empty">${S.tt === 'con' ? 'Không có PO nào còn phải giao.' : 'Không có đơn hàng phù hợp.'}${window.KH ? window.KH.emptyNote() : ''}</div></div>`; return; }
    box.innerHTML = S.data.map(cardHtml).join('');
  }

  function cardHtml(o) {
    const cols = o.sizes.filter(s => s.dat || s.tha || s.xuat || s.dc).map(s => s.size);
    const m = Object.fromEntries(o.sizes.map(s => [s.size, s]));
    const row = (label, key, cls = '') => `<tr class="${cls}"><th>${label}</th>${cols.map(s => {
      const v = m[s][key];
      return `<td class="c ${key === 'con' && v < 0 ? 'v3-neg' : ''}">${key === 'dc' ? (v ? (v > 0 ? '+' : '') + fmt(v) : '') : key === 'con' ? (v ? fmt(v) : (m[s].dat ? '0' : '')) : fmt(v)}</td>`;
    }).join('')}<td class="r"><b>${key === 'con' ? fmt0(o.con_phai_giao) : key === 'dc' ? (o.tong_dc > 0 ? '+' : '') + fmt0(o.tong_dc) : fmt0(o['tong_' + key])}</b></td></tr>`;
    const badge = o.trang_thai === 'du' ? '<span class="ui-badge ui-badge-ok">Đã giao đủ</span>'
      : `<span class="ui-badge ui-badge-warn">Còn ${fmt0(o.con_phai_giao)}</span>`;
    const open = S.open.has(o.id);
    return `<section class="ui-panel v3-td-card" data-id="${o.id}">
      <div class="v3-td-head">
        <div><b class="v3-td-po">PO ${esc(o.po)}</b> <span class="v3-td-art">ART ${esc(o.art)}</span>
          <span class="ui-muted">· ${esc(o.khach_ten)}${o.don_hang ? ' · ĐH ' + esc(o.don_hang) : ''}${o.mau ? ' · ' + esc(o.mau) : ''}${o.ngay_giao ? ' · giao ' + viDate(o.ngay_giao) : ''}</span>
          ${badge}${o.giao_du ? ` <span class="ui-badge ui-badge-off">Dư ${fmt0(o.giao_du)}</span>` : ''}</div>
        <div class="v3-td-btns">
          <button type="button" class="ui-btn-sm" data-act="adj" data-id="${o.id}">＋ Điều chỉnh</button>
          <button type="button" class="ui-btn-sm" data-act="toggle" data-id="${o.id}">${open ? 'Ẩn chi tiết ▴' : `Chi tiết (${o.entries.length} phiếu) ▾`}</button>
        </div>
      </div>
      ${cols.length ? `<div class="v3-table-wrap"><table class="v3-table v3-td-table">
        <thead><tr><th></th>${cols.map(s => `<th class="c v3-sz">${esc(s)}</th>`).join('')}<th class="r">Tổng</th></tr></thead>
        <tbody>${row('Đặt', 'dat')}${row('Đã thả chuyền', 'tha', 'v3-muted-row')}${row('Đã xuất (phiếu)', 'xuat')}${o.tong_dc || o.adjustments.length ? row('Điều chỉnh', 'dc') : ''}${row('Còn phải giao', 'con', 'v3-con-row')}</tbody>
      </table></div>` : '<p class="ui-hint">Đơn hàng chưa có số lượng theo size (sửa ở tab Đơn hàng).</p>'}
      ${S.adj && S.adj.id === o.id ? adjFormHtml(o) : ''}
      ${open ? detailHtml(o) : ''}
    </section>`;
  }

  function adjFormHtml(o) {
    const a = S.adj;
    const sizes = o.sizes.map(s => s.size);
    const opt = sel => sizes.map(s => `<option value="${esc(s)}" ${sel === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `<div class="v3-adj" id="td-adj">
      <div class="v3-days"><label class="v3-check"><input type="radio" name="td-kieu" value="doi_size" ${a.kieu === 'doi_size' ? 'checked' : ''}> Giao sai size (đổi size)</label>
        <label class="v3-check"><input type="radio" name="td-kieu" value="cong_tru" ${a.kieu === 'cong_tru' ? 'checked' : ''}> Cộng / trừ số đã xuất</label></div>
      <div class="ui-fields">
        ${a.kieu === 'doi_size' ? `
          <label class="ui-field"><span class="ui-label">Phiếu ghi size</span><select class="ui-input" data-a="tu_size"><option value="">Chọn</option>${opt(a.tu_size)}</select></label>
          <label class="ui-field"><span class="ui-label">Thực tế giao size</span><select class="ui-input" data-a="sang_size"><option value="">Chọn</option>${opt(a.sang_size)}</select></label>
          <label class="ui-field"><span class="ui-label">Số lượng</span><input type="text" inputmode="numeric" class="ui-input" data-a="so_luong" value="${esc(a.so_luong)}"></label>`
        : `
          <label class="ui-field"><span class="ui-label">Size</span><select class="ui-input" data-a="size"><option value="">Chọn</option>${opt(a.size)}</select></label>
          <label class="ui-field"><span class="ui-label">Số lượng <span class="ui-label-note">âm = trừ bớt</span></span><input type="text" inputmode="numeric" class="ui-input" data-a="so_luong" value="${esc(a.so_luong)}" placeholder="vd: -5 hoặc 10"></label>`}
        <label class="ui-field"><span class="ui-label">Lý do</span><select class="ui-input" data-a="ly_do">${LY_DO.map(l => `<option ${a.ly_do === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="ui-field"><span class="ui-label">Số phiếu liên quan</span><input type="text" class="ui-input" data-a="so_phieu" list="td-dl-sp" value="${esc(a.so_phieu)}"></label>
        <label class="ui-field"><span class="ui-label">Ngày</span><input type="date" class="ui-input" data-a="ngay" value="${esc(a.ngay)}"></label>
        <label class="ui-field ui-span-2"><span class="ui-label">Ghi chú</span><input type="text" class="ui-input" data-a="ghi_chu" value="${esc(a.ghi_chu)}"></label>
      </div>
      <datalist id="td-dl-sp">${o.entries.map(e => `<option value="${esc(e.so_phieu)}">${viDate(e.ngay)}</option>`).join('')}</datalist>
      <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="adj-close">Đóng</button><div class="ui-flex-fill"></div>
        <button type="button" class="ui-btn ui-btn-primary" data-act="adj-save">Lưu điều chỉnh</button></div>
    </div>`;
  }

  function detailHtml(o) {
    const sz = m => Object.entries(m).map(([s, v]) => `${esc(s)}: <b>${fmt0(v)}</b>`).join(' · ');
    const canOpen = window.Auth && window.Auth.can('tab-create') && typeof window.editSlip === 'function';
    return `<div class="v3-td-detail">
      <h4>Phiếu xuất đã tính vào PO này</h4>
      ${o.entries.length ? `<table class="v3-table v3-table-mini"><thead><tr><th>Ngày</th><th>Số phiếu</th><th>Theo size</th><th class="r">Tổng</th><th></th></tr></thead><tbody>
        ${o.entries.map(e => `<tr><td class="nowrap">${viDate(e.ngay)}</td><td class="nowrap"><b>${esc(e.so_phieu)}</b>${e.ghi_chu ? `<br><small class="ui-muted">${esc(e.ghi_chu)}</small>` : ''}</td>
          <td>${sz(e.sizes)}${CACH[e.cach] ? `<br><small class="ui-muted">tính theo ${CACH[e.cach]}${e.so_dong > 1 ? `, ${e.so_dong} dòng` : ''}</small>` : ''}</td>
          <td class="r"><b>${fmt0(e.tong)}</b></td>
          <td>${canOpen ? `<button type="button" class="ui-btn-sm" data-act="open-slip" data-phieu="${e.phieu_id}">Mở phiếu</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="ui-hint">Chưa có phiếu xuất nào khớp PO + ART này.</p>'}
      ${o.adjustments.length ? `<h4>Điều chỉnh</h4><table class="v3-table v3-table-mini"><thead><tr><th>Ngày</th><th>Size</th><th class="r">Số lượng</th><th>Lý do</th><th>Ghi chú</th><th>Người chỉnh</th><th></th></tr></thead><tbody>
        ${o.adjustments.map(d => `<tr><td class="nowrap">${viDate(d.ngay)}</td><td>${esc(d.size)}</td><td class="r ${d.so_luong < 0 ? 'v3-neg' : ''}"><b>${d.so_luong > 0 ? '+' : ''}${fmt0(d.so_luong)}</b></td>
          <td>${esc(d.ly_do)}</td><td>${esc([d.so_phieu, d.ghi_chu].filter(Boolean).join(' · '))}</td><td>${esc(d.nguoi)}</td>
          <td><button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="adj-del" data-adj="${d.id}">Xóa</button></td></tr>`).join('')}</tbody></table>` : ''}
      ${o.aliases.length ? `<h4>Dòng phiếu ghi khác đã gán vào PO này</h4><ul class="v3-alias">${o.aliases.map(a =>
        `<li>PO "<b>${esc(a.po_text)}</b>" · ART "<b>${esc(a.art_text)}</b>" <button type="button" class="ui-btn-sm" data-act="ungan" data-alias="${a.id}">Bỏ gán</button></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function renderUnmatched() {
    const box = $('td-unmatched');
    const list = S.unmatched;
    if (!list.length) { box.innerHTML = ''; return; }
    const khName = id => (C().byId(id) || {}).ten_ngan || '';
    const ordersOf = kh => (S.all || []).filter(o => o.khach_hang_id === kh);
    box.innerHTML = `<section class="ui-panel">
      <h3 class="ui-panel-title">Dòng phiếu xuất chưa khớp đơn hàng (${list.length})</h3>
      <p class="ui-hint v3-mb">PO / ART trên phiếu không trùng đơn hàng nào (gõ khác, gộp nhiều PO, hoặc chưa nhập đơn hàng). Chọn đúng đơn hàng rồi bấm <b>Gán</b>; các phiếu sau ghi giống vậy sẽ tự khớp.</p>
      <div class="v3-table-wrap"><table class="v3-table v3-table-mini">
        <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Khách hàng</th><th>PO trên phiếu</th><th>ART trên phiếu</th><th>Theo size</th><th class="r">Tổng</th><th>Gán vào đơn hàng</th></tr></thead>
        <tbody>${list.slice().reverse().map(u => {
          const opts = u.khach_hang_id ? ordersOf(u.khach_hang_id) : [];
          return `<tr><td class="nowrap">${viDate(u.ngay)}</td><td class="nowrap"><b>${esc(u.so_phieu)}</b></td><td>${esc(khName(u.khach_hang_id)) || '<span class="v3-neg">Chưa chọn khách</span>'}</td>
            <td>${esc(u.po)}</td><td>${esc(u.art)}</td>
            <td><small>${Object.entries(u.sizes).map(([s, v]) => `${esc(s)}: ${fmt0(v)}`).join(' · ')}</small></td><td class="r"><b>${fmt0(u.tong)}</b></td>
            <td class="nowrap">${!u.khach_hang_id ? '<small class="ui-muted">Gán khách cho phiếu ở tab Danh sách phiếu</small>'
              : opts.length ? `<select class="ui-input v3-sel-sm" data-gan="${u.dong_id}"><option value="">Chọn PO</option>${opts.map(o =>
                `<option value="${o.id}" ${S.ganSel[u.dong_id] === o.id ? 'selected' : ''}>${esc(o.po)} · ${esc(o.art)}</option>`).join('')}</select>
                <button type="button" class="ui-btn-sm" data-act="gan" data-dong="${u.dong_id}">Gán</button>`
              : '<small class="ui-muted">Khách chưa có đơn hàng</small>'}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>`;
  }

  function exportCsv() {
    const rows = [['Khách hàng', 'ART', 'PO', 'Đơn hàng', 'Size', 'Đặt', 'Đã thả chuyền', 'Đã xuất', 'Điều chỉnh', 'Còn phải giao']];
    S.data.forEach(o => o.sizes.filter(s => s.dat || s.xuat || s.dc).forEach(s =>
      rows.push([o.khach_ten, o.art, o.po, o.don_hang, s.size, s.dat, s.tha, s.xuat, s.dc, s.con])));
    if (rows.length === 1) { toast('Chưa có số liệu để tải', 'info'); return; }
    downloadCsv(`xuat-theo-don-hang-${today()}.csv`, rows);
  }

  /* ---------------- SỰ KIỆN ---------------- */
  function onInput(e) {
    const t = e.target;
    if (S.adj && t.dataset.a) S.adj[t.dataset.a] = t.value;
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'td-f-tt') { S.tt = t.value; render(); return; }
    if (t.name === 'td-kieu' && S.adj) { S.adj.kieu = t.value; renderList(); return; }
    if (S.adj && t.dataset.a) { S.adj[t.dataset.a] = t.value; return; }
    if (t.dataset.gan) S.ganSel[t.dataset.gan] = parseInt(t.value, 10) || null;
  }
  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.id === 'td-f-q' && e.key === 'Enter') { S.q = e.target.value.trim(); load(); }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = parseInt(b.dataset.id, 10);
    try {
      if (act === 'filter') { S.q = $('td-f-q').value.trim(); load(); }
      if (act === 'csv') exportCsv();
      if (act === 'toggle') { if (S.open.has(id)) S.open.delete(id); else S.open.add(id); renderList(); }
      if (act === 'adj') { S.adj = { id, kieu: 'doi_size', tu_size: '', sang_size: '', size: '', so_luong: '', ly_do: 'Giao sai size', so_phieu: '', ngay: today(), ghi_chu: '' }; renderList(); $('td-adj')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (act === 'adj-close') { S.adj = null; renderList(); }
      if (act === 'adj-save') {
        if (S.savingAdj) return;
        const a = S.adj;
        const body = { po_id: a.id, kieu: a.kieu, ly_do: a.ly_do, so_phieu: a.so_phieu, ngay: a.ngay, ghi_chu: a.ghi_chu,
          so_luong: a.kieu === 'doi_size' ? Math.abs(toNum(a.so_luong)) : (String(a.so_luong).trim().startsWith('-') ? -1 : 1) * Math.abs(toNum(String(a.so_luong).replace('-', ''))),
          tu_size: a.tu_size, sang_size: a.sang_size, size: a.size };
        S.savingAdj = true;
        try { await api('/api/dieuchinh', 'POST', body); } finally { S.savingAdj = false; }
        toast('Đã ghi điều chỉnh', 'success');
        S.open.add(a.id); S.adj = null; await load();
      }
      if (act === 'adj-del') {
        if (!confirm('Xóa dòng điều chỉnh này? (Đổi size sẽ xóa cả cặp)')) return;
        await api(`/api/dieuchinh/${b.dataset.adj}`, 'DELETE');
        toast('Đã xóa điều chỉnh', 'info'); await load();
      }
      if (act === 'gan') {
        const u = S.unmatched.find(x => x.dong_id === parseInt(b.dataset.dong, 10));
        const poId = S.ganSel[u.dong_id];
        if (!poId) { toast('Chọn đơn hàng cần gán', 'error'); return; }
        await api('/api/theodoi/gan', 'POST', { po_id: poId, khach_hang_id: u.khach_hang_id, po_text: u.po, art_text: u.art });
        toast('Đã gán vào đơn hàng', 'success'); await load();
      }
      if (act === 'ungan') {
        if (!confirm('Bỏ gán? Các dòng phiếu ghi như vậy sẽ không còn tính vào PO này.')) return;
        await api(`/api/theodoi/gan/${b.dataset.alias}`, 'DELETE');
        toast('Đã bỏ gán', 'info'); await load();
      }
      if (act === 'open-slip') window.editSlip(parseInt(b.dataset.phieu, 10));
    } catch (err) { toast(err.message, 'error'); }
  }

  async function show() {
    await window.AuthReady;
    const root = $('td-root');
    if (!root) return;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
      renderShell();
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeydown);
    }
    load();
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-theodoi"]')?.addEventListener('click', show);
    window.addEventListener('kh-changed', () => {
      if (!$('td-root')?.dataset.ready) return;
      S.adj = null; S.open.clear(); S.ganSel = {};
      if ($('tab-theodoi')?.classList.contains('active')) load(); // tab khác: show() tự tải khi mở
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
