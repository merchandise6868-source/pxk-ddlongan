/**
 * FRONTEND LOGIC - HỆ THỐNG PHIẾU XUẤT KHO D&D LONG AN
 * Hỗ trợ nhập liệu kiểu Excel (Ctrl+V dán khối, phím mũi tên, Enter, Tab)
 * Tự động bóc tách size, kiểm tra lệch số lượng, in chuẩn A5 máy in kim
 */

const SIZES_LT = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49'];
const SIZES_JIAYU = ['35', '36', '37', '38', '39', '40', '41', '42', '43'];
const SIZES_DEFAULT = [...SIZES_LT];
const DEFAULT_COMPANY_ADDRESS = 'A8/21c, Bông Văn Dĩa, Xã Tân Nhựt, TP HCM';
const ALT_COMPANY_ADDRESS = 'Lô C, Đường số 1, KCN Hòa Bình, H. Thủ Thừa, Long An';

const SLIP_DRAFT_KEY = 'DD_SLIP_DRAFT_V1';

// State của ứng dụng
const AppState = {
  currentMau: 2,           // Mặc định mẫu 2: Không đơn giá
  currentEditingId: null,  // ID phiếu nếu đang sửa
  departments: [],
  selectedSizes: [...SIZES_DEFAULT], // Dải size mẫu 3
  rows: [],
};

function saveSlipDraft() {
  if (AppState.currentEditingId) return; // Nếu đang sửa phiếu cũ thì không lưu đè nháp tạo mới
  try {
    const draft = {
      mau: AppState.currentMau,
      bophan: document.getElementById('slip-bophan')?.value || '',
      date: document.getElementById('slip-date')?.value || '',
      donvi: document.getElementById('slip-donvi')?.value || '',
      lydo: document.getElementById('slip-lydo')?.value || '',
      donhang: document.getElementById('slip-donhang')?.value || '',
      bophanxuat: document.getElementById('slip-bophanxuat')?.value || '',
      nguoilap: document.getElementById('slip-nguoilap')?.value || '',
      diachiCty: document.getElementById('slip-diachi-cty')?.value || '',
      selectedSizes: AppState.selectedSizes,
      rows: AppState.rows,
    };
    localStorage.setItem(SLIP_DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    console.error('Lỗi lưu nháp phiếu:', err);
  }
}

function restoreSlipDraft() {
  try {
    const raw = localStorage.getItem(SLIP_DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
      if (draft.mau) AppState.currentMau = draft.mau;
      if (draft.selectedSizes && Array.isArray(draft.selectedSizes)) {
        AppState.selectedSizes = draft.selectedSizes;
      }
      AppState.rows = draft.rows;

      if (draft.donvi && document.getElementById('slip-donvi')) document.getElementById('slip-donvi').value = draft.donvi;
      if (draft.lydo && document.getElementById('slip-lydo')) document.getElementById('slip-lydo').value = draft.lydo;
      if (draft.donhang && document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = draft.donhang;
      if (draft.bophanxuat && document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = draft.bophanxuat;
      if (draft.nguoilap && document.getElementById('slip-nguoilap')) document.getElementById('slip-nguoilap').value = draft.nguoilap;
      if (draft.diachiCty && document.getElementById('slip-diachi-cty')) document.getElementById('slip-diachi-cty').value = draft.diachiCty;
      if (draft.date && document.getElementById('slip-date')) document.getElementById('slip-date').value = draft.date;

      switchMau(AppState.currentMau);
      return true;
    }
  } catch (err) {
    console.error('Lỗi nạp nháp phiếu:', err);
  }
  return false;
}

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFormControls();
  loadDepartments();
  const hasRestored = restoreSlipDraft();
  if (!hasRestored) {
    initDefaultRows();
  }
  loadSlipList();
});

/* ============================================================
   1. ĐIỀU HƯỚNG TABS
   ============================================================ */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add('active');

      if (btn.dataset.target === 'tab-list') {
        loadSlipList();
      } else if (btn.dataset.target === 'tab-dashboard') {
        if (window.loadDashboard) window.loadDashboard();
      } else if (btn.dataset.target === 'tab-qc') {
        if (window.loadQcHistory) window.loadQcHistory();
      } else if (btn.dataset.target === 'tab-totruong') {
        if (window.loadTotruongHistory) window.loadTotruongHistory();
      }
    });
  });
}

/* ============================================================
   2. KHỞI TẠO ĐIỀU KHIỂN FORM
   ============================================================ */
function initFormControls() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('slip-date').value = today;
  document.getElementById('filter-tu-ngay').value = getFirstDayOfMonth();
  document.getElementById('filter-den-ngay').value = getLastDayOfMonth();

  // Khi đổi bộ phận hoặc ngày -> gợi ý số phiếu mới
  document.getElementById('slip-bophan').addEventListener('change', () => {
    fetchNextSlipNumber();
    const bpXuatInput = document.getElementById('slip-bophanxuat');
    const selText = document.getElementById('slip-bophan')?.selectedOptions[0]?.text || '';
    if (bpXuatInput && !bpXuatInput.value) {
      bpXuatInput.value = selText;
    }
  });
  document.getElementById('slip-date').addEventListener('change', () => {
    fetchNextSlipNumber();
    saveSlipDraft();
  });

  // Tự động lưu nháp khi nhập thông tin đầu phiếu
  ['slip-donvi', 'slip-lydo', 'slip-donhang', 'slip-bophanxuat', 'slip-nguoilap', 'slip-diachi-cty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', saveSlipDraft);
      el.addEventListener('change', saveSlipDraft);
    }
  });

  // Xử lý chuyển đổi giữa 3 logic mẫu phiếu
  const mauCardBtns = document.querySelectorAll('.mau-card-btn');
  mauCardBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mau = parseInt(btn.dataset.mau, 10);
      switchMau(mau);
      saveSlipDraft();
    });
  });

  // Khi đổi mẫu phiếu từ dropdown (đồng bộ với các thẻ nút)
  document.getElementById('slip-mau').addEventListener('change', (e) => {
    const mau = parseInt(e.target.value, 10);
    switchMau(mau);
    saveSlipDraft();
  });

  // Nút hành động
  document.getElementById('btn-add-row').addEventListener('click', () => addRow());
  document.getElementById('btn-del-row').addEventListener('click', () => deleteLastRow());
  document.getElementById('btn-reset-form').addEventListener('click', resetForm);
  document.getElementById('btn-save-slip').addEventListener('click', saveSlip);
  document.getElementById('btn-print-slip').addEventListener('click', () => printCurrentSlip());
  document.getElementById('btn-filter-slips').addEventListener('click', loadSlipList);

  // Xử lý địa chỉ công ty in đầu phiếu
  const diachiInput = document.getElementById('slip-diachi-cty');
  if (diachiInput && !diachiInput.value) {
    diachiInput.value = DEFAULT_COMPANY_ADDRESS;
  }
  const btnQuickTanNhut = document.getElementById('btn-quick-addr-tannhut');
  const btnQuickLongAn = document.getElementById('btn-quick-addr-longan');
  if (btnQuickTanNhut) {
    btnQuickTanNhut.addEventListener('click', () => {
      if (diachiInput) diachiInput.value = DEFAULT_COMPANY_ADDRESS;
      btnQuickTanNhut.classList.add('active');
      if (btnQuickLongAn) btnQuickLongAn.classList.remove('active');
      showToast('Đã chọn địa chỉ: Xã Tân Nhựt, TP HCM', 'info');
    });
  }
  if (btnQuickLongAn) {
    btnQuickLongAn.addEventListener('click', () => {
      if (diachiInput) diachiInput.value = ALT_COMPANY_ADDRESS;
      btnQuickLongAn.classList.add('active');
      if (btnQuickTanNhut) btnQuickTanNhut.classList.remove('active');
      showToast('Đã chọn địa chỉ: KCN Hòa Bình, Long An', 'info');
    });
  }

  // Tùy chỉnh dải size cho Mẫu 3
  const btnApplyCustomSizes = document.getElementById('btn-apply-custom-sizes');
  if (btnApplyCustomSizes) {
    btnApplyCustomSizes.addEventListener('click', applyCustomSizeRange);
  }
  const btnAddSizeCol = document.getElementById('btn-add-size-col');
  if (btnAddSizeCol) {
    btnAddSizeCol.addEventListener('click', addSizeColumn);
  }
  const btnDelSizeCol = document.getElementById('btn-del-size-col');
  if (btnDelSizeCol) {
    btnDelSizeCol.addEventListener('click', removeSizeColumn);
  }
  const customSizeInput = document.getElementById('custom-size-input');
  if (customSizeInput) {
    customSizeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyCustomSizeRange();
    });
  }
}

function getFirstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getLastDayOfMonth() {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Chuyển đổi giữa 3 logic mẫu phiếu
 */
function switchMau(mau) {
  AppState.currentMau = mau;
  
  // Đồng bộ giá trị với dropdown (nếu có)
  const sel = document.getElementById('slip-mau');
  if (sel) sel.value = mau;

  // Cập nhật trạng thái active của các nút thẻ mẫu phiếu
  document.querySelectorAll('.mau-card-btn').forEach(btn => {
    if (parseInt(btn.dataset.mau, 10) === mau) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Cập nhật văn bản mô tả mẫu phiếu
  const descEl = document.getElementById('pxk-mau-desc-text');
  if (descEl) {
    if (mau === 1) {
      descEl.textContent = 'Cột: STT, Tên hàng, ĐVT, SL CT, SL Thực xuất, Đơn giá, Thành tiền • Tự tính Thành tiền';
    } else if (mau === 2) {
      descEl.textContent = 'Cột: STT, Tên hàng, ĐVT, SL CT, SL Thực xuất, Ghi chú • Tự động bóc tách size từ text';
    } else if (mau === 3) {
      descEl.textContent = 'Cột: STT, PO, Mã hàng, Diễn giải, ĐVT, dải size, Tổng • Cộng ngang theo size, cộng dọc chân cột';
    }
  }

  // Hiện/ẩn thanh chọn dải size khi chọn Mẫu 3
  const sizeRangeBox = document.getElementById('size-range-box');
  if (sizeRangeBox) {
    if (mau === 3) {
      sizeRangeBox.classList.add('show');
    } else {
      sizeRangeBox.classList.remove('show');
    }
  }

  // Tái tạo cấu trúc cột tương ứng
  renderTableStructure();
}

/**
 * Đồng bộ ô nhập dải size với mảng selectedSizes
 */
function updateCustomSizeInputText() {
  const customInput = document.getElementById('custom-size-input');
  if (customInput) {
    customInput.value = AppState.selectedSizes.join(', ');
  }
}

/**
 * Chọn nhanh dải size cho Mẫu 3
 */
window.setQuickSizeRange = function(type) {
  document.querySelectorAll('.pxk-size-pill').forEach(btn => btn.classList.remove('active'));
  if (type === 'jiayu') {
    AppState.selectedSizes = [...SIZES_JIAYU];
    const btn = Array.from(document.querySelectorAll('.pxk-size-pill')).find(b => b.textContent.includes('JiaYu'));
    if (btn) btn.classList.add('active');
    showToast('Đã chọn dải size JiaYu: 35 - 43', 'info');
  } else {
    // Mặc định LT: 35 đến 49 (Liến Thái)
    AppState.selectedSizes = [...SIZES_LT];
    const btn = Array.from(document.querySelectorAll('.pxk-size-pill')).find(b => b.textContent.includes('LT'));
    if (btn) btn.classList.add('active');
    showToast('Đã chọn dải size LT (Liến Thái): 35 - 49', 'info');
  }
  updateCustomSizeInputText();
  renderTableStructure();
};

/**
 * Áp dụng dải size nhập từ ô text tùy chỉnh
 */
function applyCustomSizeRange() {
  const customInput = document.getElementById('custom-size-input');
  if (!customInput) return;
  const raw = customInput.value.trim();
  if (!raw) return;

  // Tách dải size theo dấu phẩy, chấm phẩy hoặc khoảng trắng
  const parts = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    showToast('Vui lòng nhập ít nhất 1 size!', 'error');
    return;
  }

  // Loại bỏ size trùng lặp
  const uniqueSizes = [...new Set(parts)];
  AppState.selectedSizes = uniqueSizes;
  updateCustomSizeInputText();
  renderTableStructure();
  showToast(`Đã áp dụng dải ${uniqueSizes.length} size: ${uniqueSizes.join(', ')}`, 'success');
}

/**
 * Thêm 1 cột size vào cuối
 */
function addSizeColumn() {
  let nextSize = 'New';
  const len = AppState.selectedSizes.length;
  if (len > 0) {
    const last = AppState.selectedSizes[len - 1];
    const lastNum = parseFloat(last);
    if (!isNaN(lastNum)) {
      nextSize = String(lastNum + 1);
    } else {
      nextSize = `S${len + 1}`;
    }
  } else {
    nextSize = '34';
  }

  AppState.selectedSizes.push(nextSize);
  updateCustomSizeInputText();
  renderTableStructure();
  showToast(`Đã thêm cột size ${nextSize}`, 'info');
}

/**
 * Xóa bớt 1 cột size cuối
 */
function removeSizeColumn() {
  if (AppState.selectedSizes.length <= 1) {
    showToast('Bảng cần giữ lại ít nhất 1 cột size!', 'warning');
    return;
  }
  const removed = AppState.selectedSizes.pop();
  updateCustomSizeInputText();
  renderTableStructure();
  showToast(`Đã bớt cột size ${removed}`, 'info');
}

/**
 * Xử lý khi người dùng gõ sửa trực tiếp tên size trên Header cột
 */
function handleSizeHeaderChange(e) {
  const input = e.target;
  const sIdx = parseInt(input.dataset.sizeIdx, 10);
  const newSize = input.value.trim();
  const oldSize = AppState.selectedSizes[sIdx];

  if (!newSize) {
    input.value = oldSize;
    return;
  }

  if (newSize === oldSize) return;

  // Kiểm tra trùng tên size khác
  const exists = AppState.selectedSizes.some((s, i) => i !== sIdx && s === newSize);
  if (exists) {
    showToast(`Size "${newSize}" đã tồn tại trong bảng!`, 'error');
    input.value = oldSize;
    return;
  }

  // Cập nhật tên size
  AppState.selectedSizes[sIdx] = newSize;

  // Di chuyển dữ liệu trong từng dòng từ oldSize sang newSize
  AppState.rows.forEach(r => {
    if (r.sizes && r.sizes[oldSize] !== undefined) {
      r.sizes[newSize] = r.sizes[oldSize];
      delete r.sizes[oldSize];
    }
  });

  updateCustomSizeInputText();
  renderTableStructure();
  showToast(`Đã đổi size "${oldSize}" thành "${newSize}"`, 'success');
}

/* ============================================================
   3. TẢI DANH MỤC BỘ PHẬN & SỐ PHIẾU TIẾP THEO
   ============================================================ */
async function loadDepartments() {
  try {
    const res = await fetch('/api/bophan');
    const data = await res.json();
    if (data.success) {
      AppState.departments = data.data;
      const sel = document.getElementById('slip-bophan');
      const filterSel = document.getElementById('filter-bophan');
      
      sel.innerHTML = '';
      filterSel.innerHTML = '<option value="all">-- Tất cả bộ phận --</option>';

      data.data.forEach(bp => {
        sel.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma));
        filterSel.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma));
      });

      fetchNextSlipNumber();
      const bpXuatInput = document.getElementById('slip-bophanxuat');
      if (bpXuatInput && !bpXuatInput.value && sel.selectedOptions[0]) {
        bpXuatInput.value = sel.selectedOptions[0].text;
      }
    }
  } catch (err) {
    console.error('Lỗi tải bộ phận:', err);
  }
}

