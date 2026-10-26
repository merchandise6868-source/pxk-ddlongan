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
/** Mỗi khách hàng giữ 1 nháp riêng (đổi khách ở thanh bên không mất phiếu đang nhập); 0 = phiếu không gán khách */
const draftKey = khId => `${SLIP_DRAFT_KEY}:${khId || 0}`;

// State của ứng dụng
const AppState = {
  currentMau: 2,           // Mặc định mẫu 2: Không đơn giá
  currentEditingId: null,  // ID phiếu nếu đang sửa
  departments: [],
  selectedSizes: [...SIZES_DEFAULT], // Dải size mẫu 3
  rows: [],
  khachHangId: null,       // Khách hàng đang chọn
  dayIdx: 0,               // Dãy size đang chọn của khách hàng
  defaultDvt: 'Đôi',       // ĐVT mặc định cho dòng mới
  kieuXuat: 'chi_tiet',    // Khách có bộ chi tiết (JiaYu): 'doi' = xuất theo đôi · 'chi_tiet' = theo chi tiết (miếng) + dòng đồng bộ đôi
  lastAutoDonHang: '',     // Giá trị "Đơn hàng" do hệ thống tự ghép (để biết người dùng đã sửa tay chưa)
  dotDon: null,            // Đợt đơn hàng của phiếu (chọn ở ô "Đơn hàng đợt"); null = đợt mới nhất của khách
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
      nguoigiao: document.getElementById('slip-nguoigiao')?.value || '',
      phongkh: document.getElementById('slip-phongkh')?.value || '',
      diachiCty: document.getElementById('slip-diachi-cty')?.value || '',
      selectedSizes: AppState.selectedSizes,
      rows: AppState.rows,
      khachHangId: AppState.khachHangId,
      dayIdx: AppState.dayIdx,
      lastAutoDonHang: AppState.lastAutoDonHang,
      kieuXuat: AppState.kieuXuat,
      dotDon: AppState.dotDon,
    };
    localStorage.setItem(draftKey(AppState.khachHangId), JSON.stringify(draft));
  } catch (err) {
    console.error('Lỗi lưu nháp phiếu:', err);
  }
}

/** Bản cũ chỉ có 1 nháp chung -> chuyển sang nháp của đúng khách trong nháp */
function migrateOldDraft() {
  try {
    const raw = localStorage.getItem(SLIP_DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    const key = draftKey(draft && draft.khachHangId);
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    localStorage.removeItem(SLIP_DRAFT_KEY);
  } catch (e) {}
}

function removeSlipDraft(khId) {
  try { localStorage.removeItem(draftKey(khId)); } catch (e) {}
}

function restoreSlipDraft(khId) {
  try {
    const raw = localStorage.getItem(draftKey(khId));
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
      clearSlipFields();
      if (draft.mau) AppState.currentMau = draft.mau;
      if (draft.selectedSizes && Array.isArray(draft.selectedSizes)) {
        AppState.selectedSizes = draft.selectedSizes;
      }
      AppState.rows = draft.rows;
      AppState.khachHangId = khId || null;
      AppState.dayIdx = draft.dayIdx || 0;
      AppState.lastAutoDonHang = draft.lastAutoDonHang || '';
      AppState.kieuXuat = draft.kieuXuat === 'doi' ? 'doi' : 'chi_tiet';
      AppState.dotDon = draft.dotDon || null;
      assignBlockKeys(AppState.rows);

      if (draft.donvi && document.getElementById('slip-donvi')) document.getElementById('slip-donvi').value = draft.donvi;
      if (draft.lydo && document.getElementById('slip-lydo')) document.getElementById('slip-lydo').value = draft.lydo;
      if (draft.donhang && document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = draft.donhang;
      if (draft.bophanxuat && document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = draft.bophanxuat;
      if (draft.nguoilap && document.getElementById('slip-nguoilap')) document.getElementById('slip-nguoilap').value = draft.nguoilap;
      if (draft.nguoigiao && document.getElementById('slip-nguoigiao')) document.getElementById('slip-nguoigiao').value = draft.nguoigiao;
      if (draft.phongkh && document.getElementById('slip-phongkh')) document.getElementById('slip-phongkh').value = draft.phongkh;
      if (draft.diachiCty && document.getElementById('slip-diachi-cty')) document.getElementById('slip-diachi-cty').value = draft.diachiCty;
      if (draft.date && document.getElementById('slip-date')) document.getElementById('slip-date').value = draft.date;

      selectCustomer(AppState.khachHangId, { fromLoad: true });
      if (draft.bophan) setDeptValue(draft.bophan);
      switchMau(AppState.currentMau);
      return true;
    }
  } catch (err) {
    console.error('Lỗi nạp nháp phiếu:', err);
  }
  return false;
}

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initFormControls();
  initDefaultRows();
  // Chờ đăng nhập xong (auth.js) rồi mới tải dữ liệu
  if (window.AuthReady) await window.AuthReady;
  await Promise.all([loadDepartments(), window.Catalog ? window.Catalog.load() : null]);
  renderCustomerPills();
  migrateOldDraft();
  // Khách hàng theo thanh bên (khsidebar.js)
  const khStart = window.KH ? window.KH.one() : null;
  const hasRestored = restoreSlipDraft(khStart);
  if (!hasRestored) {
    if (khStart && currentCustomerById(khStart)) selectCustomer(khStart, { quiet: true });
    else renderTableStructure();
  }
  AppState.ready = true;
  const can = tab => !window.Auth || window.Auth.can(tab);
  if (can('tab-create')) fetchNextSlipNumber();
  if (can('tab-list')) loadSlipList();

  ['filter-tu-ngay', 'filter-den-ngay', 'filter-bophan'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', loadSlipList);
  });
  document.getElementById('filter-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSlipList(); });

  // Danh mục thay đổi (thêm khách / PO / bộ chi tiết) -> cập nhật lại nút & gợi ý
  window.addEventListener('catalog-changed', () => {
    renderCustomerPills();
    renderDayPills();
    renderBoPanel();
    refreshPoDatalist();
  });

  // Thanh bên đổi khách -> Lập phiếu đổi theo (cất nháp khách cũ), Danh sách phiếu lọc lại
  window.addEventListener('kh-changed', e => {
    if (!AppState.ready || AppState.syncingKh) return;
    if (can('tab-create')) switchSlipCustomer(window.KH.one(), e.detail && e.detail.carry);
    if (document.getElementById('tab-list')?.classList.contains('active')) loadSlipList();
  });
  // Đang sửa phiếu đã lưu -> hỏi trước khi đổi khách (đổi khách = bỏ sửa)
  if (window.KH) window.KH.guard(id => {
    if (AppState.saving) return 'Phiếu đang được lưu – nên đợi lưu xong rồi mới đổi khách.';
    if (!AppState.currentEditingId) return '';
    if ((typeof id === 'number' ? id : null) === (AppState.khachHangId || null)) return '';
    return `Đang sửa phiếu ${document.getElementById('slip-so')?.value || ''} – chuyển khách sẽ bỏ sửa (phiếu đã lưu không mất).`;
  });
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
  const today = window.U ? window.U.today() : new Date().toISOString().slice(0, 10);
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
  ['slip-donvi', 'slip-lydo', 'slip-donhang', 'slip-bophanxuat', 'slip-nguoilap', 'slip-nguoigiao', 'slip-phongkh', 'slip-diachi-cty'].forEach(id => {
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
  document.getElementById('btn-add-ks-row')?.addEventListener('click', () => {
    if (AppState.currentMau !== 3) switchMau(3);
    window.Grid.insertRow(AppState.rows.length, 'khong_size');
  });
  document.getElementById('btn-del-selected-rows')?.addEventListener('click', () => window.Grid.deleteSelectedRows());
  document.getElementById('btn-reset-form').addEventListener('click', resetForm);
  document.getElementById('btn-save-slip').addEventListener('click', saveSlip);
  document.getElementById('btn-print-slip').addEventListener('click', printAndSaveSlip);
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
      descEl.textContent = 'Nhập tên hàng, số lượng và đơn giá. Thành tiền tự tính.';
    } else if (mau === 2) {
      descEl.textContent = 'Nhập tên hàng và số lượng. Nếu tên hàng có dạng 36/66, 37/150 thì size được tự tách.';
    } else if (mau === 3) {
      descEl.textContent = 'Nhập số lượng theo từng size. Tổng ngang và tổng dọc tự tính.';
    }
  }

  const ksBtn = document.getElementById('btn-add-ks-row');
  if (ksBtn) ksBtn.hidden = mau !== 3;

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
      filterSel.innerHTML = '<option value="all">Tất cả bộ phận</option>';

      data.data.forEach(bp => {
        sel.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma));
        filterSel.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma));
      });
      applyDeptFilter();

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
    dvt: AppState.defaultDvt || 'Đôi',
    loai: '',        // '' dòng thường · 'chi_tiet' dòng chi tiết · 'dong_bo' dòng ĐỒNG BỘ ĐÔI
    he_so: 0,        // số miếng / đôi của dòng chi tiết
    bo_key: '',      // khóa nhóm các dòng cùng 1 bộ
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
          <input type="text" class="size-header-input" data-size-idx="${sIdx}" value="${escapeHtml(s)}" size="${Math.max(2, String(s).length)}" title="Nhấp vào để đổi tên/số size này">
        </th>
      `;
    });
    thHtml += `
      <th class="th-total-col">Tổng</th>
    `;
    // Cột Còn lại theo đơn hàng – popick.js (nhớ lại để thân bảng / dòng cộng vẽ cùng số cột)
    AppState.clCol = !!(window.PoPick && PoPick.on());
    if (AppState.clCol) thHtml += '<th class="th-conlai-col" title="Còn lại của dòng đơn hàng (PO · ART · Màu) sau phiếu này">Còn lại</th>';
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
  // Ô PO mở danh sách PO · ART · Màu · Đợt + cột Còn lại (popick.js)
  const poPick = mau === 3 && !!AppState.clCol;
  const poAttrs = poPick ? 'class="excel-cell td-po-cell po-pick" title="Bấm hoặc gõ để chọn PO · ART · Màu"' : 'class="excel-cell td-po-cell" list="po-datalist"';
  const clCell = rIdx => (poPick ? `<td class="td-conlai" data-cl="${rIdx}"></td>` : '');

  AppState.rows.forEach((row, rIdx) => {
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = rIdx;
    if (mau === 3 && row.loai === 'chi_tiet') tr.className = 'row-chitiet';
    if (mau === 3 && row.loai === 'dong_bo') tr.className = 'row-dongbo';
    if (mau === 3 && row.loai === 'khong_size') tr.className = 'row-khongsize';

    let rowHtml = `<td class="row-head" title="Bấm để chọn cả dòng" style="text-align: center; font-weight: 600;">${rIdx + 1}${mau === 3 && row.loai === 'dong_bo'
      ? `<button type="button" class="btn-del-block" title="Xóa cả bộ chi tiết này" onclick="removeBlock('${row.bo_key}')">Xóa bộ</button>` : ''}</td>`;

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
        <td><input type="text" ${poAttrs} data-field="ma_hang" autocomplete="off" value="${escapeHtml(row.ma_hang)}"></td>
        <td><input type="text" class="excel-cell cell-center td-ma-cell" data-field="mau" list="art-datalist" autocomplete="off" value="${escapeHtml(row.mau)}"></td>
        <td><input type="text" class="excel-cell cell-center td-chitiet-cell" data-field="chi_tiet" value="${escapeHtml(row.chi_tiet || '')}"></td>
        <td><input type="text" class="excel-cell cell-center td-dvt-cell" data-field="dvt" value="${escapeHtml(row.dvt)}"></td>
      `;
      if (row.loai === 'khong_size') {
        // Dòng công cụ / dụng cụ: gộp các cột size thành 1 ô số lượng
        const n = AppState.selectedSizes.length;
        rowHtml += `<td colspan="${n}" class="td-ks"><input type="text" class="excel-cell cell-center ks-qty-cell" data-field="sl_chung_tu" data-span="${n}" placeholder="Số lượng (không theo size)" value="${formatNum(row.sl_chung_tu)}"></td>`;
        rowHtml += `
        <td><input type="text" class="excel-cell cell-center td-total-cell" data-field="ks_total" value="${formatNum(row.sl_chung_tu)}" readonly tabindex="-1" style="font-weight: 700;"></td>
        ${clCell(rIdx)}
      `;
      } else {
        AppState.selectedSizes.forEach(s => {
          const val = row.sizes[s] !== undefined ? row.sizes[s] : '';
          rowHtml += `<td><input type="text" class="excel-cell cell-center size-val-cell" data-size="${s}" value="${formatNum(val)}"></td>`;
        });
        rowHtml += `
        <td><input type="text" class="excel-cell cell-center td-total-cell" data-field="sl_chung_tu" value="${formatNum(row.sl_chung_tu)}" readonly tabindex="-1" style="font-weight: 700;"></td>
        ${clCell(rIdx)}
      `;
      }
    }

    tr.innerHTML = rowHtml;
    // Gán cột logic cho từng ô (phục vụ di chuyển, quét khối, copy/dán)
    let colIdx = 0;
    tr.querySelectorAll('.excel-cell').forEach(cell => {
      cell.dataset.col = colIdx;
      colIdx += parseInt(cell.dataset.span, 10) || 1;
    });
    tbody.appendChild(tr);

    // Cập nhật phản hồi bóc tách size cho mẫu 2
    if (mau === 2 && row.ten_hang) {
      updateSizeFeedback(rIdx);
    }
  });

  attachExcelCellEvents();
}

