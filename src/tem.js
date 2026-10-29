/**
 * TEM QR THEO ĐƠN HÀNG - D&D LONG AN
 * - In tem: mỗi tem = 1 PO/ART + 1 size, chia mỗi tem N đôi (mặc định 10: 29 -> 10·10·9). Loại 'may' (tổ CMA/CMB/CMC) hoặc 'chat' (TC).
 * - QR chỉ chứa mã tem (T2610-00001). Quét tem ở tab Lập phiếu xuất: tem thành số trên bảng size, lưu phiếu thì tem "đã xuất".
 * - Số thực có thể khác số in sẵn (chặt gom hàng, may bất quy tắc): sửa khi quét, lưu ở tem.so_luong, ghi lịch sử.
 * - Đang thử: chỉ admin (API /api/tem/* không có dòng RULES -> chỉ admin; tab-intem chưa nằm trong TABS).
 */
import { isSqlite, ddlTypes, ensureTables, str, int, num, ok, bad, todayVN, normSize, runBatch } from './ddl.js';
import { tienDo, ensureDonHangSchema } from './donhang.js';
import { forcedTo } from './tomay.js';

const ID_TABLES = ['tem', 'tem_lich_su'];
export const TABLES = ID_TABLES;
export function schemaFor(sqlite) {
  const T = ddlTypes(sqlite);
  return [
    ...T.seqs(ID_TABLES),
    `CREATE TABLE IF NOT EXISTS tem (
      ${T.id('tem')},
      ma_tem TEXT UNIQUE NOT NULL,
      loai TEXT DEFAULT 'may',
      khach_hang_id ${T.INT},
      po_id ${T.INT},
      po TEXT DEFAULT '',
      art TEXT DEFAULT '',
      mau TEXT DEFAULT '',
      size TEXT NOT NULL,
      so_luong_in ${T.REAL} DEFAULT 0,
      so_luong ${T.REAL} DEFAULT 0,
      stt ${T.INT} DEFAULT 1,
      tong ${T.INT} DEFAULT 1,
      ma_bo_phan TEXT DEFAULT '',
      lo_in ${T.INT},
      trang_thai TEXT DEFAULT 'moi',
      phieu_id ${T.INT},
      nguoi_in TEXT DEFAULT '',
      in_luc ${T.INT} DEFAULT 0,
      nguoi_quet TEXT DEFAULT '',
      quet_luc ${T.INT}
    )`,
    // Mẫu tem 50×40 (29/10/2026): ô Chi tiết (mặc định "Đồng bộ") + Người đóng gói (trống = viết tay)
    sqlite ? `ALTER TABLE tem ADD COLUMN chi_tiet TEXT DEFAULT ''` : `ALTER TABLE tem ADD COLUMN IF NOT EXISTS chi_tiet TEXT DEFAULT ''`,
    sqlite ? `ALTER TABLE tem ADD COLUMN nguoi_dg TEXT DEFAULT ''` : `ALTER TABLE tem ADD COLUMN IF NOT EXISTS nguoi_dg TEXT DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS idx_tem_po ON tem(po_id, size)`,
    `CREATE INDEX IF NOT EXISTS idx_tem_phieu ON tem(phieu_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tem_kh ON tem(khach_hang_id, trang_thai)`,
    `CREATE INDEX IF NOT EXISTS idx_tem_lo ON tem(lo_in)`,
    `CREATE TABLE IF NOT EXISTS tem_lich_su (
      ${T.id('tem_lich_su')},
      tem_id ${T.INT} NOT NULL,
      hanh_dong TEXT NOT NULL,
      sl_cu ${T.REAL},
      sl_moi ${T.REAL},
      phieu_id ${T.INT},
      nguoi TEXT DEFAULT '',
      luc ${T.INT} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_teml_tem ON tem_lich_su(tem_id)`,
  ];
}
export const ensureTemSchema = env => ensureTables(env, 'tem_v2', 'SELECT t.id, t.chi_tiet, t.nguoi_dg, l.id FROM tem t, tem_lich_su l WHERE 1 = 0', schemaFor(isSqlite(env)));

/** Tài khoản được dùng tem (in tem + quét vào phiếu). Đang thử: chỉ admin (tab-intem chưa cấp được cho nhóm) */
export const temOn = user => !!user && (user.la_admin || (user.tabs || []).includes('tab-intem'));

