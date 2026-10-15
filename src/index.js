/**
 * BACKEND CLOUDFLARE WORKER - WEB PHIẾU XUẤT KHO D&D LONG AN
 * Chạy trên Cloudflare Workers + D1 Database + Static Assets
 */

import { ensureSchema, handleCatalogApi, guessKhachHangId } from './catalog.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Xử lý CORS nếu cần
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // ==========================================
    // 1. ROUTER API
    // ==========================================
    if (url.pathname.startsWith('/api/')) {
      try {
        const response = await handleApi(url, request, env);
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
      } catch (err) {
        console.error('API Error:', err);
        return Response.json(
          { success: false, error: err.message || 'Lỗi xử lý máy chủ' },
          { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }
    }

    // ==========================================
    // 2. STATIC ASSETS (Frontend tĩnh)
    // ==========================================
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Assets binding not found', { status: 404 });
  },
};

/**
 * Xử lý các endpoint API
 */
async function handleApi(url, request, env) {
  const method = request.method;
  const path = url.pathname;

  // Tự nâng cấp database (bảng khách hàng, PO, bộ chi tiết...) ở lần gọi đầu tiên
  await ensureSchema(env);

  const catalogRes = await handleCatalogApi(path, method, url, request, env);
  if (catalogRes) return catalogRes;

  // -------------------------------------------------------------
  // GET /api/bophan: Danh sách bộ phận/chuyền
  // -------------------------------------------------------------
  if (path === '/api/bophan' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT ma, ten, thu_tu FROM bo_phan ORDER BY thu_tu ASC'
    ).all();
    return Response.json({ success: true, data: results });
  }

  // -------------------------------------------------------------
  // API SẢN LƯỢNG QC (GET, POST, DELETE)
  // -------------------------------------------------------------
  if (path === '/api/qc' && method === 'GET') {
    const tuNgay = url.searchParams.get('tu_ngay');
    const denNgay = url.searchParams.get('den_ngay');
    const boPhan = url.searchParams.get('bo_phan');

    let sql = `
      SELECT q.*, b.ten as ten_bo_phan 
      FROM qc_san_luong q 
      LEFT JOIN bo_phan b ON q.ma_bo_phan = b.ma 
      WHERE 1=1
    `;
    const params = [];
    if (tuNgay) { sql += ' AND q.ngay >= ?'; params.push(tuNgay); }
    if (denNgay) { sql += ' AND q.ngay <= ?'; params.push(denNgay); }
    if (boPhan && boPhan !== 'all') { sql += ' AND q.ma_bo_phan = ?'; params.push(boPhan); }
    sql += ' ORDER BY q.ngay DESC, q.id DESC LIMIT 100';

    const stmt = env.DB.prepare(sql);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

    for (const item of results) {
      const { results: sizes } = await env.DB.prepare(
        'SELECT size, so_luong FROM qc_san_luong_size WHERE qc_id = ? ORDER BY size ASC'
      ).bind(item.id).all();
      item.sizes = sizes;
    }

    return Response.json({ success: true, data: results });
  }

  if (path === '/api/qc' && method === 'POST') {
    const body = await request.json();

    // Hỗ trợ lưu nhiều mã hàng trong một lần ghi nhận (batch)
    const items = Array.isArray(body.rows) ? body.rows.map(r => ({
      ngay: body.ngay,
      ma_bo_phan: body.ma_bo_phan,
      qc_nguoi_ghi: body.qc_nguoi_ghi || '',
      ghi_chu: body.ghi_chu || '',
      ma_hang: r.ma_hang,
      mau: r.mau || '',
      sizes: r.sizes || [],
    })) : [body];

    const savedIds = [];
    let totalAll = 0;

    for (const item of items) {
      const { ngay, ma_bo_phan, ma_hang, mau = '', qc_nguoi_ghi = '', ghi_chu = '', sizes = [] } = item;
      if (!ngay || !ma_bo_phan || !ma_hang) continue;

      let tong_sl = 0;
      sizes.forEach(s => { tong_sl += parseFloat(s.so_luong) || 0; });
      if (tong_sl <= 0) continue; // Bỏ qua dòng không có sản lượng

      const insertRes = await env.DB.prepare(`
        INSERT INTO qc_san_luong (ngay, ma_bo_phan, ma_hang, mau, qc_nguoi_ghi, ghi_chu, tong_sl)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(ngay, ma_bo_phan, ma_hang, mau, qc_nguoi_ghi, ghi_chu, tong_sl).run();

      const qcId = insertRes.meta.last_row_id;
      savedIds.push(qcId);
      totalAll += tong_sl;

      for (const s of sizes) {
        const qty = parseFloat(s.so_luong) || 0;
        if (qty > 0) {
          await env.DB.prepare(
            'INSERT INTO qc_san_luong_size (qc_id, size, so_luong) VALUES (?, ?, ?)'
          ).bind(qcId, String(s.size), qty).run();
        }
      }
    }

    if (savedIds.length === 0) {
      return Response.json({ success: false, error: 'Vui lòng nhập ít nhất một mã hàng có sản lượng đạt > 0' }, { status: 400 });
    }

    return Response.json({ success: true, message: `Đã lưu thành công ${savedIds.length} mã hàng QC`, ids: savedIds, total: totalAll });
  }

  const qcDeleteMatch = path.match(/^\/api\/qc\/(\d+)$/);
  if (qcDeleteMatch && method === 'DELETE') {
    const id = parseInt(qcDeleteMatch[1], 10);
    await env.DB.prepare('DELETE FROM qc_san_luong WHERE id = ?').bind(id).run();
    return Response.json({ success: true, message: 'Đã xóa bản ghi QC' });
  }

  // -------------------------------------------------------------
  // API SẢN LƯỢNG TỔ TRƯỞNG THEO GIỜ (GET, POST, DELETE)
  // -------------------------------------------------------------
  if (path === '/api/totruong' && method === 'GET') {
    const ngay = url.searchParams.get('ngay');
    const boPhan = url.searchParams.get('bo_phan');

    let sql = `
      SELECT t.*, b.ten as ten_bo_phan 
      FROM to_truong_san_luong t 
      LEFT JOIN bo_phan b ON t.ma_bo_phan = b.ma 
      WHERE 1=1
    `;
    const params = [];
    if (ngay) { sql += ' AND t.ngay = ?'; params.push(ngay); }
    if (boPhan && boPhan !== 'all') { sql += ' AND t.ma_bo_phan = ?'; params.push(boPhan); }
    sql += ' ORDER BY t.ngay DESC, t.id DESC LIMIT 100';

    const stmt = env.DB.prepare(sql);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

    for (const item of results) {
      const { results: gioList } = await env.DB.prepare(
        'SELECT khung_gio, san_luong, thu_tu FROM to_truong_san_luong_gio WHERE to_truong_id = ? ORDER BY thu_tu ASC'
      ).bind(item.id).all();
      item.gio_list = gioList;
    }

    return Response.json({ success: true, data: results });
  }

  if (path === '/api/totruong' && method === 'POST') {
    const body = await request.json();
    const { ngay, ma_bo_phan, to_truong_ten = '', ma_hang = '', khung_gio_tang_ca = '4h30_6h', ghi_chu = '', gio_list = [] } = body;

    if (!ngay || !ma_bo_phan) {
      return Response.json({ success: false, error: 'Vui lòng chọn Ngày và Bộ phận' }, { status: 400 });
    }

    let tong_san_luong = 0;
    gio_list.forEach(g => { tong_san_luong += parseFloat(g.san_luong) || 0; });

    const insertRes = await env.DB.prepare(`
      INSERT INTO to_truong_san_luong (ngay, ma_bo_phan, to_truong_ten, ma_hang, khung_gio_tang_ca, tong_san_luong, ghi_chu)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(ngay, ma_bo_phan, to_truong_ten, ma_hang, khung_gio_tang_ca, tong_san_luong, ghi_chu).run();

    const ttId = insertRes.meta.last_row_id;

    for (let i = 0; i < gio_list.length; i++) {
      const g = gio_list[i];
      const sl = parseFloat(g.san_luong) || 0;
      await env.DB.prepare(`
        INSERT INTO to_truong_san_luong_gio (to_truong_id, khung_gio, san_luong, thu_tu)
        VALUES (?, ?, ?, ?)
      `).bind(ttId, g.khung_gio, sl, i + 1).run();
    }

    return Response.json({ success: true, message: 'Đã lưu sản lượng Tổ trưởng thành công', id: ttId, tong_san_luong });
  }

  const ttDeleteMatch = path.match(/^\/api\/totruong\/(\d+)$/);
  if (ttDeleteMatch && method === 'DELETE') {
    const id = parseInt(ttDeleteMatch[1], 10);
    await env.DB.prepare('DELETE FROM to_truong_san_luong WHERE id = ?').bind(id).run();
    return Response.json({ success: true, message: 'Đã xóa bản ghi Tổ trưởng' });
  }

  // -------------------------------------------------------------
  // GET /api/phieu/next-number: Sinh số phiếu tiếp theo
  // Query: ?bo_phan=TC&date=2026-10-11
  // Quy ước: <Mã><STT 3 số>/<tháng 2 số>/<năm 2 số> ví dụ TC001/10/26
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // GET /api/phieu/next-number: Sinh số phiếu tiếp theo
  // Quy ước: PXK-<Mã Bộ Phận>-<8 chữ số> (ví dụ: PXK-TC-00000001)
  // Tăng dần đều 1 đơn vị, không lặp lại ngay cả khi phiếu bị xóa
  // -------------------------------------------------------------
  if (path === '/api/phieu/next-number' && method === 'GET') {
    const boPhan = url.searchParams.get('bo_phan') || 'TC';

    // 1. Lấy max_seq từ bảng so_phieu_counter (nếu có)
    let maxSeq = 0;
    try {
      const counterRow = await env.DB.prepare(
        'SELECT max_seq FROM so_phieu_counter WHERE ma_bo_phan = ?'
      ).bind(boPhan).first();
      if (counterRow && counterRow.max_seq) {
        maxSeq = parseInt(counterRow.max_seq, 10) || 0;
      }
    } catch (e) {}

    // 2. Lấy max_seq từ tất cả phiếu đã từng lưu trong bảng phieu
    try {
      const pattern = `PXK-${boPhan}-%`;
      const { results } = await env.DB.prepare(
        'SELECT so_phieu FROM phieu WHERE so_phieu LIKE ?'
      ).bind(pattern).all();

      const regex = new RegExp(`^PXK-${boPhan}-(\\d+)$`);
      for (const r of results) {
        const match = r.so_phieu.match(regex);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    } catch (e) {}

    const nextSeq = maxSeq + 1;
    const nextNumber = `PXK-${boPhan}-${String(nextSeq).padStart(8, '0')}`;

    return Response.json({ success: true, nextNumber, nextSeq });
  }

  // -------------------------------------------------------------
  // GET /api/phieu: Lấy danh sách phiếu có lọc
  // Query: tu_ngay, den_ngay, bo_phan, trang_thai, search
  // -------------------------------------------------------------
  if (path === '/api/phieu' && method === 'GET') {
    const tuNgay = url.searchParams.get('tu_ngay');
    const denNgay = url.searchParams.get('den_ngay');
    const boPhan = url.searchParams.get('bo_phan');
    const trangThai = url.searchParams.get('trang_thai');
    const search = url.searchParams.get('search');

    let sql = `
      SELECT p.*, b.ten as ten_bo_phan, k.ten_ngan as ten_khach_hang,
        COUNT(d.id) as tong_so_dong,
        COALESCE(SUM(d.sl_chung_tu), 0) as tong_sl_chung_tu,
        COALESCE(SUM(d.sl_thuc_xuat), 0) as tong_sl_thuc_xuat,
        COALESCE(SUM(d.thanh_tien), 0) as tong_thanh_tien
      FROM phieu p
      LEFT JOIN bo_phan b ON p.ma_bo_phan = b.ma
      LEFT JOIN khach_hang k ON p.khach_hang_id = k.id
      LEFT JOIN phieu_dong d ON p.id = d.phieu_id AND COALESCE(d.loai, '') != 'chi_tiet'
      WHERE 1=1
    `;
    const params = [];

    if (tuNgay) {
      sql += ' AND p.ngay >= ?';
      params.push(tuNgay);
    }
    if (denNgay) {
      sql += ' AND p.ngay <= ?';
      params.push(denNgay);
    }
    if (boPhan && boPhan !== 'all') {
      sql += ' AND p.ma_bo_phan = ?';
      params.push(boPhan);
    }
    if (trangThai && trangThai !== 'all') {
      sql += ' AND p.trang_thai = ?';
      params.push(trangThai);
    }
    const khachHangId = url.searchParams.get('khach_hang_id');
    if (khachHangId === 'none') {
      sql += ' AND p.khach_hang_id IS NULL';
    } else if (khachHangId && khachHangId !== 'all') {
      sql += ' AND p.khach_hang_id = ?';
      params.push(parseInt(khachHangId, 10));
    }
    if (search) {
      sql += ' AND (p.so_phieu LIKE ? OR p.don_vi_nhan LIKE ? OR p.ly_do_xuat LIKE ? OR p.don_hang LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' GROUP BY p.id ORDER BY p.ngay DESC, p.id DESC LIMIT 200';

    const stmt = env.DB.prepare(sql);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

    return Response.json({ success: true, data: results });
  }

  // -------------------------------------------------------------
  // GET /api/phieu/:id: Chi tiết 1 phiếu cùng các dòng và size
  // -------------------------------------------------------------
  const phieuDetailMatch = path.match(/^\/api\/phieu\/(\d+)$/);
  if (phieuDetailMatch && method === 'GET') {
    const id = parseInt(phieuDetailMatch[1], 10);
    const phieu = await env.DB.prepare(
      'SELECT p.*, b.ten as ten_bo_phan FROM phieu p LEFT JOIN bo_phan b ON p.ma_bo_phan = b.ma WHERE p.id = ?'
    ).bind(id).first();

    if (!phieu) {
      return Response.json({ success: false, error: 'Không tìm thấy phiếu' }, { status: 404 });
    }

    const { results: lines } = await env.DB.prepare(
      'SELECT * FROM phieu_dong WHERE phieu_id = ? ORDER BY stt ASC, id ASC'
    ).bind(id).all();

    // Lấy size của từng dòng
    for (const line of lines) {
      const { results: sizes } = await env.DB.prepare(
        'SELECT size, so_luong FROM phieu_dong_size WHERE phieu_dong_id = ? ORDER BY size ASC'
      ).bind(line.id).all();
      line.sizes = sizes;
    }

    return Response.json({ success: true, data: { ...phieu, lines } });
  }

  // -------------------------------------------------------------
  // POST /api/phieu: Tạo phiếu mới
  // -------------------------------------------------------------
  if (path === '/api/phieu' && method === 'POST') {
    const body = await request.json();
    const {
      so_phieu,
      ma_bo_phan,
      mau_phieu,
      ngay,
      don_vi_nhan = '',
      ly_do_xuat = '',
      don_hang = '',
      bo_phan_xuat = '',
      trang_thai = 'saved',
      nguoi_lap = '',
      dia_chi_cty = 'A8/21c, Bông Văn Dĩa, Xã Tân Nhựt, TP HCM',
      ghi_chu = '',
      lines = [],
    } = body;
    const khach_hang_id = parseInt(body.khach_hang_id, 10) || await guessKhachHangId(env, don_vi_nhan);

    if (!so_phieu || !ma_bo_phan || !ngay) {
      return Response.json(
        { success: false, error: 'Vui lòng điền đủ Số phiếu, Bộ phận và Ngày' },
        { status: 400 }
      );
    }

    // Kiểm tra trùng số phiếu
    const existing = await env.DB.prepare('SELECT id FROM phieu WHERE so_phieu = ?')
      .bind(so_phieu)
      .first();
    if (existing) {
      return Response.json(
        { success: false, error: `Số phiếu ${so_phieu} đã tồn tại trong hệ thống` },
        { status: 400 }
      );
    }

    // Kiểm tra chênh lệch size trên các dòng
    let canh_bao_lech_size = 0;
    for (const line of lines) {
      if (line.hasMismatch) {
        canh_bao_lech_size = 1;
        break;
      }
    }

    // 1. Thêm phiếu vào bảng phieu
    let insertPhieuRes;
    try {
      insertPhieuRes = await env.DB.prepare(`
        INSERT INTO phieu (so_phieu, ma_bo_phan, mau_phieu, ngay, don_vi_nhan, ly_do_xuat, don_hang, bo_phan_xuat, trang_thai, nguoi_lap, dia_chi_cty, ghi_chu, canh_bao_lech_size, khach_hang_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        so_phieu,
        ma_bo_phan,
        mau_phieu || 2,
        ngay,
        don_vi_nhan,
        ly_do_xuat,
        don_hang,
        bo_phan_xuat,
        trang_thai,
        nguoi_lap,
        dia_chi_cty,
        ghi_chu,
        canh_bao_lech_size,
        khach_hang_id
      ).run();
    } catch (insertErr) {
      if (String(insertErr?.message || insertErr).includes('no such column')) {
        try { await env.DB.prepare("ALTER TABLE phieu ADD COLUMN don_hang TEXT DEFAULT ''").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE phieu ADD COLUMN bo_phan_xuat TEXT DEFAULT ''").run(); } catch (_) {}
        insertPhieuRes = await env.DB.prepare(`
          INSERT INTO phieu (so_phieu, ma_bo_phan, mau_phieu, ngay, don_vi_nhan, ly_do_xuat, don_hang, bo_phan_xuat, trang_thai, nguoi_lap, dia_chi_cty, ghi_chu, canh_bao_lech_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          so_phieu,
          ma_bo_phan,
          mau_phieu || 2,
          ngay,
          don_vi_nhan,
          ly_do_xuat,
          don_hang,
          bo_phan_xuat,
          trang_thai,
          nguoi_lap,
          dia_chi_cty,
          ghi_chu,
          canh_bao_lech_size
        ).run();
      } else {
        throw insertErr;
      }
    }

    const phieuId = insertPhieuRes.meta.last_row_id;

    // 2. Thêm các dòng vào phieu_dong và phieu_dong_size
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stt = line.stt || (i + 1);
      const sl_chung_tu = parseFloat(line.sl_chung_tu) || 0;
      const sl_thuc_xuat = parseFloat(line.sl_thuc_xuat) || 0;
      const don_gia = parseFloat(line.don_gia) || 0;
      const thanh_tien = parseFloat(line.thanh_tien) || (sl_thuc_xuat > 0 ? sl_thuc_xuat * don_gia : sl_chung_tu * don_gia);

      const insertLineRes = await env.DB.prepare(`
        INSERT INTO phieu_dong (phieu_id, stt, ten_hang, ma_hang, mau, dvt, sl_chung_tu, sl_thuc_xuat, don_gia, thanh_tien, ghi_chu, loai, he_so)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        phieuId,
        stt,
        line.ten_hang || '',
        line.ma_hang || '',
        line.mau || '',
        line.dvt || 'Đôi',
        sl_chung_tu,
        sl_thuc_xuat,
        don_gia,
        thanh_tien,
        line.ghi_chu || '',
        line.loai || '',
        parseFloat(line.he_so) || 0
      ).run();

      const phieuDongId = insertLineRes.meta.last_row_id;

      // Lưu size
      if (Array.isArray(line.sizes) && line.sizes.length > 0) {
        for (const s of line.sizes) {
          const qty = parseFloat(s.so_luong) || 0;
          if (qty > 0) {
            await env.DB.prepare(`
              INSERT INTO phieu_dong_size (phieu_dong_id, size, so_luong)
              VALUES (?, ?, ?)
            `).bind(phieuDongId, String(s.size), qty).run();
          }
        }
      }
    }

    // Cập nhật bộ đếm so_phieu_counter để không bao giờ lặp lại số khi phiếu bị xóa
    const matchNumber = so_phieu.match(/^PXK-([^-]+)-(\d+)$/);
    if (matchNumber) {
      const bp = matchNumber[1];
      const seq = parseInt(matchNumber[2], 10);
      try {
        const curr = await env.DB.prepare('SELECT max_seq FROM so_phieu_counter WHERE ma_bo_phan = ?').bind(bp).first();
        if (!curr) {
          await env.DB.prepare('INSERT INTO so_phieu_counter (ma_bo_phan, max_seq) VALUES (?, ?)').bind(bp, seq).run();
        } else if (seq > (parseInt(curr.max_seq, 10) || 0)) {
          await env.DB.prepare('UPDATE so_phieu_counter SET max_seq = ? WHERE ma_bo_phan = ?').bind(seq, bp).run();
        }
      } catch (e) {}
    }

    return Response.json({
      success: true,
      message: 'Tạo phiếu thành công',
      phieuId,
      canh_bao_lech_size,
    });
  }

  // -------------------------------------------------------------
  // PUT /api/phieu/:id: Cập nhật phiếu
  // -------------------------------------------------------------
  if (phieuDetailMatch && method === 'PUT') {
    const id = parseInt(phieuDetailMatch[1], 10);
    const body = await request.json();
    const {
      so_phieu,
      ma_bo_phan,
      mau_phieu,
      ngay,
      don_vi_nhan = '',
      ly_do_xuat = '',
      don_hang = '',
      bo_phan_xuat = '',
      trang_thai = 'saved',
      nguoi_lap = '',
      dia_chi_cty = 'A8/21c, Bông Văn Dĩa, Xã Tân Nhựt, TP HCM',
      ghi_chu = '',
      lines = [],
    } = body;
    const khach_hang_id = parseInt(body.khach_hang_id, 10) || await guessKhachHangId(env, don_vi_nhan);

    let canh_bao_lech_size = 0;
    for (const line of lines) {
      if (line.hasMismatch) {
        canh_bao_lech_size = 1;
        break;
      }
    }

    try {
      await env.DB.prepare(`
        UPDATE phieu
        SET so_phieu = ?, ma_bo_phan = ?, mau_phieu = ?, ngay = ?, don_vi_nhan = ?, 
            ly_do_xuat = ?, don_hang = ?, bo_phan_xuat = ?, trang_thai = ?, nguoi_lap = ?, dia_chi_cty = ?, ghi_chu = ?, canh_bao_lech_size = ?, khach_hang_id = ?, cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        so_phieu,
        ma_bo_phan,
        mau_phieu || 2,
        ngay,
        don_vi_nhan,
        ly_do_xuat,
        don_hang,
        bo_phan_xuat,
        trang_thai,
        nguoi_lap,
        dia_chi_cty,
        ghi_chu,
        canh_bao_lech_size,
        khach_hang_id,
        id
      ).run();
    } catch (updateErr) {
      if (String(updateErr?.message || updateErr).includes('no such column')) {
        try { await env.DB.prepare("ALTER TABLE phieu ADD COLUMN don_hang TEXT DEFAULT ''").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE phieu ADD COLUMN bo_phan_xuat TEXT DEFAULT ''").run(); } catch (_) {}
        await env.DB.prepare(`
          UPDATE phieu
          SET so_phieu = ?, ma_bo_phan = ?, mau_phieu = ?, ngay = ?, don_vi_nhan = ?, 
              ly_do_xuat = ?, don_hang = ?, bo_phan_xuat = ?, trang_thai = ?, nguoi_lap = ?, dia_chi_cty = ?, ghi_chu = ?, canh_bao_lech_size = ?, cap_nhat_luc = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          so_phieu,
          ma_bo_phan,
          mau_phieu || 2,
          ngay,
          don_vi_nhan,
          ly_do_xuat,
          don_hang,
          bo_phan_xuat,
          trang_thai,
          nguoi_lap,
          dia_chi_cty,
          ghi_chu,
          canh_bao_lech_size,
          id
        ).run();
      } else {
        throw updateErr;
      }
    }

    // Xóa dòng cũ và nạp lại
    await env.DB.prepare('DELETE FROM phieu_dong WHERE phieu_id = ?').bind(id).run();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stt = line.stt || (i + 1);
      const sl_chung_tu = parseFloat(line.sl_chung_tu) || 0;
      const sl_thuc_xuat = parseFloat(line.sl_thuc_xuat) || 0;
      const don_gia = parseFloat(line.don_gia) || 0;
      const thanh_tien = parseFloat(line.thanh_tien) || (sl_thuc_xuat > 0 ? sl_thuc_xuat * don_gia : sl_chung_tu * don_gia);

      const insertLineRes = await env.DB.prepare(`
        INSERT INTO phieu_dong (phieu_id, stt, ten_hang, ma_hang, mau, dvt, sl_chung_tu, sl_thuc_xuat, don_gia, thanh_tien, ghi_chu, loai, he_so)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        stt,
        line.ten_hang || '',
        line.ma_hang || '',
        line.mau || '',
        line.dvt || 'Đôi',
        sl_chung_tu,
        sl_thuc_xuat,
        don_gia,
        thanh_tien,
        line.ghi_chu || '',
        line.loai || '',
        parseFloat(line.he_so) || 0
      ).run();

      const phieuDongId = insertLineRes.meta.last_row_id;

      if (Array.isArray(line.sizes)) {
        for (const s of line.sizes) {
          const qty = parseFloat(s.so_luong) || 0;
          if (qty > 0) {
            await env.DB.prepare(`
              INSERT INTO phieu_dong_size (phieu_dong_id, size, so_luong)
              VALUES (?, ?, ?)
            `).bind(phieuDongId, String(s.size), qty).run();
          }
        }
      }
    }

    return Response.json({ success: true, message: 'Cập nhật phiếu thành công' });
  }

  // -------------------------------------------------------------
  // PUT /api/phieu/:id/status: Đổi trạng thái (ví dụ hủy phiếu)
  // -------------------------------------------------------------
  const statusMatch = path.match(/^\/api\/phieu\/(\d+)\/status$/);
  if (statusMatch && method === 'PUT') {
    const id = parseInt(statusMatch[1], 10);
    const body = await request.json();
    const { trang_thai } = body;

    await env.DB.prepare('UPDATE phieu SET trang_thai = ? WHERE id = ?')
      .bind(trang_thai, id)
      .run();

    return Response.json({ success: true, message: 'Đã cập nhật trạng thái phiếu' });
  }

  // -------------------------------------------------------------
  // GET /api/dashboard: Dữ liệu tổng hợp sản lượng
  // Không tính phiếu có trạng thái 'cancelled'
  // -------------------------------------------------------------
  if (path === '/api/dashboard' && method === 'GET') {
    const tuNgay = url.searchParams.get('tu_ngay');
    const denNgay = url.searchParams.get('den_ngay');
    const boPhan = url.searchParams.get('bo_phan');

    let whereClause = "p.trang_thai != 'cancelled'";
    const khachHang = url.searchParams.get('khach_hang_id');
    if (khachHang && khachHang !== 'all') {
      whereClause += ' AND p.khach_hang_id = ?';
    }
    const params = [];

    if (tuNgay) {
      whereClause += ' AND p.ngay >= ?';
      params.push(tuNgay);
    }
    if (denNgay) {
      whereClause += ' AND p.ngay <= ?';
      params.push(denNgay);
    }
    if (boPhan && boPhan !== 'all') {
      whereClause += ' AND p.ma_bo_phan = ?';
      params.push(boPhan);
    }
    if (khachHang && khachHang !== 'all') params.unshift(parseInt(khachHang, 10));

    // 1. Thẻ tổng sản lượng theo từng bộ phận
    const sumDeptSql = `
      SELECT p.ma_bo_phan, b.ten as ten_bo_phan,
        COALESCE(SUM(d.sl_chung_tu), 0) as tong_sl_chung_tu,
        COALESCE(SUM(d.sl_thuc_xuat), 0) as tong_sl_thuc_xuat,
        COUNT(DISTINCT p.id) as so_luong_phieu
      FROM phieu p
      LEFT JOIN bo_phan b ON p.ma_bo_phan = b.ma
      LEFT JOIN phieu_dong d ON p.id = d.phieu_id AND COALESCE(d.loai, '') != 'chi_tiet'
      WHERE ${whereClause}
      GROUP BY p.ma_bo_phan
      ORDER BY b.thu_tu ASC
    `;
    const sumDeptStmt = env.DB.prepare(sumDeptSql);
    const { results: deptSummary } = await (params.length > 0 ? sumDeptStmt.bind(...params) : sumDeptStmt).all();

    // 2. Bảng ma trận: Mã hàng + Màu x Size (lấy từ phieu_dong_size)
    const matrixSql = `
      SELECT 
        COALESCE(NULLIF(d.ma_hang, ''), 'Chưa phân loại') as ma_hang,
        COALESCE(NULLIF(d.mau, ''), '-') as mau,
        p.ma_bo_phan,
        s.size,
        SUM(s.so_luong) as so_luong
      FROM phieu p
      JOIN phieu_dong d ON p.id = d.phieu_id
      JOIN phieu_dong_size s ON d.id = s.phieu_dong_id
      WHERE ${whereClause} AND COALESCE(d.loai, '') != 'chi_tiet'
      GROUP BY ma_hang, mau, p.ma_bo_phan, s.size
      ORDER BY ma_hang ASC, mau ASC, s.size ASC
    `;
    const matrixStmt = env.DB.prepare(matrixSql);
    const { results: rawMatrix } = await (params.length > 0 ? matrixStmt.bind(...params) : matrixStmt).all();

    // 3. Biểu đồ sản lượng theo ngày
    const dailySql = `
      SELECT p.ngay, p.ma_bo_phan,
        COALESCE(SUM(d.sl_chung_tu), 0) as sl_chung_tu,
        COALESCE(SUM(d.sl_thuc_xuat), 0) as sl_thuc_xuat
      FROM phieu p
      LEFT JOIN phieu_dong d ON p.id = d.phieu_id AND COALESCE(d.loai, '') != 'chi_tiet'
      WHERE ${whereClause}
      GROUP BY p.ngay, p.ma_bo_phan
      ORDER BY p.ngay ASC
    `;
    const dailyStmt = env.DB.prepare(dailySql);
    const { results: dailyData } = await (params.length > 0 ? dailyStmt.bind(...params) : dailyStmt).all();

    return Response.json({
      success: true,
      data: {
        deptSummary,
        rawMatrix,
        dailyData,
      },
    });
  }

  return Response.json({ success: false, error: 'Endpoint không tồn tại' }, { status: 404 });
}