function addRow() {
  if (window.Grid) Grid.snapshot();
  const newRow = createEmptyRowData(AppState.rows.length + 1);
  AppState.rows.push(newRow);
  renderTableBody();
  calculateTotals();
  saveSlipDraft();
}

function deleteLastRow() {
  if (AppState.rows.length > 1) {
    if (window.Grid) Grid.snapshot();
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
    // 1. Dán (từ Excel hoặc trong bảng) & 2. Bàn phím: xử lý trong grid.js
    cell.addEventListener('paste', (e) => window.Grid ? Grid.onPaste(e) : handleCellPaste(e));
    cell.addEventListener('keydown', (e) => window.Grid ? Grid.onKeyDown(e) : handleCellKeyDown(e));

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
  if (window.Grid) Grid.beforeEdit();
  const oldVal = field ? row[field] : (sizeKey ? row.sizes[sizeKey] : undefined);

  if (field) {
    row[field] = cell.value;
  } else if (sizeKey) {
    row.sizes[sizeKey] = parseVnNumber(cell.value);
  }

  if (AppState.currentMau === 3) {
    // Đổi PO / ART trên 1 dòng của bộ -> áp cho cả bộ
    if ((field === 'ma_hang' || field === 'mau') && row.bo_key) {
      propagateBlockField(rIdx, field, oldVal);
    }
    // Chọn PO -> tự điền ART + ghép Đơn hàng
    if (field === 'ma_hang') {
      onPoChanged(rIdx);
    }
    // Nhập số lượng ở dòng chi tiết đầu tiên -> các chi tiết khác trong bộ chạy theo
    if (sizeKey && row.loai === 'chi_tiet') {
      propagateFirstDetailSize(rIdx, sizeKey, oldVal);
    }
  }

  // Tự động tính toán lại dòng
  recalcRow(rIdx);
  if (AppState.currentMau === 3 && row.loai === 'chi_tiet') recomputeDongBo(row.bo_key);
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
  } else if (mau === 3 && row.loai === 'khong_size') {
    const qty = parseVnNumber(row.sl_chung_tu);
    row.sl_thuc_xuat = qty;
    const tr = document.querySelector(`tr[data-row-index="${rIdx}"]`);
    const totalCell = tr && tr.querySelector('[data-field="ks_total"]');
    if (totalCell) totalCell.value = formatNum(qty);
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

  const hasBlocks = mau === 3 && AppState.rows.some(r => r.loai === 'dong_bo' || r.loai === 'khong_size');
  AppState.rows.forEach(r => {
    if (mau === 3 && (r.loai === 'chi_tiet' || r.loai === 'khong_size')) return; // Chi tiết (miếng) & công cụ không cộng vào tổng đôi
    totalSlCt += parseVnNumber(r.sl_chung_tu);
    totalSlTx += parseVnNumber(r.sl_thuc_xuat);
    totalThanhTien += parseVnNumber(r.thanh_tien);

    if (mau === 3 && r.sizes) {
      AppState.selectedSizes.forEach(s => {
        sizeTotals[s] += parseVnNumber(r.sizes[s]);
      });
    }
  });

  let footHtml = `<tr class="foot-total-row"><td colspan="2" style="text-align: center; font-weight: bold;">${hasBlocks ? 'CỘNG (ĐÔI):' : 'CỘNG:'}</td>`;

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
      footHtml += `<td class="foot-size-total">${formatNum(sizeTotals[s])}</td>`;
    });
    footHtml += `
      <td class="foot-grand-total">${formatNum(totalSlCt)}</td>
    `;
    if (AppState.clCol) footHtml += '<td class="foot-conlai"></td>';
  }
  footHtml += '</tr>';
  tfoot.innerHTML = footHtml;
  if (window.PoPick) PoPick.refresh(); // cột Còn lại + số gợi ý (bản mới – admin)

  // Tổng cộng hiển thị ở thanh thao tác phía dưới
  const sumEl = document.getElementById('slip-total-summary');
  if (sumEl) sumEl.textContent = formatNum(totalSlCt) || '0';
  const unitEl = document.getElementById('slip-total-unit');
  if (unitEl) unitEl.textContent = mau === 1 && totalThanhTien ? `đôi · ${formatNum(totalThanhTien)} đ` : 'đôi';
}

