/**
 * BẢNG NHẬP KIỂU EXCEL CHO PHIẾU XUẤT KHO
 * - Di chuyển ô: ← → ↑ ↓, Tab / Shift+Tab, Enter / Shift+Enter
 * - Quét khối: kéo chuột, Shift + mũi tên, Shift + bấm chuột; bấm STT để chọn cả dòng
 * - Delete xóa nội dung vùng chọn (hoặc xóa dòng khi chọn cả dòng)
 * - Ctrl+C / Ctrl+X / Ctrl+V như Excel; dán 1 giá trị vào cả vùng đang chọn
 * - Ctrl+Z hoàn tác · Menu chuột phải: chèn / xóa dòng, dòng công cụ, copy, dán
 * Mỗi ô có data-col (cột logic) và data-span (ô gộp, ví dụ ô số lượng của dòng không size).
 */
(function () {
  const Grid = {};
  window.Grid = Grid;

  const gridEl = () => document.getElementById('excel-grid');
  const rowCount = () => AppState.rows.length;
  const trOf = r => gridEl()?.querySelector(`tbody tr[data-row-index="${r}"]`);
  const cellsOfRow = r => { const tr = trOf(r); return tr ? Array.from(tr.querySelectorAll('.excel-cell')) : []; };
  const colOf = cell => parseInt(cell.dataset.col, 10) || 0;
  const spanOf = cell => parseInt(cell.dataset.span, 10) || 1;

  function maxCol() {
    const cells = cellsOfRow(0);
    if (!cells.length) return 0;
    const last = cells[cells.length - 1];
    return colOf(last) + spanOf(last) - 1;
  }
  function cellAt(r, c) {
    return cellsOfRow(r).find(x => colOf(x) <= c && c < colOf(x) + spanOf(x)) || null;
  }
  function posOf(cell) {
    const tr = cell.closest('tr');
    return { r: parseInt(tr.dataset.rowIndex, 10), c: colOf(cell) };
  }

  /* ---------------- VÙNG CHỌN ---------------- */
  let sel = null;          // { ar, ac, fr, fc, rows }
  let dragging = null;     // 'cells' | 'rows' | null
  let internalFocus = false;

  function rect() {
    if (!sel) return null;
    return {
      r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr),
      c1: sel.rows ? 0 : Math.min(sel.ac, sel.fc), c2: sel.rows ? maxCol() : Math.max(sel.ac, sel.fc),
    };
  }
  function isMulti() {
    return !!sel && (sel.rows || sel.ar !== sel.fr || sel.ac !== sel.fc);
  }
  Grid.isMulti = isMulti;

  function paint() {
    const g = gridEl();
    if (!g) return;
    g.querySelectorAll('.cell-sel').forEach(td => td.classList.remove('cell-sel'));
    g.querySelectorAll('tr.row-sel').forEach(tr => tr.classList.remove('row-sel'));
    const btn = document.getElementById('btn-del-selected-rows');
    if (btn) btn.hidden = !(sel && sel.rows);
    if (!isMulti()) return;
    const { r1, r2, c1, c2 } = rect();
    for (let r = r1; r <= r2; r++) {
      if (sel.rows) trOf(r)?.classList.add('row-sel');
      cellsOfRow(r).forEach(cell => {
        const a = colOf(cell), b = a + spanOf(cell) - 1;
        if (b >= c1 && a <= c2) cell.closest('td')?.classList.add('cell-sel');
      });
    }
    if (btn && sel.rows) btn.textContent = `Xóa ${r2 - r1 + 1} dòng đã chọn`;
  }

  function clearSel() { sel = null; paint(); }
  Grid.clearSelection = clearSel;

  function focusCell(cell) {
    if (!cell) return;
    internalFocus = true;
    cell.focus();
    internalFocus = false;
    if (cell.tagName === 'INPUT') cell.select(); // chọn sẵn nội dung ngay để gõ đè
    cell.closest('td')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function moveTo(r, c, extend) {
    r = Math.max(0, Math.min(rowCount() - 1, r));
    c = Math.max(0, Math.min(maxCol(), c));
    const target = cellAt(r, c);
    if (!target) return;
    if (extend) {
      if (!sel) sel = { ar: r, ac: c, fr: r, fc: c, rows: false };
      sel.fr = r; sel.fc = c;
      paint();
      target.closest('td')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const p = posOf(target);
    sel = { ar: p.r, ac: p.c, fr: p.r, fc: p.c, rows: false };
    paint();
    focusCell(target);
  }

  /** Tìm ô kế tiếp theo chiều ngang, bỏ qua ô chỉ đọc (cột Tổng) */
  function nextEditableCol(r, c, dir) {
    let cc = c;
    for (let i = 0; i < 60; i++) {
      const cur = cellAt(r, cc);
      const nc = dir > 0 ? (cur ? colOf(cur) + spanOf(cur) : cc + 1) : (cur ? colOf(cur) - 1 : cc - 1);
      if (nc < 0 || nc > maxCol()) return null;
      const cell = cellAt(r, nc);
      if (cell && !cell.readOnly) return nc;
      cc = nc;
    }
    return null;
  }

  /* ---------------- HOÀN TÁC ---------------- */
  const undoStack = [];
  let pendingSnap = true;
  Grid.snapshot = function () {
    try {
      const snap = JSON.stringify({ rows: AppState.rows, sizes: AppState.selectedSizes });
      if (undoStack[undoStack.length - 1] !== snap) undoStack.push(snap);
      if (undoStack.length > 30) undoStack.shift();
    } catch (_) {}
  };
  Grid.beforeEdit = function () {
    if (pendingSnap) { Grid.snapshot(); pendingSnap = false; }
  };
  Grid.resetHistory = function () { undoStack.length = 0; pendingSnap = true; };

  function undo() {
    const snap = undoStack.pop();
    if (!snap) { showToast('Không còn thao tác nào để hoàn tác', 'info'); return; }
    const data = JSON.parse(snap);
    const sizesChanged = JSON.stringify(data.sizes) !== JSON.stringify(AppState.selectedSizes);
    AppState.rows = data.rows;
    AppState.selectedSizes = data.sizes;
    if (sizesChanged) { updateCustomSizeInputText(); renderTableStructure(); } else { renderTableBody(); calculateTotals(); }
    pendingSnap = true;
    clearSel();
    saveSlipDraft();
    showToast('Đã hoàn tác', 'info');
  }
  Grid.undo = undo;

  /* ---------------- XÓA / COPY / DÁN ---------------- */
  function setCell(cell, value) {
    if (!cell || cell.readOnly) return;
    cell.value = value;
    cell.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function clearRange() {
    if (!isMulti()) return;
    Grid.snapshot(); pendingSnap = false;
    const { r1, r2, c1, c2 } = rect();
    let n = 0;
    for (let r = r1; r <= r2; r++) {
      cellsOfRow(r).forEach(cell => {
        const a = colOf(cell), b = a + spanOf(cell) - 1;
        if (b >= c1 && a <= c2 && !cell.readOnly && cell.value !== '') { setCell(cell, ''); n++; }
      });
    }
    pendingSnap = true;
    if (n) showToast(`Đã xóa nội dung ${n} ô`, 'info');
  }
  Grid.clearRange = clearRange;

  function rangeToText() {
    const { r1, r2, c1, c2 } = rect();
    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const vals = [];
      for (let c = c1; c <= c2; c++) {
        const cell = cellAt(r, c);
        vals.push(cell && colOf(cell) === c ? cell.value : '');
      }
      lines.push(vals.join('\t'));
    }
    return lines.join('\n');
  }

  function onCopy(e, cut) {
    const active = document.activeElement;
    if (!active || !active.closest || !active.closest('#excel-grid') || !isMulti()) return;
    e.clipboardData.setData('text/plain', rangeToText());
    e.preventDefault();
    const { r1, r2, c1, c2 } = rect();
    if (cut) clearRange();
    showToast(`Đã ${cut ? 'cắt' : 'copy'} ${(r2 - r1 + 1) * (c2 - c1 + 1)} ô`, 'info');
  }
  document.addEventListener('copy', e => onCopy(e, false));
  document.addEventListener('cut', e => onCopy(e, true));

  /** Dán văn bản (từ Excel hoặc từ chính bảng) bắt đầu tại ô (r0, c0) */
  function pasteText(text, r0, c0) {
    const clean = String(text || '').replace(/\r/g, '');
    const lines = clean.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const data = lines.map(l => l.split('\t'));
    Grid.snapshot(); pendingSnap = false;

    // 1 giá trị + đang chọn nhiều ô -> điền cả vùng
    if (data.length === 1 && data[0].length === 1 && isMulti()) {
      const { r1, r2, c1, c2 } = rect();
      for (let r = r1; r <= r2; r++) {
        cellsOfRow(r).forEach(cell => {
          const a = colOf(cell), b = a + spanOf(cell) - 1;
          if (b >= c1 && a <= c2) setCell(cell, data[0][0].trim());
        });
      }
      pendingSnap = true;
      showToast('Đã điền giá trị vào vùng đã chọn', 'info');
      return;
    }

    const need = r0 + data.length;
    if (need > rowCount()) {
      while (AppState.rows.length < need) AppState.rows.push(createEmptyRowData(AppState.rows.length + 1));
      renderTableBody();
    }
    data.forEach((vals, i) => {
      vals.forEach((v, j) => {
        const cell = cellAt(r0 + i, c0 + j);
        if (cell && colOf(cell) === c0 + j) setCell(cell, v.trim());
      });
    });
    pendingSnap = true;
    sel = { ar: r0, ac: c0, fr: r0 + data.length - 1, fc: c0 + Math.max(...data.map(d => d.length)) - 1, rows: false };
    paint();
    calculateTotals();
    saveSlipDraft();
    if (data.length > 1 || data[0].length > 1) showToast(`Đã dán ${data.length} dòng`, 'info');
  }
  Grid.pasteText = pasteText;

  Grid.onPaste = function (e) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const multiValue = /[\t\n]/.test(text.replace(/\n+$/, ''));
    if (!multiValue && !isMulti()) return; // dán 1 giá trị vào 1 ô: để trình duyệt tự xử lý
    e.preventDefault();
    const start = isMulti() ? rect() : null;
    const p = posOf(e.target);
    pasteText(text, start ? start.r1 : p.r, start ? start.c1 : p.c);
  };

  /* ---------------- DÒNG: CHÈN / XÓA ---------------- */
  function insertRow(at, type) {
    Grid.snapshot();
    const row = createEmptyRowData(at + 1);
    if (type === 'khong_size') Object.assign(row, { loai: 'khong_size', dvt: 'Cái' });
    AppState.rows.splice(at, 0, row);
    renderTableBody(); calculateTotals(); saveSlipDraft();
    clearSel();
    setTimeout(() => moveTo(at, type === 'khong_size' ? 2 : 0), 20);
  }
  Grid.insertRow = insertRow;

  function deleteRows(r1, r2) {
    let idx = [];
    for (let r = r1; r <= r2; r++) idx.push(r);
    // Xóa dòng đồng bộ -> hỏi xóa cả bộ
    const dbKeys = [...new Set(idx.map(i => AppState.rows[i]).filter(r => r && r.loai === 'dong_bo').map(r => r.bo_key))];
    if (dbKeys.length) {
      if (!confirm('Bạn đang xóa dòng ĐỒNG BỘ ĐÔI. Xóa luôn cả bộ chi tiết đi kèm?')) return;
      AppState.rows.forEach((r, i) => { if (dbKeys.includes(r.bo_key) && !idx.includes(i)) idx.push(i); });
    }
    Grid.snapshot();
    const affected = new Set(idx.map(i => AppState.rows[i]?.bo_key).filter(Boolean));
    const removeSet = new Set(idx);
    AppState.rows = AppState.rows.filter((_, i) => !removeSet.has(i));
    if (!AppState.rows.length) AppState.rows.push(createEmptyRowData(1));
    renderTableBody();
    affected.forEach(k => recomputeDongBo(k));
    calculateTotals(); updateDonHangAuto(); saveSlipDraft();
    clearSel();
    showToast(`Đã xóa ${removeSet.size} dòng`, 'info');
  }
  Grid.deleteSelectedRows = function () {
    if (!sel) return;
    const { r1, r2 } = rect();
    deleteRows(r1, r2);
  };

  /* ---------------- BÀN PHÍM ---------------- */
  Grid.onKeyDown = function (e) {
    if (e.isComposing || e.keyCode === 229) return; // đang gõ Telex
    const cell = e.target;
    const p = posOf(cell);
    const ctrl = e.ctrlKey || e.metaKey;
    const isTextarea = cell.tagName === 'TEXTAREA';

    if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return; }

    if ((e.key === 'Delete' || e.key === 'Backspace') && isMulti()) {
      e.preventDefault();
      if (sel.rows && e.key === 'Delete') Grid.deleteSelectedRows(); else clearRange();
      return;
    }
    if (e.key === 'Escape') { clearSel(); return; }

    const base = (e.shiftKey && sel) ? { r: sel.fr, c: sel.fc } : p;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        if (isTextarea && cell.value.includes('\n') && !e.shiftKey) return;
        e.preventDefault();
        moveTo(base.r + (e.key === 'ArrowUp' ? -1 : 1), base.c, e.shiftKey);
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        const left = e.key === 'ArrowLeft';
        if (e.shiftKey) {
          e.preventDefault();
          const cur = cellAt(base.r, base.c);
          const nc = left ? (cur ? colOf(cur) - 1 : base.c - 1) : (cur ? colOf(cur) + spanOf(cur) : base.c + 1);
          moveTo(base.r, nc, true);
          return;
        }
        const len = (cell.value || '').length;
        const atEdge = left ? cell.selectionStart === 0 : cell.selectionEnd === len;
        if (!atEdge) return; // đang sửa giữa chữ -> di chuyển con trỏ như thường
        const nc = nextEditableCol(p.r, p.c, left ? -1 : 1);
        if (nc === null) return;
        e.preventDefault();
        moveTo(p.r, nc, false);
        return;
      }
      case 'Tab': {
        e.preventDefault();
        let nc = nextEditableCol(p.r, p.c, e.shiftKey ? -1 : 1);
        if (nc !== null) { moveTo(p.r, nc, false); return; }
        const nr = p.r + (e.shiftKey ? -1 : 1);
        if (nr < 0 || nr >= rowCount()) return;
        const cells = cellsOfRow(nr).filter(c => !c.readOnly);
        const target = e.shiftKey ? cells[cells.length - 1] : cells[0];
        if (target) moveTo(nr, colOf(target), false);
        return;
      }
      case 'Enter': {
        if (isTextarea && e.shiftKey) return; // xuống dòng trong ô tên hàng
        e.preventDefault();
        if (e.shiftKey) { moveTo(p.r - 1, p.c, false); return; }
        if (p.r + 1 < rowCount()) { moveTo(p.r + 1, p.c, false); return; }
        addRow();
        setTimeout(() => moveTo(p.r + 1, p.c, false), 30);
        return;
      }
      default:
    }
  };

  /* ---------------- CHUỘT ---------------- */
  function rowHeadRow(td) {
    const tr = td.closest('tr[data-row-index]');
    return tr ? parseInt(tr.dataset.rowIndex, 10) : null;
  }

  document.addEventListener('mousedown', (e) => {
    const g = gridEl();
    if (!g || !g.contains(e.target) || e.button !== 0) return;
    if (e.target.closest('button')) return;
    const td = e.target.closest('tbody td');
    if (!td) return;
    hideMenu();

    if (td.classList.contains('row-head')) {
      e.preventDefault();
      const r = rowHeadRow(td);
      if (e.shiftKey && sel) { sel.fr = r; sel.rows = true; }
      else sel = { ar: r, ac: 0, fr: r, fc: maxCol(), rows: true };
      dragging = 'rows';
      paint();
      const first = cellsOfRow(r).find(c => !c.readOnly);
      if (first) { internalFocus = true; first.focus({ preventScroll: true }); internalFocus = false; }
      return;
    }

    const cell = td.querySelector('.excel-cell');
    if (!cell) return;
    const p = posOf(cell);
    if (e.shiftKey && sel) {
      e.preventDefault();
      sel.fr = p.r; sel.fc = p.c; sel.rows = false;
      paint();
      return;
    }
    sel = { ar: p.r, ac: p.c, fr: p.r, fc: p.c, rows: false };
    dragging = 'cells';
    paint();
  });

  document.addEventListener('mouseover', (e) => {
    if (!dragging) return;
    const td = e.target.closest && e.target.closest('#excel-grid tbody td');
    if (!td) return;
    if (dragging === 'rows') {
      const r = rowHeadRow(td);
      if (r !== null && r !== sel.fr) { sel.fr = r; paint(); }
      return;
    }
    const cell = td.querySelector('.excel-cell');
    if (!cell) return;
    const p = posOf(cell);
    if (p.r !== sel.fr || p.c !== sel.fc) {
      sel.fr = p.r; sel.fc = p.c;
      window.getSelection()?.removeAllRanges();
      const a = document.activeElement;
      if (a && a.setSelectionRange && a.closest && a.closest('#excel-grid')) { try { a.setSelectionRange(0, 0); } catch (_) {} }
      paint();
    }
  });

  document.addEventListener('mouseup', () => {
    const was = dragging;
    dragging = null;
    // Bấm 1 ô (không kéo) -> chọn sẵn nội dung để gõ đè
    if (was === 'cells' && !isMulti()) {
      const a = document.activeElement;
      if (a && a.tagName === 'INPUT' && a.classList.contains('excel-cell') && a.selectionStart === a.selectionEnd) {
        a.select();
      }
    }
  });

  // Vào ô bằng chuột / Tab: chọn sẵn nội dung để gõ đè như Excel
  document.addEventListener('focusin', (e) => {
    const cell = e.target;
    if (!cell.classList || !cell.classList.contains('excel-cell') || !cell.closest('#excel-grid')) return;
    pendingSnap = true;
    if (internalFocus || dragging) return;
    if (cell.tagName === 'INPUT') setTimeout(() => { if (document.activeElement === cell && !dragging) cell.select(); }, 0);
  });

  /* ---------------- MENU CHUỘT PHẢI ---------------- */
  let menu = null;
  function hideMenu() { if (menu) menu.hidden = true; }
  document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) hideMenu(); });
  document.addEventListener('scroll', hideMenu, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });

  document.addEventListener('contextmenu', (e) => {
    const td = e.target.closest && e.target.closest('#excel-grid tbody td');
    if (!td) return;
    e.preventDefault();
    const r = rowHeadRow(td);
    const cell = td.querySelector('.excel-cell');
    // Bấm phải ra ngoài vùng đang chọn -> chọn ô đó
    if (cell) {
      const p = posOf(cell);
      const rr = rect();
      const inside = rr && p.r >= rr.r1 && p.r <= rr.r2 && p.c >= rr.c1 && p.c <= rr.c2;
      if (!inside) { sel = { ar: p.r, ac: p.c, fr: p.r, fc: p.c, rows: false }; paint(); focusCell(cell); }
    } else if (!(sel && sel.rows)) {
      sel = { ar: r, ac: 0, fr: r, fc: maxCol(), rows: true }; paint();
    }
    const rr = rect();
    const nRows = rr.r2 - rr.r1 + 1;
    const isSize = AppState.currentMau === 3;

    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'grid-menu';
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
    }
    const items = [
      ['insert-above', 'Chèn dòng phía trên'],
      ['insert-below', 'Chèn dòng phía dưới'],
      isSize ? ['insert-ks', 'Thêm dòng công cụ (không size) phía dưới'] : null,
      '-',
      ['copy', isMulti() ? 'Copy vùng đã chọn' : 'Copy ô này', 'Ctrl+C'],
      ['paste', 'Dán', 'Ctrl+V'],
      ['clear', 'Xóa nội dung', 'Delete'],
      '-',
      ['delete-rows', nRows > 1 ? `Xóa ${nRows} dòng` : 'Xóa dòng này', '', true],
    ].filter(Boolean);
    menu.innerHTML = items.map(it => it === '-' ? '<div class="grid-menu-sep"></div>'
      : `<button type="button" data-act="${it[0]}" class="${it[3] ? 'danger' : ''}"><span>${it[1]}</span>${it[2] ? `<kbd>${it[2]}</kbd>` : ''}</button>`).join('');
    menu.hidden = false;
    const w = 300, h = menu.offsetHeight || 300;
    menu.style.left = Math.min(e.clientX, window.innerWidth - w - 8) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - h - 8) + 'px';

    menu.onclick = async (ev) => {
      const b = ev.target.closest('button[data-act]');
      if (!b) return;
      hideMenu();
      const act = b.dataset.act;
      const cur = rect();
      if (act === 'insert-above') insertRow(cur.r1);
      if (act === 'insert-below') insertRow(cur.r2 + 1);
      if (act === 'insert-ks') insertRow(cur.r2 + 1, 'khong_size');
      if (act === 'delete-rows') deleteRows(cur.r1, cur.r2);
      if (act === 'clear') {
        if (isMulti()) clearRange();
        else { const c = cellAt(cur.r1, cur.c1); if (c) { Grid.snapshot(); setCell(c, ''); } }
      }
      if (act === 'copy') {
        const text = isMulti() ? rangeToText() : (cellAt(cur.r1, cur.c1)?.value || '');
        try { await navigator.clipboard.writeText(text); showToast('Đã copy', 'info'); }
        catch (_) { showToast('Trình duyệt chặn copy, hãy dùng Ctrl+C', 'error'); }
      }
      if (act === 'paste') {
        try {
          const text = await navigator.clipboard.readText();
          if (!/[\t\n]/.test(text.replace(/\n+$/, '')) && !isMulti()) {
            const c = cellAt(cur.r1, cur.c1); if (c) { Grid.snapshot(); setCell(c, text.trim()); }
          } else {
            pasteText(text, cur.r1, cur.c1);
          }
        } catch (_) { showToast('Trình duyệt chặn dán từ menu, hãy dùng Ctrl+V', 'error'); }
      }
    };
  });
})();
