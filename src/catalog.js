/**
 * DANH MỤC: KHÁCH HÀNG, PO / ĐƠN HÀNG / ĐƠN GIÁ, BỘ CHI TIẾT
 * + Tự động nâng cấp database (tạo bảng / thêm cột) ở lần chạy đầu tiên
 */

let schemaReady = false;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS khach_hang (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten_ngan TEXT NOT NULL,
    ten_day_du TEXT DEFAULT '',
    day_size TEXT DEFAULT '[]',
    bo_phan TEXT DEFAULT '[]',
    bo_phan_xuat TEXT DEFAULT '',
    ly_do_xuat TEXT DEFAULT '',
    dvt TEXT DEFAULT 'Đôi',
    co_bo_chi_tiet INTEGER DEFAULT 0,
    thu_tu INTEGER DEFAULT 0,
    an INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS po_don_hang (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    khach_hang_id INTEGER,
    po TEXT DEFAULT '',
    don_hang TEXT DEFAULT '',
    art TEXT DEFAULT '',
    mau TEXT DEFAULT '',
    don_gia REAL DEFAULT 0,
    ghi_chu TEXT DEFAULT '',
    tao_luc DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_po_kh ON po_don_hang(khach_hang_id, po)`,
  `CREATE TABLE IF NOT EXISTS bo_chi_tiet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    khach_hang_id INTEGER,
    ten_bo TEXT NOT NULL,
    art TEXT DEFAULT '',
    chi_tiet TEXT DEFAULT '[]',
    thu_tu INTEGER DEFAULT 0
  )`,
];

const ALTER_STATEMENTS = [
  `ALTER TABLE phieu ADD COLUMN khach_hang_id INTEGER`,
  `ALTER TABLE phieu ADD COLUMN don_hang TEXT DEFAULT ''`,
  `ALTER TABLE phieu ADD COLUMN bo_phan_xuat TEXT DEFAULT ''`,
  `ALTER TABLE phieu ADD COLUMN nguoi_giao TEXT DEFAULT ''`,
  `ALTER TABLE phieu_dong ADD COLUMN loai TEXT DEFAULT ''`,
  `ALTER TABLE phieu_dong ADD COLUMN he_so REAL DEFAULT 0`,
];

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

const SEED_CUSTOMERS = [
  {
    ma: 'LT', ten_ngan: 'Liên Thái', ten_day_du: 'Công ty TNHH Công Nghiệp Liên Thái',
    day_size: [{ ten: '35 - 46', sizes: range(35, 46) }],
    bo_phan: ['CMA', 'CMB', 'CMC'], bo_phan_xuat: 'Chuyền may', ly_do_xuat: 'Giao thành phẩm',
    dvt: 'Đôi', co_bo_chi_tiet: 0, thu_tu: 1,
  },
  {
    ma: 'JIAYU', ten_ngan: 'JiaYu', ten_day_du: 'Công ty TNHH Giày JiaYu',
    day_size: [{ ten: '36 - 43', sizes: range(36, 43) }],
    bo_phan: ['TC'], bo_phan_xuat: 'Tổ chặt', ly_do_xuat: 'Giao BTP Chặt',
    dvt: 'Miếng', co_bo_chi_tiet: 1, thu_tu: 2,
  },
  {
    ma: 'KURIM', ten_ngan: 'Kurim', ten_day_du: 'Công ty TNHH Kurim Việt Nam',
    day_size: [
      { ten: 'Dãy A', sizes: ['3-4', '4T-5T', '6-7', '7T-8T', '9-10', '10T-11T'] },
      { ten: 'Dãy B', sizes: ['3-5T', '6-8T', '9-11T'] },
    ],
    bo_phan: ['TC'], bo_phan_xuat: 'Tổ chặt', ly_do_xuat: 'Giao BTP Chặt',
    dvt: 'Đôi', co_bo_chi_tiet: 0, thu_tu: 3,
  },
];

const SEED_JIAYU_SET = {
  ten_bo: 'CP-002', art: 'CP-002',
  chi_tiet: ['Mũi trong', 'Mũi ngoài', 'Quai trong', 'Quai ngoài', 'Quai hậu', 'Dây TT khoen']
    .map(ten => ({ ten, he_so: 2, dvt: 'Miếng' })),
};

export async function ensureSchema(env) {
  if (schemaReady) return;
  for (const sql of SCHEMA_STATEMENTS) {
    await env.DB.prepare(sql).run();
  }
  for (const sql of ALTER_STATEMENTS) {
    try { await env.DB.prepare(sql).run(); } catch (_) { /* cột đã có */ }
  }

  // Dữ liệu khởi tạo: chỉ chạy 1 lần duy nhất
  const seeded = await env.DB.prepare(`SELECT v FROM app_meta WHERE k = 'seed_v1'`).first();
  if (!seeded) {
    await env.DB.prepare(`INSERT OR IGNORE INTO bo_phan (ma, ten, thu_tu) VALUES ('CMC', 'Chuyền may C', 4)`).run();
    for (const c of SEED_CUSTOMERS) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO khach_hang (ma, ten_ngan, ten_day_du, day_size, bo_phan, bo_phan_xuat, ly_do_xuat, dvt, co_bo_chi_tiet, thu_tu)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(c.ma, c.ten_ngan, c.ten_day_du, JSON.stringify(c.day_size), JSON.stringify(c.bo_phan),
        c.bo_phan_xuat, c.ly_do_xuat, c.dvt, c.co_bo_chi_tiet, c.thu_tu).run();
    }
    const jy = await env.DB.prepare(`SELECT id FROM khach_hang WHERE ma = 'JIAYU'`).first();
    if (jy) {
      await env.DB.prepare(`INSERT INTO bo_chi_tiet (khach_hang_id, ten_bo, art, chi_tiet) VALUES (?, ?, ?, ?)`)
        .bind(jy.id, SEED_JIAYU_SET.ten_bo, SEED_JIAYU_SET.art, JSON.stringify(SEED_JIAYU_SET.chi_tiet)).run();
    }
    // Gán khách hàng cho phiếu cũ dựa vào "Đơn vị nhận"
    await env.DB.prepare(`
      UPDATE phieu SET khach_hang_id = (
        SELECT k.id FROM khach_hang k
        WHERE phieu.don_vi_nhan = k.ten_day_du OR phieu.don_vi_nhan LIKE '%' || k.ten_ngan || '%'
        ORDER BY k.thu_tu LIMIT 1
      ) WHERE khach_hang_id IS NULL
    `).run();
    await env.DB.prepare(`INSERT OR REPLACE INTO app_meta (k, v) VALUES ('seed_v1', '1')`).run();
  }
  schemaReady = true;
}

/** Tìm khách hàng theo tên đơn vị nhận (khi phiếu không chọn khách) */
export async function guessKhachHangId(env, donViNhan) {
  if (!donViNhan) return null;
  const row = await env.DB.prepare(`
    SELECT id FROM khach_hang
    WHERE ? = ten_day_du OR ? LIKE '%' || ten_ngan || '%'
    ORDER BY thu_tu LIMIT 1
  `).bind(donViNhan, donViNhan).first();
  return row ? row.id : null;
}

const parseJson = (s, fallback) => { try { return JSON.parse(s || ''); } catch (_) { return fallback; } };
// num: số đã là number giữ nguyên (tránh 12.5 -> "125" khi lưu lại đơn giá thập phân), chuỗi đọc theo kiểu Việt Nam
import { num } from './ddl.js';

function khachFromRow(r) {
  return { ...r, day_size: parseJson(r.day_size, []), bo_phan: parseJson(r.bo_phan, []) };
}

function khachBind(b) {
  return [
    String(b.ten_ngan || '').trim(),
    String(b.ten_day_du || '').trim(),
    JSON.stringify(Array.isArray(b.day_size) ? b.day_size : []),
    JSON.stringify(Array.isArray(b.bo_phan) ? b.bo_phan : []),
    b.bo_phan_xuat || '',
    b.ly_do_xuat || '',
    b.dvt || 'Đôi',
    b.co_bo_chi_tiet ? 1 : 0,
    parseInt(b.thu_tu, 10) || 0,
    b.an ? 1 : 0,
  ];
}

/**
 * Router cho các API danh mục. Trả về null nếu không khớp đường dẫn.
 */
export async function handleCatalogApi(path, method, url, request, env) {
  // ---------------- KHÁCH HÀNG ----------------
  if (path === '/api/khachhang' && method === 'GET') {
    const all = url.searchParams.get('all') === '1';
    const { results } = await env.DB.prepare(
      `SELECT * FROM khach_hang ${all ? '' : 'WHERE an = 0'} ORDER BY thu_tu, id`
    ).all();
    return Response.json({ success: true, data: results.map(khachFromRow) });
  }

  if (path === '/api/khachhang' && method === 'POST') {
    const b = await request.json();
    if (!b.ten_ngan) return Response.json({ success: false, error: 'Vui lòng nhập tên khách hàng' }, { status: 400 });
    const ma = String(b.ma || b.ten_ngan).trim().toUpperCase().replace(/\s+/g, '_');
    const dup = await env.DB.prepare('SELECT id FROM khach_hang WHERE ma = ?').bind(ma).first();
    if (dup) return Response.json({ success: false, error: `Mã khách hàng ${ma} đã tồn tại` }, { status: 400 });
    const res = await env.DB.prepare(`
      INSERT INTO khach_hang (ten_ngan, ten_day_du, day_size, bo_phan, bo_phan_xuat, ly_do_xuat, dvt, co_bo_chi_tiet, thu_tu, an, ma)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).bind(...khachBind(b), ma).first();
    return Response.json({ success: true, id: res.id, message: 'Đã thêm khách hàng' });
  }

  const khMatch = path.match(/^\/api\/khachhang\/(\d+)$/);
  if (khMatch && method === 'PUT') {
    const b = await request.json();
    await env.DB.prepare(`
      UPDATE khach_hang SET ten_ngan = ?, ten_day_du = ?, day_size = ?, bo_phan = ?, bo_phan_xuat = ?,
        ly_do_xuat = ?, dvt = ?, co_bo_chi_tiet = ?, thu_tu = ?, an = ? WHERE id = ?
    `).bind(...khachBind(b), parseInt(khMatch[1], 10)).run();
    return Response.json({ success: true, message: 'Đã cập nhật khách hàng' });
  }

  // ---------------- PO / ĐƠN HÀNG / ĐƠN GIÁ ----------------
  if (path === '/api/po' && method === 'GET') {
    const kh = url.searchParams.get('khach_hang_id');
    const stmt = kh
      ? env.DB.prepare('SELECT * FROM po_don_hang WHERE khach_hang_id = ? ORDER BY id DESC').bind(parseInt(kh, 10))
      : env.DB.prepare('SELECT * FROM po_don_hang ORDER BY id DESC');
    const { results } = await stmt.all();
    return Response.json({ success: true, data: results });
  }

  // Thêm 1 hoặc nhiều dòng (dán từ Excel)
  if (path === '/api/po' && method === 'POST') {
    const b = await request.json();
    const items = Array.isArray(b.items) ? b.items : [b];
    const ids = [];
    for (const it of items) {
      if (!it.po && !it.art && !it.don_hang) continue;
      const res = await env.DB.prepare(`
        INSERT INTO po_don_hang (khach_hang_id, po, don_hang, art, mau, don_gia, ghi_chu) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
      `).bind(parseInt(it.khach_hang_id, 10) || null, String(it.po || '').trim(), String(it.don_hang || '').trim(),
        String(it.art || '').trim(), String(it.mau || '').trim(), num(it.don_gia), String(it.ghi_chu || '').trim()).first();
      ids.push(res.id);
    }
    return Response.json({ success: true, ids, message: `Đã thêm ${ids.length} dòng PO` });
  }

  const poMatch = path.match(/^\/api\/po\/(\d+)$/);
  if (poMatch && method === 'PUT') {
    const it = await request.json();
    await env.DB.prepare(`
      UPDATE po_don_hang SET khach_hang_id = ?, po = ?, don_hang = ?, art = ?, mau = ?, don_gia = ?, ghi_chu = ? WHERE id = ?
    `).bind(parseInt(it.khach_hang_id, 10) || null, String(it.po || '').trim(), String(it.don_hang || '').trim(),
      String(it.art || '').trim(), String(it.mau || '').trim(), num(it.don_gia), String(it.ghi_chu || '').trim(),
      parseInt(poMatch[1], 10)).run();
    return Response.json({ success: true });
  }
  if (poMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM po_don_hang WHERE id = ?').bind(parseInt(poMatch[1], 10)).run();
    return Response.json({ success: true });
  }

  // ---------------- BỘ CHI TIẾT ----------------
  if (path === '/api/bochitiet' && method === 'GET') {
    const kh = url.searchParams.get('khach_hang_id');
    const stmt = kh
      ? env.DB.prepare('SELECT * FROM bo_chi_tiet WHERE khach_hang_id = ? ORDER BY thu_tu, id').bind(parseInt(kh, 10))
      : env.DB.prepare('SELECT * FROM bo_chi_tiet ORDER BY khach_hang_id, thu_tu, id');
    const { results } = await stmt.all();
    return Response.json({ success: true, data: results.map(r => ({ ...r, chi_tiet: parseJson(r.chi_tiet, []) })) });
  }

  if (path === '/api/bochitiet' && method === 'POST') {
    const b = await request.json();
    if (!b.ten_bo) return Response.json({ success: false, error: 'Vui lòng nhập tên bộ' }, { status: 400 });
    const res = await env.DB.prepare(`
      INSERT INTO bo_chi_tiet (khach_hang_id, ten_bo, art, chi_tiet, thu_tu) VALUES (?, ?, ?, ?, ?) RETURNING id
    `).bind(parseInt(b.khach_hang_id, 10) || null, String(b.ten_bo).trim(), String(b.art || '').trim(),
      JSON.stringify(b.chi_tiet || []), parseInt(b.thu_tu, 10) || 0).first();
    return Response.json({ success: true, id: res.id, message: 'Đã thêm bộ chi tiết' });
  }

  const boMatch = path.match(/^\/api\/bochitiet\/(\d+)$/);
  if (boMatch && method === 'PUT') {
    const b = await request.json();
    await env.DB.prepare(`
      UPDATE bo_chi_tiet SET khach_hang_id = ?, ten_bo = ?, art = ?, chi_tiet = ?, thu_tu = ? WHERE id = ?
    `).bind(parseInt(b.khach_hang_id, 10) || null, String(b.ten_bo || '').trim(), String(b.art || '').trim(),
      JSON.stringify(b.chi_tiet || []), parseInt(b.thu_tu, 10) || 0, parseInt(boMatch[1], 10)).run();
    return Response.json({ success: true, message: 'Đã cập nhật bộ chi tiết' });
  }
  if (boMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM bo_chi_tiet WHERE id = ?').bind(parseInt(boMatch[1], 10)).run();
    return Response.json({ success: true });
  }

  // ---------------- CÔNG NỢ THEO KHÁCH HÀNG ----------------
  // Bảng kê: mỗi dòng = 1 phiếu × PO × ART. Không tính dòng chi tiết (JiaYu) - chỉ tính dòng đồng bộ đôi.
  if (path === '/api/congno' && method === 'GET') {
    const tuNgay = url.searchParams.get('tu_ngay');
    const denNgay = url.searchParams.get('den_ngay');
    const kh = url.searchParams.get('khach_hang_id');
    let where = "p.trang_thai != 'cancelled' AND COALESCE(d.loai, '') NOT IN ('chi_tiet', 'khong_size')";
    const params = [];
    if (tuNgay) { where += ' AND p.ngay >= ?'; params.push(tuNgay); }
    if (denNgay) { where += ' AND p.ngay <= ?'; params.push(denNgay); }
    if (kh === 'none') where += ' AND p.khach_hang_id IS NULL';
    else if (kh && kh !== 'all') { where += ' AND p.khach_hang_id = ?'; params.push(parseInt(kh, 10)); }

    const simpleSql = `
      SELECT p.khach_hang_id, p.ngay, p.so_phieu, p.ma_bo_phan, p.don_hang,
        d.ma_hang AS po, d.mau AS art, d.sl_chung_tu AS sl, d.thanh_tien AS tt, d.don_gia AS dg
      FROM phieu p JOIN phieu_dong d ON p.id = d.phieu_id
      WHERE ${where}
      ORDER BY p.ngay, p.so_phieu, d.stt
    `;
    const stmt = env.DB.prepare(simpleSql);
    const { results } = await (params.length ? stmt.bind(...params) : stmt).all();

    // Bảng giá: ưu tiên khớp cả PO + ART, sau đó chỉ PO, rồi chỉ ART
    const { results: catalogRows } = await env.DB.prepare(
      'SELECT khach_hang_id, po, art, don_gia, don_hang FROM po_don_hang ORDER BY id DESC'
    ).all();
    const prices = catalogRows.filter(c => c.don_gia > 0);
    const findDonHang = (kh, po) => {
      const hit = po && catalogRows.find(c => c.khach_hang_id === kh && c.po === po && c.don_hang);
      return hit ? hit.don_hang : '';
    };
    const findPrice = (kh, po, art) => {
      let best = 0, bestScore = 0;
      for (const c of prices) {
        if (c.khach_hang_id !== kh || (!c.po && !c.art)) continue;
        if (c.po && c.po !== po) continue;
        if (c.art && c.art !== art) continue;
        const score = (c.po ? 2 : 0) + (c.art ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = c.don_gia; }
      }
      return best;
    };
    for (const r of results) r.gia = r.dg > 0 ? r.dg : findPrice(r.khach_hang_id, r.po || '', r.art || '');

    // Gom nhóm theo phiếu × PO × ART
    const map = new Map();
    for (const r of results) {
      const key = `${r.so_phieu}__${r.po}__${r.art}`;
      const amount = r.tt > 0 ? r.tt : (r.sl || 0) * (r.gia || 0);
      if (!map.has(key)) {
        map.set(key, {
          khach_hang_id: r.khach_hang_id, ngay: r.ngay, so_phieu: r.so_phieu, ma_bo_phan: r.ma_bo_phan,
          don_hang: findDonHang(r.khach_hang_id, r.po) || r.don_hang, po: r.po, art: r.art, so_luong: 0, don_gia: 0, thanh_tien: 0, sl_chua_gia: 0,
        });
      }
      const g = map.get(key);
      g.so_luong += r.sl || 0;
      g.thanh_tien += amount;
      if (r.gia > g.don_gia) g.don_gia = r.gia;
      if (!(r.gia > 0) && !(r.tt > 0)) g.sl_chua_gia += r.sl || 0;
    }
    return Response.json({ success: true, data: [...map.values()] });
  }

  return null;
}
