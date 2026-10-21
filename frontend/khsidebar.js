/**
 * THANH BÊN KHÁCH HÀNG: chọn khách 1 lần, mọi tab đi theo (nạp sau catalog.js, trước app.js)
 * window.KH = { id, one(), name(), set(id, opts), guard(fn), emptyNote(), refreshCount() }
 * - id: số id khách | '' (Tất cả khách hàng) | 'none' (phiếu chưa gán khách – chỉ Danh sách phiếu & Dashboard dùng)
 * - Đổi khách -> sự kiện 'kh-changed' trên window (detail: { id, prev, carry })
 * - guard(fn): fn(idMới) trả câu cảnh báo nếu tab đang có dữ liệu chưa lưu -> hỏi trước khi đổi
 */
(function () {
  const { esc, store, api } = window.U;
  const KEY = 'kh_chon';
  const KEY_MINI = 'kh_sidebar_mini';
  const NONE_TABS = ['tab-list', 'tab-dashboard']; // tab hiểu mục "Chưa gán khách hàng"
  const norm = v => (v === 'none' ? 'none' : (parseInt(v, 10) || ''));
  const guards = [];
  let noneCount = 0;

  const activeTab = () => document.querySelector('.tab-content.active')?.id || '';
  const khOf = id => (window.Catalog ? window.Catalog.byId(id) : null);

  const KH = {
    id: norm(store.get(KEY, '')),
    /** Id khách đang chọn (số) hoặc null nếu đang ở Tất cả / Chưa gán */
    one() { return typeof this.id === 'number' ? this.id : null; },
    name() {
      if (this.id === 'none') return 'Chưa gán khách hàng';
      const k = this.one() && khOf(this.id);
      return k ? k.ten_ngan : 'Tất cả khách hàng';
    },
    /** Đổi khách. Trả false nếu người dùng không đồng ý bỏ dữ liệu đang nhập */
    set(id, opts = {}) {
      id = norm(id);
      if (id === this.id) return true;
      if (!opts.force) {
        const msgs = guards.map(fn => { try { return fn(id); } catch (_) { return ''; } }).filter(Boolean);
        if (msgs.length && !confirm(`${msgs.join('\n\n')}\n\nVẫn chuyển sang ${labelOf(id)}?`)) return false;
      }
      const prev = this.id;
      this.id = id;
      store.set(KEY, id);
      render();
      window.dispatchEvent(new CustomEvent('kh-changed', { detail: { id, prev, carry: !!opts.carry } }));
      return true;
    },
    guard(fn) { guards.push(fn); },
    /** Câu nhắc cho danh sách rỗng khi đang lọc 1 khách */
    emptyNote() {
      const k = this.one() && khOf(this.id);
      return k ? ` Đang lọc theo khách <b>${esc(k.ten_ngan)}</b> – bấm <b>Tất cả khách hàng</b> ở thanh bên để xem toàn bộ.` : '';
    },
    refreshCount,
  };
  window.KH = KH;

  function labelOf(id) {
    if (id === 'none') return 'Chưa gán khách hàng';
    const k = id && khOf(id);
    return k ? `khách ${k.ten_ngan}` : 'Tất cả khách hàng';
  }
  /** Chữ viết tắt khi thu gọn: "Liên Thái" -> LT, "Kurim" -> KUR */
  function short(k) {
    const w = String(k.ten_ngan || k.ma || '').trim().split(/\s+/).filter(Boolean);
    if (w.length > 1) return w.slice(0, 3).map(x => x[0]).join('').toUpperCase();
    return (w[0] || '?').slice(0, 3).toUpperCase();
  }

  /* ---------------- GIAO DIỆN ---------------- */
  function els() {
    return { side: document.getElementById('kh-sidebar'), cur: document.getElementById('kh-current') };
  }

  function render() {
    const { side, cur } = els();
    if (!side || !window.Catalog || !window.Auth?.user) return;
    const list = window.Catalog.khach;
    const sel = KH.id;
    const showNone = window.Auth.can('tab-list') && (noneCount > 0 || sel === 'none');
    side.innerHTML = `
      <div class="kh-side-head"><span>Khách hàng</span>
        <button type="button" class="kh-side-mini" data-kh-act="mini" title="Thu gọn / mở rộng thanh bên" aria-label="Thu gọn thanh bên">«</button></div>
      <div class="kh-side-list" role="listbox" aria-label="Chọn khách hàng">
        <button type="button" class="kh-item kh-item-all ${sel === '' ? 'active' : ''}" data-kh="" role="option" aria-selected="${sel === ''}" title="Tất cả khách hàng">
          <b>Tất cả khách hàng</b><i>Tất cả</i></button>
        ${list.map(k => `<button type="button" class="kh-item ${sel === k.id ? 'active' : ''}" data-kh="${k.id}" role="option" aria-selected="${sel === k.id}" title="${esc(k.ten_day_du || k.ten_ngan)}">
          <b>${esc(k.ten_ngan)}</b><small>${esc([k.ma, k.bo_phan_xuat].filter(Boolean).join(' · '))}</small><i>${esc(short(k))}</i></button>`).join('')}
        ${showNone ? `<button type="button" class="kh-item kh-item-none ${sel === 'none' ? 'active' : ''}" data-kh="none" role="option" aria-selected="${sel === 'none'}" title="Phiếu xuất chưa gán khách hàng">
          <b>⚠ Chưa gán khách</b><small>${noneCount} phiếu xuất cũ – bấm để gán</small><i>⚠ ${noneCount}</i></button>` : ''}
      </div>`;
    renderCurrent(cur);
    // Điện thoại: cuộn dải nút tới khách đang chọn (không cuộn cả trang)
    const box = side.querySelector('.kh-side-list');
    const act = side.querySelector('.kh-item.active');
    if (box && act) setTimeout(() => {
      if (box.scrollWidth <= box.clientWidth) return;
      const a = act.getBoundingClientRect(), b = box.getBoundingClientRect();
      box.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2);
    }, 0);
  }

  function renderCurrent(cur = els().cur) {
    if (!cur) return;
    const tab = activeTab();
    const k = KH.one() && khOf(KH.id);
    let html;
    if (k) html = `Đang xem khách hàng: <b>${esc(k.ten_ngan)}</b>${k.ten_day_du ? ` <span>· ${esc(k.ten_day_du)}</span>` : ''}`;
    else if (KH.id === 'none' && NONE_TABS.includes(tab)) html = 'Đang xem: <b>Phiếu chưa gán khách hàng</b>';
    else html = 'Đang xem: <b>Tất cả khách hàng</b> <span>· chọn 1 khách ở thanh bên để lọc</span>';
    cur.innerHTML = html;
    document.body.classList.toggle('kh-off', tab === 'tab-taikhoan');
  }

  async function refreshCount() {
    if (!window.Auth?.can('tab-list')) return;
    try {
      const { data } = await api('/api/phieu?khach_hang_id=none');
      const n = (data || []).length;
      if (n !== noneCount) { noneCount = n; render(); }
    } catch (_) { /* giữ số cũ */ }
  }

  function setMini(on) {
    document.body.classList.toggle('kh-mini', on);
    store.set(KEY_MINI, on ? 1 : 0);
  }

  /** Thanh bên dính ngay dưới header (header dính trên máy tính, không dính trên điện thoại) */
  function trackHeader() {
    const header = document.querySelector('.app-header');
    if (!header) return;
    const upd = () => {
      const sticky = getComputedStyle(header).position === 'sticky';
      document.documentElement.style.setProperty('--kh-top', `${(sticky ? header.offsetHeight : 0) + 12}px`);
    };
    upd();
    if (window.ResizeObserver) new ResizeObserver(upd).observe(header);
    window.addEventListener('resize', upd);
  }

  async function init() {
    const { side } = els();
    if (!side) return;
    if (store.get(KEY_MINI, 0)) document.body.classList.add('kh-mini');
    trackHeader();
    side.addEventListener('click', e => {
      if (e.target.closest('[data-kh-act="mini"]')) { setMini(!document.body.classList.contains('kh-mini')); return; }
      const b = e.target.closest('[data-kh]');
      if (!b) return;
      const id = norm(b.dataset.kh);
      if (!KH.set(id)) return;
      if (id === 'none' && activeTab() !== 'tab-list') document.querySelector('.tab-btn[data-target="tab-list"]')?.click();
    });
    // Đổi tab -> cập nhật dòng "Đang xem" và ẩn thanh bên ở tab Tài khoản
    document.addEventListener('click', e => { if (e.target.closest?.('.tab-btn')) setTimeout(() => renderCurrent(), 0); });
    window.addEventListener('catalog-changed', () => { validate(); render(); });

    await window.AuthReady;
    if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
    validate();
    render();
    refreshCount();
  }

  /** Khách đã lưu bị xóa / bị ẩn -> về Tất cả */
  function validate() {
    if (!window.Catalog?.loaded) return;
    if (KH.one() && !window.Catalog.khach.some(k => k.id === KH.id)) KH.set('', { force: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
