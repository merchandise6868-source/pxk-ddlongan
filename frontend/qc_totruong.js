/**
 * LOGIC QUẢN LÝ SẢN LƯỢNG QC & SẢN LƯỢNG THEO GIỜ CỦA TỔ TRƯỞNG
 * Hệ thống Phiếu Xuất Kho - D&D Long An
 */

// ============================================================
// 1. SẢN LƯỢNG QC (BẢNG KIỂM ĐỊNH MÃ HÀNG X CỠ SIZE)
// ============================================================
const QC_STANDARD_SIZES = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

const QC_DRAFT_KEY = 'DD_QC_DRAFT_V1';

const QcState = {
  rows: [
    { id: 1, ma_hang: '', mau: '', sizes: {} },
    { id: 2, ma_hang: '', mau: '', sizes: {} },
  ],
};

function saveQcDraft() {
  try {
    const meta = {
      date: document.getElementById('qc-date')?.value || '',
      bophan: document.getElementById('qc-bophan')?.value || '',
      nguoighi: document.getElementById('qc-nguoighi')?.value || '',
      ghichu: document.getElementById('qc-ghichu')?.value || '',
      rows: QcState.rows,
    };
    localStorage.setItem(QC_DRAFT_KEY, JSON.stringify(meta));
  } catch (err) {
    console.error('Lỗi lưu nháp QC:', err);
  }
}

function restoreQcDraft() {
  try {
    const raw = localStorage.getItem(QC_DRAFT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      QcState.rows = parsed.rows;
      if (parsed.nguoighi && document.getElementById('qc-nguoighi')) {
        document.getElementById('qc-nguoighi').value = parsed.nguoighi;
      }
      if (parsed.ghichu && document.getElementById('qc-ghichu')) {
        document.getElementById('qc-ghichu').value = parsed.ghichu;
      }
      if (parsed.date && document.getElementById('qc-date')) {
        document.getElementById('qc-date').value = parsed.date;
      }
      return true;
    }
  } catch (err) {
    console.error('Lỗi nạp nháp QC:', err);
  }
  return false;
}

function initQc() {
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('qc-date');
  if (dateInput) dateInput.value = today;

  const btnReset = document.getElementById('btn-qc-reset');
  if (btnReset) btnReset.addEventListener('click', resetQcForm);

  const btnSave = document.getElementById('btn-qc-save');
  if (btnSave) btnSave.addEventListener('click', saveQcData);

  const btnAdd = document.getElementById('btn-qc-add-row');
  if (btnAdd) btnAdd.addEventListener('click', addQcRow);

  // Lắng nghe thay đổi thông tin meta để tự lưu nháp
  ['qc-date', 'qc-bophan', 'qc-nguoighi', 'qc-ghichu'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveQcDraft);
    if (el) el.addEventListener('change', saveQcDraft);
  });

  restoreQcDraft();
  renderQcMatrix();
  loadQcHistory();
}

function addQcRow() {
  QcState.rows.push({
    id: Date.now(),
    ma_hang: '',
    mau: '',
    sizes: {},
  });
  renderQcMatrix();

  // Focus ô mã hàng mới thêm
  setTimeout(() => {
    const lastRowIdx = QcState.rows.length - 1;
    const input = document.querySelector(`.qc-style-input[data-row-idx="${lastRowIdx}"]`);
    if (input) input.focus();
  }, 50);
  saveQcDraft();
}

function delQcRow(rowIdx) {
  if (QcState.rows.length <= 1) {
    QcState.rows[0].ma_hang = '';
    QcState.rows[0].mau = '';
    QcState.rows[0].sizes = {};
    renderQcMatrix();
    saveQcDraft();
    return;
  }
  QcState.rows.splice(rowIdx, 1);
  renderQcMatrix();
  saveQcDraft();
}

