/**
 * MÁY CHỦ PHÁT TRIỂN LOCALHOST - KHÔNG CẦN CÀI THƯ VIỆN BÊN NGOÀI
 * Sử dụng trực tiếp Node.js 22+ (tích hợp sẵn node:sqlite và fetch/Request/Response)
 * Giả lập chuẩn xác môi trường Cloudflare D1 & Static Assets để chạy src/index.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from './src/index.js';

const PORT = 8787;
const DB_FILE = path.resolve('pxk_local.db');
const SCHEMA_FILE = path.resolve('schema.sql');
const FRONTEND_DIR = path.resolve('frontend');

// 1. Khởi tạo SQLite Database cục bộ
const sqlite = new DatabaseSync(DB_FILE);

// Khởi tạo bảng nếu chưa có
if (fs.existsSync(SCHEMA_FILE)) {
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  sqlite.exec(schemaSql);
  try {
    sqlite.exec(`ALTER TABLE phieu ADD COLUMN dia_chi_cty TEXT DEFAULT 'A8/21c, Bông Văn Dĩa, Xã Tân Nhựt, TP HCM';`);
  } catch (e) {
    // Cột đã tồn tại
  }
  try {
    sqlite.exec(`ALTER TABLE phieu ADD COLUMN don_hang TEXT DEFAULT '';`);
  } catch (e) {
    // Cột đã tồn tại
  }
  try {
    sqlite.exec(`ALTER TABLE phieu ADD COLUMN bo_phan_xuat TEXT DEFAULT '';`);
  } catch (e) {
    // Cột đã tồn tại
  }
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS so_phieu_counter (ma_bo_phan TEXT PRIMARY KEY, max_seq INTEGER DEFAULT 0);`);
  } catch (e) {
    // Bảng đã tồn tại
  }
  console.log('✓ Đã nạp cấu trúc database từ schema.sql');
}

// 2. Giả lập Cloudflare D1 Database API
const fakeD1 = {
  prepare(sql) {
    return {
      _params: [],
      bind(...params) {
        this._params = params;
        return this;
      },
      async all() {
        const stmt = sqlite.prepare(sql);
        const results = stmt.all(...this._params);
        return { results };
      },
      async first() {
        const stmt = sqlite.prepare(sql);
        const results = stmt.all(...this._params);
        return results[0] || null;
      },
      async run() {
        const stmt = sqlite.prepare(sql);
        const info = stmt.run(...this._params);
        return {
          meta: {
            last_row_id: info.lastInsertRowid,
            changes: info.changes,
          },
        };
      },
    };
  },
};

// 3. MIME Types cho file tĩnh
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 4. Giả lập Cloudflare Assets
const fakeAssets = {
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    const filePath = path.join(FRONTEND_DIR, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      return new Response(content, {
        status: 200,
        headers: { 'Content-Type': mime },
      });
    }

    return new Response('File not found', { status: 404 });
  },
};

// 5. Khởi tạo HTTP Server
const server = http.createServer(async (req, res) => {
  const fullUrl = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
  
  // Đọc body của request
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);

  // Tạo đối tượng Web Standard Request
  const webRequest = new Request(fullUrl, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer,
  });

  const env = {
    DB: fakeD1,
    ASSETS: fakeAssets,
  };

  try {
    const webResponse = await worker.fetch(webRequest, env, {});
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const resArrayBuffer = await webResponse.arrayBuffer();
    res.end(Buffer.from(resArrayBuffer));
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`Internal Server Error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 WEB PHIẾU XUẤT KHO D&D LONG AN ĐANG CHẠY CỤC BỘ:`);
  console.log(`👉 Truy cập tại: http://localhost:${PORT}`);
  console.log(`💾 Cơ sở dữ liệu: ${DB_FILE} (SQLite nội bộ)`);
  console.log('====================================================');
});
