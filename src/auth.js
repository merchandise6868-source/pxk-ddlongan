/**
 * ĐĂNG NHẬP & PHÂN QUYỀN - D&D LONG AN
 * - Nhóm quyền: admin tick tab nào nhóm đó được thấy; mỗi tài khoản thuộc 1 nhóm.
 * - Phiên đăng nhập: cookie HttpOnly chứa mã ngẫu nhiên, database chỉ lưu SHA-256 của mã.
 * - Mật khẩu: PBKDF2-SHA256 có salt, số vòng lưu kèm từng mật khẩu.
 * - authGate(): mọi API (trừ /api/auth/*) phải có phiên và đúng quyền tab.
 */
import { isSqlite, ddlTypes, ensureTables, str, int, parseJson, ok, bad } from './ddl.js';

/** Các tab admin có thể tick cho nhóm quyền (tab Tài khoản chỉ dành cho admin) */
// 28/10/2026 bỏ tab Chỉ lệnh thả chuyền, Xuất theo đơn hàng, Nhập kho (dữ liệu & API vẫn giữ; tab cũ trong nhóm quyền tự bị lọc bỏ)
// tab-doichieu: Đối chiếu giao hàng (data log xuất theo PO, thay Xuất theo đơn hàng)
export const TABS = ['tab-donhang', 'tab-create', 'tab-list', 'tab-doichieu', 'tab-dashboard', 'tab-catalog',
  'tab-donhangchat', 'tab-xuatchat', 'tab-maykho'];

const ID_TABLES = ['nhom_quyen', 'tai_khoan'];
export const TABLES = [...ID_TABLES, 'phien'];
export function schemaFor(sqlite) {
  const T = ddlTypes(sqlite);
  return [
    ...T.seqs(ID_TABLES),
    `CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)`,
    `CREATE TABLE IF NOT EXISTS nhom_quyen (
      ${T.id('nhom_quyen')},
      ten TEXT NOT NULL,
      tabs TEXT DEFAULT '[]',
      la_admin ${T.INT} DEFAULT 0,
      thu_tu ${T.INT} DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS tai_khoan (
      ${T.id('tai_khoan')},
      ten_dang_nhap TEXT UNIQUE NOT NULL,
      ho_ten TEXT DEFAULT '',
      mat_khau TEXT NOT NULL,
      nhom_id ${T.INT},
      khoa ${T.INT} DEFAULT 0,
      sai_lien_tiep ${T.INT} DEFAULT 0,
      khoa_den ${T.INT} DEFAULT 0,
      dang_nhap_cuoi ${T.INT} DEFAULT 0,
      tao_luc ${T.TS}
    )`,
    `CREATE TABLE IF NOT EXISTS phien (
      token_hash TEXT PRIMARY KEY,
      tai_khoan_id ${T.INT} NOT NULL,
      het_han ${T.INT} NOT NULL,
      tao_luc ${T.INT} DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_phien_tk ON phien(tai_khoan_id)`,
    // Tài khoản gắn với tổ (TC, CMA, CMB, CMC...): '' = không gắn tổ
    sqlite ? `ALTER TABLE tai_khoan ADD COLUMN ma_bo_phan TEXT DEFAULT ''`
      : `ALTER TABLE tai_khoan ADD COLUMN IF NOT EXISTS ma_bo_phan TEXT DEFAULT ''`,
  ];
}
const ensureAuthSchema = env =>
  ensureTables(env, 'auth_v1', 'SELECT p.token_hash, t.ma_bo_phan FROM phien p, tai_khoan t WHERE 1 = 0', schemaFor(isSqlite(env)));

/* ---------------- Mật khẩu & mã phiên ---------------- */
const enc = new TextEncoder();
const DAY = 86400e3;
const SESSION_DAYS = 30;
const COOKIE = 'pxk_sid';
const MAX_SAI = 5;
const KHOA_PHUT = 15;
const MIN_MK = 6;

const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
const sameText = (a, b) => sameBytes(enc.encode(String(a)), enc.encode(String(b)));