function renderQcMatrix() {
  const tbody = document.getElementById('qc-matrix-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  QcState.rows.forEach((row, rowIdx) => {
    const tr = document.createElement('tr');

    // Tính tổng đôi của dòng này
    let rowTotal = 0;
    QC_STANDARD_SIZES.forEach(s => {
      rowTotal += (row.sizes[s] || 0);
    });

    let sizeColsHtml = '';
    QC_STANDARD_SIZES.forEach((s, sIdx) => {
      const val = row.sizes[s] !== undefined && row.sizes[s] > 0 ? row.sizes[s] : '';
      const hasValClass = val ? 'has-val' : '';
      sizeColsHtml += `
        <td>
          <input type="text" 
                 class="qc-size-input ${hasValClass}" 
                 data-row-idx="${rowIdx}" 
                 data-size="${s}" 
                 data-col-idx="${sIdx}"
                 value="${formatNumStr(val)}" 
                 placeholder="0">
        </td>
      `;
    });

    tr.innerHTML = `
      <td style="text-align: center; font-weight: 700; color: #166534;">${rowIdx + 1}</td>
      <td>
        <input type="text" 
               class="qc-style-input" 
               data-row-idx="${rowIdx}" 
               value="${escapeHtmlStr(row.ma_hang)}" 
               placeholder="VD: DH-2026...">
      </td>
      <td>
        <input type="text" 
               class="qc-color-input" 
               data-row-idx="${rowIdx}" 
               value="${escapeHtmlStr(row.mau)}" 
               placeholder="Màu...">
      </td>
      ${sizeColsHtml}
      <td>
        <span class="qc-row-total-badge" id="qc-row-total-${rowIdx}">${formatNumStr(rowTotal)}</span>
      </td>
      <td style="text-align: center;">
        <button type="button" class="qc-btn-del-row" data-row-idx="${rowIdx}" title="Xóa dòng này">✕</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  attachQcMatrixEvents();
  calcQcMatrixTotals();
}

function attachQcMatrixEvents() {
  // Lắng nghe input Mã Hàng
  document.querySelectorAll('.qc-style-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const rowIdx = parseInt(e.target.dataset.rowIdx, 10);
      QcState.rows[rowIdx].ma_hang = e.target.value.trim().toUpperCase();
      updateQcKpis();
      saveQcDraft();
    });
    input.addEventListener('keydown', handleQcMatrixNav);
  });

  // Lắng nghe input Màu
  document.querySelectorAll('.qc-color-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const rowIdx = parseInt(e.target.dataset.rowIdx, 10);
      QcState.rows[rowIdx].mau = e.target.value.trim();
      saveQcDraft();
    });
    input.addEventListener('keydown', handleQcMatrixNav);
  });

  // Lắng nghe input Cỡ Size
  document.querySelectorAll('.qc-size-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const rowIdx = parseInt(e.target.dataset.rowIdx, 10);
      const size = e.target.dataset.size;
      const val = parseNumStr(e.target.value);

      if (val > 0) {
        QcState.rows[rowIdx].sizes[size] = val;
        e.target.classList.add('has-val');
      } else {
        delete QcState.rows[rowIdx].sizes[size];
        e.target.classList.remove('has-val');
      }

      // Cập nhật tổng dòng này
      let rowTotal = 0;
      QC_STANDARD_SIZES.forEach(s => {
        rowTotal += (QcState.rows[rowIdx].sizes[s] || 0);
      });
      const badge = document.getElementById(`qc-row-total-${rowIdx}`);
      if (badge) badge.textContent = formatNumStr(rowTotal);

      calcQcMatrixTotals();
      saveQcDraft();
    });

    input.addEventListener('keydown', handleQcMatrixNav);
  });

  // Nút xóa dòng
  document.querySelectorAll('.qc-btn-del-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rowIdx = parseInt(e.target.dataset.rowIdx, 10);
      delQcRow(rowIdx);
    });
  });
}

function handleQcMatrixNav(e) {
  const rowIdx = parseInt(e.target.dataset.rowIdx, 10);
  const isSize = e.target.classList.contains('qc-size-input');

  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (rowIdx < QcState.rows.length - 1) {
      focusCell(rowIdx + 1, e.target);
    } else {
      if (e.key === 'Enter') {
        addQcRow();
      }
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (rowIdx > 0) {
      focusCell(rowIdx - 1, e.target);
    }
  } else if (e.key === 'ArrowRight' && isSize) {
    const colIdx = parseInt(e.target.dataset.colIdx, 10);
    if (colIdx < QC_STANDARD_SIZES.length - 1) {
      const nextInput = document.querySelector(`.qc-size-input[data-row-idx="${rowIdx}"][data-col-idx="${colIdx + 1}"]`);
      if (nextInput) nextInput.focus();
    }
  } else if (e.key === 'ArrowLeft' && isSize) {
    const colIdx = parseInt(e.target.dataset.colIdx, 10);
    if (colIdx > 0) {
      const prevInput = document.querySelector(`.qc-size-input[data-row-idx="${rowIdx}"][data-col-idx="${colIdx - 1}"]`);
      if (prevInput) prevInput.focus();
    }
  }
}

function focusCell(targetRowIdx, srcInput) {
  if (srcInput.classList.contains('qc-style-input')) {
    const target = document.querySelector(`.qc-style-input[data-row-idx="${targetRowIdx}"]`);
    if (target) target.focus();
  } else if (srcInput.classList.contains('qc-color-input')) {
    const target = document.querySelector(`.qc-color-input[data-row-idx="${targetRowIdx}"]`);
    if (target) target.focus();
  } else if (srcInput.classList.contains('qc-size-input')) {
    const colIdx = srcInput.dataset.colIdx;
    const target = document.querySelector(`.qc-size-input[data-row-idx="${targetRowIdx}"][data-col-idx="${colIdx}"]`);
    if (target) target.focus();
  }
}

function calcQcMatrixTotals() {
  const colTotals = new Array(QC_STANDARD_SIZES.length).fill(0);
  let grandTotal = 0;

  QcState.rows.forEach(row => {
    QC_STANDARD_SIZES.forEach((s, idx) => {
      const qty = row.sizes[s] || 0;
      colTotals[idx] += qty;
      grandTotal += qty;
    });
  });

  // Hiển thị tổng từng cột size ở footer
  colTotals.forEach((tot, idx) => {
    const el = document.getElementById(`qc-col-tot-${idx}`);
    if (el) el.textContent = formatNumStr(tot);
  });

  // Tổng cộng toàn bộ
  const grandEl = document.getElementById('qc-grand-total');
  if (grandEl) grandEl.textContent = formatNumStr(grandTotal);

  updateQcKpis();
}

function updateQcKpis() {
  let validStylesCount = 0;
  let totalPairs = 0;

  QcState.rows.forEach(row => {
    let rowPairs = 0;
    QC_STANDARD_SIZES.forEach(s => { rowPairs += (row.sizes[s] || 0); });
    if (row.ma_hang && row.ma_hang.trim() !== '') {
      validStylesCount++;
    }
    totalPairs += rowPairs;
  });

  const kpiStyles = document.getElementById('qc-kpi-styles-count');
  if (kpiStyles) kpiStyles.textContent = validStylesCount || QcState.rows.length;

  const kpiPairs = document.getElementById('qc-kpi-total-pairs');
  if (kpiPairs) kpiPairs.textContent = `${formatNumStr(totalPairs)} đôi`;
}

function resetQcForm() {
  QcState.rows = [
    { id: 1, ma_hang: '', mau: '', sizes: {} },
    { id: 2, ma_hang: '', mau: '', sizes: {} },
  ];
  const nguoighi = document.getElementById('qc-nguoighi');
  if (nguoighi) nguoighi.value = '';
  const ghichu = document.getElementById('qc-ghichu');
  if (ghichu) ghichu.value = '';

  try {
    localStorage.removeItem(QC_DRAFT_KEY);
  } catch (e) {}

  renderQcMatrix();
}

async function saveQcData() {
  const ngay = document.getElementById('qc-date').value;
  const maBoPhan = document.getElementById('qc-bophan').value;
  const qcNguoiGhi = document.getElementById('qc-nguoighi').value.trim();
  const ghiChu = document.getElementById('qc-ghichu').value.trim();

  if (!ngay || !maBoPhan) {
    alert('Vui lòng chọn Ngày kiểm và Chuyền / Bộ phận!');
    return;
  }

  const validRows = [];
  let totalAll = 0;

  QcState.rows.forEach(row => {
    const maHang = (row.ma_hang || '').trim();
    const sizes = [];
    let rowTotal = 0;

    QC_STANDARD_SIZES.forEach(s => {
      const qty = row.sizes[s] || 0;
      if (qty > 0) {
        sizes.push({ size: s, so_luong: qty });
        rowTotal += qty;
      }
    });

    if (maHang && rowTotal > 0) {
      validRows.push({
        ma_hang: maHang,
        mau: (row.mau || '').trim(),
        sizes,
        rowTotal,
      });
      totalAll += rowTotal;
    }
  });

  if (validRows.length === 0) {
    alert('Vui lòng nhập Mã hàng và sản lượng kiểm đạt cho ít nhất 1 dòng mã hàng!');
    return;
  }

  try {
    const res = await fetch('/api/qc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ngay,
        ma_bo_phan: maBoPhan,
        qc_nguoi_ghi: qcNguoiGhi,
        ghi_chu: ghiChu,
        rows: validRows,
      }),
    });

    const data = await res.json();
    if (data.success) {
      alert(`Đã lưu thành công sản lượng QC: ${formatNumStr(totalAll)} đôi (${validRows.length} mã hàng)!`);
      resetQcForm();
      loadQcHistory();
    } else {
      alert(data.error || 'Lỗi lưu sản lượng QC');
    }
  } catch (err) {
    console.error(err);
    alert('Lỗi kết nối máy chủ');
  }
}

window.loadQcHistory = async function() {
  const tbody = document.getElementById('qc-history-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/qc');
    const result = await res.json();
    if (!result.success || !result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color: var(--text-muted);">Chưa có bản ghi sản lượng QC nào.</td></tr>';
      return;
    }

    tbody.innerHTML = result.data.map((item, idx) => {
      const sizesText = item.sizes ? item.sizes.map(s => `${s.size}:${s.so_luong}`).join(', ') : '-';
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${item.ngay}</td>
          <td style="text-align: center;"><span class="btn" style="padding: 1px 6px; font-size: 11px;">${item.ma_bo_phan}</span></td>
          <td><strong>${escapeHtmlStr(item.ma_hang)}</strong></td>
          <td>${escapeHtmlStr(item.mau || '-')}</td>
          <td style="font-size: 11px; color: #166534; font-weight: 500;">${sizesText}</td>
          <td style="text-align: right; font-weight: bold; color: #15803d; font-size: 13px;">${formatNumStr(item.tong_sl)}</td>
          <td>${escapeHtmlStr(item.qc_nguoi_ghi || '-')}</td>
          <td style="text-align: center;">
            <button class="btn btn-danger" style="padding: 2px 6px; font-size: 10px;" onclick="deleteQcRecord(${item.id})">✕ Xóa</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
};

window.deleteQcRecord = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa bản ghi QC này?')) return;
  try {
    const res = await fetch(`/api/qc/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadQcHistory();
    }
  } catch (err) {
    console.error(err);
  }
};