async function fetchNextSlipNumber() {
  if (AppState.currentEditingId) return; // Đang sửa phiếu cũ thì giữ nguyên số
  const boPhan = document.getElementById('slip-bophan').value;
  const dateStr = document.getElementById('slip-date').value;
  if (!boPhan || !dateStr) return;

  try {
    const res = await fetch(`/api/phieu/next-number?bo_phan=${boPhan}&date=${dateStr}`);
    const data = await res.json();
    if (data.success && data.nextNumber) {
      document.getElementById('slip-so').value = data.nextNumber;
    }
  } catch (err) {
    console.error('Lỗi lấy số phiếu:', err);
  }
}

/* ============================================================
   4. BẢNG NHẬP LIỆU KIỂU EXCEL
   ============================================================ */
function initDefaultRows() {
  AppState.rows = [];
  for (let i = 0; i < 6; i++) {
    AppState.rows.push(createEmptyRowData(i + 1));
  }
  renderTableStructure();
}

function createEmptyRowData(stt) {
  return {
    stt: stt || 1,
    ten_hang: '',
    ma_hang: '',
    mau: '',
    chi_tiet: '',
    dvt: 'Đôi',
    sl_chung_tu: '',
    sl_thuc_xuat: '',
    don_gia: '',
    thanh_tien: '',
    ghi_chu: '',
    sizes: {}, // { '36': 10, '37': 20 } với mẫu 3
    parsedSizes: [], // [{ size: '36', so_luong: 66 }] bóc tách từ tên hàng
    hasMismatch: false,
  };
}

function renderTableStructure() {
  const table = document.getElementById('excel-grid');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const tfoot = table.querySelector('tfoot');

  const mau = AppState.currentMau;

  // 1. Tiêu đề cột
  let thHtml = '<tr><th class="th-stt-col">STT</th>';
  if (mau === 1) {
    thHtml += `
      <th style="min-width: 280px;">Tên hàng, quy cách</th>
      <th style="width: 70px;">ĐVT</th>
      <th style="width: 95px;">SL Chứng từ</th>
      <th style="width: 95px;">SL Thực xuất</th>
      <th style="width: 100px;">Đơn giá</th>
      <th style="width: 110px;">Thành tiền</th>
      <th style="min-width: 120px;">Ghi chú</th>
    `;
  } else if (mau === 2) {
    thHtml += `
      <th style="min-width: 380px;">Tên hàng, quy cách</th>
      <th style="width: 80px;">ĐVT</th>
      <th style="width: 110px;">SL Chứng từ</th>
      <th style="width: 110px;">SL Thực xuất</th>
      <th style="min-width: 160px;">Ghi chú</th>
    `;
  } else if (mau === 3) {
    thHtml += `
      <th class="th-po-col">PO</th>
      <th class="th-ma-col">Mã hàng</th>
      <th class="th-chitiet-col">Diễn giải</th>
      <th class="th-dvt-col">ĐVT</th>
    `;
    AppState.selectedSizes.forEach((s, sIdx) => {
      thHtml += `
        <th class="th-size-col">
          <input type="text" class="size-header-input" data-size-idx="${sIdx}" value="${escapeHtml(s)}" title="Nhấp vào để đổi tên/số size này">
        </th>
      `;
    });
    thHtml += `
      <th class="th-total-col">Tổng</th>
    `;
  }
  thHtml += '</tr>';
  thead.innerHTML = thHtml;

  // Gắn sự kiện sửa tiêu đề size trực tiếp trên header
  if (mau === 3) {
    thead.querySelectorAll('.size-header-input').forEach(input => {
      input.addEventListener('change', handleSizeHeaderChange);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    });
  }

  // 2. Nội dung các dòng
  renderTableBody();
  calculateTotals();
}

function renderTableBody() {
  const tbody = document.querySelector('#excel-grid tbody');
  const mau = AppState.currentMau;
  tbody.innerHTML = '';

  AppState.rows.forEach((row, rIdx) => {
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = rIdx;

    let rowHtml = `<td style="text-align: center; font-weight: 600;">${rIdx + 1}</td>`;

    if (mau === 1) {
      rowHtml += `
        <td><textarea class="excel-cell textarea" data-field="ten_hang">${escapeHtml(row.ten_hang)}</textarea></td>
        <td><input type="text" class="excel-cell cell-center" data-field="dvt" value="${escapeHtml(row.dvt)}"></td>
        <td><input type="text" class="excel-cell cell-right" data-field="sl_chung_tu" value="${formatNum(row.sl_chung_tu)}"></td>
        <td><input type="text" class="excel-cell cell-right" data-field="sl_thuc_xuat" value="${formatNum(row.sl_thuc_xuat)}"></td>
        <td><input type="text" class="excel-cell cell-right" data-field="don_gia" value="${formatNum(row.don_gia)}"></td>
        <td><input type="text" class="excel-cell cell-right" data-field="thanh_tien" value="${formatNum(row.thanh_tien)}" readonly></td>
        <td><input type="text" class="excel-cell" data-field="ghi_chu" value="${escapeHtml(row.ghi_chu)}"></td>
      `;
    } else if (mau === 2) {
      rowHtml += `
        <td>
          <textarea class="excel-cell textarea" data-field="ten_hang">${escapeHtml(row.ten_hang)}</textarea>
          <div class="size-feedback-box" id="size-feedback-${rIdx}" style="padding: 2px 6px;"></div>
        </td>
        <td><input type="text" class="excel-cell cell-center" data-field="dvt" value="${escapeHtml(row.dvt)}"></td>
        <td><input type="text" class="excel-cell cell-right" data-field="sl_chung_tu" value="${formatNum(row.sl_chung_tu)}"></td>
        <td><input type="text" class="excel-cell cell-right" data-field="sl_thuc_xuat" value="${formatNum(row.sl_thuc_xuat)}"></td>
        <td><input type="text" class="excel-cell" data-field="ghi_chu" value="${escapeHtml(row.ghi_chu)}"></td>
      `;
    } else if (mau === 3) {
      rowHtml += `
        <td><input type="text" class="excel-cell td-po-cell" data-field="ma_hang" value="${escapeHtml(row.ma_hang)}"></td>
        <td><input type="text" class="excel-cell cell-center td-ma-cell" data-field="mau" value="${escapeHtml(row.mau)}"></td>
        <td><input type="text" class="excel-cell cell-center td-chitiet-cell" data-field="chi_tiet" value="${escapeHtml(row.chi_tiet || '')}"></td>
        <td><input type="text" class="excel-cell cell-center td-dvt-cell" data-field="dvt" value="${escapeHtml(row.dvt)}"></td>
      `;
      AppState.selectedSizes.forEach(s => {
        const val = row.sizes[s] !== undefined ? row.sizes[s] : '';
        rowHtml += `<td><input type="text" class="excel-cell cell-center size-val-cell" data-size="${s}" value="${formatNum(val)}"></td>`;
      });
      rowHtml += `
        <td><input type="text" class="excel-cell cell-center td-total-cell" data-field="sl_chung_tu" value="${formatNum(row.sl_chung_tu)}" readonly style="font-weight: 700;"></td>
      `;
    }

    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);

    // Cập nhật phản hồi bóc tách size cho mẫu 2
    if (mau === 2 && row.ten_hang) {
      updateSizeFeedback(rIdx);
    }
  });

  attachExcelCellEvents();
}

