-- ============================================================
-- SCHEMA DATABASE CHO HỆ THỐNG PHIẾU XUẤT KHO D&D LONG AN
-- Tương thích Cloudflare D1 (SQLite)
-- ============================================================

-- 1. Bảng danh mục Bộ phận / Chuyền sản xuất
CREATE TABLE IF NOT EXISTS bo_phan (
    ma TEXT PRIMARY KEY,            -- Mã bộ phận: 'TC', 'CMA', 'CMB'
    ten TEXT NOT NULL,              -- 'Tổ chặt', 'Chuyền may A', 'Chuyền may B'
    thu_tu INTEGER DEFAULT 0
);

-- Dữ liệu ban đầu cho bộ phận
INSERT OR IGNORE INTO bo_phan (ma, ten, thu_tu) VALUES 
('TC', 'Tổ chặt', 1),
('CMA', 'Chuyền may A', 2),
('CMB', 'Chuyền may B', 3);

-- 2. Bảng phiếu xuất kho (Header)
CREATE TABLE IF NOT EXISTS phieu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    so_phieu TEXT UNIQUE NOT NULL,      -- TC001/10/26
    ma_bo_phan TEXT NOT NULL,           -- TC, CMA, CMB
    mau_phieu INTEGER NOT NULL,         -- 1: Có đơn giá, 2: Không đơn giá, 3: Size run
    ngay TEXT NOT NULL,                 -- YYYY-MM-DD
    don_vi_nhan TEXT DEFAULT '',
    ly_do_xuat TEXT DEFAULT '',
    don_hang TEXT DEFAULT '',
    bo_phan_xuat TEXT DEFAULT '',
    trang_thai TEXT DEFAULT 'saved',    -- 'draft', 'saved', 'cancelled'
    nguoi_lap TEXT DEFAULT '',
    dia_chi_cty TEXT DEFAULT 'A8/21c, Bông Văn Dĩa, Xã Tân Nhựt, TP HCM',
    ghi_chu TEXT DEFAULT '',
    canh_bao_lech_size INTEGER DEFAULT 0, -- 1: cảnh báo nếu bóc tách size != SL chứng từ
    tao_luc DATETIME DEFAULT CURRENT_TIMESTAMP,
    cap_nhat_luc DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu trữ bộ đếm số phiếu tăng dần theo bộ phận (không bao giờ lặp lại khi xóa)
CREATE TABLE IF NOT EXISTS so_phieu_counter (
    ma_bo_phan TEXT PRIMARY KEY,
    max_seq INTEGER DEFAULT 0
);

-- 3. Bảng dòng chi tiết phiếu (Lines)
CREATE TABLE IF NOT EXISTS phieu_dong (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id INTEGER NOT NULL REFERENCES phieu(id) ON DELETE CASCADE,
    stt INTEGER DEFAULT 1,
    ten_hang TEXT DEFAULT '',           -- Tên hàng, quy cách (hoặc chứa text size: 36/66, 37/150)
    ma_hang TEXT DEFAULT '',            -- Mã hàng (ví dụ: DCP004-TARA)
    mau TEXT DEFAULT '',                -- Màu (ví dụ: Đen, Trắng, ...)
    dvt TEXT DEFAULT 'Đôi',
    sl_chung_tu REAL DEFAULT 0,
    sl_thuc_xuat REAL DEFAULT 0,
    don_gia REAL DEFAULT 0,
    thanh_tien REAL DEFAULT 0,
    ghi_chu TEXT DEFAULT ''
);

-- 4. Bảng chi tiết size theo dòng (phục vụ tổng hợp Dashboard sản lượng)
CREATE TABLE IF NOT EXISTS phieu_dong_size (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_dong_id INTEGER NOT NULL REFERENCES phieu_dong(id) ON DELETE CASCADE,
    size TEXT NOT NULL,                 -- 34, 35, 36, ..., 45
    so_luong REAL DEFAULT 0
);

-- Chỉ mục để tối ưu tốc độ truy vấn dashboard
CREATE INDEX IF NOT EXISTS idx_phieu_ngay ON phieu(ngay);
CREATE INDEX IF NOT EXISTS idx_phieu_bophan ON phieu(ma_bo_phan);
CREATE INDEX IF NOT EXISTS idx_phieu_dong_phieu ON phieu_dong(phieu_id);
CREATE INDEX IF NOT EXISTS idx_phieu_dong_size_dong ON phieu_dong_size(phieu_dong_id);

-- 5. Bảng ghi nhận sản lượng QC theo size
CREATE TABLE IF NOT EXISTS qc_san_luong (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay TEXT NOT NULL,
    ma_bo_phan TEXT NOT NULL,
    ma_hang TEXT NOT NULL,
    mau TEXT DEFAULT '',
    qc_nguoi_ghi TEXT DEFAULT '',
    ghi_chu TEXT DEFAULT '',
    tong_sl REAL DEFAULT 0,
    tao_luc DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qc_san_luong_size (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qc_id INTEGER NOT NULL REFERENCES qc_san_luong(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    so_luong REAL DEFAULT 0
);

-- 6. Bảng ghi nhận sản lượng theo giờ của Tổ trưởng
CREATE TABLE IF NOT EXISTS to_truong_san_luong (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay TEXT NOT NULL,
    ma_bo_phan TEXT NOT NULL,
    to_truong_ten TEXT DEFAULT '',
    ma_hang TEXT DEFAULT '',
    khung_gio_tang_ca TEXT DEFAULT '4h30_6h',
    tong_san_luong REAL DEFAULT 0,
    ghi_chu TEXT DEFAULT '',
    tao_luc DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS to_truong_san_luong_gio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_truong_id INTEGER NOT NULL REFERENCES to_truong_san_luong(id) ON DELETE CASCADE,
    khung_gio TEXT NOT NULL,
    san_luong REAL DEFAULT 0,
    thu_tu INTEGER DEFAULT 0
);
