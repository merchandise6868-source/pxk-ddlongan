/**
 * BẢNG TÍNH KIỂU EXCEL DÙNG CHUNG (tab Đơn hàng, Tổ may)
 * window.Sheet.create(box, opts) -> { render, refreshRow, addRows, markErrors, focus }
 *
 * opts: cols [{ key, title, num, width }], rows (mảng dữ liệu của tab, Sheet sửa trực tiếp qua set),
 *       get(row, key) -> chữ hiển thị · set(row, key, value) · newRow() · onChange(r | null)
 *       extraHead() -> '<th>…' · extraCells(row, r) -> '<td class="sheet-x">…' (cột chỉ xem bên phải)
 *       placeholder(row, key, r) · canDelete(row) -> true | 'lý do không xóa được'
 *
 * Thao tác như Excel:
 * - Bấm ô rồi gõ là ghi đè; bấm đúp / F2 để sửa trong ô (lúc đó ←/→ di con trỏ chữ); Esc hủy chữ vừa gõ
 * - ← → ↑ ↓, Tab / Shift+Tab, Enter / Shift+Enter (dòng cuối tự thêm dòng), Home / End, Ctrl+Home / Ctrl+End
 * - Kéo chuột / Shift+bấm / Shift+mũi tên chọn vùng; bấm số dòng chọn cả dòng; Ctrl+A chọn hết
 * - Ctrl+C / Ctrl+X / Ctrl+V (dán khối từ Excel, 1 giá trị dán vào cả vùng), Delete xóa vùng, Ctrl+D điền xuống, Ctrl+Z hoàn tác
 * - Chuột phải: chèn / xóa dòng, copy, dán
 * Gõ Telex: keydown bỏ qua khi isComposing / 229, ô đang gõ không bị vẽ lại.
 */