function addRow() {
  const newRow = createEmptyRowData(AppState.rows.length + 1);
  AppState.rows.push(newRow);
  renderTableBody();
  calculateTotals();
  saveSlipDraft();
}

function deleteLastRow() {
  if (AppState.rows.length > 1) {
    AppState.rows.pop();
    renderTableBody();
    calculateTotals();
    saveSlipDraft();
  }
}

/* ============================================================
   5. BẮT SỰ KIỆN EXCEL: PASTE KHỐI & DI CHUYỂN PHÍM
   ============================================================ */
function attachExcelCellEvents() {
  const cells = document.querySelectorAll('.excel-cell');

  cells.forEach(cell => {
    // 1. Xử lý Paste khối từ Excel
    cell.addEventListener('paste', handleCellPaste);

    // 2. Xử lý di chuyển bằng bàn phím (Mũi tên, Enter, Tab)
    cell.addEventListener('keydown', handleCellKeyDown);

    // 3. Xử lý thay đổi dữ liệu
    cell.addEventListener('input', handleCellInput);
  });
}

function handleCellInput(e) {
  const cell = e.target;
  const tr = cell.closest('tr');
  const rIdx = parseInt(tr.dataset.rowIndex, 10);
  const row = AppState.rows[rIdx];

  const field = cell.dataset.field;
  const sizeKey = cell.dataset.size;

  if (field) {
    row[field] = cell.value;
  } else if (sizeKey) {
    row.sizes[sizeKey] = parseVnNumber(cell.value);
  }

  // Tự động tính toán lại dòng
  recalcRow(rIdx);
  calculateTotals();
  saveSlipDraft();
}

function recalcRow(rIdx) {
  const row = AppState.rows[rIdx];
  const mau = AppState.currentMau;

  if (mau === 1) {
    const slCt = parseVnNumber(row.sl_chung_tu);
    const slTx = parseVnNumber(row.sl_thuc_xuat);
    const gia = parseVnNumber(row.don_gia);
    const qtyForTotal = slTx > 0 ? slTx : slCt;
    row.thanh_tien = qtyForTotal * gia;

    // Cập nhật ô thành tiền trên giao diện
    const tr = document.querySelector(`tr[data-row-index="${rIdx}"]`);
    if (tr) {
      const ttInput = tr.querySelector('[data-field="thanh_tien"]');
      if (ttInput) ttInput.value = formatNum(row.thanh_tien);
    }
  } else if (mau === 2) {
    // Tự động bóc tách size từ Tên hàng
    parseSizesFromText(rIdx);
    updateSizeFeedback(rIdx);
  } else if (mau === 3) {
    // Tính tổng ngang dải size
    let rowTotal = 0;
    AppState.selectedSizes.forEach(s => {
      rowTotal += parseVnNumber(row.sizes[s]);
    });
    row.sl_chung_tu = rowTotal;
    row.sl_thuc_xuat = rowTotal;

    const tr = document.querySelector(`tr[data-row-index="${rIdx}"]`);
    if (tr) {
      const sumInput = tr.querySelector('[data-field="sl_chung_tu"]');
      if (sumInput) sumInput.value = formatNum(rowTotal);
    }
  }
}

/**
 * Xử lý paste khối dữ liệu copy từ Excel
 * Excel copy dạng: Cột cách nhau bằng Tab (\t), Dòng cách nhau bằng Newline (\n)
 */
function handleCellPaste(e) {
  const clipboardData = e.clipboardData || window.clipboardData;
  const text = clipboardData.getData('text');

  // Nếu dữ liệu chứa ký tự Tab hoặc Xuống dòng -> Dán khối Excel
  if (text.includes('\t') || text.includes('\n')) {
    e.preventDefault();

    const startCell = e.target;
    const startTr = startCell.closest('tr');
    const startRowIdx = parseInt(startTr.dataset.rowIndex, 10);

    const rowsData = parseExcelClipboard(text);
    const tableTrs = Array.from(document.querySelectorAll('#excel-grid tbody tr'));

    // Thêm đủ dòng nếu paste nhiều hơn số dòng hiện có
    const requiredRows = startRowIdx + rowsData.length;
    while (AppState.rows.length < requiredRows) {
      AppState.rows.push(createEmptyRowData(AppState.rows.length + 1));
    }
    renderTableBody();

    // Điền dữ liệu vào các ô tương ứng
    const currentTrs = Array.from(document.querySelectorAll('#excel-grid tbody tr'));
    const startCellInputs = Array.from(startTr.querySelectorAll('.excel-cell'));
    const startColIdx = startCellInputs.indexOf(startCell);

    rowsData.forEach((rowValues, rOffset) => {
      const targetTr = currentTrs[startRowIdx + rOffset];
      if (!targetTr) return;

      const cells = Array.from(targetTr.querySelectorAll('.excel-cell'));
      rowValues.forEach((val, cOffset) => {
        const targetCell = cells[startColIdx + cOffset];
        if (targetCell && !targetCell.readOnly) {
          targetCell.value = val.trim();
          targetCell.dispatchEvent(new Event('input'));
        }
      });
    });

    showToast(`Đã dán thành công ${rowsData.length} dòng từ Excel`, 'info');
  }
}

/**
 * Phân tích dữ liệu clipboard từ Excel chuẩn
 */
function parseExcelClipboard(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const result = [];
  for (let line of lines) {
    if (line.trim() === '') continue;
    result.push(line.split('\t'));
  }
  return result;
}

/**
 * Điều hướng bằng phím: Mũi tên, Enter, Tab
 */
function handleCellKeyDown(e) {
  // Khi người dùng đang gõ tiếng Việt Telex (Unikey, EVKey hoặc IME trình duyệt), KHÔNG chặn phím
  if (e.isComposing || e.keyCode === 229) {
    return;
  }

  const cell = e.target;
  const tr = cell.closest('tr');
  const rIdx = parseInt(tr.dataset.rowIndex, 10);
  const cellsInRow = Array.from(tr.querySelectorAll('.excel-cell'));
  const cIdx = cellsInRow.indexOf(cell);

  if (e.key === 'ArrowDown') {
    const nextTr = document.querySelector(`tr[data-row-index="${rIdx + 1}"]`);
    if (nextTr) {
      const nextCells = Array.from(nextTr.querySelectorAll('.excel-cell'));
      if (nextCells[cIdx]) nextCells[cIdx].focus();
      e.preventDefault();
    }
  } else if (e.key === 'ArrowUp') {
    const prevTr = document.querySelector(`tr[data-row-index="${rIdx - 1}"]`);
    if (prevTr) {
      const prevCells = Array.from(prevTr.querySelectorAll('.excel-cell'));
      if (prevCells[cIdx]) prevCells[cIdx].focus();
      e.preventDefault();
    }
  } else if (e.key === 'Enter') {
    if (!e.shiftKey) {
      e.preventDefault();
      // Nhảy xuống ô bên dưới, nếu là dòng cuối thì tự động thêm dòng mới
      const nextTr = document.querySelector(`tr[data-row-index="${rIdx + 1}"]`);
      if (nextTr) {
        const nextCells = Array.from(nextTr.querySelectorAll('.excel-cell'));
        if (nextCells[cIdx]) nextCells[cIdx].focus();
      } else {
        addRow();
        setTimeout(() => {
          const addedTr = document.querySelector(`tr[data-row-index="${rIdx + 1}"]`);
          if (addedTr) {
            const addedCells = Array.from(addedTr.querySelectorAll('.excel-cell'));
            if (addedCells[cIdx]) addedCells[cIdx].focus();
          }
        }, 50);
      }
    }
  }
}