// ============================================================
// 2. SẢN LƯỢNG TỔ TRƯỞNG THEO TỪNG MỐC GIỜ
// Giờ cố định ban ngày: 07:30 đến 16:30
// Phía sau: 5 dòng tăng ca linh hoạt để tổ trưởng tự nhập giờ
// ============================================================
const TT_FIXED_SLOTS = [
  '07:30 - 08:30',
  '08:30 - 09:30',
  '09:30 - 10:30',
  '10:30 - 11:30',
  // Nghỉ trưa 11h30 - 12h30
  '12:30 - 13:30',
  '13:30 - 14:30',
  '14:30 - 15:30',
  '15:30 - 16:30',
];

const TT_DRAFT_KEY = 'DD_TOTRUONG_DRAFT_V1';

const TTState = {
  fixedValues: {}, // { 0: 45, 1: 50, ... }
  overtimeRows: [
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
  ],
};

function saveTotruongDraft() {
  try {
    const meta = {
      date: document.getElementById('tt-date')?.value || '',
      bophan: document.getElementById('tt-bophan')?.value || '',
      nguoighi: document.getElementById('tt-nguoighi')?.value || '',
      mahang: document.getElementById('tt-mahang')?.value || '',
      fixedValues: TTState.fixedValues,
      overtimeRows: TTState.overtimeRows,
    };
    localStorage.setItem(TT_DRAFT_KEY, JSON.stringify(meta));
  } catch (err) {
    console.error('Lỗi lưu nháp tổ trưởng:', err);
  }
}

