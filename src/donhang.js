/**
 * ĐƠN HÀNG (dữ liệu gốc) + XUẤT THEO ĐƠN HÀNG - D&D LONG AN
 * - Đơn hàng = dòng po_don_hang có cả PO và ART (bảng cũ, dùng chung với Phiếu xuất / Nhập kho / Công nợ),
 *   thêm số lượng theo size (don_hang_size) và ngày giao.
 * - Tiến độ theo từng size: Đặt · Đã thả chuyền (chỉ lệnh) · Đã xuất (phiếu xuất kho) · Điều chỉnh · Còn lại.
 * - Phiếu xuất KHÔNG bị sửa: khớp theo chữ PO (phieu_dong.ma_hang) + ART (phieu_dong.mau) của cùng khách hàng.
 * - Đơn (don_dat): 1 đơn của 1 khách gồm nhiều ART, mỗi ART nhiều PO (po_don_hang.don_id); API /api/dondat.
 * Chỉ thêm bảng mới; chạy được cả D1 lẫn CockroachDB.
 */
import { isSqlite, ddlTypes, ensureTables, str, int, num, parseJson, ok, bad, todayVN, normKey, normSize, runBatch } from './ddl.js';

const ID_TABLES = ['don_hang_size', 'don_hang_alias', 'dieu_chinh_xuat', 'chi_lenh', 'chi_lenh_dong', 'chi_lenh_dong_size', 'don_dat'];
export const TABLES = ID_TABLES;
export function schemaFor(sqlite) {
  const T = ddlTypes(sqlite);
  return [
    ...T.seqs(ID_TABLES),
    sqlite ? `ALTER TABLE po_don_hang ADD COLUMN ngay_giao TEXT DEFAULT ''`
      : `ALTER TABLE po_don_hang ADD COLUMN IF NOT EXISTS ngay_giao TEXT DEFAULT ''`,
    sqlite ? `ALTER TABLE po_don_hang ADD COLUMN don_id ${T.INT}`
      : `ALTER TABLE po_don_hang ADD COLUMN IF NOT EXISTS don_id ${T.INT}`,
    `CREATE TABLE IF NOT EXISTS don_dat (
      ${T.id('don_dat')},
      khach_hang_id ${T.INT} NOT NULL,
      so_don TEXT NOT NULL,
      ngay_giao TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      nguoi TEXT DEFAULT '',
      tao_luc ${T.TS}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_po_don ON po_don_hang(don_id)`,
    `CREATE TABLE IF NOT EXISTS don_hang_size (
      ${T.id('don_hang_size')},
      po_id ${T.INT} NOT NULL,
      size TEXT NOT NULL,
      so_luong ${T.REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_dhs_po ON don_hang_size(po_id)`,
    `CREATE TABLE IF NOT EXISTS don_hang_alias (
      ${T.id('don_hang_alias')},
      po_id ${T.INT} NOT NULL,
      khach_hang_id ${T.INT},
      po_text TEXT DEFAULT '',
      art_text TEXT DEFAULT '',
      nguoi TEXT DEFAULT '',
      tao_luc ${T.TS}
    )`,
    `CREATE TABLE IF NOT EXISTS dieu_chinh_xuat (
      ${T.id('dieu_chinh_xuat')},
      po_id ${T.INT} NOT NULL,
      size TEXT NOT NULL,
      so_luong ${T.REAL} DEFAULT 0,
      ly_do TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      so_phieu TEXT DEFAULT '',
      nguoi TEXT DEFAULT '',
      ngay TEXT DEFAULT '',
      nhom TEXT DEFAULT '',
      tao_luc ${T.TS}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_dcx_po ON dieu_chinh_xuat(po_id)`,
    `CREATE TABLE IF NOT EXISTS chi_lenh (
      ${T.id('chi_lenh')},
      so_cl TEXT UNIQUE NOT NULL,
      ngay TEXT NOT NULL,
      khach_hang_id ${T.INT},
      art TEXT DEFAULT '',
      ma_bo_phan TEXT DEFAULT '',
      nguoi_lap TEXT DEFAULT '',
      ghi_chu TEXT DEFAULT '',
      trang_thai TEXT DEFAULT 'mo',
      tong_sl ${T.REAL} DEFAULT 0,
      tao_luc ${T.TS}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cl_ngay ON chi_lenh(ngay)`,
    `CREATE TABLE IF NOT EXISTS chi_lenh_dong (
      ${T.id('chi_lenh_dong')},
      chi_lenh_id ${T.INT} NOT NULL,
      po_id ${T.INT},
      po TEXT DEFAULT '',
      thu_tu ${T.INT} DEFAULT 0,
      so_luong ${T.REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cld_cl ON chi_lenh_dong(chi_lenh_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cld_po ON chi_lenh_dong(po_id)`,
    `CREATE TABLE IF NOT EXISTS chi_lenh_dong_size (
      ${T.id('chi_lenh_dong_size')},
      dong_id ${T.INT} NOT NULL,
      size TEXT NOT NULL,
      so_luong ${T.REAL} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_clds_dong ON chi_lenh_dong_size(dong_id)`,
    // Đợt đơn hàng của khách (1, 2, 3...): phiếu xuất chỉ trừ vào đơn cùng đợt. Trống = đợt 1
    sqlite ? `ALTER TABLE don_dat ADD COLUMN dot ${T.INT}` : `ALTER TABLE don_dat ADD COLUMN IF NOT EXISTS dot ${T.INT}`,
    sqlite ? `ALTER TABLE phieu ADD COLUMN dot_don ${T.INT}` : `ALTER TABLE phieu ADD COLUMN IF NOT EXISTS dot_don ${T.INT}`,
    // Dòng đơn đã chọn ở danh sách PO (Lập phiếu): Diễn giải ghi thêm chữ (Hàng mẫu, Bù thành hình...) vẫn trừ vào dòng này
    sqlite ? `ALTER TABLE phieu_dong ADD COLUMN po_id ${T.INT}` : `ALTER TABLE phieu_dong ADD COLUMN IF NOT EXISTS po_id ${T.INT}`,
  ];
}
const PROBE = `SELECT p.ngay_giao, p.don_id, dd.dot, ph.dot_don, pd.po_id FROM po_don_hang p, don_hang_size s, don_hang_alias a, dieu_chinh_xuat d,
  chi_lenh c, chi_lenh_dong cd, chi_lenh_dong_size cs, don_dat dd, phieu ph, phieu_dong pd WHERE 1 = 0`;