/* ============================================================
   6. BÓC TÁCH SIZE TỰ ĐỘNG & KIỂM TRA LỆCH SỐ LƯỢNG (MẪU 1 & 2)
   ============================================================ */
function parseSizesFromText(rIdx) {
  const row = AppState.rows[rIdx];
  const text = row.ten_hang || '';

  // 1. Tách Mã hàng & Màu nếu có
  const maMatch = text.match(/MÃ\s*:\s*([^\s,;]+)/i);
  if (maMatch) row.ma_hang = maMatch[1];

  const mauMatch = text.match(/MÀU\s*:\s*([^\s,;]+)/i);
  if (mauMatch) row.mau = mauMatch[1];

  // 2. Tách các cặp size/số lượng (Ví dụ: "36/66, 37/150, 38/246" hoặc "36: 66")
  const sizePairs = [];
  const regex = /(\b3\d|\b4\d)\s*[\/:]\s*([\d\.]+)/g;
  let match;
  let totalParsedQty = 0;

  while ((match = regex.exec(text)) !== null) {
    const size = match[1];
    const qty = parseVnNumber(match[2]);
    if (qty > 0) {
      sizePairs.push({ size, so_luong: qty });
      totalParsedQty += qty;
    }
  }

  row.parsedSizes = sizePairs;

  // 3. Kiểm tra chênh lệch với SL chứng từ
  const slChungTu = parseVnNumber(row.sl_chung_tu);
  if (slChungTu > 0 && sizePairs.length > 0) {
    row.hasMismatch = Math.abs(totalParsedQty - slChungTu) > 0.001;
  } else {
    row.hasMismatch = false;
  }
}

function updateSizeFeedback(rIdx) {
  const row = AppState.rows[rIdx];
  const container = document.getElementById(`size-feedback-${rIdx}`);
  if (!container) return;

  if (!row.parsedSizes || row.parsedSizes.length === 0) {
    container.innerHTML = '';
    return;
  }

  const totalParsed = row.parsedSizes.reduce((sum, s) => sum + s.so_luong, 0);
  const slCt = parseVnNumber(row.sl_chung_tu);

  if (row.hasMismatch) {
    container.innerHTML = `
      <span class="mismatch-badge">
        ⚠️ Lệch size: Bóc tách (${formatNum(totalParsed)}) ≠ SL chứng từ (${formatNum(slCt)})
      </span>
    `;
  } else {
    container.innerHTML = `
      <span class="match-badge">
        ✓ Khớp size: ${formatNum(totalParsed)} đôi (${row.parsedSizes.map(s => `${s.size}:${s.so_luong}`).join(', ')})
      </span>
    `;
  }
}

/* ============================================================
   7. TÍNH TỔNG CỘNG FOOTER
   ============================================================ */
function calculateTotals() {
  const mau = AppState.currentMau;
  const tfoot = document.querySelector('#excel-grid tfoot');
  if (!tfoot) return;

  let totalSlCt = 0;
  let totalSlTx = 0;
  let totalThanhTien = 0;
  const sizeTotals = {};

  AppState.selectedSizes.forEach(s => sizeTotals[s] = 0);

  AppState.rows.forEach(r => {
    totalSlCt += parseVnNumber(r.sl_chung_tu);
    totalSlTx += parseVnNumber(r.sl_thuc_xuat);
    totalThanhTien += parseVnNumber(r.thanh_tien);

    if (mau === 3 && r.sizes) {
      AppState.selectedSizes.forEach(s => {
        sizeTotals[s] += parseVnNumber(r.sizes[s]);
      });
    }
  });

  let footHtml = '<tr><td colspan="2" style="text-align: center; font-weight: bold;">CỘNG:</td>';

  if (mau === 1) {
    footHtml += `
      <td></td>
      <td style="text-align: right; font-weight: bold;">${formatNum(totalSlCt)}</td>
      <td style="text-align: right; font-weight: bold;">${formatNum(totalSlTx)}</td>
      <td></td>
      <td style="text-align: right; font-weight: bold; color: var(--primary);">${formatNum(totalThanhTien)}</td>
      <td></td>
    `;
  } else if (mau === 2) {
    footHtml += `
      <td></td>
      <td style="text-align: right; font-weight: bold;">${formatNum(totalSlCt)}</td>
      <td style="text-align: right; font-weight: bold;">${formatNum(totalSlTx)}</td>
      <td></td>
    `;
  } else if (mau === 3) {
    footHtml += `<td></td><td></td><td></td>`;
    AppState.selectedSizes.forEach(s => {
      footHtml += `<td style="text-align: center; font-weight: bold; padding: 4px 2px;">${formatNum(sizeTotals[s])}</td>`;
    });
    footHtml += `
      <td style="text-align: center; font-weight: bold; color: var(--primary); padding: 4px 2px;">${formatNum(totalSlCt)}</td>
    `;
  }
  footHtml += '</tr>';
  tfoot.innerHTML = footHtml;
}

/* ============================================================
   8. LƯU PHIẾU VÀO DATABASE
   ============================================================ */