function restoreTotruongDraft() {
  try {
    const raw = localStorage.getItem(TT_DRAFT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed) {
      if (parsed.fixedValues) TTState.fixedValues = parsed.fixedValues;
      if (Array.isArray(parsed.overtimeRows)) TTState.overtimeRows = parsed.overtimeRows;
      if (parsed.nguoighi && document.getElementById('tt-nguoighi')) {
        document.getElementById('tt-nguoighi').value = parsed.nguoighi;
      }
      if (parsed.mahang && document.getElementById('tt-mahang')) {
        document.getElementById('tt-mahang').value = parsed.mahang;
      }
      if (parsed.date && document.getElementById('tt-date')) {
        document.getElementById('tt-date').value = parsed.date;
      }
      return true;
    }
  } catch (err) {
    console.error('Lỗi nạp nháp tổ trưởng:', err);
  }
  return false;
}

function initTotruong() {
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('tt-date');
  if (dateInput) dateInput.value = today;

  const btnReset = document.getElementById('btn-tt-reset');
  if (btnReset) btnReset.addEventListener('click', resetTotruongForm);

  const btnSave = document.getElementById('btn-tt-save');
  if (btnSave) btnSave.addEventListener('click', saveTotruongData);

  // Lắng nghe thay đổi thông tin meta để tự lưu nháp
  ['tt-date', 'tt-bophan', 'tt-nguoighi', 'tt-mahang'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveTotruongDraft);
    if (el) el.addEventListener('change', saveTotruongDraft);
  });

  restoreTotruongDraft();
  renderTotruongTable();
  loadTotruongHistory();
}

