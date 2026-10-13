/**
 * DASHBOARD SẢN LƯỢNG - HỆ THỐNG PHIẾU XUẤT KHO D&D LONG AN
 * Tổng hợp sản lượng theo chuyền (TC, CMA, CMB), mã hàng, màu và size
 */

const DASHBOARD_SIZES = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
let currentMatrixData = [];

document.addEventListener('DOMContentLoaded', () => {
  const btnFilter = document.getElementById('btn-filter-dashboard');
  if (btnFilter) {
    btnFilter.addEventListener('click', loadDashboard);
  }

  const btnExport = document.getElementById('btn-export-excel');
  if (btnExport) {
    btnExport.addEventListener('click', exportMatrixToExcel);
  }
});

window.loadDashboard = async function() {
  const tuNgay = document.getElementById('dash-tu-ngay').value;
  const denNgay = document.getElementById('dash-den-ngay').value;
  const boPhan = document.getElementById('dash-bophan').value;

  let query = `?tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
  if (boPhan && boPhan !== 'all') query += `&bo_phan=${boPhan}`;

  try {
    const res = await fetch(`/api/dashboard${query}`);
    const result = await res.json();
    if (!result.success) return;

    const { deptSummary, rawMatrix, dailyData } = result.data;

    // 1. Render Thẻ tổng quan
    renderSummaryCards(deptSummary);

    // 2. Render Bảng ma trận
    renderMatrixTable(rawMatrix);

    // 3. Render biểu đồ sản lượng theo ngày
    renderDailyChart(dailyData);
  } catch (err) {
    console.error('Lỗi tải Dashboard:', err);
  }
};

/**
 * 1. Thẻ tổng quan theo từng chuyền
 */
function renderSummaryCards(deptSummary) {
  const map = { TC: 0, CMA: 0, CMB: 0 };
  let grandTotal = 0;

  deptSummary.forEach(d => {
    map[d.ma_bo_phan] = d.tong_sl_chung_tu || 0;
    grandTotal += d.tong_sl_chung_tu || 0;
  });

  document.getElementById('card-tc').textContent = formatVn(map.TC);
  document.getElementById('card-cma').textContent = formatVn(map.CMA);
  document.getElementById('card-cmb').textContent = formatVn(map.CMB);
  document.getElementById('card-total').textContent = formatVn(grandTotal);
}

/**
 * 2. Bảng ma trận: Mã hàng + Màu x Size
 */
function renderMatrixTable(rawMatrix) {
  const thead = document.querySelector('#matrix-table thead');
  const tbody = document.querySelector('#matrix-table tbody');
  const tfoot = document.querySelector('#matrix-table tfoot');

  // Tiêu đề
  let thHtml = `
    <tr>
      <th style="width: 40px;">STT</th>
      <th>Mã hàng</th>
      <th>Màu</th>
      <th style="width: 60px;">Chuyền</th>
  `;
  DASHBOARD_SIZES.forEach(s => {
    thHtml += `<th style="width: 48px;">${s}</th>`;
  });
  thHtml += `<th style="width: 80px;">Tổng (Đôi)</th></tr>`;
  thead.innerHTML = thHtml;

  // Gom nhóm dữ liệu theo (Mã hàng + Màu + Chuyền)
  const grouped = {};
  rawMatrix.forEach(row => {
    const key = `${row.ma_hang}__${row.mau}__${row.ma_bo_phan}`;
    if (!grouped[key]) {
      grouped[key] = {
        ma_hang: row.ma_hang,
        mau: row.mau,
        ma_bo_phan: row.ma_bo_phan,
        sizes: {},
        total: 0,
      };
    }
    grouped[key].sizes[row.size] = (grouped[key].sizes[row.size] || 0) + row.so_luong;
    grouped[key].total += row.so_luong;
  });

  const rows = Object.values(grouped);
  currentMatrixData = rows;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${DASHBOARD_SIZES.length + 5}" style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có dữ liệu sản lượng trong khoảng thời gian đã chọn.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  // Cột tổng dọc theo từng size
  const colSizeTotals = {};
  DASHBOARD_SIZES.forEach(s => colSizeTotals[s] = 0);
  let grandTotal = 0;

  tbody.innerHTML = rows.map((r, idx) => {
    let trHtml = `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${escapeStr(r.ma_hang)}</strong></td>
        <td>${escapeStr(r.mau)}</td>
        <td style="text-align: center;"><span class="btn" style="padding: 1px 5px; font-size: 10px;">${r.ma_bo_phan}</span></td>
    `;
    DASHBOARD_SIZES.forEach(s => {
      const q = r.sizes[s] || 0;
      colSizeTotals[s] += q;
      trHtml += `<td style="text-align: right;">${q > 0 ? formatVn(q) : '-'}</td>`;
    });
    grandTotal += r.total;
    trHtml += `<td style="text-align: right; font-weight: bold; color: var(--primary);">${formatVn(r.total)}</td></tr>`;
    return trHtml;
  }).join('');

  // Dòng cộng chân bảng
  let footHtml = `
    <tr style="background: #f1f5f9; font-weight: bold;">
      <td colspan="4" style="text-align: center;">CỘNG:</td>
  `;
  DASHBOARD_SIZES.forEach(s => {
    footHtml += `<td style="text-align: right;">${colSizeTotals[s] > 0 ? formatVn(colSizeTotals[s]) : '-'}</td>`;
  });
  footHtml += `<td style="text-align: right; color: var(--primary); font-size: 14px;">${formatVn(grandTotal)}</td></tr>`;
  tfoot.innerHTML = footHtml;
}

/**
 * 3. Vẽ biểu đồ sản lượng theo ngày
 */
function renderDailyChart(dailyData) {
  const container = document.getElementById('daily-chart-container');
  if (!container) return;

  if (!dailyData || dailyData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 30px; color: #94a3b8;">Không có số liệu biểu đồ</div>';
    return;
  }

  // Gom theo ngày
  const datesMap = {};
  dailyData.forEach(d => {
    if (!datesMap[d.ngay]) datesMap[d.ngay] = { TC: 0, CMA: 0, CMB: 0 };
    datesMap[d.ngay][d.ma_bo_phan] = (datesMap[d.ngay][d.ma_bo_phan] || 0) + (d.sl_chung_tu || 0);
  });

  const dates = Object.keys(datesMap).sort();
  let maxVal = 1;
  dates.forEach(dt => {
    const totalDay = datesMap[dt].TC + datesMap[dt].CMA + datesMap[dt].CMB;
    if (totalDay > maxVal) maxVal = totalDay;
  });

  let chartBars = dates.map(dt => {
    const item = datesMap[dt];
    const dayTotal = item.TC + item.CMA + item.CMB;
    const hTc = (item.TC / maxVal) * 120;
    const hCma = (item.CMA / maxVal) * 120;
    const hCmb = (item.CMB / maxVal) * 120;

    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
        <div style="font-size: 10px; font-weight: 600; color: #475569;">${formatVn(dayTotal)}</div>
        <div style="display: flex; align-items: flex-end; gap: 2px; height: 120px; background: #f8fafc; padding: 0 4px; border-bottom: 2px solid #cbd5e1;">
          <div title="TC: ${formatVn(item.TC)}" style="width: 14px; height: ${hTc}px; background: #2563eb; border-radius: 2px 2px 0 0;"></div>
          <div title="CMA: ${formatVn(item.CMA)}" style="width: 14px; height: ${hCma}px; background: #059669; border-radius: 2px 2px 0 0;"></div>
          <div title="CMB: ${formatVn(item.CMB)}" style="width: 14px; height: ${hCmb}px; background: #d97706; border-radius: 2px 2px 0 0;"></div>
        </div>
        <div style="font-size: 10px; color: #64748b; transform: rotate(-35deg); transform-origin: top left; margin-top: 4px;">${dt.slice(5)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="padding: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <strong style="font-size: 13px;">Sản lượng từng ngày theo Chuyền</strong>
        <div style="display: flex; gap: 12px; font-size: 11px;">
          <span><span style="display:inline-block; width:10px; height:10px; background:#2563eb;"></span> TC (Tổ chặt)</span>
          <span><span style="display:inline-block; width:10px; height:10px; background:#059669;"></span> CMA (Chuyền A)</span>
          <span><span style="display:inline-block; width:10px; height:10px; background:#d97706;"></span> CMB (Chuyền B)</span>
        </div>
      </div>
      <div style="display: flex; gap: 18px; overflow-x: auto; padding-bottom: 20px; align-items: flex-end;">
        ${chartBars}
      </div>
    </div>
  `;
}

/**
 * 4. Xuất bảng ma trận sang file Excel (.xlsx / .csv)
 */
function exportMatrixToExcel() {
  if (!currentMatrixData || currentMatrixData.length === 0) {
    alert('Không có dữ liệu để xuất Excel!');
    return;
  }

  // Tạo nội dung CSV định dạng UTF-8
  let csvContent = '\uFEFFSTT,Mã hàng,Màu,Chuyền,' + DASHBOARD_SIZES.join(',') + ',Tổng (Đôi)\n';

  currentMatrixData.forEach((r, idx) => {
    const rowSizes = DASHBOARD_SIZES.map(s => r.sizes[s] || 0);
    csvContent += `"${idx + 1}","${r.ma_hang}","${r.mau}","${r.ma_bo_phan}",${rowSizes.join(',')},"${r.total}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SanLuong_DDLongAn_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatVn(num) {
  if (!num) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
}

function escapeStr(s) {
  if (!s) return '';
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
