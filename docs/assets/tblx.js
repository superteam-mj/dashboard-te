/* Tombol "Salin gambar" + "Unduh Excel (.xlsx)" otomatis untuk setiap kartu tabel ringkasan (satu tabel per kartu).
   Isi diambil dari tabel yang sedang tampil saat tombol diklik. Daftar rinci (b-det / s-tbl) dilewati: sudah punya unduhan CSV penuh. */
(() => {
  'use strict';
  const SKIP = 'b-det';
  const F = 'Segoe UI, Arial, sans-serif';
  const flash = (b, msg) => { const o = b.dataset.l || b.textContent; b.dataset.l = o; b.textContent = msg; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = o; }, 2200); };
  const num = (s) => (/^-?\d{1,3}(\.\d{3})+(,\d+)?$|^-?\d+(,\d+)?$/.test(s) ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : s);

  // baris -> sel (colspan dikembang supaya kolom tetap sejajar); head = jumlah baris di <thead>
  function read(tbl) {
    const rows = [...tbl.rows].map((tr) => {
      const out = [];
      [...tr.cells].forEach((c) => { const t = c.textContent.replace(/\s+/g, ' ').trim(); out.push(t); for (let k = 1; k < (c.colSpan || 1); k++) out.push(''); });
      return { cells: out, head: !!tr.closest('thead'), tot: tr.classList.contains('tot') };
    });
    const w = Math.max(0, ...rows.map((r) => r.cells.length));
    rows.forEach((r) => { while (r.cells.length < w) r.cells.push(''); });
    return rows;
  }

  function png(rows, title) {
    const sc = 2, pad = 24, rh = 36, th = title ? 44 : 0;
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    g.font = `600 14px ${F}`;
    const n = rows[0].cells.length;
    const cw = Array.from({ length: n }, (_, c) => Math.min(280, Math.max(...rows.map((r) => g.measureText(r.cells[c]).width)) + 34));
    const W = cw.reduce((a, b) => a + b, 0) + pad * 2, H = th + rows.length * rh + pad * 2;
    cv.width = W * sc; cv.height = H * sc; g.scale(sc, sc);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.textBaseline = 'middle';
    if (title) { g.fillStyle = '#1a2433'; g.font = `700 18px ${F}`; g.textAlign = 'left'; g.fillText(title, pad, pad + 14); }
    rows.forEach((r, i) => {
      const y = pad + th + i * rh;
      g.fillStyle = r.head ? '#eef2f9' : r.tot ? '#e4eefb' : '#fff'; g.fillRect(pad, y, W - pad * 2, rh);
      g.strokeStyle = '#dde3ec'; g.beginPath(); g.moveTo(pad, y + rh); g.lineTo(W - pad, y + rh); g.stroke();
      let x = pad;
      r.cells.forEach((v, c) => {
        g.fillStyle = r.head ? '#5b6778' : '#1a2433'; g.font = `${r.head || r.tot || c === 0 ? 700 : 400} ${r.head ? 12 : 14}px ${F}`;
        g.textAlign = c === 0 ? 'left' : 'right';
        g.fillText(r.head ? v.toUpperCase() : v, c === 0 ? x + 14 : x + cw[c] - 14, y + rh / 2, cw[c] - 20);
        x += cw[c];
      });
    });
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
  }

  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'tabel';

  function wire(tbl, card) {
    const h2 = card.querySelector('.card-head h2');
    const title = h2 ? h2.textContent.trim() : 'Tabel';
    const head = card.querySelector('.card-head');
    let tools = head.querySelector('.tools');
    if (!tools) { tools = document.createElement('div'); tools.className = 'tools'; head.appendChild(tools); }
    const mk = (txt, fn, ghost) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (ghost ? ' ghost' : ''); b.textContent = txt; b.dataset.tblx = '1'; b.onclick = () => fn(b); tools.appendChild(b); };
    const rows = () => { const r = read(card.querySelector('table')); if (r.length < 2) throw new Error('kosong'); return r; };
    mk('Salin gambar', async (b) => {
      try {
        if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('clipboard');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png(rows(), title) })]);
        flash(b, 'Tersalin ✓ — tempel di PPT');
      } catch (e) {
        try { const a = document.createElement('a'); a.href = URL.createObjectURL(await png(rows(), title)); a.download = slug(title) + '.png'; document.body.appendChild(a); a.click(); a.remove(); flash(b, 'Disalin tidak didukung — gambar diunduh'); } catch (e2) { flash(b, 'Tabel kosong'); }
      }
    });
    mk('Unduh Excel (.xlsx)', (b) => {
      try {
        const r = rows(), hd = r.filter((x) => x.head), body = r.filter((x) => !x.head);
        // header bertingkat: baris terakhir thead jadi judul kolom, baris di atasnya digabung dengan "›"
        const heads = hd.length ? hd[hd.length - 1].cells.map((_, c) => hd.map((x) => x.cells[c]).filter((v, i, a) => v && a.indexOf(v) === i).join(' › ')) : r[0].cells;
        window.XlsxMini.download(slug(title) + '.xlsx', title, heads, (hd.length ? body : r.slice(1)).map((x) => x.cells.map(num)));
        flash(b, 'Terunduh ✓');
      } catch (e) { flash(b, 'Tabel kosong'); }
    });
  }

  function scan() {
    document.querySelectorAll('.card').forEach((card) => {
      if (card.dataset.tblx || !card.querySelector('.card-head')) return;
      const tbls = card.querySelectorAll('table');
      if (tbls.length !== 1 || tbls[0].classList.contains(SKIP) || tbls[0].classList.contains('s-tbl')) return;
      card.dataset.tblx = '1';
      // kartu yang sudah punya unduhan CSV ringkas: biarkan, tombol xlsx tetap ditambahkan di sebelahnya
      wire(tbls[0], card);
    });
  }
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(scan, 120); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  scan();
})();