/**
 * Gợi ý điền nhanh giờ tăng ca vào dòng trống đầu tiên
 */
window.quickFillOvertime = function(timeText) {
  let emptyIdx = -1;
  for (let i = 0; i < TTState.overtimeRows.length; i++) {
    if (!TTState.overtimeRows[i].slot || TTState.overtimeRows[i].slot.trim() === '') {
      emptyIdx = i;
      break;
    }
  }

  if (emptyIdx === -1) {
    // Nếu cả 5 dòng đều đã có giờ, ghi đè vào dòng cuối
    emptyIdx = TTState.overtimeRows.length - 1;
  }

  TTState.overtimeRows[emptyIdx].slot = timeText;
  renderTotruongTable();

  // Focus vào ô sản lượng của dòng vừa điền
  setTimeout(() => {
    const qtyInput = document.querySelector(`.tt-ot-qty[data-ot-idx="${emptyIdx}"]`);
    if (qtyInput) qtyInput.focus();
  }, 50);
};

function renderTotruongTable() {
  const tbody = document.getElementById('tt-grid-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  // 1. Tám khung giờ ban ngày cố định (07:30 - 16:30)
  TT_FIXED_SLOTS.forEach((slot, idx) => {
    const tr = document.createElement('tr');
    const val = TTState.fixedValues[idx] !== undefined ? TTState.fixedValues[idx] : '';

    tr.innerHTML = `
      <td style="text-align: center; font-weight: 600; padding: 6px 8px; color: var(--secondary);">${idx + 1}</td>
      <td style="padding: 6px 12px; font-weight: 600; color: #1e293b;">
        ⏱️ ${slot}
      </td>
      <td style="padding: 0;">
        <input type="text" class="excel-cell tt-fixed-qty cell-right" data-idx="${idx}" value="${formatNumStr(val)}" placeholder="0" style="font-size: 14px; font-weight: 600; padding: 6px 10px;">
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 2. Năm dòng tăng ca linh hoạt (Tổ trưởng tự gõ giờ)
  TTState.overtimeRows.forEach((ot, otIdx) => {
    const tr = document.createElement('tr');
    tr.className = 'tt-overtime-row';
    const rowNum = TT_FIXED_SLOTS.length + otIdx + 1;
    const otVal = ot.qty > 0 ? ot.qty : '';

    tr.innerHTML = `
      <td style="text-align: center; font-weight: 600; padding: 6px 8px; color: #b45309;">${rowNum}</td>
      <td style="padding: 4px 8px;">
        <input type="text" class="tt-slot-input" data-ot-idx="${otIdx}" value="${escapeHtmlStr(ot.slot)}" placeholder="Tự nhập giờ tăng ca (ví dụ: 16:30 - 18:00, 17:00 - 20:00, 20h - 21h...)">
      </td>
      <td style="padding: 0;">
        <input type="text" class="excel-cell tt-ot-qty cell-right" data-ot-idx="${otIdx}" value="${formatNumStr(otVal)}" placeholder="0" style="font-size: 14px; font-weight: 600; padding: 6px 10px; color: #92400e;">
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachTotruongCellEvents();
  calcTotruongTotals();
}

function attachTotruongCellEvents() {
  // Lắng nghe các ô số lượng cố định
  document.querySelectorAll('.tt-fixed-qty').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      TTState.fixedValues[idx] = parseNumStr(e.target.value);
      calcTotruongTotals();
      saveTotruongDraft();
    });

    input.addEventListener('keydown', handleTotruongKeyNav);
  });

  // Lắng nghe ô tên giờ tăng ca
  document.querySelectorAll('.tt-slot-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const otIdx = parseInt(e.target.dataset.otIdx, 10);
      TTState.overtimeRows[otIdx].slot = e.target.value.trim();
      saveTotruongDraft();
    });
  });

  // Lắng nghe các ô số lượng tăng ca
  document.querySelectorAll('.tt-ot-qty').forEach(input => {
    input.addEventListener('input', (e) => {
      const otIdx = parseInt(e.target.dataset.otIdx, 10);
      TTState.overtimeRows[otIdx].qty = parseNumStr(e.target.value);
      calcTotruongTotals();
      saveTotruongDraft();
    });

    input.addEventListener('keydown', handleTotruongKeyNav);
  });
}

