/**
 * DASHBOARD SẢN LƯỢNG - HỆ THỐNG PHIẾU XUẤT KHO D&D LONG AN
 * - Theo Tổ / Chuyền: thẻ tổng, biểu đồ theo ngày, ma trận Mã hàng × Size
 * - Theo Khách hàng: tổng đôi, thành tiền (công nợ), bảng kê theo phiếu · PO · ART
 * Lưu ý: dòng chi tiết (miếng) của bộ JiaYu không cộng vào sản lượng — chỉ tính dòng ĐỒNG BỘ ĐÔI
 */

const DEPT_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
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
});

async function fillDashFilters() {
  const bpSel = document.getElementById('dash-bophan');
  const khSel = document.getElementById('dash-khachhang');
  if (!dashDepts.length) {
    try {
      const r = await (await fetch('/api/bophan')).json();
      if (r.success) dashDepts = r.data;
    } catch (_) {}
  }
  if (bpSel && bpSel.options.length <= 1) {
    dashDepts.forEach(d => bpSel.add(new Option(`${d.ten} (${d.ma})`, d.ma)));
  }
  if (khSel && window.Catalog) {
    const cur = khSel.value;
    khSel.innerHTML = '<option value="all">-- Tất cả khách hàng --</option>' +
      window.Catalog.khachAll.map(k => `<option value="${k.id}">${escapeStr(k.ten_ngan)}</option>`).join('') +
      '<option value="none">(Chưa gán khách hàng)</option>';
    khSel.value = Array.from(khSel.options).some(o => o.value === cur) ? cur : 'all';
  }
}

