/**
 * TAB 🏷️ IN TEM QR (tab-intem) – đang thử, chỉ admin thấy
 * - Đơn của khách đang chọn (thanh bên) -> bảng PO/ART × size: Đặt · đã in · ô In thêm -> chia mỗi tem N đôi (29, 10 -> 10·10·9).
 * - Loại May (tổ CMA/CMB/CMC) hoặc Chặt (TC). QR chỉ chứa mã tem; quét tem ở tab Lập phiếu xuất.
 * - Mẫu tem 50×40 (chốt 29/10/2026): ô kẻ song ngữ Trung – Việt (Tổ, ART, PO, Chi tiết, Ngày ĐG, Size, SL, Người ĐG, Ghi chú) + QR góc phải.
 * - 2 chế độ in (nhớ theo từng máy): máy in tem 50×40 (mỗi tem 1 trang, đen trắng) hoặc giấy A4 (giấy thường cắt tay / decal chia ô,
 *   tự chỉnh, bắt đầu từ ô số, in thử khung căn chỉnh; in màu như thiết kế hoặc đen trắng).
 * - Danh sách tem: lọc đơn / trạng thái / loại, tick chọn nhiều tem in lại (giữ nguyên mã), in lại tất cả tem chưa xuất, hủy tem chưa xuất.
 */
