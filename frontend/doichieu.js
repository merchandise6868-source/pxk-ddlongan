/**
 * TAB ĐỐI CHIẾU GIAO HÀNG – data log xuất theo PO (giống bảng Excel đối chiếu số lượng giao hàng)
 * - Mỗi PO một khối: hàng Đặt · mỗi phiếu xuất 1 hàng (ngày, số phiếu, số theo size) · Tổng giao · Số thiếu (= giao − đặt)
 * - Số lấy từ phiếu xuất (tienDo ở src/donhang.js). Thực tế khác phiếu thì bấm vào ô số để sửa: lưu phần chênh vào
 *   dieu_chinh_xuat (PUT /api/dieuchinh/o), phiếu gốc giữ nguyên. Ô sửa chữ xanh dương, góc trái +n (xanh lá) / −n (đỏ)
 * - Điều chỉnh không gắn phiếu (kiểu cũ) hiện thành dòng ĐC riêng. Dòng phiếu chưa khớp đơn hàng: gán ở cuối trang
 * - Tính đến ngày: chỉ cộng phiếu / điều chỉnh có ngày ≤ ngày lọc. Tải Excel có màu bằng ExcelJS (nạp khi bấm)
 * Khách hàng lấy theo thanh bên (window.KH).
 */
(function () {
  const { esc, toNum, fmt, fmt0, api, toast, viDate, today, normKey, $ } = window.U;
  const C = () => window.Catalog || { khach: [], khachAll: [], byId: () => null };
  const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

  const S = { q: '', tt: 'thieu', den: today(), all: [], unmatched: [], ganSel: {}, edit: null, busy: null };
  const khId = () => (window.KH ? window.KH.one() : null);
  /** Size số (36, 36.5) ghi #36 như bảng Excel; size dạng khoảng của Kurim (3-4, 4T-5T) giữ nguyên */
  const sizeLabel = s => (/^\d+([.,]\d+)?$/.test(String(s).trim()) ? `#${s}` : s);
  const dvtOf = o => (C().byId(o.khach_hang_id) || {}).dvt || 'Đôi';
  const signed = v => `${v > 0 ? '+' : '−'}${fmt0(Math.abs(v))}`;

  function renderShell() {
    $('dc-root').innerHTML = `
      <header class="ui-page-head"><h2>Đối chiếu giao hàng</h2>
        <p>Số giao lấy từ phiếu xuất (khớp PO + ART của khách). Thực tế khác phiếu thì bấm vào ô số để sửa: phiếu gốc giữ nguyên,
          số sửa hiện màu xanh, góc trái là phần chênh. Gõ lại đúng số trên phiếu để bỏ sửa.</p></header>
      <div class="ui-panel v3-filter">
        <label class="ui-field v3-grow"><span class="ui-label">Tìm</span><input type="search" class="ui-input" id="dc-f-q" placeholder="PO, ART, màu, số phiếu"></label>
        <label class="ui-field"><span class="ui-label">Trạng thái</span><select class="ui-input" id="dc-f-tt">
          <option value="thieu">Còn thiếu</option><option value="du">Đã giao đủ</option><option value="all">Tất cả</option></select></label>
        <label class="ui-field"><span class="ui-label">Tính đến ngày</span><input type="date" class="ui-input" id="dc-f-den"></label>
        <div class="v3-filter-btns"><button type="button" class="ui-btn ui-btn-ghost" data-act="reload">Tải lại</button>
          <button type="button" class="ui-btn ui-btn-primary" data-act="excel">⬇ Tải Excel</button></div>
      </div>
      <div id="dc-list"><div class="v3-empty">Đang tải...</div></div>
      <div id="dc-hist"></div>
      <div id="dc-unmatched"></div>`;
    $('dc-f-tt').value = S.tt;
    $('dc-f-q').value = S.q;
    $('dc-f-den').value = S.den;
  }

  async function load() {
    const p = new URLSearchParams({ trang_thai: 'all' });
    if (khId()) p.set('khach_hang_id', khId());
    const n = U.seq('dc-load');
    try {
      const r = await api('/api/theodoi?' + p);
      if (!U.latest('dc-load', n)) return;
      S.all = r.data; S.unmatched = r.unmatched; S.edit = null;
      render();
    } catch (err) { $('dc-list').innerHTML = `<div class="ui-panel"><div class="v3-empty">Lỗi tải: ${esc(err.message)}</div></div>`; }
  }

  /* ============================================================
     SỐ LIỆU 1 KHỐI PO (tính đến ngày lọc)
     ============================================================ */
  function model(o) {
    const den = S.den;
    const cols = o.sizes.filter(s => s.dat || s.xuat || s.dc).map(s => s.size);
    const dat = Object.fromEntries(o.sizes.map(s => [s.size, s.dat]));
    const ids = new Set(o.entries.map(e => e.phieu_id));
    const fix = new Map(); // phiếu|size -> số sửa trên ô
    const loose = new Map(); // điều chỉnh không gắn phiếu (hoặc phiếu không còn tính vào PO): gộp cặp đổi size thành 1 dòng
    o.adjustments.forEach(a => {
      if (a.phieu_id && ids.has(a.phieu_id)) { fix.set(`${a.phieu_id}|${a.size}`, a); return; }
      if (den && (a.ngay || '') > den) return;
      const k = a.nhom || `id${a.id}`;
      if (!loose.has(k)) loose.set(k, { type: 'dc', ngay: a.ngay || '', a, ids: [], v: {} });
      const g = loose.get(k);
      g.ids.push(a.id);
      g.v[a.size] = (g.v[a.size] || 0) + Number(a.so_luong || 0);
    });
    const rows = o.entries.filter(e => !den || e.ngay <= den).map(e => ({
      type: 'p', ngay: e.ngay, e,
      cells: cols.map(s => {
        const g = e.sizes[s] || 0;
        const a = fix.get(`${e.phieu_id}|${s}`);
        return { s, g, a, v: a ? g + Number(a.so_luong) : g, lech: !!a && a.goc !== null && a.goc !== undefined && Number(a.goc) !== g };
      }),
    }));
    // Dòng ĐC chen theo ngày (sort ổn định: cùng ngày thì phiếu trước)
    const all = [...rows, ...loose.values()].map((r, i) => ({ r, i })).sort((x, y) => (x.r.ngay < y.r.ngay ? -1 : x.r.ngay > y.r.ngay ? 1 : x.i - y.i)).map(x => x.r);
    const valOf = (r, s) => (r.type === 'p' ? r.cells.find(c => c.s === s).v : r.v[s] || 0);
    const tong = Object.fromEntries(cols.map(s => [s, all.reduce((a, r) => a + valOf(r, s), 0)]));
    const thieu = Object.fromEntries(cols.map(s => [s, tong[s] - (dat[s] || 0)]));
    const sum = m => cols.reduce((a, s) => a + (m[s] || 0), 0);
    const fixes = rows.flatMap(r => r.cells.filter(c => c.a).map(c => ({ ...c, e: r.e })));
    return { cols, dat, all, valOf, tong, thieu, sumDat: sum(dat), sumTong: sum(tong), sumThieu: sum(thieu),
      thieuCo: cols.some(s => thieu[s] < 0), ok: cols.length > 0 && cols.every(s => thieu[s] === 0), fixes };
  }

  function visible() {
    const q = normKey(S.q);
    return S.all.map(o => ({ o, m: model(o) })).filter(({ o, m }) => {
      if (q && ![o.po, o.art, o.mau, o.don_hang, ...o.entries.map(e => e.so_phieu)].some(v => normKey(v).includes(q))) return false;
      if (S.tt === 'thieu') return m.thieuCo;
      if (S.tt === 'du') return !m.thieuCo && m.sumDat > 0;
      return true;
    });
  }

  /* ============================================================
     VẼ
     ============================================================ */
  function render() {
    const list = visible();
    const box = $('dc-list');
    box.innerHTML = list.length ? list.map(({ o, m }, i) => blockHtml(o, m, i + 1)).join('')
      : `<div class="ui-panel"><div class="v3-empty">${S.tt === 'thieu' ? 'Không có PO nào còn thiếu.' : 'Không có đơn hàng phù hợp.'}${window.KH ? window.KH.emptyNote() : ''}</div></div>`;
    renderHist(list);
    renderUnmatched();
  }
  /** Vẽ lại 1 khối sau khi sửa ô (giữ nguyên các khối khác và vị trí cuộn) */
  function renderBlock(id) {
    const el = document.querySelector(`.dc-block[data-id="${id}"]`);
    const o = S.all.find(x => x.id === id);
    if (!el || !o) return;
    el.outerHTML = blockHtml(o, model(o), parseInt(el.dataset.stt, 10));
    renderHist(visible());
  }

  function cellHtml(o, r, c, ri, ci) {
    const at = `data-o="${o.id}" data-p="${r.e.phieu_id}" data-s="${esc(c.s)}" data-r="${ri}" data-c="${ci}"`;
    if (!c.a) return `<td class="dc-n dc-ed" ${at}>${fmt(c.g)}</td>`;
    const d = c.v - c.g;
    const tip = `Phiếu ${r.e.so_phieu} ghi ${fmt0(c.g)} · sửa thành ${fmt0(c.v)} · ${c.a.nguoi || ''} ${viDate(c.a.ngay)}`
      + (c.lech ? ` · Lúc sửa phiếu ghi ${fmt0(c.a.goc)}, nay phiếu đã đổi – kiểm tra lại` : '');
    return `<td class="dc-n dc-ed dc-chg${c.lech ? ' dc-lech' : ''}" ${at} title="${esc(tip)}"><span class="dc-d ${d > 0 ? 'up' : 'dn'}">${signed(d)}</span>${fmt0(c.v)}</td>`;
  }

  function blockHtml(o, m, stt) {
    const n = m.all.length + 3; // Đặt + các dòng + Tổng + Số thiếu
    const dvt = esc(dvtOf(o));
    const canOpen = window.Auth && window.Auth.can('tab-create') && typeof window.editSlip === 'function';
    let last = '';
    const body = m.all.map((r, ri) => {
      const day = r.ngay !== last ? viDate(r.ngay).slice(0, 5) : '';
      last = r.ngay;
      if (r.type === 'dc') {
        const t = m.cols.reduce((a, s) => a + (r.v[s] || 0), 0);
        const note = [r.a.ly_do, r.a.so_phieu, r.a.ghi_chu].filter(Boolean).join(' · ');
        return `<tr class="dc-adj"><td>${day}</td><td class="dc-sp" title="${esc(`${note} · ${r.a.nguoi || ''}`)}"><span class="dc-tag">ĐC</span> ${esc(r.a.ly_do || 'Điều chỉnh')}
            <button type="button" class="dc-x" data-act="adj-del" data-adj="${r.ids[0]}" aria-label="Xóa điều chỉnh">×</button></td><td>${dvt}</td>
          ${m.cols.map(s => `<td class="dc-n">${r.v[s] ? signed(r.v[s]) : ''}</td>`).join('')}<td class="dc-n dc-b">${t ? signed(t) : '0'}</td></tr>`;
      }
      const t = r.cells.reduce((a, c) => a + c.v, 0);
      const sp = canOpen ? `<button type="button" class="dc-link" data-act="open-slip" data-phieu="${r.e.phieu_id}" title="Mở phiếu để sửa">${esc(r.e.so_phieu)}</button>` : esc(r.e.so_phieu);
      return `<tr><td>${day}</td><td class="dc-sp">${sp}</td><td>${dvt}</td>${r.cells.map((c, ci) => cellHtml(o, r, c, ri, ci)).join('')}<td class="dc-n dc-b">${fmt(t)}</td></tr>`;
    }).join('');
    const badge = m.ok ? '<span class="ui-badge ui-badge-ok">OK đơn</span>'
      : m.thieuCo ? `<span class="ui-badge ui-badge-warn">Thiếu ${fmt0(-m.cols.reduce((a, s) => a + Math.min(0, m.thieu[s]), 0))}</span>` : '';
    return `<section class="ui-panel dc-block" data-id="${o.id}" data-stt="${stt}">
      <div class="dc-head"><b>${stt}. PO ${esc(o.po)}</b>
        <span class="ui-muted">ART ${esc(o.art)}${o.mau ? ' · ' + esc(o.mau) : ''}${khId() ? '' : ' · ' + esc(o.khach_ten)}${o.don_hang ? ' · ĐH ' + esc(o.don_hang) : ''}${o.don_id ? ' · đợt ' + o.dot : ''}</span>
        ${badge}${m.fixes.length ? ` <span class="ui-badge dc-badge-fix">${m.fixes.length} ô đã sửa</span>` : ''}</div>
      ${m.cols.length ? `<div class="dc-wrap"><table class="dc-table">
        <thead><tr><th>STT</th><th>Mã hàng</th><th>Màu</th><th>Ngày giao</th><th>Số phiếu</th><th>ĐVT</th>
          ${m.cols.map(s => `<th class="dc-sz">${esc(sizeLabel(s))}</th>`).join('')}<th>Tổng</th><th>PO</th></tr></thead>
        <tbody>
          <tr class="dc-dat"><td rowspan="${n}" class="dc-fix">${stt}</td><td rowspan="${n}" class="dc-fix dc-b">${esc(o.art)}</td><td rowspan="${n}" class="dc-fix">${esc(o.mau)}</td>
            <td colspan="2" class="dc-lbl">Đặt</td><td>${dvt}</td>${m.cols.map(s => `<td class="dc-n">${fmt(m.dat[s])}</td>`).join('')}<td class="dc-n">${fmt0(m.sumDat)}</td>
            <td rowspan="${n - 1}" class="dc-fix dc-po"><span>${esc(o.po)}</span></td></tr>
          ${body}
          <tr class="dc-tong"><td colspan="2" class="dc-lbl">Tổng giao</td><td>${dvt}</td>${m.cols.map(s => `<td class="dc-n">${fmt0(m.tong[s])}</td>`).join('')}<td class="dc-n">${fmt0(m.sumTong)}</td></tr>
          <tr class="dc-thieu"><td colspan="2" class="dc-lbl">Số thiếu</td><td>${dvt}</td>
            ${m.cols.map(s => `<td class="dc-n${m.thieu[s] < 0 ? ' dc-neg' : ''}">${m.thieu[s] > 0 ? '+' : ''}${fmt0(m.thieu[s])}</td>`).join('')}
            <td class="dc-n${m.sumThieu < 0 ? ' dc-neg' : ''}">${m.sumThieu > 0 ? '+' : ''}${fmt0(m.sumThieu)}</td><td class="dc-fix">${m.ok ? '<span class="dc-ok">OK đơn</span>' : ''}</td></tr>
        </tbody></table></div>` : '<p class="ui-hint">Đơn hàng chưa có số lượng theo size (sửa ở tab Đơn hàng).</p>'}
    </section>`;
  }

  /** Lịch sử các ô đã sửa (mới nhất trước) của các PO đang hiện */
  function renderHist(list) {
    const box = $('dc-hist');
    const rows = list.flatMap(({ o, m }) => m.fixes.map(f => ({ o, f }))).sort((a, b) => (b.f.a.id || 0) - (a.f.a.id || 0));
    box.innerHTML = rows.length ? `<section class="ui-panel"><h3 class="ui-panel-title">Lịch sử sửa (${rows.length})</h3>
      <div class="v3-table-wrap"><table class="v3-table v3-table-mini"><thead><tr><th>Ngày sửa</th><th>Người sửa</th><th>PO</th><th>Số phiếu</th><th>Size</th><th class="r">Phiếu ghi</th><th class="r">Sửa thành</th><th class="r">Chênh</th></tr></thead>
      <tbody>${rows.map(({ o, f }) => { const d = f.v - f.g; return `<tr><td class="nowrap">${viDate(f.a.ngay)}</td><td>${esc(f.a.nguoi)}</td><td>${esc(o.po)}</td><td>${esc(f.e.so_phieu)}</td><td>${esc(sizeLabel(f.s))}</td>
        <td class="r">${fmt0(f.g)}${f.lech ? ` <small class="dc-warn" title="Lúc sửa phiếu ghi ${fmt0(f.a.goc)}">(phiếu đã đổi)</small>` : ''}</td><td class="r"><b>${fmt0(f.v)}</b></td>
        <td class="r ${d > 0 ? 'dc-up' : 'dc-dn'}">${signed(d)}</td></tr>`; }).join('')}</tbody></table></div></section>` : '';
  }

  /** Dòng phiếu xuất chưa khớp đơn hàng nào: chọn PO rồi Gán (giống tab Xuất theo đơn hàng cũ) */
  function renderUnmatched() {
    const box = $('dc-unmatched');
    const q = normKey(S.q);
    const list = S.unmatched.filter(u => !q || [u.po, u.art, u.so_phieu].some(v => normKey(v).includes(q)));
    if (!list.length) { box.innerHTML = ''; return; }
    const khName = id => (C().byId(id) || {}).ten_ngan || '';
    const ordersOf = (kh, dot) => S.all.filter(o => o.khach_hang_id === kh && o.dot === dot); // gán chỉ trong cùng đợt
    box.innerHTML = `<section class="ui-panel">
      <h3 class="ui-panel-title">Dòng phiếu xuất chưa khớp đơn hàng (${list.length})</h3>
      <p class="ui-hint v3-mb">PO / ART trên phiếu không trùng đơn hàng nào cùng đợt (gõ khác, gộp nhiều PO, hoặc chưa nhập đơn hàng của đợt đó). Chọn đúng đơn hàng rồi bấm <b>Gán</b>; các phiếu sau ghi giống vậy sẽ tự khớp.</p>
      <div class="v3-table-wrap"><table class="v3-table v3-table-mini">
        <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Khách hàng</th><th>Đợt</th><th>PO trên phiếu</th><th>ART trên phiếu</th><th>Theo size</th><th class="r">Tổng</th><th>Gán vào đơn hàng</th></tr></thead>
        <tbody>${list.slice().reverse().map(u => {
          const opts = u.khach_hang_id ? ordersOf(u.khach_hang_id, u.dot) : [];
          return `<tr><td class="nowrap">${viDate(u.ngay)}</td><td class="nowrap"><b>${esc(u.so_phieu)}</b></td><td>${esc(khName(u.khach_hang_id)) || '<span class="v3-neg">Chưa chọn khách</span>'}</td>
            <td class="c">${u.khach_hang_id ? u.dot : ''}</td><td>${esc(u.po)}</td><td>${esc(u.art)}</td>
            <td><small>${Object.entries(u.sizes).map(([s, v]) => `${esc(s)}: ${fmt0(v)}`).join(' · ')}</small></td><td class="r"><b>${fmt0(u.tong)}</b></td>
            <td class="nowrap">${!u.khach_hang_id ? '<small class="ui-muted">Gán khách cho phiếu ở tab Danh sách phiếu</small>'
              : opts.length ? `<select class="ui-input v3-sel-sm" data-gan="${u.dong_id}"><option value="">Chọn PO</option>${opts.map(o =>
                `<option value="${o.id}" ${S.ganSel[u.dong_id] === o.id ? 'selected' : ''}>${esc(o.po)} · ${esc(o.art)}${o.mau ? ' · ' + esc(o.mau) : ''}</option>`).join('')}</select>
                <button type="button" class="ui-btn-sm" data-act="gan" data-dong="${u.dong_id}">Gán</button>`
              : `<small class="ui-muted">Khách chưa có đơn hàng đợt ${u.dot}</small>`}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>`;
  }

  /* ============================================================
     SỬA Ô (như Excel)
     ============================================================ */
  function cellOf(o, r, c) { return document.querySelector(`td.dc-ed[data-o="${o}"][data-r="${r}"][data-c="${c}"]`); }
  function openEdit(td) {
    if (!td || S.busy) return;
    closeEdit();
    const o = S.all.find(x => x.id === parseInt(td.dataset.o, 10));
    const r = model(o).all[parseInt(td.dataset.r, 10)];
    const c = r.cells[parseInt(td.dataset.c, 10)];
    S.edit = { o: o.id, r: +td.dataset.r, c: +td.dataset.c, p: r.e.phieu_id, s: c.s, v: c.v };
    td.classList.add('dc-editing');
    td.innerHTML = `<input class="dc-in" inputmode="numeric" value="${c.v || ''}" aria-label="Số size ${esc(c.s)} phiếu ${esc(r.e.so_phieu)}">`;
    const ip = td.querySelector('input');
    ip.focus(); ip.select();
  }
  function closeEdit() {
    if (!S.edit) return;
    const { o } = S.edit;
    S.edit = null;
    renderBlock(o);
  }
  /** Lưu ô đang sửa rồi (tùy chọn) mở ô bên cạnh: dr/dc = hướng đi. Đang lưu thì trả lại lần lưu đó */
  function commit(dr = 0, dc = 0) {
    if (!S.busy) S.busy = saveEdit(dr, dc).finally(() => { S.busy = null; });
    return S.busy;
  }
  async function saveEdit(dr, dc) {
    const ed = S.edit;
    if (!ed) return;
    const td = cellOf(ed.o, ed.r, ed.c);
    const ip = td && td.querySelector('input');
    if (!ip) { S.edit = null; return; }
    const raw = ip.value.trim();
    if (raw && !/^[\d.,\s]+$/.test(raw)) { ip.classList.add('dc-in-err'); toast('Chỉ nhập số không âm', 'error'); return; }
    const v = toNum(raw);
    if (v !== ed.v) {
      ip.disabled = true;
      try {
        const res = await api('/api/dieuchinh/o', 'PUT', { po_id: ed.o, phieu_id: ed.p, size: ed.s, gia_tri: v });
        const o = S.all.find(x => x.id === ed.o);
        o.adjustments = o.adjustments.filter(a => !(a.phieu_id === ed.p && a.size === ed.s));
        if (res.chenh) {
          o.adjustments.push({ id: Date.now(), phieu_id: ed.p, size: ed.s, so_luong: res.chenh, goc: res.goc, ly_do: 'Sửa trên log',
            nguoi: (window.Auth && window.Auth.user && window.Auth.user.ho_ten) || '', ngay: today(),
            so_phieu: o.entries.find(e => e.phieu_id === ed.p)?.so_phieu || '' });
        }
      } catch (err) {
        ip.disabled = false; ip.classList.add('dc-in-err'); ip.focus();
        toast(err.message, 'error'); return;
      }
    }
    S.edit = null;
    renderBlock(ed.o);
    if (!dr && !dc) return;
    // Đi lên / xuống bỏ qua dòng ĐC (không sửa được)
    const n = model(S.all.find(x => x.id === ed.o)).all.length;
    let r = ed.r + dr, next = cellOf(ed.o, r, ed.c + dc);
    while (!next && dr && r > 0 && r < n - 1) { r += dr; next = cellOf(ed.o, r, ed.c); }
    S.busy = null;
    openEdit(next);
  }

  /* ============================================================
     TẢI EXCEL (ExcelJS – có màu, gộp ô như bảng mẫu)
     ============================================================ */
  let excelLib = null;
  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!excelLib) {
      excelLib = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = EXCELJS_URL;
        s.onload = () => resolve(window.ExcelJS);
        s.onerror = () => { excelLib = null; reject(new Error('Không tải được thư viện Excel – kiểm tra mạng rồi thử lại')); };
        document.head.appendChild(s);
      });
    }
    return excelLib;
  }
  async function exportExcel() {
    const list = visible();
    if (!list.length) { toast('Chưa có PO nào để tải', 'info'); return; }
    const ExcelJS = await loadExcel();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Đối chiếu', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const maxSz = Math.max(...list.map(x => x.m.cols.length));
    const W = 6 + maxSz + 2; // STT · Mã hàng · Màu · Ngày · Số phiếu · ĐVT · size... · Tổng · PO
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const thin = { style: 'thin', color: { argb: 'FF808080' } };
    const box = { top: thin, left: thin, bottom: thin, right: thin };
    ws.columns = [5, 16, 11, 10, 15, 7, ...Array(maxSz).fill(8), 10, 11].map(width => ({ width }));
    const kh = khId() ? (C().byId(khId()) || {}).ten_ngan || '' : 'Tất cả khách';
    const title = (txt, size, bold) => { const r = ws.addRow([txt]); ws.mergeCells(r.number, 1, r.number, W); r.getCell(1).font = { bold, size }; r.getCell(1).alignment = { horizontal: 'center' }; };
    title('BẢNG ĐỐI CHIẾU SỐ LƯỢNG GIAO HÀNG - GIA CÔNG D&D LONG AN', 14, true);
    title(typeof DEFAULT_COMPANY_ADDRESS !== 'undefined' ? DEFAULT_COMPANY_ADDRESS : '', 10, false);
    title(`Khách hàng: ${kh} · Tính đến ngày ${viDate(S.den)}`, 10, false);
    ws.addRow([]);

    list.forEach(({ o, m }, bi) => {
      const dvt = dvtOf(o);
      const pad = arr => [...arr, ...Array(maxSz - arr.length).fill('')];
      const head = ws.addRow(['STT', 'MÃ HÀNG', 'MÀU', 'NGÀY GIAO', 'SỐ PHIẾU', 'ĐVT', ...pad(m.cols.map(sizeLabel)), 'TỔNG', '']);
      head.eachCell({ includeEmpty: true }, (c, i) => { if (i <= W - 1) { c.font = { bold: true }; c.fill = fill('FFE2EFDA'); } c.alignment = { horizontal: 'center', vertical: 'middle' }; });
      for (let i = 7; i < 7 + m.cols.length; i++) head.getCell(i).font = { bold: true, italic: true };
      const first = ws.addRow([bi + 1, o.art, o.mau || '', 'Đặt', '', dvt, ...pad(m.cols.map(s => m.dat[s] || '')), m.sumDat, o.po]);
      first.eachCell({ includeEmpty: true }, (c, i) => { if (i >= 4 && i <= W - 1) { c.fill = fill('FFD9D9D9'); c.font = { bold: true }; } });
      first.getCell(W).fill = fill('FFFFFF00'); first.getCell(W).font = { bold: true };
      let last = '';
      m.all.forEach(r => {
        const day = r.ngay !== last ? viDate(r.ngay).slice(0, 5) : '';
        last = r.ngay;
        if (r.type === 'dc') {
          const row = ws.addRow(['', '', '', day, `ĐC · ${r.a.ly_do || 'Điều chỉnh'}`, dvt, ...pad(m.cols.map(s => r.v[s] || '')), m.cols.reduce((a, s) => a + (r.v[s] || 0), 0), '']);
          row.eachCell({ includeEmpty: true }, (c, i) => { if (i >= 4 && i <= W - 1) { c.fill = fill('FFFCE4D6'); c.font = { italic: true }; } });
          return;
        }
        const row = ws.addRow(['', '', '', day, r.e.so_phieu, dvt, ...pad(r.cells.map(c => c.v || '')), r.cells.reduce((a, c) => a + c.v, 0) || '', '']);
        r.cells.forEach((c, ci) => {
          if (!c.a) return;
          const cell = row.getCell(7 + ci);
          cell.font = { bold: true, color: { argb: 'FF1F5FBF' } };
          cell.note = `Phiếu ghi ${fmt0(c.g)}, sửa ${signed(c.v - c.g)} · ${c.a.nguoi || ''} ${viDate(c.a.ngay)}${c.lech ? ` · lúc sửa phiếu ghi ${fmt0(c.a.goc)}` : ''}`;
        });
      });
      const tong = ws.addRow(['', '', '', 'TỔNG', '', dvt, ...pad(m.cols.map(s => m.tong[s])), m.sumTong, '']);
      tong.eachCell({ includeEmpty: true }, (c, i) => { if (i >= 4 && i <= W - 1) { c.fill = fill('FFDDEBF7'); c.font = { bold: true, color: { argb: 'FF1F4E79' } }; } });
      const th = ws.addRow(['', '', '', 'SỐ THIẾU', '', dvt, ...pad(m.cols.map(s => m.thieu[s])), m.sumThieu, m.ok ? 'OK ĐƠN' : '']);
      th.eachCell({ includeEmpty: true }, (c, i) => {
        if (i >= 4 && i <= W - 1) { c.fill = fill('FFFFFF00'); c.font = { bold: true, color: { argb: typeof c.value === 'number' && c.value < 0 ? 'FFFF0000' : 'FF000000' } }; }
      });
      th.getCell(4).font = { bold: true, color: { argb: 'FFFF0000' } };
      if (m.ok) { th.getCell(W).fill = fill('FF00B050'); th.getCell(W).font = { bold: true, color: { argb: 'FFFFFFFF' } }; }
      // Gộp STT / Mã hàng / Màu theo chiều dọc, nhãn Đặt / Tổng / Số thiếu 2 ô; viền cả khối
      [1, 2, 3].forEach(col => ws.mergeCells(first.number, col, th.number, col));
      [first, tong, th].forEach(r => ws.mergeCells(r.number, 4, r.number, 5));
      for (let rn = head.number; rn <= th.number; rn++) {
        const row = ws.getRow(rn);
        for (let cn = 1; cn <= W; cn++) {
          const c = row.getCell(cn);
          c.border = box;
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: cn === 2 };
          if (cn >= 7 && cn < W) c.numFmt = rn === th.number ? '+#,##0;-#,##0;0' : '#,##0';
        }
      }
      ws.addRow([]);
    });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `doi-chieu-giao-hang-${normKey(kh).toLowerCase() || 'tat-ca'}-${S.den}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------------- SỰ KIỆN ---------------- */
  function onChange(e) {
    const t = e.target;
    if (t.id === 'dc-f-tt') { S.tt = t.value; render(); return; }
    if (t.id === 'dc-f-den') { S.den = t.value || today(); render(); return; }
    if (t.dataset.gan) S.ganSel[t.dataset.gan] = parseInt(t.value, 10) || null;
  }
  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (t.id === 'dc-f-q' && e.key === 'Enter') { S.q = t.value.trim(); render(); return; }
    if (!t.classList.contains('dc-in')) return;
    const mv = { Enter: [1, 0], ArrowDown: [1, 0], ArrowUp: [-1, 0], Tab: [0, e.shiftKey ? -1 : 1] }[e.key];
    if (mv) { e.preventDefault(); commit(...mv); }
    if (e.key === 'Escape') { e.preventDefault(); closeEdit(); }
  }
  async function onClick(e) {
    const td = e.target.closest('td.dc-ed');
    if (td && !td.classList.contains('dc-editing')) {
      const { o, r, c } = td.dataset;
      if (S.edit || S.busy) await commit();
      openEdit(cellOf(o, r, c)); // khối vừa vẽ lại -> lấy lại ô theo vị trí
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'reload') { S.q = $('dc-f-q').value.trim(); load(); }
      if (act === 'excel') { b.disabled = true; try { await exportExcel(); } finally { b.disabled = false; } }
      if (act === 'open-slip') window.editSlip(parseInt(b.dataset.phieu, 10));
      if (act === 'adj-del') {
        if (!confirm('Xóa dòng điều chỉnh này? (Đổi size sẽ xóa cả cặp)')) return;
        await api(`/api/dieuchinh/${b.dataset.adj}`, 'DELETE');
        toast('Đã xóa điều chỉnh', 'info'); await load();
      }
      if (act === 'gan') {
        const u = S.unmatched.find(x => x.dong_id === parseInt(b.dataset.dong, 10));
        const poId = S.ganSel[u.dong_id];
        if (!poId) { toast('Chọn đơn hàng cần gán', 'error'); return; }
        await api('/api/theodoi/gan', 'POST', { po_id: poId, khach_hang_id: u.khach_hang_id, po_text: u.po, art_text: u.art });
        toast('Đã gán vào đơn hàng', 'success'); await load();
      }
    } catch (err) { toast(err.message, 'error'); }
  }
  // Bấm ra ngoài ô đang sửa -> lưu (như Excel)
  function onFocusOut(e) {
    if (!e.target.classList.contains('dc-in')) return;
    setTimeout(() => { if (S.edit && !S.busy && !document.activeElement?.classList.contains('dc-in')) commit(); }, 0);
  }

  async function show() {
    await window.AuthReady;
    const root = $('dc-root');
    if (!root) return;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      if (window.Catalog && !window.Catalog.loaded) await window.Catalog.load();
      renderShell();
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeydown);
      root.addEventListener('focusout', onFocusOut);
    }
    load();
  }
  function init() {
    document.querySelector('.tab-btn[data-target="tab-doichieu"]')?.addEventListener('click', show);
    window.addEventListener('kh-changed', () => {
      if (!$('dc-root')?.dataset.ready) return;
      S.edit = null; S.ganSel = {};
      if ($('tab-doichieu')?.classList.contains('active')) load(); // tab khác: show() tự tải khi mở
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
