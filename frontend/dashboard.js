/**
 * DASHBOARD SẢN LƯỢNG - HỆ THỐNG PHIẾU XUẤT KHO D&D LONG AN
 * - Theo Tổ / Chuyền: thẻ tổng, biểu đồ theo ngày, ma trận Mã hàng × Size
 * - Theo Khách hàng: tổng đôi, thành tiền (công nợ), bảng kê theo phiếu · PO · ART
 * Lưu ý: dòng chi tiết (miếng) của bộ JiaYu không cộng vào sản lượng — chỉ tính dòng ĐỒNG BỘ ĐÔI
 * Khách hàng lấy theo thanh bên (window.KH): số id | '' (tất cả) | 'none' (phiếu chưa gán khách)
 */

const DEPT_COLORS = ['#0e5a4a', '#2f74b5', '#c47f17', '#7a5bb5', '#b4475b', '#3f8f6b'];
let currentMatrixData = [];
let currentMatrixSizes = [];
let currentCongNo = [];
let dashView = 'chuyen';
let dashDepts = [];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-filter-dashboard')?.addEventListener('click', loadDashboard);
  document.getElementById('btn-export-excel')?.addEventListener('click', () => (dashView === 'khach' ? exportCongNo() : exportMatrixToExcel()));
  document.querySelectorAll('.dash-view-btn').forEach(btn => btn.addEventListener('click', () => {
    dashView = btn.dataset.view;
    document.querySelectorAll('.dash-view-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('dash-view-chuyen').style.display = dashView === 'chuyen' ? '' : 'none';
    document.getElementById('dash-view-khach').style.display = dashView === 'khach' ? '' : 'none';
    loadDashboard();
  }));
  window.addEventListener('kh-changed', () => {
    if (document.getElementById('tab-dashboard')?.classList.contains('active')) loadDashboard();
  });
});

function setDefaultDashDates() {
  const tu = document.getElementById('dash-tu-ngay');
  const den = document.getElementById('dash-den-ngay');
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  if (tu && !tu.value) tu.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  if (den && !den.value) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    den.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}`;
  }
}

async function fillDashFilters() {
  setDefaultDashDates();
  const bpSel = document.getElementById('dash-bophan');
  if (!dashDepts.length) {
    try {
      const r = await (await fetch('/api/bophan')).json();
      if (r.success) dashDepts = r.data;
    } catch (_) {}
  }
  if (bpSel && bpSel.options.length <= 1) {
    dashDepts.forEach(d => bpSel.add(new Option(`${d.ten} (${d.ma})`, d.ma)));
    ['dash-tu-ngay', 'dash-den-ngay', 'dash-bophan'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () => window.loadDashboard()));
  }
}

window.loadDashboard = async function() {
  await fillDashFilters();
  const tuNgay = document.getElementById('dash-tu-ngay').value;
  const denNgay = document.getElementById('dash-den-ngay').value;
  const boPhan = document.getElementById('dash-bophan').value;
  const khach = window.KH && window.KH.id !== '' ? window.KH.id : 'all';

  if (dashView === 'khach') return loadCongNo(tuNgay, denNgay, khach);

  let query = `?tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
  if (boPhan && boPhan !== 'all') query += `&bo_phan=${boPhan}`;
  if (khach && khach !== 'all') query += `&khach_hang_id=${khach}`;

  try {
    const res = await fetch(`/api/dashboard${query}`);
    const result = await res.json();
    if (!result.success) return;
    const { deptSummary, rawMatrix, dailyData } = result.data;
    renderSummaryCards(deptSummary);
    renderMatrixTable(rawMatrix);
    renderDailyChart(dailyData);
  } catch (err) {
    console.error('Lỗi tải Dashboard:', err);
  }
};

function deptList() {
  return dashDepts.length ? dashDepts : [{ ma: 'TC', ten: 'Tổ chặt' }, { ma: 'CMA', ten: 'Chuyền may A' }, { ma: 'CMB', ten: 'Chuyền may B' }];
}
function deptColor(ma) {
  const i = deptList().findIndex(d => d.ma === ma);
  return DEPT_COLORS[(i < 0 ? deptList().length : i) % DEPT_COLORS.length];
}

