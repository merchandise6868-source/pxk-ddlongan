# HỆ THỐNG PHIẾU XUẤT KHO - CÔNG TY TNHH GIA CÔNG THƯƠNG MẠI D&D LONG AN

Hệ thống lập, quản lý, in ấn phiếu xuất kho khổ A5 ngang trên máy in kim và tổng hợp sản lượng theo chuyền (Tổ chặt - TC, Chuyền may A - CMA, Chuyền may B - CMB).

Ứng dụng được thiết kế theo kiến trúc **Cloudflare Worker + Static Assets + Cloudflare D1 (SQLite)**, chạy mượt mà ngay trên **Localhost** và sẵn sàng deploy lên Cloudflare chỉ với một lệnh.

---

## 🚀 1. Cách chạy trên Localhost

### Cách 1: Click chuột (Dành cho Windows)
* Nhấp đúp vào file **`run_local.bat`** trong thư mục.

### Cách 2: Chạy bằng Terminal
```powershell
npm start
# hoặc
node local-dev-server.js
```

Sau khi chạy, mở trình duyệt web truy cập:
👉 **`http://localhost:8787`**

*Dữ liệu được lưu trữ trực tiếp vào file SQLite cục bộ `pxk_local.db`.*

---

## 🌟 2. Các tính năng chính đã tích hợp

1. **Lập phiếu theo 3 mẫu chuẩn:**
   - **Mẫu 1 (Có đơn giá):** Tự tính `Thành tiền = SL thực xuất × Đơn giá` (hoặc SL chứng từ nếu thực xuất trống).
   - **Mẫu 2 (Không đơn giá):** Giống hệt mẫu giấy hiện tại của xưởng.
   - **Mẫu 3 (Size run):** Ma trận size từ 34 đến 45, tự cộng ngang và cộng dọc.

2. **Nhập liệu kiểu Excel:**
   - Copy khối dữ liệu từ Excel và dán (`Ctrl+V`) vào ô bất kỳ.
   - Di chuyển bằng phím mũi tên (`←` `↑` `→` `↓`), bấm `Enter` để xuống ô hoặc tự thêm dòng mới.
   - Tự động hiểu định dạng số Việt Nam (`1.152` $\rightarrow$ `1152`).
   - Giữ nguyên xuống dòng trong ô Tên hàng (Alt+Enter từ Excel).

3. **Tự động bóc tách Size & Cảnh báo lệch số lượng:**
   - Với Mẫu 1 và 2: Hệ thống tự tách dải size từ ô Tên hàng (ví dụ: `36/66, 37/150, 38/246`).
   - Tự đối chiếu tổng size với SL chứng từ. Nếu lệch sẽ có huy hiệu cảnh báo ⚠️ màu đỏ ngay tức thì.

4. **In phiếu khổ A5 ngang trên máy in kim:**
   - Định dạng in CSS `@page { size: A5 landscape; margin: 5mm 8mm; }`.
   - Viền đơn mảnh 1px đen trắng, font không chân rõ nét, không bị cắt ngang dòng.
   - Đầy đủ 5 ô chữ ký: *Duyệt · Kế toán · Thủ kho · Người nhận · Người lập biểu*.
   - Hỗ trợ nút **In lại** trực tiếp từ danh sách phiếu đã lưu.

5. **Dashboard sản lượng:**
   - Thẻ thống kê sản lượng theo từng chuyền: Tổ chặt (TC), Chuyền A (CMA), Chuyền B (CMB).
   - Bảng ma trận: Mã hàng · Màu · Size Run (34..45) · Tổng.
   - Biểu đồ sản lượng theo ngày.
   - Nút **Xuất file Excel** (CSV UTF-8).

---

## ☁️ 3. Hướng dẫn Triển khai lên Cloudflare Workers (Production)

Khi muốn triển khai lên Cloudflare:

1. Đăng nhập tài khoản Cloudflare:
   ```powershell
   npx.cmd wrangler login
   ```
2. Tạo database D1 trên Cloudflare:
   ```powershell
   npx.cmd wrangler d1 create pxk-database
   ```
3. Copy mã `database_id` sinh ra dán vào file [wrangler.toml](file:///d:/CV/D&D%20Long%20An/PXK/wrangler.toml).
4. Khởi tạo bảng dữ liệu trên Cloudflare:
   ```powershell
   npx.cmd wrangler d1 execute pxk-database --file=./schema.sql --remote
   ```
5. Deploy toàn bộ ứng dụng:
   ```powershell
   npx.cmd wrangler deploy
   ```
