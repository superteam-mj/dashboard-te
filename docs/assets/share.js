/* Kartu "Bagikan ringkasan": teks WhatsApp, salin teks, dan gambar 16:9 (SVG -> PNG) untuk PowerPoint.
   Dipakai Mon Billing dan DLPD Prabayar:  DashShare.set(elemen, model)
   model = { title, subtitle, tag, hero: [{ t, u, v, s, c }], tiles: [{ t, v, u, c }], text, file, foot } */
(() => {
  'use strict';
  const PW = 1600, PH = 900;
  const COL = { INK: '#0f172a', MUT: '#64748b', CARD: '#f1f5f9', BLUE: '#2a78d6', ORG: '#eb6834', GRN: '#1baf7a', VIO: '#6250d6', AMB: '#eda100', RED: '#d6453a' };
  const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WA = 'M12.04 2a9.9 9.9 0 0 0-8.47 15.04L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2zm0 1.8a8.1 8.1 0 1 1-4.13 15.07l-.3-.17-3.03.8.81-2.95-.19-.31A8.1 8.1 0 0 1 12.04 3.8zM8.6 7.5c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.07 3.3 5.1 4.5 2.52 1 3.03.8 3.58.75.55-.05 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57z';

  function svgOf(m) {
    const { INK, MUT, CARD, BLUE } = COL;
    const T = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${o.s || 20}" font-weight="${o.w || 500}" fill="${o.c || INK}" text-anchor="${o.a || 'start'}">${esc(t)}</text>`;
    const o = [`<rect width="${PW}" height="${PH}" fill="#fff"/>`, `<rect width="${PW}" height="12" fill="${BLUE}"/>`];
    o.push(T(60, 90, m.title, { s: 46, w: 800 }), T(60, 130, m.subtitle || '', { s: 24, w: 600, c: MUT }));
    if (m.tag) o.push(`<rect x="${PW - 60 - 300}" y="52" width="300" height="44" rx="22" fill="${CARD}"/>` + T(PW - 60 - 150, 82, m.tag, { s: 20, w: 700, c: BLUE, a: 'middle' }));
    const hero = m.hero || [], hg = 30, hw = hero.length ? (PW - 120 - hg * (hero.length - 1)) / hero.length : 0, hy = 175, hh = 300;
    hero.forEach((h, i) => {
      const x = 60 + i * (hw + hg), v = String(h.v);
      o.push(`<rect x="${x}" y="${hy}" width="${hw}" height="${hh}" rx="22" fill="${CARD}"/><rect x="${x}" y="${hy + 28}" width="8" height="${hh - 56}" rx="4" fill="${h.c}"/>`);
      o.push(T(x + 36, hy + 58, h.t, { s: 24, w: 700, c: MUT }), T(x + hw - 30, hy + 58, h.u || '', { s: 22, w: 700, c: h.c, a: 'end' }));
      o.push(T(x + 36, hy + 170, v, { s: v.length > 12 ? 52 : v.length > 9 ? 66 : 84, w: 800 }));
      if (h.s) o.push(T(x + 36, hy + 236, h.s, { s: 22, w: 600, c: MUT }));
    });
    const tiles = m.tiles || [];
    if (tiles.length) {
      o.push(T(60, 540, m.tilesTitle || 'Rincian', { s: 26, w: 800 }));
      const n = tiles.length, tg = 24, tw = (PW - 120 - tg * (n - 1)) / n, ty = 570, th = 230;
      tiles.forEach((t, i) => {
        const x = 60 + i * (tw + tg), v = String(t.v);
        o.push(`<rect x="${x}" y="${ty}" width="${tw}" height="${th}" rx="20" fill="${CARD}"/><rect x="${x}" y="${ty}" width="${tw}" height="8" rx="4" fill="${t.c}"/>`);
        o.push(T(x + 26, ty + 62, t.t, { s: 21, w: 700, c: MUT }), T(x + 26, ty + 150, v, { s: v.length > 12 ? 30 : v.length > 9 ? 36 : v.length > 7 ? 42 : 54, w: 800 }), T(x + 26, ty + 195, t.u || '', { s: 21, w: 600, c: t.c }));
      });
    }
    o.push(T(60, PH - 28, m.foot || 'PLN UP3 Mamuju · Dashboard TE', { s: 18, c: MUT }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" font-family="${FONT}">${o.join('')}</svg>`;
  }

  function png(svg) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = PW * 2; cv.height = PH * 2;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
      };
      img.onerror = () => reject(new Error('svg'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }
  function flash(btn, msg) {
    const old = btn.dataset.l || (btn.dataset.l = btn.innerHTML);
    btn.textContent = msg; clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.innerHTML = old; }, 2200);
  }

  function set(el, m) {
    if (!el) return;
    el._m = m; el._svg = svgOf(m);
    if (!el.dataset.ready) {
      el.dataset.ready = '1';
      el.innerHTML = `<div class="card-head"><div><h2>Bagikan ringkasan</h2><p class="hint" data-r="hint"></p></div><div class="tools">
        <button type="button" class="btn-wa" data-a="wa" title="Kirim ringkasan ini lewat WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${WA}"/></svg>Bagikan WhatsApp</button>
        <button type="button" class="btn" data-a="img" title="Salin sebagai gambar untuk ditempel ke PowerPoint">Salin gambar</button>
        <button type="button" class="btn ghost" data-a="txt">Salin teks</button></div></div><div class="png-body" data-r="body"></div>`;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-a]'); if (!b) return;
        const mm = el._m, a = b.dataset.a;
        if (a === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(mm.text), '_blank', 'noopener');
        else if (a === 'txt') copyText(mm.text).then(() => flash(b, 'Tersalin ✓'), () => flash(b, 'Gagal menyalin'));
        else {
          try {
            if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('clipboard');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png(el._svg) })]);
            flash(b, 'Tersalin ✓ — tempel di PPT');
          } catch (err) {
            try {
              const blob = await png(el._svg), x = document.createElement('a');
              x.href = URL.createObjectURL(blob); x.download = (mm.file || 'ringkasan') + '.png';
              document.body.appendChild(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(x.href), 4000);
              flash(b, 'Salin tidak didukung — gambar diunduh');
            } catch (e2) { flash(b, 'Gagal'); }
          }
        }
      });
    }
    el.querySelector('[data-r="hint"]').textContent = m.subtitle || '';
    el.querySelector('[data-r="body"]').innerHTML = `<div class="peng-wrap">${el._svg}</div>`;
  }

  window.DashShare = { set, COL };
})();
