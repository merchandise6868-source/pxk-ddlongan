/**
 * Hàm dùng chung cho các tab mới (Đơn hàng, Chỉ lệnh, Xuất theo đơn hàng, Tài khoản).
 * window.U = { esc, toNum, fmt, fmt0, api, store, today, firstOfMonth, viDate, normKey, normSize, toast, $ }
 */
(function () {
  const esc = s => (s === null || s === undefined ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** Số kiểu Việt Nam: "1.250,5" -> 1250.5 */
  const toNum = v => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const nf = new Intl.NumberFormat('vi-VN');
  const fmt = v => (v ? nf.format(v) : '');
  const fmt0 = v => nf.format(v || 0);
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const firstOfMonth = () => today().slice(0, 8) + '01';
  const viDate = s => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || '');
  /** Giống src/ddl.js: so khớp PO / ART không phân biệt dấu cách, gạch, hoa thường */
  const normKey = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D').toUpperCase().replace(/[^A-Z0-9+]/g, '');
  const normSize = v => String(v ?? '').toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/\.0+$/, '');
  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (_) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await res.json(); } catch (_) { throw new Error('Máy chủ không phản hồi đúng'); }
    if (!data.success) throw new Error(data.error || 'Lỗi máy chủ');
    return data;
  }
  /** Thứ tự size theo các dãy size của khách hàng */
  function khSizes(kh) {
    const out = [];
    ((kh && kh.day_size) || []).forEach(d => (d.sizes || []).forEach(s => { const k = normSize(s); if (k && !out.includes(k)) out.push(k); }));
    return out;
  }
  /** Tên bộ phận theo mã (lấy từ Catalog.bophan) */
  const bpName = ma => ((window.Catalog && window.Catalog.bophan) || []).find(b => b.ma === ma)?.ten || ma || '';
  /** In một trang HTML qua iframe ẩn (không bị chặn popup) */
  function printHtml(html) {
    const old = document.getElementById('u-print-frame');
    if (old) old.remove();
    const fr = document.createElement('iframe');
    fr.id = 'u-print-frame';
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { toast('Trình duyệt chặn in, hãy thử lại', 'error'); } }, 250);
  }
  /** Tải file CSV có BOM để Excel đọc đúng tiếng Việt */
  function downloadCsv(name, rows) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  /** Enter trong lưới nhập = sang ô kế tiếp ngay (giống Excel); bỏ qua khi đang gõ Telex */
  function enterToNext(e, scopeSel) {
    if (e.isComposing || e.keyCode === 229) return false;
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return false;
    const scope = e.target.closest(scopeSel);
    if (!scope) return false;
    const all = Array.from(scope.querySelectorAll('input:not([disabled]):not([type=checkbox]), select'));
    const idx = all.indexOf(e.target);
    if (idx < 0) return false;
    e.preventDefault();
    e.target.dispatchEvent(new Event('change', { bubbles: true }));
    const again = Array.from(scope.querySelectorAll('input:not([disabled]):not([type=checkbox]), select'));
    const nxt = again[idx + 1];
    if (nxt) { nxt.focus(); if (nxt.select) nxt.select(); }
    return true;
  }
  window.U = { esc, toNum, fmt, fmt0, api, store, today, firstOfMonth, viDate, normKey, normSize, toast, khSizes, bpName, printHtml, downloadCsv, enterToNext,
    $: id => document.getElementById(id) };
})();