const MAX_TEM = 2000;
const cleanMa = v => str(v).toUpperCase().replace(/\s+/g, '');
const qs = list => list.map(() => '?').join(',');
/** Chia n đôi thành các tem mỗi tem tối đa `moi` đôi: 29, 10 -> [10, 10, 9] */
const chia = (n, moi) => { const r = []; for (let c = n; c > 0; c -= moi) r.push(Math.min(moi, c)); return r; };
const log = (env, temId, hanh, slCu, slMoi, phieuId, nguoi, luc) => env.DB.prepare(
  'INSERT INTO tem_lich_su (tem_id, hanh_dong, sl_cu, sl_moi, phieu_id, nguoi, luc) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .bind(temId, hanh, slCu ?? null, slMoi ?? null, phieuId ?? null, nguoi || '', luc);

/** Đọc tem theo danh sách id (chia nhỏ để không vượt giới hạn tham số D1) */
async function temsByIds(env, ids) {
  const out = [];
  for (let k = 0; k < ids.length; k += 90) {
    const part = ids.slice(k, k + 90);
    const { results } = await env.DB.prepare(`
      SELECT t.*, p.so_phieu, p.ngay AS phieu_ngay, p.trang_thai AS phieu_trang_thai
      FROM tem t LEFT JOIN phieu p ON p.id = t.phieu_id WHERE t.id IN (${qs(part)})`).bind(...part).all();
    out.push(...results);
  }
  return out;
}
const viDate = s => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
/** Tem đang nằm ở phiếu khác còn hiệu lực (phiếu đã hủy thì coi như tem rảnh) */
const busyElsewhere = (t, phieuId) => t.trang_thai === 'da_xuat' && t.phieu_id && t.phieu_id !== phieuId && t.phieu_trang_thai !== 'cancelled';

/**
 * Kiểm tem gửi kèm phiếu TRƯỚC khi ghi phiếu.
 * tems: [{ id, so_luong }] -> { err } hoặc { list: [{ id, so_luong }] } (bỏ trùng)
 */
export async function checkTems(env, khId, phieuId, tems) {
  await ensureTemSchema(env);
  const seen = new Map();
  for (const x of Array.isArray(tems) ? tems : []) {
    const id = int(x && x.id);
    if (!id || seen.has(id)) continue;
    const sl = num(x.so_luong);
    if (sl < 0) return { err: 'Số đôi của tem không được âm' };
    seen.set(id, sl);
  }
  if (!seen.size) return { list: [] };
  const rows = await temsByIds(env, [...seen.keys()]);
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const id of seen.keys()) {
    const t = byId.get(id);
    if (!t) return { err: 'Có tem không còn trong hệ thống – bỏ tem đó ra rồi lưu lại' };
    if (t.trang_thai === 'huy') return { err: `Tem ${t.ma_tem} đã bị hủy – bỏ tem đó ra rồi lưu lại` };
    if (khId && t.khach_hang_id && t.khach_hang_id !== khId) return { err: `Tem ${t.ma_tem} là của khách khác – bỏ tem đó ra rồi lưu lại` };
    if (busyElsewhere(t, phieuId)) return { err: `Tem ${t.ma_tem} đã xuất ở phiếu ${t.so_phieu || ''} ngày ${viDate(t.phieu_ngay)} – bỏ tem đó ra rồi lưu lại` };
  }
  return { list: [...seen].map(([id, so_luong]) => ({ id, so_luong })) };
}