/* ============================================================
   8. LƯU PHIẾU VÀO DATABASE
   ============================================================ */
/**
 * Lưu phiếu.
 * opts.forPrint = true: dùng khi bấm "In phiếu" -> lưu xong KHÔNG xóa form (để in), không chuyển tab.
 * Trả về: 'saved' (đã lưu) · 'empty' (in phiếu trắng, không có dòng nào) · false (lỗi / chưa đủ thông tin)
 */
/** Đánh dấu đang lưu + nhớ khách của phiếu đang lưu (đổi khách giữa chừng không làm mất nháp khách khác) */
async function saveSlip(opts = {}) {
  if (AppState.saving) return false;
  AppState.saving = true;
  AppState.savingKh = AppState.khachHangId || null;
  try { return await saveSlipCore(opts); } finally { AppState.saving = false; }
}
/** Lưu xong: làm mới phiếu nếu vẫn đang ở khách đó, còn đã đổi khách thì chỉ xóa nháp của khách vừa lưu */
function afterSaved() {
  if (window.PoPick) PoPick.invalidate(); // số còn lại đã đổi
  if ((AppState.khachHangId || null) === AppState.savingKh) resetForm();
  else removeSlipDraft(AppState.savingKh);
}

async function saveSlipCore(opts = {}) {
  if (opts && opts.type) opts = {}; // được gọi trực tiếp từ sự kiện click
  // Lấy khách hàng làm chuẩn: phiếu mới bắt buộc có khách (chọn ở thanh bên)
  if (!AppState.khachHangId && !AppState.currentEditingId) {
    showToast('Chọn khách hàng ở thanh bên trái để lập phiếu', 'error');
    return false;
  }
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
    return false;
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
      loai: AppState.currentMau === 3 ? (r.loai || '') : '',
      he_so: r.he_so || 0,
      po_id: AppState.currentMau === 3 ? (r.po_id || null) : null, // dòng đơn đã chọn ở danh sách PO
      sizes,
      hasMismatch: r.hasMismatch,
    });
  });

  if (validLines.length === 0) {
    if (opts.forPrint) return 'empty';
    showToast('Vui lòng nhập ít nhất 1 dòng hàng hóa!', 'error');
    return false;
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
    nguoi_giao: document.getElementById('slip-nguoigiao')?.value.trim() || '',
    phong_ke_hoach: document.getElementById('slip-phongkh')?.value.trim() || '',
    // Đợt đơn hàng (chỉ bản mới của admin gửi; không gửi thì máy chủ: phiếu mới lấy đợt mới nhất, sửa phiếu giữ đợt cũ)
    dot_don: window.PoPick && PoPick.on() ? PoPick.dot() || undefined : undefined,
    dia_chi_cty: diaChiCty,
    khach_hang_id: AppState.khachHangId,
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

      if (opts.forPrint) {
        showToast(`Đã lưu phiếu ${soPhieu} vào Danh sách phiếu`, 'success');
        return 'saved';
      }

      // Xóa form và nháp
      afterSaved();

      // Nạp lại danh sách phiếu ngay lập tức
      await loadSlipList();

      // Tự động chuyển người dùng sang tab Danh Sách Phiếu để nhìn thấy ngay phiếu vừa lưu
      const listTabBtn = document.querySelector('.tab-btn[data-target="tab-list"]');
      if (listTabBtn) {
        listTabBtn.click();
      }
      return 'saved';
    } else {
      showToast(data.error || 'Lỗi khi lưu phiếu', 'error');
      if (/đã tồn tại/.test(data.error || '') && !AppState.currentEditingId) {
        await fetchNextSlipNumber();
        showToast(`Đã lấy số phiếu mới: ${document.getElementById('slip-so').value}. Bấm lưu lại.`, 'info');
      }
      return false;
    }
  } catch (err) {
    console.error('Lỗi lưu phiếu:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
    return false;
  }
}

/**
 * Bấm "In phiếu": tự lưu phiếu vào Danh sách phiếu rồi mới in.
 * - Phiếu mới -> tạo mới; phiếu đang sửa -> cập nhật (không tạo trùng)
 * - In xong: làm mới form để lập phiếu tiếp theo
 * - Phiếu chưa có dòng nào -> chỉ in mẫu trắng, không lưu
 */
