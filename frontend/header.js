/**
 * THANH ĐẦU TRANG: logo · menu chữ · ô tìm phiếu · avatar người dùng
 * - Menu không đủ chỗ thì các mục cuối dồn vào nút "Thêm" (nút tab vẫn nằm trong .nav-tabs nên app.js / auth.js không đổi)
 * - Ô tìm: Enter -> mở Danh sách phiếu, tìm mọi ngày theo số phiếu / đơn vị nhận / đơn hàng
 * - Menu thả xuống (.hdr-pop): bấm nút [data-pop] mở / đóng, bấm ra ngoài hoặc Esc thì đóng
 * Nạp sau auth.js, trước app.js.
 */
(function () {
  const $ = s => document.querySelector(s);

  /* ---------------- Menu thả xuống ---------------- */
  function closePops(except) {
    document.querySelectorAll('.hdr-pop').forEach(p => {
      if (p === except) return;
      p.querySelector('.hdr-menu').hidden = true;
      p.querySelector('[data-pop]').setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('.hdr-pop [data-pop]');
    if (btn) {
      const pop = btn.closest('.hdr-pop');
      const menu = pop.querySelector('.hdr-menu');
      closePops(pop);
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    // Chọn 1 mục trong menu hoặc bấm ra ngoài -> đóng
    if (!e.target.closest || !e.target.closest('.hdr-menu-who')) closePops();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(); });

  /* ---------------- Menu chữ: dồn mục thừa vào "Thêm" ---------------- */
  let order = [];
  function fitNav() {
    const nav = $('.nav-tabs');
    const more = nav && nav.querySelector('.nav-more');
    if (!more) return;
    const menu = more.querySelector('.nav-more-menu');
    order.forEach(b => nav.insertBefore(b, more));
    more.hidden = true;
    if (nav.scrollWidth > nav.clientWidth + 1) {
      more.hidden = false;
      const shown = order.filter(b => !b.hidden);
      while (shown.length > 1 && nav.scrollWidth > nav.clientWidth + 1) menu.prepend(shown.pop());
    }
    markMore();
  }
  /** Tab đang mở nằm trong "Thêm" -> tô nút "Thêm" */
  function markMore() {
    const more = $('.nav-more');
    if (more) more.classList.toggle('active', !!more.querySelector('.tab-btn.active'));
  }

  /* ---------------- Ô tìm phiếu ---------------- */
  function initSearch() {
    const form = $('.hdr-search');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const tab = $('.tab-btn[data-target="tab-list"]');
      if (!tab || tab.hidden) return;
      const q = form.querySelector('input').value.trim();
      const box = document.getElementById('filter-search');
      if (box) box.value = q;
      if (q) ['filter-tu-ngay', 'filter-den-ngay'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); // tìm mọi ngày
      if (tab.classList.contains('active') && typeof loadSlipList === 'function') loadSlipList();
      else tab.click();
      form.querySelector('input').blur();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const nav = $('.nav-tabs');
    if (!nav) return;
    order = [...nav.querySelectorAll('.tab-btn')];
    initSearch();
    // Đổi quyền (ẩn / hiện tab), đổi cỡ cửa sổ, nạp xong font -> xếp lại
    new MutationObserver(ms => { if (ms.some(m => m.target.classList.contains('tab-btn'))) fitNav(); })
      .observe(nav, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    if (window.ResizeObserver) new ResizeObserver(() => fitNav()).observe($('.app-header'));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNav);
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tab-btn')) setTimeout(markMore, 0); });
    fitNav();
    (window.AuthReady || Promise.resolve()).then(() => {
      const form = $('.hdr-search');
      if (form) form.hidden = !(window.Auth && window.Auth.can('tab-list'));
      fitNav();
    });
  });
})();