function handleTotruongKeyNav(e) {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    const nextTr = e.target.closest('tr').nextElementSibling;
    if (nextTr) {
      const nextInput = nextTr.querySelector('.tt-fixed-qty, .tt-ot-qty');
      if (nextInput) nextInput.focus();
    }
  } else if (e.key === 'ArrowUp') {
    const prevTr = e.target.closest('tr').previousElementSibling;
    if (prevTr) {
      const prevInput = prevTr.querySelector('.tt-fixed-qty, .tt-ot-qty');
      if (prevInput) prevInput.focus();
    }
  }
}

function calcTotruongTotals() {
  let total = 0;

  // Cộng giờ cố định
  TT_FIXED_SLOTS.forEach((_, idx) => {
    total += (TTState.fixedValues[idx] || 0);
  });

  // Cộng 5 dòng tăng ca
  TTState.overtimeRows.forEach(ot => {
    total += (ot.qty || 0);
  });

  const totalEl = document.getElementById('tt-total-qty');
  if (totalEl) totalEl.textContent = formatNumStr(total);
}

function resetTotruongForm() {
  TTState.fixedValues = {};
  TTState.overtimeRows = [
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
    { slot: '', qty: 0 },
  ];
  const nguoighi = document.getElementById('tt-nguoighi');
  if (nguoighi) nguoighi.value = '';
  const mahang = document.getElementById('tt-mahang');
  if (mahang) mahang.value = '';

  try {
    localStorage.removeItem(TT_DRAFT_KEY);
  } catch (e) {}

  renderTotruongTable();
}

