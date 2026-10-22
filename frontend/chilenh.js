/**
 * TAB CHỈ LỆNH THẢ CHUYỀN
 * 1 chỉ lệnh = 1 khách hàng + 1 ART + 1 chuyền / tổ, nhiều PO, số lượng theo size.
 * Số gợi ý mỗi size = Đặt − Đã thả ở các chỉ lệnh khác. In theo mẫu "CHỈ LỆNH CHUYỀN MAY".
 * Khách hàng lấy theo thanh bên (window.KH); danh sách cũng lọc theo thanh bên.
 */
(function () {
  const { esc, toNum, fmt, fmt0, api, store, toast, normSize, normKey, khSizes, bpName, printHtml, enterToNext, today, firstOfMonth, viDate, $ } = window.U;
  const C = () => window.Catalog || { khach: [], khachAll: [], po: [], bophan: [], byId: () => null };

  const S = {
    sub: 'lap', form: null, editingId: null, list: [], dirty: false,
    filter: { tu: firstOfMonth(), den: today(), bp: '', tt: 'mo', q: '' },
  };
  const khId = () => (window.KH ? window.KH.one() : null);

  function emptyForm() {
    const kh = khId() || '';
    const bps = kh ? bpOfKh(kh) : [];
    const saved = store.get('cl_bp', '');
    const bp = bps.some(b => b.ma === saved) ? saved : (bps.length === 1 ? bps[0].ma : '');
    return { ngay: today(), so_cl: '', khach_hang_id: kh, art: '', ma_bo_phan: bp, ghi_chu: '', rows: [] };
  }
  const bpOfKh = khId => {
    const k = C().byId(khId);
    const all = C().bophan || [];
    const list = k && (k.bo_phan || []).length ? all.filter(b => k.bo_phan.includes(b.ma)) : all;
    return list.length ? list : all;
  };
  const artsOf = khId => [...new Set(C().po.filter(p => p.khach_hang_id === parseInt(khId, 10) && String(p.po || '').trim())
    .map(p => String(p.art || '').trim()).filter(Boolean))];
  function sizeCols(f) {
    const cols = khSizes(C().byId(f.khach_hang_id));
    f.rows.forEach(r => Object.keys(r.info).concat(Object.keys(r.sizes)).forEach(s => { if (!cols.includes(s)) cols.push(s); }));
    return cols;
  }
  const rowTotal = r => Object.values(r.sizes).reduce((a, v) => a + toNum(v), 0);
  const grand = f => f.rows.filter(r => r.chon).reduce((a, r) => a + rowTotal(r), 0);
  const isChat = ma => /^TC$/i.test(ma || '') || /ch[ặa]t/i.test(bpName(ma));

  /* ---------------- KHUNG ---------------- */
  function renderShell() {
    $('cl-root').innerHTML = `
      <header class="ui-page-head"><h2>Chỉ lệnh thả chuyền</h2>
        <p>Chọn ART và chuyền của khách đang chọn ở thanh bên. Số lượng mỗi size điền sẵn bằng số <b>còn chưa thả</b> của từng PO, sửa được để thả từng đợt.</p></header>
      <nav class="ui-tabs v3-subs">
        <button type="button" class="ui-tab" data-sub="lap">📝 Lập chỉ lệnh</button>
        <button type="button" class="ui-tab" data-sub="ds">📋 Danh sách chỉ lệnh</button>
      </nav>
      <div id="cl-pane"></div>`;
  }
  function render() {
    document.querySelectorAll('#cl-root .v3-subs .ui-tab').forEach(b => b.classList.toggle('active', b.dataset.sub === S.sub));
    if (S.sub === 'lap') renderForm(); else renderList();
  }

  /* ---------------- LẬP CHỈ LỆNH ---------------- */
  async function refreshSoCl() {
    const f = S.form;
    if (S.editingId || !f.ma_bo_phan) return;
    try {
      const r = await api(`/api/chilenh/sophieu?bo_phan=${encodeURIComponent(f.ma_bo_phan)}&ngay=${encodeURIComponent(f.ngay)}`);
      if (S.form !== f || S.editingId) return; // form đã đổi trong lúc chờ (đổi khách / mở chỉ lệnh khác)
      f.so_cl = r.so_cl;
      const el = $('cl-so'); if (el) el.value = r.so_cl;
    } catch (_) { /* giữ số cũ */ }
  }

  /** Tải các PO của ART kèm số còn chưa thả; keep = {po_id: sizes} giữ số đang có (khi sửa) */
  async function loadOrders(opts = {}) {
    const f = S.form;
    f.rows = [];
    if (!f.khach_hang_id || !f.art) { renderRows(); return; }
    const p = new URLSearchParams({ khach_hang_id: f.khach_hang_id, art: f.art });
    if (S.editingId) p.set('tru_id', S.editingId);
    try {
      const { data } = await api('/api/chilenh/goiy?' + p);
      f.rows = data.map(o => {
        const info = Object.fromEntries(o.sizes.map(s => [s.size, s]));
        const kept = opts.keep && opts.keep[o.id];
        const chon = kept ? true : opts.only ? opts.only.includes(o.id) : o.con_chua_tha > 0;
        const sizes = {};
        if (kept) Object.assign(sizes, kept);
        else if (chon) o.sizes.forEach(s => { if (s.chua_tha > 0) sizes[s.size] = s.chua_tha; });
        return { po_id: o.id, po: o.po, don_hang: o.don_hang, mau: o.mau, ngay_giao: o.ngay_giao, chon, sizes, info, con_chua_tha: o.con_chua_tha };
      });
      if (!data.length) toast(`Không có đơn hàng nào của ART ${f.art}`, 'info');
    } catch (err) { toast('Lỗi tải đơn hàng: ' + err.message, 'error'); }
    renderRows();
  }

  function renderForm() {
    const f = S.form;
    const pane = $('cl-pane');
    if (!f.khach_hang_id) {
      pane.innerHTML = '<section class="ui-panel"><p class="v3-need-kh">Chọn <b>1 khách hàng</b> ở thanh bên trái để lập chỉ lệnh.</p></section>';
      return;
    }
    const bps = bpOfKh(f.khach_hang_id);
    pane.innerHTML = `
      ${S.editingId ? `<div class="ui-return-note v3-editing"><span>Đang sửa chỉ lệnh <b>${esc(f.so_cl)}</b>. Bấm <b>Lưu chỉ lệnh</b> để cập nhật.</span>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="cancel-edit">Hủy sửa, lập chỉ lệnh mới</button></div>` : ''}
      <section class="ui-panel v3-form" id="cl-form">
        <div class="ui-fields">
          <label class="ui-field"><span class="ui-label">Ngày <b class="ui-req">*</b></span><input type="date" class="ui-input" id="cl-ngay" value="${esc(f.ngay)}"></label>
          <div class="ui-field"><span class="ui-label">Khách hàng</span><div class="v3-fixed">${esc((C().byId(f.khach_hang_id) || {}).ten_ngan || '')}</div></div>
          <label class="ui-field"><span class="ui-label">ART <b class="ui-req">*</b><span class="ui-label-note">gõ để tìm</span></span>
            <input type="text" class="ui-input ui-input-strong" id="cl-art" list="cl-dl-art" autocomplete="off" value="${esc(f.art)}" placeholder="vd: DA-260-A"></label>
          <label class="ui-field"><span class="ui-label">Chuyền / bộ phận <b class="ui-req">*</b></span><select class="ui-input" id="cl-bp">
            <option value="">Chọn</option>${bps.map(b => `<option value="${esc(b.ma)}" ${f.ma_bo_phan === b.ma ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')}</select></label>
          <label class="ui-field"><span class="ui-label">Số chỉ lệnh</span><input type="text" class="ui-input" id="cl-so" data-h="so_cl" value="${esc(f.so_cl)}" placeholder="Tự tạo khi chọn chuyền"></label>
          <label class="ui-field ui-span-3"><span class="ui-label">Ghi chú</span><input type="text" class="ui-input" data-h="ghi_chu" value="${esc(f.ghi_chu)}" placeholder="Yêu cầu kỹ thuật, ngày hoàn thành..."></label>
        </div>
        <datalist id="cl-dl-art">${artsOf(f.khach_hang_id).map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>
        <div id="cl-rows"></div>
      </section>
      <div class="ui-actionbar v3-actionbar">
        <div class="v3-grand">Tổng thả: <b id="cl-grand">${fmt0(grand(f))}</b> đôi</div>
        <div class="ui-flex-fill"></div>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="new">Chỉ lệnh mới</button>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="save-print">Lưu và in</button>
        <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="save">💾 Lưu chỉ lệnh</button>
      </div>`;
    renderRows();
  }

  function renderRows() {
    const box = $('cl-rows');
    if (!box) return;
    const f = S.form;
    if (!f.khach_hang_id || !f.art) { box.innerHTML = '<p class="v3-empty">Chọn ART để hiện danh sách PO.</p>'; updateTotals(); return; }
    if (!f.rows.length) { box.innerHTML = `<p class="v3-empty">ART <b>${esc(f.art)}</b> chưa có đơn hàng. Thêm ở tab 📦 Đơn Hàng.</p>`; updateTotals(); return; }
    const cols = sizeCols(f);
    box.innerHTML = `<div class="v3-table-wrap"><table class="v3-table v3-cl-table">
      <thead><tr><th class="c">Thả</th><th>PO</th>${cols.map(s => `<th class="c v3-sz">${esc(s)}</th>`).join('')}<th class="r">Tổng</th></tr></thead>
      <tbody>${f.rows.map((r, i) => `
        <tr class="v3-cl-info ${r.chon ? '' : 'v3-row-off'}"><td></td>
          <td class="ui-muted"><small>${esc([r.don_hang, r.mau, r.ngay_giao ? 'giao ' + viDate(r.ngay_giao) : ''].filter(Boolean).join(' · ')) || '&nbsp;'}<br>Còn chưa thả</small></td>
          ${cols.map(s => { const x = r.info[s]; return `<td class="c"><small class="${x && x.chua_tha < 0 ? 'v3-neg' : ''}">${x && x.dat ? fmt0(x.chua_tha) : ''}</small></td>`; }).join('')}
          <td class="r"><small>${fmt0(r.con_chua_tha)}</small></td></tr>
        <tr class="v3-cl-row ${r.chon ? '' : 'v3-row-off'}" data-i="${i}">
          <td class="c"><input type="checkbox" class="cl-chon" ${r.chon ? 'checked' : ''} aria-label="Thả PO ${esc(r.po)}"></td>
          <td class="nowrap"><b>${esc(r.po)}</b></td>
          ${cols.map(s => `<td class="c"><input type="text" inputmode="numeric" class="v3-cell cl-sz" data-size="${esc(s)}" value="${esc(fmt(toNum(r.sizes[s])))}" ${r.chon ? '' : 'disabled'}></td>`).join('')}
          <td class="r"><b data-tot="${i}">${fmt0(r.chon ? rowTotal(r) : 0)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td><b>CỘNG</b></td>${cols.map(s => `<td class="c"><b data-col="${esc(s)}"></b></td>`).join('')}<td class="r"><b id="cl-foot"></b></td></tr></tfoot>
    </table></div>
    <p class="ui-hint">Bỏ tick để không thả PO đó. Enter để sang ô kế tiếp. Số âm ở dòng "Còn chưa thả" là đã thả vượt số đặt.</p>`;
    updateTotals();
  }

  function updateTotals() {
    const f = S.form;
    f.rows.forEach((r, i) => { const el = document.querySelector(`#cl-rows [data-tot="${i}"]`); if (el) el.textContent = fmt0(r.chon ? rowTotal(r) : 0); });
    document.querySelectorAll('#cl-rows [data-col]').forEach(el => {
      const s = el.dataset.col;
      el.textContent = fmt(f.rows.filter(r => r.chon).reduce((a, r) => a + toNum(r.sizes[s]), 0));
    });
    const g = grand(f);
    const foot = $('cl-foot'); if (foot) foot.textContent = fmt0(g);
    const gr = $('cl-grand'); if (gr) gr.textContent = fmt0(g);
  }

  function save(andPrint) { return U.once('cl-save', () => saveCore(andPrint)); }
  async function saveCore(andPrint) {
    const f = S.form;
    const errs = [];
    if (!f.ngay) errs.push('Chưa chọn ngày');
    if (!f.khach_hang_id) errs.push('Chưa chọn khách hàng');
    if (!String(f.art).trim()) errs.push('Chưa chọn ART');
    if (!f.ma_bo_phan) { errs.push('Chưa chọn chuyền / bộ phận'); $('cl-bp')?.classList.add('v3-err'); }
    const rows = f.rows.filter(r => r.chon && rowTotal(r) > 0);
    if (!rows.length) errs.push('Chưa nhập số lượng thả cho PO nào');
    if (errs.length) { toast(errs[0], 'error'); return; }
    // Thả vượt số còn chưa thả -> hỏi lại
    const vuot = [];
    rows.forEach(r => Object.entries(r.sizes).forEach(([s, v]) => {
      const con = Math.max(0, r.info[s]?.chua_tha || 0);
      if (toNum(v) > con) vuot.push(`PO ${r.po} size ${s}: thả ${fmt0(toNum(v))}, còn ${fmt0(con)}`);
    }));
    if (vuot.length && !confirm(`Thả vượt số còn chưa thả:\n${vuot.slice(0, 8).join('\n')}${vuot.length > 8 ? `\n… và ${vuot.length - 8} size khác` : ''}\n\nVẫn lưu?`)) return;
    const body = {
      ngay: f.ngay, so_cl: f.so_cl, khach_hang_id: f.khach_hang_id, art: f.art, ma_bo_phan: f.ma_bo_phan, ghi_chu: f.ghi_chu,
      lines: rows.map(r => ({ po_id: r.po_id, sizes: Object.entries(r.sizes).filter(([, v]) => toNum(v) > 0).map(([size, v]) => ({ size, so_luong: toNum(v) })) })),
    };
    try {
      const r = S.editingId ? await api(`/api/chilenh/${S.editingId}`, 'PUT', body) : await api('/api/chilenh', 'POST', body);
      const id = S.editingId || r.id;
      toast(r.message || 'Đã lưu chỉ lệnh', 'success');
      store.set('cl_bp', f.ma_bo_phan);
      if (andPrint) await printCl(id);
      newForm();
      if (window.DonHang) window.DonHang.reload();
    } catch (err) { toast('Không lưu được: ' + err.message, 'error'); }
  }

  function newForm() {
    S.editingId = null;
    S.dirty = false;
    S.form = emptyForm();
    S.sub = 'lap';
    render();
    refreshSoCl();
  }

  async function editCl(id) {
    try {
      const { data } = await api(`/api/chilenh/${id}`);
      if (data.trang_thai === 'huy') { toast('Chỉ lệnh đã hủy. Khôi phục trước khi sửa.', 'info'); return; }
      // Đang xem Tất cả -> thanh bên chuyển sang khách của chỉ lệnh này
      if (window.KH && !window.KH.set(data.khach_hang_id)) return;
      S.editingId = data.id;
      S.dirty = false;
      S.form = { ngay: data.ngay, so_cl: data.so_cl, khach_hang_id: data.khach_hang_id, art: data.art, ma_bo_phan: data.ma_bo_phan, ghi_chu: data.ghi_chu || '', rows: [] };
      const keep = {};
      data.lines.forEach(l => { keep[l.po_id] = Object.fromEntries(l.sizes.map(s => [normSize(s.size), s.so_luong])); });
      S.sub = 'lap';
      render();
      await loadOrders({ keep, only: [] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast('Không mở được chỉ lệnh: ' + err.message, 'error'); }
  }

  /* ---------------- DANH SÁCH ---------------- */
  async function renderList() {
    const f = S.filter;
    $('cl-pane').innerHTML = `
      <div class="ui-panel v3-filter">
        <label class="ui-field"><span class="ui-label">Từ ngày</span><input type="date" class="ui-input" id="cl-f-tu" value="${esc(f.tu)}"></label>
        <label class="ui-field"><span class="ui-label">Đến ngày</span><input type="date" class="ui-input" id="cl-f-den" value="${esc(f.den)}"></label>
        <label class="ui-field"><span class="ui-label">Chuyền</span><select class="ui-input" id="cl-f-bp"><option value="">Tất cả</option>${(C().bophan || []).map(b =>
          `<option value="${esc(b.ma)}" ${f.bp === b.ma ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')}</select></label>
        <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="cl-f-tt">
          <option value="mo" ${f.tt === 'mo' ? 'selected' : ''}>Đang dùng</option><option value="huy" ${f.tt === 'huy' ? 'selected' : ''}>Đã hủy</option>
          <option value="" ${f.tt === '' ? 'selected' : ''}>Tất cả</option></select></label>
        <label class="ui-field v3-grow"><span class="ui-label">Tìm</span><input type="search" class="ui-input" id="cl-f-q" value="${esc(f.q)}" placeholder="Số chỉ lệnh, ART, PO"></label>
        <div class="v3-filter-btns"><button type="button" class="ui-btn ui-btn-primary" data-act="filter">Lọc</button></div>
      </div>
      <div class="ui-panel ui-panel-flush"><div class="v3-table-wrap" id="cl-list"><div class="v3-empty">Đang tải...</div></div></div>`;
    const p = new URLSearchParams();
    if (f.tu) p.set('tu_ngay', f.tu);
    if (f.den) p.set('den_ngay', f.den);
    if (f.bp) p.set('bo_phan', f.bp);
    if (khId()) p.set('khach_hang_id', khId());
    if (f.tt) p.set('trang_thai', f.tt);
    if (f.q) p.set('q', f.q);
    const box = $('cl-list');
    const n = U.seq('cl-list');
    try {
      const { data } = await api('/api/chilenh?' + p);
      if (S.sub !== 'ds' || !U.latest('cl-list', n)) return;
      S.list = data;
      if (!data.length) { box.innerHTML = `<div class="v3-empty">Không có chỉ lệnh nào trong khoảng này.${window.KH ? window.KH.emptyNote() : ''}</div>`; return; }
      const khName = id => (C().byId(id) || {}).ten_ngan || '';
      const allKh = !khId(); // Tất cả khách hàng -> thêm cột khách hàng
      box.innerHTML = `<table class="v3-table">
        <thead><tr><th>Ngày</th><th>Số chỉ lệnh</th><th>Chuyền</th>${allKh ? '<th>Khách hàng</th>' : ''}<th>ART</th><th>PO</th><th class="r">Tổng SL</th><th>Người lập</th><th></th></tr></thead>
        <tbody>${data.map(r => `<tr class="${r.trang_thai === 'huy' ? 'v3-row-off' : ''}">
          <td class="nowrap">${viDate(r.ngay)}</td><td class="nowrap"><b>${esc(r.so_cl)}</b>${r.trang_thai === 'huy' ? ' <span class="ui-badge ui-badge-off">Đã hủy</span>' : ''}</td>
          <td>${esc(bpName(r.ma_bo_phan))}</td>${allKh ? `<td>${esc(khName(r.khach_hang_id))}</td>` : ''}<td><b>${esc(r.art)}</b></td>
          <td>${r.dong.slice(0, 3).map(d => `${esc(d.po)} <span class="ui-muted">(${fmt0(d.so_luong)})</span>`).join('<br>')}${r.dong.length > 3 ? `<br><span class="ui-muted">+ ${r.dong.length - 3} PO khác</span>` : ''}</td>
          <td class="r"><b>${fmt0(r.tong_sl)}</b></td><td>${esc(r.nguoi_lap)}</td>
          <td class="nowrap">${r.trang_thai === 'huy'
            ? `<button type="button" class="ui-btn-sm" data-act="restore" data-id="${r.id}">Khôi phục</button>`
            : `<button type="button" class="ui-btn-sm" data-act="edit" data-id="${r.id}">Xem / Sửa</button>
               <button type="button" class="ui-btn-sm" data-act="print" data-id="${r.id}">In</button>
               <button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="cancel" data-id="${r.id}" data-so="${esc(r.so_cl)}">Hủy</button>`}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="${allKh ? 6 : 5}">${data.length} chỉ lệnh</td><td class="r"><b>${fmt0(data.filter(r => r.trang_thai !== 'huy').reduce((a, r) => a + r.tong_sl, 0))}</b></td><td colspan="2"></td></tr></tfoot>
      </table>`;
    } catch (err) { box.innerHTML = `<div class="v3-empty">Lỗi tải danh sách: ${esc(err.message)}</div>`; }
  }

  /* ---------------- IN CHỈ LỆNH (mẫu Excel) ---------------- */
  async function printCl(id) {
    let c;
    try { c = (await api(`/api/chilenh/${id}`)).data; } catch (err) { toast('Không tải được chỉ lệnh để in: ' + err.message, 'error'); return; }
    const kh = C().byId(c.khach_hang_id);
    const cols = khSizes(kh);
    c.lines.forEach(l => l.sizes.forEach(s => { const k = normSize(s.size); if (!cols.includes(k)) cols.push(k); }));
    const n = v => (v ? new Intl.NumberFormat('vi-VN').format(v) : '');
    const title = isChat(c.ma_bo_phan) ? 'CHỈ LỆNH TỔ CHẶT' : 'CHỈ LỆNH CHUYỀN MAY';
    const landscape = cols.length > 8;
    const d = c.ngay || '';
    const rows = c.lines.map(l => {
      const m = {};
      l.sizes.forEach(s => { m[normSize(s.size)] = (m[normSize(s.size)] || 0) + s.so_luong; });
      return `<tr><td class="po">${esc(l.po)}</td><td class="tong">${n(l.so_luong)}</td>${cols.map(s => `<td class="sl">${n(m[s])}</td>`).join('')}</tr>`;
    });
    const blank = Math.max(0, 6 - rows.length);
    for (let i = 0; i < blank; i++) rows.push(`<tr class="blank"><td></td><td></td>${cols.map(() => '<td></td>').join('')}</tr>`);
    const colTot = cols.map(s => c.lines.reduce((a, l) => a + l.sizes.filter(x => normSize(x.size) === s).reduce((b, x) => b + x.so_luong, 0), 0));
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(c.so_cl)}</title>
      <style>
        @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm 8mm; }
        * { box-sizing: border-box; }
        body { font-family: "Times New Roman", serif; color: #000; margin: 0; font-size: 14px; }
        .co { display: flex; justify-content: space-between; font-size: 12px; }
        h1 { text-align: center; font-size: 34px; letter-spacing: 1px; margin: 6px 0 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        td, th { border: 1px solid #000; padding: 6px 4px; text-align: center; vertical-align: middle; }
        .meta td { border: 0; text-align: left; padding: 3px 4px; font-size: 15px; }
        .kh-label { background: #2c8a7d; color: #fff; font-weight: bold; text-align: center !important; border: 1px solid #000 !important; }
        .head th { background: #d9f2f2; font-size: 16px; }
        .head th.art { color: #d00000; font-size: 18px; }
        td.po { font-weight: bold; font-size: 16px; }
        td.tong { background: #e00000; color: #fff; font-weight: bold; font-size: 24px; }
        td.sl { color: #1f2fbf; font-weight: bold; font-size: 16px; }
        tr.blank td { height: 34px; }
        tfoot td { font-weight: bold; font-size: 15px; }
        .first { width: 13%; } .second { width: 10%; }
        .note { margin-top: 8px; font-size: 14px; }
        .sign { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; margin-top: 16px; font-size: 14px; }
        .sign i { display: block; font-size: 12px; } .sign div { min-height: 80px; }
      </style></head><body>
      <div class="co"><span><b>CÔNG TY TNHH GIA CÔNG THƯƠNG MẠI D&amp;D LONG AN</b></span><span>Số: <b>${esc(c.so_cl)}</b></span></div>
      <h1>${title}</h1>
      <table class="meta"><tr>
        <td class="kh-label" style="width:13%">KHÁCH HÀNG</td><td style="width:30%"><b>${esc((kh?.ten_ngan || '').toUpperCase())}</b></td>
        <td>${isChat(c.ma_bo_phan) ? 'Tổ' : 'Chuyền'}: <b>${esc(c.ten_bo_phan)}</b></td>
        <td style="text-align:right">Ngày <b>${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}</b></td></tr></table>
      <table>
        <colgroup><col class="first"><col class="second">${cols.map(() => '<col>').join('')}</colgroup>
        <thead><tr class="head"><th class="art">${esc(c.art)}</th><th>Tổng SL<br>phải giao</th>${cols.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
        <tfoot><tr><td>CỘNG</td><td>${n(c.tong_sl)}</td>${colTot.map(t => `<td>${n(t)}</td>`).join('')}</tr></tfoot>
      </table>
      ${c.ghi_chu ? `<div class="note">Ghi chú: ${esc(c.ghi_chu)}</div>` : ''}
      <div class="sign">
        <div><b>Người lập</b><i>(Ký, họ tên)</i><br><br><br>${esc(c.nguoi_lap)}</div>
        <div><b>${isChat(c.ma_bo_phan) ? 'Tổ trưởng' : 'Chuyền trưởng'}</b><i>(Ký, họ tên)</i></div>
        <div><b>Giám đốc</b><i>(Ký, họ tên)</i></div>
      </div></body></html>`;
    printHtml(html);
  }

  /* ---------------- SỰ KIỆN ---------------- */
  function onInput(e) {
    const t = e.target;
    if (S.sub !== 'lap' || !S.form) return;
    S.dirty = true;
    if (t.dataset.h) { S.form[t.dataset.h] = t.value; return; }
    if (t.id === 'cl-art') { S.form.art = t.value; return; }
    if (t.classList.contains('cl-sz')) {
      const i = parseInt(t.closest('tr').dataset.i, 10);
      S.form.rows[i].sizes[t.dataset.size] = t.value;
      updateTotals();
    }
  }
  function onChange(e) {
    const t = e.target;
    if (S.sub === 'lap' && S.form) {
      const f = S.form;
      if (t.id === 'cl-ngay') { f.ngay = t.value; refreshSoCl(); return; }
      if (t.id === 'cl-art') {
        const v = String(t.value).trim();
        const hit = artsOf(f.khach_hang_id).find(a => normKey(a) === normKey(v));
        f.art = hit || v; t.value = f.art;
        loadOrders(); return;
      }
      if (t.id === 'cl-bp') { f.ma_bo_phan = t.value; t.classList.remove('v3-err'); refreshSoCl(); return; }
      if (t.classList.contains('cl-chon')) {
        const i = parseInt(t.closest('tr').dataset.i, 10);
        const r = f.rows[i];
        r.chon = t.checked;
        S.dirty = true;
        if (r.chon && !rowTotal(r)) Object.values(r.info).forEach(s => { if (s.chua_tha > 0) r.sizes[s.size] = s.chua_tha; });
        renderRows(); return;
      }
      if (t.classList.contains('cl-sz')) { const n = toNum(t.value); t.value = n ? fmt(n) : ''; }
      return;
    }
    if (S.sub === 'ds' && t.closest('.v3-filter') && t.tagName === 'SELECT') readFilterAndList();
  }
  function readFilterAndList() {
    const g = id => $(id)?.value || '';
    S.filter = { tu: g('cl-f-tu'), den: g('cl-f-den'), bp: g('cl-f-bp'), tt: g('cl-f-tt'), q: g('cl-f-q').trim() };
    renderList();
  }
  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.id === 'cl-f-q' && e.key === 'Enter') { readFilterAndList(); return; }
    if (e.target.id === 'cl-art' && e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); return; }
    enterToNext(e, '#cl-rows');
  }
  async function onClick(e) {
    const sub = e.target.closest('.v3-subs .ui-tab');
    if (sub) { S.sub = sub.dataset.sub; render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = parseInt(b.dataset.id, 10);
    if (act === 'save') save(false);
    if (act === 'save-print') save(true);
    if (act === 'new') { if (grand(S.form) && !S.editingId && !confirm('Bỏ chỉ lệnh đang nhập dở?')) return; newForm(); }
    if (act === 'cancel-edit') newForm();
    if (act === 'filter') readFilterAndList();
    if (act === 'edit') editCl(id);
    if (act === 'print') printCl(id);
    if (act === 'cancel') {
      if (!confirm(`Hủy chỉ lệnh ${b.dataset.so}? Số đã thả sẽ được trả lại cho đơn hàng.`)) return;
      try { await api(`/api/chilenh/${id}/huy`, 'PUT'); toast('Đã hủy chỉ lệnh', 'info'); renderList(); if (window.DonHang) window.DonHang.reload(); }
      catch (err) { toast(err.message, 'error'); }
    }
    if (act === 'restore') {
      try { await api(`/api/chilenh/${id}/mo`, 'PUT'); toast('Đã khôi phục chỉ lệnh', 'success'); renderList(); }
      catch (err) { toast(err.message, 'error'); }
    }
  }

  /* ---------------- KHỞI ĐỘNG ---------------- */
  async function ensure() {
    await window.AuthReady;
    const root = $('cl-root');
    if (!root) return false;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
      renderShell();
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeydown);
    }
    return true;
  }
  async function show() {
    if (!(await ensure())) return;
    if (!S.form) { S.form = emptyForm(); render(); refreshSoCl(); } else render();
  }
  /** Mở từ tab Đơn hàng: khách + ART + các PO đã chọn */
  async function openFromOrders(kh, art, poIds) {
    const btn = document.querySelector('.tab-btn[data-target="tab-chilenh"]');
    if (!btn || !window.Auth.can('tab-chilenh')) { toast('Tài khoản không có quyền tab Chỉ lệnh', 'error'); return; }
    if (window.KH && !window.KH.set(kh)) return; // chọn PO lúc đang xem Tất cả -> thanh bên theo khách của PO
    S.openingFromOrders = true;
    btn.click();
    await ensure();
    S.openingFromOrders = false;
    S.editingId = null;
    S.dirty = false;
    S.form = emptyForm();
    S.form.khach_hang_id = kh;
    S.form.art = art;
    S.sub = 'lap';
    render();
    refreshSoCl();
    await loadOrders({ only: poIds });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-chilenh"]')?.addEventListener('click', () => { if (!S.openingFromOrders) show(); });
    // Chỉ lệnh đang lập / sửa dở -> hỏi trước khi thanh bên đổi khách
    if (window.KH) window.KH.guard(id => {
      const f = S.form;
      if (!f || !f.khach_hang_id || id === f.khach_hang_id || !(S.editingId || (S.dirty && grand(f)))) return '';
      return S.editingId ? `Đang sửa chỉ lệnh ${f.so_cl} – chưa lưu sẽ bị bỏ.` : `Chỉ lệnh đang lập dở (ART ${f.art}) sẽ bị bỏ.`;
    });
    window.addEventListener('kh-changed', () => {
      if (!$('cl-root')?.dataset.ready) return;
      if (S.form && S.form.khach_hang_id !== (khId() || '')) { S.editingId = null; S.dirty = false; S.form = emptyForm(); }
      if (!$('tab-chilenh')?.classList.contains('active')) return; // tab khác: show() tự vẽ khi mở
      render();
      if (S.sub === 'lap') refreshSoCl();
    });
  }
  window.ChiLenh = { openFromOrders, print: printCl };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