let printSaving = false;
async function printAndSaveSlip() {
  if (printSaving) return;
  printSaving = true;
  const btn = document.getElementById('btn-print-slip');
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
  try {
    const result = await saveSlip({ forPrint: true });
    if (result === false) return;
    printCurrentSlip();
    if (result === 'saved') {
      afterSaved();
      loadSlipList();
    }
  } finally {
    printSaving = false;
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
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
  const nguoiGiao = document.getElementById('slip-nguoigiao')?.value || '';
  const phongKeHoach = document.getElementById('slip-phongkh')?.value || '';
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

  // Cột "Còn lại" sau cột Tổng – chỉ in khi có dòng khớp đơn hàng (popick.js)
  const clTexts = mau === 3 && window.PoPick ? PoPick.printTexts(AppState.rows, AppState.printConLai, AppState.printDot) : null;
  const clTd = txt => (clTexts ? `<td class="p-cell-conlai">${escapeHtml(txt || '')}</td>` : '');

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
    // Dãy size nằm 1 hàng riêng phía trên tiêu đề cột, in nghiêng đậm -> không nhầm với số lượng
    tableHeaderHtml = `
      <tr class="p-size-head">
        <th class="p-nb" colspan="5"></th>
        ${activeSizes.map(s => `<th class="p-cell-size p-size-row">${escapeHtml(s)}</th>`).join('')}
        <th class="p-nb"></th>${clTexts ? '<th class="p-nb"></th>' : ''}
      </tr>
      <tr>
        <th class="p-cell-stt">STT</th>
        <th class="p-cell-po">PO</th>
        <th class="p-cell-ma">Mã hàng</th>
        <th class="p-cell-chitiet">Diễn giải</th>
        <th class="p-cell-dvt">ĐVT</th>
        ${activeSizes.map(() => '<th class="p-cell-size"></th>').join('')}
        <th class="p-cell-total">Tổng</th>${clTexts ? '<th class="p-cell-conlai">Còn lại</th>' : ''}
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
  let printedNormalRows = 0;
  let printedBlocks = 0;
  // Dòng công cụ / dụng cụ (không size) được gom xuống cuối phiếu
  const ksRows = mau === 3 ? AppState.rows.filter(r => r.loai === 'khong_size' && (r.chi_tiet || r.ma_hang || parseVnNumber(r.sl_chung_tu) > 0)) : [];
  AppState.rows.forEach((r, rIdx) => {
    if (mau === 3 && r.loai === 'khong_size') return;
    const slCt = parseVnNumber(r.sl_chung_tu);
    const slTx = parseVnNumber(r.sl_thuc_xuat);
    if (!r.ten_hang && !r.ma_hang && slCt === 0 && slTx === 0) return;

    sttCount++;
    const isDetail = mau === 3 && r.loai === 'chi_tiet';
    const isDongBo = mau === 3 && r.loai === 'dong_bo';
    if (isDongBo) printedBlocks++;
    else if (!isDetail) printedNormalRows++;
    if (!isDetail) {
      totalSlCt += slCt;
      totalSlTx += slTx;
      totalThanhTien += parseVnNumber(r.thanh_tien);
    }

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
      if (!isDetail) {
        activeSizes.forEach(s => {
          sizeTotals[s] += parseVnNumber(r.sizes[s]);
        });
      }
      tableBodyHtml += `
        <tr class="${isDongBo ? 'p-dongbo-row' : ''}">
          <td class="p-cell-stt">${sttCount}</td>
          <td class="p-cell-po">${isDongBo ? '' : escapeHtml(r.ma_hang)}</td>
          <td class="p-cell-ma">${isDongBo ? '' : escapeHtml(r.mau)}</td>
          <td class="p-cell-chitiet">${escapeHtml(r.chi_tiet || '')}</td>
          <td class="p-cell-dvt">${escapeHtml(r.dvt)}</td>
          ${activeSizes.map(s => {
            const val = parseVnNumber(r.sizes[s]);
            return `<td class="p-cell-size">${val > 0 ? formatNum(val) : ''}</td>`;
          }).join('')}
          <td class="p-cell-total" style="font-weight: bold;">${formatNum(slCt)}</td>${clTd(clTexts && clTexts[rIdx])}
        </tr>
      `;
    }
  });

  if (ksRows.length) {
    const nCols = 5 + activeSizes.length + 1 + (clTexts ? 1 : 0);
    tableBodyHtml += `<tr class="p-sub-head"><td colspan="${nCols}">Công cụ, dụng cụ kèm theo</td></tr>`;
    ksRows.forEach(r => {
      sttCount++;
      tableBodyHtml += `
        <tr class="p-ks-row">
          <td class="p-cell-stt">${sttCount}</td>
          <td class="p-cell-po">${escapeHtml(r.ma_hang)}</td>
          <td class="p-cell-ma">${escapeHtml(r.mau)}</td>
          <td class="p-cell-chitiet">${escapeHtml(r.chi_tiet || '')}</td>
          <td class="p-cell-dvt">${escapeHtml(r.dvt)}</td>
          <td class="p-cell-size p-ks-span" colspan="${activeSizes.length}"></td>
          <td class="p-cell-total" style="font-weight: bold;">${formatNum(parseVnNumber(r.sl_chung_tu))}</td>${clTd('')}
        </tr>
      `;
    });
  }

  // Mật độ in: phiếu ít dòng in thoáng & chữ to, phiếu nhiều dòng tự thu nhỏ để vừa 1 trang A5
  const printedRowCount = sttCount + (ksRows.length ? 1 : 0);
  let densityLevel = printedRowCount <= 12 ? 1 : (printedRowCount <= 20 ? 2 : 3);
  // Nhiều cột size thì bảng rộng hơn -> thu nhỏ thêm 1 bậc để không tràn khổ A5
  if (mau === 3 && activeSizes.length > 12) densityLevel = 3;
  else if (mau === 3 && activeSizes.length > 9) densityLevel = Math.min(3, densityLevel + 1);
  const densityClass = `density-${densityLevel}`;

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
  } else if (mau === 3 && !(printedBlocks === 1 && printedNormalRows === 0)) {
    // Phiếu chỉ có 1 bộ chi tiết thì dòng ĐỒNG BỘ ĐÔI đã là dòng tổng -> không in thêm dòng CỘNG
    tableFootHtml = `
      <tr class="p-total-row">
        <td colspan="5" class="text-center nowrap">${printedBlocks > 0 || ksRows.length ? 'CỘNG (ĐÔI):' : 'CỘNG:'}</td>
        ${activeSizes.map(s => {
          const val = sizeTotals[s];
          return `<td class="p-cell-size">${val > 0 ? formatNum(val) : ''}</td>`;
        }).join('')}
        <td class="p-cell-total" style="font-weight: bold;">${formatNum(totalSlCt)}</td>${clTd('')}
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
    <div class="print-page ${densityClass}">
      <div class="p-header">
        ${companyHeaderHtml}
      </div>

      <div class="p-title-box">
        <div class="p-title">PHIẾU XUẤT KHO</div>
        <div class="p-sub-info">
          <div class="p-date">${dateText}</div>
          <div class="p-slip-no">Số: ${escapeHtml(soPhieu)}</div>
        </div>
      </div>

      <div class="p-meta">
        <div><strong>Đơn vị nhận:</strong> ${escapeHtml(donViNhan) || '................................................................'}</div>
        <div><strong>Bộ phận xuất kho:</strong> ${escapeHtml(boPhanXuat) || '................................................................'}</div>
        <div><strong>Đơn hàng:</strong> ${escapeHtml(donHang) || '................................................................'}</div>
        <div><strong>Lý do xuất:</strong> ${escapeHtml(lyDoXuat) || '................................................................'}</div>
      </div>

      <table class="p-table">
        <thead>${tableHeaderHtml}</thead>
        <tbody>${tableBodyHtml}</tbody>
        <tfoot>${tableFootHtml}</tfoot>
      </table>

      <div class="p-signatures">
        <div class="p-sig-col">
          <div class="p-sig-title">Người lập phiếu</div><div class="p-sig-note">(Ký, họ tên)</div>
          <div class="p-sig-name">${escapeHtml(nguoiLap)}</div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Người giao</div><div class="p-sig-note">(Ký, họ tên)</div>
          <div class="p-sig-name">${escapeHtml(nguoiGiao)}</div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Người nhận</div><div class="p-sig-note">(Ký, họ tên)</div>
          <div class="p-sig-name"></div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Phòng kế hoạch</div><div class="p-sig-note">(Ký, họ tên)</div>
          <div class="p-sig-name">${escapeHtml(phongKeHoach)}</div>
        </div>
        <div class="p-sig-col">
          <div class="p-sig-title">Giám đốc</div><div class="p-sig-note">(Ký, họ tên)</div>
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
  const khach = window.KH && window.KH.id !== '' ? window.KH.id : 'all'; // thanh bên: số id | 'none' (chưa gán)
  const search = document.getElementById('filter-search').value.trim();

  // "Chưa gán khách hàng": hiện mọi phiếu chưa gán (không lọc ngày) để gán hết phiếu cũ
  let query = khach === 'none' ? '?all=1' : `?tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
  if (boPhan) query += `&bo_phan=${boPhan}`;
  if (khach && khach !== 'all') query += `&khach_hang_id=${khach}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await fetch(`/api/phieu${query}`);
    const data = await res.json();
    if (data.success) {
      renderSlipListTable(data.data);
      if (khach === 'none' && window.KH) window.KH.refreshCount();
    }
  } catch (err) {
    console.error('Lỗi tải danh sách phiếu:', err);
  }
}

