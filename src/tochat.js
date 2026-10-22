/**
 * TỔ CHẶT - D&D LONG AN
 * - Đơn hàng tổ chặt: lấy đơn / PO ở tab Đơn hàng, mỗi PO tách ra các chi tiết theo bộ chi tiết của ART.
 *   Phải chặt (miếng) = số đôi × miếng/đôi (hệ số), sửa được từng PO (bảng chat_dinh_muc).
 * - Xuất nội bộ: tổ chặt giao bán thành phẩm cho tổ may theo PO · chi tiết · size; còn lại = phải chặt − đã xuất.
 */
import { isSqlite, ddlTypes, ensureTables, str, int, num, parseJson, ok, bad, todayVN, normKey, normSize, runBatch } from './ddl.js';
import { ensureDonHangSchema, tienDo } from './donhang.js';

const ID_TABLES = ['chat_dinh_muc', 'xuat_noi_bo', 'xuat_noi_bo_dong'];
export const TABLES = ID_TABLES;
export function schemaFor(sqlite) {
  const T = ddlTypes(sqlite);
  return [
    ...T.seqs(ID_TABLES),
    `CREATE TABLE IF NOT EXISTS chat_dinh_muc (
      ${T.id('chat_dinh_muc')},
      po_id ${T.INT} NOT NULL,
      chi_tiet TEXT NOT NULL,
      size TEXT NOT NULL,
      so_luong ${T.REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cdm_po ON chat_dinh_muc(po_id)`,
    `CREATE TABLE IF NOT EXISTS xuat_noi_bo (
      ${T.id('xuat_noi_bo')},
      so_phieu TEXT UNIQUE NOT NULL,
      ngay TEXT NOT NULL,
      khach_hang_id ${T.INT},
      art TEXT DEFAULT '',
      ma_bo_phan_nhan TEXT DEFAULT '',
      nguoi TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      trang_thai TEXT DEFAULT 'mo',
      tong_sl ${T.REAL} DEFAULT 0,
      tao_luc ${T.TS}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_xnb_ngay ON xuat_noi_bo(ngay)`,
    `CREATE TABLE IF NOT EXISTS xuat_noi_bo_dong (
      ${T.id('xuat_noi_bo_dong')},
      phieu_id ${T.INT} NOT NULL,
      po_id ${T.INT},
      po TEXT DEFAULT '',
      chi_tiet TEXT DEFAULT '',
      size TEXT NOT NULL,
      so_luong ${T.REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_xnbd_phieu ON xuat_noi_bo_dong(phieu_id)`,
    `CREATE INDEX IF NOT EXISTS idx_xnbd_po ON xuat_noi_bo_dong(po_id)`,
    // Kiểu nhập: 'doi' (nhập số đôi, tự nhân ra từng chi tiết) | 'chi_tiet' (nhập số miếng từng chi tiết)
    sqlite ? `ALTER TABLE xuat_noi_bo ADD COLUMN kieu TEXT DEFAULT 'chi_tiet'`
      : `ALTER TABLE xuat_noi_bo ADD COLUMN IF NOT EXISTS kieu TEXT DEFAULT 'chi_tiet'`,
  ];
}
const PROBE = 'SELECT c.id, x.id, x.kieu, d.id FROM chat_dinh_muc c, xuat_noi_bo x, xuat_noi_bo_dong d WHERE 1 = 0';
const ensureToChatSchema = env => ensureTables(env, 'tochat_v1', PROBE, schemaFor(isSqlite(env)));

const add = (m, k, v) => { if (v) m[k] = (m[k] || 0) + v; };
const sum = m => Object.values(m).reduce((a, v) => a + v, 0);
const ctKey = (poId, ct) => `${poId}|${normKey(ct)}`;

/**
 * Các PO của khách kèm chi tiết: phải chặt · đã xuất nội bộ · còn lại theo size.
 * o: { khId, donId (null = mọi đơn, 0 = PO lẻ), art, truPhieu (bỏ phiếu đang sửa khi tính đã xuất) }
 */
