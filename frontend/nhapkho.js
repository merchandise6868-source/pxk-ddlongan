/**
 * TAB NHẬP KHO - D&D LONG AN
 * 5 loại: 1 Công cụ dụng cụ · 2 NPL may · 3 Vật tư chặt · 4 TP mũ giày · 5 TP chặt
 * Loại 3-5: Đơn vị giao -> Khách hàng -> PO -> Mã hàng (dropdown lọc dần)
 * Dữ liệu khách hàng / PO lấy từ window.Catalog (tab Danh mục), không sửa phần phiếu xuất.
 */
(function () {
  const LOAI = {
    1: { ten: 'Công cụ dụng cụ', dai: 'Công cụ dụng cụ sản xuất', icon: '🔧', size: false, po: false, nhomVt: 1 },
    2: { ten: 'NPL may', dai: 'Nguyên phụ liệu may', icon: '🧵', size: false, po: false, nhomVt: 2 },
    3: { ten: 'Vật tư chặt', dai: 'Vật tư chặt', icon: '✂️', size: false, po: true, nhomVt: 3 },
    4: { ten: 'TP mũ giày', dai: 'Thành phẩm mũ giày', icon: '👟', size: true, po: true },
    5: { ten: 'TP chặt', dai: 'Thành phẩm chặt', icon: '📦', size: true, po: true },
  };
  const PHAN_LOAI = { khach_hang: 'Khách hàng', gia_cong: 'Công ty gia công', ncc: 'Nhà cung cấp' };
  const NHOM_VT = { 1: '1. Công cụ dụng cụ', 2: '2. NPL may', 3: '3. Vật tư chặt' };

  const esc = s => (s === null || s === undefined ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toNum = v => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const fmt = v => (v ? new Intl.NumberFormat('vi-VN').format(v) : '');
  const fmt0 = v => new Intl.NumberFormat('vi-VN').format(v || 0);
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const firstOfMonth = () => today().slice(0, 8) + '01';
  const viDate = s => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || '');
  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (_) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await res.json(); } catch (_) { throw new Error('Máy chủ không phản hồi đúng'); }
    if (!data.success) throw new Error(data.error || 'Lỗi máy chủ');
    return data;
  }

  const C = () => window.Catalog || { khach: [], khachAll: [], po: [], byId: () => null, poOf: () => [] };

  /* ============================================================
     TRẠNG THÁI
     ============================================================ */
  const S = {
    loai: store.get('nk_loai', 4),
    sub: 'lap',
    dvg: [],
    vt: [],
    form: null,
    editingId: null,
    vtNhom: 1,
    editingDvgId: null,
    filter: { tu: firstOfMonth(), den: today(), dvg: '', q: '' },
    loaded: false,
  };
  const khId = () => (window.KH ? window.KH.one() : null); // khách đang chọn ở thanh bên

  function emptyLine(prev) {
    const l = { khach_hang_id: '', po: '', ma_hang: '', ten_hang: '', dvt: '', so_luong: '', ghi_chu: '', day: 0, sizes: {} };
    if (prev && LOAI[S.loai].po) { l.khach_hang_id = prev.khach_hang_id; l.dvt = prev.dvt; l.day = prev.day || 0; }
    else if (!prev && LOAI[S.loai].po && khId()) setLineKhach(l, khId()); // dòng đầu: theo thanh bên
    return l;
  }
  function emptyForm() {
    return {
      ngay: today(), so_phieu: '', don_vi_giao_id: '', nguoi_giao: '',
      nguoi_nhap: store.get('nk_nguoi_nhap', ''), ghi_chu: '',
      lines: LOAI[S.loai].size ? [emptyLine()] : [emptyLine(), emptyLine(), emptyLine()],
    };
  }
  const draftKey = () => `nk_draft_${S.loai}`;
  let draftTimer = null;
  function saveDraft() {
    if (S.editingId) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set(draftKey(), S.form), 400);
  }

  const dvgOfLoai = () => S.dvg.filter(d => !d.an && (d.muc || []).includes(S.loai));
  const dvgById = id => S.dvg.find(d => d.id === parseInt(id, 10)) || null;
  function khachChoices() {
    const d = dvgById(S.form.don_vi_giao_id);
    const all = C().khach;
    if (d && d.khach_hang_ids && d.khach_hang_ids.length) {
      const list = all.filter(k => d.khach_hang_ids.includes(k.id));
      return list.length ? list : all;
    }
    return all;
  }
  function sizesOfLine(l) {
    const k = C().byId(l.khach_hang_id);
    const days = (k && k.day_size) || [];
    const base = (days[l.day] || days[0] || { sizes: [] }).sizes || [];
    const extra = Object.keys(l.sizes || {}).filter(s => !base.includes(s) && toNum(l.sizes[s]));
    return [...base, ...extra];
  }
  function lineTotal(l) {
    if (LOAI[S.loai].size) return sizesOfLine(l).reduce((a, s) => a + toNum(l.sizes[s]), 0);
    return toNum(l.so_luong);
  }
  const lineHasData = l => lineTotal(l) > 0 || String(l.ten_hang || '').trim() || String(l.po || '').trim();

  /* ============================================================
     KHUNG TAB
     ============================================================ */
  function renderShell() {
    const root = $('nk-root');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
      <header class="ui-page-head">
        <h2>Nhập kho</h2>
        <p>Bấm chọn loại hàng nhập, rồi chọn đơn vị giao, khách hàng, PO. Phiếu đang nhập được tự lưu nháp.</p>
      </header>
      <div class="nk-types" id="nk-types" role="tablist" aria-label="Loại hàng nhập">
        ${Object.entries(LOAI).map(([k, v]) => `
          <button type="button" class="nk-type nk-type-${k}" data-loai="${k}" role="tab">
            <span class="nk-type-icon" aria-hidden="true">${v.icon}</span>
            <span class="nk-type-text"><b>${k}. ${esc(v.ten)}</b><small>${v.po ? 'Theo khách hàng · PO · mã hàng' : 'Theo tên vật tư'}</small></span>
          </button>`).join('')}
      </div>
      <nav class="ui-tabs nk-subs" aria-label="Chức năng nhập kho">
        <button type="button" class="ui-tab nk-sub" data-sub="lap">📝 Lập phiếu nhập</button>
        <button type="button" class="ui-tab nk-sub" data-sub="ds">📋 Danh sách phiếu nhập</button>
        <button type="button" class="ui-tab nk-sub" data-sub="th">📊 Tổng hợp nhập</button>
        <button type="button" class="ui-tab nk-sub" data-sub="dvg">⚙️ Thiết lập đơn vị giao</button>
        <button type="button" class="ui-tab nk-sub" data-sub="vt">⚙️ Danh mục vật tư</button>
      </nav>
      <div id="nk-pane"></div>`;
    root.addEventListener('click', onRootClick);
    root.addEventListener('input', onRootInput);
    root.addEventListener('change', onRootChange);
    root.addEventListener('keydown', onRootKeydown);
  }

  function paintNav() {
    document.querySelectorAll('#nk-types .nk-type').forEach(b => {
      const on = parseInt(b.dataset.loai, 10) === S.loai;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('#nk-root .nk-sub').forEach(b => b.classList.toggle('active', b.dataset.sub === S.sub));
    const root = $('nk-root');
    if (root) root.dataset.loai = S.loai;
  }

  function render() {
    paintNav();
    const pane = $('nk-pane');
    if (!pane) return;
    if (S.sub === 'lap') renderLap(pane);
    if (S.sub === 'ds') renderList(pane);
    if (S.sub === 'th') renderSummary(pane);
    if (S.sub === 'dvg') renderDvg(pane);
    if (S.sub === 'vt') renderVt(pane);
  }

  async function loadMasters() {
    const [d, v] = await Promise.all([api('/api/nhapkho/donvigiao'), api('/api/nhapkho/vattu')]);
    S.dvg = d.data;
    S.vt = v.data;
  }

  async function show() {
    renderShell();
    try {
      if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
      if (!S.loaded) { await loadMasters(); S.loaded = true; }
    } catch (err) {
      toast('Lỗi tải dữ liệu nhập kho: ' + err.message, 'error');
    }
    if (!S.form) openNewForm(true);
    render();
  }

  function setLoai(loai) {
    if (loai === S.loai) return;
    if (S.editingId) {
      if (!confirm('Đang sửa một phiếu nhập. Bỏ thay đổi để chuyển loại hàng?')) return;
      S.editingId = null;
    }
    S.loai = loai;
    store.set('nk_loai', loai);
    S.form = null;
    S.filter.dvg = '';
    if (loai <= 3) S.vtNhom = loai;
    openNewForm(true);
    render();
  }

  /* ============================================================
     LẬP PHIẾU NHẬP
     ============================================================ */
  function openNewForm(useDraft) {
    S.editingId = null;
    const draft = useDraft ? store.get(draftKey(), null) : null;
    S.form = draft && Array.isArray(draft.lines) ? draft : emptyForm();
    if (!S.form.lines.length) S.form.lines.push(emptyLine());
    // Chỉ có 1 đơn vị giao cho loại này -> chọn sẵn
    const ds = dvgOfLoai();
    if (!S.form.don_vi_giao_id && ds.length === 1) applyDvg(ds[0].id);
    refreshSoPhieu();
  }

  async function refreshSoPhieu() {
    if (S.editingId) return;
    const f = S.form, loai = S.loai;
    try {
      const r = await api(`/api/nhapkho/sophieu?loai=${loai}&ngay=${encodeURIComponent(f.ngay || today())}`);
      if (S.form !== f || S.loai !== loai || S.editingId) return; // đã đổi phiếu / loại trong lúc chờ
      f.so_phieu = r.so_phieu;
      const el = $('nk-so');
      if (el) el.value = r.so_phieu;
    } catch (_) { /* giữ số cũ */ }
  }

  function applyDvg(id) {
    S.form.don_vi_giao_id = id ? parseInt(id, 10) : '';
    const choices = khachChoices().map(k => k.id);
    S.form.lines.forEach(l => {
      if (l.khach_hang_id && !choices.includes(parseInt(l.khach_hang_id, 10))) { l.khach_hang_id = ''; l.po = ''; l.ma_hang = ''; }
      if (!l.khach_hang_id && choices.length === 1) setLineKhach(l, choices[0]);
    });
  }

  function setLineKhach(l, khId) {
    const prev = parseInt(l.khach_hang_id, 10) || '';
    l.khach_hang_id = khId ? parseInt(khId, 10) : '';
    if (prev !== l.khach_hang_id) { l.po = ''; l.ma_hang = ''; l.day = 0; }
    const k = C().byId(l.khach_hang_id);
    if (k && LOAI[S.loai].size && (!l.dvt || prev !== l.khach_hang_id)) l.dvt = k.dvt || 'Đôi';
  }

  function dvgOptions(selected, list, placeholder) {
    return `<option value="">${esc(placeholder)}</option>` + list.map(d =>
      `<option value="${d.id}" ${parseInt(selected, 10) === d.id ? 'selected' : ''}>${esc(d.ten)}${d.phan_loai ? ' · ' + esc(PHAN_LOAI[d.phan_loai] || '') : ''}</option>`).join('');
  }

  function renderLap(pane) {
    const L = LOAI[S.loai];
    const f = S.form;
    const ds = dvgOfLoai();
    // Phiếu cũ có thể mang đơn vị đã ẩn / đã bỏ tick
    const cur = dvgById(f.don_vi_giao_id);
    const dsShow = cur && !ds.includes(cur) ? [...ds, cur] : ds;
    pane.innerHTML = `
      ${S.editingId ? `<div class="ui-return-note nk-editing"><span>Đang sửa phiếu <b>${esc(f.so_phieu)}</b>. Bấm <b>Lưu phiếu</b> để cập nhật.</span>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="cancel-edit">Hủy sửa, lập phiếu mới</button></div>` : ''}
      <section class="ui-step">
        <div class="ui-step-num">1</div>
        <div class="ui-step-body">
          <h3 class="ui-step-title">Thông tin phiếu nhập · ${esc(L.dai)}</h3>
          <p class="ui-step-help">${L.po ? 'Chọn <b>đơn vị giao hàng</b> trước. Danh sách khách hàng bên dưới sẽ tự lọc theo đơn vị này.' : 'Đơn vị giao không bắt buộc với loại hàng này.'}</p>
          <div class="ui-fields">
            <label class="ui-field">
              <span class="ui-label">Ngày nhập <b class="ui-req">*</b></span>
              <input type="date" class="ui-input" id="nk-ngay" data-h="ngay" value="${esc(f.ngay)}">
            </label>
            <label class="ui-field">
              <span class="ui-label">Số phiếu nhập</span>
              <input type="text" class="ui-input ui-input-strong" id="nk-so" data-h="so_phieu" value="${esc(f.so_phieu)}" placeholder="Tự tạo">
            </label>
            <label class="ui-field ui-span-2">
              <span class="ui-label">Đơn vị giao hàng ${L.po ? '<b class="ui-req">*</b>' : ''}<span class="ui-label-note">bên giao hàng cho mình</span></span>
              <select class="ui-input" id="nk-dvg">${dvgOptions(f.don_vi_giao_id, dsShow, ds.length ? 'Chọn đơn vị giao' : 'Chưa có đơn vị giao cho loại này')}</select>
            </label>
            ${L.po && !ds.length ? `<div class="ui-span-4 nk-warn">Chưa có đơn vị giao nào được tick mục <b>${S.loai}. ${esc(L.ten)}</b>.
              <button type="button" class="ui-btn ui-btn-ghost" data-act="go-dvg">Mở Thiết lập đơn vị giao</button></div>` : ''}
            <label class="ui-field">
              <span class="ui-label">Người giao</span>
              <input type="text" class="ui-input" data-h="nguoi_giao" value="${esc(f.nguoi_giao)}" placeholder="Tên người giao / tài xế">
            </label>
            <label class="ui-field">
              <span class="ui-label">Người nhập kho</span>
              <input type="text" class="ui-input" data-h="nguoi_nhap" value="${esc(f.nguoi_nhap)}" placeholder="Tên thủ kho">
            </label>
            <label class="ui-field ui-span-2">
              <span class="ui-label">Ghi chú phiếu</span>
              <input type="text" class="ui-input" data-h="ghi_chu" value="${esc(f.ghi_chu)}" placeholder="Số xe, số chứng từ giao hàng...">
            </label>
          </div>
        </div>
      </section>

      <section class="ui-step">
        <div class="ui-step-num">2</div>
        <div class="ui-step-body">
          <div class="ui-step-headrow">
            <div>
              <h3 class="ui-step-title">Hàng nhập</h3>
              <p class="ui-step-help">${L.size ? 'Mỗi dòng: chọn khách hàng, PO, mã hàng rồi nhập số lượng từng size. Enter để sang ô kế tiếp.'
                : L.po ? 'Mỗi dòng: chọn khách hàng, PO, rồi chọn tên vật tư và nhập số lượng.'
                : 'Gõ vài chữ để chọn tên vật tư có sẵn, hoặc gõ tên mới.'}</p>
            </div>
          </div>
          <div id="nk-lines">${f.lines.map((l, i) => lineHtml(l, i)).join('')}</div>
          <div class="nk-add-row">
            <button type="button" class="ui-btn ui-btn-ghost ui-btn-lg" data-act="add-line">＋ Thêm dòng</button>
          </div>
        </div>
      </section>

      <div class="ui-actionbar nk-actionbar">
        <div class="nk-grand">Tổng số lượng: <b id="nk-grand">${fmt0(f.lines.reduce((a, l) => a + lineTotal(l), 0))}</b></div>
        <div class="ui-flex-fill"></div>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="new-form">Phiếu mới</button>
        <button type="button" class="ui-btn ui-btn-ghost" data-act="save-print">Lưu và in</button>
        <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="save">💾 Lưu phiếu</button>
      </div>
      ${datalists()}`;
  }

  function datalists() {
    const L = LOAI[S.loai];
    let html = '';
    if (L.nhomVt) {
      html += `<datalist id="nk-dl-vt">${S.vt.filter(v => v.nhom === L.nhomVt && !v.an)
        .map(v => `<option value="${esc(v.ten)}">${esc(v.dvt)}</option>`).join('')}</datalist>`;
    }
    return html;
  }

  function poDatalist(l, i) {
    const pos = C().poOf(parseInt(l.khach_hang_id, 10) || 0);
    const seen = new Map();
    pos.forEach(p => {
      const key = String(p.po || '').trim();
      if (!key) return;
      const lbl = [p.art, p.mau, p.don_hang ? 'ĐH ' + p.don_hang : ''].filter(Boolean).join(' · ');
      if (!seen.has(key)) seen.set(key, lbl);
    });
    const arts = [...new Set(pos.filter(p => !l.po || String(p.po).trim() === String(l.po).trim()).map(p => String(p.art || '').trim()).filter(Boolean))];
    return `<datalist id="nk-dl-po-${i}">${[...seen].map(([po, lbl]) => `<option value="${esc(po)}">${esc(lbl)}</option>`).join('')}</datalist>
      <datalist id="nk-dl-art-${i}">${arts.map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>`;
  }

  function lineHtml(l, i) {
    const L = LOAI[S.loai];
    const head = `
      <div class="nk-line-head">
        <span class="nk-line-no">Dòng ${i + 1}</span>
        <span class="nk-line-total" data-total="${i}">${lineTotal(l) ? 'Tổng: ' + fmt0(lineTotal(l)) : ''}</span>
        <div class="ui-flex-fill"></div>
        ${L.po ? `<button type="button" class="ui-btn-sm" data-act="dup-line" data-i="${i}" title="Thêm dòng mới cùng khách hàng, PO">⧉ Chép dòng</button>` : ''}
        <button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="del-line" data-i="${i}" title="Xóa dòng này">✕ Xóa</button>
      </div>`;

    if (!L.po) {
      return `<div class="nk-line" data-i="${i}">${head}
        <div class="nk-line-fields nk-cols-simple">
          <label class="ui-field nk-f-wide"><span class="ui-label">Tên vật tư <b class="ui-req">*</b></span>
            <input type="text" class="ui-input" data-f="ten_hang" list="nk-dl-vt" autocomplete="off" value="${esc(l.ten_hang)}" placeholder="Gõ để tìm"></label>
          <label class="ui-field"><span class="ui-label">ĐVT</span>
            <input type="text" class="ui-input" data-f="dvt" value="${esc(l.dvt)}" placeholder="Cái, cuộn, kg..."></label>
          <label class="ui-field"><span class="ui-label">Số lượng <b class="ui-req">*</b></span>
            <input type="text" class="ui-input nk-qty" inputmode="decimal" data-f="so_luong" value="${esc(l.so_luong)}"></label>
          <label class="ui-field nk-f-wide"><span class="ui-label">Ghi chú</span>
            <input type="text" class="ui-input" data-f="ghi_chu" value="${esc(l.ghi_chu)}"></label>
        </div></div>`;
    }

    const khs = khachChoices();
    const kh = C().byId(l.khach_hang_id);
    const khShow = kh && !khs.includes(kh) ? [...khs, kh] : khs;
    const days = (kh && kh.day_size) || [];
    let body = `
      <div class="nk-line-fields nk-cols-po">
        <label class="ui-field"><span class="ui-label">Khách hàng <b class="ui-req">*</b></span>
          <select class="ui-input" data-f="khach_hang_id">
            <option value="">Chọn khách</option>
            ${khShow.map(k => `<option value="${k.id}" ${kh && kh.id === k.id ? 'selected' : ''}>${esc(k.ten_ngan)}</option>`).join('')}
          </select></label>
        <label class="ui-field"><span class="ui-label">PO <b class="ui-req">*</b><span class="ui-label-note">gõ để tìm</span></span>
          <input type="text" class="ui-input" data-f="po" list="nk-dl-po-${i}" autocomplete="off" value="${esc(l.po)}" placeholder="${kh ? 'Chọn PO' : 'Chọn khách trước'}" ${kh ? '' : 'disabled'}></label>
        <label class="ui-field"><span class="ui-label">Mã hàng</span>
          <input type="text" class="ui-input" data-f="ma_hang" list="nk-dl-art-${i}" autocomplete="off" value="${esc(l.ma_hang)}" placeholder="Tự điền theo PO"></label>
        ${L.size ? `
        <label class="ui-field"><span class="ui-label">ĐVT</span>
          <input type="text" class="ui-input" data-f="dvt" value="${esc(l.dvt)}" placeholder="Đôi / Miếng"></label>` : `
        <label class="ui-field"><span class="ui-label">Tên vật tư <b class="ui-req">*</b></span>
          <input type="text" class="ui-input" data-f="ten_hang" list="nk-dl-vt" autocomplete="off" value="${esc(l.ten_hang)}" placeholder="Da, simili, mút..."></label>
        <label class="ui-field"><span class="ui-label">ĐVT</span>
          <input type="text" class="ui-input" data-f="dvt" value="${esc(l.dvt)}" placeholder="m, yard, tấm, cuộn"></label>
        <label class="ui-field"><span class="ui-label">Số lượng <b class="ui-req">*</b></span>
          <input type="text" class="ui-input nk-qty" inputmode="decimal" data-f="so_luong" value="${esc(l.so_luong)}"></label>`}
        <label class="ui-field nk-f-note"><span class="ui-label">Ghi chú</span>
          <input type="text" class="ui-input" data-f="ghi_chu" value="${esc(l.ghi_chu)}"></label>
      </div>`;

    if (L.size) {
      if (!kh) {
        body += `<div class="nk-size-empty">Chọn khách hàng để hiện bảng size.</div>`;
      } else {
        const sizes = sizesOfLine(l);
        body += `
          ${days.length > 1 ? `<div class="nk-days"><span class="ui-hint">Dãy size:</span>${days.map((d, di) =>
            `<button type="button" class="ui-chip ${di === (l.day || 0) ? 'active' : ''}" data-act="day" data-i="${i}" data-day="${di}">${esc(d.ten)}</button>`).join('')}</div>` : ''}
          ${sizes.length ? `<div class="nk-sizes">${sizes.map(s => `
            <label class="nk-size"><span>${esc(s)}</span>
              <input type="text" inputmode="numeric" class="nk-size-in" data-size="${esc(s)}" value="${esc(fmt(toNum(l.sizes[s])))}"></label>`).join('')}
          </div>` : `<div class="nk-size-empty">Khách hàng này chưa khai báo dãy size (tab Danh mục).</div>`}`;
      }
    }
    return `<div class="nk-line" data-i="${i}">${head}${body}${poDatalist(l, i)}</div>`;
  }

  function rerenderLine(i) {
    const el = document.querySelector(`#nk-lines .nk-line[data-i="${i}"]`);
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = lineHtml(S.form.lines[i], i);
    el.replaceWith(tmp.firstElementChild);
  }
  function rerenderLines() {
    const box = $('nk-lines');
    if (box) box.innerHTML = S.form.lines.map((l, i) => lineHtml(l, i)).join('');
    updateTotals();
  }
  function updateTotals() {
    S.form.lines.forEach((l, i) => {
      const el = document.querySelector(`[data-total="${i}"]`);
      if (el) el.textContent = lineTotal(l) ? 'Tổng: ' + fmt0(lineTotal(l)) : '';
    });
    const g = $('nk-grand');
    if (g) g.textContent = fmt0(S.form.lines.reduce((a, l) => a + lineTotal(l), 0));
  }

  function lineIndexOf(el) {
    const box = el.closest('.nk-line');
    return box ? parseInt(box.dataset.i, 10) : -1;
  }

  /* ---------------- Lưu phiếu ---------------- */
  function collect() {
    const L = LOAI[S.loai];
    const f = S.form;
    document.querySelectorAll('#nk-lines .nk-err').forEach(e => e.classList.remove('nk-err'));
    const errs = [];
    const markErr = (i, field) => {
      // Dòng có bảng size: tô đỏ các ô size thay cho ô số lượng
      const sel = field === 'so_luong' && L.size ? '.nk-size-in' : `[data-f="${field}"]`;
      document.querySelectorAll(`#nk-lines .nk-line[data-i="${i}"] ${sel}`).forEach(el => el.classList.add('nk-err'));
    };
    if (L.po && !f.don_vi_giao_id) { errs.push('Chưa chọn đơn vị giao hàng'); $('nk-dvg')?.classList.add('nk-err'); }
    const lines = [];
    f.lines.forEach((l, i) => {
      if (!lineHasData(l)) return;
      if (L.po && !l.khach_hang_id) { errs.push(`Dòng ${i + 1}: chưa chọn khách hàng`); markErr(i, 'khach_hang_id'); }
      if (L.po && !String(l.po || '').trim()) { errs.push(`Dòng ${i + 1}: chưa chọn PO`); markErr(i, 'po'); }
      if (!L.size && !String(l.ten_hang || '').trim()) { errs.push(`Dòng ${i + 1}: chưa nhập tên vật tư`); markErr(i, 'ten_hang'); }
      if (!lineTotal(l)) { errs.push(`Dòng ${i + 1}: chưa nhập số lượng`); markErr(i, 'so_luong'); }
      lines.push({
        khach_hang_id: l.khach_hang_id || null, po: l.po, ma_hang: l.ma_hang, ten_hang: l.ten_hang,
        dvt: l.dvt, so_luong: L.size ? lineTotal(l) : toNum(l.so_luong), ghi_chu: l.ghi_chu,
        sizes: L.size ? sizesOfLine(l).filter(s => toNum(l.sizes[s])).map(s => ({ size: s, so_luong: toNum(l.sizes[s]) })) : [],
      });
    });
    if (!lines.length) errs.push('Phiếu chưa có dòng hàng nào');
    if (!f.ngay) errs.push('Chưa chọn ngày nhập');
    return {
      errs,
      body: {
        loai: S.loai, ngay: f.ngay, so_phieu: f.so_phieu, don_vi_giao_id: f.don_vi_giao_id || null,
        nguoi_giao: f.nguoi_giao, nguoi_nhap: f.nguoi_nhap, ghi_chu: f.ghi_chu, lines,
      },
    };
  }

  let saving = false;
  async function save(andPrint) {
    if (saving) return;
    const { errs, body } = collect();
    if (errs.length) { toast(errs[0] + (errs.length > 1 ? ` (và ${errs.length - 1} lỗi khác)` : ''), 'error'); return; }
    saving = true;
    try {
      const r = S.editingId
        ? await api(`/api/nhapkho/phieu/${S.editingId}`, 'PUT', body)
        : await api('/api/nhapkho/phieu', 'POST', body);
      const id = S.editingId || r.id;
      toast(r.message || 'Đã lưu phiếu nhập', 'success');
      store.set('nk_nguoi_nhap', body.nguoi_nhap || '');
      clearTimeout(draftTimer); // bỏ lượt lưu nháp đang chờ, kẻo ghi lại nháp sau khi đã lưu
      store.del(draftKey());
      if (andPrint) await printPhieu(id);
      openNewForm(false);
      render();
    } catch (err) {
      toast('Không lưu được: ' + err.message, 'error');
    } finally {
      saving = false;
    }
  }

  async function editPhieu(id) {
    try {
      const { data } = await api(`/api/nhapkho/phieu/${id}`);
      S.loai = data.loai;
      store.set('nk_loai', data.loai);
      const L = LOAI[data.loai];
      S.editingId = data.id;
      S.form = {
        ngay: data.ngay, so_phieu: data.so_phieu, don_vi_giao_id: data.don_vi_giao_id || '',
        nguoi_giao: data.nguoi_giao || '', nguoi_nhap: data.nguoi_nhap || '', ghi_chu: data.ghi_chu || '',
        lines: data.lines.map(l => {
          const sizes = {};
          (l.sizes || []).forEach(s => { sizes[s.size] = s.so_luong; });
          const line = {
            khach_hang_id: l.khach_hang_id || '', po: l.po || '', ma_hang: l.ma_hang || '', ten_hang: l.ten_hang || '',
            dvt: l.dvt || '', so_luong: L.size ? '' : fmt(l.so_luong), ghi_chu: l.ghi_chu || '', day: 0, sizes,
          };
          // Chọn đúng dãy size đã dùng
          const k = C().byId(line.khach_hang_id);
          if (k && k.day_size && L.size) {
            const keys = Object.keys(sizes);
            const di = k.day_size.findIndex(d => keys.every(s => (d.sizes || []).includes(s)));
            line.day = di > -1 ? di : 0;
          }
          return line;
        }),
      };
      if (!S.form.lines.length) S.form.lines.push(emptyLine());
      S.sub = 'lap';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast('Không mở được phiếu: ' + err.message, 'error');
    }
  }

  /* ============================================================
     SỰ KIỆN
     ============================================================ */
  function onRootClick(e) {
    const typeBtn = e.target.closest('.nk-type');
    if (typeBtn) { setLoai(parseInt(typeBtn.dataset.loai, 10)); return; }
    const subBtn = e.target.closest('.nk-sub');
    if (subBtn) { S.sub = subBtn.dataset.sub; render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const i = parseInt(b.dataset.i, 10);
    const f = S.form;

    if (act === 'add-line') {
      f.lines.push(emptyLine(f.lines[f.lines.length - 1]));
      rerenderLines(); saveDraft();
      const last = document.querySelector('#nk-lines .nk-line:last-child select, #nk-lines .nk-line:last-child input');
      last?.focus();
    }
    if (act === 'dup-line') {
      const src = f.lines[i];
      const copy = { ...emptyLine(src), po: src.po, ma_hang: src.ma_hang, ten_hang: LOAI[S.loai].size ? '' : src.ten_hang };
      f.lines.splice(i + 1, 0, copy);
      rerenderLines(); saveDraft();
    }
    if (act === 'del-line') {
      const l = f.lines[i];
      if (lineHasData(l) && !confirm(`Xóa dòng ${i + 1}?`)) return;
      f.lines.splice(i, 1);
      if (!f.lines.length) f.lines.push(emptyLine());
      rerenderLines(); saveDraft();
    }
    if (act === 'day') {
      f.lines[i].day = parseInt(b.dataset.day, 10) || 0;
      rerenderLine(i); updateTotals(); saveDraft();
    }
    if (act === 'save') save(false);
    if (act === 'save-print') save(true);
    if (act === 'new-form') {
      if (!S.editingId && f.lines.some(lineHasData) && !confirm('Bỏ phiếu đang nhập dở để lập phiếu mới?')) return;
      store.del(draftKey());
      openNewForm(false); render();
    }
    if (act === 'cancel-edit') { openNewForm(true); render(); }
    if (act === 'go-dvg') { S.sub = 'dvg'; S.editingDvgId = null; render(); }

    // Danh sách / tổng hợp
    if (act === 'filter') { readFilter(); render(); }
    if (act === 'edit-phieu') editPhieu(parseInt(b.dataset.id, 10));
    if (act === 'print-phieu') printPhieu(parseInt(b.dataset.id, 10));
    if (act === 'del-phieu') delPhieu(parseInt(b.dataset.id, 10), b.dataset.so);
    if (act === 'csv') downloadCsv();

    // Đơn vị giao
    if (act === 'dvg-edit') { S.editingDvgId = parseInt(b.dataset.id, 10); renderDvg($('nk-pane')); $('nk-dvg-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (act === 'dvg-new') { S.editingDvgId = null; renderDvg($('nk-pane')); $('nk-dvg-ten')?.focus(); }
    if (act === 'dvg-save') saveDvg();

    // Vật tư
    if (act === 'vt-nhom') { S.vtNhom = parseInt(b.dataset.nhom, 10); renderVt($('nk-pane')); }
    if (act === 'vt-add') addVt();
    if (act === 'vt-paste') pasteVt();
    if (act === 'vt-del') delVt(parseInt(b.dataset.id, 10));
  }

  function onRootInput(e) {
    const t = e.target;
    if (S.sub !== 'lap' || !S.form) return;
    if (t.dataset.h) {
      S.form[t.dataset.h] = t.value;
      saveDraft();
      return;
    }
    const i = lineIndexOf(t);
    if (i < 0) return;
    const l = S.form.lines[i];
    t.classList.remove('nk-err');
    if (t.dataset.size !== undefined) {
      t.closest('.nk-sizes')?.querySelectorAll('.nk-err').forEach(el => el.classList.remove('nk-err'));
      l.sizes[t.dataset.size] = t.value;
    } else if (t.dataset.f && t.tagName !== 'SELECT') {
      l[t.dataset.f] = t.value;
    }
    updateTotals();
    saveDraft();
  }

  function onRootChange(e) {
    const t = e.target;
    if (S.sub !== 'lap' || !S.form) return;
    if (t.id === 'nk-dvg') {
      t.classList.remove('nk-err');
      applyDvg(t.value);
      rerenderLines(); saveDraft();
      return;
    }
    if (t.id === 'nk-ngay') { S.form.ngay = t.value; refreshSoPhieu(); saveDraft(); return; }
    const i = lineIndexOf(t);
    if (i < 0) return;
    const l = S.form.lines[i];
    const fld = t.dataset.f;
    if (fld === 'khach_hang_id') {
      setLineKhach(l, t.value);
      rerenderLine(i); updateTotals(); saveDraft();
      document.querySelector(`#nk-lines .nk-line[data-i="${i}"] [data-f="po"]`)?.focus();
    } else if (fld === 'po') {
      // Chọn PO -> tự điền mã hàng (ART) nếu PO chỉ có 1 mã
      const po = String(t.value || '').trim();
      l.po = po;
      const arts = [...new Set(C().poOf(parseInt(l.khach_hang_id, 10) || 0)
        .filter(p => String(p.po || '').trim() === po).map(p => String(p.art || '').trim()).filter(Boolean))];
      if (arts.length === 1) l.ma_hang = arts[0];
      else if (arts.length > 1 && !arts.includes(l.ma_hang)) l.ma_hang = '';
      // Cập nhật tại chỗ (không vẽ lại dòng để không mất ô người dùng vừa bấm sang)
      const box = t.closest('.nk-line');
      const maEl = box.querySelector('[data-f="ma_hang"]');
      if (maEl) maEl.value = l.ma_hang;
      const dl = document.getElementById(`nk-dl-art-${i}`);
      if (dl) dl.innerHTML = (arts.length ? arts : [...new Set(C().poOf(parseInt(l.khach_hang_id, 10) || 0).map(p => String(p.art || '').trim()).filter(Boolean))])
        .map(a => `<option value="${esc(a)}"></option>`).join('');
      saveDraft();
    } else if (fld === 'ten_hang') {
      const nhom = LOAI[S.loai].nhomVt;
      const v = S.vt.find(x => x.nhom === nhom && x.ten.toLowerCase() === String(t.value).trim().toLowerCase());
      if (v && v.dvt && !l.dvt) {
        l.dvt = v.dvt;
        const d = document.querySelector(`#nk-lines .nk-line[data-i="${i}"] [data-f="dvt"]`);
        if (d) d.value = v.dvt;
      }
    } else if (t.classList.contains('nk-size-in') || t.classList.contains('nk-qty')) {
      const n = toNum(t.value);
      t.value = n ? fmt(n) : '';
    }
  }

  function onRootKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return; // đang gõ Telex
    if (e.key !== 'Enter' || S.sub !== 'lap') return;
    const t = e.target;
    if (t.tagName !== 'INPUT' || t.closest('#nk-lines') === null) return;
    // Enter -> sang ô kế tiếp trong khu nhập hàng (giống Excel)
    const all = Array.from(document.querySelectorAll('#nk-lines input:not([disabled]), #nk-lines select'));
    const idx = all.indexOf(t);
    if (idx < 0) return;
    e.preventDefault();
    t.dispatchEvent(new Event('change', { bubbles: true }));
    // Chuyển ô ngay lập tức (gõ nhanh không bị dồn số vào ô cũ)
    const again = Array.from(document.querySelectorAll('#nk-lines input:not([disabled]), #nk-lines select'));
    const nxt = again[idx + 1];
    if (nxt) { nxt.focus(); if (nxt.select) nxt.select(); }
    else { document.querySelector('[data-act="add-line"]')?.focus(); }
  }

  /* ============================================================
     DANH SÁCH PHIẾU NHẬP & TỔNG HỢP
     ============================================================ */
  function filterBar(withAction) {
    const f = S.filter;
    return `
      <div class="ui-panel nk-filter">
        <label class="ui-field"><span class="ui-label">Từ ngày</span><input type="date" class="ui-input" id="nk-f-tu" value="${esc(f.tu)}"></label>
        <label class="ui-field"><span class="ui-label">Đến ngày</span><input type="date" class="ui-input" id="nk-f-den" value="${esc(f.den)}"></label>
        <label class="ui-field"><span class="ui-label">Đơn vị giao</span>
          <select class="ui-input" id="nk-f-dvg">${dvgOptions(f.dvg, S.dvg.filter(d => (d.muc || []).includes(S.loai) || parseInt(f.dvg, 10) === d.id), 'Tất cả')}</select></label>
        <label class="ui-field nk-f-search"><span class="ui-label">Tìm</span>
          <input type="search" class="ui-input" id="nk-f-q" value="${esc(f.q)}" placeholder="${LOAI[S.loai].po ? 'PO, mã hàng, số phiếu' : 'Tên vật tư, số phiếu'}"></label>
        <div class="nk-filter-btns">
          <button type="button" class="ui-btn ui-btn-primary" data-act="filter">Lọc</button>
          ${withAction || ''}
        </div>
      </div>`;
  }
  function readFilter() {
    S.filter.tu = $('nk-f-tu')?.value || '';
    S.filter.den = $('nk-f-den')?.value || '';
    S.filter.dvg = $('nk-f-dvg')?.value || '';
    S.filter.q = $('nk-f-q')?.value || '';
  }
  function filterQuery() {
    const f = S.filter;
    const p = new URLSearchParams({ loai: S.loai });
    if (f.tu) p.set('tu_ngay', f.tu);
    if (f.den) p.set('den_ngay', f.den);
    if (f.dvg) p.set('don_vi_giao_id', f.dvg);
    if (khId() && LOAI[S.loai].po) p.set('khach_hang_id', khId());
    if (f.q) p.set('q', f.q);
    return p.toString();
  }
  const khName = id => (C().byId(id) || {}).ten_ngan || '';
  const khNote = () => (LOAI[S.loai].po && window.KH ? window.KH.emptyNote() : '');

  async function renderList(pane) {
    pane.innerHTML = filterBar() + `<div class="ui-panel ui-panel-flush"><div class="nk-table-wrap" id="nk-list-box"><div class="nk-empty">Đang tải...</div></div></div>`;
    const box = $('nk-list-box');
    try {
      const { data } = await api('/api/nhapkho/phieu?' + filterQuery());
      if (S.sub !== 'ds') return;
      if (!data.length) { box.innerHTML = `<div class="nk-empty">Chưa có phiếu nhập ${esc(LOAI[S.loai].dai)} nào trong khoảng ngày này.${khNote()}</div>`; return; }
      const L = LOAI[S.loai];
      const total = data.reduce((a, r) => a + (r.tong_sl || 0), 0);
      box.innerHTML = `
        <table class="nk-table">
          <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Đơn vị giao</th><th>${L.po ? 'Khách hàng · PO · Mã hàng' : 'Hàng nhập'}</th><th class="r">Tổng SL</th><th></th></tr></thead>
          <tbody>${data.map(r => {
            const items = L.po
              ? [...new Set(r.dong.map(d => [khName(d.khach_hang_id), d.po, d.ma_hang || d.ten_hang].filter(Boolean).join(' · ')))]
              : [...new Set(r.dong.map(d => d.ten_hang))];
            const shown = items.slice(0, 3).map(esc).join('<br>') + (items.length > 3 ? `<br><span class="ui-muted">+ ${items.length - 3} dòng khác</span>` : '');
            return `<tr>
              <td class="nowrap">${viDate(r.ngay)}</td>
              <td class="nowrap"><b>${esc(r.so_phieu)}</b></td>
              <td>${esc(r.don_vi_giao_ten)}</td>
              <td>${shown}</td>
              <td class="r"><b>${fmt0(r.tong_sl)}</b></td>
              <td class="nowrap nk-row-btns">
                <button type="button" class="ui-btn-sm" data-act="edit-phieu" data-id="${r.id}">Xem / Sửa</button>
                <button type="button" class="ui-btn-sm" data-act="print-phieu" data-id="${r.id}">In</button>
                <button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="del-phieu" data-id="${r.id}" data-so="${esc(r.so_phieu)}">Xóa</button>
              </td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="4">${data.length} phiếu</td><td class="r"><b>${fmt0(total)}</b></td><td></td></tr></tfoot>
        </table>`;
    } catch (err) {
      box.innerHTML = `<div class="nk-empty">Lỗi tải danh sách: ${esc(err.message)}</div>`;
    }
  }

  async function delPhieu(id, so) {
    if (!confirm(`Xóa phiếu nhập ${so}? Thao tác này không hoàn tác được.`)) return;
    try {
      await api(`/api/nhapkho/phieu/${id}`, 'DELETE');
      toast('Đã xóa phiếu ' + so, 'info');
      if (S.editingId === id) openNewForm(true);
      render();
    } catch (err) { toast('Không xóa được: ' + err.message, 'error'); }
  }

  let summaryRows = [];
  async function renderSummary(pane) {
    pane.innerHTML = filterBar(`<button type="button" class="ui-btn ui-btn-ghost" data-act="csv">⬇ Tải file Excel (CSV)</button>`)
      + `<div class="ui-panel ui-panel-flush"><div class="nk-table-wrap" id="nk-sum-box"><div class="nk-empty">Đang tải...</div></div></div>`;
    const box = $('nk-sum-box');
    try {
      const { data } = await api('/api/nhapkho/tonghop?' + filterQuery());
      if (S.sub !== 'th') return;
      summaryRows = data;
      const L = LOAI[S.loai];
      if (!data.length) { box.innerHTML = `<div class="nk-empty">Chưa có số liệu nhập trong khoảng ngày này.${khNote()}</div>`; return; }
      const total = data.reduce((a, r) => a + (r.tong_sl || 0), 0);
      box.innerHTML = `
        <table class="nk-table">
          <thead><tr><th>Đơn vị giao</th>${L.po ? '<th>Khách hàng</th><th>PO</th><th>Mã hàng</th>' : ''}${L.size ? '' : '<th>Tên vật tư</th>'}<th>ĐVT</th><th class="r">Tổng nhập</th><th class="r">Số phiếu</th></tr></thead>
          <tbody>${data.map(r => `<tr>
            <td>${esc(r.don_vi_giao_ten)}</td>
            ${L.po ? `<td>${esc(khName(r.khach_hang_id))}</td><td><b>${esc(r.po)}</b></td><td>${esc(r.ma_hang)}</td>` : ''}
            ${L.size ? '' : `<td>${esc(r.ten_hang)}</td>`}
            <td>${esc(r.dvt)}</td><td class="r"><b>${fmt0(r.tong_sl)}</b></td><td class="r">${r.so_phieu}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="${(L.po ? 4 : 1) + (L.size ? 0 : 1) + 1}">Tổng cộng</td><td class="r"><b>${fmt0(total)}</b></td><td></td></tr></tfoot>
        </table>`;
    } catch (err) {
      box.innerHTML = `<div class="nk-empty">Lỗi tải tổng hợp: ${esc(err.message)}</div>`;
    }
  }

  function downloadCsv() {
    if (!summaryRows.length) { toast('Chưa có số liệu để tải', 'info'); return; }
    const L = LOAI[S.loai];
    const head = ['Đơn vị giao', ...(L.po ? ['Khách hàng', 'PO', 'Mã hàng'] : []), ...(L.size ? [] : ['Tên vật tư']), 'ĐVT', 'Tổng nhập', 'Số phiếu'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(',')].concat(summaryRows.map(r => [
      r.don_vi_giao_ten, ...(L.po ? [khName(r.khach_hang_id), r.po, r.ma_hang] : []), ...(L.size ? [] : [r.ten_hang]), r.dvt, r.tong_sl, r.so_phieu,
    ].map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tong-hop-nhap-${L.ten.replace(/\s+/g, '-')}-${S.filter.tu || ''}-${S.filter.den || ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ============================================================
     THIẾT LẬP ĐƠN VỊ GIAO
     ============================================================ */
  function renderDvg(pane) {
    const d = S.editingDvgId ? dvgById(S.editingDvgId) : null;
    const v = d || { ten: '', phan_loai: 'gia_cong', muc: S.loai >= 3 ? [S.loai] : [S.loai], khach_hang_ids: [], sdt: '', ghi_chu: '', thu_tu: S.dvg.length + 1, an: 0 };
    pane.innerHTML = `
      <div class="ui-panel">
        <h3 class="ui-panel-title">Đơn vị giao hàng</h3>
        <p class="ui-hint nk-mb">Bên xuất hàng cho mình. Tick <b>Giao mục nào</b> để đơn vị hiện trong dropdown của mục đó. <b>Khách hàng liên quan</b> giới hạn danh sách khách khi lập phiếu.</p>
        <div class="nk-table-wrap">
          <table class="nk-table">
            <thead><tr><th>STT</th><th>Tên đơn vị giao</th><th>Phân loại</th><th>Giao mục</th><th>Khách hàng liên quan</th><th>SĐT / Ghi chú</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>${S.dvg.length ? S.dvg.map((x, i) => `<tr class="${x.an ? 'nk-row-off' : ''} ${x.id === S.editingDvgId ? 'nk-row-on' : ''}">
              <td class="c">${i + 1}</td>
              <td><b>${esc(x.ten)}</b></td>
              <td>${esc(PHAN_LOAI[x.phan_loai] || '')}</td>
              <td>${(x.muc || []).sort().map(m => `<span class="nk-tag nk-tag-${m}">${m}. ${esc(LOAI[m]?.ten || '')}</span>`).join(' ')}</td>
              <td>${(x.khach_hang_ids || []).map(id => esc(khName(id))).filter(Boolean).join(', ') || '<span class="ui-muted">Tất cả</span>'}</td>
              <td>${esc([x.sdt, x.ghi_chu].filter(Boolean).join(' · '))}</td>
              <td>${x.an ? '<span class="ui-badge ui-badge-off">Đang ẩn</span>' : '<span class="ui-badge ui-badge-ok">Đang dùng</span>'}</td>
              <td><button type="button" class="ui-btn-sm" data-act="dvg-edit" data-id="${x.id}">Sửa</button></td></tr>`).join('')
              : '<tr><td colspan="8" class="nk-empty">Chưa có đơn vị giao nào.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="ui-panel" id="nk-dvg-form">
        <h3 class="ui-panel-title">${d ? 'Sửa đơn vị giao: ' + esc(d.ten) : 'Thêm đơn vị giao mới'}</h3>
        <div class="ui-fields">
          <label class="ui-field ui-span-2"><span class="ui-label">Tên đơn vị giao <b class="ui-req">*</b></span>
            <input type="text" class="ui-input" id="nk-dvg-ten" value="${esc(v.ten)}" placeholder="Ví dụ: Công ty gia công An Phú"></label>
          <label class="ui-field"><span class="ui-label">Phân loại</span>
            <select class="ui-input" id="nk-dvg-pl">${Object.entries(PHAN_LOAI).map(([k, t]) => `<option value="${k}" ${v.phan_loai === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="ui-field"><span class="ui-label">Thứ tự</span>
            <input type="number" class="ui-input" id="nk-dvg-tt" value="${esc(v.thu_tu)}"></label>
          <div class="ui-field ui-span-4"><span class="ui-label">Giao mục nào <b class="ui-req">*</b></span>
            <div class="cat-checks nk-checks">${Object.entries(LOAI).map(([k, t]) => `
              <label class="cat-check nk-check"><input type="checkbox" class="nk-dvg-muc" value="${k}" ${(v.muc || []).includes(parseInt(k, 10)) ? 'checked' : ''}> ${k}. ${esc(t.dai)}</label>`).join('')}</div></div>
          <div class="ui-field ui-span-4"><span class="ui-label">Khách hàng liên quan <span class="ui-label-note">không tick = tất cả khách hàng</span></span>
            <div class="cat-checks nk-checks">${C().khachAll.map(k => `
              <label class="cat-check nk-check"><input type="checkbox" class="nk-dvg-kh" value="${k.id}" ${(v.khach_hang_ids || []).includes(k.id) ? 'checked' : ''}> ${esc(k.ten_ngan)}${k.an ? ' (ẩn)' : ''}</label>`).join('')}</div></div>
          <label class="ui-field"><span class="ui-label">Số điện thoại</span>
            <input type="text" class="ui-input" id="nk-dvg-sdt" value="${esc(v.sdt)}"></label>
          <label class="ui-field ui-span-2"><span class="ui-label">Ghi chú</span>
            <input type="text" class="ui-input" id="nk-dvg-gc" value="${esc(v.ghi_chu)}"></label>
          <div class="ui-field"><span class="ui-label">&nbsp;</span>
            <label class="cat-check nk-check"><input type="checkbox" id="nk-dvg-an" ${v.an ? 'checked' : ''}> Tạm ẩn đơn vị này</label></div>
        </div>
        <div class="cat-form-actions nk-form-actions">
          <button type="button" class="ui-btn ui-btn-ghost" data-act="dvg-new">Nhập đơn vị mới</button>
          <button type="button" class="ui-btn ui-btn-primary" data-act="dvg-save">Lưu đơn vị giao</button>
        </div>
      </div>`;
  }

  async function saveDvg() {
    const body = {
      ten: $('nk-dvg-ten').value.trim(),
      phan_loai: $('nk-dvg-pl').value,
      thu_tu: parseInt($('nk-dvg-tt').value, 10) || 0,
      muc: Array.from(document.querySelectorAll('.nk-dvg-muc:checked')).map(c => parseInt(c.value, 10)),
      khach_hang_ids: Array.from(document.querySelectorAll('.nk-dvg-kh:checked')).map(c => parseInt(c.value, 10)),
      sdt: $('nk-dvg-sdt').value.trim(),
      ghi_chu: $('nk-dvg-gc').value.trim(),
      an: $('nk-dvg-an').checked,
    };
    if (!body.ten) { toast('Chưa nhập tên đơn vị giao', 'error'); $('nk-dvg-ten').focus(); return; }
    if (!body.muc.length) { toast('Hãy tick ít nhất 1 mục mà đơn vị này giao', 'error'); return; }
    try {
      if (S.editingDvgId) await api(`/api/nhapkho/donvigiao/${S.editingDvgId}`, 'PUT', body);
      else await api('/api/nhapkho/donvigiao', 'POST', body);
      toast('Đã lưu đơn vị giao ' + body.ten, 'success');
      await loadMasters();
      S.editingDvgId = null;
      renderDvg($('nk-pane'));
    } catch (err) { toast('Không lưu được: ' + err.message, 'error'); }
  }

  /* ============================================================
     DANH MỤC VẬT TƯ (loại 1, 2, 3)
     ============================================================ */
  function renderVt(pane) {
    const list = S.vt.filter(v => v.nhom === S.vtNhom);
    pane.innerHTML = `
      <div class="ui-panel">
        <div class="nk-vt-head">
          <h3 class="ui-panel-title">Danh mục vật tư</h3>
          <div class="ui-seg" role="group" aria-label="Nhóm vật tư">
            ${Object.entries(NHOM_VT).map(([k, t]) => `<button type="button" class="ui-seg-btn ${parseInt(k, 10) === S.vtNhom ? 'active' : ''}" data-act="vt-nhom" data-nhom="${k}">${t}</button>`).join('')}
          </div>
        </div>
        <p class="ui-hint nk-mb">Khai báo sẵn tên vật tư để lúc nhập kho chỉ cần gõ vài chữ là chọn được, ĐVT tự điền. Sửa trực tiếp trong bảng, tự lưu khi rời ô.</p>
        <div class="nk-vt-add">
          <input type="text" class="ui-input" id="nk-vt-ten" placeholder="Tên vật tư mới">
          <input type="text" class="ui-input nk-vt-dvt" id="nk-vt-dvt" placeholder="ĐVT">
          <input type="text" class="ui-input" id="nk-vt-gc" placeholder="Ghi chú">
          <button type="button" class="ui-btn ui-btn-primary" data-act="vt-add">＋ Thêm</button>
        </div>
        <details class="nk-paste">
          <summary>Dán nhiều dòng từ Excel (cột Tên · ĐVT · Ghi chú)</summary>
          <textarea class="ui-input" id="nk-vt-paste" rows="4" placeholder="Kéo cắt chỉ&#9;Cái&#10;Kim may DB×1&#9;Hộp"></textarea>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="vt-paste">Thêm các dòng đã dán</button>
        </details>
        <div class="nk-table-wrap">
          <table class="nk-table nk-table-edit">
            <thead><tr><th>STT</th><th>Tên vật tư</th><th>ĐVT</th><th>Ghi chú</th><th>Ẩn</th><th></th></tr></thead>
            <tbody>${list.length ? list.map((v, i) => `<tr data-vt="${v.id}" class="${v.an ? 'nk-row-off' : ''}">
              <td class="c">${i + 1}</td>
              <td><input type="text" class="nk-cell" data-vtf="ten" value="${esc(v.ten)}"></td>
              <td><input type="text" class="nk-cell nk-vt-dvt" data-vtf="dvt" value="${esc(v.dvt)}"></td>
              <td><input type="text" class="nk-cell" data-vtf="ghi_chu" value="${esc(v.ghi_chu)}"></td>
              <td class="c"><input type="checkbox" data-vtf="an" ${v.an ? 'checked' : ''}></td>
              <td class="c"><button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="vt-del" data-id="${v.id}">Xóa</button></td></tr>`).join('')
              : `<tr><td colspan="6" class="nk-empty">Chưa có vật tư nào trong nhóm này.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
    pane.querySelectorAll('tr[data-vt] [data-vtf]').forEach(el => el.addEventListener('change', () => updateVt(el.closest('tr'))));
  }

  async function addVt() {
    const ten = $('nk-vt-ten').value.trim();
    if (!ten) { toast('Chưa nhập tên vật tư', 'error'); $('nk-vt-ten').focus(); return; }
    if (S.vt.some(v => v.nhom === S.vtNhom && v.ten.toLowerCase() === ten.toLowerCase())) { toast('Vật tư này đã có trong danh mục', 'info'); return; }
    try {
      await api('/api/nhapkho/vattu', 'POST', { nhom: S.vtNhom, ten, dvt: $('nk-vt-dvt').value.trim(), ghi_chu: $('nk-vt-gc').value.trim() });
      await loadMasters();
      renderVt($('nk-pane'));
      $('nk-vt-ten').focus();
    } catch (err) { toast('Không thêm được: ' + err.message, 'error'); }
  }

  async function pasteVt() {
    const text = $('nk-vt-paste').value;
    const have = new Set(S.vt.filter(v => v.nhom === S.vtNhom).map(v => v.ten.toLowerCase()));
    const items = text.split(/\r?\n/).map(l => l.split('\t').map(s => s.trim())).filter(c => c[0] && !have.has(c[0].toLowerCase()))
      .map(c => ({ nhom: S.vtNhom, ten: c[0], dvt: c[1] || '', ghi_chu: c[2] || '' }));
    if (!items.length) { toast('Không có dòng mới để thêm', 'info'); return; }
    try {
      const r = await api('/api/nhapkho/vattu', 'POST', { items });
      toast(r.message, 'success');
      await loadMasters();
      renderVt($('nk-pane'));
    } catch (err) { toast('Không thêm được: ' + err.message, 'error'); }
  }

  async function updateVt(tr) {
    const id = parseInt(tr.dataset.vt, 10);
    const get = f => tr.querySelector(`[data-vtf="${f}"]`);
    const body = { nhom: S.vtNhom, ten: get('ten').value.trim(), dvt: get('dvt').value.trim(), ghi_chu: get('ghi_chu').value.trim(), an: get('an').checked };
    if (!body.ten) { toast('Tên vật tư không được để trống', 'error'); return; }
    try {
      await api(`/api/nhapkho/vattu/${id}`, 'PUT', body);
      const v = S.vt.find(x => x.id === id);
      if (v) Object.assign(v, body, { an: body.an ? 1 : 0 });
      tr.classList.toggle('nk-row-off', body.an);
      toast('Đã lưu', 'info');
    } catch (err) { toast('Không lưu được: ' + err.message, 'error'); }
  }

  async function delVt(id) {
    const v = S.vt.find(x => x.id === id);
    if (!v || !confirm(`Xóa "${v.ten}" khỏi danh mục? (Phiếu nhập cũ vẫn giữ tên này)`)) return;
    try {
      await api(`/api/nhapkho/vattu/${id}`, 'DELETE');
      await loadMasters();
      renderVt($('nk-pane'));
    } catch (err) { toast('Không xóa được: ' + err.message, 'error'); }
  }

  /* ============================================================
     IN PHIẾU NHẬP KHO
     ============================================================ */
  async function printPhieu(id) {
    let p;
    try { p = (await api(`/api/nhapkho/phieu/${id}`)).data; } catch (err) { toast('Không tải được phiếu để in: ' + err.message, 'error'); return; }
    const L = LOAI[p.loai];
    const sizes = [];
    if (L.size) p.lines.forEach(l => (l.sizes || []).forEach(s => { if (!sizes.includes(s.size)) sizes.push(s.size); }));
    const manySizes = sizes.length > 14;
    const n = v => (v ? new Intl.NumberFormat('vi-VN').format(v) : '');
    let head = '<th>STT</th>';
    if (L.po) head += '<th>Khách hàng</th><th>PO</th><th>Mã hàng</th>';
    if (!L.size) head += '<th>Tên vật tư</th>';
    head += '<th>ĐVT</th>';
    if (L.size && !manySizes) head += sizes.map(s => `<th class="sz">${esc(s)}</th>`).join('');
    if (L.size && manySizes) head += '<th>Chi tiết size</th>';
    head += `<th>${L.size ? 'Tổng' : 'Số lượng'}</th><th>Ghi chú</th>`;
    const rows = p.lines.map((l, i) => {
      const m = {};
      (l.sizes || []).forEach(s => { m[s.size] = s.so_luong; });
      let r = `<td class="c">${i + 1}</td>`;
      if (L.po) r += `<td>${esc(khName(l.khach_hang_id))}</td><td>${esc(l.po)}</td><td>${esc(l.ma_hang)}</td>`;
      if (!L.size) r += `<td>${esc(l.ten_hang)}</td>`;
      r += `<td class="c">${esc(l.dvt)}</td>`;
      if (L.size && !manySizes) r += sizes.map(s => `<td class="c">${n(m[s])}</td>`).join('');
      if (L.size && manySizes) r += `<td>${(l.sizes || []).map(s => `${esc(s.size)}: ${n(s.so_luong)}`).join('; ')}</td>`;
      r += `<td class="r"><b>${n(l.so_luong)}</b></td><td>${esc(l.ghi_chu)}</td>`;
      return `<tr>${r}</tr>`;
    }).join('');
    const colsBefore = 1 + (L.po ? 3 : 0) + (L.size ? 0 : 1) + 1 + (L.size ? (manySizes ? 1 : sizes.length) : 0);
    const sizeTotals = L.size && !manySizes ? sizes.map(s => p.lines.reduce((a, l) => a + ((l.sizes || []).find(x => x.size === s)?.so_luong || 0), 0)) : [];
    const foot = L.size && !manySizes
      ? `<td colspan="${colsBefore - sizes.length}" class="r"><b>CỘNG</b></td>${sizeTotals.map(t => `<td class="c"><b>${n(t)}</b></td>`).join('')}<td class="r"><b>${n(p.tong_sl)}</b></td><td></td>`
      : `<td colspan="${colsBefore}" class="r"><b>CỘNG</b></td><td class="r"><b>${n(p.tong_sl)}</b></td><td></td>`;
    const landscape = L.size && sizes.length > 8;
    const d = p.ngay || '';
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(p.so_phieu)}</title>
      <style>
        @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 10mm; }
        * { box-sizing: border-box; }
        body { font-family: "Times New Roman", serif; font-size: 13px; color: #000; margin: 0; }
        .top { display: flex; justify-content: space-between; gap: 16px; }
        .co b { font-size: 14px; }
        h1 { text-align: center; font-size: 22px; margin: 14px 0 2px; letter-spacing: 1px; }
        .sub { text-align: center; font-style: italic; margin-bottom: 10px; }
        .info { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 24px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 4px 5px; vertical-align: middle; }
        th { background: #eee; font-weight: bold; text-align: center; }
        th.sz { min-width: 30px; }
        .c { text-align: center; } .r { text-align: right; }
        .sign { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; margin-top: 16px; }
        .sign i { display: block; font-size: 12px; } .sign div { min-height: 90px; }
      </style></head><body>
      <div class="top">
        <div class="co"><b>CÔNG TY TNHH GIA CÔNG THƯƠNG MẠI D&amp;D LONG AN</b><br>A8/21c, Bông Văn Dĩa, Xã Tân Nhựt, TP HCM</div>
        <div style="text-align:right">Số: <b>${esc(p.so_phieu)}</b></div>
      </div>
      <h1>PHIẾU NHẬP KHO</h1>
      <div class="sub">Ngày ${d.slice(8, 10)} tháng ${d.slice(5, 7)} năm ${d.slice(0, 4)}</div>
      <div class="info">
        <div>Loại hàng: <b>${esc(L.dai)}</b></div>
        <div>Đơn vị giao hàng: <b>${esc(p.don_vi_giao_ten)}</b></div>
        <div>Người giao: ${esc(p.nguoi_giao)}</div>
        <div>Người nhập kho: ${esc(p.nguoi_nhap)}</div>
        ${p.ghi_chu ? `<div style="grid-column:1/-1">Ghi chú: ${esc(p.ghi_chu)}</div>` : ''}
      </div>
      <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody><tfoot><tr>${foot}</tr></tfoot></table>
      <div class="sign">
        <div><b>Người lập phiếu</b><i>(Ký, họ tên)</i></div>
        <div><b>Người giao hàng</b><i>(Ký, họ tên)</i></div>
        <div><b>Thủ kho</b><i>(Ký, họ tên)</i></div>
        <div><b>Giám đốc</b><i>(Ký, họ tên)</i></div>
      </div></body></html>`;
    const old = document.getElementById('nk-print-frame');
    if (old) old.remove();
    const fr = document.createElement('iframe');
    fr.id = 'nk-print-frame';
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { toast('Trình duyệt chặn in, hãy thử lại', 'error'); } }, 250);
  }

  /* ============================================================
     KHỞI ĐỘNG
     ============================================================ */
  function init() {
    const btn = document.querySelector('.tab-btn[data-target="tab-nhapkho"]');
    if (btn) btn.addEventListener('click', () => show());
    if (document.getElementById('tab-nhapkho')?.classList.contains('active')) show();
    window.addEventListener('catalog-changed', () => {
      if (document.getElementById('tab-nhapkho')?.classList.contains('active')) render();
    });
    // Thanh bên đổi khách: dòng còn trống của phiếu đang lập lấy khách mới; danh sách / tổng hợp lọc lại
    window.addEventListener('kh-changed', () => {
      if (!S.form || !LOAI[S.loai].po) return;
      const choices = khachChoices().map(k => k.id);
      S.form.lines.forEach(l => {
        const blank = !l.po && !l.ma_hang && !l.ten_hang && !lineTotal(l);
        if (blank && (!khId() || choices.includes(khId()))) setLineKhach(l, khId() || '');
      });
      if (document.getElementById('tab-nhapkho')?.classList.contains('active')) render();
    });
  }
  window.NhapKho = { show, print: printPhieu };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