/** Gán khách hàng cho phiếu cũ chưa gán (hộp chọn khách) */
window.assignSlipCustomer = function(id) {
  const s = (AppState.slipList || []).find(x => x.id === id);
  if (!s || !window.Catalog) return;
  document.getElementById('kh-assign')?.remove();
  const box = document.createElement('div');
  box.id = 'kh-assign';
  box.className = 'kh-assign ui-scope';
  box.innerHTML = `<div class="kh-assign-card" role="dialog" aria-modal="true" aria-label="Gán khách hàng">
      <h3>Gán khách hàng cho phiếu ${escapeHtml(s.so_phieu)}</h3>
      <p>Ngày ${formatDateVn(s.ngay)} · Đơn vị nhận: <b>${escapeHtml(s.don_vi_nhan || '(trống)')}</b>${s.don_hang ? ` · ĐH ${escapeHtml(s.don_hang)}` : ''}</p>
      <div class="kh-assign-list">${window.Catalog.khach.map(k => `<button type="button" class="kh-assign-btn" data-kh="${k.id}">
        <b>${escapeHtml(k.ten_ngan)}</b><small>${escapeHtml(k.ten_day_du || '')}</small></button>`).join('')}</div>
      <div class="kh-assign-foot"><button type="button" class="ui-btn ui-btn-ghost" data-close>Đóng</button></div>
    </div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', async e => {
    if (e.target === box || e.target.closest('[data-close]')) { close(); return; }
    const b = e.target.closest('[data-kh]');
    if (!b || b.disabled) return;
    box.querySelectorAll('[data-kh]').forEach(x => { x.disabled = true; });
    try {
      const res = await fetch(`/api/phieu/${id}/khachhang`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ khach_hang_id: parseInt(b.dataset.kh, 10) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Lỗi máy chủ');
      showToast(data.message || 'Đã gán khách hàng', 'success');
      close();
      loadSlipList();
      if (window.KH) window.KH.refreshCount();
    } catch (err) {
      showToast('Không gán được: ' + err.message, 'error');
      box.querySelectorAll('[data-kh]').forEach(x => { x.disabled = false; });
    }
  });
  box.querySelector('[data-kh]')?.focus();
};

function formatDateVn(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function renderSlipListTable(slips) {
  AppState.slipList = slips || [];
  const tbody = document.getElementById('slip-list-tbody');
  const summary = document.getElementById('slip-list-summary');

  const active = (slips || []).filter(s => s.trang_thai !== 'cancelled');
  if (summary) {
    const totalPairs = active.reduce((a, s) => a + (parseFloat(s.tong_sl_chung_tu) || 0), 0);
    const cancelled = (slips || []).length - active.length;
    summary.innerHTML = (slips || []).length
      ? `<span><strong>${active.length}</strong> phiếu</span>
         <span><strong>${formatNum(totalPairs) || 0}</strong> đôi</span>
         ${cancelled ? `<span class="ui-summary-muted">${cancelled} phiếu đã hủy (không tính)</span>` : ''}
         ${window.KH && window.KH.id === 'none' ? '<span class="ui-summary-muted">Phiếu chưa gán khách hàng · không lọc theo ngày</span>' : ''}`
      : '';
  }

  if (!slips || slips.length === 0) {
    tbody.innerHTML = window.KH && window.KH.id === 'none'
      ? '<tr><td colspan="9" class="ui-empty">Không còn phiếu nào chưa gán khách hàng.</td></tr>'
      : `<tr><td colspan="9" class="ui-empty">Không có phiếu nào trong khoảng thời gian này. Thử đổi ngày hoặc bỏ bớt điều kiện lọc.${window.KH ? window.KH.emptyNote() : ''}</td></tr>`;
    return;
  }

  const mauText = m => (m === 1 ? 'Có đơn giá' : (m === 2 ? 'Không đơn giá' : 'Theo size'));

  tbody.innerHTML = slips.map((s, idx) => {
    const cancelled = s.trang_thai === 'cancelled';
    const status = cancelled
      ? '<span class="ui-badge ui-badge-off">Đã hủy</span>'
      : '<span class="ui-badge ui-badge-ok">Đã lưu</span>';
    const warn = s.canh_bao_lech_size === 1
      ? '<span class="ui-badge ui-badge-warn" title="Tổng size bóc tách lệch so với SL chứng từ">Lệch size</span>'
      : '';
    const khach = s.ten_khach_hang || s.don_vi_nhan || '';

    return `
      <tr class="${cancelled ? 'is-cancelled' : ''}">
        <td class="c ui-muted">${idx + 1}</td>
        <td><span class="ui-slip-no">${escapeHtml(s.so_phieu)}</span> ${warn}</td>
        <td class="nowrap">${formatDateVn(s.ngay)}</td>
        <td>${escapeHtml(khach)}${s.khach_hang_id ? '' : ' <span class="ui-badge ui-badge-warn">chưa gán khách</span>'}${s.don_hang ? `<div class="ui-sub">ĐH ${escapeHtml(s.don_hang)}</div>` : ''}</td>
        <td class="c"><span class="ui-tag">${escapeHtml(s.ma_bo_phan)}</span></td>
        <td>${mauText(s.mau_phieu)}</td>
        <td class="r ui-num-strong">${formatNum(s.tong_sl_chung_tu) || 0}</td>
        <td class="c">${status}</td>
        <td class="r nowrap">
          ${s.khach_hang_id ? '' : `<button type="button" class="ui-btn-sm ui-btn-sm-primary" onclick="assignSlipCustomer(${s.id})">Gán khách</button>`}
          <button type="button" class="ui-btn-sm ui-btn-sm-primary" onclick="reprintSlip(${s.id})">In lại</button>
          ${cancelled ? '' : `<button type="button" class="ui-btn-sm" onclick="editSlip(${s.id})">Sửa</button>`}
          ${!cancelled ? `<button type="button" class="ui-btn-sm ui-btn-sm-danger" onclick="cancelSlip(${s.id})">Hủy</button>` : ''}
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
    // Cột Còn lại của phiếu in lại = còn lại hiện tại theo đơn hàng của khách trên phiếu
    const conLai = window.PoPick && PoPick.allowed() && slip.mau_phieu === 3 && slip.khach_hang_id
      ? await PoPick.fetch(slip.khach_hang_id, slip.id).catch(() => null) : null;

    // Lưu tạm state để tái sử dụng hàm in (kể cả các ô đầu phiếu đang nhập)
    const HEAD_IDS = ['slip-so', 'slip-date', 'slip-donvi', 'slip-lydo', 'slip-donhang', 'slip-bophanxuat', 'slip-nguoilap', 'slip-nguoigiao', 'slip-phongkh', 'slip-diachi-cty'];
    const prevHead = HEAD_IDS.map(i => [i, document.getElementById(i)?.value]);
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
        loai: l.loai || '',
        he_so: l.he_so || 0,
        po_id: l.po_id || null,
        sizes: sizesMap,
      };
    });
    assignBlockKeys(AppState.rows);

    document.getElementById('slip-so').value = slip.so_phieu;
    document.getElementById('slip-date').value = slip.ngay;
    document.getElementById('slip-donvi').value = slip.don_vi_nhan || '';
    document.getElementById('slip-lydo').value = slip.ly_do_xuat || '';
    if (document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = slip.don_hang || '';
    if (document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = slip.bo_phan_xuat || '';
    document.getElementById('slip-nguoilap').value = slip.nguoi_lap || '';
    if (document.getElementById('slip-nguoigiao')) document.getElementById('slip-nguoigiao').value = slip.nguoi_giao || '';
    if (document.getElementById('slip-phongkh')) document.getElementById('slip-phongkh').value = slip.phong_ke_hoach || '';
    const diachiInput = document.getElementById('slip-diachi-cty');
    if (diachiInput) diachiInput.value = slip.dia_chi_cty || DEFAULT_COMPANY_ADDRESS;

    AppState.printConLai = conLai;
    AppState.printDot = slip.dot_don || 1; // phiếu cũ chưa ghi đợt = đợt 1
    try { printCurrentSlip(); } finally { delete AppState.printConLai; delete AppState.printDot; }

    // Khôi phục state
    prevHead.forEach(([i, v]) => { const el = document.getElementById(i); if (el && v !== undefined) el.value = v; });
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
    // Thanh bên chuyển theo khách của phiếu (phiếu chưa gán khách: Tất cả / giữ Chưa gán)
    if (window.KH) {
      const target = slip.khach_hang_id || (typeof window.KH.id === 'number' ? '' : window.KH.id);
      if (!AppState.currentEditingId) saveSlipDraft(); // cất phiếu đang nhập dở trước khi mở phiếu cũ
      AppState.syncingKh = true;
      const ok = window.KH.set(target);
      AppState.syncingKh = false;
      if (!ok) return;
    }
    AppState.currentEditingId = slip.id;
    AppState.dotDon = slip.dot_don || 1; // phiếu cũ chưa ghi đợt = đợt 1
    if (window.Grid) { Grid.resetHistory(); Grid.clearSelection(); }

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
        // Nếu dãy size của khách hàng chứa đủ các size của phiếu -> dùng nguyên dãy (đúng thứ tự)
        const kh = window.Catalog?.byId(slip.khach_hang_id);
        const dIdx = (kh?.day_size || []).findIndex(d => slipSizes.every(s => d.sizes.includes(s)));
        if (dIdx > -1) {
          AppState.selectedSizes = [...kh.day_size[dIdx].sizes];
          AppState.dayIdx = dIdx;
        }
        updateCustomSizeInputText();
      }
    }

    // Phiếu có dòng chi tiết / đồng bộ -> kiểu "theo chi tiết", ngược lại "theo đôi"
    AppState.kieuXuat = slip.lines.some(l => l.loai === 'chi_tiet' || l.loai === 'dong_bo') ? 'chi_tiet' : 'doi';
    selectCustomer(slip.khach_hang_id || null, { fromLoad: true });
    switchMau(slip.mau_phieu);
    setDeptValue(slip.ma_bo_phan);
    document.getElementById('slip-so').value = slip.so_phieu;
    document.getElementById('slip-date').value = slip.ngay;
    document.getElementById('slip-donvi').value = slip.don_vi_nhan || '';
    document.getElementById('slip-lydo').value = slip.ly_do_xuat || '';
    if (document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = slip.don_hang || '';
    if (document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = slip.bo_phan_xuat || '';
    document.getElementById('slip-nguoilap').value = slip.nguoi_lap || '';
    if (document.getElementById('slip-nguoigiao')) document.getElementById('slip-nguoigiao').value = slip.nguoi_giao || '';
    if (document.getElementById('slip-phongkh')) document.getElementById('slip-phongkh').value = slip.phong_ke_hoach || '';
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
        loai: l.loai || '',
        he_so: l.he_so || 0,
        po_id: l.po_id || null,
        sizes: sizesMap,
      };
    });
    assignBlockKeys(AppState.rows);

    if (slip.mau_phieu !== 3) AppState.rows.forEach((_, i) => parseSizesFromText(i));
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