async function poChiTiet(env, o) {
  const { orders } = await tienDo(env, { khId: o.khId });
  let pos = orders;
  if (o.donId !== undefined && o.donId !== null) pos = pos.filter(r => (o.donId ? r.don_id === o.donId : !r.don_id));
  if (o.art) pos = pos.filter(r => normKey(r.art) === normKey(o.art));
  const { results: bos } = await env.DB.prepare('SELECT * FROM bo_chi_tiet WHERE khach_hang_id = ? ORDER BY thu_tu, id').bind(o.khId).all();
  const boOf = art => bos.find(b => normKey(b.art) === normKey(art));
  const ids = pos.map(r => r.id);
  const dm = new Map();
  const xuat = new Map();
  if (ids.length) {
    const qs = ids.map(() => '?').join(',');
    const { results: dms } = await env.DB.prepare(`SELECT * FROM chat_dinh_muc WHERE po_id IN (${qs})`).bind(...ids).all();
    dms.forEach(d => { const k = ctKey(d.po_id, d.chi_tiet); if (!dm.has(k)) dm.set(k, {}); add(dm.get(k), normSize(d.size), num(d.so_luong)); });
    const { results: xs } = await env.DB.prepare(`
      SELECT d.po_id, d.chi_tiet, d.size, SUM(d.so_luong) AS sl FROM xuat_noi_bo_dong d JOIN xuat_noi_bo x ON x.id = d.phieu_id
      WHERE x.trang_thai <> 'huy' AND d.po_id IN (${qs})${o.truPhieu ? ' AND x.id <> ?' : ''}
      GROUP BY d.po_id, d.chi_tiet, d.size`).bind(...ids, ...(o.truPhieu ? [o.truPhieu] : [])).all();
    xs.forEach(x => { const k = ctKey(x.po_id, x.chi_tiet); if (!xuat.has(k)) xuat.set(k, {}); add(xuat.get(k), normSize(x.size), num(x.sl)); });
  }
  return pos.map(r => {
    const bo = boOf(r.art);
    const cts = bo ? parseJson(bo.chi_tiet, []) : [];
    const dat = Object.fromEntries(r.sizes.filter(s => s.dat).map(s => [s.size, s.dat]));
    const sizes = r.sizes.filter(s => s.dat).map(s => s.size);
    const chi_tiet = cts.map(c => {
      const heSo = num(c.he_so) || 2;
      const k = ctKey(r.id, c.ten);
      const sua = dm.has(k);
      const phai = sua ? dm.get(k) : Object.fromEntries(sizes.map(s => [s, Math.round(dat[s] * heSo)]));
      const x = xuat.get(k) || {};
      const con = Object.fromEntries([...new Set([...Object.keys(phai), ...Object.keys(x)])].map(s => [s, (phai[s] || 0) - (x[s] || 0)]));
      return { ten: c.ten, he_so: heSo, dvt: c.dvt || 'Miếng', sua, phai, xuat: x, con,
        tong_phai: sum(phai), tong_xuat: sum(x), tong_con: Object.values(con).reduce((a, v) => a + Math.max(0, v), 0) };
    });
    // Size lạ có trong định mức / đã xuất cũng phải hiện cột
    chi_tiet.forEach(c => Object.keys(c.con).forEach(s => { if (!sizes.includes(s)) sizes.push(s); }));
    const t = k => chi_tiet.reduce((a, c) => a + c[k], 0);
    return { id: r.id, don_id: r.don_id, po: r.po, art: r.art, mau: r.mau, don_hang: r.don_hang, ngay_giao: r.ngay_giao,
      dat, tong_dat: r.tong_dat, sizes, bo_id: bo ? bo.id : null, ten_bo: bo ? bo.ten_bo : '', chi_tiet,
      tong_phai: t('tong_phai'), tong_xuat: t('tong_xuat'), tong_con: t('tong_con') };
  });
}