/** Gắn tem vào phiếu sau khi ghi phiếu: tem bị bỏ khỏi phiếu trở về "chưa xuất", tem mới thành "đã xuất" */
export async function linkTems(env, phieuId, list, user) {
  await ensureTemSchema(env);
  const now = Date.now();
  const nguoi = user?.ho_ten || '';
  const { results: cu } = await env.DB.prepare('SELECT id, so_luong, so_luong_in FROM tem WHERE phieu_id = ?').bind(phieuId).all();
  const keep = new Set(list.map(x => x.id));
  const cuById = new Map(cu.map(t => [t.id, t]));
  const stmts = [];
  cu.filter(t => !keep.has(t.id)).forEach(t => {
    stmts.push(env.DB.prepare(`UPDATE tem SET trang_thai = 'moi', phieu_id = NULL, so_luong = so_luong_in, nguoi_quet = '', quet_luc = NULL WHERE id = ?`).bind(t.id));
    stmts.push(log(env, t.id, 'bo', t.so_luong, null, phieuId, nguoi, now));
  });
  list.forEach(x => {
    const old = cuById.get(x.id);
    if (old) {
      if (num(old.so_luong) === x.so_luong) return;
      stmts.push(env.DB.prepare('UPDATE tem SET so_luong = ? WHERE id = ?').bind(x.so_luong, x.id));
      stmts.push(log(env, x.id, 'sua_sl', old.so_luong, x.so_luong, phieuId, nguoi, now));
      return;
    }
    stmts.push(env.DB.prepare(`UPDATE tem SET trang_thai = 'da_xuat', phieu_id = ?, so_luong = ?, nguoi_quet = ?, quet_luc = ? WHERE id = ?`)
      .bind(phieuId, x.so_luong, nguoi, now, x.id));
    stmts.push(log(env, x.id, 'xuat', null, x.so_luong, phieuId, nguoi, now));
  });
  if (stmts.length) await runBatch(env, stmts);
}

/** Hủy phiếu -> nhả hết tem của phiếu về "chưa xuất" */
export async function releaseTems(env, phieuId, user) {
  await linkTems(env, phieuId, [], user);
}

/** Tem của 1 phiếu (để Sửa phiếu rồi quét nối thêm) */
export async function temsOfPhieu(env, phieuId) {
  await ensureTemSchema(env);
  const { results } = await env.DB.prepare('SELECT * FROM tem WHERE phieu_id = ? ORDER BY quet_luc, id').bind(phieuId).all();
  return results;
}

/** Số tem đã xuất của từng phiếu: Map(phieu_id -> n) */
export async function temCounts(env, phieuIds) {
  const m = new Map();
  if (!phieuIds.length) return m;
  await ensureTemSchema(env);
  for (let k = 0; k < phieuIds.length; k += 90) {
    const part = phieuIds.slice(k, k + 90);
    const { results } = await env.DB.prepare(`SELECT phieu_id, COUNT(*) AS n FROM tem WHERE trang_thai = 'da_xuat' AND phieu_id IN (${qs(part)}) GROUP BY phieu_id`)
      .bind(...part).all();
    results.forEach(r => m.set(r.phieu_id, r.n));
  }
  return m;
}

/** Mã tem tiếp theo trong tháng (giờ VN): T2610-00001 */
async function nextSeq(env, prefix) {
  const r = await env.DB.prepare(`SELECT MAX(CAST(SUBSTR(ma_tem, ${prefix.length + 1}) AS INTEGER)) AS m FROM tem WHERE ma_tem LIKE ?`).bind(prefix + '%').first();
  return (int(r?.m) || 0) + 1;
}

const TEM_SELECT = `SELECT t.*, p.so_phieu, p.ngay AS phieu_ngay, p.trang_thai AS phieu_trang_thai, o.don_id, k.ten_ngan AS khach_ten
  FROM tem t LEFT JOIN phieu p ON p.id = t.phieu_id LEFT JOIN po_don_hang o ON o.id = t.po_id LEFT JOIN khach_hang k ON k.id = t.khach_hang_id`;