export const ensureDonHangSchema = env => ensureTables(env, 'donhang_v1', PROBE, schemaFor(isSqlite(env)));

/* ---------------- Tiện ích ---------------- */
const orderKey = (kh, po, art) => `${kh}|${normKey(po)}|${normKey(art)}`;
const colorKey = (kh, po, art, mau) => `${orderKey(kh, po, art)}|${normKey(mau)}`;
/** Dòng đơn hàng trùng = cùng khách + PO + ART + Màu (trong cùng đợt) */
const dupText = d => `PO ${d.po} · ART ${d.art} · Màu ${d.mau || '(trống)'}`;
/** Đợt đơn hàng (đơn / phiếu chưa ghi đợt = đợt 1) */
export const dotOf = v => (int(v) > 0 ? int(v) : 1);
/** Đợt mới nhất có đơn của khách (phiếu lưu từ trang không chọn đợt -> lấy đợt này); chưa có đơn -> null */
export async function latestDot(env, khId) {
  if (!khId) return null;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(COALESCE(dot, 1)) AS m FROM don_dat WHERE khach_hang_id = ?').bind(khId).first();
  return r && r.n ? dotOf(r.m) : null;
}
/** Đợt gợi ý cho đơn mới: sau mọi đợt đã có đơn hoặc đã xuất phiếu (phiếu cũ chưa ghi đợt = đợt 1) */
async function nextDot(env, khId) {
  const d = await env.DB.prepare('SELECT MAX(COALESCE(dot, 1)) AS m FROM don_dat WHERE khach_hang_id = ?').bind(khId).first();
  const p = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(COALESCE(dot_don, 1)) AS m FROM phieu
    WHERE khach_hang_id = ? AND COALESCE(trang_thai, '') <> 'cancelled'`).bind(khId).first();
  return Math.max(int(d?.m) || 0, p?.n ? dotOf(p.m) : 0) + 1;
}
/** {size: so_luong} từ mảng [{size, so_luong}] (gộp size trùng sau chuẩn hóa) */
function sizeMap(list) {
  const m = {};
  (Array.isArray(list) ? list : []).forEach(s => {
    const k = normSize(s.size);
    const v = num(s.so_luong);
    if (k && v) m[k] = (m[k] || 0) + v;
  });
  return m;
}
const addTo = (m, size, v) => { if (v) m[size] = (m[size] || 0) + v; };
const sumOf = m => Object.values(m).reduce((a, v) => a + v, 0);

async function khachMap(env) {
  const { results } = await env.DB.prepare('SELECT id, ten_ngan, day_size, co_bo_chi_tiet, dvt FROM khach_hang').all();
  return new Map(results.map(k => [k.id, { ...k, day_size: parseJson(k.day_size, []) }]));
}
/** Thứ tự cột size: theo các dãy size của khách, size lạ xếp sau */
function sizeOrder(kh, extra) {
  const base = [];
  (kh?.day_size || []).forEach(d => (d.sizes || []).forEach(s => { const k = normSize(s); if (k && !base.includes(k)) base.push(k); }));
  const more = [...new Set(extra)].filter(s => !base.includes(s));
  return [...base, ...more];
}

/* ============================================================
   TÍNH TIẾN ĐỘ ĐƠN HÀNG
   o: { khId, poIds, excludeCl, excludePhieu, withEntries, withUnmatched }
   ============================================================ */
export async function tienDo(env, o = {}) {
  await ensureDonHangSchema(env);
  const khW = o.khId ? ' AND p.khach_hang_id = ?' : '';
  const khB = o.khId ? [o.khId] : [];
  const khs = await khachMap(env);

  let { results: orders } = await env.DB.prepare(
    `SELECT p.*, dd.dot AS dot FROM po_don_hang p LEFT JOIN don_dat dd ON dd.id = p.don_id
     WHERE TRIM(COALESCE(p.po, '')) <> '' AND TRIM(COALESCE(p.art, '')) <> ''${khW}
     ORDER BY p.khach_hang_id, p.art, p.po, p.id`).bind(...khB).all();
  orders.forEach(r => { r.dot = dotOf(r.dot); });
  const dotById = new Map(orders.map(r => [r.id, r.dot]));
  const keyById = new Map(orders.map(r => [r.id, orderKey(r.khach_hang_id, r.po, r.art)]));
  if (o.poIds) orders = orders.filter(r => o.poIds.includes(r.id));
  const byId = new Map(orders.map(r => [r.id, {
    ...r, dat: {}, tha: {}, xuat: {}, dc: {}, entries: [], adjustments: [], aliases: [],
  }]));

  const { results: dsz } = await env.DB.prepare(
    `SELECT s.po_id, s.size, s.so_luong FROM don_hang_size s JOIN po_don_hang p ON p.id = s.po_id WHERE 1 = 1${khW}`).bind(...khB).all();
  dsz.forEach(s => { const od = byId.get(s.po_id); if (od) addTo(od.dat, normSize(s.size), num(s.so_luong)); });

  const thaB = [...(o.excludeCl ? [o.excludeCl] : []), ...khB];
  const { results: tha } = await env.DB.prepare(`
    SELECT d.po_id, s.size, SUM(s.so_luong) AS sl
    FROM chi_lenh_dong_size s JOIN chi_lenh_dong d ON d.id = s.dong_id JOIN chi_lenh c ON c.id = d.chi_lenh_id
    WHERE c.trang_thai <> 'huy'${o.excludeCl ? ' AND c.id <> ?' : ''}${o.khId ? ' AND c.khach_hang_id = ?' : ''}
    GROUP BY d.po_id, s.size`).bind(...thaB).all();
  tha.forEach(s => { const od = byId.get(s.po_id); if (od) addTo(od.tha, normSize(s.size), num(s.sl)); });

  const { results: dcs } = await env.DB.prepare('SELECT * FROM dieu_chinh_xuat ORDER BY ngay, id').all();
  dcs.forEach(d => {
    const od = byId.get(d.po_id);
    if (!od) return;
    addTo(od.dc, normSize(d.size), num(d.so_luong));
    if (o.withEntries) od.adjustments.push(d);
  });

  // --- Đã xuất: khớp dòng phiếu xuất với đơn hàng cùng đợt (PO + ART, cùng PO + ART nhiều màu thì theo màu ở Diễn giải, không ra màu thì theo dòng đơn đã chọn) ---
  const keyMap = new Map(); // đợt|khách|PO|ART -> các dòng đơn
  const poMap = new Map();
  orders.forEach(r => {
    const k = `${r.dot}|${orderKey(r.khach_hang_id, r.po, r.art)}`;
    if (!keyMap.has(k)) keyMap.set(k, []);
    keyMap.get(k).push(r);
    const kp = `${r.dot}|${r.khach_hang_id}|${normKey(r.po)}`;
    if (!poMap.has(kp)) poMap.set(kp, new Set());
    poMap.get(kp).add(r.id);
  });
  const { results: als } = await env.DB.prepare('SELECT * FROM don_hang_alias').all();
  const aliasMap = new Map();
  als.forEach(a => {
    aliasMap.set(orderKey(a.khach_hang_id, a.po_text, a.art_text), a.po_id);
    const od = byId.get(a.po_id);
    if (od && o.withEntries) od.aliases.push(a);
  });
  /** Cùng PO + ART có nhiều màu: chọn theo màu ghi ở Diễn giải (đúng màu, hoặc Diễn giải chứa đúng 1 màu) */
  const byColor = (list, dg) => {
    const m = normKey(dg);
    if (!m) return null;
    const exact = list.filter(r => normKey(r.mau) === m);
    if (exact.length === 1) return exact[0].id;
    const inText = list.filter(r => normKey(r.mau) && m.includes(normKey(r.mau)));
    return inText.length === 1 ? inText[0].id : null;
  };
  const match = (kh, po, art, dg, dot, link) => {
    const k = orderKey(kh, po, art);
    const list = keyMap.get(`${dot}|${k}`) || [];
    if (list.length > 1) { const c = byColor(list, dg); if (c) return c; }
    // Dòng đơn đã chọn ở danh sách PO: còn đúng PO + ART + đợt thì trừ vào đó (Diễn giải không ghi rõ màu khác)
    if (link && keyById.get(link) === k && dotById.get(link) === dot) return link;
    if (aliasMap.has(k) && dotById.get(aliasMap.get(k)) === dot) return aliasMap.get(k); // gán tay: chỉ trong cùng đợt
    if (list.length === 1) return list[0].id;
    // Nhiều màu mà Diễn giải không ghi màu -> để "chưa khớp" cho người dùng gán; dòng trùng hẳn (cùng màu) lấy dòng đầu như cũ
    if (list.length > 1) return new Set(list.map(r => normKey(r.mau))).size === 1 ? list[0].id : null;
    if (!normKey(art)) {
      const ids = poMap.get(`${dot}|${kh}|${normKey(po)}`);
      if (ids && ids.size === 1) return [...ids][0];
    }
    return null;
  };

  // excludePhieu: bỏ phiếu đang sửa (tính "còn lại" khi lập / sửa phiếu)
  const pW = (o.khId ? ' AND p.khach_hang_id = ?' : '') + (o.excludePhieu ? ' AND p.id <> ?' : '');
  const pB = [...khB, ...(o.excludePhieu ? [o.excludePhieu] : [])];
  const { results: lines } = await env.DB.prepare(`
    SELECT d.id, d.phieu_id, d.stt, d.ma_hang, d.mau, d.dvt, d.loai, d.ghi_chu, d.sl_chung_tu, d.po_id, p.so_phieu, p.ngay, p.khach_hang_id, p.dot_don
    FROM phieu_dong d JOIN phieu p ON p.id = d.phieu_id
    WHERE COALESCE(p.trang_thai, '') <> 'cancelled' AND COALESCE(d.loai, '') NOT IN ('chi_tiet', 'khong_size')${pW}
    ORDER BY p.ngay, p.id, d.stt, d.id`).bind(...pB).all();
  const { results: psz } = await env.DB.prepare(`
    SELECT s.phieu_dong_id, s.size, s.so_luong FROM phieu_dong_size s
    JOIN phieu_dong d ON d.id = s.phieu_dong_id JOIN phieu p ON p.id = d.phieu_id
    WHERE COALESCE(p.trang_thai, '') <> 'cancelled'${pW}`).bind(...pB).all();
  const lineSz = new Map();
  psz.forEach(s => {
    if (!lineSz.has(s.phieu_dong_id)) lineSz.set(s.phieu_dong_id, {});
    addTo(lineSz.get(s.phieu_dong_id), normSize(s.size), num(s.so_luong));
  });

  const unmatched = [];
  const groups = new Map(); // phiếu + đơn hàng -> các dòng
  for (const l of lines) {
    const sz = lineSz.get(l.id);
    if (!sz || !sumOf(sz)) continue;
    const dot = dotOf(l.dot_don);
    const poId = l.khach_hang_id ? match(l.khach_hang_id, l.ma_hang, l.mau, l.ghi_chu, dot, int(l.po_id)) : null;
    if (!poId || !byId.has(poId)) {
      if (poId) continue; // khớp đơn hàng nằm ngoài bộ lọc
      const dongBoCu = l.loai !== 'dong_bo' && normKey(`${l.ma_hang}${l.mau}${l.ghi_chu}`).includes('DONGBO');
      if (o.withUnmatched && (str(l.ma_hang) || str(l.mau)) && !dongBoCu) {
        unmatched.push({ dong_id: l.id, phieu_id: l.phieu_id, so_phieu: l.so_phieu, ngay: l.ngay, khach_hang_id: l.khach_hang_id, dot,
          po: l.ma_hang, art: l.mau, ghi_chu: l.ghi_chu, dvt: l.dvt, sizes: sz, tong: sumOf(sz) });
      }
      continue;
    }
    const gk = `${l.phieu_id}|${poId}`;
    if (!groups.has(gk)) groups.set(gk, { poId, lines: [] });
    groups.get(gk).lines.push({ ...l, sz });
  }

  for (const g of groups.values()) {
    const od = byId.get(g.poId);
    const kh = khs.get(od.khach_hang_id);
    const first = g.lines[0];
    let sizes = {};
    let cach = 'cong';
    const dongBo = g.lines.filter(l => l.loai === 'dong_bo');
    if (dongBo.length) {
      dongBo.forEach(l => Object.entries(l.sz).forEach(([s, v]) => addTo(sizes, s, v)));
      cach = 'dong_bo';
    } else if (kh?.co_bo_chi_tiet && g.lines.length > 1 && g.lines.some(l => /mi[eế]ng/i.test(l.dvt || ''))) {
      // Phiếu cũ ghi từng chi tiết của bộ: số đôi = nhỏ nhất của các chi tiết (Miếng ÷ 2)
      // (phiếu "xuất theo đôi" ghi ĐVT Đôi -> cộng bình thường ở nhánh dưới)
      const all = new Set(g.lines.flatMap(l => Object.keys(l.sz)));
      all.forEach(s => {
        const v = Math.floor(Math.min(...g.lines.map(l => (l.sz[s] || 0) / (/mi[eế]ng/i.test(l.dvt || '') ? 2 : 1))));
        if (v > 0) sizes[s] = v;
      });
      cach = 'dong_bo_chi_tiet';
    } else {
      g.lines.forEach(l => Object.entries(l.sz).forEach(([s, v]) => addTo(sizes, s, v)));
    }
    Object.entries(sizes).forEach(([s, v]) => addTo(od.xuat, s, v));
    if (o.withEntries) {
      od.entries.push({ phieu_id: first.phieu_id, so_phieu: first.so_phieu, ngay: first.ngay, sizes, tong: sumOf(sizes), cach,
        so_dong: g.lines.length, ghi_chu: [...new Set(g.lines.map(l => str(l.ghi_chu)).filter(Boolean))].slice(0, 3).join(', ') });
    }
  }

  // --- Kết quả theo từng size ---
  const out = [...byId.values()].map(od => {
    const kh = khs.get(od.khach_hang_id);
    const cols = sizeOrder(kh, [od.dat, od.tha, od.xuat, od.dc].flatMap(m => Object.keys(m)));
    const sizes = cols.map(s => {
      const dat = od.dat[s] || 0, tha_ = od.tha[s] || 0, xuat = od.xuat[s] || 0, dc = od.dc[s] || 0;
      return { size: s, dat, tha: tha_, xuat, dc, con: dat - xuat - dc, chua_tha: dat - tha_ };
    });
    const t = k => sizes.reduce((a, s) => a + s[k], 0);
    const conPhaiGiao = sizes.reduce((a, s) => a + Math.max(0, s.con), 0);
    const r = {
      id: od.id, don_id: od.don_id || null, dot: od.dot, khach_hang_id: od.khach_hang_id, khach_ten: kh?.ten_ngan || '', po: od.po, art: od.art, mau: od.mau,
      don_hang: od.don_hang, don_gia: od.don_gia, ngay_giao: od.ngay_giao || '', ghi_chu: od.ghi_chu,
      sizes, tong_dat: t('dat'), tong_tha: t('tha'), tong_xuat: t('xuat'), tong_dc: t('dc'),
      con_phai_giao: conPhaiGiao, giao_du: sizes.reduce((a, s) => a + Math.max(0, -s.con), 0),
      con_chua_tha: sizes.reduce((a, s) => a + Math.max(0, s.chua_tha), 0),
      trang_thai: t('dat') > 0 && conPhaiGiao <= 0 ? 'du' : 'con',
    };
    if (o.withEntries) { r.entries = od.entries; r.adjustments = od.adjustments; r.aliases = od.aliases; }
    return r;
  });
  return { orders: out, unmatched };
}

/* ---------------- Ghi đơn hàng ---------------- */
/** Các dòng đơn của khách kèm đợt (dòng chưa thuộc đơn = đợt 1) */
async function khachLines(env, khId) {
  const { results } = await env.DB.prepare(`SELECT p.id, p.khach_hang_id, p.po, p.art, p.mau, p.don_id, dd.dot AS dot
    FROM po_don_hang p LEFT JOIN don_dat dd ON dd.id = p.don_id WHERE p.khach_hang_id = ?`).bind(khId).all();
  results.forEach(r => { r.dot = dotOf(r.dot); });
  return results;
}
/** Dòng trùng (chỉ so trong cùng đợt với dòng đang sửa; dòng mới chưa thuộc đơn = đợt 1) */
async function findDuplicate(env, d, exceptId) {
  const all = await khachLines(env, d.khach_hang_id);
  const dot = all.find(r => r.id === exceptId)?.dot || 1;
  const k = colorKey(d.khach_hang_id, d.po, d.art, d.mau);
  return all.find(r => r.dot === dot && r.id !== exceptId && colorKey(d.khach_hang_id, r.po, r.art, r.mau) === k) || null;
}
async function writeSizes(env, poId, sizes) {
  await env.DB.prepare('DELETE FROM don_hang_size WHERE po_id = ?').bind(poId).run();
  for (const [size, sl] of Object.entries(sizes)) {
    await env.DB.prepare('INSERT INTO don_hang_size (po_id, size, so_luong) VALUES (?, ?, ?) RETURNING id').bind(poId, size, sl).first();
  }
}
function cleanOrder(b) {
  return {
    khach_hang_id: int(b.khach_hang_id), po: str(b.po), art: str(b.art), mau: str(b.mau), don_hang: str(b.don_hang),
    don_gia: num(b.don_gia), ngay_giao: /^\d{4}-\d{2}-\d{2}$/.test(str(b.ngay_giao)) ? str(b.ngay_giao) : '',
    ghi_chu: str(b.ghi_chu), sizes: sizeMap(b.sizes),
  };
}
const checkOrder = d => (!d.khach_hang_id ? 'Chưa chọn khách hàng' : !d.art ? 'Chưa nhập ART' : !d.po ? 'Chưa nhập PO' : null);
async function insertOrder(env, d) {
  const r = await env.DB.prepare(`INSERT INTO po_don_hang (khach_hang_id, po, don_hang, art, mau, don_gia, ghi_chu, ngay_giao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(d.khach_hang_id, d.po, d.don_hang, d.art, d.mau, d.don_gia, d.ghi_chu, d.ngay_giao).first();
  await writeSizes(env, r.id, d.sizes);
  return r.id;
}
async function updateOrder(env, id, d, giuSize) {
  await env.DB.prepare(`UPDATE po_don_hang SET khach_hang_id = ?, po = ?, don_hang = ?, art = ?, mau = ?, don_gia = ?, ghi_chu = ?, ngay_giao = ? WHERE id = ?`)
    .bind(d.khach_hang_id, d.po, d.don_hang, d.art, d.mau, d.don_gia, d.ghi_chu, d.ngay_giao, id).run();
  if (!giuSize) await writeSizes(env, id, d.sizes); // không gửi sizes -> giữ số lượng size cũ
}
async function activeChiLenhCount(env, poId) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chi_lenh_dong d JOIN chi_lenh c ON c.id = d.chi_lenh_id
    WHERE d.po_id = ? AND c.trang_thai <> 'huy'`).bind(poId).first();
  return r.n || 0;
}

async function deleteOrderRow(env, id) {
  await env.DB.prepare('DELETE FROM don_hang_size WHERE po_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM don_hang_alias WHERE po_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM dieu_chinh_xuat WHERE po_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM po_don_hang WHERE id = ?').bind(id).run();
  try { await env.DB.prepare('DELETE FROM chat_dinh_muc WHERE po_id = ?').bind(id).run(); } catch (_) { /* bảng tổ chặt chưa tạo */ }
}

/* ---------------- ĐƠN: nhiều ART · nhiều PO ---------------- */
/** Gộp tiến độ các PO thành 1 dòng tổng của đơn */
function tongDon(head, rows) {
  const t = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const con = t('con_phai_giao');
  return {
    ...head, so_art: new Set(rows.map(r => normKey(r.art))).size, so_po: rows.length,
    tong_dat: t('tong_dat'), tong_tha: t('tong_tha'), tong_xuat: t('tong_xuat') + t('tong_dc'), con_phai_giao: con,
    trang_thai: t('tong_dat') > 0 && con <= 0 ? 'du' : 'con',
    _search: [head.so_don, ...rows.flatMap(r => [r.po, r.art])].map(normKey).join(' '),
  };
}

/**
 * Kiểm tra đầu đơn + các dòng PO trước khi ghi (lỗi thì không ghi gì).
 * Dòng trống bị bỏ; ART trống lấy ART dòng trên (Excel hay gộp ô ART).
 */
async function checkDon(env, b, donId) {
  const khId = int(b.khach_hang_id);
  const soDon = str(b.so_don);
  const errs = [];
  if (!khId) errs.push('Chưa chọn khách hàng');
  if (!soDon) errs.push('Chưa nhập số đơn');
  if (errs.length) return { errs };
  const { results: dons } = await env.DB.prepare('SELECT id, so_don, dot FROM don_dat WHERE khach_hang_id = ?').bind(khId).all();
  if (dons.some(d => d.id !== donId && normKey(d.so_don) === normKey(soDon))) errs.push(`Số đơn ${soDon} đã có rồi`);
  // Đợt: không gửi -> đơn đang sửa giữ đợt cũ, đơn mới lấy đợt kế tiếp
  const dot = int(b.dot) > 0 ? int(b.dot)
    : donId ? dotOf(dons.find(d => d.id === donId)?.dot) : await nextDot(env, khId);
  if (dot > 999) errs.push('Số đợt không hợp lệ');

  const all = await khachLines(env, khId);
  const haveById = new Map(all.map(r => [r.id, r]));
  const have = all.filter(r => r.dot === dot); // trùng chỉ tính trong cùng đợt (PO + ART + Màu được lặp lại ở đợt khác)
  const lines = [];
  const seen = new Map();
  let lastArt = '';
  (Array.isArray(b.lines) ? b.lines : []).forEach((it, i) => {
    const d = cleanOrder({ ...it, khach_hang_id: khId });
    d.id = int(it.id);
    d.row = i + 1;
    if (!d.art && !d.po && !Object.keys(d.sizes).length && !d.id) return; // dòng trống
    if (!d.art) d.art = lastArt;
    lastArt = d.art;
    if (!d.ngay_giao) d.ngay_giao = /^\d{4}-\d{2}-\d{2}$/.test(str(b.ngay_giao)) ? str(b.ngay_giao) : '';
    d.don_hang = soDon;
    if (!d.art || !d.po) { errs.push(`Dòng ${d.row}: chưa có ${!d.art ? 'ART' : 'PO'}`); return; }
    if (d.id) {
      const old = haveById.get(d.id);
      // Dòng có id phải thuộc đơn này (hoặc PO lẻ chưa thuộc đơn nào của cùng khách)
      if (!old || (old.don_id && old.don_id !== donId)) { errs.push(`Dòng ${d.row}: PO không thuộc đơn này`); return; }
    }
    const k = colorKey(khId, d.po, d.art, d.mau);
    if (seen.has(k)) { errs.push(`Dòng ${d.row}: ${dupText(d)} trùng dòng ${seen.get(k)}`); return; }
    seen.set(k, d.row);
    lines.push(d);
  });
  if (!lines.length && !errs.length) errs.push('Đơn chưa có dòng PO nào');
  const ids = new Set(lines.map(l => l.id).filter(Boolean));
  lines.forEach(d => {
    const k = colorKey(khId, d.po, d.art, d.mau);
    const dup = have.find(r => !ids.has(r.id) && !(donId && r.don_id === donId) && colorKey(khId, r.po, r.art, r.mau) === k);
    if (dup) errs.push(`Dòng ${d.row}: ${dupText(d)} đã có ở đơn khác của đợt ${dot}`);
  });
  return { errs, khId, soDon, dot, lines, ids };
}

/** Ghi các dòng PO của đơn theo lô: lô 1 = thêm / sửa dòng (+ xóa size cũ), lô 2 = ghi size */
async function saveDonLines(env, donId, lines) {
  const stmts = [];
  lines.forEach(d => {
    if (d.id) {
      stmts.push(env.DB.prepare(`UPDATE po_don_hang SET khach_hang_id = ?, po = ?, don_hang = ?, art = ?, mau = ?, don_gia = ?, ghi_chu = ?, ngay_giao = ?, don_id = ? WHERE id = ? RETURNING id`)
        .bind(d.khach_hang_id, d.po, d.don_hang, d.art, d.mau, d.don_gia, d.ghi_chu, d.ngay_giao, donId, d.id));
    } else {
      stmts.push(env.DB.prepare(`INSERT INTO po_don_hang (khach_hang_id, po, don_hang, art, mau, don_gia, ghi_chu, ngay_giao, don_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(d.khach_hang_id, d.po, d.don_hang, d.art, d.mau, d.don_gia, d.ghi_chu, d.ngay_giao, donId));
    }
  });
  const res = await runBatch(env, stmts);
  const ids = res.map(r => r.results[0].id);
  const sz = [];
  lines.forEach((d, i) => {
    sz.push(env.DB.prepare('DELETE FROM don_hang_size WHERE po_id = ?').bind(ids[i]));
    Object.entries(d.sizes).forEach(([size, sl]) => sz.push(env.DB.prepare('INSERT INTO don_hang_size (po_id, size, so_luong) VALUES (?, ?, ?)').bind(ids[i], size, sl)));
  });
  await runBatch(env, sz);
}

