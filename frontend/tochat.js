/**
 * TỔ CHẶT: 2 tab
 * - ✂️ Đơn hàng tổ chặt (tab-donhangchat): đơn → PO → chi tiết (theo bộ chi tiết của ART), phải chặt · đã xuất · còn lại theo size.
 * - 🚚 Xuất nội bộ (tab-xuatchat): phiếu giao bán thành phẩm cho tổ may theo PO · chi tiết · size.
 * Khách hàng theo thanh bên (window.KH). Quy tắc Telex: keydown bỏ qua isComposing, không vẽ lại ô đang gõ.
 */
(function () {
  const { esc, toNum, fmt, fmt0, api, toast, normKey, normSize, viDate, today, firstOfMonth, printHtml, enterToNext, $ } = window.U;
  const C = () => window.Catalog || { khach: [], po: [], bophan: [], byId: () => null };
  const khId = () => (window.KH ? window.KH.one() : null);
  const isActive = id => $(id)?.classList.contains('active');
  const toMay = () => (C().bophan || []).filter(b => /^CM/i.test(b.ma));
  const bpTen = ma => (C().bophan || []).find(b => b.ma === ma)?.ten || ma || '';
  const qty = v => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10) || 0;
  const needKh = msg => `<section class="ui-panel"><p class="v3-need-kh">Chọn <b>1 khách hàng</b> ở thanh bên trái ${msg}.</p></section>`;

  /* ============================================================
     TAB 1: ĐƠN HÀNG TỔ CHẶT
     ============================================================ */
  const D = { list: [], don: null, mode: 'phai', edit: null, bo: null };

  function dRender() {
    const root = $('dhc-root');
    root.innerHTML = `
      <header class="ui-page-head"><h2>Đơn hàng tổ chặt</h2>
        <p>Đơn và PO lấy từ tab Đơn hàng. Mỗi PO tách ra các chi tiết theo bộ chi tiết của ART: <b>phải chặt = số đôi × miếng/đôi</b> (sửa được).</p></header>
      <div id="dhc-view"></div>`;
    if (!khId()) { $('dhc-view').innerHTML = needKh('để xem đơn hàng tổ chặt'); return; }
    if (D.don) dRenderDon(); else dLoadList();
  }

  async function dLoadList() {
    const box = $('dhc-view');
    box.innerHTML = '<div class="ui-panel ui-panel-flush"><div class="v3-table-wrap" id="dhc-list"><div class="v3-empty">Đang tải...</div></div></div>';
    const kh = C().byId(khId());
    if (kh && !(kh.bo_phan || []).includes('TC')) box.insertAdjacentHTML('afterbegin', `<p class="ui-hint v3-mb">Khách ${esc(kh.ten_ngan)} chưa khai báo giao tổ chặt (Danh mục → Khách hàng → Bộ phận).</p>`);
    try {
      const { data } = await api(`/api/tochat/donhang?khach_hang_id=${khId()}`);
      D.list = data;
      const el = $('dhc-list');
      if (!el) return;
      if (!data.length) { el.innerHTML = '<div class="v3-empty">Khách này chưa có đơn hàng. Đơn được tạo ở tab 📦 Đơn Hàng.</div>'; return; }
      el.innerHTML = `<table class="v3-table">
        <thead><tr><th>Số đơn</th><th>Ngày giao</th><th class="r">Số ART</th><th class="r">Số PO</th><th class="r">Phải chặt</th><th class="r">Đã xuất</th><th class="r">Còn lại</th><th></th></tr></thead>
        <tbody>${data.map((d, i) => `<tr>
          <td><b>${esc(d.so_don)}</b>${d.thieu_bo.length ? `<br><small class="v3-neg">Chưa có bộ chi tiết: ART ${d.thieu_bo.map(esc).join(', ')}</small>` : ''}</td>
          <td class="nowrap">${esc(viDate(d.ngay_giao))}</td><td class="r">${d.so_art}</td><td class="r">${d.so_po}</td>
          <td class="r"><b>${fmt0(d.tong_phai)}</b></td><td class="r">${fmt(d.tong_xuat)}</td>
          <td class="r ${d.tong_con ? '' : 'v3-ok'}"><b>${d.tong_phai ? (d.tong_con ? fmt0(d.tong_con) : '✓ đủ') : ''}</b></td>
          <td><button type="button" class="ui-btn-sm ui-btn-sm-primary" data-act="open" data-i="${i}">Mở đơn</button></td></tr>`).join('')}</tbody></table>`;
    } catch (err) { const el = $('dhc-list'); if (el) el.innerHTML = `<div class="v3-empty">Lỗi tải: ${esc(err.message)}</div>`; }
  }

  async function dOpen(id) {
    try {
      const { data } = await api(`/api/tochat/donhang/${id}${id ? '' : `?khach_hang_id=${khId()}`}`);
      D.don = data; D.edit = null; D.bo = null;
      dRender();
    } catch (err) { toast('Không mở được đơn: ' + err.message, 'error'); }
  }

  function dRenderDon() {
    const d = D.don;
    const modes = { phai: 'Phải chặt', xuat: 'Đã xuất nội bộ', con: 'Còn lại' };
    $('dhc-view').innerHTML = `
      <div class="ui-return-note v3-editing"><span>Đơn <b>${esc(d.so_don)}</b> · ${d.pos.length} PO</span>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="back">← Về danh sách đơn</button></div>
      <div class="v3-days v3-mb"><span class="ui-hint">Ô size hiện:</span>${Object.entries(modes).map(([k, t]) =>
        `<button type="button" class="ui-chip ${D.mode === k ? 'active' : ''}" data-act="mode" data-mode="${k}">${t}</button>`).join('')}</div>
      ${d.pos.map(dPoCard).join('') || '<section class="ui-panel"><div class="v3-empty">Đơn chưa có PO.</div></section>'}`;
  }

  function dPoCard(p) {
    const editing = D.edit === p.id;
    const head = `<div class="v3-td-head"><div><b class="v3-td-po">PO ${esc(p.po)}</b> <span class="v3-td-art">ART ${esc(p.art)}</span>
        <span class="ui-muted">· ${fmt0(p.tong_dat)} đôi${p.ten_bo ? ' · bộ ' + esc(p.ten_bo) : ''}</span>
        ${p.chi_tiet.length ? (p.tong_con ? `<span class="ui-badge ui-badge-warn">Còn ${fmt0(p.tong_con)}</span>` : '<span class="ui-badge ui-badge-ok">Đã xuất đủ</span>') : ''}</div>
      <div class="v3-td-btns">${p.chi_tiet.length && !editing ? `<button type="button" class="ui-btn-sm" data-act="edit" data-id="${p.id}">✏️ Sửa số phải chặt</button>` : ''}</div></div>`;
    if (!p.chi_tiet.length) {
      const open = D.bo === p.id;
      return `<section class="ui-panel v3-td-card">${head}
        <p class="v3-neg">ART ${esc(p.art)} chưa có bộ chi tiết nên chưa tách được chi tiết.</p>
        ${open ? `<div class="v3-adj"><p class="ui-hint">Mỗi dòng 1 chi tiết: <b>Tên chi tiết | số miếng/đôi | ĐVT</b> (vd: <i>Mũi trong | 2 | Miếng</i>).</p>
          <textarea class="ui-input v3-textarea" id="dhc-bo-text" rows="5" placeholder="Mũi trong | 2 | Miếng"></textarea>
          <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="bo-close">Đóng</button><div class="ui-flex-fill"></div>
            <button type="button" class="ui-btn ui-btn-primary" data-act="bo-save" data-art="${esc(p.art)}">Lưu bộ chi tiết</button></div></div>`
          : `<button type="button" class="ui-btn ui-btn-ghost" data-act="bo-open" data-id="${p.id}">＋ Khai báo bộ chi tiết cho ART ${esc(p.art)}</button>`}
      </section>`;
    }
    const cols = p.sizes;
    const cell = (c, s) => {
      if (editing) return `<td class="c"><input type="text" inputmode="numeric" class="v3-cell dhc-dm" data-ct="${esc(c.ten)}" data-size="${esc(s)}" value="${esc(fmt(c.phai[s]))}"></td>`;
      const v = D.mode === 'phai' ? c.phai[s] : D.mode === 'xuat' ? c.xuat[s] : c.con[s];
      return `<td class="c ${D.mode === 'con' && v < 0 ? 'v3-neg' : ''}">${v ? fmt(v) : (D.mode === 'con' && c.phai[s] ? '0' : '')}</td>`;
    };
    return `<section class="ui-panel v3-td-card">${head}
      <div class="v3-table-wrap"><table class="v3-table v3-td-table">
        <thead><tr><th>Chi tiết</th><th class="r">Miếng/đôi</th>${cols.map(s => `<th class="c v3-sz"><i>${esc(s)}</i></th>`).join('')}
          <th class="r">Phải chặt</th><th class="r">Đã xuất</th><th class="r">Còn lại</th></tr></thead>
        <tbody>
          <tr class="v3-muted-row"><th>Số đôi đặt</th><td></td>${cols.map(s => `<td class="c">${fmt(p.dat[s])}</td>`).join('')}<td class="r">${fmt0(p.tong_dat)}</td><td></td><td></td></tr>
          ${p.chi_tiet.map(c => `<tr><th>${esc(c.ten)}${c.sua ? ' <span class="ui-badge ui-badge-warn" title="Đã sửa tay, không theo đôi × hệ số">sửa</span>' : ''}</th>
            <td class="r">${fmt(c.he_so)} ${esc(c.dvt)}</td>${cols.map(s => cell(c, s)).join('')}
            <td class="r"><b>${fmt0(c.tong_phai)}</b></td><td class="r">${fmt(c.tong_xuat)}</td><td class="r ${c.tong_con ? '' : 'v3-ok'}"><b>${c.tong_con ? fmt0(c.tong_con) : '✓'}</b></td></tr>`).join('')}
        </tbody></table></div>
      ${editing ? `<div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="edit-cancel">Hủy</button>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="dm-reset" data-id="${p.id}">Về số tự tính (đôi × miếng/đôi)</button><div class="ui-flex-fill"></div>
        <button type="button" class="ui-btn ui-btn-primary" data-act="dm-save" data-id="${p.id}">Lưu số phải chặt</button></div>` : ''}
    </section>`;
  }

  async function dClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = parseInt(b.dataset.id, 10);
    try {
      if (act === 'open') dOpen(D.list[+b.dataset.i].id);
      if (act === 'back') { D.don = null; dRender(); }
      if (act === 'mode') { D.mode = b.dataset.mode; dRenderDon(); }
      if (act === 'edit') { D.edit = id; dRenderDon(); }
      if (act === 'edit-cancel') { D.edit = null; dRenderDon(); }
      if (act === 'bo-open') { D.bo = id; dRenderDon(); $('dhc-bo-text')?.focus(); }
      if (act === 'bo-close') { D.bo = null; dRenderDon(); }
      if (act === 'bo-save') {
        const chi_tiet = $('dhc-bo-text').value.split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
          const x = l.split(/\s*[|\t]\s*/);
          return { ten: x[0], he_so: toNum(x[1]) || 2, dvt: (x[2] || 'Miếng').trim() };
        }).filter(c => c.ten);
        if (!chi_tiet.length) { toast('Chưa nhập chi tiết nào', 'error'); return; }
        await api('/api/bochitiet', 'POST', { khach_hang_id: khId(), ten_bo: b.dataset.art, art: b.dataset.art, chi_tiet });
        toast('Đã lưu bộ chi tiết', 'success');
        if (window.Catalog) { await window.Catalog.load(); window.dispatchEvent(new Event('catalog-changed')); }
        D.bo = null; dOpen(D.don.id);
      }
      if (act === 'dm-save' || act === 'dm-reset') {
        // Chỉ lưu chi tiết có số khác số tự tính (đôi × miếng/đôi); chi tiết không đổi vẫn tự tính theo đơn
        const p = D.don.pos.find(z => z.id === id);
        const all = act === 'dm-reset' ? [] : Array.from(document.querySelectorAll('#dhc-root .dhc-dm'))
          .map(i => ({ chi_tiet: i.dataset.ct, size: i.dataset.size, so_luong: qty(i.value) }));
        const doi = new Set(all.filter(r => {
          const c = p.chi_tiet.find(x => x.ten === r.chi_tiet);
          return r.so_luong !== Math.round((p.dat[r.size] || 0) * (c ? c.he_so : 2));
        }).map(r => r.chi_tiet));
        const rows = all.filter(r => doi.has(r.chi_tiet));
        const r = await api(`/api/tochat/dinhmuc/${id}`, 'PUT', { rows });
        toast(r.message, 'success'); D.edit = null; dOpen(D.don.id);
      }
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ============================================================
     TAB 2: XUẤT NỘI BỘ
     ============================================================ */
  const X = { sub: 'lap', f: null, editingId: null, pos: [], list: [], dirty: false,
    filter: { tu: firstOfMonth(), den: today(), bp: '', tt: 'mo', q: '' } };
  const emptyX = () => ({ ngay: today(), so_phieu: '', art: '', ma_bo_phan_nhan: '', ghi_chu: '', vals: {}, doi: {},
    kieu: U.store.get('xnb_kieu', 'chi_tiet') === 'doi' ? 'doi' : 'chi_tiet' });
  const vk = (poId, ct, s) => `${poId}|${ct}|${s}`; // khóa ô số lượng (theo chi tiết)
  const dk = (poId, s) => `${poId}|${s}`;          // khóa ô số đôi (theo đôi)
  /** Số đôi còn giao được của 1 PO / size = nhỏ nhất (còn lại chi tiết ÷ miếng/đôi) */
  const conDoi = (p, s) => {
    const cs = p.chi_tiet.filter(c => c.phai[s]);
    return cs.length ? Math.max(0, Math.min(...cs.map(c => Math.floor((c.con[s] || 0) / (c.he_so || 2))))) : 0;
  };

  function xRender() {
    $('xnb-root').innerHTML = `
      <header class="ui-page-head"><h2>Xuất nội bộ tổ chặt</h2>
        <p>Giao bán thành phẩm cho tổ may theo PO · chi tiết · size. Ô trống hiện số <b>còn lại</b> làm gợi ý.</p></header>
      <nav class="ui-tabs v3-subs">
        <button type="button" class="ui-tab ${X.sub === 'lap' ? 'active' : ''}" data-sub="lap">📝 Lập phiếu</button>
        <button type="button" class="ui-tab ${X.sub === 'ds' ? 'active' : ''}" data-sub="ds">📋 Danh sách phiếu</button>
      </nav><div id="xnb-pane"></div>`;
    if (X.sub === 'lap') xRenderForm(); else xRenderList();
  }

  async function xSoPhieu() {
    if (X.editingId) return;
    const f = X.f;
    try { const r = await api(`/api/tochat/xuat/sophieu?ngay=${f.ngay}`); if (X.f === f && !X.editingId) { f.so_phieu = r.so_phieu; const el = $('xnb-so'); if (el) el.value = r.so_phieu; } } catch (_) {}
  }
  const artsOf = kh => [...new Set(C().po.filter(p => p.khach_hang_id === kh && String(p.po || '').trim()).map(p => String(p.art || '').trim()).filter(Boolean))];

  async function xLoadPos() {
    X.pos = [];
    if (!khId() || !X.f.art) { xRenderRows(); return; }
    try {
      const p = new URLSearchParams({ khach_hang_id: khId(), art: X.f.art });
      if (X.editingId) p.set('tru_id', X.editingId);
      X.pos = (await api('/api/tochat/xuat/goiy?' + p)).data;
      if (!X.pos.length) toast(`ART ${X.f.art} chưa có PO nào`, 'info');
      // Sửa phiếu "theo đôi": đổi số miếng đã lưu về số đôi (nhỏ nhất miếng ÷ miếng/đôi)
      if (X.f.raw) {
        if (X.f.kieu === 'doi') {
          X.pos.forEach(p => p.sizes.forEach(s => {
            const vs = p.chi_tiet.map(c => (X.f.vals[vk(p.id, c.ten, s)] || 0) / (c.he_so || 2));
            const d = vs.length ? Math.floor(Math.min(...vs)) : 0;
            if (d > 0) X.f.doi[dk(p.id, s)] = d;
          }));
        }
        delete X.f.raw;
      }
    } catch (err) { toast(err.message, 'error'); }
    xRenderRows();
  }

  function xRenderForm() {
    const pane = $('xnb-pane');
    if (!khId()) { pane.innerHTML = needKh('để lập phiếu xuất nội bộ'); return; }
    if (!X.f) { X.f = emptyX(); xSoPhieu(); }
    const f = X.f;
    pane.innerHTML = `
      ${X.editingId ? `<div class="ui-return-note v3-editing"><span>Đang sửa phiếu <b>${esc(f.so_phieu)}</b></span>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="x-new">Hủy sửa, lập phiếu mới</button></div>` : ''}
      <section class="ui-panel v3-form" id="xnb-form">
        <div class="ui-fields">
          <label class="ui-field"><span class="ui-label">Ngày <b class="ui-req">*</b></span><input type="date" class="ui-input" data-h="ngay" value="${esc(f.ngay)}"></label>
          <label class="ui-field"><span class="ui-label">Số phiếu</span><input type="text" class="ui-input" id="xnb-so" data-h="so_phieu" value="${esc(f.so_phieu)}" ${X.editingId ? 'disabled' : ''}></label>
          <label class="ui-field"><span class="ui-label">Giao cho tổ may <b class="ui-req">*</b></span><select class="ui-input" data-h="ma_bo_phan_nhan">
            <option value="">Chọn tổ</option>${toMay().map(b => `<option value="${esc(b.ma)}" ${f.ma_bo_phan_nhan === b.ma ? 'selected' : ''}>${esc(b.ten)} (${esc(b.ma)})</option>`).join('')}</select></label>
          <label class="ui-field"><span class="ui-label">ART <b class="ui-req">*</b></span><input type="text" class="ui-input ui-input-strong" id="xnb-art" list="xnb-dl-art" value="${esc(f.art)}" autocomplete="off" placeholder="gõ để tìm"></label>
          <label class="ui-field ui-span-2"><span class="ui-label">Ghi chú</span><input type="text" class="ui-input" data-h="ghi_chu" value="${esc(f.ghi_chu)}"></label>
        </div>
        <div class="v3-days v3-mb"><span class="ui-label">Xuất theo</span>
          <button type="button" class="ui-chip ${f.kieu === 'doi' ? 'active' : ''}" data-act="x-kieu" data-kieu="doi">Đôi</button>
          <button type="button" class="ui-chip ${f.kieu === 'chi_tiet' ? 'active' : ''}" data-act="x-kieu" data-kieu="chi_tiet">Chi tiết (miếng)</button>
          <span class="ui-hint">${f.kieu === 'doi' ? 'Nhập số đôi mỗi PO, phần mềm tự nhân ra số miếng từng chi tiết.' : 'Nhập số miếng từng chi tiết.'}</span></div>
        <datalist id="xnb-dl-art">${artsOf(khId()).map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>
        <div id="xnb-rows"></div>
      </section>
      <div class="ui-actionbar v3-actionbar">
        <div class="v3-grand">Tổng xuất: <b id="xnb-grand">0</b> ${f.kieu === 'doi' ? 'đôi' : 'miếng'}</div><div class="ui-flex-fill"></div>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="x-new">Phiếu mới</button>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="x-save" data-print="1">Lưu và in</button>
        <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="x-save">💾 Lưu phiếu</button>
      </div>`;
    if (f.art && !X.pos.length) xLoadPos(); else xRenderRows();
  }

  function xRenderRows() {
    const box = $('xnb-rows');
    if (!box) return;
    if (!X.f.art) { box.innerHTML = '<p class="v3-empty">Chọn ART để hiện các PO và chi tiết.</p>'; xTotals(); return; }
    if (!X.pos.length) { box.innerHTML = `<p class="v3-empty">ART <b>${esc(X.f.art)}</b> chưa có PO.</p>`; xTotals(); return; }
    if (X.f.kieu === 'doi') {
      const sizes = [...new Set(X.pos.flatMap(p => p.sizes))];
      box.innerHTML = `<div class="v3-table-wrap v3-mb"><table class="v3-table v3-td-table">
        <thead><tr><th>PO</th>${sizes.map(s => `<th class="c v3-sz"><i>${esc(s)}</i></th>`).join('')}<th class="r">Tổng đôi</th><th></th></tr></thead>
        <tbody>${X.pos.map(p => !p.chi_tiet.length
          ? `<tr><th>PO ${esc(p.po)}</th><td colspan="${sizes.length + 2}" class="v3-neg">ART chưa có bộ chi tiết (khai báo ở tab ✂️ Đơn hàng tổ chặt)</td></tr>`
          : `<tr><th>PO ${esc(p.po)} <small class="ui-muted">${p.chi_tiet.length} chi tiết</small></th>
            ${sizes.map(s => { const v = X.f.doi[dk(p.id, s)]; const con = conDoi(p, s);
              return `<td class="c"><input type="text" inputmode="numeric" class="v3-cell xnb-d" data-k="${esc(dk(p.id, s))}" value="${esc(v ? fmt(v) : '')}"
                placeholder="${con > 0 ? fmt(con) : ''}" ${p.dat[s] || v ? '' : 'disabled'}></td>`; }).join('')}
            <td class="r"><b data-rt="${esc(p.id + '|doi')}"></b></td>
            <td><button type="button" class="ui-btn-sm" data-act="x-fill" data-id="${p.id}">Điền hết còn lại</button></td></tr>`).join('')}</tbody></table></div>
        <p class="ui-hint">Chữ mờ = số đôi còn giao được (nhỏ nhất của các chi tiết). Khi lưu, mỗi chi tiết = số đôi × miếng/đôi.</p>`;
      xTotals();
      return;
    }
    box.innerHTML = X.pos.map(p => {
      if (!p.chi_tiet.length) return `<div class="v3-pad"><b>PO ${esc(p.po)}</b> – <span class="v3-neg">ART chưa có bộ chi tiết (khai báo ở tab ✂️ Đơn hàng tổ chặt)</span></div>`;
      return `<div class="v3-table-wrap v3-mb"><table class="v3-table v3-td-table">
        <thead><tr><th>PO ${esc(p.po)} <button type="button" class="ui-btn-sm" data-act="x-fill" data-id="${p.id}">Điền hết số còn lại</button></th>
          ${p.sizes.map(s => `<th class="c v3-sz"><i>${esc(s)}</i></th>`).join('')}<th class="r">Tổng</th></tr></thead>
        <tbody>${p.chi_tiet.map(c => `<tr><th>${esc(c.ten)} <small class="ui-muted">còn ${fmt0(c.tong_con)}</small></th>
          ${p.sizes.map(s => { const v = X.f.vals[vk(p.id, c.ten, s)]; const con = c.con[s] || 0;
            return `<td class="c"><input type="text" inputmode="numeric" class="v3-cell xnb-q" data-k="${esc(vk(p.id, c.ten, s))}" value="${esc(v ? fmt(v) : '')}"
              placeholder="${con > 0 ? fmt(con) : ''}" ${c.phai[s] || v ? '' : 'disabled'}></td>`; }).join('')}
          <td class="r"><b data-rt="${esc(p.id + '|' + c.ten)}"></b></td></tr>`).join('')}</tbody></table></div>`;
    }).join('') + '<p class="ui-hint">Chữ mờ trong ô = số còn lại chưa giao. Enter để sang ô kế tiếp.</p>';
    xTotals();
  }

  function xTotals() {
    let g = 0;
    if (X.f.kieu === 'doi') {
      X.pos.forEach(p => {
        const t = p.sizes.reduce((a, s) => a + qty(X.f.doi[dk(p.id, s)]), 0);
        g += t;
        const el = document.querySelector(`#xnb-rows [data-rt="${CSS.escape(p.id + '|doi')}"]`);
        if (el) el.textContent = t ? fmt0(t) : '';
      });
      const gr = $('xnb-grand'); if (gr) gr.textContent = fmt0(g);
      return;
    }
    X.pos.forEach(p => p.chi_tiet.forEach(c => {
      const t = p.sizes.reduce((a, s) => a + (qty(X.f.vals[vk(p.id, c.ten, s)])), 0);
      g += t;
      const el = document.querySelector(`#xnb-rows [data-rt="${CSS.escape(p.id + '|' + c.ten)}"]`);
      if (el) el.textContent = t ? fmt0(t) : '';
    }));
    const gr = $('xnb-grand'); if (gr) gr.textContent = fmt0(g);
  }

  async function xSave(andPrint) {
    const f = X.f;
    if (!f.ma_bo_phan_nhan) { toast('Chưa chọn tổ may nhận', 'error'); return; }
    const lines = [];
    const vuot = [];
    if (f.kieu === 'doi') {
      X.pos.forEach(p => p.sizes.forEach(s => {
        const d = qty(f.doi[dk(p.id, s)]);
        if (!d || !p.chi_tiet.length) return;
        p.chi_tiet.forEach(c => lines.push({ po_id: p.id, chi_tiet: c.ten, size: s, so_luong: Math.round(d * (c.he_so || 2)) }));
        if (d > conDoi(p, s)) vuot.push(`PO ${p.po} · size ${s}: xuất ${fmt0(d)} đôi, còn ${fmt0(conDoi(p, s))} đôi`);
      }));
    } else {
      X.pos.forEach(p => p.chi_tiet.forEach(c => p.sizes.forEach(s => {
        const v = qty(f.vals[vk(p.id, c.ten, s)]);
        if (!v) return;
        lines.push({ po_id: p.id, chi_tiet: c.ten, size: s, so_luong: v });
        if (v > Math.max(0, c.con[s] || 0)) vuot.push(`PO ${p.po} · ${c.ten} · size ${s}: xuất ${fmt0(v)}, còn ${fmt0(Math.max(0, c.con[s] || 0))}`);
      })));
    }
    if (!lines.length) { toast('Chưa nhập số lượng nào', 'error'); return; }
    if (vuot.length && !confirm(`Xuất vượt số còn lại:\n${vuot.slice(0, 8).join('\n')}${vuot.length > 8 ? `\n… và ${vuot.length - 8} ô khác` : ''}\n\nVẫn lưu?`)) return;
    const body = { ngay: f.ngay, so_phieu: f.so_phieu, khach_hang_id: khId(), art: f.art, ma_bo_phan_nhan: f.ma_bo_phan_nhan, ghi_chu: f.ghi_chu, kieu: f.kieu, lines };
    try {
      const r = X.editingId ? await api(`/api/tochat/xuat/${X.editingId}`, 'PUT', body) : await api('/api/tochat/xuat', 'POST', body);
      toast(r.message, 'success');
      if (andPrint) await xPrint(r.id);
      X.editingId = null; X.dirty = false; X.f = emptyX(); X.f.ma_bo_phan_nhan = f.ma_bo_phan_nhan; X.f.kieu = f.kieu; X.pos = [];
      xRenderForm(); xSoPhieu();
    } catch (err) { toast('Không lưu được: ' + err.message, 'error'); }
  }

  async function xEdit(id) {
    try {
      const { data } = await api(`/api/tochat/xuat/${id}`);
      if (data.trang_thai === 'huy') { toast('Phiếu đã hủy, khôi phục trước khi sửa', 'info'); return; }
      if (window.KH && !window.KH.set(data.khach_hang_id)) return;
      X.editingId = data.id; X.dirty = false;
      X.f = { ngay: data.ngay, so_phieu: data.so_phieu, art: data.art, ma_bo_phan_nhan: data.ma_bo_phan_nhan, ghi_chu: data.ghi_chu || '', vals: {}, doi: {},
        kieu: data.kieu === 'doi' ? 'doi' : 'chi_tiet', raw: true };
      data.lines.forEach(l => { const k = vk(l.po_id, l.chi_tiet, normSize(l.size)); X.f.vals[k] = (X.f.vals[k] || 0) + l.so_luong; });
      X.sub = 'lap'; X.pos = [];
      xRender();
      await xLoadPos();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function xRenderList() {
    const pane = $('xnb-pane');
    const f = X.filter;
    pane.innerHTML = `
      <div class="ui-panel v3-filter">
        <label class="ui-field"><span class="ui-label">Từ ngày</span><input type="date" class="ui-input" id="xnb-f-tu" value="${esc(f.tu)}"></label>
        <label class="ui-field"><span class="ui-label">Đến ngày</span><input type="date" class="ui-input" id="xnb-f-den" value="${esc(f.den)}"></label>
        <label class="ui-field"><span class="ui-label">Tổ may nhận</span><select class="ui-input" id="xnb-f-bp"><option value="">Tất cả</option>${toMay().map(b =>
          `<option value="${esc(b.ma)}" ${f.bp === b.ma ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')}</select></label>
        <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="xnb-f-tt">
          <option value="mo" ${f.tt === 'mo' ? 'selected' : ''}>Đang dùng</option><option value="huy" ${f.tt === 'huy' ? 'selected' : ''}>Đã hủy</option><option value="" ${f.tt === '' ? 'selected' : ''}>Tất cả</option></select></label>
        <label class="ui-field v3-grow"><span class="ui-label">Tìm</span><input type="search" class="ui-input" id="xnb-f-q" value="${esc(f.q)}" placeholder="Số phiếu, ART, PO"></label>
        <div class="v3-filter-btns"><button type="button" class="ui-btn ui-btn-primary" data-act="x-filter">Lọc</button></div>
      </div>
      <div class="ui-panel ui-panel-flush"><div class="v3-table-wrap" id="xnb-list"><div class="v3-empty">Đang tải...</div></div></div>`;
    const p = new URLSearchParams();
    if (f.tu) p.set('tu_ngay', f.tu);
    if (f.den) p.set('den_ngay', f.den);
    if (f.bp) p.set('bo_phan', f.bp);
    if (f.tt) p.set('trang_thai', f.tt);
    if (f.q) p.set('q', f.q);
    if (khId()) p.set('khach_hang_id', khId());
    try {
      const { data } = await api('/api/tochat/xuat?' + p);
      X.list = data;
      const box = $('xnb-list');
      if (!box || X.sub !== 'ds') return;
      if (!data.length) { box.innerHTML = `<div class="v3-empty">Chưa có phiếu xuất nội bộ trong khoảng này.${window.KH ? window.KH.emptyNote() : ''}</div>`; return; }
      const allKh = !khId();
      box.innerHTML = `<table class="v3-table">
        <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Tổ nhận</th>${allKh ? '<th>Khách hàng</th>' : ''}<th>ART</th><th>PO · chi tiết</th><th class="r">Tổng</th><th>Người lập</th><th></th></tr></thead>
        <tbody>${data.map(r => `<tr class="${r.trang_thai === 'huy' ? 'v3-row-off' : ''}">
          <td class="nowrap">${viDate(r.ngay)}</td><td class="nowrap"><b>${esc(r.so_phieu)}</b>${r.trang_thai === 'huy' ? ' <span class="ui-badge ui-badge-off">Đã hủy</span>' : ''}</td>
          <td>${esc(bpTen(r.ma_bo_phan_nhan))}</td>${allKh ? `<td>${esc((C().byId(r.khach_hang_id) || {}).ten_ngan || '')}</td>` : ''}<td><b>${esc(r.art)}</b></td>
          <td>${r.kieu === 'doi' ? '<span class="v3-chip">theo đôi</span><br>' : ''}<small>${(r.dong || []).slice(0, 4).map(d => `${esc(d.po)} · ${esc(d.chi_tiet)} (${fmt0(d.sl)})`).join('<br>')}${(r.dong || []).length > 4 ? `<br>+ ${r.dong.length - 4} dòng` : ''}</small></td>
          <td class="r"><b>${fmt0(r.tong_sl)}</b></td><td>${esc(r.nguoi)}</td>
          <td class="nowrap">${r.trang_thai === 'huy' ? `<button type="button" class="ui-btn-sm" data-act="x-mo" data-id="${r.id}">Khôi phục</button>`
            : `<button type="button" class="ui-btn-sm" data-act="x-edit" data-id="${r.id}">Xem / Sửa</button>
               <button type="button" class="ui-btn-sm" data-act="x-print" data-id="${r.id}">In</button>
               <button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="x-huy" data-id="${r.id}" data-so="${esc(r.so_phieu)}">Hủy</button>`}</td></tr>`).join('')}</tbody></table>`;
    } catch (err) { const box = $('xnb-list'); if (box) box.innerHTML = `<div class="v3-empty">Lỗi tải: ${esc(err.message)}</div>`; }
  }

  /** In phiếu xuất nội bộ (A5 ngang, dãy size nghiêng phía trên như phiếu xuất kho) */
  async function xPrint(id) {
    let x;
    try { x = (await api(`/api/tochat/xuat/${id}`)).data; } catch (err) { toast(err.message, 'error'); return; }
    const kh = C().byId(x.khach_hang_id);
    const order = [];
    (kh?.day_size || []).forEach(d => (d.sizes || []).forEach(s => { const k = normSize(s); if (!order.includes(k)) order.push(k); }));
    const used = [...new Set(x.lines.map(l => normSize(l.size)))];
    const cols = [...order.filter(s => used.includes(s)), ...used.filter(s => !order.includes(s))];
    const rows = [];
    x.lines.forEach(l => {
      const k = `${l.po}|${l.chi_tiet}`;
      let r = rows.find(z => z.k === k);
      if (!r) { r = { k, po: l.po, ct: l.chi_tiet, sz: {} }; rows.push(r); }
      r.sz[normSize(l.size)] = (r.sz[normSize(l.size)] || 0) + l.so_luong;
    });
    // Phiếu theo đôi: in mỗi PO 1 dòng số đôi (nhỏ nhất miếng ÷ miếng/đôi của bộ chi tiết)
    const bo = (C().bo || []).find(b => b.khach_hang_id === x.khach_hang_id && normKey(b.art) === normKey(x.art));
    let theoDoi = x.kieu === 'doi' && bo && (bo.chi_tiet || []).length;
    if (theoDoi) {
      const heSo = Object.fromEntries(bo.chi_tiet.map(c => [normKey(c.ten), c.he_so || 2]));
      const byPo = [];
      rows.forEach(r => {
        let g = byPo.find(z => z.po === r.po);
        if (!g) { g = { k: r.po, po: r.po, ct: 'Đôi (đủ bộ)', parts: [] }; byPo.push(g); }
        g.parts.push({ he: heSo[normKey(r.ct)] || 2, sz: r.sz });
      });
      byPo.forEach(g => { g.sz = {}; cols.forEach(s => { const v = Math.floor(Math.min(...g.parts.map(pt => (pt.sz[s] || 0) / pt.he))); if (v > 0) g.sz[s] = v; }); });
      rows.length = 0; rows.push(...byPo);
    }
    const n = v => (v ? new Intl.NumberFormat('vi-VN').format(v) : '');
    const tot = r => Object.values(r.sz).reduce((a, v) => a + v, 0);
    const d = x.ngay || '';
    printHtml(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(x.so_phieu)}</title><style>
      @page { size: A5 landscape; margin: 7mm 10mm; } * { box-sizing: border-box; }
      body { font-family: "Times New Roman", serif; color: #000; margin: 0; font-size: 12px; }
      .co { text-align: center; font-weight: bold; font-size: 13px; } h1 { text-align: center; font-size: 20pt; margin: 4px 0 2px; letter-spacing: .05em; }
      .sub { display: flex; justify-content: space-between; border-bottom: 3px double #000; padding-bottom: 3px; font-size: 12.5px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin: 6px 0 8px; font-size: 12.5px; }
      table { border-collapse: collapse; margin: 0 auto; } td, th { border: 1px solid #000; padding: 2px 6px; text-align: center; white-space: nowrap; }
      .nb { border-top: hidden; border-left: hidden; border-right: hidden; border-bottom: none; } .sz { font-style: italic; font-weight: bold; font-size: 13px; border: 1.6px solid #000; }
      .tot td { border-top: 3px double #000; font-weight: bold; } .l { text-align: left; }
      .sign { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; margin-top: 10px; font-size: 12.5px; }
      .sign i { display: block; font-size: 10.5px; margin-bottom: 44px; } .sign .nm { font-weight: bold; font-size: 14px; }
    </style></head><body>
      <div class="co">CÔNG TY TNHH GIA CÔNG THƯƠNG MẠI D&amp;D LONG AN</div>
      <h1>PHIẾU XUẤT NỘI BỘ</h1>
      <div class="sub"><i>Ngày ${d.slice(8, 10)} tháng ${d.slice(5, 7)} năm ${d.slice(0, 4)}</i><b>Số: ${esc(x.so_phieu)}</b></div>
      <div class="meta"><div><b>Từ:</b> Tổ chặt</div><div><b>Giao cho:</b> ${esc(x.ten_bo_phan_nhan)}</div>
        <div><b>Khách hàng:</b> ${esc(kh?.ten_ngan || '')}</div><div><b>ART:</b> ${esc(x.art)}</div>${x.ghi_chu ? `<div><b>Ghi chú:</b> ${esc(x.ghi_chu)}</div>` : ''}</div>
      <table>
        <tr><td class="nb" colspan="3"></td>${cols.map(s => `<th class="sz">${esc(s)}</th>`).join('')}<td class="nb"></td></tr>
        <tr><th>STT</th><th>PO</th><th>Chi tiết</th>${cols.map(() => '<th></th>').join('')}<th>Tổng</th></tr>
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(r.po)}</td><td class="l">${esc(r.ct)}</td>${cols.map(s => `<td>${n(r.sz[s])}</td>`).join('')}<td><b>${n(tot(r))}</b></td></tr>`).join('')}
        <tr class="tot"><td colspan="3">CỘNG${theoDoi ? ' (ĐÔI)' : ' (MIẾNG)'}</td>${cols.map(s => `<td>${n(rows.reduce((a, r) => a + (r.sz[s] || 0), 0))}</td>`).join('')}<td>${n(rows.reduce((a, r) => a + tot(r), 0))}</td></tr>
      </table>
      <div class="sign"><div><b>Người lập phiếu</b><i>(Ký, họ tên)</i><div class="nm">${esc(x.nguoi)}</div></div>
        <div><b>Người giao (tổ chặt)</b><i>(Ký, họ tên)</i></div><div><b>Người nhận (${esc(x.ten_bo_phan_nhan)})</b><i>(Ký, họ tên)</i></div></div>
    </body></html>`);
  }

  async function xClick(e) {
    const sub = e.target.closest('.v3-subs .ui-tab');
    if (sub) { X.sub = sub.dataset.sub; xRender(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = parseInt(b.dataset.id, 10);
    try {
      if (act === 'x-save') xSave(!!b.dataset.print);
      if (act === 'x-new') {
        if (X.dirty && !confirm('Bỏ phiếu đang nhập dở?')) return;
        X.editingId = null; X.dirty = false; X.f = emptyX(); X.pos = []; xRenderForm(); xSoPhieu();
      }
      if (act === 'x-fill') {
        const p = X.pos.find(z => z.id === id);
        if (X.f.kieu === 'doi') p.sizes.forEach(s => { const d = conDoi(p, s); if (d > 0) X.f.doi[dk(p.id, s)] = d; });
        else p.chi_tiet.forEach(c => p.sizes.forEach(s => { if ((c.con[s] || 0) > 0) X.f.vals[vk(p.id, c.ten, s)] = c.con[s]; }));
        X.dirty = true; xRenderRows();
      }
      if (act === 'x-kieu') {
        const k = b.dataset.kieu;
        if (k === X.f.kieu) return;
        const co = Object.values(X.f.vals).some(qty) || Object.values(X.f.doi).some(qty);
        if (co && !confirm('Đổi kiểu xuất sẽ xóa các số đang nhập. Tiếp tục?')) return;
        X.f.kieu = k; X.f.vals = {}; X.f.doi = {}; U.store.set('xnb_kieu', k);
        xRenderForm();
      }
      if (act === 'x-filter') xReadFilter();
      if (act === 'x-edit') xEdit(id);
      if (act === 'x-print') xPrint(id);
      if (act === 'x-huy') {
        if (!confirm(`Hủy phiếu ${b.dataset.so}? Số đã xuất sẽ được trả lại.`)) return;
        toast((await api(`/api/tochat/xuat/${id}/huy`, 'PUT')).message, 'info'); xRenderList();
      }
      if (act === 'x-mo') { toast((await api(`/api/tochat/xuat/${id}/mo`, 'PUT')).message, 'success'); xRenderList(); }
    } catch (err) { toast(err.message, 'error'); }
  }
  function xReadFilter() {
    const g = id => $(id)?.value || '';
    X.filter = { tu: g('xnb-f-tu'), den: g('xnb-f-den'), bp: g('xnb-f-bp'), tt: g('xnb-f-tt'), q: g('xnb-f-q').trim() };
    xRenderList();
  }
  function xInput(e) {
    const t = e.target;
    if (X.sub !== 'lap' || !X.f) return;
    if (t.dataset.h) { X.f[t.dataset.h] = t.value; X.dirty = true; return; }
    if (t.id === 'xnb-art') { X.f.art = t.value; return; }
    if (t.classList.contains('xnb-q')) { X.f.vals[t.dataset.k] = t.value; X.dirty = true; xTotals(); }
    if (t.classList.contains('xnb-d')) { X.f.doi[t.dataset.k] = t.value; X.dirty = true; xTotals(); }
  }
  function xChange(e) {
    const t = e.target;
    if (X.sub === 'ds') { if (t.tagName === 'SELECT') xReadFilter(); return; }
    if (t.dataset.h === 'ngay') xSoPhieu();
    if (t.id === 'xnb-art') {
      const v = String(t.value).trim();
      const hit = artsOf(khId()).find(a => normKey(a) === normKey(v));
      const art = hit || v;
      if (art === X.f.art && X.pos.length) return;
      X.f.art = art; t.value = art; X.f.vals = {}; xLoadPos();
    }
    if (t.classList.contains('xnb-q') || t.classList.contains('xnb-d')) { const n = qty(t.value); t.value = n ? fmt(n) : ''; }
  }
  function xKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.id === 'xnb-f-q' && e.key === 'Enter') { xReadFilter(); return; }
    if (e.target.id === 'xnb-art' && e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); return; }
    enterToNext(e, '#xnb-rows');
  }

  /* ---------------- KHỞI ĐỘNG ---------------- */
  async function ready() {
    await window.AuthReady;
    if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
  }
  async function showD() {
    await ready();
    const root = $('dhc-root');
    if (!root.dataset.ready) { root.dataset.ready = '1'; root.addEventListener('click', dClick); }
    dRender();
  }
  async function showX() {
    await ready();
    const root = $('xnb-root');
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      root.addEventListener('click', xClick);
      root.addEventListener('input', xInput);
      root.addEventListener('change', xChange);
      root.addEventListener('keydown', xKey);
    }
    xRender();
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-donhangchat"]')?.addEventListener('click', showD);
    document.querySelector('.tab-btn[data-target="tab-xuatchat"]')?.addEventListener('click', showX);
    if (window.KH) window.KH.guard(id => (X.dirty && X.f && id !== khId() ? `Phiếu xuất nội bộ đang nhập (ART ${X.f.art || '…'}) chưa lưu sẽ bị bỏ.` : ''));
    window.addEventListener('kh-changed', () => {
      D.don = null; D.edit = null;
      X.editingId = null; X.dirty = false; X.f = null; X.pos = [];
      if (isActive('tab-donhangchat')) dRender();
      if (isActive('tab-xuatchat')) xRender();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