export async function handleTemApi(path, method, url, request, env, user) {
  if (path !== '/api/tem' && !path.startsWith('/api/tem/')) return null;
  await ensureDonHangSchema(env); // cột po_don_hang.don_id
  await ensureTemSchema(env);
  const p = url.searchParams;
  const nguoi = user?.ho_ten || '';

  // ---------------- TRA 1 TEM KHI QUÉT ----------------
  const maM = path.match(/^\/api\/tem\/ma\/([^/]+)$/);
  if (maM && method === 'GET') {
    const ma = cleanMa(decodeURIComponent(maM[1]));
    const t = ma ? await env.DB.prepare(`${TEM_SELECT} WHERE t.ma_tem = ?`).bind(ma).first() : null;
    if (!t) return bad(`Không tìm thấy tem ${ma}`, 404);
    if (t.phieu_id && t.phieu_trang_thai === 'cancelled') { t.trang_thai = 'moi'; t.phieu_id = null; t.so_phieu = null; }
    return ok({ data: t });
  }

  // ---------------- ĐƠN HÀNG ĐỂ IN TEM ----------------
  if (path === '/api/tem/donhang' && method === 'GET') {
    const khId = int(p.get('khach_hang_id'));
    if (!khId) return bad('Chưa chọn khách hàng');
    const { orders } = await tienDo(env, { khId });
    const { results: dons } = await env.DB.prepare('SELECT id, so_don, dot FROM don_dat WHERE khach_hang_id = ? ORDER BY id DESC').bind(khId).all();
    const { results: inRows } = await env.DB.prepare(`
      SELECT po_id, size, loai, SUM(so_luong_in) AS sl_in, COUNT(*) AS so_tem,
        SUM(CASE WHEN trang_thai = 'da_xuat' THEN so_luong ELSE 0 END) AS sl_xuat
      FROM tem WHERE khach_hang_id = ? AND trang_thai <> 'huy' GROUP BY po_id, size, loai`).bind(khId).all();
    const daIn = {};
    inRows.forEach(r => {
      const k = `${r.po_id}|${normSize(r.size)}`;
      daIn[k] = daIn[k] || {};
      daIn[k][r.loai] = { sl_in: num(r.sl_in), sl_xuat: num(r.sl_xuat), so_tem: r.so_tem };
    });
    const lines = orders.map(o => ({
      po_id: o.id, don_id: o.don_id || 0, po: o.po, art: o.art, mau: o.mau || '', don_hang: o.don_hang || '',
      sizes: o.sizes.filter(s => s.dat > 0).map(s => ({ size: s.size, dat: s.dat, xuat: s.xuat, tem: daIn[`${o.id}|${s.size}`] || {} })),
    })).filter(l => l.sizes.length);
    const { results: toList } = await env.DB.prepare("SELECT ma, ten FROM bo_phan WHERE ma LIKE 'CM%' ORDER BY thu_tu").all();
    return ok({ dons: dons.map(d => ({ id: d.id, so_don: d.so_don, dot: d.dot || 1 })), lines, to: toList, co_dinh: forcedTo(user) });
  }

  // ---------------- TẠO TEM ----------------
  if (path === '/api/tem/in' && method === 'POST') {
    const b = await request.json();
    const khId = int(b.khach_hang_id);
    if (!khId) return bad('Chưa chọn khách hàng');
    const loai = b.loai === 'chat' ? 'chat' : 'may';
    let bp = 'TC';
    if (loai === 'may') {
      bp = forcedTo(user) || str(b.ma_bo_phan).toUpperCase();
      const to = await env.DB.prepare("SELECT ma FROM bo_phan WHERE ma = ? AND ma LIKE 'CM%'").bind(bp).first();
      if (!to) return bad('Chưa chọn tổ may');
    }
    const moi = Math.min(1000, Math.max(1, int(b.moi_tem) || 10));
    const chiTiet = str(b.chi_tiet).slice(0, 40) || 'Đồng bộ';
    const nguoiDg = str(b.nguoi_dg).slice(0, 40);
    const { results: pos } = await env.DB.prepare('SELECT id, po, art, mau FROM po_don_hang WHERE khach_hang_id = ?').bind(khId).all();
    const poById = new Map(pos.map(r => [r.id, r]));
    const plan = [];
    for (const l of Array.isArray(b.lines) ? b.lines : []) {
      const po = poById.get(int(l.po_id));
      const size = normSize(l.size);
      const n = Math.floor(num(l.so_luong));
      if (!po || !size || n <= 0) continue;
      chia(n, moi).forEach((sl, i, all) => plan.push({ po, size, sl, stt: i + 1, tong: all.length }));
    }
    if (!plan.length) return bad('Chưa nhập số đôi cần in tem');
    if (plan.length > MAX_TEM) return bad(`Một lần in tối đa ${MAX_TEM} tem (đang ${plan.length} tem) – chia thành nhiều lần`);
    const d = todayVN();
    const prefix = `T${d.slice(2, 4)}${d.slice(5, 7)}-`;
    const now = Date.now();
    const lo = now * 1000 + Math.floor(Math.random() * 1000);
    // Mã tem UNIQUE: 2 người in cùng lúc trùng số thì lô đó lỗi cả lô (batch D1) -> lấy số mới, thử lại
    let done = false;
    for (let lan = 0; lan < 3 && !done; lan++) {
      const start = await nextSeq(env, prefix);
      const stmts = plan.map((x, i) => env.DB.prepare(`
        INSERT INTO tem (ma_tem, loai, khach_hang_id, po_id, po, art, mau, size, so_luong_in, so_luong, stt, tong, ma_bo_phan, lo_in, trang_thai, nguoi_in, in_luc, chi_tiet, nguoi_dg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'moi', ?, ?, ?, ?)`)
        .bind(prefix + String(start + i).padStart(5, '0'), loai, khId, x.po.id, x.po.po, x.po.art, x.po.mau || '', x.size, x.sl, x.sl, x.stt, x.tong, bp, lo, nguoi, now,
          chiTiet, nguoiDg));
      try {
        // Lô nhỏ (≤ 200 tem) ghi trong 1 lần gọi; lô lớn hơn chia nhiều lần
        await runBatch(env, stmts);
        done = true;
      } catch (err) {
        if (!/UNIQUE/i.test(String(err?.message || err))) throw err;
        await env.DB.prepare('DELETE FROM tem WHERE lo_in = ?').bind(lo).run(); // phần lô đã ghi (khi > 200 tem)
      }
    }
    if (!done) return bad('Đang có người khác in tem cùng lúc – bấm in lại');
    const { results } = await env.DB.prepare(`${TEM_SELECT} WHERE t.lo_in = ? ORDER BY t.id`).bind(lo).all();
    return ok({ data: results, message: `Đã tạo ${results.length} tem` });
  }

  // ---------------- DANH SÁCH TEM ----------------
  if (path === '/api/tem' && method === 'GET') {
    const khId = int(p.get('khach_hang_id'));
    if (!khId) return bad('Chưa chọn khách hàng');
    let sql = `${TEM_SELECT} WHERE t.khach_hang_id = ?`;
    const bind = [khId];
    const tt = str(p.get('trang_thai'));
    if (['moi', 'da_xuat', 'huy'].includes(tt)) { sql += ' AND t.trang_thai = ?'; bind.push(tt); }
    const loai = str(p.get('loai'));
    if (loai === 'may' || loai === 'chat') { sql += ' AND t.loai = ?'; bind.push(loai); }
    if (p.has('don_id') && p.get('don_id') !== '') { sql += ' AND COALESCE(o.don_id, 0) = ?'; bind.push(int(p.get('don_id')) || 0); }
    sql += ` ORDER BY t.id DESC LIMIT ${MAX_TEM}`;
    const { results } = await env.DB.prepare(sql).bind(...bind).all();
    return ok({ data: results });
  }

  // ---------------- IN LẠI (giữ nguyên mã / QR) ----------------
  if (path === '/api/tem/inlai' && method === 'POST') {
    const b = await request.json();
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(int).filter(Boolean))].slice(0, MAX_TEM);
    if (!ids.length) return bad('Chưa chọn tem');
    const rows = (await temsByIds(env, ids)).filter(t => t.trang_thai !== 'huy');
    const now = Date.now();
    await runBatch(env, rows.map(t => log(env, t.id, 'in_lai', t.so_luong, t.so_luong, t.phieu_id, nguoi, now)));
    return ok({ data: rows.map(t => t.id) });
  }

  // ---------------- HỦY TEM CHƯA XUẤT ----------------
  const huyM = path.match(/^\/api\/tem\/(\d+)\/huy$/);
  if (huyM && method === 'PUT') {
    const id = int(huyM[1]);
    const t = (await temsByIds(env, [id]))[0];
    if (!t) return bad('Không tìm thấy tem', 404);
    if (busyElsewhere(t, null)) return bad(`Tem ${t.ma_tem} đã xuất ở phiếu ${t.so_phieu || ''} – hủy phiếu hoặc bỏ tem khỏi phiếu trước`);
    if (t.trang_thai === 'huy') return ok({ message: 'Tem đã hủy từ trước' });
    await runBatch(env, [
      env.DB.prepare(`UPDATE tem SET trang_thai = 'huy', phieu_id = NULL WHERE id = ?`).bind(id),
      log(env, id, 'huy', t.so_luong, null, null, nguoi, Date.now()),
    ]);
    return ok({ message: `Đã hủy tem ${t.ma_tem}` });
  }

  return bad('API tem không tồn tại', 404);
}