/** Sắp xếp size: số trước (tăng dần), sau đó theo thứ tự dãy size khai báo của khách hàng */
function sortSizes(sizes) {
  const order = [];
  (window.Catalog?.khachAll || []).forEach(k => (k.day_size || []).forEach(d => d.sizes.forEach(s => { if (!order.includes(s)) order.push(s); })));
  return [...sizes].sort((a, b) => {
    const aNum = /^\d+(\.\d+)?$/.test(a), bNum = /^\d+(\.\d+)?$/.test(b);
    if (aNum && bNum) return parseFloat(a) - parseFloat(b);
    if (aNum !== bNum) return aNum ? -1 : 1;
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia > -1 && ib > -1) return ia - ib;
    return String(a).localeCompare(String(b));
  });
}

/* 1. Thẻ tổng quan theo từng chuyền (tự động theo danh mục bộ phận) */
function statCard(label, value, sub, color, extraClass = '') {
  return `
    <div class="ui-stat ${extraClass}">
      <div class="ui-stat-label">${color ? `<span class="ui-stat-dot" style="background:${color}"></span>` : ''}${label}</div>
      <div class="ui-stat-value">${value}</div>
      <div class="ui-stat-sub">${sub}</div>
    </div>`;
}

function renderSummaryCards(deptSummary) {
  const box = document.getElementById('dash-dept-cards');
  const map = {};
  let grandTotal = 0;
  deptSummary.forEach(d => {
    map[d.ma_bo_phan] = d.tong_sl_chung_tu || 0;
    grandTotal += d.tong_sl_chung_tu || 0;
  });
  box.innerHTML = statCard('Tổng toàn xưởng', formatVn(grandTotal), 'đôi đã xuất', '', 'ui-stat-total') +
    deptList().map(d => statCard(escapeStr(d.ten), formatVn(map[d.ma] || 0), 'đôi', deptColor(d.ma))).join('');
}

/* 2. Bảng ma trận: PO / Mã hàng × Size (size lấy theo dữ liệu thực tế) */
function renderMatrixTable(rawMatrix) {
  const thead = document.querySelector('#matrix-table thead');
  const tbody = document.querySelector('#matrix-table tbody');
  const tfoot = document.querySelector('#matrix-table tfoot');

  const sizes = sortSizes([...new Set(rawMatrix.map(r => String(r.size)))]);
  currentMatrixSizes = sizes;

  thead.innerHTML = `
    <tr>
      <th class="c" style="width: 52px;">STT</th>
      <th>PO / Mã hàng</th>
      <th>ART / Màu</th>
      <th class="c">Chuyền</th>
      ${sizes.map(s => `<th class="c">${escapeStr(s)}</th>`).join('')}
      <th class="r">Tổng (đôi)</th>
    </tr>`;

  const grouped = {};
  rawMatrix.forEach(row => {
    const key = `${row.ma_hang}__${row.mau}__${row.ma_bo_phan}`;
    if (!grouped[key]) grouped[key] = { ma_hang: row.ma_hang, mau: row.mau, ma_bo_phan: row.ma_bo_phan, sizes: {}, total: 0 };
    grouped[key].sizes[row.size] = (grouped[key].sizes[row.size] || 0) + row.so_luong;
    grouped[key].total += row.so_luong;
  });
  const rows = Object.values(grouped);
  currentMatrixData = rows;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${sizes.length + 5}" class="ui-empty">Chưa có sản lượng trong khoảng thời gian này.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  const colTotals = {};
  let grandTotal = 0;
  tbody.innerHTML = rows.map((r, idx) => {
    grandTotal += r.total;
    return `
      <tr>
        <td class="c ui-muted">${idx + 1}</td>
        <td><strong>${escapeStr(r.ma_hang)}</strong></td>
        <td>${escapeStr(r.mau)}</td>
        <td class="c"><span class="ui-tag">${escapeStr(r.ma_bo_phan)}</span></td>
        ${sizes.map(s => {
          const q = r.sizes[s] || 0;
          colTotals[s] = (colTotals[s] || 0) + q;
          return `<td class="c">${q > 0 ? formatVn(q) : '<span class="ui-faint">·</span>'}</td>`;
        }).join('')}
        <td class="r ui-num-strong">${formatVn(r.total)}</td>
      </tr>`;
  }).join('');

  tfoot.innerHTML = `
    <tr>
      <td colspan="4" class="r">Cộng</td>
      ${sizes.map(s => `<td class="c">${colTotals[s] > 0 ? formatVn(colTotals[s]) : ''}</td>`).join('')}
      <td class="r ui-grand">${formatVn(grandTotal)}</td>
    </tr>`;
}