(function () {
  const { esc, fmt0, api, toast, normSize, khSizes, viDate, store, once, seq, latest, printHtml, $ } = window.U;
  const C = () => window.Catalog || { byId: () => null };
  const khId = () => (window.KH ? window.KH.one() : null);
  const qty = v => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10) || 0;

  const OKEY = 'DD_TEM_OPT_V1'; // Chi tiết / Người đóng gói gõ lần trước (nhớ theo máy)
  const opt = store.get(OKEY, {}) || {};
  const S = { data: null, donId: null, loai: 'may', to: '', moi: 10, chiTiet: opt.chiTiet || 'Đồng bộ', nguoiDg: opt.nguoiDg || '',
    list: [], sel: new Set(), f: { don: '', tt: 'moi', loai: '' } };
  const saveOpt = () => store.set(OKEY, { chiTiet: S.chiTiet, nguoiDg: S.nguoiDg });

  /* ---------------- Chế độ in (nhớ theo máy) ---------------- */
  const TW = 50, TH = 40; // khổ tem (mm)
  const PRESETS = {
    a4_4x7: { ten: 'Giấy A4 thường · 4×7 = 28 tem 50×40 (in rồi cắt tay)', cot: 4, hang: 7, w: 50, h: 40, top: 8.5, left: 5, gx: 0, gy: 0, cat: true },
    dc_3x7: { ten: 'Decal A4 chia sẵn · 3×7 = 21 tem 70×42,3 mm', cot: 3, hang: 7, w: 70, h: 42.3, top: 0.5, left: 0, gx: 0, gy: 0, cat: false },
    dc_3x8: { ten: 'Decal A4 chia sẵn · 3×8 = 24 tem 70×37 mm (tem thu nhỏ một chút)', cot: 3, hang: 8, w: 70, h: 37, top: 0.5, left: 0, gx: 0, gy: 0, cat: false },
    tu_chinh: { ten: 'Tự chỉnh (đo tờ decal của bạn)' },
  };
  const PKEY = 'DD_TEM_IN_V1';
  let P = store.get(PKEY, null);
  // Cài đặt của mẫu tem 50×30 cũ -> về mặc định mẫu 50×40
  if (!P || !P.cot || P.ver !== 2) P = { ver: 2, mode: 'a4', preset: 'a4_4x7', batDau: 1, den: false, ...PRESETS.a4_4x7 };
  const saveP = () => store.set(PKEY, P);
  const perSheet = () => P.cot * P.hang;
  const startCell = () => Math.min(perSheet(), Math.max(1, parseInt(P.batDau, 10) || 1));
  const soTo = n => (n ? 1 + Math.floor((startCell() - 1 + n - 1) / perSheet()) : 0);
  const presetTen = () => (PRESETS[P.preset] || PRESETS.tu_chinh).ten.split(' · ')[0];

  /* ---------------- Tem 50×40 ---------------- */
  const TEM_CSS = `
    .tem { width: 50mm; height: 40mm; padding: .8mm; box-sizing: border-box; background: #fff; overflow: hidden;
      --ink: #1f2d5c; --lab: #5a6478; --tick: #9aa6ba; --acc: #c2185b; --stamp: #5b3fa0; --tw: .07mm; }
    .tem.den { --ink: #000; --lab: #000; --tick: #000; --acc: #000; --stamp: #000; }
    .tem-b { height: 100%; box-sizing: border-box; border: .35mm solid var(--ink); border-radius: 2mm; padding: 1mm 1.4mm 1.1mm;
      display: flex; flex-direction: column; justify-content: space-between; color: var(--ink); font-family: Arial, "Microsoft YaHei", "SimHei", "PingFang SC", sans-serif; }
    .tem-f { display: flex; align-items: flex-end; gap: .8mm; flex: 1; min-width: 0; }
    .tem-l { flex: none; width: 7.2mm; line-height: 1.05; }
    .tem-l.n { width: 6.8mm; }
    .tem-l i { display: block; font-style: normal; font-size: 1.3mm; color: var(--lab); white-space: nowrap; }
    .tem-l b { display: block; font-size: 1.5mm; white-space: nowrap; }
    .tem-v { flex: 1; min-width: 0; font-weight: 700; font-size: 2.3mm; line-height: 1.1; padding: 0 .4mm .1mm; white-space: nowrap; overflow: hidden;
      border-bottom: .22mm solid var(--ink); min-height: 2.5mm;
      background: repeating-linear-gradient(90deg, transparent 0 2.7mm, var(--tick) 2.7mm calc(2.7mm + var(--tw))) left bottom / 100% 1mm no-repeat; }
    .tem.den .tem-v { --tw: .15mm; }
    .tem-row { display: flex; gap: 1.4mm; flex: 1; align-items: flex-end; }
    .tem-top { display: flex; gap: 1.1mm; align-items: flex-start; }
    .tem-top > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
    .tem-q { flex: none; width: 10.5mm; height: 10.5mm; }
    .tem-q svg { width: 10.5mm; height: 10.5mm; display: block; }
    .tem-date { font-family: "Courier New", monospace; font-size: 1.7mm; letter-spacing: .08mm; color: var(--stamp); padding-bottom: .35mm; }
    .tem-sl { border-bottom-color: var(--acc); }
    .tem-br { flex: none; text-align: right; line-height: 1.15; padding-bottom: .3mm; }
    .tem-br b { display: block; font-size: 1.6mm; }
    .tem-br span { display: block; font-family: "Courier New", monospace; font-weight: 700; font-size: 1.15mm; color: var(--acc); white-space: nowrap; }
    .tem-gc { font-size: 1.9mm; }
    .tsheet { width: 210mm; height: 297mm; position: relative; background: #fff; overflow: hidden; page-break-after: always; break-after: page; }
    .tsheet:last-child { page-break-after: auto; break-after: auto; }
    .tcel { position: absolute; overflow: hidden; box-sizing: border-box; }
    .tcel.cut { outline: .2mm dashed #888; outline-offset: -.1mm; }
    .tcel-in { position: absolute; transform-origin: 0 0; }
    .tcel-no { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 700 9pt Arial, sans-serif; color: #555; }
    .truler { position: absolute; left: 55mm; top: 141mm; width: 100mm; background: #fff; font: 8pt Arial, sans-serif; color: #000; text-align: center; padding: 1mm 0; }
    .truler i { display: block; height: 3mm; border: .3mm solid #000; border-top: 0; margin-bottom: .8mm; }`;
  function qrSvg(text) {
    if (!window.qrcode) return `<div style="width:10.5mm;height:10.5mm;border:.3mm solid #000;font-size:1.2mm;display:flex;align-items:center;justify-content:center">${esc(text)}</div>`;
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }
  const THANG = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  /** Ngày đóng gói = ngày in tem, kiểu "29 OCT 2026" */
  const ngayDg = ms => { const d = new Date(ms || Date.now()); return `${String(d.getDate()).padStart(2, '0')} ${THANG[d.getMonth()]} ${d.getFullYear()}`; };
  /** Máy in tem nhiệt chỉ in đen; giấy A4 in màu như thiết kế trừ khi chọn đen trắng */
  const temDen = () => P.mode !== 'a4' || !!P.den;
  const field = (cn, vn, val, cls = '', n = false) => `<div class="tem-f"><div class="tem-l${n ? ' n' : ''}"><i>${cn}</i><b>${vn}</b></div><div class="tem-v ${cls}">${val}</div></div>`;
  function temHtml(t) {
    const ghiChu = [String(t.mau || '').toLocaleUpperCase('vi'), `Tem ${t.stt}/${t.tong}`].filter(Boolean).join(' · ');
    return `<div class="tem${temDen() ? ' den' : ''}"><div class="tem-b">
      <div class="tem-top"><div>${field('组别', 'TỔ', esc(t.ma_bo_phan))}${field('款号', 'ART', esc(t.art))}</div><div class="tem-q">${qrSvg(t.ma_tem)}</div></div>
      ${field('PO号', 'PO', esc(t.po))}
      <div class="tem-row">${field('明细', 'CHI TIẾT', esc(t.chi_tiet || 'Đồng bộ'))}${field('包装日期', 'NGÀY ĐG', ngayDg(t.in_luc), 'tem-date', true)}</div>
      <div class="tem-row">${field('尺码', 'SIZE', `${esc(t.size)}#`)}${field('数量', 'SL', fmt0(t.so_luong_in), 'tem-sl', true)}
        <div class="tem-br"><b>D&amp;D</b><span>${esc(t.ma_tem)}</span></div></div>
      ${field('包装人', 'NGƯỜI ĐG', esc(t.nguoi_dg || ''))}
      ${field('备注', 'GHI CHÚ', esc(ghiChu), 'tem-gc')}
    </div></div>`;
  }

  /** Chia tem vào các tờ A4: tờ đầu bỏ qua các ô trước "Bắt đầu từ ô số"; test = khung trống đánh số ô */
  function sheets(list, test) {
    const per = perSheet(), total = test ? per - startCell() + 1 : list.length, pages = [];
    let page = [], pos = startCell() - 1;
    for (let i = 0; i < total; i++) {
      if (pos >= per) { pages.push(page); page = []; pos = 0; }
      page.push({ pos, t: test ? null : list[i] });
      pos++;
    }
    if (page.length) pages.push(page);
    return pages;
  }
  const cellBox = pos => { const c = pos % P.cot, r = Math.floor(pos / P.cot); return { x: P.left + c * (P.w + P.gx), y: P.top + r * (P.h + P.gy) }; };
  function sheetHtml(list, test) {
    const s = Math.min(P.w / TW, P.h / TH), ox = (P.w - TW * s) / 2, oy = (P.h - TH * s) / 2;
    const ruler = '<div class="truler"><i></i>Đoạn trên phải dài đúng 10 cm – nếu không, chọn Tỉ lệ 100% / Kích thước thực</div>';
    return sheets(list, test).map(pg => `<div class="tsheet">${pg.map(x => {
      const b = cellBox(x.pos);
      return `<div class="tcel${P.cat || test ? ' cut' : ''}" style="left:${b.x}mm;top:${b.y}mm;width:${P.w}mm;height:${P.h}mm">${x.t
        ? `<div class="tcel-in" style="left:${ox}mm;top:${oy}mm;transform:scale(${s})">${temHtml(x.t)}</div>`
        : `<div class="tcel-no">Ô ${x.pos + 1}</div>`}</div>`;
    }).join('')}${test ? ruler : ''}</div>`).join('');
  }
  function a4Overflow() {
    const r = P.left + P.cot * P.w + (P.cot - 1) * P.gx, b = P.top + P.hang * P.h + (P.hang - 1) * P.gy;
    const e = [];
    if (r > 210.05) e.push(`rộng ${r.toFixed(1)} mm > 210`);
    if (b > 297.05) e.push(`cao ${b.toFixed(1)} mm > 297`);
    if (P.left < 0 || P.top < 0) e.push('lề không được âm');
    return e.length ? `Vượt khổ A4: ${e.join(', ')} – bớt cột / hàng hoặc giảm lề.` : '';
  }
  const doc = (page, body) => `<!doctype html><html><head><meta charset="utf-8"><title>In tem</title><style>${TEM_CSS}
    ${page} html, body { margin: 0; padding: 0; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head><body>${body}</body></html>`;
  const A4_PAGE = '@page { size: A4 portrait; margin: 0; }';
  function printTems(list) {
    if (P.mode === 'a4') printHtml(doc(A4_PAGE, sheetHtml(list)));
    else printHtml(doc(`@page { size: ${TW}mm ${TH}mm; margin: 0; } .tem { page-break-after: always; break-after: page; } .tem:last-child { page-break-after: auto; break-after: auto; }`, list.map(temHtml).join('')));
  }

  /* ---------------- Hộp xem trước ---------------- */
  let modalJob = null;
  function modal(title, body, job) {
    let m = $('tem-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'tem-modal';
      m.className = 'tem-modal ui-scope';
      m.innerHTML = `<div class="tem-modal-box" role="dialog" aria-modal="true" aria-labelledby="tem-modal-title">
        <div class="tem-modal-head"><h3 id="tem-modal-title"></h3><button type="button" class="ui-btn ui-btn-ghost" data-m="close">Đóng</button>
          <button type="button" class="ui-btn ui-btn-primary" data-m="print">🖨 In</button></div><div class="tem-modal-body"></div></div>`;
      document.body.appendChild(m);
      m.addEventListener('click', e => {
        const a = e.target.closest('[data-m]')?.dataset.m;
        if (a === 'close' || e.target === m) m.hidden = true;
        if (a === 'print' && modalJob) modalJob();
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) m.hidden = true; });
      const st = document.createElement('style');
      st.textContent = TEM_CSS;
      document.head.appendChild(st);
    }
    m.querySelector('#tem-modal-title').textContent = title;
    m.querySelector('.tem-modal-body').innerHTML = body;
    modalJob = job;
    m.hidden = false;
    m.querySelector('[data-m="print"]').focus();
  }
  function showTems(list, title) {
    const body = P.mode === 'a4'
      ? `<p class="ui-hint">${list.length} tem trên <b>${soTo(list.length)}</b> tờ A4 (${esc(presetTen())}, bắt đầu ô ${startCell()}). Bấm <b>In</b>: khổ A4, Lề <b>Không có</b>, Tỉ lệ <b>100%</b>.</p>
         <div class="tem-a4prev">${sheetHtml(list)}</div>`
      : `<p class="ui-hint">${list.length} tem · xem trước (phóng to). Bấm <b>In</b> để in ra máy in tem ${TW}×${TH}, mỗi tem 1 trang (đen trắng).</p>
         <div class="tem-prev">${list.map(temHtml).join('')}</div>`;
    modal(title, body, () => printTems(list));
  }

  /* ---------------- Vẽ tab ---------------- */
  function render() {
    const root = $('tem-root');
    if (!khId()) {
      root.innerHTML = `${head()}<section class="ui-panel"><p class="v3-need-kh">Chọn <b>1 khách hàng</b> ở thanh bên trái để in tem.</p></section>`;
      return;
    }
    root.innerHTML = `${head()}
      <section class="ui-panel">
        <h3 class="ui-panel-title">1. Chọn số cần in tem</h3>
        <div class="tem-opts">
          <label class="ui-field"><span class="ui-label">Đơn hàng</span><select class="ui-input" id="tem-don"></select></label>
          <div class="ui-field"><span class="ui-label">Loại tem</span><div class="ui-seg" role="group" aria-label="Loại tem">
            <button type="button" class="ui-seg-btn ${S.loai === 'may' ? 'active' : ''}" data-loai="may">May</button>
            <button type="button" class="ui-seg-btn ${S.loai === 'chat' ? 'active' : ''}" data-loai="chat">Chặt (TC)</button></div></div>
          <label class="ui-field"><span class="ui-label">Tổ may</span><select class="ui-input" id="tem-to"></select></label>
          <label class="ui-field tem-moi"><span class="ui-label">Mỗi tem (đôi)</span><input type="text" inputmode="numeric" class="ui-input" id="tem-moi" value="${S.moi}"></label>
          <label class="ui-field"><span class="ui-label">Chi tiết <span class="ui-label-note">in ô 明细</span></span><input type="text" class="ui-input" id="tem-chitiet" maxlength="40" value="${esc(S.chiTiet)}"></label>
          <label class="ui-field"><span class="ui-label">Người đóng gói <span class="ui-label-note">trống = viết tay</span></span><input type="text" class="ui-input" id="tem-nguoidg" maxlength="40" value="${esc(S.nguoiDg)}" placeholder="Để trống"></label>
        </div>
        <div class="v3-table-wrap"><table class="v3-table tem-don" id="tem-don-tbl"><tbody><tr><td class="v3-empty">Đang tải đơn hàng…</td></tr></tbody></table></div>
        <p class="ui-hint tem-mb">Ô số = <b>In thêm</b> (mặc định = đặt − đã in tem cùng loại). Ví dụ 29 đôi, mỗi tem 10 → 3 tem 10 · 10 · 9.</p>
        <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="fill">Điền số còn lại</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="clear">Xóa hết số</button><div class="ui-flex-fill"></div>
          <span class="v3-grand" id="tem-total"></span>
          <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" data-act="tao" id="tem-tao" disabled>Tạo &amp; in tem</button></div>
      </section>
      <section class="ui-panel">
        <h3 class="ui-panel-title">2. Chế độ in <span class="ui-label-note">nhớ riêng trên máy này</span></h3>
        <div class="tem-mode-row"><div class="ui-seg ui-seg-lg" role="group" aria-label="Chế độ in" id="tem-mode">
          <button type="button" class="ui-seg-btn" data-mode="a4">📄 Giấy A4</button>
          <button type="button" class="ui-seg-btn" data-mode="nhiet">🏷️ Máy in tem 50×40</button></div>
          <span class="ui-hint" id="tem-mode-hint"></span></div>
        <div class="tem-a4" id="tem-a4" hidden>
          <div>
            <div class="tem-a4-row">
              <label class="ui-field tem-a4-preset"><span class="ui-label">Khổ giấy / mẫu decal</span><select class="ui-input" id="tem-preset"></select></label>
              <label class="ui-field tem-a4-start"><span class="ui-label">Bắt đầu từ ô số</span><input type="number" min="1" class="ui-input" id="tem-batdau"></label>
              <label class="tem-check"><input type="checkbox" id="tem-cat"> In đường cắt</label>
              <label class="tem-check"><input type="checkbox" id="tem-den"> In đen trắng</label>
            </div>
            <div class="tem-a4-nums">
              ${[['cot', 'Số cột'], ['hang', 'Số hàng'], ['w', 'Rộng ô (mm)'], ['h', 'Cao ô (mm)'], ['top', 'Lề trên (mm)'], ['left', 'Lề trái (mm)'], ['gx', 'Cách ngang (mm)'], ['gy', 'Cách dọc (mm)']]
                .map(([k, t]) => `<label class="ui-field"><span class="ui-label">${t}</span><input type="number" step="${k === 'cot' || k === 'hang' ? 1 : 0.1}" class="ui-input" data-a4="${k}"></label>`).join('')}
            </div>
            <div class="tem-warn" id="tem-a4-warn" role="alert"></div>
            <div class="v3-actions"><button type="button" class="ui-btn ui-btn-ghost" data-act="khung-in">In thử khung</button>
              <button type="button" class="ui-btn ui-btn-ghost" data-act="khung-xem">Xem khung</button></div>
            <p class="ui-hint">Hộp thoại in: khổ <b>A4</b>, Lề <b>Không có</b>, Tỉ lệ <b>100% / Kích thước thực</b>.
              Decal chia ô: <b>In thử khung</b> ra giấy thường, chồng lên tờ decal soi đèn — khung lệch xuống thì giảm Lề trên, lệch sang phải thì giảm Lề trái.
              Tờ decal đã bóc dở: sửa <b>Bắt đầu từ ô số</b> để in tiếp vào ô còn trống.</p>
          </div>
          <div><svg class="tem-mini" id="tem-mini" viewBox="0 0 210 297" role="img" aria-label="Sơ đồ ô tem trên tờ A4"></svg><div class="tem-mini-cap" id="tem-mini-cap"></div></div>
        </div>
      </section>
      <section class="ui-panel">
        <div class="ui-panel-head tem-list-head"><h3 class="ui-panel-title">3. Danh sách tem · in lại</h3></div>
        <div class="tem-opts">
          <label class="ui-field"><span class="ui-label">Đơn hàng</span><select class="ui-input" id="tem-f-don"></select></label>
          <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="tem-f-tt">
            <option value="moi">Chưa xuất</option><option value="da_xuat">Đã xuất</option><option value="huy">Đã hủy</option><option value="">Tất cả</option></select></label>
          <label class="ui-field"><span class="ui-label">Loại</span><select class="ui-input" id="tem-f-loai"><option value="">May + Chặt</option><option value="may">May</option><option value="chat">Chặt</option></select></label>
        </div>
        <div class="v3-actions tem-sel-bar"><span class="ui-hint" id="tem-sel-info"></span><div class="ui-flex-fill"></div>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="inlai-chon" id="tem-inlai-chon" disabled>🖨 In lại tem đã chọn</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-act="inlai-con" id="tem-inlai-con" disabled>🖨 In lại tất cả tem chưa xuất</button></div>
        <p class="ui-hint tem-mb">In lại giữ nguyên mã tem / QR (không tạo tem mới): bản nào quét trước thì được tính, quét lại bản kia sẽ bị báo trùng.</p>
        <div class="v3-table-wrap"><table class="v3-table v3-table-mini" id="tem-list-tbl"><tbody><tr><td class="v3-empty">Đang tải…</td></tr></tbody></table></div>
      </section>`;
    $('tem-f-tt').value = S.f.tt;
    $('tem-f-loai').value = S.f.loai;
    renderMode();
    loadData();
  }
  const head = () => `<header class="ui-page-head"><h2>In tem QR <span class="ui-badge ui-badge-warn">Đang thử · chỉ admin</span></h2>
    <p>Mỗi tem = 1 PO/ART + 1 size + số đôi. In xong dán tem lên hàng; khi giao, quét tem ở tab <b>Lập phiếu xuất</b> để thành số trên phiếu.</p></header>`;

  /* ---------------- Đơn hàng ---------------- */
  async function loadData() {
    const n = seq('tem-dh');
    try {
      const d = await api('/api/tem/donhang?khach_hang_id=' + khId());
      if (!latest('tem-dh', n)) return;
      S.data = d;
      const dons = donOptions();
      if (!dons.some(x => x.id === S.donId)) S.donId = dons.length ? dons[0].id : null;
      if (d.co_dinh) S.to = d.co_dinh;
      else if (!d.to.some(t => t.ma === S.to)) S.to = d.to[0]?.ma || '';
      if (!$('tem-don')) return;
      $('tem-don').innerHTML = dons.length ? dons.map(x => `<option value="${x.id}" ${x.id === S.donId ? 'selected' : ''}>${esc(x.so_don)}</option>`).join('') : '<option value="">(chưa có đơn)</option>';
      $('tem-f-don').innerHTML = '<option value="">Tất cả đơn</option>' + dons.map(x => `<option value="${x.id}">${esc(x.so_don)}</option>`).join('');
      $('tem-f-don').value = S.f.don;
      renderTo();
      renderDon();
      loadList();
    } catch (err) {
      const t = $('tem-don-tbl');
      if (t) t.innerHTML = `<tbody><tr><td class="v3-empty">Lỗi tải đơn hàng: ${esc(err.message)}</td></tr></tbody>`;
    }
  }
  function donOptions() {
    const d = S.data;
    if (!d) return [];
    const has = new Set(d.lines.map(l => l.don_id || 0));
    const out = d.dons.filter(x => has.has(x.id)).map(x => ({ id: x.id, so_don: x.so_don }));
    if (has.has(0)) out.push({ id: 0, so_don: '(PO chưa thuộc đơn)' });
    return out;
  }
  function renderTo() {
    const sel = $('tem-to');
    if (!sel || !S.data) return;
    if (S.loai === 'chat') { sel.innerHTML = '<option>TC – Tổ chặt</option>'; sel.disabled = true; return; }
    sel.disabled = !!S.data.co_dinh;
    sel.innerHTML = S.data.to.map(t => `<option value="${esc(t.ma)}" ${t.ma === S.to ? 'selected' : ''}>${esc(t.ma)} – ${esc(t.ten)}</option>`).join('');
  }
  const donLines = () => (S.data ? S.data.lines.filter(l => (l.don_id || 0) === S.donId) : []);
  function sizeCols(lines) {
    const base = khSizes(C().byId(khId()));
    const used = [];
    lines.forEach(l => l.sizes.forEach(s => { if (!used.includes(s.size)) used.push(s.size); }));
    return [...base.filter(s => used.includes(s)), ...used.filter(s => !base.includes(s))];
  }
  const daIn = s => (s.tem[S.loai] || { sl_in: 0, sl_xuat: 0 });
  function renderDon(keepInputs) {
    const tbl = $('tem-don-tbl');
    if (!tbl) return;
    const lines = donLines();
    if (!lines.length) {
      tbl.innerHTML = `<tbody><tr><td class="v3-empty">${S.data && S.data.lines.length ? 'Đơn này chưa có số theo size.' : 'Khách này chưa có đơn hàng có số theo size – nhập ở tab <b>Đơn hàng</b> trước.'}</td></tr></tbody>`;
      updateCount();
      return;
    }
    const old = {};
    if (keepInputs) tbl.querySelectorAll('input[data-po]').forEach(i => { old[`${i.dataset.po}|${i.dataset.size}`] = i.value; });
    const cols = sizeCols(lines);
    tbl.innerHTML = `<thead><tr><th>PO</th><th>ART</th><th>Màu</th>${cols.map(s => `<th class="c">${esc(s)}</th>`).join('')}<th class="r">Số tem</th></tr></thead>
      <tbody>${lines.map(l => `<tr><td><b>${esc(l.po)}</b></td><td>${esc(l.art)}</td><td>${esc(l.mau)}</td>${cols.map(c => {
        const s = l.sizes.find(x => x.size === c);
        if (!s) return '<td class="c ui-muted">–</td>';
        const di = daIn(s), con = Math.max(0, s.dat - di.sl_in);
        const k = `${l.po_id}|${s.size}`;
        const v = keepInputs && old[k] !== undefined ? old[k] : (con || '');
        return `<td class="tem-cell${con === 0 ? ' is-full' : ''}"><small>Đặt <b>${fmt0(s.dat)}</b> · in ${fmt0(di.sl_in)}${di.sl_xuat ? ` · xuất ${fmt0(di.sl_xuat)}` : ''}</small>
          <input type="text" inputmode="numeric" data-po="${l.po_id}" data-size="${esc(s.size)}" value="${v}" placeholder="0" aria-label="In thêm PO ${esc(l.po)} size ${esc(s.size)}"></td>`;
      }).join('')}<td class="r" data-temcnt="${l.po_id}"></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${3 + cols.length}" class="r">Tổng số tem sẽ in</td><td class="r"><b id="tem-sum-cell">0</b></td></tr></tfoot>`;
    updateCount();
  }
  const moi = () => Math.max(1, qty($('tem-moi')?.value) || 10);
  function pendingLines() {
    const out = [];
    $('tem-don-tbl')?.querySelectorAll('input[data-po]').forEach(i => { const n = qty(i.value); if (n > 0) out.push({ po_id: +i.dataset.po, size: i.dataset.size, so_luong: n }); });
    return out;
  }
  function updateCount() {
    const m = moi();
    const by = {};
    let tot = 0, pairs = 0;
    pendingLines().forEach(l => { const c = Math.ceil(l.so_luong / m); by[l.po_id] = (by[l.po_id] || 0) + c; tot += c; pairs += l.so_luong; });
    $('tem-don-tbl')?.querySelectorAll('[data-temcnt]').forEach(td => { td.textContent = by[td.dataset.temcnt] || ''; });
    const cell = $('tem-sum-cell');
    if (cell) cell.textContent = fmt0(tot);
    const tt = $('tem-total');
    if (tt) tt.innerHTML = tot ? `<b>${fmt0(tot)}</b> tem · ${fmt0(pairs)} đôi${P.mode === 'a4' ? ` · ${soTo(tot)} tờ A4` : ''}` : '';
    const btn = $('tem-tao');
    if (btn) { btn.disabled = !tot; btn.textContent = tot ? `Tạo & in ${fmt0(tot)} tem` : 'Tạo & in tem'; }
    if (P.mode === 'a4') renderMini(tot);
  }

  function tao() { return once('tem-tao', taoCore); }
  async function taoCore() {
    const lines = pendingLines();
    if (!lines.length) return;
    const to = S.loai === 'chat' ? 'TC' : S.to;
    if (!to) { toast('Chọn tổ may trước', 'error'); return; }
    const n = lines.reduce((a, l) => a + Math.ceil(l.so_luong / moi()), 0);
    if (!confirm(`Tạo ${n} tem ${S.loai === 'chat' ? 'Chặt (TC)' : 'May ' + to}, mỗi tem ${moi()} đôi?`)) return;
    try {
      const r = await api('/api/tem/in', 'POST', { khach_hang_id: khId(), loai: S.loai, ma_bo_phan: to, moi_tem: moi(), chi_tiet: S.chiTiet, nguoi_dg: S.nguoiDg, lines });
      toast(r.message, 'success');
      showTems(r.data, `Đã tạo ${r.data.length} tem – ${S.loai === 'chat' ? 'Chặt (TC)' : 'May ' + to}`);
      await loadData();
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ---------------- Chế độ in ---------------- */
  function renderMode() {
    const seg = $('tem-mode');
    if (!seg) return;
    seg.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === P.mode));
    $('tem-a4').hidden = P.mode !== 'a4';
    $('tem-mode-hint').innerHTML = P.mode === 'nhiet'
      ? `Mỗi tem 1 trang, in đen trắng. Trong driver máy in chọn khổ <b>${TW} × ${TH} mm</b>, Lề: Không, Tỉ lệ 100%.`
      : `${esc(presetTen())} · ${perSheet()} ô/tờ · bắt đầu ô ${startCell()}`;
    updateSel();
    if (P.mode !== 'a4') return;
    $('tem-preset').innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${k === P.preset ? 'selected' : ''}>${esc(v.ten)}</option>`).join('');
    const bd = $('tem-batdau');
    if (document.activeElement !== bd) bd.value = P.batDau;
    bd.max = perSheet();
    $('tem-cat').checked = !!P.cat;
    $('tem-den').checked = !!P.den;
    document.querySelectorAll('#tem-a4 [data-a4]').forEach(i => { if (document.activeElement !== i) i.value = P[i.dataset.a4]; });
    $('tem-a4-warn').textContent = a4Overflow();
    updateCount();
  }
  /** Sơ đồ tờ A4: ô đã dùng (xám), ô sẽ in lần này (tô màu) */
  function renderMini(n) {
    const svg = $('tem-mini');
    if (!svg) return;
    const per = perSheet(), st = startCell() - 1;
    let h = '';
    for (let pos = 0; pos < per; pos++) {
      const b = cellBox(pos), used = pos < st, fill = !used && pos < st + n;
      h += `<rect x="${b.x}" y="${b.y}" width="${P.w}" height="${P.h}" fill="${used ? '#e1e7ec' : fill ? '#bcfefe' : '#fff'}" stroke="#0c5776" stroke-width=".6"/>`;
    }
    svg.innerHTML = h;
    $('tem-mini-cap').innerHTML = n ? `${fmt0(n)} tem → <b>${soTo(n)}</b> tờ A4` : `${per} ô / tờ`;
  }

  /* ---------------- Danh sách tem ---------------- */
  async function loadList() {
    const p = new URLSearchParams({ khach_hang_id: khId() });
    if (S.f.tt) p.set('trang_thai', S.f.tt);
    if (S.f.loai) p.set('loai', S.f.loai);
    if (S.f.don !== '') p.set('don_id', S.f.don);
    const n = seq('tem-list');
    try {
      const data = (await api('/api/tem?' + p)).data;
      if (!latest('tem-list', n)) return;
      const order = khSizes(C().byId(khId()));
      const oi = s => { const i = order.indexOf(normSize(s)); return i < 0 ? 999 : i; };
      S.list = data.sort((a, b) => String(a.po).localeCompare(String(b.po)) || oi(a.size) - oi(b.size) || String(a.size).localeCompare(String(b.size))
        || String(a.loai).localeCompare(String(b.loai)) || a.stt - b.stt || a.id - b.id);
      const ids = new Set(S.list.filter(t => t.trang_thai !== 'huy').map(t => t.id));
      [...S.sel].forEach(id => { if (!ids.has(id)) S.sel.delete(id); });
      renderList();
    } catch (err) {
      const t = $('tem-list-tbl');
      if (t) t.innerHTML = `<tbody><tr><td class="v3-empty">Lỗi tải: ${esc(err.message)}</td></tr></tbody>`;
    }
  }
  const TT = { moi: '<span class="ui-badge">Chưa xuất</span>', da_xuat: '<span class="ui-badge ui-badge-ok">Đã xuất</span>', huy: '<span class="ui-badge ui-badge-off">Đã hủy</span>' };
  function renderList() {
    const tbl = $('tem-list-tbl');
    if (!tbl) return;
    const can = S.list.filter(t => t.trang_thai !== 'huy');
    const all = can.length && can.every(t => S.sel.has(t.id));
    tbl.innerHTML = `<thead><tr><th class="c"><input type="checkbox" id="tem-chk-all" ${all ? 'checked' : ''} ${can.length ? '' : 'disabled'} aria-label="Chọn tất cả tem đang hiện"></th>
      <th>Mã tem</th><th>Loại</th><th>PO</th><th>ART</th><th class="c">Size</th><th class="r">SL in</th><th class="r">SL thực</th><th class="c">Tem</th><th>Trạng thái</th><th>Phiếu</th><th></th></tr></thead>
      <tbody>${S.list.length ? S.list.slice(0, 1000).map(t => `<tr class="${S.sel.has(t.id) ? 'v3-row-on' : ''}">
        <td class="c"><input type="checkbox" data-chon="${t.id}" ${S.sel.has(t.id) ? 'checked' : ''} ${t.trang_thai === 'huy' ? 'disabled' : ''} aria-label="Chọn tem ${esc(t.ma_tem)}"></td>
        <td class="tsc-mono">${esc(t.ma_tem)}</td><td>${t.loai === 'chat' ? 'Chặt' : 'May'} · ${esc(t.ma_bo_phan)}</td><td>${esc(t.po)}</td><td>${esc(t.art)}</td>
        <td class="c"><b>${esc(t.size)}</b></td><td class="r">${fmt0(t.so_luong_in)}</td><td class="r ${t.so_luong !== t.so_luong_in ? 'tem-sl-edit' : ''}">${fmt0(t.so_luong)}</td>
        <td class="c">${t.stt}/${t.tong}</td><td>${TT[t.trang_thai] || ''}</td><td>${t.so_phieu ? `${esc(t.so_phieu)}<div class="ui-sub">${viDate(t.phieu_ngay)}</div>` : ''}</td>
        <td class="nowrap"><button type="button" class="ui-btn-sm" data-act="inlai-1" data-id="${t.id}" ${t.trang_thai === 'huy' ? 'disabled' : ''}>In lại</button>
          ${t.trang_thai === 'moi' ? `<button type="button" class="ui-btn-sm ui-btn-sm-danger" data-act="huy" data-id="${t.id}">Hủy</button>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="12" class="v3-empty">${S.f.tt === 'moi' ? 'Không có tem chưa xuất.' : 'Không có tem nào khớp bộ lọc.'} Chọn số ở bảng trên rồi bấm <b>Tạo &amp; in tem</b>.</td></tr>`}</tbody>`;
    updateSel();
  }
  function updateSel() {
    const info = $('tem-sel-info');
    if (!info) return;
    const n = S.sel.size;
    const con = S.list.filter(t => t.trang_thai === 'moi').length;
    const a4 = c => (P.mode === 'a4' && c ? ` · ${soTo(c)} tờ A4` : '');
    info.innerHTML = n ? `Đã chọn <b>${n}</b> tem${a4(n)}` : 'Tick ô đầu dòng để chọn tem cần in lại.';
    const b1 = $('tem-inlai-chon'), b2 = $('tem-inlai-con');
    b1.disabled = !n; b1.textContent = n ? `🖨 In lại ${n} tem đã chọn` : '🖨 In lại tem đã chọn';
    b2.disabled = !con; b2.textContent = `🖨 In lại tất cả tem chưa xuất (${con})`;
  }
  async function inLai(list, title) {
    if (!list.length) return;
    try {
      await api('/api/tem/inlai', 'POST', { ids: list.map(t => t.id) });
      showTems(list, title);
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ---------------- Sự kiện ---------------- */
  function onInput(e) {
    const t = e.target;
    if (t.matches('#tem-don-tbl input[data-po], #tem-moi')) { updateCount(); return; }
    if (t.id === 'tem-batdau') { P.batDau = parseInt(t.value, 10) || 1; saveP(); renderMode(); return; }
    const k = t.dataset.a4;
    if (k) {
      const v = parseFloat(t.value);
      if (isNaN(v)) return;
      P[k] = k === 'cot' || k === 'hang' ? Math.max(1, Math.round(v)) : v;
      P.preset = 'tu_chinh';
      saveP(); renderMode();
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'tem-don') { S.donId = +t.value || 0; renderDon(); return; }
    if (t.id === 'tem-to') { S.to = t.value; return; }
    if (t.id === 'tem-moi') { S.moi = moi(); t.value = S.moi; updateCount(); return; }
    if (t.id === 'tem-preset') { P.preset = t.value; if (P.preset !== 'tu_chinh') Object.assign(P, PRESETS[P.preset]); delete P.ten; P.batDau = 1; saveP(); renderMode(); return; }
    if (t.id === 'tem-cat') { P.cat = t.checked; saveP(); return; }
    if (t.id === 'tem-den') { P.den = t.checked; saveP(); return; }
    if (t.id === 'tem-chitiet') { S.chiTiet = t.value.trim() || 'Đồng bộ'; t.value = S.chiTiet; saveOpt(); return; }
    if (t.id === 'tem-nguoidg') { S.nguoiDg = t.value.trim(); t.value = S.nguoiDg; saveOpt(); return; }
    if (t.id === 'tem-f-don') { S.f.don = t.value; loadList(); return; }
    if (t.id === 'tem-f-tt') { S.f.tt = t.value; loadList(); return; }
    if (t.id === 'tem-f-loai') { S.f.loai = t.value; loadList(); return; }
    if (t.id === 'tem-chk-all') { S.list.filter(x => x.trang_thai !== 'huy').forEach(x => (t.checked ? S.sel.add(x.id) : S.sel.delete(x.id))); renderList(); return; }
    const id = +t.dataset.chon;
    if (id) {
      if (t.checked) S.sel.add(id); else S.sel.delete(id);
      t.closest('tr').classList.toggle('v3-row-on', t.checked);
      const all = $('tem-chk-all');
      if (all) all.checked = S.list.filter(x => x.trang_thai !== 'huy').every(x => S.sel.has(x.id));
      updateSel();
    }
  }
  async function onClick(e) {
    const lo = e.target.closest('[data-loai]');
    if (lo) { S.loai = lo.dataset.loai; document.querySelectorAll('#tem-root [data-loai]').forEach(b => b.classList.toggle('active', b === lo)); renderTo(); renderDon(true); return; }
    const md = e.target.closest('[data-mode]');
    if (md) { P.mode = md.dataset.mode; saveP(); renderMode(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'fill') renderDon();
    if (act === 'clear') { $('tem-don-tbl').querySelectorAll('input[data-po]').forEach(i => { i.value = ''; }); updateCount(); }
    if (act === 'tao') tao();
    if (act === 'khung-in') printHtml(doc(A4_PAGE, sheetHtml([], true)));
    if (act === 'khung-xem') modal('Khung căn chỉnh A4', `<p class="ui-hint">Bấm <b>In</b> để in khung ra giấy thường, chồng lên tờ decal soi đèn để căn.</p><div class="tem-a4prev">${sheetHtml([], true)}</div>`,
      () => printHtml(doc(A4_PAGE, sheetHtml([], true))));
    if (act === 'inlai-chon') { const list = S.list.filter(t => S.sel.has(t.id)); inLai(list, `In lại ${list.length} tem đã chọn`); }
    if (act === 'inlai-con') {
      const list = S.list.filter(t => t.trang_thai === 'moi');
      const don = S.f.don !== '' ? $('tem-f-don').selectedOptions[0]?.text : '';
      inLai(list, `In lại ${list.length} tem chưa xuất${don ? ' – đơn ' + don : ''}`);
    }
    if (act === 'inlai-1') { const t = S.list.find(x => x.id === +b.dataset.id); if (t) inLai([t], 'In lại tem ' + t.ma_tem); }
    if (act === 'huy') {
      const t = S.list.find(x => x.id === +b.dataset.id);
      if (!t || !confirm(`Hủy tem ${t.ma_tem}? Tem đã hủy khi quét sẽ bị từ chối.`)) return;
      try { toast((await api(`/api/tem/${t.id}/huy`, 'PUT')).message, 'info'); loadData(); } catch (err) { toast(err.message, 'error'); }
    }
  }

  /* ---------------- Khởi động ---------------- */
  async function show() {
    await window.AuthReady;
    if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
    const root = $('tem-root');
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('input', onInput);
    }
    render();
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-intem"]')?.addEventListener('click', show);
    window.addEventListener('kh-changed', () => {
      if (!$('tem-root')?.dataset.ready) return;
      S.data = null; S.donId = null; S.sel.clear(); S.f.don = '';
      if ($('tab-intem')?.classList.contains('active')) render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
