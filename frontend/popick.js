/**
 * LẬP PHIẾU – CHỌN PO THEO ĐƠN HÀNG + CỘT CÒN LẠI (mọi tài khoản có quyền Lập phiếu)
 * - Ô PO (mẫu theo size) mở danh sách PO · ART · Màu theo đơn hàng của khách đang chọn, có ô tìm
 *   (PO / ART / màu, gõ không dấu cũng được). Chọn xong: PO -> PO, ART -> Mã hàng, Màu -> Diễn giải.
 * - Cột "Còn lại" trên bảng nhập và trên phiếu in (sau cột Tổng), chỉ ghi 1 số tổng.
 * Còn lại = số từ /api/conlai (đặt − đã xuất − điều chỉnh, không tính phiếu đang sửa) trừ tiếp các dòng của phiếu đang lập.
 * Khớp dòng phiếu với dòng đơn giống máy chủ (src/donhang.js): chỉ đơn cùng đợt với phiếu (ô "Đơn hàng đợt"),
 *   PO + ART, cùng PO + ART nhiều màu thì theo màu ở Diễn giải.
 * Nạp sau app.js / grid.js (dùng AppState, renderTableBody, calculateTotals, ... của app.js).
 */
(function () {
  const { esc, normKey, normSize } = window.U;
  const nf = new Intl.NumberFormat('vi-VN');
  const n = v => nf.format(v || 0);
  const PoPick = {};
  window.PoPick = PoPick;

  /** Tài khoản có quyền Lập phiếu (đọc được số còn lại /api/conlai) */
  PoPick.allowed = () => !!(window.Auth && window.Auth.can && window.Auth.can('tab-create'));
  /** Phiếu đang lập có dùng danh sách PO + cột Còn lại không (mẫu theo size, đã chọn khách) */
  PoPick.on = () => PoPick.allowed() && AppState.currentMau === 3 && !!AppState.khachHangId;

  /* ============================================================
     SỐ CÒN LẠI THEO DÒNG ĐƠN
     ============================================================ */
  let data = null;    // { kh, tru, lines: [{ id, dot, po, art, mau, don_hang, sizes: {size: còn} }], dots: [{ dot, don: [số đơn] }], latest }
  let loading = '';
  const keyOf = (kh, tru) => `${kh || 0}|${tru || 0}`;
  const curKey = () => keyOf(AppState.khachHangId, AppState.currentEditingId);
  const current = () => (data && keyOf(data.kh, data.tru) === curKey() ? data : null);

  /** Tải số còn lại của 1 khách (tru = id phiếu không tính, khi sửa / in lại phiếu đã lưu) */
  PoPick.fetch = async (kh, tru) => {
    const res = await fetch(`/api/conlai?khach_hang_id=${kh}${tru ? `&tru_phieu=${tru}` : ''}`);
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Lỗi tải số còn lại');
    return { kh, tru: tru || 0, lines: j.data || [], dots: j.dots || [], latest: j.latest || null };
  };
  PoPick.load = async () => {
    if (!PoPick.on()) return;
    const k = curKey();
    if (current() || loading === k) return;
    loading = k;
    try {
      const d = await PoPick.fetch(AppState.khachHangId, AppState.currentEditingId);
      if (curKey() !== k) return; // đã đổi khách / phiếu trong lúc chờ
      data = d;
      PoPick.refresh();
      renderList();
    } catch (err) {
      console.error('Lỗi tải số còn lại:', err);
    } finally {
      if (loading === k) loading = '';
    }
  };
  /** Số liệu đã cũ (vừa lưu phiếu / mở lại tab): lần vẽ sau tự tải lại */
  PoPick.invalidate = () => { data = null; };

  /** Đợt đơn hàng của phiếu đang lập: đã chọn ở ô "Đơn hàng đợt", chưa chọn thì đợt mới nhất có đơn (giống máy chủ khi lưu) */
  PoPick.dot = () => AppState.dotDon || (current() && current().latest) || null;
  /** Dòng đơn cùng đợt với phiếu (đơn chưa ghi đợt = đợt 1) */
  const ofDot = (d, dot) => (d ? { ...d, lines: d.lines.filter(l => (l.dot || 1) === (dot || d.latest || 1)) } : d);

  /** Ô chọn đợt trên đầu phiếu: hiện khi khách đã có đơn hàng */
  function renderDot() {
    const wrap = document.getElementById('slip-dot-wrap');
    const sel = document.getElementById('slip-dot');
    if (!wrap || !sel) return;
    const d = PoPick.on() ? current() : null;
    wrap.hidden = !d || !d.dots.length;
    if (wrap.hidden) return;
    const cur = PoPick.dot() || 1;
    const max = Math.max(cur, ...d.dots.map(x => x.dot));
    const don = new Map(d.dots.map(x => [x.dot, x.don]));
    let html = '';
    for (let k = max; k >= 1; k--) {
      const ds = don.get(k);
      html += `<option value="${k}"${k === cur ? ' selected' : ''}>Đợt ${k}${ds ? (ds.length ? ` · ${esc(ds.join(', '))}` : '') : ' (chưa nhập đơn)'}</option>`;
    }
    if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
    sel.value = String(cur);
  }
  document.addEventListener('change', e => {
    if (e.target.id !== 'slip-dot') return;
    AppState.dotDon = parseInt(e.target.value, 10) || null;
    saveSlipDraft();
    PoPick.refresh();
  });

  /** Dòng đơn của 1 dòng phiếu */
  function matchLine(lines, r) {
    const po = normKey(r.ma_hang), art = normKey(r.mau);
    if (!po) return null;
    const list = lines.filter(l => normKey(l.po) === po && normKey(l.art) === art);
    if (list.length > 1) {
      const m = normKey(r.chi_tiet);
      if (m) {
        const exact = list.filter(l => normKey(l.mau) === m);
        if (exact.length === 1) return exact[0];
        const inText = list.filter(l => normKey(l.mau) && m.includes(normKey(l.mau)));
        if (inText.length === 1) return inText[0];
      }
      return new Set(list.map(l => normKey(l.mau))).size === 1 ? list[0] : null;
    }
    if (list.length === 1) return list[0];
    if (!art) {
      const byPo = lines.filter(l => normKey(l.po) === po);
      if (byPo.length === 1) return byPo[0];
    }
    return null;
  }
  const counted = r => r.loai !== 'chi_tiet' && r.loai !== 'khong_size'; // chi tiết (miếng) & công cụ không trừ vào đơn
  const totals = sz => Object.values(sz).reduce((a, v) => (v > 0 ? { ...a, con: a.con + v } : { ...a, du: a.du - v }), { con: 0, du: 0 });

  /** Mỗi dòng phiếu: { line, sz: còn lại từng size sau phiếu này, own: số của dòng, con, du } hoặc null (không khớp đơn) */
  function compute(rows, d) {
    if (!d) return rows.map(() => null);
    const qty = r => {
      const o = {};
      Object.entries(r.sizes || {}).forEach(([s, v]) => { const q = parseVnNumber(v); if (q) o[normSize(s)] = (o[normSize(s)] || 0) + q; });
      return o;
    };
    const matched = rows.map(r => (counted(r) ? matchLine(d.lines, r) : null));
    const nay = new Map();
    rows.forEach((r, i) => {
      const l = matched[i];
      if (!l) return;
      if (!nay.has(l.id)) nay.set(l.id, {});
      const o = nay.get(l.id);
      Object.entries(qty(r)).forEach(([s, q]) => { o[s] = (o[s] || 0) + q; });
    });
    return rows.map((r, i) => {
      const l = matched[i];
      if (!l) return null;
      const o = nay.get(l.id) || {};
      const sz = {};
      new Set([...Object.keys(l.sizes || {}), ...Object.keys(o)]).forEach(s => { sz[s] = (l.sizes[s] || 0) - (o[s] || 0); });
      return { line: l, sz, own: qty(r), ...totals(sz) };
    });
  }
  const text = c => (c.con ? n(c.con) : c.du ? `Dư ${n(c.du)}` : '0');

  /** Vẽ lại cột Còn lại + số gợi ý mờ trong ô size (không đụng ô đang gõ). Gọi sau calculateTotals */
  PoPick.refresh = () => {
    if (box && !box.hidden && (!P.cell || !document.contains(P.cell))) close();
    renderDot();
    if (!PoPick.on()) return;
    const d = ofDot(current(), PoPick.dot());
    if (!d) { PoPick.load(); return; }
    const res = compute(AppState.rows, d);
    AppState.rows.forEach((r, i) => {
      const tr = document.querySelector(`#excel-grid tbody tr[data-row-index="${i}"]`);
      if (!tr) return;
      const c = res[i];
      const td = tr.querySelector('.td-conlai');
      if (td) {
        td.className = `td-conlai${c ? (c.con ? ' cl-con' : c.du ? ' cl-du' : ' cl-ok') : ''}`;
        td.innerHTML = c ? esc(text(c)) : (counted(r) && String(r.ma_hang || '').trim() ? '<small>Không có trong đơn</small>' : '');
      }
      // Gợi ý mờ: số còn được xuất của từng size (trước dòng này)
      tr.querySelectorAll('.size-val-cell').forEach(cell => {
        const s = normSize(cell.dataset.size);
        const v = c && !r.loai ? (c.sz[s] || 0) + (c.own[s] || 0) : 0;
        cell.placeholder = v > 0 ? String(v) : '';
      });
    });
  };

  /**
   * Chữ cột Còn lại khi in (theo chỉ số AppState.rows): chỉ ghi ở dòng cuối của mỗi dòng đơn.
   * Trả null nếu không in cột (không có quyền Lập phiếu / không dòng nào khớp đơn). d, dot: số liệu + đợt riêng (in lại phiếu cũ)
   */
  PoPick.printTexts = (rows, d, dot) => {
    if (!PoPick.allowed()) return null;
    const res = d === undefined ? compute(rows, ofDot(current(), PoPick.dot())) : compute(rows, ofDot(d, dot));
    if (!res.some(Boolean)) return null;
    const last = new Map();
    res.forEach((c, i) => { if (c) last.set(c.line.id, i); });
    return res.map((c, i) => (c && last.get(c.line.id) === i ? text(c) : ''));
  };

  /* ============================================================
     DANH SÁCH CHỌN PO · ART · MÀU (có ô tìm)
     ============================================================ */
  const P = { row: -1, cell: null, q: '', hi: 0, items: [] };
  let box = null;
  let skipClick = null;

  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'popick ui-scope'; // ui-scope: biến màu --ui-* (ui-v2.css)
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Chọn PO · ART · Màu');
    box.innerHTML = `
      <div class="popick-search">
        <div class="popick-q">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="text" class="popick-input" placeholder="Tìm theo PO, ART hoặc màu…" autocomplete="off" spellcheck="false" aria-label="Tìm PO, ART hoặc màu">
        </div>
        <span class="popick-n"></span>
      </div>
      <div class="popick-head"><span>PO</span><span>ART</span><span>Màu</span><span>Đợt</span><span>Còn lại</span></div>
      <div class="popick-list" role="listbox"></div>
      <div class="popick-foot"></div>`;
    document.body.appendChild(box);
    const inp = box.querySelector('.popick-input');
    inp.addEventListener('input', () => { P.q = inp.value; P.hi = 0; renderList(); });
    inp.addEventListener('keydown', onSearchKey);
    box.addEventListener('mousedown', e => {
      const it = e.target.closest('.popick-it');
      if (it) { e.preventDefault(); choose(P.items[+it.dataset.j]); }
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-pp]');
      if (b && b.dataset.pp === 'tay') typed(P.q.trim());
      if (b && b.dataset.pp === 'bo') clearRow();
    });
    return box;
  }

  function open(cell, q) {
    const tr = cell.closest('tr');
    ensureBox();
    P.row = parseInt(tr.dataset.rowIndex, 10);
    P.cell = cell;
    P.q = q || '';
    box.hidden = false;
    const inp = box.querySelector('.popick-input');
    inp.value = P.q;
    renderList(true);
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
    if (!current()) PoPick.load();
  }
  function close(refocus) {
    if (!box || box.hidden) return;
    box.hidden = true;
    const cell = P.cell;
    P.row = -1;
    P.cell = null;
    if (refocus && cell && document.contains(cell)) cell.focus();
  }
  PoPick.close = close;

  /** Đặt khung ngay dưới ô PO (không đủ chỗ thì mở lên trên) */
  function place() {
    if (!P.cell) return;
    const r = P.cell.getBoundingClientRect();
    const w = Math.min(600, window.innerWidth - 24);
    box.style.width = w + 'px';
    box.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 12 - w)) + window.scrollX + 'px';
    const h = box.offsetHeight;
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
    box.style.top = (up ? r.top - h - 4 : r.bottom + 4) + window.scrollY + 'px';
  }

  /**
   * Lọc: mỗi từ gõ vào phải khớp PO, ART, Màu hoặc đợt ("đợt 2") – không dấu, không phân biệt hoa thường.
   * Hiện đủ các đợt (PO + ART + Màu các đợt có thể y hệt nhau, cột Đợt để phân biệt): đợt của phiếu lên trước, rồi đợt mới -> cũ.
   */
  function items(d, dot) {
    const toks = P.q.trim().split(/\s+/).map(normKey).filter(Boolean);
    const rank = l => ((l.dot || 1) === dot ? -1e6 : -(l.dot || 1));
    return d.lines.filter(l => toks.every(t => [l.po, l.art, l.mau, `Đợt ${l.dot || 1}`].some(v => normKey(v).includes(t))))
      .map((l, i) => ({ l, i })).sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i).map(x => x.l);
  }
  function renderList(first) {
    if (!box || box.hidden || !P.cell) return;
    const all = current();
    const dot = PoPick.dot() || 1;
    const res = compute(AppState.rows, ofDot(all, dot));
    const remain = new Map();
    res.forEach(c => { if (c) remain.set(c.line.id, c); });
    const cur = res[P.row] ? res[P.row].line.id : null;
    P.items = all ? items(all, dot) : [];
    if (first) P.hi = Math.max(0, P.items.findIndex(l => l.id === cur));
    P.hi = Math.max(0, Math.min(P.hi, P.items.length - 1));
    box.querySelector('.popick-n').textContent = all ? `${P.items.length} / ${all.lines.length} dòng` : '';
    const list = box.querySelector('.popick-list');
    list.innerHTML = !all ? '<div class="popick-empty">Đang tải danh sách PO…</div>'
      : !all.lines.length ? '<div class="popick-empty">Khách này chưa có đơn hàng nào (nhập ở tab Đơn hàng).</div>'
      : !P.items.length ? `<div class="popick-empty">Không có PO nào khớp “${esc(P.q)}”</div>`
      : P.items.map((l, j) => {
        const t = remain.get(l.id) || totals(l.sizes || {});
        return `<div class="popick-it${j === P.hi ? ' hi' : ''}${t.con > 0 ? '' : ' done'}" data-j="${j}" role="option" aria-selected="${j === P.hi}">
          <span class="pp-po">${l.id === cur ? '<b class="pp-cur">✓</b> ' : ''}${esc(l.po)}</span><span>${esc(l.art)}</span>
          <span><span class="pp-mau">${esc(l.mau || '—')}</span></span>
          <span><span class="pp-dot${(l.dot || 1) === dot ? ' on' : ''}" title="${esc(l.don_hang || '')}">Đợt ${l.dot || 1}</span></span>
          <span class="pp-con">${t.con > 0 ? `còn ${n(t.con)}` : t.du ? `dư ${n(t.du)}` : 'còn 0'}</span></div>`;
      }).join('');
    const r = AppState.rows[P.row];
    const q = P.q.trim();
    box.querySelector('.popick-foot').innerHTML = `<span><kbd>↑</kbd> <kbd>↓</kbd> chọn · <kbd>Enter</kbd> điền · <kbd>Esc</kbd> đóng</span><span class="popick-fill"></span>
      ${q && !P.items.some(l => normKey(l.po) === normKey(q)) ? `<button type="button" class="ui-btn-sm" data-pp="tay">Ghi tay PO “${esc(q)}”</button>` : ''}
      ${r && String(r.ma_hang || '').trim() ? '<button type="button" class="ui-btn-sm" data-pp="bo">Bỏ PO của dòng</button>' : ''}`;
    list.querySelector('.popick-it.hi')?.scrollIntoView({ block: 'nearest' });
    place();
  }

  function onSearchKey(e) {
    if (e.isComposing || e.keyCode === 229) return; // đang gõ Telex
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!P.items.length) return;
      P.hi = (P.hi + (e.key === 'ArrowDown' ? 1 : -1) + P.items.length) % P.items.length;
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (P.items.length) choose(P.items[P.hi]); else if (P.q.trim()) typed(P.q.trim());
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close(true);
    }
  }

  /** Ghi vào dòng rồi vẽ lại bảng; toSize = đưa con trỏ vào ô size đầu tiên còn hàng */
  function apply(fn, toSize) {
    const i = P.row;
    const r = AppState.rows[i];
    if (!r) { close(); return; }
    if (window.Grid) Grid.snapshot();
    const oldPo = r.ma_hang, oldArt = r.mau;
    fn(r);
    if (r.bo_key) { propagateBlockField(i, 'ma_hang', oldPo); propagateBlockField(i, 'mau', oldArt); }
    close();
    renderTableBody();
    calculateTotals();
    updateDonHangAuto();
    saveSlipDraft();
    const tr = document.querySelector(`#excel-grid tbody tr[data-row-index="${i}"]`);
    const sizes = tr ? [...tr.querySelectorAll('.size-val-cell')] : [];
    const target = toSize ? (sizes.find(c => c.placeholder) || sizes[0]) : tr && tr.querySelector('[data-field="ma_hang"]');
    if (target) target.focus();
  }
  function choose(l) {
    if (!l) return;
    const dot = PoPick.dot() || 1;
    if ((l.dot || 1) !== dot) {
      // Cả phiếu trừ vào 1 đợt (ô "Đơn hàng đợt"): dòng khác đang khớp đơn đợt hiện tại thì hỏi trước khi chuyển
      const others = compute(AppState.rows, ofDot(current(), dot)).filter((c, i) => c && i !== P.row).length;
      if (others && !confirm(`Phiếu đang trừ vào đơn đợt ${dot}. Chuyển cả phiếu sang đợt ${l.dot || 1}?`)) {
        box.querySelector('.popick-input').focus();
        return;
      }
      AppState.dotDon = l.dot || 1;
    }
    apply(r => {
      r.ma_hang = l.po;
      r.mau = l.art;
      r._autoArt = l.art;
      if (!r.loai) r.chi_tiet = l.mau || ''; // dòng chi tiết / đồng bộ giữ tên chi tiết ở Diễn giải
    }, true);
  }
  function typed(q) {
    if (!q) return;
    apply(r => { r.ma_hang = q; }, false);
  }
  function clearRow() {
    apply(r => {
      r.ma_hang = '';
      r.mau = '';
      if (!r.loai) r.chi_tiet = '';
    }, false);
  }

  /* ---------------- Mở danh sách từ ô PO ---------------- */
  const poCell = t => (t && t.matches && t.matches('#excel-grid tbody input.po-pick[data-field="ma_hang"]') ? t : null);
  // Gõ chữ / F4 / Alt+↓ ở ô PO -> mở danh sách, chữ vừa gõ vào ô tìm (chạy trước bảng Excel)
  document.addEventListener('keydown', e => {
    const cell = poCell(e.target);
    if (!cell || !PoPick.on() || e.isComposing || e.keyCode === 229) return;
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!printable && e.key !== 'F4' && !(e.altKey && e.key === 'ArrowDown')) return;
    e.preventDefault();
    e.stopPropagation();
    open(cell, printable ? e.key.trim() : '');
  }, true);
  // Bấm ô PO -> mở (bấm lại đúng ô đang mở -> đóng)
  document.addEventListener('click', e => {
    const cell = poCell(e.target);
    if (!cell || !PoPick.on() || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (skipClick === cell) { skipClick = null; return; }
    if (window.Grid && Grid.isMulti()) return; // vừa kéo chọn vùng
    open(cell, '');
  });
  document.addEventListener('mousedown', e => {
    if (!box || box.hidden) { skipClick = null; return; }
    if (box.contains(e.target)) return;
    skipClick = e.target === P.cell ? P.cell : null;
    close();
  }, true);
  // Cuộn bảng (ngang) / đổi cỡ cửa sổ -> đóng; cuộn cả trang thì khung đi theo
  document.addEventListener('scroll', e => {
    if (box && !box.hidden && e.target !== document && !box.contains(e.target)) close();
  }, true);
  window.addEventListener('resize', () => close());
  // Mở lại tab Lập phiếu -> lấy số còn lại mới (người khác có thể vừa lưu phiếu)
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('.tab-btn[data-target="tab-create"]') && PoPick.on()) {
      PoPick.invalidate();
      PoPick.refresh();
    }
  });
})();
