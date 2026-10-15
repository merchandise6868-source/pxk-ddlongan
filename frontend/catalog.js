/**
 * DANH MỤC: KHÁCH HÀNG · PO / ĐƠN HÀNG / ĐƠN GIÁ · BỘ CHI TIẾT
 * - window.Catalog: kho dữ liệu dùng chung cho tab Lập phiếu & Dashboard
 * - Giao diện tab "⚙️ Danh mục"
 */
(function () {
  const esc = s => (s === null || s === undefined ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = v => (v ? new Intl.NumberFormat('vi-VN').format(v) : '');
  const toNum = v => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));

  async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Lỗi máy chủ');
    return data;
  }

  /* ============================================================
     KHO DỮ LIỆU DÙNG CHUNG
     ============================================================ */
  const Catalog = {
    khach: [],      // khách hàng đang dùng (không ẩn)
    khachAll: [],   // cả khách hàng đã ẩn
    po: [],
    bo: [],
    bophan: [],
    loaded: false,
    async load() {
      try {
        const [kh, po, bo, bp] = await Promise.all([
          api('/api/khachhang?all=1'), api('/api/po'), api('/api/bochitiet'), api('/api/bophan'),
        ]);
        this.khachAll = kh.data;
        this.khach = kh.data.filter(k => !k.an);
        this.po = po.data;
        this.bo = bo.data;
        this.bophan = bp.data;
        this.loaded = true;
      } catch (err) {
        console.error('Lỗi tải danh mục:', err);
      }
      return this;
    },
    byId(id) {
      id = parseInt(id, 10);
      return this.khachAll.find(k => k.id === id) || null;
    },
    poOf(khId) {
      return khId ? this.po.filter(p => p.khach_hang_id === khId) : this.po;
    },
    boOf(khId) {
      return this.bo.filter(b => b.khach_hang_id === khId);
    },
  };
  window.Catalog = Catalog;

  async function reloadAndNotify() {
    await Catalog.load();
    window.dispatchEvent(new Event('catalog-changed'));
    renderAll();
  }

  /* ============================================================
     GIAO DIỆN TAB DANH MỤC
     ============================================================ */
  let currentSub = 'kh';
  let editingKhId = null;
  let editingBoId = null;
  let poRowsLocal = []; // dòng PO đang hiển thị (gồm cả dòng mới chưa lưu)

  function khOptions(selected, withAll) {
    let html = withAll ? `<option value="">Tất cả khách hàng</option>` : `<option value="">Chọn khách</option>`;
    Catalog.khachAll.forEach(k => {
      html += `<option value="${k.id}" ${parseInt(selected, 10) === k.id ? 'selected' : ''}>${esc(k.ten_ngan)}${k.an ? ' (ẩn)' : ''}</option>`;
    });
    return html;
  }

  function renderAll() {
    const root = document.getElementById('tab-catalog');
    if (!root || !root.classList.contains('active')) return;
    document.querySelectorAll('.cat-sub-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === currentSub));
    document.querySelectorAll('.cat-pane').forEach(p => p.classList.toggle('active', p.id === `cat-pane-${currentSub}`));
    if (currentSub === 'kh') renderKhPane();
    if (currentSub === 'po') renderPoPane();
    if (currentSub === 'bo') renderBoPane();
  }

  /* ---------------- 1. KHÁCH HÀNG ---------------- */
  function daySizeToText(days) {
    return (days || []).map(d => `${d.ten}: ${(d.sizes || []).join(', ')}`).join('\n');
  }
  function textToDaySize(text) {
    return String(text || '').split(/\n/).map(l => l.trim()).filter(Boolean).map((line, i) => {
      let ten = `Dãy ${i + 1}`;
      let rest = line;
      const idx = line.indexOf(':');
      if (idx > -1) { ten = line.slice(0, idx).trim() || ten; rest = line.slice(idx + 1); }
      const sep = /[,;\t]/.test(rest) ? /[,;\t]+/ : /\s+/;
      const sizes = [...new Set(rest.split(sep).map(s => s.trim()).filter(Boolean))];
      return { ten, sizes };
    }).filter(d => d.sizes.length);
  }

  function renderKhPane() {
    const tbody = document.getElementById('cat-kh-tbody');
    tbody.innerHTML = Catalog.khachAll.map((k, i) => `
      <tr class="${k.an ? 'cat-row-hidden' : ''}">
        <td class="c">${i + 1}</td>
        <td><strong>${esc(k.ten_ngan)}</strong><div class="cat-muted">${esc(k.ma)}</div></td>
        <td>${esc(k.ten_day_du)}</td>
        <td>${(k.day_size || []).map(d => `<div><b>${esc(d.ten)}:</b> ${esc(d.sizes.join(', '))}</div>`).join('')}</td>
        <td class="c">${esc((k.bo_phan || []).join(', '))}</td>
        <td>${esc(k.bo_phan_xuat)}</td>
        <td>${esc(k.ly_do_xuat)}</td>
        <td class="c">${esc(k.dvt)}</td>
        <td class="c">${k.co_bo_chi_tiet ? '✔' : ''}</td>
        <td class="c">${k.an ? 'Ẩn' : 'Đang dùng'}</td>
        <td class="c"><button class="btn btn-outline btn-xs" data-edit-kh="${k.id}">Sửa</button></td>
      </tr>`).join('') || `<tr><td colspan="11" class="c cat-muted">Chưa có khách hàng</td></tr>`;

    tbody.querySelectorAll('[data-edit-kh]').forEach(b => b.addEventListener('click', () => fillKhForm(parseInt(b.dataset.editKh, 10))));

    // Checkbox bộ phận
    const box = document.getElementById('cat-kh-bophan');
    const checked = editingKhId ? (Catalog.byId(editingKhId)?.bo_phan || []) : Array.from(box.querySelectorAll('input:checked')).map(i => i.value);
    box.innerHTML = Catalog.bophan.map(bp => `
      <label class="cat-check"><input type="checkbox" value="${esc(bp.ma)}" ${checked.includes(bp.ma) ? 'checked' : ''}> ${esc(bp.ten)} (${esc(bp.ma)})</label>
    `).join('');
  }

  function fillKhForm(id) {
    const k = id ? Catalog.byId(id) : null;
    editingKhId = k ? k.id : null;
    document.getElementById('cat-kh-form-title').textContent = k ? `Sửa khách hàng: ${k.ten_ngan}` : 'Thêm khách hàng mới';
    document.getElementById('cat-kh-ten').value = k?.ten_ngan || '';
    document.getElementById('cat-kh-ma').value = k?.ma || '';
    document.getElementById('cat-kh-ma').disabled = !!k;
    document.getElementById('cat-kh-tendaydu').value = k?.ten_day_du || '';
    document.getElementById('cat-kh-days').value = daySizeToText(k?.day_size);
    document.getElementById('cat-kh-bpxuat').value = k?.bo_phan_xuat || '';
    document.getElementById('cat-kh-lydo').value = k?.ly_do_xuat || '';
    document.getElementById('cat-kh-dvt').value = k?.dvt || 'Đôi';
    document.getElementById('cat-kh-thutu').value = k?.thu_tu ?? (Catalog.khachAll.length + 1);
    document.getElementById('cat-kh-cobo').checked = !!k?.co_bo_chi_tiet;
    document.getElementById('cat-kh-an').checked = !!k?.an;
    document.querySelectorAll('#cat-kh-bophan input').forEach(i => { i.checked = (k?.bo_phan || []).includes(i.value); });
    if (k) document.getElementById('cat-kh-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveKh() {
    const body = {
      ten_ngan: document.getElementById('cat-kh-ten').value.trim(),
      ma: document.getElementById('cat-kh-ma').value.trim(),
      ten_day_du: document.getElementById('cat-kh-tendaydu').value.trim(),
      day_size: textToDaySize(document.getElementById('cat-kh-days').value),
      bo_phan: Array.from(document.querySelectorAll('#cat-kh-bophan input:checked')).map(i => i.value),
      bo_phan_xuat: document.getElementById('cat-kh-bpxuat').value.trim(),
      ly_do_xuat: document.getElementById('cat-kh-lydo').value.trim(),
      dvt: document.getElementById('cat-kh-dvt').value.trim() || 'Đôi',
      thu_tu: document.getElementById('cat-kh-thutu').value,
      co_bo_chi_tiet: document.getElementById('cat-kh-cobo').checked,
      an: document.getElementById('cat-kh-an').checked,
    };
    if (!body.ten_ngan) { toast('Vui lòng nhập Tên khách hàng (tên ngắn trên nút)', 'error'); return; }
    if (!body.day_size.length) { toast('Vui lòng nhập ít nhất 1 dãy size', 'error'); return; }
    try {
      const r = editingKhId
        ? await api(`/api/khachhang/${editingKhId}`, 'PUT', body)
        : await api('/api/khachhang', 'POST', body);
      toast(r.message || 'Đã lưu', 'success');
      editingKhId = null;
      fillKhForm(null);
      await reloadAndNotify();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------------- 2. PO / ĐƠN HÀNG / ĐƠN GIÁ ---------------- */
  function renderPoPane() {
    const filterSel = document.getElementById('cat-po-kh');
    const curKh = filterSel.value;
    filterSel.innerHTML = khOptions(curKh, true);
    const kh = parseInt(filterSel.value, 10) || null;
    const q = document.getElementById('cat-po-search').value.trim().toLowerCase();

    const unsaved = poRowsLocal.filter(r => !r.id);
    poRowsLocal = [...unsaved, ...Catalog.po.filter(p => (!kh || p.khach_hang_id === kh) &&
      (!q || [p.po, p.don_hang, p.art, p.mau, p.ghi_chu].join(' ').toLowerCase().includes(q))).map(p => ({ ...p }))];

    const tbody = document.getElementById('cat-po-tbody');
    tbody.innerHTML = poRowsLocal.map((p, i) => `
      <tr data-idx="${i}" class="${p.id ? '' : 'cat-row-new'}">
        <td class="c">${i + 1}</td>
        <td><select class="cat-cell" data-f="khach_hang_id">${khOptions(p.khach_hang_id, false)}</select></td>
        <td><input class="cat-cell" data-f="po" value="${esc(p.po)}"></td>
        <td><input class="cat-cell" data-f="don_hang" value="${esc(p.don_hang)}"></td>
        <td><input class="cat-cell" data-f="art" value="${esc(p.art)}"></td>
        <td><input class="cat-cell" data-f="mau" value="${esc(p.mau)}"></td>
        <td><input class="cat-cell r" data-f="don_gia" value="${fmt(p.don_gia)}"></td>
        <td><input class="cat-cell" data-f="ghi_chu" value="${esc(p.ghi_chu)}"></td>
        <td class="c"><button class="btn btn-danger btn-xs" data-del-po="${i}">Xóa</button></td>
      </tr>`).join('') || `<tr><td colspan="9" class="c cat-muted">Chưa có PO nào. Bấm "Thêm dòng" hoặc dán từ Excel.</td></tr>`;

    document.getElementById('cat-po-count').textContent = `${poRowsLocal.filter(r => r.id).length} dòng`;

    tbody.querySelectorAll('.cat-cell').forEach(el => el.addEventListener('change', onPoCellChange));
    tbody.querySelectorAll('[data-del-po]').forEach(b => b.addEventListener('click', () => deletePo(parseInt(b.dataset.delPo, 10))));
  }

  async function onPoCellChange(e) {
    const tr = e.target.closest('tr');
    const row = poRowsLocal[parseInt(tr.dataset.idx, 10)];
    const f = e.target.dataset.f;
    row[f] = f === 'don_gia' ? toNum(e.target.value) : (f === 'khach_hang_id' ? (parseInt(e.target.value, 10) || null) : e.target.value.trim());
    if (f === 'don_gia') e.target.value = fmt(row.don_gia);
    try {
      if (row.id) {
        await api(`/api/po/${row.id}`, 'PUT', row);
      } else if (row.po || row.art || row.don_hang) {
        const r = await api('/api/po', 'POST', row);
        row.id = r.ids[0];
        tr.classList.remove('cat-row-new');
      } else {
        return;
      }
      tr.classList.add('cat-row-saved');
      setTimeout(() => tr.classList.remove('cat-row-saved'), 700);
      await Catalog.load();
      window.dispatchEvent(new Event('catalog-changed'));
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deletePo(idx) {
    const row = poRowsLocal[idx];
    if (row.id) {
      if (!confirm(`Xóa PO ${row.po || ''} / ${row.art || ''}?`)) return;
      try { await api(`/api/po/${row.id}`, 'DELETE'); } catch (err) { toast(err.message, 'error'); return; }
    }
    poRowsLocal.splice(idx, 1);
    await reloadAndNotify();
  }

  function addPoRow() {
    const kh = parseInt(document.getElementById('cat-po-kh').value, 10) || null;
    poRowsLocal.unshift({ id: null, khach_hang_id: kh, po: '', don_hang: '', art: '', mau: '', don_gia: 0, ghi_chu: '' });
    renderPoPane();
    const first = document.querySelector('#cat-po-tbody tr[data-idx="0"] [data-f="po"]');
    if (first) first.focus();
  }

  async function importPoFromExcel() {
    const kh = parseInt(document.getElementById('cat-po-kh').value, 10) || null;
    if (!kh) { toast('Chọn khách hàng ở ô lọc trước khi dán từ Excel', 'error'); return; }
    const text = document.getElementById('cat-po-paste').value;
    const items = text.split(/\r?\n/).filter(l => l.trim()).map(l => {
      const c = l.split('\t');
      return { khach_hang_id: kh, po: c[0], don_hang: c[1], art: c[2], mau: c[3], don_gia: toNum(c[4]), ghi_chu: c[5] };
    }).filter(it => (it.po || '').trim() || (it.art || '').trim());
    if (!items.length) { toast('Không có dòng hợp lệ để nhập', 'error'); return; }
    try {
      const r = await api('/api/po', 'POST', { items });
      toast(r.message, 'success');
      document.getElementById('cat-po-paste').value = '';
      await reloadAndNotify();
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ---------------- 3. BỘ CHI TIẾT ---------------- */
  function chiTietToText(list) {
    return (list || []).map(c => `${c.ten} | ${c.he_so || 2} | ${c.dvt || 'Miếng'}`).join('\n');
  }
  function textToChiTiet(text) {
    return String(text || '').split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split(/\s*[|\t]\s*/);
      return { ten: p[0], he_so: toNum(p[1]) || 2, dvt: (p[2] || 'Miếng').trim() };
    });
  }

  function renderBoPane() {
    const filterSel = document.getElementById('cat-bo-kh');
    const cur = filterSel.value || (Catalog.khachAll.find(k => k.co_bo_chi_tiet)?.id ?? '');
    filterSel.innerHTML = khOptions(cur, true);
    const kh = parseInt(filterSel.value, 10) || null;
    const formKh = document.getElementById('cat-bo-form-kh');
    formKh.innerHTML = khOptions(editingBoId ? Catalog.bo.find(b => b.id === editingBoId)?.khach_hang_id : kh, false);

    const list = Catalog.bo.filter(b => !kh || b.khach_hang_id === kh);
    const wrap = document.getElementById('cat-bo-list');
    wrap.innerHTML = list.map(b => `
      <div class="cat-bo-card">
        <div class="cat-bo-head">
          <div><strong>${esc(b.ten_bo)}</strong> <span class="cat-muted">ART ${esc(b.art) || 'chưa có'}, khách ${esc(Catalog.byId(b.khach_hang_id)?.ten_ngan || '')}</span></div>
          <div>
            <button class="btn btn-outline btn-xs" data-edit-bo="${b.id}">Sửa</button>
            <button class="btn btn-danger btn-xs" data-del-bo="${b.id}">Xóa</button>
          </div>
        </div>
        <table class="cat-mini">
          <tr><th>#</th><th>Chi tiết</th><th>Miếng/đôi</th><th>ĐVT</th></tr>
          ${(b.chi_tiet || []).map((c, i) => `<tr><td class="c">${i + 1}</td><td>${esc(c.ten)}</td><td class="c">${c.he_so || 2}</td><td class="c">${esc(c.dvt || 'Miếng')}</td></tr>`).join('')}
        </table>
      </div>`).join('') || `<div class="cat-muted" style="padding: 16px;">Chưa có bộ chi tiết nào cho khách hàng này.</div>`;

    wrap.querySelectorAll('[data-edit-bo]').forEach(btn => btn.addEventListener('click', () => fillBoForm(parseInt(btn.dataset.editBo, 10))));
    wrap.querySelectorAll('[data-del-bo]').forEach(btn => btn.addEventListener('click', () => deleteBo(parseInt(btn.dataset.delBo, 10))));
  }

  function fillBoForm(id) {
    const b = id ? Catalog.bo.find(x => x.id === id) : null;
    editingBoId = b ? b.id : null;
    document.getElementById('cat-bo-form-title').textContent = b ? `Sửa bộ: ${b.ten_bo}` : 'Thêm bộ chi tiết mới';
    document.getElementById('cat-bo-ten').value = b?.ten_bo || '';
    document.getElementById('cat-bo-art').value = b?.art || '';
    document.getElementById('cat-bo-ct').value = chiTietToText(b?.chi_tiet);
    const formKh = document.getElementById('cat-bo-form-kh');
    formKh.innerHTML = khOptions(b ? b.khach_hang_id : (parseInt(document.getElementById('cat-bo-kh').value, 10) || ''), false);
  }

  async function saveBo() {
    const body = {
      khach_hang_id: parseInt(document.getElementById('cat-bo-form-kh').value, 10) || null,
      ten_bo: document.getElementById('cat-bo-ten').value.trim(),
      art: document.getElementById('cat-bo-art').value.trim(),
      chi_tiet: textToChiTiet(document.getElementById('cat-bo-ct').value),
    };
    if (!body.khach_hang_id) { toast('Chọn khách hàng cho bộ chi tiết', 'error'); return; }
    if (!body.ten_bo) { toast('Nhập tên bộ', 'error'); return; }
    if (!body.chi_tiet.length) { toast('Nhập ít nhất 1 chi tiết', 'error'); return; }
    try {
      const r = editingBoId ? await api(`/api/bochitiet/${editingBoId}`, 'PUT', body) : await api('/api/bochitiet', 'POST', body);
      toast(r.message || 'Đã lưu', 'success');
      fillBoForm(null);
      await reloadAndNotify();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteBo(id) {
    const b = Catalog.bo.find(x => x.id === id);
    if (!b || !confirm(`Xóa bộ chi tiết ${b.ten_bo}?`)) return;
    try { await api(`/api/bochitiet/${id}`, 'DELETE'); await reloadAndNotify(); } catch (err) { toast(err.message, 'error'); }
  }

  /* ---------------- KHỞI TẠO ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.cat-sub-btn').forEach(b => b.addEventListener('click', () => { currentSub = b.dataset.sub; renderAll(); }));
    document.getElementById('cat-kh-save')?.addEventListener('click', saveKh);
    document.getElementById('cat-kh-new')?.addEventListener('click', () => fillKhForm(null));
    document.getElementById('cat-po-kh')?.addEventListener('change', renderPoPane);
    document.getElementById('cat-po-search')?.addEventListener('input', renderPoPane);
    document.getElementById('cat-po-add')?.addEventListener('click', addPoRow);
    document.getElementById('cat-po-import')?.addEventListener('click', importPoFromExcel);
    document.getElementById('cat-bo-kh')?.addEventListener('change', renderBoPane);
    document.getElementById('cat-bo-save')?.addEventListener('click', saveBo);
    document.getElementById('cat-bo-new')?.addEventListener('click', () => fillBoForm(null));

    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.target === 'tab-catalog') Catalog.load().then(() => {
        if (!editingKhId && !document.getElementById('cat-kh-ten').value) fillKhForm(null);
        if (!editingBoId && !document.getElementById('cat-bo-ten').value) fillBoForm(null);
        renderAll();
      });
    }));
  });
})();