async function saveSlip() {
  const soPhieu = document.getElementById('slip-so').value.trim();
  const maBoPhan = document.getElementById('slip-bophan').value;
  const ngay = document.getElementById('slip-date').value;
  const donViNhan = document.getElementById('slip-donvi').value.trim();
  const lyDoXuat = document.getElementById('slip-lydo').value.trim();
  const donHang = document.getElementById('slip-donhang')?.value?.trim() || '';
  const boPhanXuat = document.getElementById('slip-bophanxuat')?.value?.trim() || '';
  const nguoiLap = document.getElementById('slip-nguoilap').value.trim();

  if (!soPhieu) {
    showToast('Vui lòng nhập hoặc tạo Số phiếu!', 'error');
    return;
  }

  // Chuẩn bị payload dòng chi tiết
  const validLines = [];
  let hasAnyMismatch = false;

  AppState.rows.forEach((r, idx) => {
    const slCt = parseVnNumber(r.sl_chung_tu);
    const slTx = parseVnNumber(r.sl_thuc_xuat);

    // Bỏ qua dòng trống hoàn toàn
    if (!r.ten_hang && !r.ma_hang && slCt === 0 && slTx === 0) return;

    // Chuẩn bị size data
    const sizes = [];
    if (AppState.currentMau === 3) {
      AppState.selectedSizes.forEach(s => {
        const qty = parseVnNumber(r.sizes[s]);
        if (qty > 0) sizes.push({ size: s, so_luong: qty });
      });
    } else if (r.parsedSizes && r.parsedSizes.length > 0) {
      sizes.push(...r.parsedSizes);
    }

    if (r.hasMismatch) hasAnyMismatch = true;

    validLines.push({
      stt: idx + 1,
      ten_hang: r.ten_hang,
      ma_hang: r.ma_hang,
      mau: r.mau,
      dvt: r.dvt || 'Đôi',
      sl_chung_tu: slCt,
      sl_thuc_xuat: slTx,
      don_gia: parseVnNumber(r.don_gia),
      thanh_tien: parseVnNumber(r.thanh_tien),
      ghi_chu: AppState.currentMau === 3 ? (r.chi_tiet || r.ghi_chu || '') : (r.ghi_chu || ''),
      chi_tiet: r.chi_tiet || '',
      sizes,
      hasMismatch: r.hasMismatch,
    });
  });

  if (validLines.length === 0) {
    showToast('Vui lòng nhập ít nhất 1 dòng hàng hóa!', 'error');
    return;
  }

  const diaChiCty = document.getElementById('slip-diachi-cty')?.value?.trim() || DEFAULT_COMPANY_ADDRESS;

  const payload = {
    so_phieu: soPhieu,
    ma_bo_phan: maBoPhan,
    mau_phieu: AppState.currentMau,
    ngay,
    don_vi_nhan: donViNhan,
    ly_do_xuat: lyDoXuat,
    don_hang: donHang,
    bo_phan_xuat: boPhanXuat,
    nguoi_lap: nguoiLap,
    dia_chi_cty: diaChiCty,
    lines: validLines,
  };

  try {
    const url = AppState.currentEditingId ? `/api/phieu/${AppState.currentEditingId}` : '/api/phieu';
    const method = AppState.currentEditingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Lưu phiếu thành công!', 'success');
      if (hasAnyMismatch) {
        showToast('Lưu ý: Phiếu có dòng bị lệch size so với SL chứng từ!', 'error');
      }

      // Đảm bảo bộ lọc "Đến ngày" bao quát được ngày của phiếu vừa lưu
      const filterDenNgay = document.getElementById('filter-den-ngay');
      if (filterDenNgay && ngay && filterDenNgay.value < ngay) {
        filterDenNgay.value = ngay;
      }

      // Xóa form và nháp
      resetForm();

      // Nạp lại danh sách phiếu ngay lập tức
      await loadSlipList();

      // Tự động chuyển người dùng sang tab Danh Sách Phiếu để nhìn thấy ngay phiếu vừa lưu
      const listTabBtn = document.querySelector('.tab-btn[data-target="tab-list"]');
      if (listTabBtn) {
        listTabBtn.click();
      }
    } else {
      showToast(data.error || 'Lỗi khi lưu phiếu', 'error');
    }
  } catch (err) {
    console.error('Lỗi lưu phiếu:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

/* ============================================================
   9. IN PHIẾU KHỔ A5 NGANG TRÊN MÁY IN KIM
   ============================================================ */
function printCurrentSlip() {
  const soPhieu = document.getElementById('slip-so').value || '';
  const ngayStr = document.getElementById('slip-date').value || '';
  const donViNhan = document.getElementById('slip-donvi').value || '';
  const lyDoXuat = document.getElementById('slip-lydo').value || '';
  const donHang = document.getElementById('slip-donhang')?.value || '';
  const boPhanXuat = document.getElementById('slip-bophanxuat')?.value || (document.getElementById('slip-bophan')?.selectedOptions[0]?.text || '');
  const nguoiLap = document.getElementById('slip-nguoilap').value || '';
  const diachiCty = document.getElementById('slip-diachi-cty')?.value?.trim() || DEFAULT_COMPANY_ADDRESS;

  const [y, m, d] = ngayStr.split('-');
  const dateText = `Ngày ${d || '...'} tháng ${m || '...'} năm ${y || '...'}`;

  const printArea = document.getElementById('print-section');
  const mau = AppState.currentMau;

  // Lấy danh sách size thực sự cần in cho mẫu 3 (chỉ in size có số lượng thực tế để vừa khít giấy)
  let activeSizes = AppState.selectedSizes;
  if (mau === 3) {
    const sizesWithData = AppState.selectedSizes.filter(s => {
      return AppState.rows.some(r => parseVnNumber(r.sizes[s]) > 0);
    });
    if (sizesWithData.length > 0) {
      activeSizes = sizesWithData;
    }
  }

  let tableHeaderHtml = '';
  if (mau === 1) {
    tableHeaderHtml = `
      <tr>
        <th style="width: 26px; white-space: nowrap;">STT</th>
        <th style="white-space: normal; padding: 2px 4px;">Tên hàng, quy cách</th>
        <th style="width: 35px; white-space: nowrap; text-align: center;">ĐVT</th>
        <th style="width: 65px; white-space: nowrap; text-align: right;">SL CT</th>
        <th style="width: 65px; white-space: nowrap; text-align: right;">SL TX</th>
        <th style="width: 75px; white-space: nowrap; text-align: right;">Đơn giá</th>
        <th style="width: 85px; white-space: nowrap; text-align: right;">Thành tiền</th>
      </tr>
    `;
  } else if (mau === 2) {
    tableHeaderHtml = `
      <tr>
        <th style="width: 26px; white-space: nowrap;">STT</th>
        <th style="white-space: normal; padding: 2px 4px;">Tên hàng, quy cách</th>
        <th style="width: 35px; white-space: nowrap; text-align: center;">ĐVT</th>
        <th style="width: 85px; white-space: nowrap; text-align: right;">SL Chứng từ</th>
        <th style="width: 85px; white-space: nowrap; text-align: right;">SL Thực xuất</th>
      </tr>
    `;
  } else if (mau === 3) {
    tableHeaderHtml = `
      <tr>
        <th class="p-cell-stt">STT</th>
        <th class="p-cell-po">PO</th>
        <th class="p-cell-ma">Mã hàng</th>
        <th class="p-cell-chitiet">Diễn giải</th>
        <th class="p-cell-dvt">ĐVT</th>
        ${activeSizes.map(s => `<th class="p-cell-size">${s}</th>`).join('')}
        <th class="p-cell-total">Tổng</th>
      </tr>
    `;
  }

  let tableBodyHtml = '';
  let totalSlCt = 0;
  let totalSlTx = 0;
  let totalThanhTien = 0;
  const sizeTotals = {};
  activeSizes.forEach(s => sizeTotals[s] = 0);

  let sttCount = 0;
  AppState.rows.forEach(r => {
    const slCt = parseVnNumber(r.sl_chung_tu);
    const slTx = parseVnNumber(r.sl_thuc_xuat);
    if (!r.ten_hang && !r.ma_hang && slCt === 0 && slTx === 0) return;

    sttCount++;
    totalSlCt += slCt;
    totalSlTx += slTx;
    totalThanhTien += parseVnNumber(r.thanh_tien);

    if (mau === 1) {
      tableBodyHtml += `
        <tr>
          <td class="text-center nowrap">${sttCount}</td>
          <td class="text-left" style="white-space: pre-wrap; padding: 2px 4px;">${escapeHtml(r.ten_hang)}</td>
          <td class="text-center nowrap">${escapeHtml(r.dvt)}</td>
          <td class="text-right nowrap">${formatNum(slCt)}</td>
          <td class="text-right nowrap">${formatNum(slTx)}</td>
          <td class="text-right nowrap">${formatNum(r.don_gia)}</td>
          <td class="text-right nowrap">${formatNum(r.thanh_tien)}</td>
        </tr>
      `;
    } else if (mau === 2) {
      tableBodyHtml += `
        <tr>
          <td class="text-center nowrap">${sttCount}</td>
          <td class="text-left" style="white-space: pre-wrap; padding: 2px 4px;">${escapeHtml(r.ten_hang)}</td>
          <td class="text-center nowrap">${escapeHtml(r.dvt)}</td>
          <td class="text-right nowrap">${formatNum(slCt)}</td>
          <td class="text-right nowrap">${formatNum(slTx)}</td>
        </tr>
      `;
    } else if (mau === 3) {
      activeSizes.forEach(s => {
        sizeTotals[s] += parseVnNumber(r.sizes[s]);
      });
      tableBodyHtml += `
        <tr>
          <td class="p-cell-stt">${sttCount}</td>
          <td class="p-cell-po">${escapeHtml(r.ma_hang)}</td>
          <td class="p-cell-ma">${escapeHtml(r.mau)}</td>
          <td class="p-cell-chitiet">${escapeHtml(r.chi_tiet || '')}</td>
          <td class="p-cell-dvt">${escapeHtml(r.dvt)}</td>
          ${activeSizes.map(s => {
            const val = parseVnNumber(r.sizes[s]);
            return `<td class="p-cell-size">${val > 0 ? formatNum(val) : ''}</td>`;
          }).join('')}
          <td class="p-cell-total" style="font-weight: bold;">${formatNum(slCt)}</td>
        </tr>
      `;
    }
  });

  // Dòng cộng in
  let tableFootHtml = '';
  if (mau === 1) {
    tableFootHtml = `
      <tr class="p-total-row">
        <td colspan="3" class="text-center nowrap">CỘNG:</td>
        <td class="text-right nowrap">${formatNum(totalSlCt)}</td>
        <td class="text-right nowrap">${formatNum(totalSlTx)}</td>
        <td></td>
        <td class="text-right nowrap">${formatNum(totalThanhTien)}</td>
      </tr>
    `;
  } else if (mau === 2) {
    tableFootHtml = `
      <tr class="p-total-row">
        <td colspan="3" class="text-center nowrap">CỘNG:</td>
        <td class="text-right nowrap">${formatNum(totalSlCt)}</td>
        <td class="text-right nowrap">${formatNum(totalSlTx)}</td>
      </tr>
    `;
  } else if (mau === 3) {
    tableFootHtml = `
      <tr class="p-total-row">
        <td colspan="5" class="text-center nowrap">CỘNG:</td>
        ${activeSizes.map(s => {
          const val = sizeTotals[s];
          return `<td class="p-cell-size">${val > 0 ? formatNum(val) : ''}</td>`;
        }).join('')}
        <td class="p-cell-total" style="font-weight: bold;">${formatNum(totalSlCt)}</td>
      </tr>
    `;
  }

  let companyHeaderHtml = '';
  if (mau === 3) {
    companyHeaderHtml = `
      <div class="p-company p-company-mau3">
        <div class="p-company-name">CÔNG TY TNHH GIA CÔNG THƯƠNG MẠI D&D LONG AN</div>
        <div class="p-factory-row">
          <div class="p-factory-addr">
            <span class="p-info-lbl">Địa chỉ:</span> A8/21C Bông Văn Dĩa, Xã Tân Nhựt, Tp. Hồ Chí Minh, Việt Nam
          </div>
          <div class="p-factory-mst">
            <span class="p-info-lbl">Mã số thuế:</span> 1102116809
          </div>
        </div>
      </div>
    `;
  } else {
    companyHeaderHtml = `
      <div class="p-company">
        <div class="p-company-name">CÔNG TY TNHH GIA CÔNG THƯƠNG MẠI D&D LONG AN</div>
        <div class="p-company-address" contenteditable="true" title="Click để chỉnh sửa địa chỉ nếu cần">${escapeHtml(diachiCty)}</div>
      </div>
    `;
  }

  printArea.innerHTML = `
    <div class="print-page">
      <div class="p-header">
        ${companyHeaderHtml}
      </div>

      <div class="p-title-box">
        <div class="p-title">PHIẾU XUẤT KHO</div>
        <div class="p-sub-info">
          <div class="p-date">${dateText}</div>
          <div class="p-slip-no">Số: ${soPhieu}</div>
        </div>
      </div>

      <div class="p-meta">
        <div><strong>Đơn vị nhận:</strong> ${donViNhan || '................................................................'}</div>
        <div><strong>Bộ phận xuất kho:</strong> ${boPhanXuat || '................................................................'}</div>
        <div><strong>Đơn hàng:</strong> ${donHang || '................................................................'}</div>
        <div><strong>Lý do xuất:</strong> ${lyDoXuat || '................................................................'}</div>
      </div>

      <table class="p-table">
        <thead>${tableHeaderHtml}</thead>
        <tbody>${tableBodyHtml}</tbody>
        <tfoot>${tableFootHtml}</tfoot>
      </table>

      <div class="p-signatures">
        <div class="p-sig-col">
          <div class="p-sig-title">Người lập phiếu</div>
          <div class="p-sig-name">${nguoiLap || ''}</div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Người giao</div>
          <div class="p-sig-name"></div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Người nhận</div>
          <div class="p-sig-name"></div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Giám đốc</div>
          <div class="p-sig-name"></div>
        </div>
      </div>
    </div>
  `;

  // Tạm thời xóa title trang để tránh trình duyệt in tên trang ở header góc trên bên phải
  const prevTitle = document.title;
  document.title = '';

  window.addEventListener('afterprint', () => {
    document.title = prevTitle;
  }, { once: true });

  // Mở hộp thoại in trình duyệt
  window.print();

  setTimeout(() => {
    document.title = prevTitle;
  }, 1000);
}

/* ============================================================
   10. DANH SÁCH PHIẾU VÀ IN LẠI PHIẾU CŨ
   ============================================================ */
async function loadSlipList() {
  const tuNgay = document.getElementById('filter-tu-ngay').value;
  const denNgay = document.getElementById('filter-den-ngay').value;
  const boPhan = document.getElementById('filter-bophan').value;
  const search = document.getElementById('filter-search').value.trim();

  let query = `?tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
  if (boPhan) query += `&bo_phan=${boPhan}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await fetch(`/api/phieu${query}`);
    const data = await res.json();
    if (data.success) {
      renderSlipListTable(data.data);
    }
  } catch (err) {
    console.error('Lỗi tải danh sách phiếu:', err);
  }
}

function renderSlipListTable(slips) {
  const tbody = document.getElementById('slip-list-tbody');
  if (!slips || slips.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Không có phiếu nào phù hợp bộ lọc.</td></tr>';
    return;
  }

  tbody.innerHTML = slips.map((s, idx) => {
    const mauText = s.mau_phieu === 1 ? 'Có đơn giá' : (s.mau_phieu === 2 ? 'Không đơn giá' : 'Size run');
    const statusBadge = s.trang_thai === 'cancelled' 
      ? '<span class="mismatch-badge">Đã hủy</span>' 
      : '<span class="match-badge">Đã lưu</span>';
    
    const warnBadge = s.canh_bao_lech_size === 1 
      ? '<span title="Tổng size bóc tách lệch so với SL chứng từ">⚠️ Lệch size</span>' 
      : '';

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${s.so_phieu}</strong> ${warnBadge}</td>
        <td>${s.ngay}</td>
        <td style="text-align: center;"><span class="btn" style="padding: 2px 6px; font-size: 11px; background: #e2e8f0;">${s.ma_bo_phan}</span></td>
        <td>${mauText}</td>
        <td style="text-align: right; font-weight: 600;">${formatNum(s.tong_sl_chung_tu)}</td>
        <td style="text-align: right;">${formatNum(s.tong_sl_thuc_xuat)}</td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-primary" style="padding: 3px 8px; font-size: 11px;" onclick="reprintSlip(${s.id})">🖨️ In A5</button>
          <button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px;" onclick="editSlip(${s.id})">✏️ Sửa</button>
          ${s.trang_thai !== 'cancelled' ? `<button class="btn btn-danger" style="padding: 3px 8px; font-size: 11px;" onclick="cancelSlip(${s.id})">✕ Hủy</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// In lại phiếu từ Database (không lấy từ form nhập hiện tại)
window.reprintSlip = async function(id) {
  try {
    const res = await fetch(`/api/phieu/${id}`);
    const data = await res.json();
    if (!data.success) {
      showToast('Không lấy được dữ liệu phiếu', 'error');
      return;
    }

    const slip = data.data;

    // Lưu tạm state để tái sử dụng hàm in
    const prevMau = AppState.currentMau;
    const prevRows = AppState.rows;
    const prevSizes = [...AppState.selectedSizes];

    AppState.currentMau = slip.mau_phieu;

    if (slip.mau_phieu === 3) {
      const slipSizes = [];
      slip.lines.forEach(l => {
        if (l.sizes) {
          l.sizes.forEach(s => {
            if (s.so_luong > 0 && !slipSizes.includes(s.size)) slipSizes.push(s.size);
          });
        }
      });
      if (slipSizes.length > 0) {
        slipSizes.sort((a, b) => {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });
        AppState.selectedSizes = slipSizes;
      }
    }

    AppState.rows = slip.lines.map((l, idx) => {
      const sizesMap = {};
      if (l.sizes) {
        l.sizes.forEach(s => sizesMap[s.size] = s.so_luong);
      }
      return {
        stt: idx + 1,
        ten_hang: l.ten_hang,
        ma_hang: l.ma_hang,
        mau: l.mau,
        dvt: l.dvt,
        sl_chung_tu: l.sl_chung_tu,
        sl_thuc_xuat: l.sl_thuc_xuat,
        don_gia: l.don_gia,
        thanh_tien: l.thanh_tien,
        ghi_chu: l.ghi_chu,
        chi_tiet: l.chi_tiet || l.ghi_chu || '',
        sizes: sizesMap,
      };
    });

    document.getElementById('slip-so').value = slip.so_phieu;
    document.getElementById('slip-date').value = slip.ngay;
    document.getElementById('slip-donvi').value = slip.don_vi_nhan || '';
    document.getElementById('slip-lydo').value = slip.ly_do_xuat || '';
    if (document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = slip.don_hang || '';
    if (document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = slip.bo_phan_xuat || '';
    document.getElementById('slip-nguoilap').value = slip.nguoi_lap || '';
    const diachiInput = document.getElementById('slip-diachi-cty');
    if (diachiInput) diachiInput.value = slip.dia_chi_cty || DEFAULT_COMPANY_ADDRESS;

    printCurrentSlip();

    // Khôi phục state
    AppState.currentMau = prevMau;
    AppState.rows = prevRows;
    AppState.selectedSizes = prevSizes;
  } catch (err) {
    console.error('Lỗi in lại phiếu:', err);
    showToast('Lỗi khi nạp dữ liệu in', 'error');
  }
};

window.editSlip = async function(id) {
  try {
    const res = await fetch(`/api/phieu/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const slip = data.data;
    AppState.currentEditingId = slip.id;

    if (slip.mau_phieu === 3) {
      const slipSizes = [];
      slip.lines.forEach(l => {
        if (l.sizes) {
          l.sizes.forEach(s => {
            if (!slipSizes.includes(s.size)) slipSizes.push(s.size);
          });
        }
      });
      if (slipSizes.length > 0) {
        slipSizes.sort((a, b) => {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });
        AppState.selectedSizes = slipSizes;
        updateCustomSizeInputText();
      }
    }

    switchMau(slip.mau_phieu);
    document.getElementById('slip-bophan').value = slip.ma_bo_phan;
    document.getElementById('slip-so').value = slip.so_phieu;
    document.getElementById('slip-date').value = slip.ngay;
    document.getElementById('slip-donvi').value = slip.don_vi_nhan || '';
    document.getElementById('slip-lydo').value = slip.ly_do_xuat || '';
    if (document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = slip.don_hang || '';
    if (document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = slip.bo_phan_xuat || '';
    document.getElementById('slip-nguoilap').value = slip.nguoi_lap || '';
    const diachiInput = document.getElementById('slip-diachi-cty');
    if (diachiInput) diachiInput.value = slip.dia_chi_cty || DEFAULT_COMPANY_ADDRESS;

    AppState.rows = slip.lines.map((l, idx) => {
      const sizesMap = {};
      if (l.sizes) {
        l.sizes.forEach(s => sizesMap[s.size] = s.so_luong);
      }
      return {
        stt: idx + 1,
        ten_hang: l.ten_hang,
        ma_hang: l.ma_hang,
        mau: l.mau,
        dvt: l.dvt,
        sl_chung_tu: l.sl_chung_tu,
        sl_thuc_xuat: l.sl_thuc_xuat,
        don_gia: l.don_gia,
        thanh_tien: l.thanh_tien,
        ghi_chu: l.ghi_chu,
        chi_tiet: l.chi_tiet || l.ghi_chu || '',
        sizes: sizesMap,
      };
    });

    renderTableStructure();

    // Chuyển sang tab Lập phiếu
    document.querySelector('.tab-btn[data-target="tab-create"]').click();
    showToast(`Đang chỉnh sửa phiếu: ${slip.so_phieu}`, 'info');
  } catch (err) {
    console.error('Lỗi nạp phiếu sửa:', err);
  }
};

window.cancelSlip = async function(id) {
  if (!confirm('Bạn có chắc chắn muốn HỦY phiếu này không? Phiếu hủy sẽ không được cộng vào Dashboard sản lượng.')) return;

  try {
    const res = await fetch(`/api/phieu/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trang_thai: 'cancelled' }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã hủy phiếu', 'success');
      loadSlipList();
    }
  } catch (err) {
    console.error('Lỗi hủy phiếu:', err);
  }
};

function resetForm() {
  AppState.currentEditingId = null;
  document.getElementById('slip-donvi').value = '';
  document.getElementById('slip-lydo').value = '';
  if (document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = '';
  if (document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = '';
  const diachiInput = document.getElementById('slip-diachi-cty');
  if (diachiInput) diachiInput.value = DEFAULT_COMPANY_ADDRESS;

  try {
    localStorage.removeItem(SLIP_DRAFT_KEY);
  } catch (e) {}

  switchMau(2);
  initDefaultRows();
  fetchNextSlipNumber();
}

/* ============================================================
   TIỆN ÍCH DÙNG CHUNG
   ============================================================ */
function parseVnNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Xóa khoảng trắng, dấu chấm phân cách hàng ngàn, đổi dấu phẩy thành chấm thập phân
  const clean = String(val).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatNum(val) {
  if (val === undefined || val === null || val === '' || val === 0) return '';
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  // Định dạng số chuẩn Việt Nam: dấu chấm phân cách nghìn
  return new Intl.NumberFormat('vi-VN').format(num);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
