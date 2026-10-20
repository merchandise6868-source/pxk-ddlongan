/**
 * NHẬP KHO - D&D LONG AN
 * 5 loại hàng: 1 Công cụ dụng cụ · 2 Nguyên phụ liệu may · 3 Vật tư chặt · 4 Thành phẩm mũ giày · 5 Thành phẩm chặt
 * Loại 3-5 quản lý theo Đơn vị giao -> Khách hàng -> PO -> Mã hàng.
 *
 * Chỉ THÊM bảng mới (don_vi_giao, vat_tu, phieu_nhap, phieu_nhap_dong, phieu_nhap_dong_size),
 * không sửa bảng cũ. Chạy được cả trên Cloudflare D1 (SQLite) lẫn CockroachDB (PostgreSQL).
 */

const LOAI = {
  1: { ma: 'CC', ten: 'Công cụ dụng cụ sản xuất' },
  2: { ma: 'NPL', ten: 'Nguyên phụ liệu may' },
  3: { ma: 'VTC', ten: 'Vật tư chặt' },
  4: { ma: 'TPM', ten: 'Thành phẩm mũ giày' },
  5: { ma: 'TPC', ten: 'Thành phẩm chặt' },
};

const TABLES = ['don_vi_giao', 'vat_tu', 'phieu_nhap', 'phieu_nhap_dong', 'phieu_nhap_dong_size'];

function schemaFor(sqlite) {
  const id = t => sqlite ? 'id INTEGER PRIMARY KEY AUTOINCREMENT' : `id INT8 PRIMARY KEY DEFAULT nextval('${t}_id_seq')`;
  const INT = sqlite ? 'INTEGER' : 'INT8';
  const REAL = sqlite ? 'REAL' : 'FLOAT8';
  const TS = sqlite ? 'DATETIME DEFAULT CURRENT_TIMESTAMP' : 'TIMESTAMP DEFAULT now()';
  return [
    ...(sqlite ? [] : TABLES.map(t => `CREATE SEQUENCE IF NOT EXISTS ${t}_id_seq`)),
    `CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)`,
    `CREATE TABLE IF NOT EXISTS don_vi_giao (
      ${id('don_vi_giao')},
      ten TEXT NOT NULL,
      phan_loai TEXT DEFAULT 'gia_cong',
      muc TEXT DEFAULT '[]',
      khach_hang_ids TEXT DEFAULT '[]',
      sdt TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      thu_tu ${INT} DEFAULT 0,
      an ${INT} DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS vat_tu (
      ${id('vat_tu')},
      nhom ${INT} NOT NULL,
      ten TEXT NOT NULL,
      dvt TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      an ${INT} DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS phieu_nhap (
      ${id('phieu_nhap')},
      so_phieu TEXT UNIQUE NOT NULL,
      loai ${INT} NOT NULL,
      ngay TEXT NOT NULL,
      don_vi_giao_id ${INT},
      don_vi_giao_ten TEXT DEFAULT '',
      nguoi_giao TEXT DEFAULT '',
      nguoi_nhap TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      tong_sl ${REAL} DEFAULT 0,
      tao_luc ${TS}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pn_ngay ON phieu_nhap(loai, ngay)`,
    `CREATE TABLE IF NOT EXISTS phieu_nhap_dong (
      ${id('phieu_nhap_dong')},
      phieu_nhap_id ${INT} NOT NULL,
      thu_tu ${INT} DEFAULT 0,
      khach_hang_id ${INT},
      po TEXT DEFAULT '',
      ma_hang TEXT DEFAULT '',
      ten_hang TEXT DEFAULT '',
      dvt TEXT DEFAULT '',
      so_luong ${REAL} DEFAULT 0,
      ghi_chu TEXT DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pnd_phieu ON phieu_nhap_dong(phieu_nhap_id)`,
    `CREATE TABLE IF NOT EXISTS phieu_nhap_dong_size (
      ${id('phieu_nhap_dong_size')},
      dong_id ${INT} NOT NULL,
      size TEXT NOT NULL,
      so_luong ${REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pnds_dong ON phieu_nhap_dong_size(dong_id)`,
  ];
}

