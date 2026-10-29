/**
 * TỔ MAY XUẤT CHO KHO - D&D LONG AN
 * - Mỗi tổ may (CMA/CMB/CMC = TMA/TMB/TMC) nhập số giao kho theo PO · ART · size. Tài khoản gắn tổ nào chỉ nhập / xem tổ đó.
 * - Đối chiếu cuối ngày: số tổ may báo so với phiếu xuất kho thật cùng ngày của chuyền đó (phiếu không hủy,
 *   khớp PO = phieu_dong.ma_hang, ART = phieu_dong.mau; bỏ dòng chi tiết / không size như tab Xuất theo đơn hàng).
 */
import { isSqlite, ddlTypes, ensureTables, str, int, num, ok, bad, normKey, normSize, runBatch } from './ddl.js';

const ID_TABLES = ['tm_xuat', 'tm_xuat_dong'];
export const TABLES = ID_TABLES;
export function schemaFor(sqlite) {
  const T = ddlTypes(sqlite);
  return [
    ...T.seqs(ID_TABLES),
    `CREATE TABLE IF NOT EXISTS tm_xuat (
      ${T.id('tm_xuat')},
      ngay TEXT NOT NULL,
      ma_bo_phan TEXT NOT NULL,
      khach_hang_id ${T.INT},
      nguoi TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      tong_sl ${T.REAL} DEFAULT 0,
      tao_luc ${T.TS}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tmx_ngay ON tm_xuat(ngay, ma_bo_phan)`,
    `CREATE TABLE IF NOT EXISTS tm_xuat_dong (
      ${T.id('tm_xuat_dong')},
      phieu_id ${T.INT} NOT NULL,
      po TEXT DEFAULT '',
      art TEXT DEFAULT '',
      size TEXT NOT NULL,
      so_luong ${T.REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tmxd_phieu ON tm_xuat_dong(phieu_id)`,
  ];
}
const ensureToMaySchema = env => ensureTables(env, 'tomay_v1', 'SELECT x.id, d.id FROM tm_xuat x, tm_xuat_dong d WHERE 1 = 0', schemaFor(isSqlite(env)));

const isToMay = ma => /^CM/i.test(str(ma));
/** Tài khoản gắn tổ may -> bị ép đúng tổ đó; admin / không gắn tổ -> theo yêu cầu */
export const forcedTo = user => (!user?.la_admin && isToMay(user?.ma_bo_phan) ? user.ma_bo_phan.toUpperCase() : '');
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(str(s));

/** Làm sạch các dòng nhập (ART trống = ART dòng trên); trả { err } hoặc { lines } */
function readLines(b) {
  const lines = [];
  const errs = [];
  let lastArt = '';
  (Array.isArray(b.lines) ? b.lines : []).forEach((l, i) => {
    let art = str(l.art);
    const po = str(l.po);
    const sizes = {};
    (Array.isArray(l.sizes) ? l.sizes : []).forEach(s => { const k = normSize(s.size); const v = num(s.so_luong); if (k && v) sizes[k] = (sizes[k] || 0) + v; });
    if (!art && !po && !Object.keys(sizes).length) return;
    if (!art) art = lastArt;
    lastArt = art;
    if (!po || !art) { errs.push(`Dòng ${i + 1}: chưa có ${!art ? 'ART' : 'PO'}`); return; }
    if (!Object.keys(sizes).length) { errs.push(`Dòng ${i + 1}: chưa có số lượng`); return; }
    Object.entries(sizes).forEach(([size, so_luong]) => lines.push({ po, art, size, so_luong }));
  });
  if (errs.length) return { err: errs.slice(0, 12).join('\n') };
  if (!lines.length) return { err: 'Chưa nhập dòng nào' };
  return { lines };
}
async function saveLines(env, id, lines) {
  await runBatch(env, [
    env.DB.prepare('DELETE FROM tm_xuat_dong WHERE phieu_id = ?').bind(id),
    ...lines.map(l => env.DB.prepare('INSERT INTO tm_xuat_dong (phieu_id, po, art, size, so_luong) VALUES (?, ?, ?, ?, ?)').bind(id, l.po, l.art, l.size, l.so_luong)),
    env.DB.prepare('UPDATE tm_xuat SET tong_sl = ? WHERE id = ?').bind(lines.reduce((a, l) => a + l.so_luong, 0), id),
  ], 1000);
}