window.loadDashboard = async function() {
  await fillDashFilters();
  const tuNgay = document.getElementById('dash-tu-ngay').value;
  const denNgay = document.getElementById('dash-den-ngay').value;
  const boPhan = document.getElementById('dash-bophan').value;
  const khach = document.getElementById('dash-khachhang')?.value || 'all';

  if (dashView === 'khach') return loadCongNo(tuNgay, denNgay, khach);

  let query = `?tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
  if (boPhan && boPhan !== 'all') query += `&bo_phan=${boPhan}`;
  if (khach && khach !== 'all' && khach !== 'none') query += `&khach_hang_id=${khach}`;

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
function renderSummaryCards(deptSummary) {
  const box = document.getElementById('dash-dept-cards');
  const map = {};
  let grandTotal = 0;
  deptSummary.forEach(d => {
    map[d.ma_bo_phan] = d.tong_sl_chung_tu || 0;
    grandTotal += d.tong_sl_chung_tu || 0;
  });
  box.innerHTML = deptList().map(d => `
    <div class="stat-card" style="border-left-color: ${deptColor(d.ma)};">
      <div class="label">${escapeStr(d.ten)} (${escapeStr(d.ma)})</div>
      <div class="value">${formatVn(map[d.ma] || 0)}</div>
      <div class="sub">Tổng số đôi đã xuất</div>
    </div>`).join('') + `
    <div class="stat-card total">
      <div class="label">Tổng Toàn Xưởng</div>
      <div class="value">${formatVn(grandTotal)}</div>
      <div class="sub">Tổng cộng các chuyền (Đôi)</div>
    </div>`;
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
      <th style="width: 40px;">STT</th>
      <th>PO / Mã hàng</th>
      <th>ART / Màu</th>
      <th style="width: 60px;">Chuyền</th>
      ${sizes.map(s => `<th style="min-width: 44px;">${escapeStr(s)}</th>`).join('')}
      <th style="width: 80px;">Tổng (Đôi)</th>
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
    tbody.innerHTML = `<tr><td colspan="${sizes.length + 5}" style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có dữ liệu sản lượng trong khoảng thời gian đã chọn.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  const colTotals = {};
  let grandTotal = 0;
  tbody.innerHTML = rows.map((r, idx) => {
    grandTotal += r.total;
    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${escapeStr(r.ma_hang)}</strong></td>
        <td>${escapeStr(r.mau)}</td>
        <td style="text-align: center;"><span class="btn" style="padding: 1px 5px; font-size: 10px;">${escapeStr(r.ma_bo_phan)}</span></td>
        ${sizes.map(s => {
          const q = r.sizes[s] || 0;
          colTotals[s] = (colTotals[s] || 0) + q;
          return `<td style="text-align: right;">${q > 0 ? formatVn(q) : '-'}</td>`;
        }).join('')}
        <td style="text-align: right; font-weight: bold; color: var(--primary);">${formatVn(r.total)}</td>
      </tr>`;
  }).join('');

  tfoot.innerHTML = `
    <tr style="background: #f1f5f9; font-weight: bold;">
      <td colspan="4" style="text-align: center;">CỘNG:</td>
      ${sizes.map(s => `<td style="text-align: right;">${colTotals[s] > 0 ? formatVn(colTotals[s]) : '-'}</td>`).join('')}
      <td style="text-align: right; color: var(--primary); font-size: 14px;">${formatVn(grandTotal)}</td>
    </tr>`;
}

/* 3. Biểu đồ sản lượng theo ngày (cột theo chuyền) */
function renderDailyChart(dailyData) {
  const container = document.getElementById('daily-chart-container');
  if (!container) return;
  if (!dailyData || dailyData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 30px; color: #94a3b8;">Không có số liệu biểu đồ</div>';
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

  const bars = dates.map(dt => `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <div style="font-size: 10px; font-weight: 600; color: #475569;">${formatVn(dayTotal(dt))}</div>
      <div style="display: flex; align-items: flex-end; gap: 2px; height: 120px; background: #f8fafc; padding: 0 4px; border-bottom: 2px solid #cbd5e1;">
        ${depts.map(m => `<div title="${m}: ${formatVn(datesMap[dt][m] || 0)}" style="width: 12px; height: ${((datesMap[dt][m] || 0) / maxVal) * 120}px; background: ${deptColor(m)}; border-radius: 2px 2px 0 0;"></div>`).join('')}
      </div>
      <div style="font-size: 10px; color: #64748b; transform: rotate(-35deg); transform-origin: top left; margin-top: 4px;">${dt.slice(5)}</div>
    </div>`).join('');

  container.innerHTML = `
    <div style="padding: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <strong style="font-size: 13px;">Sản lượng từng ngày theo Chuyền</strong>
        <div style="display: flex; gap: 12px; font-size: 11px; flex-wrap: wrap;">
          ${depts.map(m => `<span><span style="display:inline-block; width:10px; height:10px; background:${deptColor(m)};"></span> ${escapeStr(m)}</span>`).join('')}
        </div>
      </div>
      <div style="display: flex; gap: 18px; overflow-x: auto; padding-bottom: 20px; align-items: flex-end;">${bars}</div>
    </div>`;
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
  const cards = [...byKh.entries()].map(([id, g], i) => `
    <div class="stat-card" style="border-left-color: ${DEPT_COLORS[i % DEPT_COLORS.length]};">
      <div class="label">${escapeStr(khName(id))} · ${g.phieu.size} phiếu</div>
      <div class="value">${formatVn(g.tien)} đ</div>
      <div class="sub">${formatVn(g.sl)} đôi${g.chuaGia ? ` · <span style="color:#b45309;">${formatVn(g.chuaGia)} đôi chưa có giá</span>` : ''}</div>
    </div>`).join('');
  document.getElementById('dash-kh-cards').innerHTML = cards + `
    <div class="stat-card total">
      <div class="label">Tổng cộng</div>
      <div class="value">${formatVn(totTien)} đ</div>
      <div class="sub">${formatVn(totSl)} đôi</div>
    </div>`;

  const thead = document.querySelector('#congno-table thead');
  const tbody = document.querySelector('#congno-table tbody');
  const tfoot = document.querySelector('#congno-table tfoot');
  thead.innerHTML = `<tr>
    <th style="width: 40px;">STT</th><th>Khách hàng</th><th>Ngày</th><th>Số phiếu</th><th>Chuyền</th>
    <th>PO</th><th>ART</th><th>Đơn hàng</th><th>SL (Đôi)</th><th>Đơn giá</th><th>Thành tiền</th></tr>`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 24px; color: var(--text-muted);">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }
  tbody.innerHTML = rows.map((x, i) => `
    <tr ${x.sl_chua_gia ? 'style="background: #fef9c3;"' : ''}>
      <td style="text-align:center;">${i + 1}</td>
      <td>${escapeStr(khName(x.khach_hang_id))}</td>
      <td style="white-space: nowrap;">${escapeStr(x.ngay)}</td>
      <td style="white-space: nowrap;"><strong>${escapeStr(x.so_phieu)}</strong></td>
      <td style="text-align:center;">${escapeStr(x.ma_bo_phan)}</td>
      <td>${escapeStr(x.po)}</td>
      <td>${escapeStr(x.art)}</td>
      <td>${escapeStr(x.don_hang)}</td>
      <td style="text-align:right; font-weight:600;">${formatVn(x.so_luong)}</td>
      <td style="text-align:right;">${x.don_gia ? formatVn(x.don_gia) : '<span style="color:#b45309;">chưa có</span>'}</td>
      <td style="text-align:right; font-weight:700; color: var(--primary);">${formatVn(x.thanh_tien)}</td>
    </tr>`).join('');
  tfoot.innerHTML = `<tr style="background:#f1f5f9; font-weight:bold;">
    <td colspan="8" style="text-align:center;">CỘNG:</td>
    <td style="text-align:right;">${formatVn(totSl)}</td><td></td>
    <td style="text-align:right; color: var(--primary); font-size: 14px;">${formatVn(totTien)}</td></tr>`;
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
