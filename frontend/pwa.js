/**
 * CÀI ĐẶT ỨNG DỤNG (PWA) - nút "Cài ứng dụng" trên thanh tiêu đề
 * - Chrome / Edge (máy tính, Android): bấm nút -> hộp thoại cài của trình duyệt
 * - iPhone / iPad (Safari): hiện hướng dẫn "Chia sẻ -> Thêm vào MH chính"
 */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Không đăng ký được service worker:', err));
    });
  }

  // BÁO CÓ BẢN MỚI: so số phiên bản (?v=) của các file đang chạy với index.html trên máy chủ.
  // Kiểm tra mỗi 5 phút và mỗi lần quay lại tab -> máy để mở cả ngày vẫn biết có bản mới.
  const verOf = list => list.map(s => (String(s).match(/([\w-]+\.(?:js|css))\?v=([\w.-]+)/) || []).slice(1).join('@')).filter(Boolean).sort().join('|');
  const verDangChay = () => verOf([...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')].map(el => el.getAttribute('src') || el.getAttribute('href')));
  let hoanDen = 0;
  async function kiemTraBanMoi() {
    if (!navigator.onLine || document.hidden || Date.now() < hoanDen || document.getElementById('update-bar')) return;
    try {
      const res = await fetch('/index.html', { cache: 'no-store' });
      if (!res.ok) return;
      const moi = verOf((await res.text()).match(/(?:src|href)="[^"]+\?v=[^"]+"/g) || []);
      if (moi && moi !== verDangChay()) hienBaoBanMoi();
    } catch (_) { /* mất mạng: bỏ qua, lần sau kiểm tra lại */ }
  }
  function hienBaoBanMoi() {
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'no-print';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10000;display:flex;gap:10px;align-items:center;flex-wrap:wrap;'
      + 'max-width:calc(100% - 24px);background:#001c44;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:15px';
    bar.innerHTML = '<b>Đã có bản mới của Phiếu Xuất Kho.</b><span style="opacity:.85">Lưu phiếu đang làm rồi bấm tải lại.</span>'
      + '<button type="button" data-up="reload" style="height:34px;padding:0 14px;border:0;border-radius:8px;background:#fff;color:#001c44;font-weight:700;cursor:pointer">Tải lại ngay</button>'
      + '<button type="button" data-up="later" style="height:34px;padding:0 12px;border:1px solid rgba(255,255,255,.5);border-radius:8px;background:transparent;color:#fff;cursor:pointer">Để sau</button>';
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-up]'); if (!b) return;
      if (b.dataset.up === 'reload') location.reload();
      else { hoanDen = Date.now() + 30 * 60 * 1000; bar.remove(); } // 30 phút sau nhắc lại
    });
    document.body.appendChild(bar);
  }
  window.addEventListener('load', () => setTimeout(kiemTraBanMoi, 10000));
  setInterval(kiemTraBanMoi, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kiemTraBanMoi(); });
  window.kiemTraBanMoi = kiemTraBanMoi;

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferredPrompt = null;

  function btn() { return document.getElementById('btn-install-app'); }
  function show() { const b = btn(); if (b && !isStandalone()) b.hidden = false; }
  function hide() { const b = btn(); if (b) b.hidden = true; }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hide();
    if (window.showToast) window.showToast('Đã cài ứng dụng Phiếu Xuất Kho', 'success');
  });

  function openGuide() {
    const dlg = document.getElementById('install-guide');
    if (dlg && dlg.showModal) dlg.showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Mở thẳng tab theo lối tắt của app (?tab=tab-create ...)
    const tab = new URLSearchParams(location.search).get('tab');
    // Chờ đăng nhập xong mới mở (tab không có quyền sẽ bị auth.js chặn)
    if (tab) (window.AuthReady || Promise.resolve()).then(() => setTimeout(() => document.querySelector(`.tab-btn[data-target="${tab}"]`)?.click(), 300));

    if (isStandalone()) return hide();
    if (isIos) show(); // iPhone không có hộp thoại cài tự động -> nút mở hướng dẫn

    btn()?.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'accepted') hide();
      } else {
        openGuide();
      }
    });
    document.getElementById('install-guide-close')?.addEventListener('click', () => document.getElementById('install-guide').close());
  });
})();
