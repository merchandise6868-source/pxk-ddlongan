/**
 * Hàm dùng chung cho các module mới (tài khoản, đơn hàng, chỉ lệnh).
 * Chạy được cả Cloudflare D1 (SQLite) lẫn CockroachDB (lớp d1Compat trong db.js).
 */

// D1 có hàm batch/exec; lớp CockroachDB thì không
export const isSqlite = env => typeof env.DB.batch === 'function' || typeof env.DB.exec === 'function';

/** Kiểu cột theo loại database */
export function ddlTypes(sqlite) {
  return {
    id: t => (sqlite ? 'id INTEGER PRIMARY KEY AUTOINCREMENT' : `id INT8 PRIMARY KEY DEFAULT nextval('${t}_id_seq')`),
    seqs: tables => (sqlite ? [] : tables.map(t => `CREATE SEQUENCE IF NOT EXISTS ${t}_id_seq`)),
    INT: sqlite ? 'INTEGER' : 'INT8',
    REAL: sqlite ? 'REAL' : 'FLOAT8',
    TS: sqlite ? 'DATETIME DEFAULT CURRENT_TIMESTAMP' : 'TIMESTAMP DEFAULT now()',
  };
}

/**
 * Tạo bảng khi cần: thử 1 câu truy vấn nhẹ chạm tới bảng/cột mới nhất của module,
 * lỗi (chưa có bảng) thì mới chạy toàn bộ DDL. Mỗi isolate chỉ kiểm tra 1 lần.
 */
const readyKeys = new Set();
export async function ensureTables(env, key, probeSql, statements) {
  if (readyKeys.has(key)) return;
  try {
    await env.DB.prepare(probeSql).all();
  } catch (_) {
    for (const s of statements) {
      try { await env.DB.prepare(s).run(); } catch (err) {
        // ALTER TABLE ADD COLUMN trên SQLite báo lỗi nếu cột đã có -> bỏ qua
        if (!/^\s*ALTER/i.test(s)) throw err;
      }
    }
  }
  readyKeys.add(key);
}

/* ---------------- Tiện ích chung ---------------- */
export const str = v => String(v ?? '').trim();
export const int = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
/** Số kiểu Việt Nam: "1.250,5" -> 1250.5 */
export const num = v => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
export const parseJson = (s, fb) => { try { return JSON.parse(s || ''); } catch (_) { return fb; } };
/** Chạy nhiều lệnh theo lô (mỗi lô 1 lần gọi D1, tránh vượt giới hạn số lệnh mỗi lần gọi) */
export async function runBatch(env, stmts, size = 200) {
  const out = [];
  for (let k = 0; k < stmts.length; k += size) out.push(...await env.DB.batch(stmts.slice(k, k + size)));
  return out;
}
export const ok = (data = {}) => Response.json({ success: true, ...data });
export const bad = (error, status = 400) => Response.json({ success: false, error }, { status });

/** Ngày hôm nay theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD */
export const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** Khóa so khớp PO / ART: bỏ dấu, viết hoa, chỉ giữ chữ số + chữ cái + dấu "+" ("VB543 A-B" = "VB543-A-B") */
export const normKey = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'D').toUpperCase().replace(/[^A-Z0-9+]/g, '');

/** Chuẩn hóa nhãn size: viết hoa, bỏ khoảng trắng, "," -> ".", bỏ ".0" (39,0 = 39) */
export const normSize = v => String(v ?? '').toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/\.0+$/, '');