/**
 * Làm mới phiếu (nút "Làm mới phiếu" / sau khi lưu)
 * - Đang sửa phiếu cũ -> thoát sửa, mở lại nháp phiếu mới của khách đó (nếu có)
 * - Phiếu mới -> xóa nháp của khách đang chọn
 */
function resetForm() {
  const kh = AppState.khachHangId || null;
  const wasEditing = !!AppState.currentEditingId;
  AppState.currentEditingId = null;
  if (!wasEditing) removeSlipDraft(kh);
  if (!wasEditing || !restoreSlipDraft(kh)) blankSlip(kh);
  fetchNextSlipNumber();
}

/** Xóa các ô thông tin phiếu (không đụng nháp) */
function clearSlipFields() {
  document.getElementById('slip-donvi').value = '';
  document.getElementById('slip-lydo').value = '';
  if (document.getElementById('slip-donhang')) document.getElementById('slip-donhang').value = '';
  if (document.getElementById('slip-bophanxuat')) document.getElementById('slip-bophanxuat').value = '';
  const diachiInput = document.getElementById('slip-diachi-cty');
  if (diachiInput) diachiInput.value = DEFAULT_COMPANY_ADDRESS;
  AppState.lastAutoDonHang = '';
  AppState.dotDon = null;
  if (window.Grid) { Grid.resetHistory(); Grid.clearSelection(); }
}

/** Phiếu trống cho khách khId (null = phiếu nhập tay, không gán khách) */
function blankSlip(khId) {
  AppState.currentEditingId = null;
  clearSlipFields();
  initDefaultRows();
  if (khId && currentCustomerById(khId)) {
    selectCustomer(khId, { quiet: true }); // nạp thông tin mặc định của khách
  } else {
    selectCustomer(null, { fromLoad: true });
    switchMau(2);
  }
}

/** Thanh bên đổi khách: cất nháp khách cũ, mở nháp khách mới (chưa có thì phiếu trống theo mặc định khách) */
function switchSlipCustomer(khId, carry) {
  khId = khId || null;
  if (khId === (AppState.khachHangId || null)) return;
  if (carry && !AppState.currentEditingId) {
    // Vừa thêm khách mới từ nút "+ Khách hàng mới": giữ nguyên phiếu đang nhập, gán cho khách mới
    removeSlipDraft(AppState.khachHangId);
    selectCustomer(khId);
    return;
  }
  if (AppState.currentEditingId) AppState.currentEditingId = null; // bỏ sửa phiếu cũ (phiếu đã lưu không đổi)
  else saveSlipDraft();
  if (!restoreSlipDraft(khId)) blankSlip(khId);
  fetchNextSlipNumber();
}

/* ============================================================
   11. KHÁCH HÀNG · DÃY SIZE · BỘ PHẬN
   ============================================================ */
function currentCustomer() {
  return AppState.khachHangId && window.Catalog ? window.Catalog.byId(AppState.khachHangId) : null;
}
function currentCustomerById(id) {
  return id && window.Catalog ? window.Catalog.byId(id) : null;
}

/** Bước 1: khách hàng đi theo thanh bên trái (đổi khách ở đó) */
function renderCustomerPills() {
  const box = document.getElementById('kh-pills');
  if (!box || !window.Catalog) return;
  const kh = currentCustomer();
  // Chưa chọn khách (đang xem Tất cả) -> khóa lập phiếu mới; sửa phiếu cũ chưa gán khách vẫn được
  const needKh = !kh && !AppState.currentEditingId;
  document.getElementById('tab-create')?.classList.toggle('pxk-need-kh', needKh);
  box.innerHTML = (kh
    ? `<div class="pxk-kh-pill active pxk-kh-current">
        <span class="kh-name">${escapeHtml(kh.ten_ngan)}</span>
        <span class="kh-sub">${escapeHtml(kh.ten_day_du || '')}</span>
      </div>`
    : needKh
      ? `<div class="pxk-kh-warn"><b>Chọn khách hàng ở thanh bên trái để lập phiếu.</b> Khách chưa có trong danh sách thì bấm <b>+ Khách hàng mới</b>.</div>`
      : `<div class="pxk-kh-warn">Phiếu này chưa gán khách hàng nên <b>không được tính</b> vào Xuất theo đơn hàng. Gán khách ở tab Danh sách phiếu (nút <b>Gán khách</b>).</div>`)
    + `<button type="button" class="pxk-kh-pill pxk-kh-none" data-new-kh="1">
      <span class="kh-name">+ Khách hàng mới</span>
      <span class="kh-sub">Thêm vào danh mục rồi quay lại</span>
    </button>`;
  box.querySelector('[data-new-kh]')?.addEventListener('click', () => {
    if (window.openNewCustomerForm) window.openNewCustomerForm({ returnToCreate: true });
  });
}

