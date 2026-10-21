/**
 * CHỈ LỆNH THẢ CHUYỀN - D&D LONG AN
 * 1 chỉ lệnh = 1 khách hàng + 1 ART + 1 bộ phận (chuyền may / tổ chặt), nhiều dòng PO, số lượng theo size.
 * Thả từng đợt: số gợi ý = Đặt − Đã thả ở các chỉ lệnh khác (chưa hủy).
 * Bảng chi_lenh* được tạo trong donhang.js (dùng chung để tính "Đã thả").
 */
import { str, int, num, ok, bad, todayVN, normKey, normSize } from './ddl.js';
import { ensureDonHangSchema, tienDo } from './donhang.js';

async function nextSoCl(env, bp, ngay) {
  const d = /^\d{4}-\d{2}/.test(ngay || '') ? ngay : todayVN();
  const prefix = `CL-${(str(bp) || 'CL').toUpperCase()}-${d.slice(2, 4)}${d.slice(5, 7)}-`;
  const { results } = await env.DB.prepare('SELECT so_cl FROM chi_lenh WHERE so_cl LIKE ?').bind(prefix + '%').all();
  let max = 0;
  for (const r of results) {
    const n = parseInt(String(r.so_cl).slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

/** Kiểm tra + làm sạch dữ liệu phiếu; trả { err } hoặc { h, lines } */
async function readBody(env, b) {
  const h = {
    ngay: str(b.ngay), khach_hang_id: int(b.khach_hang_id), art: str(b.art), ma_bo_phan: str(b.ma_bo_phan),
    ghi_chu: str(b.ghi_chu), so_cl: str(b.so_cl),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.ngay)) return { err: 'Chưa chọn ngày' };
  if (!h.khach_hang_id) return { err: 'Chưa chọn khách hàng' };
  if (!h.art) return { err: 'Chưa chọn ART' };
  if (!h.ma_bo_phan) return { err: 'Chưa chọn chuyền / bộ phận' };
  const { results: orders } = await env.DB.prepare('SELECT id, po, art FROM po_don_hang WHERE khach_hang_id = ?').bind(h.khach_hang_id).all();
  const byId = new Map(orders.map(o => [o.id, o]));
  const lines = [];
  for (const l of Array.isArray(b.lines) ? b.lines : []) {
    const sizes = {};
    (Array.isArray(l.sizes) ? l.sizes : []).forEach(s => {
      const k = normSize(s.size);
      const v = num(s.so_luong);
      if (k && v > 0) sizes[k] = (sizes[k] || 0) + v;
    });
    const tong = Object.values(sizes).reduce((a, v) => a + v, 0);
    if (!tong) continue;
    const od = byId.get(int(l.po_id));
    if (!od) return { err: 'Có dòng PO không thuộc đơn hàng của khách này' };
    if (normKey(od.art) !== normKey(h.art)) return { err: `PO ${od.po} không thuộc ART ${h.art}` };
    lines.push({ po_id: od.id, po: od.po, sizes, tong });
  }
  if (!lines.length) return { err: 'Chưa nhập số lượng cho PO nào' };
  return { h, lines };
}

async function saveLines(env, clId, lines) {
  await env.DB.prepare('DELETE FROM chi_lenh_dong_size WHERE dong_id IN (SELECT id FROM chi_lenh_dong WHERE chi_lenh_id = ?)').bind(clId).run();
  await env.DB.prepare('DELETE FROM chi_lenh_dong WHERE chi_lenh_id = ?').bind(clId).run();
  let tong = 0;
  for (const [i, l] of lines.entries()) {
    const d = await env.DB.prepare('INSERT INTO chi_lenh_dong (chi_lenh_id, po_id, po, thu_tu, so_luong) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(clId, l.po_id, l.po, i + 1, l.tong).first();
    for (const [size, sl] of Object.entries(l.sizes)) {
      await env.DB.prepare('INSERT INTO chi_lenh_dong_size (dong_id, size, so_luong) VALUES (?, ?, ?) RETURNING id').bind(d.id, size, sl).first();
    }
    tong += l.tong;
  }
  await env.DB.prepare('UPDATE chi_lenh SET tong_sl = ? WHERE id = ?').bind(tong, clId).run();
  return tong;
}

export async function handleChiLenhApi(path, method, url, request, env, user) {
  if (path !== '/api/chilenh' && !path.startsWith('/api/chilenh/')) return null;
  await ensureDonHangSchema(env);
  const p = url.searchParams;

  if (path === '/api/chilenh/sophieu' && method === 'GET') {
    return ok({ so_cl: await nextSoCl(env, p.get('bo_phan'), p.get('ngay')) });
  }

  // Các PO của 1 ART kèm số còn chưa thả (khi sửa thì không trừ chính chỉ lệnh đang sửa)
  if (path === '/api/chilenh/goiy' && method === 'GET') {
    const khId = int(p.get('khach_hang_id'));
    if (!khId) return bad('Chưa chọn khách hàng');
    const { orders } = await tienDo(env, { khId, excludeCl: int(p.get('tru_id')) });
    const art = normKey(p.get('art'));
    return ok({ data: art ? orders.filter(o => normKey(o.art) === art) : orders });
  }

  if (path === '/api/chilenh' && method === 'GET') {
    let sql = 'SELECT c.* FROM chi_lenh c WHERE 1 = 1';
    const params = [];
    if (p.get('tu_ngay')) { sql += ' AND c.ngay >= ?'; params.push(p.get('tu_ngay')); }
    if (p.get('den_ngay')) { sql += ' AND c.ngay <= ?'; params.push(p.get('den_ngay')); }
    if (p.get('bo_phan')) { sql += ' AND c.ma_bo_phan = ?'; params.push(p.get('bo_phan')); }
    if (int(p.get('khach_hang_id'))) { sql += ' AND c.khach_hang_id = ?'; params.push(int(p.get('khach_hang_id'))); }
    if (p.get('trang_thai')) { sql += ' AND c.trang_thai = ?'; params.push(p.get('trang_thai')); }
    sql += ' ORDER BY c.ngay DESC, c.id DESC LIMIT 300';
    let { results } = await env.DB.prepare(sql).bind(...params).all();
    if (results.length) {
      const ids = results.map(r => r.id);
      const { results: lines } = await env.DB.prepare(
        `SELECT chi_lenh_id, po, so_luong FROM chi_lenh_dong WHERE chi_lenh_id IN (${ids.map(() => '?').join(',')}) ORDER BY thu_tu`).bind(...ids).all();
      const map = new Map(ids.map(id => [id, []]));
      lines.forEach(l => map.get(l.chi_lenh_id)?.push({ po: l.po, so_luong: l.so_luong }));
      results.forEach(r => { r.dong = map.get(r.id) || []; });
    }
    const q = normKey(p.get('q'));
    if (q) results = results.filter(r => [r.so_cl, r.art, ...r.dong.map(d => d.po)].some(v => normKey(v).includes(q)));
    return ok({ data: results });
  }

  const idM = path.match(/^\/api\/chilenh\/(\d+)$/);
  if (idM && method === 'GET') {
    const id = int(idM[1]);
    const cl = await env.DB.prepare('SELECT * FROM chi_lenh WHERE id = ?').bind(id).first();
    if (!cl) return bad('Không tìm thấy chỉ lệnh', 404);
    const { results: lines } = await env.DB.prepare(`
      SELECT d.*, o.don_hang, o.mau, o.ngay_giao FROM chi_lenh_dong d LEFT JOIN po_don_hang o ON o.id = d.po_id
      WHERE d.chi_lenh_id = ? ORDER BY d.thu_tu, d.id`).bind(id).all();
    const { results: sizes } = await env.DB.prepare(
      'SELECT dong_id, size, so_luong FROM chi_lenh_dong_size WHERE dong_id IN (SELECT id FROM chi_lenh_dong WHERE chi_lenh_id = ?) ORDER BY id').bind(id).all();
    lines.forEach(l => { l.sizes = sizes.filter(s => s.dong_id === l.id).map(s => ({ size: s.size, so_luong: s.so_luong })); });
    const bp = await env.DB.prepare('SELECT ten FROM bo_phan WHERE ma = ?').bind(cl.ma_bo_phan).first();
    return ok({ data: { ...cl, ten_bo_phan: bp?.ten || cl.ma_bo_phan, lines } });
  }

  if (path === '/api/chilenh' && method === 'POST') {
    const { err, h, lines } = await readBody(env, await request.json());
    if (err) return bad(err);
    let so = h.so_cl || await nextSoCl(env, h.ma_bo_phan, h.ngay);
    if (await env.DB.prepare('SELECT id FROM chi_lenh WHERE so_cl = ?').bind(so).first()) so = await nextSoCl(env, h.ma_bo_phan, h.ngay);
    const r = await env.DB.prepare(`INSERT INTO chi_lenh (so_cl, ngay, khach_hang_id, art, ma_bo_phan, nguoi_lap, ghi_chu, trang_thai)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'mo') RETURNING id`)
      .bind(so, h.ngay, h.khach_hang_id, h.art, h.ma_bo_phan, user?.ho_ten || '', h.ghi_chu).first();
    const tong = await saveLines(env, r.id, lines);
    return ok({ id: r.id, so_cl: so, tong_sl: tong, message: `Đã lưu chỉ lệnh ${so}` });
  }

  if (idM && method === 'PUT') {
    const id = int(idM[1]);
    const cl = await env.DB.prepare('SELECT id, trang_thai FROM chi_lenh WHERE id = ?').bind(id).first();
    if (!cl) return bad('Không tìm thấy chỉ lệnh', 404);
    if (cl.trang_thai === 'huy') return bad('Chỉ lệnh đã hủy, không sửa được');
    const { err, h, lines } = await readBody(env, await request.json());
    if (err) return bad(err);
    if (h.so_cl && await env.DB.prepare('SELECT id FROM chi_lenh WHERE so_cl = ? AND id <> ?').bind(h.so_cl, id).first()) {
      return bad(`Số chỉ lệnh ${h.so_cl} đã có, hãy đổi số khác`);
    }
    await env.DB.prepare(`UPDATE chi_lenh SET so_cl = COALESCE(NULLIF(?, ''), so_cl), ngay = ?, khach_hang_id = ?, art = ?, ma_bo_phan = ?, ghi_chu = ? WHERE id = ?`)
      .bind(h.so_cl, h.ngay, h.khach_hang_id, h.art, h.ma_bo_phan, h.ghi_chu, id).run();
    const tong = await saveLines(env, id, lines);
    return ok({ id, tong_sl: tong, message: 'Đã cập nhật chỉ lệnh' });
  }

  const huyM = path.match(/^\/api\/chilenh\/(\d+)\/(huy|mo)$/);
  if (huyM && method === 'PUT') {
    await env.DB.prepare('UPDATE chi_lenh SET trang_thai = ? WHERE id = ?').bind(huyM[2] === 'huy' ? 'huy' : 'mo', int(huyM[1])).run();
    return ok({ message: huyM[2] === 'huy' ? 'Đã hủy chỉ lệnh' : 'Đã khôi phục chỉ lệnh' });
  }

  return bad('API chỉ lệnh không tồn tại', 404);
}
