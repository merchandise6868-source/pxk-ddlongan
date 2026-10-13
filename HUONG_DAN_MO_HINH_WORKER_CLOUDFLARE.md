# 📘 HƯỚNG DẪN CHUẨN: MÔ HÌNH CLOUDFLARE WORKER + STATIC ASSETS
*(Mô hình kiến trúc siêu nhẹ, triển khai mượt mà, không bao giờ lỗi build)*

---

## 🌟 1. Tổng quan mô hình
Mô hình này tách biệt rõ ràng giữa **Giao diện người dùng (Frontend tĩnh)** và **API Xử lý dữ liệu (Cloudflare Worker Backend)**:
* **Frontend:** Viết bằng HTML5, CSS3, JavaScript thuần (Vanilla JS). Trình duyệt đọc trực tiếp, **không cần bước build/compile** bằng Vite hay Webpack.
* **Backend:** Chạy trên Cloudflare Worker serverless (`src/index.js`), xử lý API, xác thực, Telegram Bot, truy vấn Database (D1 / CockroachDB / PostgreSQL).
* **Deploy:** Triển khai tức thì chỉ với 1 lệnh `wrangler deploy`, thời gian deploy dưới 5 giây.

---

## 📂 2. Cấu trúc thư mục chuẩn

```text
my-project/
├── frontend/                     # [FRONTEND] Chứa toàn bộ giao diện tĩnh
│   ├── index.html                # Giao diện chính
│   ├── app.js                    # Logic gọi API và xử lý giao diện
│   ├── styles.css                # Giao diện CSS
│   ├── manifest.json             # Cấu hình PWA (cài app lên điện thoại)
│   ├── sw.js                     # Service Worker lưu cache offline
│   ├── icon-192.png              # Icon ứng dụng
│   └── icon-512.png
├── src/                          # [BACKEND] Chứa mã nguồn Cloudflare Worker
│   └── index.js                  # Router API, xử lý Database, Webhook Telegram
├── schema.sql                    # File khởi tạo bảng Database (D1 / SQL)
├── wrangler.toml                 # File cấu hình Cloudflare Worker
├── package.json                  # Khai báo thư viện (nếu có)
├── .gitignore                    # Bỏ qua node_modules, file rác
└── push_to_github.bat            # File chạy tự động đẩy code lên GitHub
```

---

## ⚙️ 3. Chi tiết các file cấu hình quan trọng

### 3.1. File `wrangler.toml` (Chuẩn Worker + Assets)
```toml
name = "ten-ung-dung-cua-ban"
main = "src/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

# 1. Cấu hình thư mục Frontend tĩnh
[assets]
directory = "frontend"
binding = "ASSETS"

# 2. Cấu hình kết nối Cloudflare D1 Database (nếu dùng D1)
[[d1_databases]]
binding = "DB"
database_name = "ten-database-d1"
database_id = "xxxx-xxxx-xxxx-xxxx"   # Lấy từ lệnh: npx wrangler d1 create <ten-db>

# 3. Biến môi trường bí mật hoặc URL (nếu có)
[vars]
TELEGRAM_BOT_TOKEN = "your-telegram-token-here"
WEBAPP_URL = "https://ten-ung-dung-cua-ban.ddlongan.workers.dev"

# 4. Tự động chạy Cron Job định kỳ (nếu cần sao lưu, gửi báo cáo hàng ngày)
[triggers]
crons = ["0 10 * * *"] # 17:00 giờ Việt Nam mỗi ngày
```

---

### 3.2. File `src/index.js` (Mã nguồn Backend Worker mẫu)
```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Phục vụ các API Backend
    if (url.pathname.startsWith('/api/')) {
      // API Lấy dữ liệu từ D1 Database
      if (url.pathname === '/api/data' && request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare('SELECT * FROM my_table ORDER BY id DESC LIMIT 50').all();
          return Response.json({ success: true, data: results });
        } catch (err) {
          return Response.json({ success: false, error: err.message }, { status: 500 });
        }
      }

      // API Thêm mới dữ liệu vào D1 Database
      if (url.pathname === '/api/data' && request.method === 'POST') {
        try {
          const body = await request.json();
          await env.DB.prepare('INSERT INTO my_table (name, amount) VALUES (?, ?)')
            .bind(body.name, body.amount)
            .run();
          return Response.json({ success: true, message: 'Đã lưu thành công' });
        } catch (err) {
          return Response.json({ success: false, error: err.message }, { status: 500 });
        }
      }

      return Response.json({ error: 'Endpoint không tồn tại' }, { status: 404 });
    }

    // 2. Nếu không phải API, tự động trả về file tĩnh trong thư mục frontend/
    return env.ASSETS.fetch(request);
  },

  // Xử lý Cron Job chạy định kỳ hàng ngày
  async scheduled(event, env, ctx) {
    console.log("Cron trigger running at:", new Date().toISOString());
  }
};
```

---

### 3.3. File `package.json` mẫu
```json
{
  "name": "dd-worker-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.78.10"
  }
}
```

---

## 🚀 4. Thiết lập trên Cloudflare Dashboard khi Connect GitHub

Khi bạn tạo Application trên Cloudflare Dashboard (`Workers & Pages` -> `Create application` -> `Connect to Git`):

| Mục trên Cloudflare | Giá trị thiết lập | Ghi chú |
| :--- | :--- | :--- |
| **Project name** | `ten-ung-dung` | Tên Worker của bạn |
| **Production branch** | `main` | Nhánh Git chính |
| **Build command** | *(Để trống hoàn toàn)* | Không cần build do dùng JS thuần |
| **Deploy command** | `npx wrangler deploy` | Lệnh deploy chuẩn của Worker |
| **Root directory** | `/` | Thư mục gốc chứa `wrangler.toml` |

---

## 💾 5. Hướng dẫn làm việc với Cloudflare D1 Database

1. **Tạo Database mới trên Cloudflare:**
   ```bash
   npx wrangler d1 create ten-database-d1
   ```
   *Copy dòng `database_id` sinh ra dán vào file `wrangler.toml`.*

2. **Tạo bảng và nạp cấu trúc từ file `schema.sql`:**
   * Test trên máy cục bộ (Local):
     ```bash
     npx wrangler d1 execute ten-database-d1 --file=./schema.sql --local
     ```
   * Cập nhật trực tiếp lên Cloudflare trên mây (Production):
     ```bash
     npx wrangler d1 execute ten-database-d1 --file=./schema.sql --remote
     ```

---

## 🔄 6. Quy trình làm việc hàng ngày (3 bước tự động)

Mỗi khi bạn sửa code, chỉ cần chạy các lệnh Git sau (hoặc click file `push_to_github.bat`):
```bash
git add .
git commit -m "feat: cập nhật tính năng mới"
git push origin main
```
$\rightarrow$ **Cloudflare tự động kéo code về và cập nhật ứng dụng sau 10 giây!**