function renderDayPills() {
  const box = document.getElementById('kh-day-pills');
  if (!box) return;
  const kh = currentCustomer();
  const days = kh?.day_size || [];
  if (days.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="pxk-day-lbl">Chọn dãy size</span>` + days.map((d, i) => `
    <button type="button" class="pxk-day-pill ${i === AppState.dayIdx ? 'active' : ''}" data-day="${i}" title="${escapeHtml(d.sizes.join(', '))}">${escapeHtml(d.ten)}</button>
  `).join('');
  box.querySelectorAll('[data-day]').forEach(btn => btn.addEventListener('click', () => applyDay(parseInt(btn.dataset.day, 10))));
}

function applyDay(idx) {
  const kh = currentCustomer();
  const d = kh?.day_size?.[idx];
  if (!d) return;
  AppState.dayIdx = idx;
  AppState.selectedSizes = [...d.sizes];
  updateCustomSizeInputText();
  renderDayPills();
  if (AppState.currentMau === 3) renderTableStructure();
  saveSlipDraft();
}

/** Lọc ô Bộ phận / Chuyền theo khách hàng (giữ giá trị hiện tại nếu hợp lệ) */
function applyDeptFilter() {
  const sel = document.getElementById('slip-bophan');
  if (!sel || !AppState.departments.length) return;
  const kh = currentCustomer();
  const allowed = kh?.bo_phan?.length ? kh.bo_phan : AppState.departments.map(d => d.ma);
  const prev = sel.value;
  sel.innerHTML = '';
  AppState.departments.filter(d => allowed.includes(d.ma)).forEach(bp => sel.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma)));
  if (!sel.options.length) AppState.departments.forEach(bp => sel.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma)));
  if (Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  if (sel.value !== prev) fetchNextSlipNumber();
}

/** Đặt giá trị bộ phận (thêm tạm option nếu bộ lọc khách hàng không có) */
function setDeptValue(ma) {
  const sel = document.getElementById('slip-bophan');
  if (!sel || !ma) return;
  if (!Array.from(sel.options).some(o => o.value === ma)) {
    const bp = AppState.departments.find(d => d.ma === ma);
    sel.add(new Option(bp ? `${bp.ma} - ${bp.ten}` : ma, ma));
  }
  sel.value = ma;
}

/**
 * Chọn khách hàng
 * - fromLoad = true: chỉ đồng bộ giao diện (khi nạp nháp / sửa phiếu cũ), không ghi đè dữ liệu
 * - quiet = true: không hiện thông báo (đổi khách từ thanh bên)
 */
function selectCustomer(id, opts = {}) {
  AppState.khachHangId = id || null;
  const kh = currentCustomer();
  if (!opts.fromLoad) AppState.kieuXuat = 'chi_tiet';
  AppState.defaultDvt = kieuDvt(kh);

  renderCustomerPills();
  applyDeptFilter();
  refreshPoDatalist();

  if (!opts.fromLoad) AppState.dotDon = null; // đổi khách: đợt mới nhất của khách mới
  if (!opts.fromLoad && kh) {
    document.getElementById('slip-donvi').value = kh.ten_day_du || '';
    document.getElementById('slip-lydo').value = kh.ly_do_xuat || '';
    const bpx = document.getElementById('slip-bophanxuat');
    if (bpx) bpx.value = kh.bo_phan_xuat || '';

    // Dòng trống lấy ĐVT mặc định của khách
    AppState.rows.forEach(r => { if (!r.loai && isRowEmpty(r)) r.dvt = AppState.defaultDvt; });

    AppState.dayIdx = 0;
    if (kh.day_size?.length) {
      AppState.selectedSizes = [...kh.day_size[0].sizes];
      updateCustomSizeInputText();
    }
    switchMau(3);
    if (!opts.quiet) showToast(`Đã chọn khách hàng ${kh.ten_ngan}`, 'info');
  }

  renderDayPills();
  renderBoPanel();
  if (!opts.fromLoad) saveSlipDraft();
}

function isRowEmpty(r) {
  const hasSize = r.sizes && Object.values(r.sizes).some(v => parseVnNumber(v) > 0);
  return !r.ten_hang && !r.ma_hang && !r.mau && !r.chi_tiet && !parseVnNumber(r.sl_chung_tu) && !hasSize;
}

/* ============================================================
   12. BỘ CHI TIẾT & DÒNG ĐỒNG BỘ ĐÔI (JIAYU)
   ============================================================ */
/** ĐVT mặc định cho dòng mới: khách có bộ chi tiết xuất theo đôi -> Đôi, còn lại theo khách */
function kieuDvt(kh) {
  return kh?.co_bo_chi_tiet && AppState.kieuXuat === 'doi' ? 'Đôi' : (kh?.dvt || 'Đôi');
}

/** Khách có bộ chi tiết: chọn xuất theo đôi hay theo chi tiết (miếng) + dòng đồng bộ đôi */
function setKieuXuat(kieu) {
  if (kieu === AppState.kieuXuat) return;
  const blocks = [...new Set(AppState.rows.filter(r => r.bo_key && (r.loai === 'chi_tiet' || r.loai === 'dong_bo')).map(r => r.bo_key))];
  if (kieu === 'doi' && blocks.length) {
    if (!confirm(`Phiếu đang có ${blocks.length} bộ chi tiết. Chuyển sang xuất theo đôi sẽ bỏ các dòng chi tiết đó. Tiếp tục?`)) return;
    if (window.Grid) Grid.snapshot();
    AppState.rows = AppState.rows.filter(r => !blocks.includes(r.bo_key));
    if (!AppState.rows.length) AppState.rows.push(createEmptyRowData(1));
  }
  AppState.kieuXuat = kieu;
  AppState.defaultDvt = kieuDvt(currentCustomer());
  AppState.rows.forEach(r => { if (!r.loai && isRowEmpty(r)) r.dvt = AppState.defaultDvt; });
  if (AppState.currentMau !== 3) switchMau(3); else renderTableBody();
  calculateTotals();
  renderBoPanel();
  saveSlipDraft();
  showToast(kieu === 'doi' ? 'Xuất theo đôi: mỗi dòng nhập số đôi' : 'Xuất theo chi tiết: bấm một bộ để thêm các dòng chi tiết (miếng) và dòng đồng bộ đôi', 'info');
}

function renderBoPanel() {
  const panel = document.getElementById('kh-bo-panel');
  const list = document.getElementById('kh-bo-list');
  if (!panel || !list) return;
  const kh = currentCustomer();
  if (!kh || !kh.co_bo_chi_tiet) { panel.classList.remove('show'); return; }
  panel.classList.add('show');
  // Nút chọn kiểu xuất (tạo 1 lần, đặt đầu khung)
  let seg = document.getElementById('kh-kieu-xuat');
  if (!seg) {
    seg = document.createElement('div');
    seg.id = 'kh-kieu-xuat';
    seg.className = 'pxk-kieu';
    panel.insertBefore(seg, panel.firstChild);
    seg.addEventListener('click', e => { const b = e.target.closest('[data-kieu]'); if (b) setKieuXuat(b.dataset.kieu); });
  }
  const doi = AppState.kieuXuat === 'doi';
  seg.innerHTML = `<span class="pxk-kieu-lbl">Xuất theo</span>
    <button type="button" class="pxk-day-pill ${doi ? 'active' : ''}" data-kieu="doi">Đôi</button>
    <button type="button" class="pxk-day-pill ${doi ? '' : 'active'}" data-kieu="chi_tiet">Chi tiết (miếng) + đồng bộ đôi</button>`;
  const text = panel.querySelector('.ui-bo-text');
  if (text) text.innerHTML = doi
    ? '<strong>Xuất theo đôi</strong><span>Mỗi dòng nhập PO · ART và số đôi từng size (ĐVT Đôi), không tách chi tiết.</span>'
    : '<strong>Thêm bộ chi tiết</strong><span>Bấm một bộ để thêm các dòng chi tiết (miếng) và dòng đồng bộ đôi. Nhập số ở dòng đầu, các dòng còn lại tự chạy theo.</span>';
  list.hidden = doi;
  if (doi) return;
  const sets = window.Catalog.boOf(kh.id);
  list.innerHTML = sets.length
    ? sets.map(b => `<button type="button" class="pxk-bo-btn" data-bo="${b.id}" title="${escapeHtml((b.chi_tiet || []).map(c => c.ten).join(', '))}">+ ${escapeHtml(b.ten_bo)} <small>${(b.chi_tiet || []).length} chi tiết</small></button>`).join('')
    : `<span class="pxk-bo-empty">Chưa có bộ chi tiết nào. Thêm ở tab Danh mục, mục Bộ chi tiết.</span>`;
  list.querySelectorAll('[data-bo]').forEach(btn => btn.addEventListener('click', () => insertBoBlock(parseInt(btn.dataset.bo, 10))));
}

function insertBoBlock(boId) {
  const bo = window.Catalog.bo.find(b => b.id === boId);
  if (!bo) return;
  if (window.Grid) Grid.snapshot();
  if (AppState.currentMau !== 3) switchMau(3);

  // Bỏ các dòng trống ở cuối bảng rồi nối bộ mới vào
  while (AppState.rows.length && !AppState.rows[AppState.rows.length - 1].loai && isRowEmpty(AppState.rows[AppState.rows.length - 1])) {
    AppState.rows.pop();
  }
  const key = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const startIdx = AppState.rows.length;
  // PO lấy theo bộ trước đó (nếu có) để nhập nhanh nhiều bộ cùng PO
  const prevPo = [...AppState.rows].reverse().find(r => r.loai && r.ma_hang)?.ma_hang || '';

  (bo.chi_tiet || []).forEach(ct => {
    AppState.rows.push({
      ...createEmptyRowData(AppState.rows.length + 1),
      ma_hang: prevPo, mau: bo.art || '', chi_tiet: ct.ten, dvt: ct.dvt || 'Miếng',
      loai: 'chi_tiet', he_so: ct.he_so || 2, bo_key: key,
    });
  });
  AppState.rows.push({
    ...createEmptyRowData(AppState.rows.length + 1),
    ma_hang: prevPo, mau: bo.art || '', chi_tiet: 'ĐỒNG BỘ ĐÔI', dvt: 'Đôi',
    loai: 'dong_bo', bo_key: key,
  });

  renderTableBody();
  calculateTotals();
  updateDonHangAuto();
  saveSlipDraft();
  showToast(`Đã thêm bộ ${bo.ten_bo} (${(bo.chi_tiet || []).length} chi tiết + dòng đồng bộ đôi)`, 'success');

  // Đưa con trỏ vào ô PO (nếu trống) hoặc ô size đầu tiên của bộ vừa thêm
  setTimeout(() => {
    const tr = document.querySelector(`tr[data-row-index="${startIdx}"]`);
    if (!tr) return;
    const target = prevPo ? tr.querySelector('.size-val-cell') : tr.querySelector('[data-field="ma_hang"]');
    if (target) { target.focus(); tr.scrollIntoView({ block: 'nearest' }); }
  }, 30);
}

window.removeBlock = function(key) {
  if (!key) return;
  if (window.Grid) Grid.snapshot();
  AppState.rows = AppState.rows.filter(r => r.bo_key !== key);
  if (!AppState.rows.length) AppState.rows.push(createEmptyRowData(1));
  renderTableBody();
  calculateTotals();
  updateDonHangAuto();
  saveSlipDraft();
};

/** Gán bo_key cho các dòng nạp từ phiếu cũ: chuỗi dòng chi tiết liên tiếp + dòng đồng bộ ngay sau */
function assignBlockKeys(rows) {
  let key = '';
  let n = 0;
  rows.forEach(r => {
    if (r.loai === 'chi_tiet') {
      if (!key) key = `L${++n}`;
      r.bo_key = r.bo_key || key;
    } else if (r.loai === 'dong_bo') {
      r.bo_key = r.bo_key || key || `L${++n}`;
      key = '';
    } else {
      key = '';
    }
  });
}

function blockRows(key) {
  return AppState.rows.map((r, i) => ({ r, i })).filter(x => x.r.bo_key === key);
}

/** Tính dòng ĐỒNG BỘ ĐÔI = min(số miếng từng chi tiết ÷ số miếng/đôi) theo từng size */
function recomputeDongBo(key) {
  const members = blockRows(key);
  const details = members.filter(x => x.r.loai === 'chi_tiet');
  members.filter(x => x.r.loai === 'dong_bo').forEach(({ r: db, i: dbIdx }) => {
    let total = 0;
    AppState.selectedSizes.forEach(s => {
      const anyQty = details.some(x => parseVnNumber(x.r.sizes[s]) > 0);
      let pairs = 0;
      if (anyQty && details.length) {
        pairs = Math.floor(Math.min(...details.map(x => parseVnNumber(x.r.sizes[s]) / (parseFloat(x.r.he_so) || 2))));
      }
      db.sizes[s] = pairs > 0 ? pairs : '';
      total += pairs > 0 ? pairs : 0;
      const cell = document.querySelector(`tr[data-row-index="${dbIdx}"] .size-val-cell[data-size="${CSS.escape(s)}"]`);
      if (cell && document.activeElement !== cell) cell.value = formatNum(db.sizes[s]);
    });
    db.sl_chung_tu = total;
    db.sl_thuc_xuat = total;
    const sumCell = document.querySelector(`tr[data-row-index="${dbIdx}"] [data-field="sl_chung_tu"]`);
    if (sumCell) sumCell.value = formatNum(total);
  });
}

/** Ô size ở dòng chi tiết ĐẦU TIÊN của bộ: các dòng chi tiết khác đang trống / đang giống giá trị cũ sẽ chạy theo */
function propagateFirstDetailSize(rIdx, sizeKey, oldVal) {
  const row = AppState.rows[rIdx];
  const details = blockRows(row.bo_key).filter(x => x.r.loai === 'chi_tiet');
  if (!details.length || details[0].i !== rIdx) return;
  const oldNum = parseVnNumber(oldVal);
  details.slice(1).forEach(({ r, i }) => {
    const cur = parseVnNumber(r.sizes[sizeKey]);
    if (cur === 0 || cur === oldNum) {
      r.sizes[sizeKey] = row.sizes[sizeKey];
      const cell = document.querySelector(`tr[data-row-index="${i}"] .size-val-cell[data-size="${CSS.escape(sizeKey)}"]`);
      if (cell) cell.value = formatNum(r.sizes[sizeKey]);
      recalcRow(i);
    }
  });
}

/** Sửa PO / ART trên 1 dòng của bộ -> các dòng khác trong bộ (đang trống hoặc giống giá trị cũ) cập nhật theo */
function propagateBlockField(rIdx, field, oldVal) {
  const row = AppState.rows[rIdx];
  blockRows(row.bo_key).forEach(({ r, i }) => {
    if (i === rIdx) return;
    if (!r[field] || r[field] === oldVal) {
      r[field] = row[field];
      const cell = document.querySelector(`tr[data-row-index="${i}"] [data-field="${field}"]`);
      if (cell) cell.value = r[field];
    }
  });
}

/* ============================================================
   13. GỢI Ý PO -> ART -> ĐƠN HÀNG (đọc từ danh mục, vẫn sửa tay được)
   ============================================================ */
function poEntries() {
  return window.Catalog ? window.Catalog.poOf(AppState.khachHangId) : [];
}

function refreshPoDatalist() {
  const dl = document.getElementById('po-datalist');
  if (!dl) return;
  const seen = new Set();
  dl.innerHTML = poEntries().filter(p => p.po).filter(p => {
    const k = `${p.po}__${p.art}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(p => `<option value="${escapeHtml(p.po)}" label="${escapeHtml([p.art && `ART ${p.art}`, p.don_hang && `ĐH ${p.don_hang}`, p.mau].filter(Boolean).join(' · '))}"></option>`).join('');
}

function refreshArtDatalist(po) {
  const dl = document.getElementById('art-datalist');
  if (!dl) return;
  const list = poEntries().filter(p => p.art && (!po || p.po === po));
  const arts = [...new Set((list.length ? list : poEntries().filter(p => p.art)).map(p => p.art))];
  dl.innerHTML = arts.map(a => `<option value="${escapeHtml(a)}"></option>`).join('');
}

function onPoChanged(rIdx) {
  const row = AppState.rows[rIdx];
  const matches = poEntries().filter(p => p.po && p.po === String(row.ma_hang).trim());
  if (matches.length) {
    const art = matches[0].art || '';
    if (art && (!row.mau || row.mau === row._autoArt || !matches.some(m => m.art === row.mau))) {
      const old = row.mau;
      row.mau = art;
      row._autoArt = art;
      const cell = document.querySelector(`tr[data-row-index="${rIdx}"] [data-field="mau"]`);
      if (cell) cell.value = art;
      if (row.bo_key) propagateBlockField(rIdx, 'mau', old);
    }
  }
  updateDonHangAuto();
}

/** Ghép các "Đơn hàng" của những PO đang có trong phiếu vào ô Đơn hàng (nếu người dùng chưa sửa tay) */
function updateDonHangAuto() {
  const el = document.getElementById('slip-donhang');
  if (!el) return;
  const entries = poEntries();
  const dhs = [];
  AppState.rows.forEach(r => {
    const po = String(r.ma_hang || '').trim();
    if (!po) return;
    entries.filter(p => p.po === po && p.don_hang).forEach(p => { if (!dhs.includes(p.don_hang)) dhs.push(p.don_hang); });
  });
  const joined = dhs.join(', ');
  if (!el.value || el.value === AppState.lastAutoDonHang) {
    el.value = joined;
    AppState.lastAutoDonHang = joined;
  }
}

// Ô ART: khi focus thì gợi ý ART theo PO của dòng
document.addEventListener('focusin', (e) => {
  const cell = e.target;
  if (cell.matches && cell.matches('#excel-grid [data-field="mau"]')) {
    const tr = cell.closest('tr');
    const row = AppState.rows[parseInt(tr.dataset.rowIndex, 10)];
    refreshArtDatalist(row ? String(row.ma_hang || '').trim() : '');
  }
});

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

window.showToast = showToast;
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
