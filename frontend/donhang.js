/**
 * TAB ĐƠN HÀNG (dữ liệu gốc): Khách hàng → ART → PO → số lượng theo size
 * Dùng chung bảng PO với Phiếu xuất / Nhập kho / Công nợ. Tiến độ: Đặt · Đã thả · Đã xuất · Còn lại.
 * Khách hàng lấy theo thanh bên (window.KH); "Tất cả khách hàng" thì chỉ xem, không thêm / dán được.
 * Quy tắc gõ Telex: input chỉ cập nhật dữ liệu, không vẽ lại ô đang gõ; keydown bỏ qua khi isComposing.
 */
(function () {
  const { esc, toNum, fmt, fmt0, api, toast, normSize, normKey, khSizes, enterToNext, $ } = window.U;
  const C = () => window.Catalog || { khach: [], khachAll: [], po: [], byId: () => null };

  const S = {
    q: '', tt: 'con',
    list: [], sel: new Set(), form: null, paste: null, loaded: false,
  };
  const khId = () => (window.KH ? window.KH.one() : null);
  const qtyNum = v => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10) || 0; // số lượng dán từ Excel (1,000 / 1.000)

  function emptyForm(prev) {
    const kh = prev?.khach_hang_id || khId() || '';
    return { id: null, khach_hang_id: kh, day: prev?.day || 0, art: prev?.art || '', po: '', mau: prev?.mau || '', don_hang: prev?.don_hang || '',
      don_gia: prev?.don_gia || '', ngay_giao: prev?.ngay_giao || '', ghi_chu: '', sizes: {} };
  }
  function formSizes(f) {
    const k = C().byId(f.khach_hang_id);
    const days = (k && k.day_size) || [];
    const base = ((days[f.day] || days[0] || {}).sizes || []).map(normSize);
    const extra = Object.keys(f.sizes).filter(s => !base.includes(s) && toNum(f.sizes[s]));
    return [...base, ...extra];
  }
  const formTotal = f => formSizes(f).reduce((a, s) => a + toNum(f.sizes[s]), 0);
  const khFixed = id => `<div class="ui-field"><span class="ui-label">Khách hàng</span><div class="v3-fixed">${esc((C().byId(id) || {}).ten_ngan || '')}</div></div>`;
  const artsOf = khId => [...new Set(C().po.filter(p => p.khach_hang_id === parseInt(khId, 10)).map(p => String(p.art || '').trim()).filter(Boolean))];

  /* ---------------- KHUNG ---------------- */
  function renderShell() {
    const root = $('dh-root');
    root.innerHTML = `
      <header class="ui-page-head"><h2>Đơn hàng</h2>
        <p>Dữ liệu gốc: khách hàng → ART → PO → số lượng theo size. Chỉ lệnh thả chuyền và theo dõi xuất hàng đều lấy từ đây.</p></header>
      <div class="ui-panel v3-filter">
        <label class="ui-field v3-grow"><span class="ui-label">Tìm</span><input type="search" class="ui-input" id="dh-f-q" value="${esc(S.q)}" placeholder="ART, PO, đơn hàng, màu"></label>
        <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="dh-f-tt">
          <option value="con" ${S.tt === 'con' ? 'selected' : ''}>Còn phải giao</option>
          <option value="du" ${S.tt === 'du' ? 'selected' : ''}>Đã giao đủ</option>
          <option value="all" ${S.tt === 'all' ? 'selected' : ''}>Tất cả</option></select></label>
        <div class="v3-filter-btns">
          <button type="button" class="ui-btn ui-btn-primary" data-act="add" data-need-kh>＋ Thêm đơn hàng</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="paste-open" data-need-kh>📋 Dán từ Excel</button>
        </div>
        <p class="ui-hint" id="dh-need-kh" hidden>Muốn thêm hoặc dán đơn hàng, hãy chọn 1 khách hàng ở thanh bên trái.</p>
      </div>
      <div id="dh-form-box"></div>
      <div id="dh-paste-box"></div>
      <div class="v3-selbar" id="dh-selbar" hidden></div>
      <div class="ui-panel ui-panel-flush"><div class="v3-table-wrap" id="dh-list"><div class="v3-empty">Đang tải...</div></div></div>`;
    syncKh();
  }
  /** Khóa nút Thêm / Dán khi đang xem Tất cả khách hàng */
  function syncKh() {
    const one = !!khId();
    document.querySelectorAll('#dh-root [data-need-kh]').forEach(b => { b.disabled = !one; });
    const hint = $('dh-need-kh'); if (hint) hint.hidden = one;
  }

  /* ---------------- DANH SÁCH ---------------- */
  async function loadList() {
    const p = new URLSearchParams({ trang_thai: S.tt });
    if (khId()) p.set('khach_hang_id', khId());
    if (S.q) p.set('q', S.q);
    const box = $('dh-list');
    try {
      const { data } = await api('/api/donhang?' + p);
      S.list = data;
      S.sel.forEach(id => { if (!data.some(o => o.id === id)) S.sel.delete(id); });
      renderList();
    } catch (err) { box.innerHTML = `<div class="v3-empty">Lỗi tải đơn hàng: ${esc(err.message)}</div>`; }
  }

  function renderList() {
    const box = $('dh-list');
    if (!box) return;
    if (!S.list.length) {
      box.innerHTML = `<div class="v3-empty">${S.tt === 'con' ? 'Không có đơn hàng nào còn phải giao.' : 'Chưa có đơn hàng.'}${khId() ? ' Bấm <b>＋ Thêm đơn hàng</b> hoặc <b>📋 Dán từ Excel</b>.' : ''}${window.KH ? window.KH.emptyNote() : ''}</div>`;
      renderSelBar();
      return;
    }
    const kh = khId() ? C().byId(khId()) : null;
    const cols = kh ? (() => { const c = khSizes(kh); S.list.forEach(o => o.sizes.forEach(s => { if (s.dat && !c.includes(s.size)) c.push(s.size); })); return c; })() : [];
    const groups = [];
    S.list.forEach(o => {
      const key = `${o.khach_hang_id}|${normKey(o.art)}`;
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, kh: o.khach_ten, art: o.art, rows: [] }; groups.push(g); }
      g.rows.push(o);
    });
    const nCols = 8 + cols.length; // PO, ĐH/Màu, Ngày giao, size..., Đặt, Đã thả, Đã xuất, Còn lại, nút
    const canTha = window.Auth && window.Auth.can('tab-chilenh');
    box.innerHTML = `<table class="v3-table v3-table-dh">
      <thead><tr>${canTha ? '<th class="c"></th>' : ''}<th>PO</th><th>Đơn hàng / Màu</th><th>Ngày giao</th>
        ${cols.map(s => `<th class="c v3-sz">${esc(s)}</th>`).join('')}
        <th class="r">Đặt</th><th class="r">Đã thả</th><th class="r">Đã xuất</th><th class="r">Còn lại</th><th></th></tr></thead>
      <tbody>${groups.map(g => {
        const t = k => g.rows.reduce((a, o) => a + o[k], 0);
        return `<tr class="v3-group"><td colspan="${nCols + (canTha ? 1 : 0) - 5}"><b>ART ${esc(g.art)}</b> <span class="ui-muted">${kh ? '' : '· ' + esc(g.kh) + ' '}· ${g.rows.length} PO</span>
            ${canTha ? `<button type="button" class="ui-btn-sm" data-act="tha-art" data-key="${esc(g.key)}">🧵 Thả chuyền cả ART</button>` : ''}</td>
          <td class="r"><b>${fmt0(t('tong_dat'))}</b></td><td class="r">${fmt0(t('tong_tha'))}</td><td class="r">${fmt0(t('tong_xuat'))}</td><td class="r"><b>${fmt0(t('con_phai_giao'))}</b></td><td></td></tr>`
          + g.rows.map(o => {
            const m = Object.fromEntries(o.sizes.map(s => [s.size, s.dat]));
            return `<tr data-id="${o.id}">
              ${canTha ? `<td class="c"><input type="checkbox" class="dh-sel" data-id="${o.id}" ${S.sel.has(o.id) ? 'checked' : ''} aria-label="Chọn PO ${esc(o.po)}"></td>` : ''}
              <td class="nowrap"><b>${esc(o.po)}</b>${o.trung ? ' <span class="ui-badge ui-badge-warn" title="Có dòng trùng khách + PO + ART">trùng</span>' : ''}</td>
              <td>${esc([o.don_hang, o.mau].filter(Boolean).join(' · '))}</td>
              <td class="nowrap">${esc(U.viDate(o.ngay_giao))}</td>
              ${cols.map(s => `<td class="c v3-sz">${fmt(m[s])}</td>`).join('')}
              <td class="r"><b>${fmt0(o.tong_dat)}</b></td>
              <td class="r">${fmt(o.tong_tha)}</td>
              <td class="r">${fmt(o.tong_xuat + o.tong_dc)}</td>
              <td class="r ${o.con_phai_giao ? '' : 'v3-ok'}"><b>${o.con_phai_giao ? fmt0(o.con_phai_giao) : '✓ đủ'}</b>${o.giao_du ? `<br><small class="v3-neg">dư ${fmt0(o.giao_du)}</small>` : ''}</td>
              <td class="nowrap"><button type="button" class="ui-btn-sm" data-act="edit" data-id="${o.id}">Sửa</button>
                <button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="del" data-id="${o.id}">Xóa</button></td></tr>`;
          }).join('');
      }).join('')}</tbody></table>
      ${kh ? '' : '<p class="ui-hint v3-pad">Chọn 1 khách hàng ở thanh bên trái để xem số lượng theo từng size.</p>'}`;
    renderSelBar();
  }

  function renderSelBar() {
    const bar = $('dh-selbar');
    if (!bar) return;
    const rows = S.list.filter(o => S.sel.has(o.id));
    bar.hidden = !rows.length;
    if (!rows.length) return;
    const same = rows.every(o => o.khach_hang_id === rows[0].khach_hang_id && normKey(o.art) === normKey(rows[0].art));
    bar.innerHTML = `<span>Đã chọn <b>${rows.length}</b> PO${same ? ` · ART <b>${esc(rows[0].art)}</b>` : ' – <b class="v3-neg">khác ART, chỉ thả chuyền được các PO cùng 1 ART</b>'}</span>
      <div class="ui-flex-fill"></div>
      <button type="button" class="ui-btn ui-btn-ghost" data-act="sel-clear">Bỏ chọn</button>
      <button type="button" class="ui-btn ui-btn-primary" data-act="tha" ${same ? '' : 'disabled'}>🧵 Thả chuyền ${rows.length} PO</button>`;
  }

  function goTha(rows) {
    if (!rows.length) return;
    if (!window.ChiLenh) { toast('Chưa tải được tab Chỉ lệnh', 'error'); return; }
    window.ChiLenh.openFromOrders(rows[0].khach_hang_id, rows[0].art, rows.map(o => o.id));
  }

  /* ---------------- FORM THÊM / SỬA ---------------- */
  function renderForm() {
    const box = $('dh-form-box');
    const f = S.form;
    if (!f) { box.innerHTML = ''; return; }
    const kh = C().byId(f.khach_hang_id);
    const days = (kh && kh.day_size) || [];
    const sizes = formSizes(f);
    box.innerHTML = `
      <section class="ui-panel v3-form" id="dh-form">
        <h3 class="ui-panel-title">${f.id ? 'Sửa đơn hàng PO ' + esc(f.po) : 'Thêm đơn hàng'}</h3>
        <div class="ui-fields">
          ${khFixed(f.khach_hang_id)}
          <label class="ui-field"><span class="ui-label">ART (mã hàng) <b class="ui-req">*</b></span>
            <input type="text" class="ui-input ui-input-strong" data-f="art" list="dh-dl-art" autocomplete="off" value="${esc(f.art)}" placeholder="vd: DA-260-A"></label>
          <label class="ui-field"><span class="ui-label">PO <b class="ui-req">*</b></span>
            <input type="text" class="ui-input ui-input-strong" data-f="po" autocomplete="off" value="${esc(f.po)}" placeholder="vd: RV2611-112"></label>
          <label class="ui-field"><span class="ui-label">Màu</span><input type="text" class="ui-input" data-f="mau" value="${esc(f.mau)}"></label>
          <label class="ui-field"><span class="ui-label">Đơn hàng</span><input type="text" class="ui-input" data-f="don_hang" value="${esc(f.don_hang)}"></label>
          <label class="ui-field"><span class="ui-label">Đơn giá (đ/đôi)</span><input type="text" class="ui-input dh-num" inputmode="decimal" data-f="don_gia" value="${esc(f.don_gia ? fmt(toNum(f.don_gia)) : '')}"></label>
          <label class="ui-field"><span class="ui-label">Ngày giao</span><input type="date" class="ui-input" data-f="ngay_giao" value="${esc(f.ngay_giao)}"></label>
          <label class="ui-field"><span class="ui-label">Ghi chú</span><input type="text" class="ui-input" data-f="ghi_chu" value="${esc(f.ghi_chu)}"></label>
        </div>
        <datalist id="dh-dl-art">${artsOf(f.khach_hang_id).map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>
        <div class="v3-sizes-head">
          <span class="ui-label">Số lượng theo size</span>
          ${days.length > 1 ? `<span class="v3-days">${days.map((d, i) => `<button type="button" class="ui-chip ${i === f.day ? 'active' : ''}" data-act="day" data-day="${i}">${esc(d.ten)}</button>`).join('')}</span>` : ''}
          <span class="v3-total">Tổng: <b id="dh-total">${fmt0(formTotal(f))}</b></span>
        </div>
        ${kh ? (sizes.length ? `<div class="v3-sizes">${sizes.map(s => `
          <label class="v3-size"><span>${esc(s)}</span><input type="text" inputmode="numeric" class="v3-size-in" data-size="${esc(s)}" value="${esc(fmt(toNum(f.sizes[s])))}"></label>`).join('')}</div>`
          : '<p class="ui-hint">Khách hàng này chưa khai báo dãy size (tab Danh mục).</p>') : '<p class="ui-hint">Chọn khách hàng để hiện bảng size.</p>'}
        <div class="v3-actions">
          <button type="button" class="ui-btn ui-btn-ghost" data-act="form-close">Đóng</button>
          <div class="ui-flex-fill"></div>
          ${f.id ? '' : '<button type="button" class="ui-btn ui-btn-ghost" data-act="save-next">Lưu và nhập PO khác cùng ART</button>'}
          <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="save">💾 Lưu đơn hàng</button>
        </div>
      </section>`;
  }

  async function saveForm(andNext) {
    const f = S.form;
    const errs = [];
    if (!f.khach_hang_id) errs.push('Chưa chọn khách hàng');
    if (!String(f.art).trim()) errs.push('Chưa nhập ART');
    if (!String(f.po).trim()) errs.push('Chưa nhập PO');
    document.querySelectorAll('#dh-form .v3-err').forEach(e => e.classList.remove('v3-err'));
    if (!String(f.art).trim()) document.querySelector('#dh-form [data-f="art"]')?.classList.add('v3-err');
    if (!String(f.po).trim()) document.querySelector('#dh-form [data-f="po"]')?.classList.add('v3-err');
    if (errs.length) { toast(errs[0], 'error'); return; }
    if (!formTotal(f) && !confirm('Đơn hàng chưa có số lượng size nào. Vẫn lưu?')) return;
    const body = { ...f, don_gia: toNum(f.don_gia), sizes: formSizes(f).filter(s => toNum(f.sizes[s])).map(s => ({ size: s, so_luong: toNum(f.sizes[s]) })) };
    try {
      const r = f.id ? await api(`/api/donhang/${f.id}`, 'PUT', body) : await api('/api/donhang', 'POST', body);
      toast(r.message || 'Đã lưu đơn hàng', 'success');
      S.form = andNext ? emptyForm(f) : null;
      renderForm();
      if (andNext) document.querySelector('#dh-form [data-f="po"]')?.focus();
      await afterChange();
    } catch (err) { toast('Không lưu được: ' + err.message, 'error'); }
  }

  async function afterChange() {
    await loadList();
    if (window.Catalog) { await window.Catalog.load(); window.dispatchEvent(new Event('catalog-changed')); }
  }

  /* ---------------- DÁN TỪ EXCEL ---------------- */
  function renderPaste() {
    const box = $('dh-paste-box');
    const P = S.paste;
    if (!P) { box.innerHTML = ''; return; }
    const kh = C().byId(P.khach_hang_id);
    const days = (kh && kh.day_size) || [];
    const sizes = ((days[P.day] || days[0] || {}).sizes || []).map(normSize);
    const head = ['ART', 'PO', 'Màu', 'Đơn hàng', 'Đơn giá', 'Ngày giao (dd/mm/yyyy)', ...sizes];
    box.innerHTML = `
      <section class="ui-panel v3-form" id="dh-paste">
        <h3 class="ui-panel-title">Dán đơn hàng từ Excel</h3>
        <div class="ui-fields">
          ${khFixed(P.khach_hang_id)}
          ${days.length > 1 ? `<div class="ui-field ui-span-2"><span class="ui-label">Dãy size</span><span class="v3-days">${days.map((d, i) =>
            `<button type="button" class="ui-chip ${i === P.day ? 'active' : ''}" data-act="p-day" data-day="${i}">${esc(d.ten)}</button>`).join('')}</span></div>` : ''}
          <div class="ui-field ui-span-2"><span class="ui-label">Dòng trùng (đã có PO + ART)</span>
            <span class="v3-days"><label class="v3-check"><input type="radio" name="dh-p-mode" value="skip" ${P.mode === 'skip' ? 'checked' : ''}> Bỏ qua</label>
            <label class="v3-check"><input type="radio" name="dh-p-mode" value="update" ${P.mode === 'update' ? 'checked' : ''}> Cập nhật theo file dán</label></span></div>
        </div>
        <p class="ui-hint">Copy trong Excel các cột <b>đúng thứ tự</b> dưới đây rồi dán vào ô. Số lượng size đọc <b>theo vị trí cột</b> của dãy size (không cần dòng tiêu đề).</p>
        <div class="v3-table-wrap"><table class="v3-table v3-table-mini"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead></table></div>
        <textarea class="ui-input v3-textarea" id="dh-p-text" rows="5" placeholder="Dán từ Excel vào đây">${esc(P.text)}</textarea>
        <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="paste-close">Đóng</button><div class="ui-flex-fill"></div>
          <button type="button" class="ui-btn ui-btn-dark" data-act="paste-preview">Xem trước</button></div>
        <div id="dh-p-preview">${P.rows ? previewHtml(P, sizes) : ''}</div>
      </section>`;
  }

  function parseDate(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return '';
  }
  function parsePaste(P, sizes) {
    const have = new Set(C().po.filter(p => p.khach_hang_id === P.khach_hang_id).map(p => `${normKey(p.po)}|${normKey(p.art)}`));
    const seen = new Set();
    return P.text.split(/\r?\n/).map(l => l.split('\t')).filter(c => c.some(x => String(x).trim())).map(c => {
      const [art, po, mau, don_hang, don_gia, ngay] = c.map(x => String(x ?? '').trim());
      const row = { art, po, mau, don_hang, don_gia: toNum(don_gia), ngay_giao: parseDate(ngay), sizes: [] };
      sizes.forEach((s, i) => { const v = qtyNum(c[6 + i]); if (v) row.sizes.push({ size: s, so_luong: v }); });
      row.tong = row.sizes.reduce((a, s) => a + s.so_luong, 0);
      const k = `${normKey(po)}|${normKey(art)}`;
      if (/^(art|ma hang|mã hàng)$/i.test(art) || /^po$/i.test(po)) row.status = 'head';
      else if (!art || !po) row.status = 'err';
      else if (seen.has(k)) row.status = 'dup-file';
      else row.status = have.has(k) ? 'dup' : 'new';
      seen.add(k);
      return row;
    }).filter(r => r.status !== 'head');
  }
  function previewHtml(P, sizes) {
    const st = { new: '<span class="ui-badge ui-badge-ok">Mới</span>', dup: `<span class="ui-badge ui-badge-warn">Đã có – ${P.mode === 'update' ? 'cập nhật' : 'bỏ qua'}</span>`,
      'dup-file': '<span class="ui-badge ui-badge-off">Lặp trong file – bỏ</span>', err: '<span class="ui-badge ui-badge-off">Thiếu ART/PO</span>' };
    const ok = P.rows.filter(r => r.status === 'new' || (r.status === 'dup' && P.mode === 'update'));
    return `<div class="v3-table-wrap"><table class="v3-table v3-table-mini">
      <thead><tr><th></th><th>ART</th><th>PO</th><th>Màu</th><th>Đơn hàng</th><th class="r">Đơn giá</th><th>Ngày giao</th>${sizes.map(s => `<th class="c">${esc(s)}</th>`).join('')}<th class="r">Tổng</th></tr></thead>
      <tbody>${P.rows.map(r => { const m = Object.fromEntries(r.sizes.map(s => [s.size, s.so_luong])); return `<tr>
        <td>${st[r.status]}</td><td><b>${esc(r.art)}</b></td><td><b>${esc(r.po)}</b></td><td>${esc(r.mau)}</td><td>${esc(r.don_hang)}</td>
        <td class="r">${fmt(r.don_gia)}</td><td>${esc(U.viDate(r.ngay_giao))}</td>${sizes.map(s => `<td class="c">${fmt(m[s])}</td>`).join('')}<td class="r"><b>${fmt0(r.tong)}</b></td></tr>`; }).join('')}</tbody>
    </table></div>
    <div class="v3-actions"><span>${P.rows.length} dòng · sẽ lưu <b>${ok.length}</b> dòng</span><div class="ui-flex-fill"></div>
      <button type="button" class="ui-btn ui-btn-primary" data-act="paste-save" ${ok.length ? '' : 'disabled'}>💾 Lưu ${ok.length} dòng</button></div>`;
  }
  async function savePaste() {
    const P = S.paste;
    const items = P.rows.filter(r => r.status === 'new' || (r.status === 'dup' && P.mode === 'update'))
      .map(r => ({ art: r.art, po: r.po, mau: r.mau, don_hang: r.don_hang, don_gia: r.don_gia, ngay_giao: r.ngay_giao, sizes: r.sizes }));
    try {
      const r = await api('/api/donhang', 'POST', { khach_hang_id: P.khach_hang_id, items, mode: P.mode });
      toast(r.message + (r.loi.length ? ` · ${r.loi.length} dòng lỗi` : ''), r.loi.length ? 'info' : 'success');
      S.paste = null; renderPaste();
      await afterChange();
    } catch (err) { toast('Không lưu được: ' + err.message, 'error'); }
  }

  /* ---------------- SỰ KIỆN ---------------- */
  function onInput(e) {
    const t = e.target;
    if (S.form && t.closest('#dh-form')) {
      t.classList.remove('v3-err');
      if (t.dataset.size !== undefined) S.form.sizes[t.dataset.size] = t.value;
      else if (t.dataset.f) S.form[t.dataset.f] = t.value;
      const tot = $('dh-total'); if (tot) tot.textContent = fmt0(formTotal(S.form));
      return;
    }
    if (S.paste && t.id === 'dh-p-text') S.paste.text = t.value;
  }

  let qTimer = null;
  function onChange(e) {
    const t = e.target;
    if (t.id === 'dh-f-tt') { S.tt = t.value; loadList(); return; }
    if (t.name === 'dh-p-mode' && S.paste) { S.paste.mode = t.value; if (S.paste.rows) renderPaste(); return; }
    if (t.classList.contains('dh-sel')) {
      const id = parseInt(t.dataset.id, 10);
      if (t.checked) S.sel.add(id); else S.sel.delete(id);
      renderSelBar(); return;
    }
    if (t.classList.contains('v3-size-in') || t.classList.contains('dh-num')) { const n = toNum(t.value); t.value = n ? fmt(n) : ''; }
  }

  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.id === 'dh-f-q' && e.key === 'Enter') { S.q = e.target.value.trim(); loadList(); return; }
    enterToNext(e, '#dh-form');
  }

  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = parseInt(b.dataset.id, 10);
    if (act === 'add') {
      if (!khId()) { toast('Chọn 1 khách hàng ở thanh bên trái trước', 'error'); return; }
      S.paste = null; renderPaste(); S.form = emptyForm(); renderForm(); document.querySelector('#dh-form [data-f="art"]')?.focus();
    }
    if (act === 'edit') {
      const o = S.list.find(x => x.id === id);
      if (!o) return;
      // Đang xem Tất cả -> thanh bên chuyển sang khách của đơn hàng này
      if (window.KH && !window.KH.set(o.khach_hang_id)) return;
      const sizes = Object.fromEntries(o.sizes.filter(s => s.dat).map(s => [s.size, s.dat]));
      const kh = C().byId(o.khach_hang_id);
      const keys = Object.keys(sizes);
      const di = ((kh && kh.day_size) || []).findIndex(d => keys.every(s => (d.sizes || []).map(normSize).includes(s)));
      S.form = { id: o.id, khach_hang_id: o.khach_hang_id, day: di > -1 ? di : 0, art: o.art, po: o.po, mau: o.mau || '', don_hang: o.don_hang || '',
        don_gia: o.don_gia || '', ngay_giao: o.ngay_giao || '', ghi_chu: o.ghi_chu || '', sizes };
      S.paste = null; renderPaste(); renderForm();
      $('dh-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (act === 'del') {
      const o = S.list.find(x => x.id === id);
      if (!o || !confirm(`Xóa đơn hàng PO ${o.po} · ART ${o.art}?`)) return;
      try { await api(`/api/donhang/${id}`, 'DELETE'); toast('Đã xóa đơn hàng', 'info'); S.sel.delete(id); await afterChange(); }
      catch (err) { toast(err.message, 'error'); }
    }
    if (act === 'day' && S.form) { S.form.day = parseInt(b.dataset.day, 10) || 0; renderForm(); }
    if (act === 'form-close') { S.form = null; renderForm(); }
    if (act === 'save') saveForm(false);
    if (act === 'save-next') saveForm(true);
    if (act === 'paste-open') {
      if (!khId()) { toast('Chọn 1 khách hàng ở thanh bên trái trước', 'error'); return; }
      S.form = null; renderForm();
      S.paste = { khach_hang_id: khId(), day: 0, mode: 'skip', text: '', rows: null };
      renderPaste(); $('dh-p-text')?.focus();
    }
    if (act === 'p-day' && S.paste) { S.paste.day = parseInt(b.dataset.day, 10) || 0; S.paste.rows = null; renderPaste(); }
    if (act === 'paste-close') { S.paste = null; renderPaste(); }
    if (act === 'paste-preview' && S.paste) {
      if (!S.paste.khach_hang_id) { toast('Chọn khách hàng trước', 'error'); return; }
      const kh = C().byId(S.paste.khach_hang_id);
      const days = (kh && kh.day_size) || [];
      S.paste.rows = parsePaste(S.paste, ((days[S.paste.day] || days[0] || {}).sizes || []).map(normSize));
      if (!S.paste.rows.length) toast('Chưa có dòng nào để đọc', 'error');
      renderPaste();
    }
    if (act === 'paste-save') savePaste();
    if (act === 'sel-clear') { S.sel.clear(); renderList(); }
    if (act === 'tha') goTha(S.list.filter(o => S.sel.has(o.id)));
    if (act === 'tha-art') goTha(S.list.filter(o => `${o.khach_hang_id}|${normKey(o.art)}` === b.dataset.key));
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
    }
    loadList();
  }
  /** Form / dán đang có dữ liệu chưa lưu -> hỏi trước khi thanh bên đổi khách */
  function dirtyMsg(id) {
    const f = S.form;
    const formDirty = f && (f.id || String(f.art).trim() || String(f.po).trim() || formTotal(f));
    const pasteDirty = S.paste && String(S.paste.text).trim();
    if (!(formDirty || pasteDirty) || id === (f || S.paste).khach_hang_id) return '';
    return f ? `Đơn hàng đang ${f.id ? 'sửa' : 'nhập'} (${f.po ? 'PO ' + f.po : 'ART ' + (f.art || '…')}) chưa lưu sẽ bị bỏ.` : 'Dữ liệu dán từ Excel chưa lưu sẽ bị bỏ.';
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-donhang"]')?.addEventListener('click', show);
    if (window.KH) window.KH.guard(dirtyMsg);
    window.addEventListener('kh-changed', () => {
      if (!$('dh-root')?.dataset.ready) return;
      S.sel.clear();
      const kh = (S.form || S.paste || {}).khach_hang_id;
      if (kh && kh !== khId()) { S.form = null; S.paste = null; renderForm(); renderPaste(); }
      syncKh();
      if ($('tab-donhang')?.classList.contains('active')) loadList(); // tab khác: show() tự tải khi mở
    });
  }
  window.DonHang = { reload: () => { if ($('dh-root')?.dataset.ready) loadList(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