async function nextSoPhieu(env, ngay) {
  const d = /^\d{4}-\d{2}/.test(ngay || '') ? ngay : todayVN();
  const prefix = `XNB-${d.slice(2, 4)}${d.slice(5, 7)}-`;
  const { results } = await env.DB.prepare('SELECT so_phieu FROM xuat_noi_bo WHERE so_phieu LIKE ?').bind(prefix + '%').all();
  let max = 0;
  for (const r of results) {
    const n = parseInt(String(r.so_phieu).slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

/** Làm sạch phiếu xuất nội bộ; trả { err } hoặc { h, lines } */
async function readXuat(env, b) {
  const h = { ngay: str(b.ngay), khach_hang_id: int(b.khach_hang_id), art: str(b.art), ma_bo_phan_nhan: str(b.ma_bo_phan_nhan).toUpperCase(),
    ghi_chu: str(b.ghi_chu), so_phieu: str(b.so_phieu), kieu: b.kieu === 'doi' ? 'doi' : 'chi_tiet' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.ngay)) return { err: 'Chưa chọn ngày' };
  if (!h.khach_hang_id) return { err: 'Chưa chọn khách hàng' };
  if (!h.art) return { err: 'Chưa chọn ART' };
  if (!h.ma_bo_phan_nhan) return { err: 'Chưa chọn tổ may nhận' };
  const { results: orders } = await env.DB.prepare('SELECT id, po, art FROM po_don_hang WHERE khach_hang_id = ?').bind(h.khach_hang_id).all();
  const byId = new Map(orders.map(r => [r.id, r]));
  const lines = [];
  for (const l of Array.isArray(b.lines) ? b.lines : []) {
    const od = byId.get(int(l.po_id));
    const sl = num(l.so_luong);
    const size = normSize(l.size);
    if (!sl || !size) continue;
    if (!od) return { err: 'Có dòng PO không thuộc đơn hàng của khách này' };
    if (normKey(od.art) !== normKey(h.art)) return { err: `PO ${od.po} không thuộc ART ${h.art}` };
    if (!str(l.chi_tiet)) return { err: `PO ${od.po}: thiếu tên chi tiết` };
    lines.push({ po_id: od.id, po: od.po, chi_tiet: str(l.chi_tiet), size, so_luong: sl });
  }
  if (!lines.length) return { err: 'Chưa nhập số lượng chi tiết nào' };
  return { h, lines };
}
async function saveXuatLines(env, id, lines) {
  const tong = lines.reduce((a, l) => a + l.so_luong, 0);
  await runBatch(env, [
    env.DB.prepare('DELETE FROM xuat_noi_bo_dong WHERE phieu_id = ?').bind(id),
    ...lines.map(l => env.DB.prepare('INSERT INTO xuat_noi_bo_dong (phieu_id, po_id, po, chi_tiet, size, so_luong) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, l.po_id, l.po, l.chi_tiet, l.size, l.so_luong)),
    env.DB.prepare('UPDATE xuat_noi_bo SET tong_sl = ? WHERE id = ?').bind(tong, id),
  ], 1000);
}

/* ============================================================
   ROUTER /api/tochat/*
   ============================================================ */
export async function handleToChatApi(path, method, url, request, env, user) {
  if (!path.startsWith('/api/tochat/')) return null;
  await ensureDonHangSchema(env);
  await ensureToChatSchema(env);
  const p = url.searchParams;

  // ---------------- ĐƠN HÀNG TỔ CHẶT ----------------
  if (path === '/api/tochat/donhang' && method === 'GET') {
    const khId = int(p.get('khach_hang_id'));
    if (!khId) return bad('Chưa chọn khách hàng');
    const pos = await poChiTiet(env, { khId });
    const { results: dons } = await env.DB.prepare('SELECT * FROM don_dat WHERE khach_hang_id = ? ORDER BY id DESC').bind(khId).all();
    const tong = (head, rows) => ({ ...head, so_po: rows.length, so_art: new Set(rows.map(r => normKey(r.art))).size,
      thieu_bo: [...new Set(rows.filter(r => !r.bo_id).map(r => r.art))],
      tong_phai: rows.reduce((a, r) => a + r.tong_phai, 0), tong_xuat: rows.reduce((a, r) => a + r.tong_xuat, 0), tong_con: rows.reduce((a, r) => a + r.tong_con, 0) });
    const data = dons.map(d => tong({ id: d.id, so_don: d.so_don, ngay_giao: d.ngay_giao, ghi_chu: d.ghi_chu }, pos.filter(r => r.don_id === d.id)));
    const le = pos.filter(r => !r.don_id);
    if (le.length) data.push(tong({ id: 0, so_don: '(PO chưa thuộc đơn)', ngay_giao: '', ghi_chu: '' }, le));
    return ok({ data });
  }
  const donM = path.match(/^\/api\/tochat\/donhang\/(\d+)$/);
  if (donM && method === 'GET') {
    const donId = int(donM[1]);
    let head;
    if (donId) {
      head = await env.DB.prepare('SELECT * FROM don_dat WHERE id = ?').bind(donId).first();
      if (!head) return bad('Không tìm thấy đơn', 404);
    } else {
      head = { id: 0, so_don: '(PO chưa thuộc đơn)', khach_hang_id: int(p.get('khach_hang_id')) };
      if (!head.khach_hang_id) return bad('Chưa chọn khách hàng');
    }
    const pos = await poChiTiet(env, { khId: head.khach_hang_id, donId });
    return ok({ data: { ...head, pos: pos.sort((a, b) => a.id - b.id) } });
  }
  const dmM = path.match(/^\/api\/tochat\/dinhmuc\/(\d+)$/);
  if (dmM && method === 'PUT') {
    const poId = int(dmM[1]);
    const od = await env.DB.prepare('SELECT id, po FROM po_don_hang WHERE id = ?').bind(poId).first();
    if (!od) return bad('Không tìm thấy PO', 404);
    const b = await request.json();
    await env.DB.prepare('DELETE FROM chat_dinh_muc WHERE po_id = ?').bind(poId).run();
    let n = 0;
    for (const r of Array.isArray(b.rows) ? b.rows : []) {
      const size = normSize(r.size);
      if (!str(r.chi_tiet) || !size) continue;
      await env.DB.prepare('INSERT INTO chat_dinh_muc (po_id, chi_tiet, size, so_luong) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(poId, str(r.chi_tiet), size, num(r.so_luong)).first();
      n++;
    }
    return ok({ message: n ? `Đã lưu số phải chặt PO ${od.po}` : `PO ${od.po} dùng lại số tự tính (đôi × miếng/đôi)` });
  }

  // ---------------- XUẤT NỘI BỘ ----------------
  if (path === '/api/tochat/xuat/sophieu' && method === 'GET') return ok({ so_phieu: await nextSoPhieu(env, p.get('ngay')) });
  // Các PO của 1 ART kèm chi tiết còn lại (khi sửa phiếu thì không trừ chính phiếu đó)
  if (path === '/api/tochat/xuat/goiy' && method === 'GET') {
    const khId = int(p.get('khach_hang_id'));
    if (!khId || !str(p.get('art'))) return bad('Chưa chọn khách hàng / ART');
    return ok({ data: await poChiTiet(env, { khId, art: p.get('art'), truPhieu: int(p.get('tru_id')) }) });
  }
  if (path === '/api/tochat/xuat' && method === 'GET') {
    let sql = 'SELECT * FROM xuat_noi_bo WHERE 1 = 1';
    const bind = [];
    if (p.get('tu_ngay')) { sql += ' AND ngay >= ?'; bind.push(p.get('tu_ngay')); }
    if (p.get('den_ngay')) { sql += ' AND ngay <= ?'; bind.push(p.get('den_ngay')); }
    if (int(p.get('khach_hang_id'))) { sql += ' AND khach_hang_id = ?'; bind.push(int(p.get('khach_hang_id'))); }
    if (p.get('bo_phan')) { sql += ' AND ma_bo_phan_nhan = ?'; bind.push(p.get('bo_phan')); }
    if (p.get('trang_thai')) { sql += ' AND trang_thai = ?'; bind.push(p.get('trang_thai')); }
    sql += ' ORDER BY ngay DESC, id DESC LIMIT 300';
    const { results } = await env.DB.prepare(sql).bind(...bind).all();
    const q = normKey(p.get('q'));
    let list = results;
    if (results.length) {
      const { results: ds } = await env.DB.prepare(
        `SELECT phieu_id, po, chi_tiet, SUM(so_luong) AS sl FROM xuat_noi_bo_dong WHERE phieu_id IN (${results.map(() => '?').join(',')})
         GROUP BY phieu_id, po, chi_tiet`).bind(...results.map(r => r.id)).all();
      list = results.map(r => ({ ...r, dong: ds.filter(d => d.phieu_id === r.id) }));
    }
    if (q) list = list.filter(r => [r.so_phieu, r.art, ...(r.dong || []).map(d => d.po)].some(v => normKey(v).includes(q)));
    return ok({ data: list });
  }
  const xM = path.match(/^\/api\/tochat\/xuat\/(\d+)$/);
  if (xM && method === 'GET') {
    const x = await env.DB.prepare('SELECT * FROM xuat_noi_bo WHERE id = ?').bind(int(xM[1])).first();
    if (!x) return bad('Không tìm thấy phiếu', 404);
    const { results: lines } = await env.DB.prepare('SELECT * FROM xuat_noi_bo_dong WHERE phieu_id = ? ORDER BY id').bind(x.id).all();
    const bp = await env.DB.prepare('SELECT ten FROM bo_phan WHERE ma = ?').bind(x.ma_bo_phan_nhan).first();
    return ok({ data: { ...x, ten_bo_phan_nhan: bp?.ten || x.ma_bo_phan_nhan, lines } });
  }
  if (path === '/api/tochat/xuat' && method === 'POST') {
    const r = await readXuat(env, await request.json());
    if (r.err) return bad(r.err);
    let so = r.h.so_phieu || await nextSoPhieu(env, r.h.ngay);
    if (await env.DB.prepare('SELECT id FROM xuat_noi_bo WHERE so_phieu = ?').bind(so).first()) so = await nextSoPhieu(env, r.h.ngay);
    const x = await env.DB.prepare(`INSERT INTO xuat_noi_bo (so_phieu, ngay, khach_hang_id, art, ma_bo_phan_nhan, nguoi, ghi_chu, kieu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(so, r.h.ngay, r.h.khach_hang_id, r.h.art, r.h.ma_bo_phan_nhan, user?.ho_ten || '', r.h.ghi_chu, r.h.kieu).first();
    await saveXuatLines(env, x.id, r.lines);
    return ok({ id: x.id, so_phieu: so, message: `Đã lưu phiếu xuất nội bộ ${so}` });
  }
  if (xM && method === 'PUT') {
    const id = int(xM[1]);
    const old = await env.DB.prepare('SELECT * FROM xuat_noi_bo WHERE id = ?').bind(id).first();
    if (!old) return bad('Không tìm thấy phiếu', 404);
    if (old.trang_thai === 'huy') return bad('Phiếu đã hủy, khôi phục trước khi sửa');
    const r = await readXuat(env, await request.json());
    if (r.err) return bad(r.err);
    await env.DB.prepare('UPDATE xuat_noi_bo SET ngay = ?, khach_hang_id = ?, art = ?, ma_bo_phan_nhan = ?, ghi_chu = ?, kieu = ? WHERE id = ?')
      .bind(r.h.ngay, r.h.khach_hang_id, r.h.art, r.h.ma_bo_phan_nhan, r.h.ghi_chu, r.h.kieu, id).run();
    await saveXuatLines(env, id, r.lines);
    return ok({ id, so_phieu: old.so_phieu, message: `Đã lưu phiếu ${old.so_phieu}` });
  }
  const hM = path.match(/^\/api\/tochat\/xuat\/(\d+)\/(huy|mo)$/);
  if (hM && method === 'PUT') {
    await env.DB.prepare('UPDATE xuat_noi_bo SET trang_thai = ? WHERE id = ?').bind(hM[2] === 'huy' ? 'huy' : 'mo', int(hM[1])).run();
    return ok({ message: hM[2] === 'huy' ? 'Đã hủy phiếu (số đã xuất được trả lại)' : 'Đã khôi phục phiếu' });
  }
  return bad('API tổ chặt không tồn tại', 404);
}