async function handleDonDatApi(path, method, url, request, env, user) {
  if (path === '/api/dondat' && method === 'GET') {
    const khId = int(url.searchParams.get('khach_hang_id'));
    const { orders } = await tienDo(env, { khId });
    const { results: dons } = await env.DB.prepare(
      `SELECT * FROM don_dat${khId ? ' WHERE khach_hang_id = ?' : ''} ORDER BY id DESC`).bind(...(khId ? [khId] : [])).all();
    const khs = await khachMap(env);
    const list = dons.map(d => tongDon({ id: d.id, so_don: d.so_don, dot: dotOf(d.dot), ngay_giao: d.ngay_giao, ghi_chu: d.ghi_chu,
      khach_hang_id: d.khach_hang_id, khach_ten: khs.get(d.khach_hang_id)?.ten_ngan || '', tao_luc: d.tao_luc },
    orders.filter(o => o.don_id === d.id)));
    // PO nhập lẻ trước khi có "đơn" -> 1 nhóm "Chưa thuộc đơn" mỗi khách
    const le = new Map();
    orders.filter(o => !o.don_id).forEach(o => { if (!le.has(o.khach_hang_id)) le.set(o.khach_hang_id, []); le.get(o.khach_hang_id).push(o); });
    le.forEach((rows, kh) => list.push(tongDon({ id: 0, so_don: '(PO chưa thuộc đơn)', ngay_giao: '', ghi_chu: '', khach_hang_id: kh,
      khach_ten: khs.get(kh)?.ten_ngan || '' }, rows)));
    const q = normKey(url.searchParams.get('q'));
    const tt = url.searchParams.get('trang_thai') || '';
    const data = list.filter(d => (!q || d._search.includes(q)) && (!tt || tt === 'all' || d.trang_thai === tt))
      .map(({ _search, ...d }) => d);
    return ok({ data, dot_moi: khId ? await nextDot(env, khId) : null });
  }
  const one = path.match(/^\/api\/dondat\/(\d+)$/);
  if (one && method === 'GET') {
    const id = int(one[1]);
    let head;
    if (id) {
      head = await env.DB.prepare('SELECT * FROM don_dat WHERE id = ?').bind(id).first();
      if (!head) return bad('Không tìm thấy đơn', 404);
      head.dot = dotOf(head.dot);
    } else {
      head = { id: 0, so_don: '', ngay_giao: '', ghi_chu: '', khach_hang_id: int(url.searchParams.get('khach_hang_id')) };
      if (!head.khach_hang_id) return bad('Chưa chọn khách hàng');
    }
    const { orders } = await tienDo(env, { khId: head.khach_hang_id });
    const lines = orders.filter(o => (id ? o.don_id === id : !o.don_id)).sort((a, b) => a.id - b.id);
    return ok({ data: { ...head, lines } });
  }
  if (path === '/api/dondat' && method === 'POST') {
    const body = await request.json();
    const c = await checkDon(env, body, 0);
    if (c.errs.length) return bad(c.errs.slice(0, 12).join('\n'));
    const r = await env.DB.prepare('INSERT INTO don_dat (khach_hang_id, so_don, ngay_giao, ghi_chu, nguoi, dot) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(c.khId, c.soDon, str(body.ngay_giao), str(body.ghi_chu), user?.ho_ten || '', c.dot).first();
    await saveDonLines(env, r.id, c.lines);
    return ok({ id: r.id, message: `Đã lưu đơn ${c.soDon} (đợt ${c.dot}) · ${c.lines.length} PO` });
  }
  if (one && method === 'PUT') {
    const id = int(one[1]);
    const head = await env.DB.prepare('SELECT * FROM don_dat WHERE id = ?').bind(id).first();
    if (!head) return bad('Không tìm thấy đơn', 404);
    const body = await request.json();
    const c = await checkDon(env, { ...body, khach_hang_id: head.khach_hang_id }, id);
    // Dòng bị bỏ khỏi bảng -> xóa PO, trừ PO đã thả chuyền
    const { results: cur } = await env.DB.prepare('SELECT id, po, art FROM po_don_hang WHERE don_id = ?').bind(id).all();
    const bo = cur.filter(r => !c.ids?.has(r.id));
    if (!c.errs.length) for (const r of bo) {
      if (await activeChiLenhCount(env, r.id)) c.errs.push(`PO ${r.po} · ART ${r.art} đã có chỉ lệnh thả chuyền, không bỏ khỏi đơn được`);
    }
    if (c.errs.length) return bad(c.errs.slice(0, 12).join('\n'));
    await env.DB.prepare('UPDATE don_dat SET so_don = ?, ngay_giao = ?, ghi_chu = ?, dot = ? WHERE id = ?')
      .bind(c.soDon, str(body.ngay_giao), str(body.ghi_chu), c.dot, id).run();
    await saveDonLines(env, id, c.lines);
    for (const r of bo) await deleteOrderRow(env, r.id);
    return ok({ id, message: `Đã lưu đơn ${c.soDon} (đợt ${c.dot}) · ${c.lines.length} PO${bo.length ? ` · bỏ ${bo.length} PO` : ''}` });
  }
  if (one && method === 'DELETE') {
    const id = int(one[1]);
    const { results: cur } = await env.DB.prepare('SELECT id, po FROM po_don_hang WHERE don_id = ?').bind(id).all();
    for (const r of cur) {
      if (await activeChiLenhCount(env, r.id)) return bad(`PO ${r.po} đã có chỉ lệnh thả chuyền. Hủy các chỉ lệnh đó trước khi xóa đơn.`);
    }
    for (const r of cur) await deleteOrderRow(env, r.id);
    await env.DB.prepare('DELETE FROM don_dat WHERE id = ?').bind(id).run();
    return ok({ message: `Đã xóa đơn · ${cur.length} PO` });
  }
  return null;
}

/** Lọc theo ô tìm (PO / ART / đơn hàng / màu) và trạng thái */
function filterOrders(list, url) {
  const q = normKey(url.searchParams.get('q'));
  const tt = url.searchParams.get('trang_thai') || '';
  const art = url.searchParams.get('art');
  return list.filter(r =>
    (!q || [r.po, r.art, r.don_hang, r.mau].some(v => normKey(v).includes(q))) &&
    (!art || normKey(r.art) === normKey(art)) &&
    (!tt || tt === 'all' || r.trang_thai === tt));
}

/* ============================================================
   ROUTER
   ============================================================ */
export async function handleDonHangApi(path, method, url, request, env, user) {
  // Chặn xóa PO ở mục Bảng giá khi PO đó đã có chỉ lệnh (để catalog.js xử lý phần còn lại)
  const poDel = path.match(/^\/api\/po\/(\d+)$/);
  if (poDel && method === 'DELETE') {
    await ensureDonHangSchema(env);
    if (await activeChiLenhCount(env, int(poDel[1]))) return bad('PO này đã có chỉ lệnh thả chuyền, không xóa được');
    await env.DB.prepare('DELETE FROM don_hang_size WHERE po_id = ?').bind(int(poDel[1])).run();
    return null;
  }
  const isDh = path === '/api/donhang' || path.startsWith('/api/donhang/');
  const isTd = path === '/api/theodoi' || path.startsWith('/api/theodoi/');
  const isDc = path === '/api/dieuchinh' || path.startsWith('/api/dieuchinh/');
  const isDd = path === '/api/dondat' || path.startsWith('/api/dondat/');
  const isCl = path === '/api/conlai';
  if (!isDh && !isTd && !isDc && !isDd && !isCl) return null;
  await ensureDonHangSchema(env);
  const nguoi = user?.ho_ten || '';
  if (isDd) return (await handleDonDatApi(path, method, url, request, env, user)) || bad('Endpoint không tồn tại', 404);

  // ---------------- CÒN LẠI THEO DÒNG ĐƠN (lập phiếu: ô PO chọn từ danh sách + cột Còn lại) ----------------
  // Còn lại từng size = đặt − đã xuất − điều chỉnh, không tính phiếu đang sửa (tru_phieu)
  if (isCl && method === 'GET') {
    const khId = int(url.searchParams.get('khach_hang_id'));
    if (!khId) return bad('Chưa chọn khách hàng');
    const { orders } = await tienDo(env, { khId, excludePhieu: int(url.searchParams.get('tru_phieu')) });
    // Các đợt của khách (ô chọn "Đợt đơn hàng" trên phiếu) + đợt mới nhất (mặc định cho phiếu mới)
    const { results: dons } = await env.DB.prepare('SELECT dot, so_don FROM don_dat WHERE khach_hang_id = ? ORDER BY id').bind(khId).all();
    const dots = new Map();
    dons.forEach(d => { const k = dotOf(d.dot); dots.set(k, [...(dots.get(k) || []), d.so_don]); });
    if (orders.some(o => !o.don_id) && !dots.has(1)) dots.set(1, []); // PO lẻ chưa thuộc đơn = đợt 1
    return ok({ data: orders.map(o => ({ id: o.id, dot: o.dot, po: o.po, art: o.art, mau: o.mau || '', don_hang: o.don_hang || '',
      sizes: Object.fromEntries(o.sizes.map(s => [s.size, s.con])), tong_dat: o.tong_dat })),
    dots: [...dots].sort((a, b) => a[0] - b[0]).map(([dot, don]) => ({ dot, don })), latest: await latestDot(env, khId) });
  }

  // ---------------- ĐƠN HÀNG ----------------
  if (path === '/api/donhang' && method === 'GET') {
    const { orders } = await tienDo(env, { khId: int(url.searchParams.get('khach_hang_id')) });
    // Đánh dấu dòng trùng (khách + PO + ART + Màu) có từ trước
    const cnt = new Map();
    const tk = r => `${r.dot}|${colorKey(r.khach_hang_id, r.po, r.art, r.mau)}`;
    orders.forEach(r => cnt.set(tk(r), (cnt.get(tk(r)) || 0) + 1));
    const data = filterOrders(orders, url).map(r => ({ ...r, trung: cnt.get(tk(r)) > 1 }));
    return ok({ data });
  }
  if (path === '/api/donhang' && method === 'POST') {
    const b = await request.json();
    if (Array.isArray(b.items)) {
      // Dán từ Excel: trùng thì cập nhật (mode=update) hoặc bỏ qua
      let them = 0, capNhat = 0, boQua = 0;
      const loi = [];
      for (const [i, it] of b.items.entries()) {
        const d = cleanOrder({ ...it, khach_hang_id: it.khach_hang_id || b.khach_hang_id });
        const err = checkOrder(d);
        if (err) { loi.push(`Dòng ${i + 1}: ${err}`); continue; }
        const dup = await findDuplicate(env, d, 0);
        if (dup) {
          if (b.mode === 'update') { await updateOrder(env, dup.id, d); capNhat++; } else boQua++;
          continue;
        }
        await insertOrder(env, d);
        them++;
      }
      return ok({ them, cap_nhat: capNhat, bo_qua: boQua, loi, message: `Đã thêm ${them}, cập nhật ${capNhat}, bỏ qua ${boQua} dòng` });
    }
    const d = cleanOrder(b);
    const err = checkOrder(d);
    if (err) return bad(err);
    if (await findDuplicate(env, d, 0)) return bad(`Đã có đơn hàng ${dupText(d)} của khách này`);
    const id = await insertOrder(env, d);
    return ok({ id, message: `Đã thêm đơn hàng PO ${d.po}` });
  }
  const dhM = path.match(/^\/api\/donhang\/(\d+)$/);
  if (dhM && method === 'PUT') {
    const id = int(dhM[1]);
    const b = await request.json();
    const d = cleanOrder(b);
    const err = checkOrder(d);
    if (err) return bad(err);
    if (await findDuplicate(env, d, id)) return bad(`Đã có đơn hàng ${dupText(d)} của khách này`);
    // PO đã thả chuyền: không cho đổi khách / ART (chỉ lệnh đang trỏ vào PO này)
    const cu = await env.DB.prepare('SELECT khach_hang_id, art FROM po_don_hang WHERE id = ?').bind(id).first();
    if (cu && (cu.khach_hang_id !== d.khach_hang_id || normKey(cu.art) !== normKey(d.art)) && await activeChiLenhCount(env, id)) {
      return bad('PO này đã có chỉ lệnh thả chuyền, không đổi khách hàng / ART được');
    }
    await updateOrder(env, id, d, b.sizes === undefined);
    return ok({ id, message: 'Đã lưu đơn hàng' });
  }
  if (dhM && method === 'DELETE') {
    const id = int(dhM[1]);
    const n = await activeChiLenhCount(env, id);
    if (n) return bad(`Đơn hàng đã có ${n} dòng chỉ lệnh thả chuyền. Hủy các chỉ lệnh đó trước khi xóa.`);
    await deleteOrderRow(env, id);
    return ok({ message: 'Đã xóa đơn hàng' });
  }

  // ---------------- XUẤT THEO ĐƠN HÀNG ----------------
  if (path === '/api/theodoi' && method === 'GET') {
    const khId = int(url.searchParams.get('khach_hang_id'));
    const { orders, unmatched } = await tienDo(env, { khId, withEntries: true, withUnmatched: true });
    const q = normKey(url.searchParams.get('q'));
    const um = unmatched.filter(u => !q || [u.po, u.art, u.so_phieu].some(v => normKey(v).includes(q)));
    return ok({ data: filterOrders(orders, url), unmatched: um.slice(-300) });
  }
  // Gán dòng phiếu xuất (gõ sai PO/ART) vào đơn hàng
  if (path === '/api/theodoi/gan' && method === 'POST') {
    const b = await request.json();
    const poId = int(b.po_id);
    const od = poId ? await env.DB.prepare('SELECT id, khach_hang_id FROM po_don_hang WHERE id = ?').bind(poId).first() : null;
    if (!od) return bad('Chưa chọn đơn hàng');
    if (!str(b.po_text) && !str(b.art_text)) return bad('Dòng phiếu không có PO / ART để gán');
    const kh = int(b.khach_hang_id);
    if (!kh) return bad('Phiếu xuất này chưa chọn khách hàng. Mở phiếu, chọn khách hàng rồi lưu lại.');
    if (kh !== od.khach_hang_id) return bad('Đơn hàng không cùng khách hàng với phiếu xuất');
    const { results } = await env.DB.prepare('SELECT id, po_text, art_text FROM don_hang_alias WHERE khach_hang_id = ?').bind(kh).all();
    const k = orderKey(kh, b.po_text, b.art_text);
    for (const a of results.filter(a => orderKey(kh, a.po_text, a.art_text) === k)) {
      await env.DB.prepare('DELETE FROM don_hang_alias WHERE id = ?').bind(a.id).run();
    }
    await env.DB.prepare('INSERT INTO don_hang_alias (po_id, khach_hang_id, po_text, art_text, nguoi) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(poId, kh, str(b.po_text), str(b.art_text), nguoi).first();
    return ok({ message: 'Đã gán vào đơn hàng' });
  }
  const ganM = path.match(/^\/api\/theodoi\/gan\/(\d+)$/);
  if (ganM && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM don_hang_alias WHERE id = ?').bind(int(ganM[1])).run();
    return ok({ message: 'Đã bỏ gán' });
  }

  // ---------------- ĐIỀU CHỈNH SỐ ĐÃ XUẤT ----------------
  if (path === '/api/dieuchinh' && method === 'POST') {
    const b = await request.json();
    const poId = int(b.po_id);
    const od = poId ? await env.DB.prepare('SELECT id FROM po_don_hang WHERE id = ?').bind(poId).first() : null;
    if (!od) return bad('Chưa chọn đơn hàng');
    const sl = Math.abs(num(b.so_luong));
    const ngay = /^\d{4}-\d{2}-\d{2}$/.test(str(b.ngay)) ? str(b.ngay) : todayVN();
    const rows = [];
    if (b.kieu === 'doi_size') {
      const tu = normSize(b.tu_size), sang = normSize(b.sang_size);
      if (!tu || !sang || tu === sang) return bad('Chọn size ghi trên phiếu và size giao thực tế (khác nhau)');
      if (!sl) return bad('Chưa nhập số lượng');
      rows.push([tu, -sl], [sang, sl]);
    } else {
      const size = normSize(b.size);
      const v = num(b.so_luong);
      if (!size) return bad('Chưa chọn size');
      if (!v) return bad('Chưa nhập số lượng (+ hoặc −)');
      rows.push([size, v]);
    }
    const nhom = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for (const [size, v] of rows) {
      await env.DB.prepare(`INSERT INTO dieu_chinh_xuat (po_id, size, so_luong, ly_do, ghi_chu, so_phieu, nguoi, ngay, nhom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(poId, size, v, str(b.ly_do) || 'Khác', str(b.ghi_chu), str(b.so_phieu), nguoi, ngay, nhom).first();
    }
    return ok({ message: 'Đã ghi điều chỉnh' });
  }
  const dcM = path.match(/^\/api\/dieuchinh\/(\d+)$/);
  if (dcM && method === 'DELETE') {
    const r = await env.DB.prepare('SELECT nhom FROM dieu_chinh_xuat WHERE id = ?').bind(int(dcM[1])).first();
    if (!r) return bad('Không tìm thấy dòng điều chỉnh', 404);
    // Xóa cả cặp "đổi size"
    if (r.nhom) await env.DB.prepare('DELETE FROM dieu_chinh_xuat WHERE nhom = ?').bind(r.nhom).run();
    else await env.DB.prepare('DELETE FROM dieu_chinh_xuat WHERE id = ?').bind(int(dcM[1])).run();
    return ok({ message: 'Đã xóa điều chỉnh' });
  }

  return bad('API đơn hàng không tồn tại', 404);
}
