/**
 * QUÉT TEM VÀO TAB LẬP PHIẾU XUẤT (nạp sau app.js)
 * - Ô quét trên bảng size: súng quét USB (gõ mã + Enter) hoặc 📷 camera điện thoại (BarcodeDetector, không có thì jsQR).
 * - Mỗi tem = 1 PO/ART + 1 size + số đôi -> cộng vào dòng cùng PO + Mã hàng (ART) của bảng mẫu 3; tem đầu tiên của phiếu trống
 *   tự chọn bộ phận theo tem (TC / CMA...). Tem khách khác -> chuyển khách ở thanh bên (nháp khách cũ vẫn giữ).
 * - Danh sách tem của phiếu nằm ở AppState.tems (lưu cùng nháp, gửi kèm khi Lưu phiếu). Lưu phiếu / In phiếu A5 = chốt phiếu.
 * - Đang thử: chỉ tài khoản admin thấy (Auth.can('tab-intem')).
 * window.TemScan = { on(), paint(), payload() }
 */
(function () {
  const { esc, api, normKey, normSize, fmt0, viDate } = window.U;
  const $ = id => document.getElementById(id);
  const on = () => !!(window.Auth && window.Auth.can('tab-intem'));
  const tems = () => (Array.isArray(AppState.tems) ? AppState.tems : (AppState.tems = []));
  let lastId = null;
  let showList = false;
  let busy = false;

  /* ---------------- Âm báo ---------------- */
  let actx;
  function beep(good) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = good ? 1250 : 240; o.type = good ? 'sine' : 'square';
      g.gain.value = 0.12; o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + (good ? 0.09 : 0.35));
    } catch (_) {}
    if (navigator.vibrate) navigator.vibrate(good ? 60 : [120, 60, 120]);
  }
  function msg(cls, html) {
    const m = $('tsc-msg');
    if (m) { m.className = 'tsc-msg' + (cls ? ' is-' + cls : ''); m.innerHTML = html || ''; }
    const c = $('tsc-cam-status');
    if (c && cls) c.innerHTML = html;
  }

  /* ---------------- Cộng tem vào bảng size ---------------- */
  const sameLine = (r, t) => !r.loai && normKey(r.ma_hang) === normKey(t.po) && normKey(r.mau) === normKey(t.art);
  /** Cột size của tem trong dãy size đang dùng (chưa có thì thêm cột) */
  function sizeKey(size) {
    const k = AppState.selectedSizes.find(s => normSize(s) === normSize(size));
    if (k !== undefined) return k;
    AppState.selectedSizes.push(String(size));
    if (typeof updateCustomSizeInputText === 'function') updateCustomSizeInputText();
    return String(size);
  }
  /** Cộng sl (âm = trừ) vào ô PO/ART × size; trả chỉ số dòng */
  function addToGrid(t, sl) {
    let i = AppState.rows.findIndex(r => sameLine(r, t));
    if (i < 0) {
      if (sl <= 0) return -1;
      i = AppState.rows.findIndex(r => !r.loai && isRowEmpty(r));
      if (i < 0) { AppState.rows.push(createEmptyRowData(AppState.rows.length + 1)); i = AppState.rows.length - 1; }
      const r = AppState.rows[i];
      r.ma_hang = t.po; r.mau = t.art; r.dvt = 'Đôi';
      if (!r.chi_tiet) r.chi_tiet = t.mau || '';
      if (t.po_id) r.po_id = t.po_id; // trừ đúng dòng đơn hàng của tem
    }
    const r = AppState.rows[i];
    const k = sizeKey(t.size);
    const v = Math.max(0, parseVnNumber(r.sizes[k]) + sl);
    if (v) r.sizes[k] = v; else delete r.sizes[k];
    return i;
  }
  /** Vẽ lại bảng sau khi cộng tem rồi nháy sáng ô vừa đổi */
  function refreshGrid(rIdx, size) {
    if (rIdx >= 0) recalcRow(rIdx);
    renderTableStructure(); // vẽ lại cả tiêu đề (có thể vừa thêm cột size) + tô ô tem
    updateDonHangAuto();
    saveSlipDraft();
    if (rIdx < 0) return;
    const k = AppState.selectedSizes.find(s => normSize(s) === normSize(size));
    const cell = document.querySelector(`#excel-grid tr[data-row-index="${rIdx}"] .size-val-cell[data-size="${CSS.escape(String(k))}"]`);
    const td = cell && cell.closest('td');
    if (td) {
      td.classList.remove('tsc-flash'); void td.offsetWidth; td.classList.add('tsc-flash');
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /** Tô ô có số từ tem (khớp tổng tem) và ô lệch tổng tem (gõ tay khác) */
  function paint() {
    const grid = $('excel-grid');
    if (!grid) return;
    grid.querySelectorAll('td.tsc-ok, td.tsc-lech').forEach(td => { td.classList.remove('tsc-ok', 'tsc-lech'); td.title = ''; });
    renderBar();
    if (!on() || AppState.currentMau !== 3 || !tems().length) return;
    const sums = new Map();
    tems().forEach(t => { const k = `${normKey(t.po)}|${normKey(t.art)}`; if (!sums.has(k)) sums.set(k, {}); const m = sums.get(k); const s = normSize(t.size); m[s] = (m[s] || 0) + t.so_luong; });
    const done = new Set();
    AppState.rows.forEach((r, i) => {
      if (r.loai) return;
      const k = `${normKey(r.ma_hang)}|${normKey(r.mau)}`;
      const m = sums.get(k);
      if (!m || done.has(k)) return;
      done.add(k);
      grid.querySelectorAll(`tr[data-row-index="${i}"] .size-val-cell`).forEach(cell => {
        const ts = m[normSize(cell.dataset.size)] || 0;
        if (!ts) return;
        const v = parseVnNumber(r.sizes[cell.dataset.size]);
        const td = cell.closest('td');
        td.classList.add(v === ts ? 'tsc-ok' : 'tsc-lech');
        td.title = v === ts ? `Từ tem: ${ts} đôi` : `Tổng tem ${ts} đôi – trên bảng ${v} đôi`;
      });
    });
  }

  /* ---------------- Quét 1 mã ---------------- */
  const pick = t => ({ id: t.id, ma_tem: t.ma_tem, loai: t.loai, khach_hang_id: t.khach_hang_id, po_id: t.po_id, po: t.po, art: t.art, mau: t.mau,
    size: t.size, so_luong_in: t.so_luong_in, so_luong: t.so_luong, stt: t.stt, tong: t.tong, ma_bo_phan: t.ma_bo_phan });
  const khName = id => (window.Catalog && window.Catalog.byId(id)?.ten_ngan) || 'khác';

  async function quet(raw) {
    const ma = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ma || busy) return;
    busy = true;
    try {
      let t;
      try { t = (await api('/api/tem/ma/' + encodeURIComponent(ma))).data; } catch (err) { beep(false); msg('err', esc(err.message)); return; }
      if (t.trang_thai === 'huy') { beep(false); msg('err', `Tem <b>${esc(t.ma_tem)}</b> đã bị hủy – không dùng được.`); return; }
      // Khách của tem
      if (t.khach_hang_id !== (AppState.khachHangId || null)) {
        if (AppState.currentEditingId) {
          beep(false);
          msg('err', `Tem <b>${esc(t.ma_tem)}</b> của khách <b>${esc(khName(t.khach_hang_id))}</b> – đang sửa phiếu của khách khác.`);
          return;
        }
        const cu = AppState.khachHangId ? khName(AppState.khachHangId) : '';
        if (!window.KH || !window.KH.set(t.khach_hang_id) || AppState.khachHangId !== t.khach_hang_id) { msg('warn', 'Chưa chuyển khách – tem chưa được nhận.'); return; }
        showToast(`Đã chuyển sang khách ${khName(t.khach_hang_id)} theo tem${cu ? ` – phiếu đang lập của ${cu} vẫn giữ nháp` : ''}`, 'info');
      }
      if (t.trang_thai === 'da_xuat' && t.phieu_id && t.phieu_id !== AppState.currentEditingId) {
        beep(false);
        msg('err', `Tem <b>${esc(t.ma_tem)}</b> đã xuất ở phiếu <b>${esc(t.so_phieu || '')}</b> ngày ${esc(viDate(t.phieu_ngay))} – không cộng lại.`);
        return;
      }
      const had = tems().find(x => x.id === t.id);
      if (had) {
        beep(false); lastId = t.id;
        msg('warn', `Tem <b>${esc(t.ma_tem)}</b> đã có trong phiếu này – không cộng lại. Sửa số ở thẻ tem nếu cần.`);
        refreshGrid(AppState.rows.findIndex(r => sameLine(r, t)), t.size);
        return;
      }
      // Bộ phận: tem đầu tiên của phiếu mới chọn bộ phận; tem khác bộ phận thì hỏi
      const sel = $('slip-bophan');
      const bp = t.ma_bo_phan || '';
      if (bp && sel && sel.value !== bp) {
        if (!tems().length && !AppState.currentEditingId) {
          setDeptValue(bp);
          sel.dispatchEvent(new Event('change')); // lấy số phiếu mới theo bộ phận
        } else {
          beep(false);
          if (!confirm(`Tem ${t.ma_tem} của bộ phận ${bp}, phiếu đang là ${sel.value}.\n\nVẫn thêm tem này vào phiếu ${sel.value}?`)) {
            msg('warn', `Chưa nhận tem <b>${esc(t.ma_tem)}</b> (bộ phận ${esc(bp)}). Lưu phiếu này trước rồi quét để lập phiếu ${esc(bp)}.`);
            return;
          }
        }
      }
      // Phiếu theo size, xuất theo đôi
      if (AppState.currentMau !== 3) switchMau(3);
      const kh = currentCustomer();
      if (kh && kh.co_bo_chi_tiet && AppState.kieuXuat !== 'doi') setKieuXuat('doi');
      const e = { ...pick(t), so_luong: t.so_luong_in };
      tems().push(e);
      const i = addToGrid(e, e.so_luong);
      lastId = e.id;
      beep(true);
      msg('ok', `+ Tem <b>${esc(e.ma_tem)}</b>: PO ${esc(e.po)} · size <b>${esc(e.size)}</b> · <b>${fmt0(e.so_luong)}</b> đôi.`);
      refreshGrid(i, e.size);
    } finally {
      busy = false;
    }
  }

  function suaSo(id, v) {
    const e = tems().find(x => x.id === id);
    if (!e || !(v >= 0) || v === e.so_luong) return;
    const i = addToGrid(e, v - e.so_luong);
    const cu = e.so_luong;
    e.so_luong = v;
    lastId = id;
    msg('warn', `Đã sửa tem <b>${esc(e.ma_tem)}</b> từ ${fmt0(cu)} thành <b>${fmt0(v)}</b> đôi (in sẵn ${fmt0(e.so_luong_in)}) – <b>nhớ ghi tay lên tem</b>.`);
    refreshGrid(i, e.size);
  }
  function boTem(id) {
    const e = tems().find(x => x.id === id);
    if (!e) return;
    const i = addToGrid(e, -e.so_luong);
    AppState.tems = tems().filter(x => x.id !== id);
    if (lastId === id) lastId = null;
    msg('warn', `Đã bỏ tem <b>${esc(e.ma_tem)}</b> khỏi phiếu (trừ ${fmt0(e.so_luong)} đôi ở size ${esc(e.size)}).`);
    refreshGrid(i, e.size);
  }

  /* ---------------- Giao diện ---------------- */
  function mount() {
    if ($('tsc')) return;
    const wrap = document.querySelector('#tab-create .ui-grid-wrap');
    if (!wrap) return;
    const box = document.createElement('div');
    box.id = 'tsc';
    box.className = 'tsc';
    box.innerHTML = `
      <div class="tsc-bar">
        <label class="tsc-lbl" for="tsc-in">Quét tem<small>Súng quét hoặc gõ mã rồi Enter · <kbd>F2</kbd> về ô quét</small></label>
        <input id="tsc-in" class="tsc-in" type="text" placeholder="Quét / gõ mã tem" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done">
        <button type="button" class="ui-btn ui-btn-ghost tsc-cam-btn" id="tsc-cam-btn">📷 Camera</button>
        <button type="button" class="tsc-sum" id="tsc-sum" aria-expanded="false" aria-controls="tsc-list">🏷 0 tem</button>
      </div>
      <div class="tsc-msg" id="tsc-msg" role="status" aria-live="polite"></div>
      <div id="tsc-card"></div>
      <div class="tsc-list" id="tsc-list" hidden></div>`;
    wrap.parentNode.insertBefore(box, wrap);
    $('tsc-in').addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229 || e.key !== 'Enter') return;
      e.preventDefault();
      const v = e.target.value;
      e.target.value = '';
      quet(v);
    });
    $('tsc-cam-btn').addEventListener('click', openCam);
    $('tsc-sum').addEventListener('click', () => { showList = !showList; renderBar(); });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-tsc]');
      if (!b) return;
      const id = +b.dataset.id;
      if (b.dataset.tsc === 'save') { const inp = $('tsc-sl'); suaSo(id, Math.floor(parseVnNumber(inp && inp.value))); $('tsc-in').focus(); }
      if (b.dataset.tsc === 'bo' && confirm('Bỏ tem này khỏi phiếu? Số đôi của tem sẽ được trừ khỏi bảng.')) { boTem(id); $('tsc-in').focus(); }
      if (b.dataset.tsc === 'pick') { lastId = id; renderBar(); }
    });
    box.addEventListener('change', e => {
      const id = +e.target.dataset.sl;
      if (id) suaSo(id, Math.floor(parseVnNumber(e.target.value)));
    });
    box.addEventListener('keydown', e => {
      if (e.target.id === 'tsc-sl' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); box.querySelector('[data-tsc="save"]')?.click(); }
    });
  }

  function renderBar() {
    const box = $('tsc');
    if (!box) return;
    box.hidden = !on();
    if (!on()) return;
    const list = tems();
    const tp = list.reduce((a, e) => a + (e.so_luong || 0), 0);
    const sum = $('tsc-sum');
    sum.textContent = list.length ? `🏷 ${list.length} tem · ${fmt0(tp)} đôi` : '🏷 0 tem';
    sum.setAttribute('aria-expanded', String(showList));
    // Thẻ tem vừa quét
    const e = lastId && list.find(x => x.id === lastId);
    $('tsc-card').innerHTML = e
      ? `<div class="tsc-card">
          <div class="tsc-big"><div>SIZE<b>${esc(e.size)}</b></div><div>SỐ ĐÔI<b>${fmt0(e.so_luong)}</b></div><div>PO<b class="tsc-po">${esc(e.po)}</b></div></div>
          <div class="tsc-meta"><span class="tsc-mono">${esc(e.ma_tem)}</span> · ART ${esc(e.art)} · Tem ${e.stt}/${e.tong} · ${esc(e.ma_bo_phan)} · in sẵn ${fmt0(e.so_luong_in)} đôi</div>
          <div class="tsc-edit"><label for="tsc-sl">Số thực</label><input type="text" inputmode="numeric" id="tsc-sl" class="ui-input" value="${e.so_luong}">
            <button type="button" class="ui-btn ui-btn-primary" data-tsc="save" data-id="${e.id}">Lưu số</button>
            <button type="button" class="ui-btn ui-btn-ghost" data-tsc="bo" data-id="${e.id}">Bỏ tem</button>
            ${e.so_luong !== e.so_luong_in ? '<span class="tsc-changed">Đã sửa – nhớ ghi tay lên tem</span>' : ''}</div></div>`
      : (list.length ? '' : '<div class="tsc-card tsc-card-empty">Chưa quét tem nào. Đặt con trỏ ở ô quét rồi bóp cò súng quét, hoặc bấm 📷 Camera trên điện thoại.</div>');
    // Danh sách tem của phiếu
    const lb = $('tsc-list');
    lb.hidden = !showList;
    if (!showList) return;
    lb.innerHTML = list.length
      ? `<table class="v3-table v3-table-mini tsc-table"><thead><tr><th>#</th><th>Mã tem</th><th>PO · Mã hàng</th><th class="c">Size</th><th class="r">In sẵn</th><th class="c">Số thực</th><th></th></tr></thead><tbody>
        ${list.map((x, i) => `<tr class="${x.id === lastId ? 'v3-row-on' : ''}"><td>${i + 1}</td><td><button type="button" class="tsc-link tsc-mono" data-tsc="pick" data-id="${x.id}">${esc(x.ma_tem)}</button></td>
          <td>${esc(x.po)} · ${esc(x.art)}</td><td class="c"><b>${esc(x.size)}</b></td><td class="r">${fmt0(x.so_luong_in)}</td>
          <td class="c"><input type="text" inputmode="numeric" class="tsc-sl-in${x.so_luong !== x.so_luong_in ? ' is-changed' : ''}" data-sl="${x.id}" value="${x.so_luong}" aria-label="Số thực tem ${esc(x.ma_tem)}"></td>
          <td><button type="button" class="ui-btn-sm ui-btn-sm-danger" data-tsc="bo" data-id="${x.id}">Bỏ tem</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="ui-hint">Phiếu chưa có tem nào.</p>';
  }

  /* ---------------- Camera ---------------- */
  let stream = null, det = null, camRun = false, lastCode = '', lastAt = 0, canvas, cctx;
  function loadJsQR() {
    return window.jsQR ? Promise.resolve() : new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = '/vendor/jsQR.js'; s.onload = res; s.onerror = () => rej(new Error('Không tải được bộ đọc QR')); document.head.appendChild(s);
    });
  }
  function camBox() {
    let c = $('tsc-cam');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'tsc-cam';
    c.className = 'tsc-cam';
    c.innerHTML = `<video id="tsc-video" playsinline muted></video><div class="tsc-frame" aria-hidden="true"></div>
      <div class="tsc-cam-ctl"><div id="tsc-cam-status" role="status" aria-live="polite">Đang mở camera…</div>
        <button type="button" class="ui-btn ui-btn-primary" id="tsc-cam-close">Xong</button></div>`;
    document.body.appendChild(c);
    $('tsc-cam-close').addEventListener('click', closeCam);
    return c;
  }
  async function openCam() {
    const c = camBox();
    c.classList.add('on');
    $('tsc-cam-status').textContent = 'Đang mở camera…';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('trình duyệt không hỗ trợ (cần mở bằng https)');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const v = $('tsc-video');
      v.srcObject = stream;
      await v.play();
      det = null;
      if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (_) { det = null; } }
      if (!det) await loadJsQR();
      $('tsc-cam-status').textContent = 'Đưa tem vào khung – quét liên tục, mỗi tem bíp 1 lần';
      camRun = true;
      scanLoop();
    } catch (err) {
      $('tsc-cam-status').textContent = 'Không mở được camera: ' + err.message;
    }
  }
  function closeCam() {
    camRun = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    $('tsc-cam')?.classList.remove('on');
    $('tsc-in')?.focus();
  }
  function onCode(code) {
    const now = Date.now();
    if (code === lastCode && now - lastAt < 2000) return; // cùng 1 tem còn trong khung
    lastCode = code; lastAt = now;
    quet(code);
  }
  async function scanLoop() {
    if (!camRun) return;
    const v = $('tsc-video');
    try {
      if (v.readyState >= 2 && !busy) {
        if (det) {
          const r = await det.detect(v);
          if (r[0]) onCode(r[0].rawValue);
        } else if (window.jsQR) {
          canvas = canvas || document.createElement('canvas');
          cctx = cctx || canvas.getContext('2d', { willReadFrequently: true });
          const sc = Math.min(1, 640 / v.videoWidth);
          canvas.width = v.videoWidth * sc; canvas.height = v.videoHeight * sc;
          cctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = cctx.getImageData(0, 0, canvas.width, canvas.height);
          const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (r && r.data) onCode(r.data);
        }
      }
    } catch (_) {}
    setTimeout(scanLoop, 150);
  }

  /* ---------------- Khởi động ---------------- */
  function init() {
    (window.AuthReady || Promise.resolve()).then(() => {
      if (!on()) return;
      mount();
      paint();
    });
    // F2: về ô quét khi đang ở tab Lập phiếu
    document.addEventListener('keydown', e => {
      if (e.key === 'F2' && on() && $('tab-create')?.classList.contains('active')) { e.preventDefault(); $('tsc-in')?.focus(); }
    });
    // Mở tab Lập phiếu -> con trỏ vào ô quét (khi bảng chưa có ô nào đang gõ)
    document.querySelector('.tab-btn[data-target="tab-create"]')?.addEventListener('click', () => {
      if (on()) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) $('tsc-in')?.focus(); }, 60);
    });
  }

  window.TemScan = {
    on,
    paint,
    /** Danh sách tem gửi kèm khi lưu phiếu; undefined = không gửi (máy chủ giữ nguyên tem của phiếu) */
    payload: () => (on() ? tems().map(e => ({ id: e.id, so_luong: e.so_luong })) : undefined),
    /** Phiếu mới / đổi phiếu: bỏ thẻ tem vừa quét và thông báo cũ */
    reset() { lastId = null; showList = false; msg('', ''); },
    pick,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
