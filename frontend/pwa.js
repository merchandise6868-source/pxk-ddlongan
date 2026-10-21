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
