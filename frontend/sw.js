/**
 * SERVICE WORKER - Phiếu Xuất Kho D&D Long An
 * - Giao diện (HTML/JS/CSS/icon): ưu tiên tải mới từ mạng, mất mạng thì dùng bản đã lưu
 *   -> mỗi lần deploy, người dùng mở app là thấy bản mới ngay
 * - Dữ liệu /api/: luôn lấy từ máy chủ (không lưu tạm để tránh sai số liệu)
 */
const CACHE = 'pxk-shell-v30';
const SHELL = [
  '/', '/index.html', '/styles.css', '/print.css', '/ui-v2.css', '/v3.css',
  '/common.js', '/auth.js', '/header.js', '/app.js', '/grid.js', '/catalog.js', '/dashboard.js', '/pwa.js',
  '/donhang.js', '/doichieu.js', '/taikhoan.js', '/khsidebar.js', '/tochat.js', '/tomay.js', '/sheet.js',
  '/tem.css', '/tem.js', '/temscan.js', '/vendor/qrcode.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // font Google... để trình duyệt tự xử lý

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ success: false, error: 'Mất kết nối mạng. Vui lòng kiểm tra Internet rồi thử lại.' }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )));
    return;
  }

  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    })
  );
});