async function saveTotruongData() {
  const ngay = document.getElementById('tt-date').value;
  const maBoPhan = document.getElementById('tt-bophan').value;
  const toTruongTen = document.getElementById('tt-nguoighi').value.trim();
  const maHang = document.getElementById('tt-mahang').value.trim();

  const gioList = [];
  let total = 0;

  // 1. Khung giờ cố định
  TT_FIXED_SLOTS.forEach((slot, idx) => {
    const sl = TTState.fixedValues[idx] || 0;
    if (sl > 0) {
      gioList.push({
        khung_gio: slot,
        san_luong: sl,
        thu_tu: idx + 1,
      });
      total += sl;
    }
  });

  // 2. Khung giờ tăng ca tự nhập
  TTState.overtimeRows.forEach((ot, otIdx) => {
    const sl = ot.qty || 0;
    const slotName = ot.slot && ot.slot.trim() !== '' ? ot.slot.trim() : `Tăng ca ${otIdx + 1}`;
    if (sl > 0) {
      gioList.push({
        khung_gio: slotName,
        san_luong: sl,
        thu_tu: TT_FIXED_SLOTS.length + otIdx + 1,
      });
      total += sl;
    }
  });

  if (gioList.length === 0) {
    alert('Vui lòng nhập sản lượng cho ít nhất 1 khung giờ!');
    return;
  }

  try {
    const res = await fetch('/api/totruong', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ngay,
        ma_bo_phan: maBoPhan,
        to_truong_ten: toTruongTen,
        ma_hang: maHang,
        khung_gio_tang_ca: 'custom',
        gio_list: gioList,
      }),
    });

    const data = await res.json();
    if (data.success) {
      alert(`Đã lưu thành công sản lượng Tổ trưởng: ${formatNumStr(total)} đôi!`);
      resetTotruongForm();
      loadTotruongHistory();
    } else {
      alert(data.error || 'Lỗi lưu sản lượng tổ trưởng');
    }
  } catch (err) {
    console.error(err);
    alert('Lỗi kết nối máy chủ');
  }
}

window.loadTotruongHistory = async function() {
  const tbody = document.getElementById('tt-history-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/totruong');
    const result = await res.json();
    if (!result.success || !result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">Chưa có bản ghi sản lượng tổ trưởng nào.</td></tr>';
      return;
    }

    tbody.innerHTML = result.data.map((item, idx) => {
      const details = item.gio_list ? item.gio_list.map(g => `${g.khung_gio.slice(0, 5)}: ${g.san_luong}`).join(' | ') : '-';
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${item.ngay}</td>
          <td style="text-align: center;"><span class="btn" style="padding: 1px 6px; font-size: 11px;">${item.ma_bo_phan}</span></td>
          <td><strong>${escapeHtmlStr(item.to_truong_ten || '-')}</strong></td>
          <td>${escapeHtmlStr(item.ma_hang || '-')}</td>
          <td style="text-align: right; font-weight: bold; color: var(--primary); font-size: 13px;">${formatNumStr(item.tong_san_luong)}</td>
          <td style="font-size: 11px; color: #475569;">${details}</td>
          <td style="text-align: center;">
            <button class="btn btn-danger" style="padding: 2px 6px; font-size: 10px;" onclick="deleteTotruongRecord(${item.id})">✕ Xóa</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

window.deleteTotruongRecord = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa bản ghi sản lượng này của tổ trưởng?')) return;
  try {
    const res = await fetch(`/api/totruong/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadTotruongHistory();
    }
  } catch (err) {
    console.error(err);
  }
};


// ============================================================
// ĐỒNG BỘ DANH SÁCH BỘ PHẬN VÀO CÁC DROPDOWN QC & TỔ TRƯỞNG
// ============================================================
async function populateQcAndTotruongDepts() {
  try {
    const res = await fetch('/api/bophan');
    const data = await res.json();
    if (data.success) {
      const selQc = document.getElementById('qc-bophan');
      const selTt = document.getElementById('tt-bophan');

      if (selQc) {
        selQc.innerHTML = '';
        data.data.forEach(bp => selQc.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma)));
      }
      if (selTt) {
        selTt.innerHTML = '';
        data.data.forEach(bp => selTt.add(new Option(`${bp.ma} - ${bp.ten}`, bp.ma)));
      }
    }
  } catch (err) {
    console.error('Lỗi nạp bộ phận:', err);
  }
}

// Khởi chạy khi DOM load xong
document.addEventListener('DOMContentLoaded', () => {
  populateQcAndTotruongDepts();
  initQc();
  initTotruong();
});

// Tiện ích phụ
function parseNumStr(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatNumStr(val) {
  if (val === undefined || val === null || val === '' || val === 0) return '';
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('vi-VN').format(num);
}

function escapeHtmlStr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
