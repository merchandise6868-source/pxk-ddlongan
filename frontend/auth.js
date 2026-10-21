/**
 * ĐĂNG NHẬP - nạp TRƯỚC app.js
 * - window.AuthReady: Promise xong khi đã đăng nhập (các tab chờ cái này rồi mới tải dữ liệu)
 * - window.Auth.can('tab-...'): tài khoản có được dùng tab đó không
 * - Ẩn tab không được phép, chặn bấm tab bị cấm, gặp lỗi 401 thì hiện lại màn hình đăng nhập
 */
(function () {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const Auth = {
    user: null,
    can(tab) { return !!this.user && (this.user.la_admin || this.user.tabs.includes(tab)); },
  };
  window.Auth = Auth;
  let resolveReady;
  window.AuthReady = new Promise(r => { resolveReady = r; });
  document.documentElement.classList.add('auth-pending');

  // Gặp 401 ở bất kỳ API nào -> hiện màn hình đăng nhập (phiên hết hạn / bị khóa)
  const rawFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await rawFetch(...args);
    const url = String(args[0] && args[0].url ? args[0].url : args[0]);
    if (res.status === 401 && url.includes('/api/') && !url.includes('/api/auth/') && Auth.user) {
      Auth.user = null;
      showLogin('Phiên đăng nhập đã hết. Hãy đăng nhập lại.');
    }
    return res;
  };

  async function call(path, body) {
    const res = await rawFetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch (_) { data = { success: false, error: 'Máy chủ không phản hồi đúng' }; }
    return data;
  }

  // Chặn bấm tab không được phép (cả khi trang tự bấm qua đường dẫn ?tab=)
  document.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('.tab-btn');
    if (btn && !Auth.can(btn.dataset.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  const domReady = () => new Promise(r => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0));
    else setTimeout(r, 0);
  });

  /* ---------------- Áp quyền lên giao diện ---------------- */
  let lastId = null;
  async function apply(user, first) {
    // Phiên hết hạn rồi đăng nhập bằng tài khoản khác -> tải lại trang cho sạch dữ liệu
    if (!first && lastId !== null && lastId !== user.id) { location.reload(); return; }
    lastId = user.id;
    Auth.user = user;
    await domReady();
    const btns = Array.from(document.querySelectorAll('.nav-tabs .tab-btn'));
    btns.forEach(b => { b.hidden = !Auth.can(b.dataset.target); });
    document.documentElement.classList.remove('auth-pending');
    renderUserBox();
    hideOverlay();
    if (first) {
      const allowed = btns.filter(b => !b.hidden);
      if (!allowed.length) {
        showMessage('Tài khoản chưa được cấp tab nào. Hãy báo quản trị.');
        return;
      }
      allowed[0].click();
      resolveReady(user);
    }
  }

  function renderUserBox() {
    const header = document.querySelector('.app-header');
    if (!header || !Auth.user) return;
    let box = document.getElementById('auth-user');
    if (!box) {
      box = document.createElement('div');
      box.id = 'auth-user';
      box.className = 'auth-user';
      header.insertBefore(box, header.querySelector('.nav-tabs'));
      box.addEventListener('click', e => {
        const act = e.target.closest('[data-auth]')?.dataset.auth;
        if (act === 'logout') logout();
        if (act === 'password') showPasswordDialog();
      });
    }
    box.innerHTML = `
      <span class="auth-user-name" title="${esc(Auth.user.nhom_ten)}">👤 <b>${esc(Auth.user.ho_ten)}</b><small>${esc(Auth.user.nhom_ten)}</small></span>
      <button type="button" class="auth-link" data-auth="password">Đổi mật khẩu</button>
      <button type="button" class="auth-link" data-auth="logout">Đăng xuất</button>`;
  }

  async function logout() {
    if (!confirm('Đăng xuất khỏi máy này?')) return;
    await call('/api/auth/logout', {});
    location.reload();
  }

  /* ---------------- Màn hình đăng nhập / khởi tạo ---------------- */
  function overlay() {
    let ov = document.getElementById('auth-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'auth-overlay';
      ov.className = 'auth-overlay';
      document.body.appendChild(ov);
      ov.addEventListener('keydown', e => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); ov.querySelector('[data-auth-submit]')?.click(); }
      });
      ov.addEventListener('click', e => {
        const t = e.target.closest('[data-auth-eye]');
        if (t) { const inp = ov.querySelector(`#${t.dataset.authEye}`); inp.type = inp.type === 'password' ? 'text' : 'password'; }
      });
    }
    ov.hidden = false;
    return ov;
  }
  function hideOverlay() { const ov = document.getElementById('auth-overlay'); if (ov) ov.hidden = true; }
  const head = sub => `
    <div class="auth-brand"><div class="auth-logo">D&amp;D</div>
      <div><b>D&amp;D LONG AN</b><small>Phiếu xuất kho · Đơn hàng · Chỉ lệnh</small></div></div>
    <h2>${sub}</h2>`;
  const pwField = (id, label, auto) => `
    <label class="auth-field"><span>${label}</span>
      <span class="auth-pw"><input type="password" id="${id}" class="auth-input" autocomplete="${auto}">
      <button type="button" class="auth-eye" data-auth-eye="${id}" aria-label="Hiện mật khẩu">👁</button></span></label>`;

  function showMessage(msg) {
    const ov = overlay();
    ov.innerHTML = `<div class="auth-card">${head('Không có quyền')}<p class="auth-msg">${esc(msg)}</p>
      <button type="button" class="auth-submit" data-auth-submit onclick="fetch('/api/auth/logout',{method:'POST'}).then(()=>location.reload())">Đăng nhập tài khoản khác</button></div>`;
  }

  function showLogin(msg) {
    const ov = overlay();
    ov.innerHTML = `
      <form class="auth-card" onsubmit="return false" autocomplete="on">
        ${head('Đăng nhập')}
        ${msg ? `<p class="auth-msg">${esc(msg)}</p>` : ''}
        <label class="auth-field"><span>Tên đăng nhập</span>
          <input type="text" id="auth-u" class="auth-input" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        ${pwField('auth-p', 'Mật khẩu', 'current-password')}
        <p class="auth-err" id="auth-err" role="alert"></p>
        <button type="button" class="auth-submit" data-auth-submit>Đăng nhập</button>
      </form>`;
    const u = ov.querySelector('#auth-u');
    setTimeout(() => u.focus(), 50);
    ov.querySelector('[data-auth-submit]').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const err = ov.querySelector('#auth-err');
      const body = { ten_dang_nhap: u.value.trim(), mat_khau: ov.querySelector('#auth-p').value };
      if (!body.ten_dang_nhap || !body.mat_khau) { err.textContent = 'Nhập tên đăng nhập và mật khẩu'; return; }
      btn.disabled = true; err.textContent = '';
      const r = await call('/api/auth/login', body);
      btn.disabled = false;
      if (!r.success) { err.textContent = r.error || 'Không đăng nhập được'; return; }
      start(false);
    });
  }

  function showSetup(ready) {
    const ov = overlay();
    ov.innerHTML = `
      <form class="auth-card" onsubmit="return false">
        ${head('Khởi tạo hệ thống')}
        <p class="auth-msg">Chưa có tài khoản nào. Tạo <b>tài khoản quản trị</b> đầu tiên. Mã khởi tạo nằm trong file <b>MA_KHOI_TAO.txt</b> trong thư mục dự án.</p>
        ${ready ? '' : '<p class="auth-err">Máy chủ chưa có mã khởi tạo (SETUP_KEY). Hãy báo người cài đặt.</p>'}
        <label class="auth-field"><span>Mã khởi tạo</span><input type="text" id="auth-k" class="auth-input" autocomplete="off" spellcheck="false"></label>
        <label class="auth-field"><span>Tên đăng nhập <small>(chữ thường không dấu, số, . _ -)</small></span>
          <input type="text" id="auth-u" class="auth-input" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="vd: admin"></label>
        <label class="auth-field"><span>Họ tên</span><input type="text" id="auth-n" class="auth-input" autocomplete="name"></label>
        ${pwField('auth-p', 'Mật khẩu (ít nhất 6 ký tự)', 'new-password')}
        ${pwField('auth-p2', 'Nhập lại mật khẩu', 'new-password')}
        <p class="auth-err" id="auth-err" role="alert"></p>
        <button type="button" class="auth-submit" data-auth-submit>Tạo tài khoản quản trị</button>
      </form>`;
    setTimeout(() => ov.querySelector('#auth-k').focus(), 50);
    ov.querySelector('[data-auth-submit]').addEventListener('click', async e => {
      const err = ov.querySelector('#auth-err');
      const p = ov.querySelector('#auth-p').value;
      if (p !== ov.querySelector('#auth-p2').value) { err.textContent = 'Hai lần nhập mật khẩu không giống nhau'; return; }
      e.currentTarget.disabled = true;
      const r = await call('/api/auth/setup', {
        ma_khoi_tao: ov.querySelector('#auth-k').value.trim(), ten_dang_nhap: ov.querySelector('#auth-u').value.trim(),
        ho_ten: ov.querySelector('#auth-n').value.trim(), mat_khau: p,
      });
      e.currentTarget.disabled = false;
      if (!r.success) { err.textContent = r.error || 'Không tạo được'; return; }
      start(false);
    });
  }

  /* ---------------- Đổi mật khẩu ---------------- */
  function showPasswordDialog() {
    let dlg = document.getElementById('auth-pw-dialog');
    if (dlg) dlg.remove();
    dlg = document.createElement('div');
    dlg.id = 'auth-pw-dialog';
    dlg.className = 'auth-overlay auth-overlay-soft';
    dlg.innerHTML = `
      <form class="auth-card" onsubmit="return false">
        <h2>Đổi mật khẩu</h2>
        ${pwField('auth-old', 'Mật khẩu hiện tại', 'current-password')}
        ${pwField('auth-new', 'Mật khẩu mới (ít nhất 6 ký tự)', 'new-password')}
        ${pwField('auth-new2', 'Nhập lại mật khẩu mới', 'new-password')}
        <p class="auth-err" id="auth-pw-err" role="alert"></p>
        <div class="auth-row"><button type="button" class="auth-cancel" data-close>Hủy</button>
          <button type="button" class="auth-submit" data-save>Lưu mật khẩu mới</button></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', async e => {
      const eye = e.target.closest('[data-auth-eye]');
      if (eye) { const inp = dlg.querySelector(`#${eye.dataset.authEye}`); inp.type = inp.type === 'password' ? 'text' : 'password'; }
      if (e.target.closest('[data-close]') || e.target === dlg) dlg.remove();
      if (e.target.closest('[data-save]')) {
        const err = dlg.querySelector('#auth-pw-err');
        const nw = dlg.querySelector('#auth-new').value;
        if (nw !== dlg.querySelector('#auth-new2').value) { err.textContent = 'Hai lần nhập mật khẩu mới không giống nhau'; return; }
        const r = await call('/api/auth/doimatkhau', { mat_khau_cu: dlg.querySelector('#auth-old').value, mat_khau_moi: nw });
        if (!r.success) { err.textContent = r.error; return; }
        dlg.remove();
        if (window.showToast) window.showToast('Đã đổi mật khẩu. Các máy khác đã bị đăng xuất.', 'success');
      }
    });
    setTimeout(() => dlg.querySelector('#auth-old').focus(), 50);
  }

  /* ---------------- Khởi động ---------------- */
  let started = false;
  async function start(first) {
    const r = await call('/api/auth/status');
    if (!r.success) { showLogin(r.error || 'Không kết nối được máy chủ'); return; }
    if (r.user) { await apply(r.user, first || !started); started = true; return; }
    if (r.needSetup) showSetup(r.setupReady);
    else showLogin();
  }
  start(true);
})();