let ready = false;
async function ensureNhapKhoSchema(env) {
  if (ready) return;
  // Cloudflare D1 có hàm batch/exec; lớp CockroachDB (db.js) thì không
  const sqlite = typeof env.DB.batch === 'function' || typeof env.DB.exec === 'function';
  for (const sql of schemaFor(sqlite)) await env.DB.prepare(sql).run();

  // Dữ liệu ban đầu: Kurim & JiaYu giao vật tư chặt (chạy 1 lần)
  const seeded = await env.DB.prepare(`SELECT v FROM app_meta WHERE k = 'nhapkho_seed_v1'`).first();
  if (!seeded) {
    const { results: khs } = await env.DB.prepare(`SELECT id, ma, ten_ngan FROM khach_hang WHERE ma IN ('KURIM', 'JIAYU')`).all();
    for (const k of khs) {
      await env.DB.prepare(`INSERT INTO don_vi_giao (ten, phan_loai, muc, khach_hang_ids, thu_tu) VALUES (?, 'khach_hang', '[3]', ?, ?)`)
        .bind(k.ten_ngan, JSON.stringify([k.id]), k.ma === 'KURIM' ? 1 : 2).run();
    }
    await env.DB.prepare(`INSERT INTO app_meta (k, v) VALUES ('nhapkho_seed_v1', '1') ON CONFLICT (k) DO NOTHING`).run();
  }
  ready = true;
}

const parseJson = (s, fb) => { try { return JSON.parse(s || ''); } catch (_) { return fb; } };
const num = v => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const str = v => String(v ?? '').trim();
const int = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
const ok = (data = {}) => Response.json({ success: true, ...data });
const bad = (error, status = 400) => Response.json({ success: false, error }, { status });

const dvgTrung = async (env, ten, id) => {
  // So sánh không phân biệt hoa thường bằng JS (LOWER của SQLite không xử lý chữ có dấu như Đ/đ)
  const key = str(ten).toLocaleLowerCase('vi');
  const { results } = await env.DB.prepare('SELECT id, ten FROM don_vi_giao').all();
  return results.some(r => r.id !== (id || 0) && String(r.ten).trim().toLocaleLowerCase('vi') === key);
};
const dvgFromRow = r => ({ ...r, muc: parseJson(r.muc, []), khach_hang_ids: parseJson(r.khach_hang_ids, []) });