/* 3. Biểu đồ sản lượng theo ngày (cột chồng theo chuyền) */
function renderDailyChart(dailyData) {
  const container = document.getElementById('daily-chart-container');
  if (!container) return;
  if (!dailyData || dailyData.length === 0) {
    container.innerHTML = '<div class="ui-empty">Chưa có số liệu trong khoảng thời gian này.</div>';
    return;
  }

  const depts = deptList().map(d => d.ma);
  dailyData.forEach(d => { if (!depts.includes(d.ma_bo_phan)) depts.push(d.ma_bo_phan); });
  const datesMap = {};
  dailyData.forEach(d => {
    if (!datesMap[d.ngay]) datesMap[d.ngay] = {};
    datesMap[d.ngay][d.ma_bo_phan] = (datesMap[d.ngay][d.ma_bo_phan] || 0) + (d.sl_chung_tu || 0);
  });
  const dates = Object.keys(datesMap).sort();
  const dayTotal = dt => depts.reduce((a, m) => a + (datesMap[dt][m] || 0), 0);
  const maxVal = Math.max(1, ...dates.map(dayTotal));
  const usedDepts = depts.filter(m => dates.some(dt => datesMap[dt][m]));

  const bars = dates.map(dt => {
    const total = dayTotal(dt);
    const [, mm, dd] = dt.split('-');
    const segs = usedDepts.map(m => {
      const v = datesMap[dt][m] || 0;
      return v ? `<div class="ui-bar-seg" title="${escapeStr(m)}: ${formatVn(v)} đôi" style="height:${(v / maxVal) * 100}%; background:${deptColor(m)};"></div>` : '';
    }).join('');
    return `
      <div class="ui-bar">
        <div class="ui-bar-val">${formatVn(total)}</div>
        <div class="ui-bar-track">${segs}</div>
        <div class="ui-bar-date">${dd}/${mm}</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="ui-legend">
      ${usedDepts.map(m => `<span><i style="background:${deptColor(m)}"></i>${escapeStr((deptList().find(d => d.ma === m) || {}).ten || m)}</span>`).join('')}
    </div>
    <div class="ui-bars">${bars}</div>`;
}

/* 4. CÔNG NỢ THEO KHÁCH HÀNG */
async function loadCongNo(tuNgay, denNgay, khach) {
  let query = `?tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
  if (khach && khach !== 'all') query += `&khach_hang_id=${khach}`;
  try {
    const r = await (await fetch(`/api/congno${query}`)).json();
    if (!r.success) return;
    const boPhan = document.getElementById('dash-bophan').value;
    currentCongNo = r.data.filter(x => !boPhan || boPhan === 'all' || x.ma_bo_phan === boPhan);
    renderCongNo(currentCongNo);
  } catch (err) {
    console.error('Lỗi tải công nợ:', err);
  }
}

function khName(id) {
  if (!id) return '(Chưa gán khách hàng)';
  return window.Catalog?.byId(id)?.ten_ngan || `KH #${id}`;
}

function renderCongNo(rows) {
  const byKh = new Map();
  rows.forEach(x => {
    const k = x.khach_hang_id || 0;
    if (!byKh.has(k)) byKh.set(k, { sl: 0, tien: 0, phieu: new Set(), chuaGia: 0 });
    const g = byKh.get(k);
    g.sl += x.so_luong; g.tien += x.thanh_tien; g.phieu.add(x.so_phieu); g.chuaGia += x.sl_chua_gia;
  });
  const totSl = rows.reduce((a, x) => a + x.so_luong, 0);
  const totTien = rows.reduce((a, x) => a + x.thanh_tien, 0);
  const cards = [...byKh.entries()].map(([id, g], i) => statCard(
    `${escapeStr(khName(id))} · ${g.phieu.size} phiếu`,
    `${formatVn(g.tien)} đ`,
    `${formatVn(g.sl)} đôi${g.chuaGia ? ` · <span class="ui-warn-text">${formatVn(g.chuaGia)} đôi chưa có giá</span>` : ''}`,
    DEPT_COLORS[i % DEPT_COLORS.length]
  )).join('');
  document.getElementById('dash-kh-cards').innerHTML =
    statCard('Tổng công nợ', `${formatVn(totTien)} đ`, `${formatVn(totSl)} đôi`, '', 'ui-stat-total') + cards;

  const thead = document.querySelector('#congno-table thead');
  const tbody = document.querySelector('#congno-table tbody');
  const tfoot = document.querySelector('#congno-table tfoot');
  thead.innerHTML = `<tr>
    <th class="c" style="width: 52px;">STT</th><th>Khách hàng</th><th>Ngày</th><th>Số phiếu</th><th class="c">Chuyền</th>
    <th>PO</th><th>ART</th><th>Đơn hàng</th><th class="r">SL (đôi)</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr>`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="ui-empty">Không có phiếu nào trong khoảng thời gian này.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }
  tbody.innerHTML = rows.map((x, i) => {
    const [y, m, d] = String(x.ngay || '').split('-');
    return `
    <tr class="${x.sl_chua_gia ? 'is-warn' : ''}">
      <td class="c ui-muted">${i + 1}</td>
      <td>${escapeStr(khName(x.khach_hang_id))}</td>
      <td class="nowrap">${d ? `${d}/${m}/${y}` : ''}</td>
      <td class="nowrap"><strong>${escapeStr(x.so_phieu)}</strong></td>
      <td class="c"><span class="ui-tag">${escapeStr(x.ma_bo_phan)}</span></td>
      <td>${escapeStr(x.po)}</td>
      <td>${escapeStr(x.art)}</td>
      <td>${escapeStr(x.don_hang)}</td>
      <td class="r">${formatVn(x.so_luong)}</td>
      <td class="r">${x.don_gia ? formatVn(x.don_gia) : '<span class="ui-warn-text">chưa có</span>'}</td>
      <td class="r ui-num-strong">${formatVn(x.thanh_tien)}</td>
    </tr>`;
  }).join('');
  tfoot.innerHTML = `<tr>
    <td colspan="8" class="r">Cộng</td>
    <td class="r">${formatVn(totSl)}</td><td></td>
    <td class="r ui-grand">${formatVn(totTien)}</td></tr>`;
}

/* 5. Xuất Excel (CSV) */
function downloadCsv(content, name) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

function exportMatrixToExcel() {
  if (!currentMatrixData.length) { alert('Không có dữ liệu để xuất Excel!'); return; }
  let csv = '﻿' + ['STT', 'PO / Mã hàng', 'ART / Màu', 'Chuyền', ...currentMatrixSizes, 'Tổng (Đôi)'].map(csvCell).join(',') + '\n';
  currentMatrixData.forEach((r, idx) => {
    csv += [idx + 1, r.ma_hang, r.mau, r.ma_bo_phan, ...currentMatrixSizes.map(s => r.sizes[s] || 0), r.total].map(csvCell).join(',') + '\n';
  });
  downloadCsv(csv, `SanLuong_DDLongAn_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportCongNo() {
  if (!currentCongNo.length) { alert('Không có dữ liệu để xuất Excel!'); return; }
  let csv = '﻿' + ['STT', 'Khách hàng', 'Ngày', 'Số phiếu', 'Chuyền', 'PO', 'ART', 'Đơn hàng', 'SL (Đôi)', 'Đơn giá', 'Thành tiền'].map(csvCell).join(',') + '\n';
  currentCongNo.forEach((x, i) => {
    csv += [i + 1, khName(x.khach_hang_id), x.ngay, x.so_phieu, x.ma_bo_phan, x.po, x.art, x.don_hang, x.so_luong, x.don_gia, x.thanh_tien].map(csvCell).join(',') + '\n';
  });
  downloadCsv(csv, `CongNo_DDLongAn_${new Date().toISOString().slice(0, 10)}.csv`);
}

function formatVn(num) {
  if (!num) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(num * 100) / 100);
}

function escapeStr(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