export async function handleToMayApi(path, method, url, request, env, user) {
  if (path !== '/api/tomay' && !path.startsWith('/api/tomay/')) return null;
  await ensureToMaySchema(env);
  const p = url.searchParams;
  const ep = forcedTo(user);
  const { results: toList } = await env.DB.prepare("SELECT ma, ten FROM bo_phan WHERE ma LIKE 'CM%' ORDER BY thu_tu").all();

  if (path === '/api/tomay/to' && method === 'GET') return ok({ data: toList, co_dinh: ep });

  // ---------------- NHẬP SỐ GIAO KHO ----------------
  if (path === '/api/tomay/xuat' && method === 'GET') {
    let sql = 'SELECT * FROM tm_xuat WHERE 1 = 1';
    const bind = [];
    if (okDate(p.get('ngay'))) { sql += ' AND ngay = ?'; bind.push(p.get('ngay')); }
    const to = ep || str(p.get('ma_bo_phan')).toUpperCase();
    if (to) { sql += ' AND ma_bo_phan = ?'; bind.push(to); }
    if (int(p.get('khach_hang_id'))) { sql += ' AND khach_hang_id = ?'; bind.push(int(p.get('khach_hang_id'))); }
    sql += ' ORDER BY ngay DESC, id DESC LIMIT 200';
    const { results } = await env.DB.prepare(sql).bind(...bind).all();
    let data = results.map(r => ({ ...r, lines: [] }));
    if (results.length) {
      const { results: ds } = await env.DB.prepare(`SELECT * FROM tm_xuat_dong WHERE phieu_id IN (${results.map(() => '?').join(',')}) ORDER BY id`)
        .bind(...results.map(r => r.id)).all();
      data = results.map(r => ({ ...r, lines: ds.filter(d => d.phieu_id === r.id) }));
    }
    return ok({ data });
  }
  if (path === '/api/tomay/xuat' && method === 'POST') {
    const b = await request.json();
    const to = ep || str(b.ma_bo_phan).toUpperCase();
    if (!okDate(b.ngay)) return bad('Chưa chọn ngày');
    if (!isToMay(to) || !toList.some(t => t.ma === to)) return bad('Chưa chọn tổ may');
    if (!int(b.khach_hang_id)) return bad('Chưa chọn khách hàng');
    const r = readLines(b);
    if (r.err) return bad(r.err);
    const x = await env.DB.prepare('INSERT INTO tm_xuat (ngay, ma_bo_phan, khach_hang_id, nguoi, ghi_chu) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(str(b.ngay), to, int(b.khach_hang_id), user?.ho_ten || '', str(b.ghi_chu)).first();
    await saveLines(env, x.id, r.lines);
    return ok({ id: x.id, message: `Đã lưu số ${to} giao kho ngày ${str(b.ngay).split('-').reverse().join('/')}` });
  }
  const xM = path.match(/^\/api\/tomay\/xuat\/(\d+)$/);
  if (xM && (method === 'PUT' || method === 'DELETE')) {
    const id = int(xM[1]);
    const old = await env.DB.prepare('SELECT * FROM tm_xuat WHERE id = ?').bind(id).first();
    if (!old) return bad('Không tìm thấy lần nhập', 404);
    if (ep && old.ma_bo_phan !== ep) return bad('Chỉ sửa được số của tổ mình', 403);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM tm_xuat_dong WHERE phieu_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM tm_xuat WHERE id = ?').bind(id).run();
      return ok({ message: 'Đã xóa lần nhập' });
    }
    const b = await request.json();
    const to = ep || str(b.ma_bo_phan).toUpperCase() || old.ma_bo_phan;
    if (!okDate(b.ngay)) return bad('Chưa chọn ngày');
    if (!isToMay(to) || !toList.some(t => t.ma === to)) return bad('Chưa chọn tổ may');
    const r = readLines(b);
    if (r.err) return bad(r.err);
    await env.DB.prepare('UPDATE tm_xuat SET ngay = ?, ma_bo_phan = ?, khach_hang_id = ?, ghi_chu = ? WHERE id = ?')
      .bind(str(b.ngay), to, int(b.khach_hang_id) || old.khach_hang_id, str(b.ghi_chu), id).run();
    await saveLines(env, id, r.lines);
    return ok({ id, message: 'Đã lưu' });
  }

  // ---------------- ĐỐI CHIẾU CUỐI NGÀY ----------------
  if (path === '/api/tomay/doichieu' && method === 'GET') {
    const ngay = str(p.get('ngay'));
    if (!okDate(ngay)) return bad('Chưa chọn ngày');
    const pick = ep || str(p.get('ma_bo_phan')).toUpperCase();
    const tos = toList.filter(t => !pick || t.ma === pick);
    const khId = int(p.get('khach_hang_id'));
    const groups = new Map(tos.map(t => [t.ma, { ma_bo_phan: t.ma, ten: t.ten, rows: new Map() }]));
    const put = (to, po, art, size, field, v) => {
      const g = groups.get(to);
      if (!g || !v) return;
      const k = `${normKey(po)}|${normKey(art)}`;
      if (!g.rows.has(k)) g.rows.set(k, { po, art, sz: {} });
      const row = g.rows.get(k);
      const s = normSize(size);
      if (!row.sz[s]) row.sz[s] = { size: s, tm: 0, pk: 0 };
      row.sz[s][field] += v;
    };
    if (tos.length) {
      const qs = tos.map(() => '?').join(',');
      const khW = khId ? ' AND x.khach_hang_id = ?' : '';
      const { results: tm } = await env.DB.prepare(`
        SELECT x.ma_bo_phan, d.po, d.art, d.size, d.so_luong FROM tm_xuat_dong d JOIN tm_xuat x ON x.id = d.phieu_id
        WHERE x.ngay = ? AND x.ma_bo_phan IN (${qs})${khW}`).bind(ngay, ...tos.map(t => t.ma), ...(khId ? [khId] : [])).all();
      tm.forEach(r => put(r.ma_bo_phan, r.po, r.art, r.size, 'tm', num(r.so_luong)));
      const pkW = khId ? ' AND p.khach_hang_id = ?' : '';
      const { results: pk } = await env.DB.prepare(`
        SELECT p.ma_bo_phan, d.ma_hang, d.mau, s.size, s.so_luong FROM phieu_dong_size s
        JOIN phieu_dong d ON d.id = s.phieu_dong_id JOIN phieu p ON p.id = d.phieu_id
        WHERE p.ngay = ? AND COALESCE(p.trang_thai, '') <> 'cancelled' AND COALESCE(d.loai, '') NOT IN ('chi_tiet', 'khong_size')
          AND p.ma_bo_phan IN (${qs})${pkW}`).bind(ngay, ...tos.map(t => t.ma), ...(khId ? [khId] : [])).all();
      pk.forEach(r => put(r.ma_bo_phan, r.ma_hang, r.mau, r.size, 'pk', num(r.so_luong)));
    }
    const data = [...groups.values()].map(g => {
      const rows = [...g.rows.values()].map(r => {
        const sizes = Object.values(r.sz).map(s => ({ ...s, lech: s.tm - s.pk }));
        const tong_tm = sizes.reduce((a, s) => a + s.tm, 0), tong_pk = sizes.reduce((a, s) => a + s.pk, 0);
        return { po: r.po, art: r.art, sizes, tong_tm, tong_pk, lech: tong_tm - tong_pk, khop: sizes.every(s => s.tm === s.pk) };
      }).sort((a, b) => Number(a.khop) - Number(b.khop) || String(a.art).localeCompare(b.art) || String(a.po).localeCompare(b.po));
      const tong_tm = rows.reduce((a, r) => a + r.tong_tm, 0), tong_pk = rows.reduce((a, r) => a + r.tong_pk, 0);
      return { ma_bo_phan: g.ma_bo_phan, ten: g.ten, rows, tong_tm, tong_pk, lech: tong_tm - tong_pk, so_lech: rows.filter(r => !r.khop).length };
    });
    return ok({ data, co_dinh: ep });
  }
  return bad('API tổ may không tồn tại', 404);
}
