/**
 * TAB TÀI KHOẢN (chỉ quản trị): tài khoản đăng nhập + nhóm quyền (tick tab nhóm được thấy)
 */
(function () {
  const { esc, api, toast, $ } = window.U;
  const S = { tk: [], nhom: [], tabs: [], me: null, editTk: null, editNhom: null, loaded: false };
  const tabLabel = t => document.querySelector(`.tab-btn[data-target="${t}"]`)?.textContent.trim() || t;
  const dt = ms => (ms ? new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const boPhan = () => (window.Catalog && window.Catalog.bophan) || [];
  const toName = ma => (ma ? (boPhan().find(b => b.ma === ma)?.ten || ma) : '');

  async function load() {
    const [a, b] = await Promise.all([api('/api/taikhoan'), api('/api/nhomquyen')]);
    S.tk = a.data; S.me = a.me; S.nhom = b.data; S.tabs = b.tabs;
  }

  function render() {
    const root = $('tk-root');
    if (!root) return;
    const t = S.editTk ? S.tk.find(x => x.id === S.editTk) : null;
    const n = S.editNhom ? S.nhom.find(x => x.id === S.editNhom) : null;
    root.innerHTML = `
      <header class="ui-page-head"><h2>Tài khoản & phân quyền</h2>
        <p>Mỗi tài khoản thuộc 1 nhóm quyền. Nhóm được tick tab nào thì người trong nhóm chỉ thấy các tab đó.</p></header>

      <div class="ui-panel">
        <h3 class="ui-panel-title">Tài khoản đăng nhập</h3>
        <div class="v3-table-wrap"><table class="v3-table">
          <thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Nhóm quyền</th><th>Tổ</th><th>Trạng thái</th><th>Đăng nhập lần cuối</th><th></th></tr></thead>
          <tbody>${S.tk.map(x => `<tr class="${x.id === S.editTk ? 'v3-row-on' : ''} ${x.khoa ? 'v3-row-off' : ''}">
            <td><b>${esc(x.ten_dang_nhap)}</b>${x.id === S.me ? ' <span class="ui-badge">bạn</span>' : ''}</td>
            <td>${esc(x.ho_ten)}</td>
            <td>${esc(x.nhom_ten || '—')}${x.la_admin ? ' <span class="ui-badge ui-badge-ok">Quản trị</span>' : ''}</td>
            <td>${x.ma_bo_phan ? `<span class="v3-chip">${esc(toName(x.ma_bo_phan))}</span>` : '<span class="ui-muted">—</span>'}</td>
            <td>${x.khoa ? '<span class="ui-badge ui-badge-off">Đã khóa</span>' : x.tam_khoa ? '<span class="ui-badge ui-badge-warn">Tạm khóa (sai mật khẩu)</span>' : '<span class="ui-badge ui-badge-ok">Đang dùng</span>'}</td>
            <td>${dt(x.dang_nhap_cuoi)}</td>
            <td><button type="button" class="ui-btn-sm" data-act="tk-edit" data-id="${x.id}">Sửa</button></td></tr>`).join('')}</tbody>
        </table></div>
      </div>

      <div class="ui-panel" id="tk-form">
        <h3 class="ui-panel-title">${t ? 'Sửa tài khoản: ' + esc(t.ten_dang_nhap) : 'Tạo tài khoản mới'}</h3>
        <div class="ui-fields">
          <label class="ui-field"><span class="ui-label">Tên đăng nhập <b class="ui-req">*</b></span>
            <input type="text" class="ui-input" id="tk-u" value="${esc(t?.ten_dang_nhap || '')}" ${t ? 'disabled' : ''} autocapitalize="none" spellcheck="false" placeholder="vd: kho.lan"></label>
          <label class="ui-field"><span class="ui-label">Họ tên</span>
            <input type="text" class="ui-input" id="tk-n" value="${esc(t?.ho_ten || '')}"></label>
          <label class="ui-field"><span class="ui-label">Nhóm quyền <b class="ui-req">*</b></span>
            <select class="ui-input" id="tk-g"><option value="">Chọn nhóm</option>${S.nhom.map(g =>
              `<option value="${g.id}" ${t?.nhom_id === g.id ? 'selected' : ''}>${esc(g.ten)}</option>`).join('')}</select></label>
          <label class="ui-field"><span class="ui-label">Tổ <span class="ui-label-note">tổ may chỉ nhập cho tổ mình</span></span>
            <select class="ui-input" id="tk-bp"><option value="">Không gắn tổ</option>${boPhan().map(b =>
              `<option value="${esc(b.ma)}" ${t?.ma_bo_phan === b.ma ? 'selected' : ''}>${esc(b.ten)} (${esc(b.ma)})</option>`).join('')}</select></label>
          <label class="ui-field"><span class="ui-label">${t ? 'Đặt lại mật khẩu <span class="ui-label-note">để trống = giữ nguyên</span>' : 'Mật khẩu <b class="ui-req">*</b>'}</span>
            <input type="text" class="ui-input" id="tk-p" autocomplete="new-password" spellcheck="false" placeholder="ít nhất 6 ký tự"></label>
          ${t ? `<div class="ui-field ui-span-4"><label class="v3-check"><input type="checkbox" id="tk-khoa" ${t.khoa ? 'checked' : ''}> Khóa tài khoản này (không đăng nhập được)</label></div>` : ''}
        </div>
        <div class="v3-actions">
          ${t ? `<button type="button" class="ui-btn ui-btn-ghost" data-act="tk-new">Tạo tài khoản mới</button>
            ${t.tam_khoa ? `<button type="button" class="ui-btn ui-btn-ghost" data-act="tk-unlock">Mở tạm khóa</button>` : ''}
            ${t.id !== S.me ? `<button type="button" class="ui-btn ui-btn-ghost v3-danger" data-act="tk-del">Xóa tài khoản</button>` : ''}` : ''}
          <div class="ui-flex-fill"></div>
          <button type="button" class="ui-btn ui-btn-primary" data-act="tk-save">${t ? 'Lưu tài khoản' : 'Tạo tài khoản'}</button>
        </div>
      </div>

      <div class="ui-panel">
        <h3 class="ui-panel-title">Nhóm quyền</h3>
        <div class="v3-table-wrap"><table class="v3-table">
          <thead><tr><th>Nhóm</th><th>Được thấy các tab</th><th class="r">Số tài khoản</th><th></th></tr></thead>
          <tbody>${S.nhom.map(g => `<tr class="${g.id === S.editNhom ? 'v3-row-on' : ''}">
            <td><b>${esc(g.ten)}</b></td>
            <td>${g.la_admin ? '<span class="ui-badge ui-badge-ok">Quản trị – thấy tất cả, kể cả tab Tài khoản</span>'
              : g.tabs.map(x => `<span class="v3-chip">${esc(tabLabel(x))}</span>`).join(' ') || '<span class="ui-muted">Chưa tick tab nào</span>'}</td>
            <td class="r">${g.so_tk}</td>
            <td><button type="button" class="ui-btn-sm" data-act="g-edit" data-id="${g.id}">Sửa</button></td></tr>`).join('')}</tbody>
        </table></div>
      </div>

      <div class="ui-panel" id="g-form">
        <h3 class="ui-panel-title">${n ? 'Sửa nhóm: ' + esc(n.ten) : 'Thêm nhóm quyền'}</h3>
        <div class="ui-fields">
          <label class="ui-field ui-span-2"><span class="ui-label">Tên nhóm <b class="ui-req">*</b></span>
            <input type="text" class="ui-input" id="g-ten" value="${esc(n?.ten || '')}" placeholder="vd: Tổ trưởng chuyền"></label>
          <div class="ui-field ui-span-4"><span class="ui-label">Được thấy các tab</span>
            <div class="v3-checks">${S.tabs.map(x => `<label class="v3-check"><input type="checkbox" class="g-tab" value="${x}" ${n?.tabs.includes(x) ? 'checked' : ''}> ${esc(tabLabel(x))}</label>`).join('')}</div></div>
          <div class="ui-field ui-span-4"><label class="v3-check"><input type="checkbox" id="g-admin" ${n?.la_admin ? 'checked' : ''}> <b>Quản trị</b> – thấy tất cả tab và quản lý tài khoản</label></div>
        </div>
        <div class="v3-actions">
          ${n ? `<button type="button" class="ui-btn ui-btn-ghost" data-act="g-new">Thêm nhóm mới</button>
            <button type="button" class="ui-btn ui-btn-ghost v3-danger" data-act="g-del">Xóa nhóm</button>` : ''}
          <div class="ui-flex-fill"></div>
          <button type="button" class="ui-btn ui-btn-primary" data-act="g-save">${n ? 'Lưu nhóm' : 'Thêm nhóm'}</button>
        </div>
      </div>`;
  }

  async function reload() { await load(); render(); }

  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = parseInt(b.dataset.id, 10);
    try {
      if (act === 'tk-edit') { S.editTk = id; render(); $('tk-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      if (act === 'tk-new') { S.editTk = null; render(); $('tk-u').focus(); }
      if (act === 'g-edit') { S.editNhom = id; render(); $('g-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      if (act === 'g-new') { S.editNhom = null; render(); $('g-ten').focus(); }
      if (act === 'tk-save') {
        const body = { ten_dang_nhap: $('tk-u').value.trim(), ho_ten: $('tk-n').value.trim(), nhom_id: parseInt($('tk-g').value, 10) || null,
          ma_bo_phan: $('tk-bp').value, mat_khau: $('tk-p').value };
        if (S.editTk) {
          body.khoa = $('tk-khoa').checked;
          if (!body.mat_khau) delete body.mat_khau;
          await api(`/api/taikhoan/${S.editTk}`, 'PUT', body);
        } else {
          await api('/api/taikhoan', 'POST', body);
        }
        toast('Đã lưu tài khoản', 'success');
        S.editTk = null; await reload();
      }
      if (act === 'tk-unlock') {
        const t = S.tk.find(x => x.id === S.editTk);
        await api(`/api/taikhoan/${t.id}`, 'PUT', { ho_ten: t.ho_ten, nhom_id: t.nhom_id, khoa: t.khoa, mo_khoa: 1 });
        toast('Đã mở tạm khóa', 'success'); await reload();
      }
      if (act === 'tk-del') {
        const t = S.tk.find(x => x.id === S.editTk);
        if (!confirm(`Xóa tài khoản ${t.ten_dang_nhap}?`)) return;
        await api(`/api/taikhoan/${t.id}`, 'DELETE');
        toast('Đã xóa tài khoản', 'info'); S.editTk = null; await reload();
      }
      if (act === 'g-save') {
        const body = { ten: $('g-ten').value.trim(), la_admin: $('g-admin').checked,
          tabs: Array.from(document.querySelectorAll('#tk-root .g-tab:checked')).map(c => c.value) };
        if (S.editNhom) await api(`/api/nhomquyen/${S.editNhom}`, 'PUT', body);
        else await api('/api/nhomquyen', 'POST', body);
        toast('Đã lưu nhóm quyền', 'success'); S.editNhom = null; await reload();
      }
      if (act === 'g-del') {
        const g = S.nhom.find(x => x.id === S.editNhom);
        if (!confirm(`Xóa nhóm ${g.ten}?`)) return;
        await api(`/api/nhomquyen/${g.id}`, 'DELETE');
        toast('Đã xóa nhóm', 'info'); S.editNhom = null; await reload();
      }
    } catch (err) { toast(err.message, 'error'); }
  }

  async function show() {
    await window.AuthReady;
    const root = $('tk-root');
    if (!root) return;
    if (!root.dataset.ready) { root.dataset.ready = '1'; root.addEventListener('click', onClick); }
    try { await reload(); } catch (err) { toast('Lỗi tải tài khoản: ' + err.message, 'error'); }
  }

  function init() {
    document.querySelector('.tab-btn[data-target="tab-taikhoan"]')?.addEventListener('click', show);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