(function () {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HEAD_RE = /^(po|art|m[aã] h[aà]ng|size|m[aà]u|stt)$/i; // dòng tiêu đề dán từ Excel -> bỏ

  function create(box, opts) {
    const o = opts;
    const st = { ar: 0, ac: 0, fr: 0, fc: 0, rowSel: false, edit: false, drag: null, undo: [], before: null };
    const nCol = () => o.cols.length;
    const nRow = () => o.rows.length;
    const clampR = r => Math.max(0, Math.min(nRow() - 1, r));
    const clampC = c => Math.max(0, Math.min(nCol() - 1, c));
    const rect = () => ({
      r1: Math.min(st.ar, st.fr), r2: Math.max(st.ar, st.fr),
      c1: st.rowSel ? 0 : Math.min(st.ac, st.fc), c2: st.rowSel ? nCol() - 1 : Math.max(st.ac, st.fc),
    });
    const multi = () => st.rowSel || st.ar !== st.fr || st.ac !== st.fc;
    const inputAt = (r, c) => box.querySelector(`.sheet-in[data-r="${r}"][data-c="${c}"]`);
    const changed = r => { if (o.onChange) o.onChange(r); };

    /* ---------------- VẼ ---------------- */
    function render() {
      const cols = o.cols;
      box.innerHTML = `<table class="sheet">
        <thead><tr><th class="sheet-corner" title="Chọn hết (Ctrl+A)"></th>${cols.map((c, ci) =>
          `<th class="sheet-h ${c.num ? 'sheet-num' : ''}" data-c="${ci}" style="${c.width ? `min-width:${c.width}px` : ''}">${esc(c.title)}</th>`).join('')}${o.extraHead ? o.extraHead() : ''}</tr></thead>
        <tbody>${o.rows.map((row, r) => `<tr data-r="${r}"><th class="sheet-rh" data-r="${r}">${r + 1}</th>${cols.map((c, ci) => {
          const ph = o.placeholder ? o.placeholder(row, c.key, r) : '';
          return `<td class="sheet-td ${c.num ? 'sheet-num' : ''}"><input class="sheet-in" data-r="${r}" data-c="${ci}" autocomplete="off" spellcheck="false"
            ${c.num ? 'inputmode="numeric"' : ''} value="${esc(o.get(row, c.key))}"${ph ? ` placeholder="${esc(ph)}"` : ''}></td>`;
        }).join('')}${o.extraCells ? o.extraCells(row, r) : ''}</tr>`).join('')}</tbody></table>`;
      st.ar = clampR(st.ar); st.fr = clampR(st.fr); st.ac = clampC(st.ac); st.fc = clampC(st.fc);
      paint();
    }
    function paint() {
      box.querySelectorAll('.sheet-sel, .sheet-act').forEach(td => td.classList.remove('sheet-sel', 'sheet-act'));
      box.querySelectorAll('.sheet-rh.on').forEach(th => th.classList.remove('on'));
      const { r1, r2, c1, c2 } = rect();
      for (let r = r1; r <= r2; r++) {
        box.querySelector(`.sheet-rh[data-r="${r}"]`)?.classList.add('on');
        for (let c = c1; c <= c2; c++) inputAt(r, c)?.parentElement.classList.add('sheet-sel');
      }
      inputAt(st.ar, st.ac)?.parentElement.classList.add('sheet-act');
      box.querySelectorAll('.sheet-h').forEach(th => th.classList.toggle('on', +th.dataset.c >= c1 && +th.dataset.c <= c2));
    }
    /** Cập nhật lại các ô của 1 dòng (chữ mờ, cột chỉ xem) sau khi dữ liệu đổi – không đụng ô đang gõ */
    function refreshRow(r) {
      const tr = box.querySelector(`tbody tr[data-r="${r}"]`);
      if (!tr) return;
      const row = o.rows[r];
      if (o.extraCells) { tr.querySelectorAll('.sheet-x').forEach(td => td.remove()); tr.insertAdjacentHTML('beforeend', o.extraCells(row, r)); }
      if (o.placeholder) o.cols.forEach((c, ci) => { const el = inputAt(r, ci); if (el) el.placeholder = o.placeholder(row, c.key, r) || ''; });
    }
    function refreshAll() { o.rows.forEach((_, r) => refreshRow(r)); }

    /* ---------------- CHỌN / DI CHUYỂN ---------------- */
    function focusActive(selectAll = true) {
      const el = inputAt(st.ar, st.ac);
      if (!el) return;
      st.internal = true;
      el.focus({ preventScroll: false });
      st.internal = false;
      if (selectAll && el.select) el.select();
      el.parentElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function go(r, c, extend) {
      commit();
      if (r >= nRow() && !extend) { addRows(1, true); }
      r = clampR(r); c = clampC(c);
      if (extend) { st.fr = r; st.fc = c; } else { st.ar = st.fr = r; st.ac = st.fc = c; st.rowSel = false; }
      st.edit = false;
      paint();
      if (!extend) focusActive();
      else inputAt(st.fr, st.fc)?.parentElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    /** Rời ô: định dạng lại ô vừa sửa (vd: số 1000 -> 1.000) */
    function commit() {
      const el = inputAt(st.ar, st.ac);
      if (el && document.activeElement === el && st.before !== null) {
        const row = o.rows[st.ar];
        if (row) { const v = o.get(row, o.cols[st.ac].key); if (el.value !== v) el.value = v; }
      }
      st.before = null;
    }

    /* ---------------- HOÀN TÁC ---------------- */
    function snap() {
      st.undo.push(JSON.stringify(o.rows));
      if (st.undo.length > 50) st.undo.shift();
    }
    function undo() {
      const s = st.undo.pop();
      if (!s) return;
      o.rows.splice(0, o.rows.length, ...JSON.parse(s));
      render(); focusActive(); changed(null);
    }

    /* ---------------- SỬA DỮ LIỆU ---------------- */
    function setCell(r, c, v) {
      const row = o.rows[r];
      if (!row || !o.cols[c]) return;
      o.set(row, o.cols[c].key, v);
      const el = inputAt(r, c);
      if (el) el.value = o.get(row, o.cols[c].key);
    }
    function clearRange() {
      const { r1, r2, c1, c2 } = rect();
      snap();
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) setCell(r, c, '');
      refreshAll(); changed(null);
    }
    function rangeText() {
      const { r1, r2, c1, c2 } = rect();
      const out = [];
      for (let r = r1; r <= r2; r++) {
        const row = o.rows[r];
        const vals = [];
        for (let c = c1; c <= c2; c++) vals.push(o.get(row, o.cols[c].key));
        out.push(vals.join('\t'));
      }
      return out.join('\r\n');
    }
    function paste(text) {
      let lines = String(text).replace(/\r/g, '').split('\n');
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      let cells = lines.map(l => l.split('\t'));
      cells = cells.filter(cs => !cs.some(x => HEAD_RE.test(String(x).trim())));
      if (!cells.length) return;
      snap();
      const { r1, r2, c1, c2 } = rect();
      if (cells.length === 1 && cells[0].length === 1 && multi()) {
        // 1 giá trị -> điền cả vùng đang chọn
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) setCell(r, c, cells[0][0].trim());
      } else {
        const need = r1 + cells.length;
        let added = false;
        while (o.rows.length < need) { o.rows.push(o.newRow()); added = true; }
        if (added) { o.rows.push(o.newRow(), o.newRow()); render(); }
        cells.forEach((cs, i) => cs.forEach((v, j) => setCell(r1 + i, c1 + j, String(v ?? '').trim())));
        st.ar = r1; st.ac = c1; st.fr = r1 + cells.length - 1; st.fc = clampC(c1 + cells[0].length - 1); st.rowSel = false;
        paint();
        if (cells.length > 1 && window.U) window.U.toast(`Đã dán ${cells.length} dòng`, 'success');
      }
      refreshAll(); changed(null);
      focusActive();
    }
    function fillDown() {
      const { r1, r2, c1, c2 } = rect();
      if (r2 <= r1) return;
      snap();
      for (let c = c1; c <= c2; c++) {
        const v = o.get(o.rows[r1], o.cols[c].key);
        for (let r = r1 + 1; r <= r2; r++) setCell(r, c, v);
      }
      refreshAll(); changed(null);
    }
    function addRows(n, keepSel) {
      for (let i = 0; i < n; i++) o.rows.push(o.newRow());
      const a = { ...st };
      render();
      if (keepSel) Object.assign(st, { ar: a.ar, ac: a.ac, fr: a.fr, fc: a.fc });
      paint();
    }
    function insertRow(at) {
      snap();
      o.rows.splice(at, 0, o.newRow());
      st.ar = st.fr = at; st.rowSel = false;
      render(); focusActive(); changed(null);
    }
    function deleteRows() {
      const { r1, r2 } = rect();
      const keep = [];
      for (let r = r1; r <= r2; r++) {
        const ok = o.canDelete ? o.canDelete(o.rows[r]) : true;
        if (ok !== true) keep.push(ok);
      }
      if (keep.length && window.U) window.U.toast(keep[0], 'error');
      snap();
      for (let r = r2; r >= r1; r--) if (!o.canDelete || o.canDelete(o.rows[r]) === true) o.rows.splice(r, 1);
      if (!o.rows.length) o.rows.push(o.newRow());
      st.ar = st.fr = clampR(r1); st.rowSel = false;
      render(); focusActive(); changed(null);
    }

    /* ---------------- SỰ KIỆN ---------------- */
    const posOf = el => ({ r: +el.dataset.r, c: +el.dataset.c });

    box.addEventListener('mousedown', e => {
      if (e.button === 2) {
        // Chuột phải trong vùng đang chọn thì giữ vùng
        const el = e.target.closest('.sheet-in');
        if (el) { const p = posOf(el); const { r1, r2, c1, c2 } = rect(); if (!(p.r >= r1 && p.r <= r2 && p.c >= c1 && p.c <= c2)) go(p.r, p.c); }
        return;
      }
      const rh = e.target.closest('.sheet-rh');
      if (rh) {
        e.preventDefault();
        const r = +rh.dataset.r;
        commit();
        if (e.shiftKey) st.fr = r; else { st.ar = st.fr = r; st.ac = 0; }
        st.rowSel = true; st.fc = nCol() - 1; st.drag = 'rows'; st.edit = false;
        paint(); focusActive();
        return;
      }
      if (e.target.closest('.sheet-corner')) { e.preventDefault(); selectAll(); return; }
      const el = e.target.closest('.sheet-in');
      if (!el) return;
      const p = posOf(el);
      if (st.edit && p.r === st.ar && p.c === st.ac && !e.shiftKey) return; // đang sửa trong ô: để con trỏ chữ tự do
      e.preventDefault();
      if (e.shiftKey) { st.fr = p.r; st.fc = p.c; st.rowSel = false; paint(); return; }
      go(p.r, p.c);
      st.drag = 'cells';
    });
    box.addEventListener('mouseover', e => {
      if (!st.drag) return;
      if (st.drag === 'rows') { const rh = e.target.closest('.sheet-rh'); if (rh) { st.fr = +rh.dataset.r; paint(); } return; }
      const el = e.target.closest('.sheet-in');
      if (!el) return;
      const p = posOf(el);
      if (p.r !== st.fr || p.c !== st.fc) { st.fr = p.r; st.fc = p.c; paint(); }
    });
    document.addEventListener('mouseup', () => { st.drag = null; });
    box.addEventListener('dblclick', e => {
      const el = e.target.closest('.sheet-in');
      if (!el) return;
      st.edit = true;
      const n = el.value.length; el.setSelectionRange?.(n, n);
    });
    box.addEventListener('focusin', e => {
      const el = e.target.closest('.sheet-in');
      if (!el || st.internal) return;
      // Vào ô bằng Tab của trình duyệt / bấm trực tiếp
      const p = posOf(el);
      if (p.r !== st.ar || p.c !== st.ac) { st.ar = st.fr = p.r; st.ac = st.fc = p.c; st.rowSel = false; st.edit = false; paint(); }
    });
    box.addEventListener('input', e => {
      const el = e.target.closest('.sheet-in');
      if (!el) return;
      const p = posOf(el);
      if (st.before === null) { st.before = o.get(o.rows[p.r], o.cols[p.c].key); snap(); }
      o.set(o.rows[p.r], o.cols[p.c].key, el.value);
      el.closest('tr')?.classList.remove('sheet-err');
      refreshRow(p.r);
      if (o.cols[p.c].key === 'art' && o.placeholder) refreshAll(); // ART đổi -> chữ mờ các dòng dưới
      changed(p.r);
    });
    box.addEventListener('focusout', e => {
      const el = e.target.closest('.sheet-in');
      if (!el) return;
      const p = posOf(el);
      const row = o.rows[p.r];
      if (row && st.before !== null) el.value = o.get(row, o.cols[p.c].key); // định dạng lại số
      if (p.r === st.ar && p.c === st.ac) st.before = null;
      st.edit = false;
    });

    function selectAll() { commit(); st.ar = 0; st.ac = 0; st.fr = nRow() - 1; st.fc = nCol() - 1; st.rowSel = false; st.edit = false; paint(); focusActive(); }

    box.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      const el = e.target.closest('.sheet-in');
      if (!el) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const { r1, r2, c1, c2 } = rect();
      const editing = st.edit && !multi();
      if (ctrl && (k === 'z' || k === 'Z') && !editing) { e.preventDefault(); undo(); return; }
      if (ctrl && (k === 'a' || k === 'A') && !editing) { e.preventDefault(); selectAll(); return; }
      if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); fillDown(); return; }
      if (k === 'F2') { e.preventDefault(); st.edit = true; const n = el.value.length; el.setSelectionRange?.(n, n); return; }
      if (k === 'Escape') {
        if (st.before !== null) { o.set(o.rows[st.ar], o.cols[st.ac].key, st.before); el.value = st.before; st.before = null; refreshRow(st.ar); changed(st.ar); }
        st.edit = false; el.select?.(); return;
      }
      if ((k === 'Delete' || (k === 'Backspace' && multi())) && !editing) { e.preventDefault(); clearRange(); return; }
      if (k === 'Enter') { e.preventDefault(); go(st.ar + (e.shiftKey ? -1 : 1), st.ac); return; }
      if (k === 'Tab') {
        e.preventDefault();
        let r = st.ar, c = st.ac + (e.shiftKey ? -1 : 1);
        if (c >= nCol()) { c = 0; r++; } else if (c < 0) { c = nCol() - 1; r = Math.max(0, r - 1); }
        go(r, c); return;
      }
      const sh = e.shiftKey;
      const baseR = sh ? st.fr : st.ar, baseC = sh ? st.fc : st.ac;
      if (k === 'ArrowDown') { e.preventDefault(); if (!sh && baseR + 1 >= nRow()) return; go(ctrl ? nRow() - 1 : baseR + 1, baseC, sh); return; }
      if (k === 'ArrowUp') { e.preventDefault(); go(ctrl ? 0 : baseR - 1, baseC, sh); return; }
      if ((k === 'ArrowRight' || k === 'ArrowLeft') && !editing) {
        e.preventDefault();
        const d = k === 'ArrowRight' ? 1 : -1;
        go(baseR, ctrl ? (d > 0 ? nCol() - 1 : 0) : baseC + d, sh); return;
      }
      if (k === 'Home' && !editing) { e.preventDefault(); go(ctrl ? 0 : baseR, 0, sh); return; }
      if (k === 'End' && !editing) { e.preventDefault(); go(ctrl ? nRow() - 1 : baseR, nCol() - 1, sh); return; }
      // Gõ chữ khi đang chọn cả vùng: thu về 1 ô rồi ghi đè
      if (k.length === 1 && !ctrl && multi()) { st.fr = st.ar; st.fc = st.ac; st.rowSel = false; paint(); el.select?.(); }
      void r1; void r2; void c1; void c2;
    });
    box.addEventListener('copy', e => {
      if (!e.target.closest('.sheet-in') || (st.edit && !multi())) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', rangeText());
    });
    box.addEventListener('cut', e => {
      if (!e.target.closest('.sheet-in') || (st.edit && !multi())) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', rangeText());
      clearRange();
    });
    box.addEventListener('paste', e => {
      if (!e.target.closest('.sheet-in')) return;
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const oneCell = !/[\t\n]/.test(text.replace(/\r?\n$/, ''));
      if (oneCell && !multi()) {
        if (st.edit) return; // đang sửa trong ô: dán chữ bình thường
        e.preventDefault();
        snap(); setCell(st.ar, st.ac, text.replace(/\r?\n$/, '').trim()); refreshAll(); changed(st.ar); focusActive();
        return;
      }
      e.preventDefault();
      paste(text);
    });

    /* ---------------- MENU CHUỘT PHẢI ---------------- */
    let menu = null;
    function hideMenu() { if (menu) menu.hidden = true; }
    box.addEventListener('contextmenu', e => {
      if (!e.target.closest('.sheet-in, .sheet-rh')) return;
      e.preventDefault();
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'sheet-menu ui-scope';
        document.body.appendChild(menu);
        menu.addEventListener('mousedown', ev => ev.preventDefault());
        menu.addEventListener('click', async ev => {
          const b = ev.target.closest('[data-m]');
          if (!b) return;
          hideMenu();
          const m = b.dataset.m;
          if (m === 'above') insertRow(rect().r1);
          if (m === 'below') insertRow(rect().r2 + 1);
          if (m === 'del') deleteRows();
          if (m === 'clear') clearRange();
          if (m === 'fill') fillDown();
          if (m === 'copy') { try { await navigator.clipboard.writeText(rangeText()); } catch (_) { document.execCommand('copy'); } }
          if (m === 'paste') {
            try { paste(await navigator.clipboard.readText()); }
            catch (_) { if (window.U) window.U.toast('Trình duyệt không cho dán từ menu, hãy bấm Ctrl+V', 'info'); }
          }
        });
        document.addEventListener('mousedown', ev => { if (menu && !menu.contains(ev.target)) hideMenu(); });
        window.addEventListener('scroll', hideMenu, true);
      }
      const { r1, r2 } = rect();
      const n = r2 - r1 + 1;
      menu.innerHTML = `
        <button type="button" data-m="copy">Copy <kbd>Ctrl+C</kbd></button>
        <button type="button" data-m="paste">Dán <kbd>Ctrl+V</kbd></button>
        <button type="button" data-m="clear">Xóa nội dung <kbd>Delete</kbd></button>
        <button type="button" data-m="fill">Điền xuống <kbd>Ctrl+D</kbd></button>
        <hr>
        <button type="button" data-m="above">Chèn dòng phía trên</button>
        <button type="button" data-m="below">Chèn dòng phía dưới</button>
        <button type="button" data-m="del" class="danger">Xóa ${n > 1 ? n + ' dòng' : 'dòng'} đang chọn</button>`;
      menu.hidden = false;
      const w = 230, h = 280;
      menu.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
      menu.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;
    });

    render();
    return {
      render, refreshRow, refreshAll, addRows: n => addRows(n, true), deleteRows,
      /** Tô đỏ các dòng lỗi: { chỉ số dòng: lời nhắn } */
      markErrors(map) {
        box.querySelectorAll('tr.sheet-err').forEach(tr => { tr.classList.remove('sheet-err'); tr.removeAttribute('title'); });
        Object.entries(map || {}).forEach(([r, msg]) => { const tr = box.querySelector(`tbody tr[data-r="${r}"]`); if (tr) { tr.classList.add('sheet-err'); tr.title = msg; } });
      },
      focus(r = 0, c = 0) { st.ar = st.fr = clampR(r); st.ac = st.fc = clampC(c); st.rowSel = false; paint(); focusActive(); },
    };
  }

  window.Sheet = { create };
})();