/** Số phiếu: NK-TPM-2610-001 (loại - năm tháng - số thứ tự trong tháng) */
async function nextSoPhieu(env, loai, ngay) {
  const d = /^\d{4}-\d{2}/.test(ngay || '') ? ngay : new Date().toISOString().slice(0, 10);
  const prefix = `NK-${LOAI[loai].ma}-${d.slice(2, 4)}${d.slice(5, 7)}-`;
  const { results } = await env.DB.prepare('SELECT so_phieu FROM phieu_nhap WHERE so_phieu LIKE ?').bind(prefix + '%').all();
  let max = 0;
  for (const r of results) {
    const n = parseInt(String(r.so_phieu).slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function saveLines(env, phieuId, loai, lines) {
  let tong = 0;
  let i = 0;
  for (const l of lines) {
    const sizes = (Array.isArray(l.sizes) ? l.sizes : [])
      .map(s => ({ size: str(s.size), so_luong: num(s.so_luong) }))
      .filter(s => s.size && s.so_luong);
    const sl = sizes.length ? sizes.reduce((a, s) => a + s.so_luong, 0) : num(l.so_luong);
    const coNoiDung = sl || str(l.ten_hang) || str(l.po) || str(l.ma_hang);
    if (!coNoiDung) continue;
    const row = await env.DB.prepare(`
      INSERT INTO phieu_nhap_dong (phieu_nhap_id, thu_tu, khach_hang_id, po, ma_hang, ten_hang, dvt, so_luong, ghi_chu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).bind(phieuId, ++i, loai >= 3 ? int(l.khach_hang_id) : null, loai >= 3 ? str(l.po) : '',
      loai >= 3 ? str(l.ma_hang) : '', str(l.ten_hang), str(l.dvt), sl, str(l.ghi_chu)).first();
    for (const s of sizes) {
      await env.DB.prepare('INSERT INTO phieu_nhap_dong_size (dong_id, size, so_luong) VALUES (?, ?, ?) RETURNING id')
        .bind(row.id, s.size, s.so_luong).first();
    }
    tong += sl;
  }
  await env.DB.prepare('UPDATE phieu_nhap SET tong_sl = ? WHERE id = ?').bind(tong, phieuId).run();
  return { tong, soDong: i };
}

async function deleteLines(env, phieuId) {
  await env.DB.prepare('DELETE FROM phieu_nhap_dong_size WHERE dong_id IN (SELECT id FROM phieu_nhap_dong WHERE phieu_nhap_id = ?)').bind(phieuId).run();
  await env.DB.prepare('DELETE FROM phieu_nhap_dong WHERE phieu_nhap_id = ?').bind(phieuId).run();
}

function validateHeader(b) {
  const loai = int(b.loai);
  if (!LOAI[loai]) return 'Chưa chọn loại hàng nhập';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b.ngay))) return 'Chưa chọn ngày nhập';
  if (loai >= 3 && !int(b.don_vi_giao_id)) return 'Chưa chọn đơn vị giao hàng';
  const lines = Array.isArray(b.lines) ? b.lines : [];
  if (!lines.length) return 'Phiếu chưa có dòng hàng nào';
  if (loai >= 3) {
    const thieu = lines.findIndex(l => !int(l.khach_hang_id) || !str(l.po));
    if (thieu > -1) return `Dòng ${thieu + 1}: chưa chọn khách hàng hoặc PO`;
  }
  return null;
}

async function dvgName(env, b) {
  const id = int(b.don_vi_giao_id);
  if (!id) return str(b.don_vi_giao_ten);
  const r = await env.DB.prepare('SELECT ten FROM don_vi_giao WHERE id = ?').bind(id).first();
  return r ? r.ten : str(b.don_vi_giao_ten);
}

/** Bộ lọc dùng chung cho danh sách & tổng hợp */
function buildFilter(url) {
  const p = url.searchParams;
  let where = ' WHERE 1=1';
  const params = [];
  const loai = int(p.get('loai'));
  if (loai) { where += ' AND pn.loai = ?'; params.push(loai); }
  if (p.get('tu_ngay')) { where += ' AND pn.ngay >= ?'; params.push(p.get('tu_ngay')); }
  if (p.get('den_ngay')) { where += ' AND pn.ngay <= ?'; params.push(p.get('den_ngay')); }
  const dvg = int(p.get('don_vi_giao_id'));
  if (dvg) { where += ' AND pn.don_vi_giao_id = ?'; params.push(dvg); }
  return { where, params, p };
}

export async function handleNhapKhoApi(path, method, url, request, env) {
  if (!path.startsWith('/api/nhapkho/')) return null;
  await ensureNhapKhoSchema(env);

  // ---------------- ĐƠN VỊ GIAO HÀNG ----------------
  if (path === '/api/nhapkho/donvigiao' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM don_vi_giao ORDER BY an, thu_tu, ten').all();
    return ok({ data: results.map(dvgFromRow) });
  }
  const dvgBind = b => [str(b.ten), ['khach_hang', 'gia_cong', 'ncc'].includes(b.phan_loai) ? b.phan_loai : 'gia_cong',
    JSON.stringify((b.muc || []).map(int).filter(m => LOAI[m])), JSON.stringify((b.khach_hang_ids || []).map(int).filter(Boolean)),
    str(b.sdt), str(b.ghi_chu), int(b.thu_tu) || 0, b.an ? 1 : 0];
  if (path === '/api/nhapkho/donvigiao' && method === 'POST') {
    const b = await request.json();
    if (!str(b.ten)) return bad('Chưa nhập tên đơn vị giao');
    if (await dvgTrung(env, b.ten, 0)) return bad(`Đã có đơn vị giao tên "${str(b.ten)}"`);
    const r = await env.DB.prepare(`INSERT INTO don_vi_giao (ten, phan_loai, muc, khach_hang_ids, sdt, ghi_chu, thu_tu, an)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(...dvgBind(b)).first();
    return ok({ id: r.id, message: 'Đã thêm đơn vị giao' });
  }
  const dvgM = path.match(/^\/api\/nhapkho\/donvigiao\/(\d+)$/);
  if (dvgM && method === 'PUT') {
    const b = await request.json();
    if (!str(b.ten)) return bad('Chưa nhập tên đơn vị giao');
    if (await dvgTrung(env, b.ten, int(dvgM[1]))) return bad(`Đã có đơn vị giao tên "${str(b.ten)}"`);
    await env.DB.prepare(`UPDATE don_vi_giao SET ten = ?, phan_loai = ?, muc = ?, khach_hang_ids = ?, sdt = ?, ghi_chu = ?, thu_tu = ?, an = ? WHERE id = ?`)
      .bind(...dvgBind(b), int(dvgM[1])).run();
    return ok({ message: 'Đã cập nhật đơn vị giao' });
  }

  // ---------------- DANH MỤC VẬT TƯ (loại 1, 2, 3) ----------------
  if (path === '/api/nhapkho/vattu' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM vat_tu ORDER BY nhom, an, ten').all();
    return ok({ data: results });
  }
  if (path === '/api/nhapkho/vattu' && method === 'POST') {
    const b = await request.json();
    const items = Array.isArray(b.items) ? b.items : [b];
    const ids = [];
    for (const it of items) {
      const nhom = int(it.nhom);
      if (![1, 2, 3].includes(nhom) || !str(it.ten)) continue;
      const r = await env.DB.prepare('INSERT INTO vat_tu (nhom, ten, dvt, ghi_chu, an) VALUES (?, ?, ?, ?, ?) RETURNING id')
        .bind(nhom, str(it.ten), str(it.dvt), str(it.ghi_chu), it.an ? 1 : 0).first();
      ids.push(r.id);
    }
    return ok({ ids, message: `Đã thêm ${ids.length} vật tư` });
  }
  const vtM = path.match(/^\/api\/nhapkho\/vattu\/(\d+)$/);
  if (vtM && method === 'PUT') {
    const it = await request.json();
    if (!str(it.ten)) return bad('Chưa nhập tên vật tư');
    await env.DB.prepare('UPDATE vat_tu SET nhom = ?, ten = ?, dvt = ?, ghi_chu = ?, an = ? WHERE id = ?')
      .bind(int(it.nhom) || 1, str(it.ten), str(it.dvt), str(it.ghi_chu), it.an ? 1 : 0, int(vtM[1])).run();
    return ok();
  }
  if (vtM && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM vat_tu WHERE id = ?').bind(int(vtM[1])).run();
    return ok();
  }

  // ---------------- SỐ PHIẾU TIẾP THEO ----------------
  if (path === '/api/nhapkho/sophieu' && method === 'GET') {
    const loai = int(url.searchParams.get('loai'));
    if (!LOAI[loai]) return bad('Loại hàng không hợp lệ');
    return ok({ so_phieu: await nextSoPhieu(env, loai, url.searchParams.get('ngay')) });
  }

  // ---------------- PHIẾU NHẬP ----------------
  if (path === '/api/nhapkho/phieu' && method === 'GET') {
    const { where, params, p } = buildFilter(url);
    let sql = `SELECT pn.* FROM phieu_nhap pn ${where}`;
    const kh = int(p.get('khach_hang_id'));
    const q = str(p.get('q'));
    if (kh) { sql += ' AND pn.id IN (SELECT phieu_nhap_id FROM phieu_nhap_dong WHERE khach_hang_id = ?)'; params.push(kh); }
    if (q) {
      sql += ` AND (pn.so_phieu LIKE ? OR pn.don_vi_giao_ten LIKE ? OR pn.id IN (
        SELECT phieu_nhap_id FROM phieu_nhap_dong WHERE po LIKE ? OR ma_hang LIKE ? OR ten_hang LIKE ?))`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    sql += ' ORDER BY pn.ngay DESC, pn.id DESC LIMIT 300';
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    if (results.length) {
      const ids = results.map(r => r.id);
      const { results: lines } = await env.DB.prepare(
        `SELECT phieu_nhap_id, khach_hang_id, po, ma_hang, ten_hang FROM phieu_nhap_dong WHERE phieu_nhap_id IN (${ids.map(() => '?').join(',')}) ORDER BY thu_tu`
      ).bind(...ids).all();
      const map = new Map(ids.map(id => [id, []]));
      lines.forEach(l => map.get(l.phieu_nhap_id)?.push(l));
      results.forEach(r => { r.dong = map.get(r.id) || []; });
    }
    return ok({ data: results });
  }

  const pnM = path.match(/^\/api\/nhapkho\/phieu\/(\d+)$/);
  if (pnM && method === 'GET') {
    const id = int(pnM[1]);
    const phieu = await env.DB.prepare('SELECT * FROM phieu_nhap WHERE id = ?').bind(id).first();
    if (!phieu) return bad('Không tìm thấy phiếu nhập', 404);
    const { results: lines } = await env.DB.prepare('SELECT * FROM phieu_nhap_dong WHERE phieu_nhap_id = ? ORDER BY thu_tu, id').bind(id).all();
    const { results: sizes } = await env.DB.prepare(
      'SELECT dong_id, size, so_luong FROM phieu_nhap_dong_size WHERE dong_id IN (SELECT id FROM phieu_nhap_dong WHERE phieu_nhap_id = ?) ORDER BY id'
    ).bind(id).all();
    lines.forEach(l => { l.sizes = sizes.filter(s => s.dong_id === l.id).map(s => ({ size: s.size, so_luong: s.so_luong })); });
    phieu.lines = lines;
    return ok({ data: phieu });
  }

  if (path === '/api/nhapkho/phieu' && method === 'POST') {
    const b = await request.json();
    const err = validateHeader(b);
    if (err) return bad(err);
    const loai = int(b.loai);
    const ten = await dvgName(env, b);
    let so = str(b.so_phieu) || await nextSoPhieu(env, loai, b.ngay);
    const dup = await env.DB.prepare('SELECT id FROM phieu_nhap WHERE so_phieu = ?').bind(so).first();
    if (dup) so = await nextSoPhieu(env, loai, b.ngay);
    const r = await env.DB.prepare(`
      INSERT INTO phieu_nhap (so_phieu, loai, ngay, don_vi_giao_id, don_vi_giao_ten, nguoi_giao, nguoi_nhap, ghi_chu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).bind(so, loai, str(b.ngay), int(b.don_vi_giao_id), ten, str(b.nguoi_giao), str(b.nguoi_nhap), str(b.ghi_chu)).first();
    const { tong, soDong } = await saveLines(env, r.id, loai, b.lines);
    if (!soDong) {
      await env.DB.prepare('DELETE FROM phieu_nhap WHERE id = ?').bind(r.id).run();
      return bad('Phiếu chưa có dòng hàng nào có số lượng');
    }
    return ok({ id: r.id, so_phieu: so, tong_sl: tong, message: `Đã lưu phiếu nhập ${so}` });
  }

  if (pnM && method === 'PUT') {
    const id = int(pnM[1]);
    const b = await request.json();
    const err = validateHeader(b);
    if (err) return bad(err);
    const loai = int(b.loai);
    const so = str(b.so_phieu);
    if (so) {
      const dup = await env.DB.prepare('SELECT id FROM phieu_nhap WHERE so_phieu = ? AND id <> ?').bind(so, id).first();
      if (dup) return bad(`Số phiếu ${so} đã có, hãy đổi số khác`);
    }
    const ten = await dvgName(env, b);
    await env.DB.prepare(`
      UPDATE phieu_nhap SET so_phieu = COALESCE(NULLIF(?, ''), so_phieu), loai = ?, ngay = ?, don_vi_giao_id = ?, don_vi_giao_ten = ?,
        nguoi_giao = ?, nguoi_nhap = ?, ghi_chu = ? WHERE id = ?
    `).bind(so, loai, str(b.ngay), int(b.don_vi_giao_id), ten, str(b.nguoi_giao), str(b.nguoi_nhap), str(b.ghi_chu), id).run();
    await deleteLines(env, id);
    const { tong } = await saveLines(env, id, loai, b.lines);
    return ok({ id, tong_sl: tong, message: 'Đã cập nhật phiếu nhập' });
  }

  if (pnM && method === 'DELETE') {
    const id = int(pnM[1]);
    await deleteLines(env, id);
    await env.DB.prepare('DELETE FROM phieu_nhap WHERE id = ?').bind(id).run();
    return ok({ message: 'Đã xóa phiếu nhập' });
  }

  // ---------------- TỔNG HỢP NHẬP ----------------
  if (path === '/api/nhapkho/tonghop' && method === 'GET') {
    const { where, params, p } = buildFilter(url);
    let sql = `
      SELECT pn.loai, pn.don_vi_giao_ten, d.khach_hang_id, d.po, d.ma_hang, d.ten_hang, d.dvt,
             SUM(d.so_luong) AS tong_sl, COUNT(DISTINCT pn.id) AS so_phieu
      FROM phieu_nhap_dong d JOIN phieu_nhap pn ON pn.id = d.phieu_nhap_id ${where}`;
    const kh = int(p.get('khach_hang_id'));
    if (kh) { sql += ' AND d.khach_hang_id = ?'; params.push(kh); }
    const q = str(p.get('q'));
    if (q) { sql += ' AND (d.po LIKE ? OR d.ma_hang LIKE ? OR d.ten_hang LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ` GROUP BY pn.loai, pn.don_vi_giao_ten, d.khach_hang_id, d.po, d.ma_hang, d.ten_hang, d.dvt
             ORDER BY pn.loai, pn.don_vi_giao_ten, d.po, d.ma_hang, d.ten_hang LIMIT 1000`;
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return ok({ data: results });
  }

  return bad('API nhập kho không tồn tại', 404);
}