async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
/** Gói Workers Free giới hạn ~10ms CPU / lần gọi nên số vòng vừa phải; đổi bằng biến PBKDF2_ITER */
const iterOf = env => Math.min(100000, Math.max(5000, int(env.PBKDF2_ITER) || 10000));
async function hashPassword(env, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = iterOf(env);
  return `pbkdf2$${iter}$${b64(salt)}$${b64(await pbkdf2(pw, salt, iter))}`;
}
async function checkPassword(pw, stored) {
  const [kind, iter, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !hash) return false;
  return sameBytes(await pbkdf2(pw, unb64(salt), parseInt(iter, 10)), unb64(hash));
}
const sha256 = async s => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));

function readCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : '';
}
function cookieHeader(url, token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
async function newSession(env, url, tkId, extra = {}) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = b64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Date.now();
  await env.DB.prepare('INSERT INTO phien (token_hash, tai_khoan_id, het_han, tao_luc) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), tkId, now + SESSION_DAYS * DAY, now).run();
  // Cookie giữ lâu, hạn thật nằm ở database (gia hạn dần khi còn dùng)
  const res = ok(extra);
  res.headers.append('Set-Cookie', cookieHeader(url, token, 400 * 86400));
  return res;
}

/* ---------------- Đọc người dùng từ phiên ---------------- */
async function loadUser(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  const th = await sha256(token);
  const r = await env.DB.prepare(`
    SELECT p.het_han, t.id, t.ten_dang_nhap, t.ho_ten, t.khoa, t.nhom_id, t.ma_bo_phan, n.ten AS nhom_ten, n.tabs, n.la_admin
    FROM phien p JOIN tai_khoan t ON t.id = p.tai_khoan_id LEFT JOIN nhom_quyen n ON n.id = t.nhom_id
    WHERE p.token_hash = ?`).bind(th).first();
  if (!r) return null;
  const now = Date.now();
  if (r.het_han < now || r.khoa) {
    await env.DB.prepare('DELETE FROM phien WHERE token_hash = ?').bind(th).run();
    return null;
  }
  if (r.het_han - now < (SESSION_DAYS / 2) * DAY) {
    await env.DB.prepare('UPDATE phien SET het_han = ? WHERE token_hash = ?').bind(now + SESSION_DAYS * DAY, th).run();
  }
  const la_admin = !!r.la_admin;
  const tabs = la_admin ? [...TABS, 'tab-taikhoan'] : parseJson(r.tabs, []).filter(t => TABS.includes(t));
  return { id: r.id, ten_dang_nhap: r.ten_dang_nhap, ho_ten: r.ho_ten || r.ten_dang_nhap, nhom_id: r.nhom_id, nhom_ten: r.nhom_ten || '', la_admin, tabs,
    ma_bo_phan: r.ma_bo_phan || '', token_hash: th };
}
const publicUser = u => u && ({ id: u.id, ten_dang_nhap: u.ten_dang_nhap, ho_ten: u.ho_ten, nhom_ten: u.nhom_ten, la_admin: u.la_admin, tabs: u.tabs, ma_bo_phan: u.ma_bo_phan });

/* ---------------- Quyền theo API ---------------- */
const ANY = '*';
// [method, đường dẫn, các tab được phép]. Không khớp dòng nào -> chỉ admin.
const RULES = [
  ['GET', /^\/api\/(khachhang|po|bochitiet|bophan)(\/|$)/, ANY],
  ['*', /^\/api\/po(\/|$)/, ['tab-catalog', 'tab-donhang']],
  ['*', /^\/api\/bochitiet(\/|$)/, ['tab-catalog', 'tab-donhangchat']], // tổ chặt tự khai bộ chi tiết
  ['*', /^\/api\/khachhang(\/|$)/, ['tab-catalog']],
  ['GET', /^\/api\/donhang(\/|$)/, ['tab-donhang', 'tab-chilenh', 'tab-theodoi']],
  ['*', /^\/api\/donhang(\/|$)/, ['tab-donhang']],
  ['*', /^\/api\/dondat(\/|$)/, ['tab-donhang']], // đơn: nhiều ART · nhiều PO
  ['GET', /^\/api\/conlai$/, ['tab-create']], // lập phiếu: số còn lại theo PO · ART · Màu
  ['*', /^\/api\/chilenh(\/|$)/, ['tab-chilenh']],
  ['*', /^\/api\/(theodoi|dieuchinh)(\/|$)/, ['tab-doichieu']],
  ['GET', /^\/api\/phieu\/\d+$/, ['tab-create', 'tab-list', 'tab-doichieu']],
  ['GET', /^\/api\/phieu(\/|$)/, ['tab-create', 'tab-list']],
  ['POST', /^\/api\/phieu$/, ['tab-create']],
  ['PUT', /^\/api\/phieu\/\d+$/, ['tab-create']],
  ['PUT', /^\/api\/phieu\/\d+\/status$/, ['tab-list']],
  ['PUT', /^\/api\/phieu\/\d+\/khachhang$/, ['tab-list']], // gán khách cho phiếu cũ
  ['*', /^\/api\/(dashboard|congno)(\/|$)/, ['tab-dashboard']],
  ['*', /^\/api\/nhapkho\//, ['tab-nhapkho']],
  ['GET', /^\/api\/tochat\/(donhang|dinhmuc)(\/|$)/, ['tab-donhangchat', 'tab-xuatchat']],
  ['*', /^\/api\/tochat\/(donhang|dinhmuc)(\/|$)/, ['tab-donhangchat']],
  ['*', /^\/api\/tochat\/xuat(\/|$)/, ['tab-xuatchat']],
  ['*', /^\/api\/tomay(\/|$)/, ['tab-maykho']],
];
export function allowed(user, method, path) {
  if (user.la_admin) return true;
  const rule = RULES.find(([m, re]) => (m === '*' || m === method) && re.test(path));
  if (!rule) return false;
  return rule[2] === ANY || rule[2].some(t => user.tabs.includes(t));
}

/** Trả { res } nếu bị chặn, ngược lại { user } */
export async function authGate(path, method, request, env) {
  await ensureAuthSchema(env);
  const user = await loadUser(env, request);
  if (!user) return { res: Response.json({ success: false, needLogin: true, error: 'Phiên đăng nhập đã hết – bấm F5 để đăng nhập lại' }, { status: 401 }) };
  if (!allowed(user, method, path)) return { res: bad('Tài khoản của bạn không có quyền dùng chức năng này', 403) };
  return { user };
}

/* ---------------- Kiểm tra dữ liệu ---------------- */
const USER_RE = /^[a-z0-9._-]{3,32}$/;
const cleanUser = v => str(v).toLowerCase();
const checkNewPassword = pw => (String(pw || '').length < MIN_MK ? `Mật khẩu phải có ít nhất ${MIN_MK} ký tự` : null);
const cleanTabs = tabs => JSON.stringify([...new Set((Array.isArray(tabs) ? tabs : []).filter(t => TABS.includes(t)))]);

/** Số tài khoản admin đang dùng được nếu áp dụng thay đổi (để không khóa / xóa mất admin cuối cùng) */
async function activeAdminsAfter(env, change) {
  const { results } = await env.DB.prepare(
    'SELECT t.id, t.khoa, t.nhom_id, n.la_admin FROM tai_khoan t LEFT JOIN nhom_quyen n ON n.id = t.nhom_id').all();
  const { results: groups } = await env.DB.prepare('SELECT id, la_admin FROM nhom_quyen').all();
  const gAdmin = new Map(groups.map(g => [g.id, !!g.la_admin]));
  if (change.groupId) gAdmin.set(change.groupId, !!change.groupAdmin);
  return results.filter(t => {
    if (t.id === change.deleteId) return false;
    const khoa = t.id === change.userId && change.khoa !== undefined ? change.khoa : t.khoa;
    const nhom = t.id === change.userId && change.nhomId !== undefined ? change.nhomId : t.nhom_id;
    return !khoa && gAdmin.get(nhom);
  }).length;
}

/* ============================================================
   /api/auth/*  (không cần đăng nhập trước)
   ============================================================ */
export async function handleAuthApi(path, method, url, request, env) {
  if (!path.startsWith('/api/auth/')) return null;
  await ensureAuthSchema(env);

  if (path === '/api/auth/status' && method === 'GET') {
    const user = await loadUser(env, request);
    const c = user ? null : await env.DB.prepare('SELECT COUNT(*) AS n FROM tai_khoan').first();
    return ok({ user: publicUser(user), needSetup: !user && !c.n, setupReady: !!env.SETUP_KEY, tabs: TABS });
  }

  if (path === '/api/auth/setup' && method === 'POST') {
    const b = await request.json();
    if (!env.SETUP_KEY) return bad('Máy chủ chưa có mã khởi tạo (SETUP_KEY)');
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM tai_khoan').first();
    if (c.n) return bad('Hệ thống đã có tài khoản. Hãy đăng nhập.');
    if (!sameText(str(b.ma_khoi_tao), env.SETUP_KEY)) return bad('Mã khởi tạo không đúng');
    const ten = cleanUser(b.ten_dang_nhap);
    if (!USER_RE.test(ten)) return bad('Tên đăng nhập 3–32 ký tự, chỉ gồm chữ thường không dấu, số, dấu . _ -');
    const errPw = checkNewPassword(b.mat_khau);
    if (errPw) return bad(errPw);
    // Chỉ cho khởi tạo đúng 1 lần (kể cả khi 2 người bấm cùng lúc)
    const lock = await env.DB.prepare(`INSERT INTO app_meta (k, v) VALUES ('auth_setup', ?) ON CONFLICT (k) DO NOTHING RETURNING k`)
      .bind(String(Date.now())).first();
    if (!lock) return bad('Hệ thống đã được khởi tạo. Hãy đăng nhập.');
    const g = await env.DB.prepare(`INSERT INTO nhom_quyen (ten, tabs, la_admin, thu_tu) VALUES ('Quản trị', ?, 1, 1) RETURNING id`)
      .bind(JSON.stringify(TABS)).first();
    await env.DB.prepare(`INSERT INTO nhom_quyen (ten, tabs, la_admin, thu_tu) VALUES ('Kho', ?, 0, 2)`)
      .bind(JSON.stringify(['tab-create', 'tab-list'])).run();
    await env.DB.prepare(`INSERT INTO nhom_quyen (ten, tabs, la_admin, thu_tu) VALUES ('Kế hoạch', ?, 0, 3)`)
      .bind(JSON.stringify(['tab-donhang', 'tab-doichieu', 'tab-dashboard', 'tab-catalog'])).run();
    const t = await env.DB.prepare('INSERT INTO tai_khoan (ten_dang_nhap, ho_ten, mat_khau, nhom_id) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(ten, str(b.ho_ten) || ten, await hashPassword(env, b.mat_khau), g.id).first();
    return newSession(env, url, t.id, { message: 'Đã tạo tài khoản quản trị' });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const b = await request.json();
    const ten = cleanUser(b.ten_dang_nhap);
    const t = ten ? await env.DB.prepare('SELECT id, mat_khau, khoa, sai_lien_tiep, khoa_den FROM tai_khoan WHERE ten_dang_nhap = ?').bind(ten).first() : null;
    const sai = 'Sai tên đăng nhập hoặc mật khẩu';
    if (!t) return bad(sai, 401);
    if (t.khoa) return bad('Tài khoản đã bị khóa. Hãy báo quản trị.', 403);
    const now = Date.now();
    if (t.khoa_den > now) return bad(`Đăng nhập sai nhiều lần. Thử lại sau ${Math.ceil((t.khoa_den - now) / 60000)} phút hoặc nhờ quản trị mở khóa.`, 429);
    if (!(await checkPassword(String(b.mat_khau || ''), t.mat_khau))) {
      const n = (t.sai_lien_tiep || 0) + 1;
      if (n >= MAX_SAI) {
        await env.DB.prepare('UPDATE tai_khoan SET sai_lien_tiep = 0, khoa_den = ? WHERE id = ?').bind(now + KHOA_PHUT * 60000, t.id).run();
        return bad(`Sai mật khẩu ${MAX_SAI} lần. Tài khoản tạm khóa ${KHOA_PHUT} phút.`, 429);
      }
      await env.DB.prepare('UPDATE tai_khoan SET sai_lien_tiep = ? WHERE id = ?').bind(n, t.id).run();
      return bad(sai, 401);
    }
    await env.DB.prepare('UPDATE tai_khoan SET sai_lien_tiep = 0, khoa_den = 0, dang_nhap_cuoi = ? WHERE id = ?').bind(now, t.id).run();
    await env.DB.prepare('DELETE FROM phien WHERE het_han < ?').bind(now).run();
    return newSession(env, url, t.id, { message: 'Đăng nhập thành công' });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = readCookie(request);
    if (token) await env.DB.prepare('DELETE FROM phien WHERE token_hash = ?').bind(await sha256(token)).run();
    const res = ok({ message: 'Đã đăng xuất' });
    res.headers.append('Set-Cookie', cookieHeader(url, '', 0));
    return res;
  }

  if (path === '/api/auth/doimatkhau' && method === 'POST') {
    const user = await loadUser(env, request);
    if (!user) return bad('Phiên đăng nhập đã hết – bấm F5 để đăng nhập lại', 401);
    const b = await request.json();
    const t = await env.DB.prepare('SELECT mat_khau FROM tai_khoan WHERE id = ?').bind(user.id).first();
    if (!(await checkPassword(String(b.mat_khau_cu || ''), t.mat_khau))) return bad('Mật khẩu cũ không đúng');
    const errPw = checkNewPassword(b.mat_khau_moi);
    if (errPw) return bad(errPw);
    await env.DB.prepare('UPDATE tai_khoan SET mat_khau = ? WHERE id = ?').bind(await hashPassword(env, b.mat_khau_moi), user.id).run();
    // Đăng xuất các máy khác, giữ máy đang dùng
    await env.DB.prepare('DELETE FROM phien WHERE tai_khoan_id = ? AND token_hash <> ?').bind(user.id, user.token_hash).run();
    return ok({ message: 'Đã đổi mật khẩu' });
  }

  return bad('API đăng nhập không tồn tại', 404);
}

/* ============================================================
   /api/taikhoan, /api/nhomquyen  (chỉ admin – authGate đã chặn)
   ============================================================ */
export async function handleTaiKhoanApi(path, method, url, request, env, user) {
  if (!path.startsWith('/api/taikhoan') && !path.startsWith('/api/nhomquyen')) return null;

  // ---------------- NHÓM QUYỀN ----------------
  if (path === '/api/nhomquyen' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT n.*, (SELECT COUNT(*) FROM tai_khoan t WHERE t.nhom_id = n.id) AS so_tk
      FROM nhom_quyen n ORDER BY n.thu_tu, n.id`).all();
    return ok({ data: results.map(n => ({ ...n, tabs: parseJson(n.tabs, []), la_admin: n.la_admin ? 1 : 0 })), tabs: TABS });
  }
  if (path === '/api/nhomquyen' && method === 'POST') {
    const b = await request.json();
    if (!str(b.ten)) return bad('Chưa nhập tên nhóm quyền');
    const r = await env.DB.prepare('INSERT INTO nhom_quyen (ten, tabs, la_admin, thu_tu) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(str(b.ten), cleanTabs(b.tabs), b.la_admin ? 1 : 0, int(b.thu_tu) || 0).first();
    return ok({ id: r.id, message: 'Đã thêm nhóm quyền' });
  }
  const nqM = path.match(/^\/api\/nhomquyen\/(\d+)$/);
  if (nqM && method === 'PUT') {
    const id = int(nqM[1]);
    const b = await request.json();
    if (!str(b.ten)) return bad('Chưa nhập tên nhóm quyền');
    if (!b.la_admin && !(await activeAdminsAfter(env, { groupId: id, groupAdmin: false }))) {
      return bad('Phải còn ít nhất 1 tài khoản quản trị đang dùng được');
    }
    await env.DB.prepare('UPDATE nhom_quyen SET ten = ?, tabs = ?, la_admin = ?, thu_tu = ? WHERE id = ?')
      .bind(str(b.ten), cleanTabs(b.tabs), b.la_admin ? 1 : 0, int(b.thu_tu) || 0, id).run();
    return ok({ message: 'Đã lưu nhóm quyền' });
  }
  if (nqM && method === 'DELETE') {
    const id = int(nqM[1]);
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM tai_khoan WHERE nhom_id = ?').bind(id).first();
    if (c.n) return bad(`Nhóm đang có ${c.n} tài khoản, hãy chuyển các tài khoản sang nhóm khác trước`);
    await env.DB.prepare('DELETE FROM nhom_quyen WHERE id = ?').bind(id).run();
    return ok({ message: 'Đã xóa nhóm quyền' });
  }

  // ---------------- TÀI KHOẢN ----------------
  if (path === '/api/taikhoan' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT t.id, t.ten_dang_nhap, t.ho_ten, t.nhom_id, t.ma_bo_phan, t.khoa, t.khoa_den, t.dang_nhap_cuoi, n.ten AS nhom_ten, n.la_admin
      FROM tai_khoan t LEFT JOIN nhom_quyen n ON n.id = t.nhom_id ORDER BY t.ten_dang_nhap`).all();
    const now = Date.now();
    return ok({ data: results.map(t => ({ ...t, tam_khoa: t.khoa_den > now, la_admin: t.la_admin ? 1 : 0 })), me: user.id });
  }
  if (path === '/api/taikhoan' && method === 'POST') {
    const b = await request.json();
    const ten = cleanUser(b.ten_dang_nhap);
    if (!USER_RE.test(ten)) return bad('Tên đăng nhập 3–32 ký tự, chỉ gồm chữ thường không dấu, số, dấu . _ -');
    const errPw = checkNewPassword(b.mat_khau);
    if (errPw) return bad(errPw);
    if (!int(b.nhom_id)) return bad('Chưa chọn nhóm quyền');
    const dup = await env.DB.prepare('SELECT id FROM tai_khoan WHERE ten_dang_nhap = ?').bind(ten).first();
    if (dup) return bad(`Tên đăng nhập "${ten}" đã có`);
    const r = await env.DB.prepare('INSERT INTO tai_khoan (ten_dang_nhap, ho_ten, mat_khau, nhom_id, ma_bo_phan) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(ten, str(b.ho_ten) || ten, await hashPassword(env, b.mat_khau), int(b.nhom_id), str(b.ma_bo_phan).toUpperCase()).first();
    return ok({ id: r.id, message: `Đã tạo tài khoản ${ten}` });
  }
  const tkM = path.match(/^\/api\/taikhoan\/(\d+)$/);
  if (tkM && method === 'PUT') {
    const id = int(tkM[1]);
    const b = await request.json();
    const t = await env.DB.prepare('SELECT id FROM tai_khoan WHERE id = ?').bind(id).first();
    if (!t) return bad('Không tìm thấy tài khoản', 404);
    const nhomId = int(b.nhom_id);
    if (!nhomId) return bad('Chưa chọn nhóm quyền');
    const khoa = b.khoa ? 1 : 0;
    if (!(await activeAdminsAfter(env, { userId: id, khoa, nhomId }))) return bad('Phải còn ít nhất 1 tài khoản quản trị đang dùng được');
    if (b.mat_khau) {
      const errPw = checkNewPassword(b.mat_khau);
      if (errPw) return bad(errPw);
      await env.DB.prepare('UPDATE tai_khoan SET mat_khau = ? WHERE id = ?').bind(await hashPassword(env, b.mat_khau), id).run();
    }
    await env.DB.prepare(`UPDATE tai_khoan SET ho_ten = ?, nhom_id = ?, khoa = ?${b.ma_bo_phan !== undefined ? ', ma_bo_phan = ?' : ''}${b.mo_khoa ? ', sai_lien_tiep = 0, khoa_den = 0' : ''} WHERE id = ?`)
      .bind(...[str(b.ho_ten), nhomId, khoa, ...(b.ma_bo_phan !== undefined ? [str(b.ma_bo_phan).toUpperCase()] : []), id]).run();
    // Khóa hoặc đặt lại mật khẩu -> đăng xuất tài khoản đó ở mọi máy
    if (khoa || b.mat_khau) await env.DB.prepare('DELETE FROM phien WHERE tai_khoan_id = ?').bind(id).run();
    return ok({ message: 'Đã lưu tài khoản' });
  }
  if (tkM && method === 'DELETE') {
    const id = int(tkM[1]);
    if (id === user.id) return bad('Không thể tự xóa tài khoản đang đăng nhập');
    if (!(await activeAdminsAfter(env, { deleteId: id }))) return bad('Phải còn ít nhất 1 tài khoản quản trị đang dùng được');
    await env.DB.prepare('DELETE FROM phien WHERE tai_khoan_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM tai_khoan WHERE id = ?').bind(id).run();
    return ok({ message: 'Đã xóa tài khoản' });
  }

  return bad('API tài khoản không tồn tại', 404);
}
