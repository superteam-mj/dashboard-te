/* Beranda: ringkasan siap bagikan, peringatan kinerja, proyeksi capaian s.d. 31 Desember, dan tren bulanan.
   Dipanggil oleh kinerja.js setelah capaian dihitung:  DashInsight.render(R, d)  (R = { susut, p2tl, gm, lbkb }, d = data Beranda). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const UP3 = 'UP3 Mamuju';
  const YEAR = new Date().getFullYear();
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const frac = () => { const n = new Date(); return (n - new Date(YEAR, 0, 1)) / (new Date(YEAR + 1, 0, 1) - new Date(YEAR, 0, 1)); };
  const charts = {};
  let lastArgs = null;

  const cc = (c) => (c == null ? css('--muted') : c >= 100 ? '#1baf7a' : c >= 75 ? '#eda100' : '#e34948');
  const up3 = (r) => (r && r.rows ? r.rows[r.rows.length - 1] : null);
  const ulpRows = (r) => (r && r.rows ? r.rows.slice(0, -1) : []);
  const nm = (u) => String(u).replace(/^ULP\s+/i, '');

  // ---------- peringatan kinerja (digabung ke lonceng/daftar peringatan Beranda) ----------
  function alerts(R) {
    const A = [], f = frac() * 100, add = (lv, src, t, d, go) => A.push({ lv, src, t, d, go });
    [['p2tl', 'Perolehan P2TL', 'kWh'], ['gm', 'Peremajaan kWh tua', 'meter']].forEach(([k, label, unit]) => {
      const x = R[k]; if (!x || !x.rows) return;
      const rows = ulpRows(x).filter((u) => u.t > 0);
      const bad = rows.filter((u) => u.c < f * 0.5), warn = rows.filter((u) => u.c >= f * 0.5 && u.c < f * 0.8);
      const txt = (a) => a.map((u) => `${nm(u.u)} ${fmt(u.c, 1)}%`).join(', ');
      if (bad.length) add('bad', 'Kinerja', `${label}: ${bad.length} ULP jauh tertinggal`, `Waktu berjalan ${fmt(f, 0)}% tetapi capaian ${txt(bad)}.`, k === 'p2tl' ? '#rp2tl' : '#gm');
      else if (warn.length) add('warn', 'Kinerja', `${label}: ${warn.length} ULP di bawah laju yang dibutuhkan`, `Waktu berjalan ${fmt(f, 0)}%, capaian ${txt(warn)}.`, k === 'p2tl' ? '#rp2tl' : '#gm');
      void unit;
    });
    const L = R.lbkb;
    if (L && L.rows) {
      const r4 = ulpRows(L).filter((u) => u.a4 > 0), r3 = ulpRows(L).filter((u) => u.a3 > 0);
      if (r4.length) add('bad', 'LBKB', 'Ada pelanggan LBKB berulang lebih dari 3 bulan', r4.map((u) => `${nm(u.u)} (${fmt(u.a4)})`).join(', ') + '.', '#lbkb');
      if (r3.length) add('warn', 'LBKB', 'Pelanggan LBKB berulang tepat 3 bulan', r3.map((u) => `${nm(u.u)} (${fmt(u.a3)})`).join(', ') + ' — tindak lanjuti sebelum bulan depan.', '#lbkb');
    }
    [['p2tl', 'Tagihan susulan'], ['lbkb', 'LBKB']].forEach(([k, label]) => {
      const g = R[k] && R[k].gen; if (!g) return;
      const age = Math.floor((Date.now() - new Date(g).getTime()) / 864e5);
      if (age > 7) add('info', 'Data', `Data ${label} belum diperbarui ${age} hari`, 'Periksa file di Drive dan sinkron otomatis.', k === 'p2tl' ? '#ts' : '#lbkb');
    });
    return A;
  }

  // ---------- ringkasan siap bagikan ----------
  function share(R, d) {
    const el = $('hShare'); if (!el || !window.DashShare) return;
    const C = DashShare.COL, col = (c) => (c == null ? C.MUT : c >= 100 ? C.GRN : c >= 75 ? C.AMB : C.RED);
    const S = R.susut, P = R.p2tl, G = R.gm, L = R.lbkb, us = up3(S), up = up3(P), ug = up3(G), ul = up3(L);
    const pc = (c) => (c == null ? '–' : fmt(c, 1) + '%');
    const hero = [
      us ? { t: 'Susut distribusi', u: pc(us.c), v: fmt(us.r, 2) + '%', s: `target ${fmt(us.t, 2)}%`, c: col(us.c) } : null,
      up ? { t: 'Perolehan P2TL', u: pc(up.c), v: fmt(up.r) + ' kWh', s: up.t ? `target ${fmt(up.t)} kWh` : 'target belum diisi', c: col(up.c) } : null,
      ug ? { t: 'Meter tua diganti', u: pc(ug.c), v: fmt(ug.r) + ' meter', s: ug.t ? `target ${fmt(ug.t)} meter` : 'target belum diisi', c: col(ug.c) } : null,
      ul ? { t: 'Tindak lanjut LBKB', u: pc(ul.c), v: fmt(ul.r, 1) + '%', s: `target ${fmt(ul.t, 0)}%`, c: col(ul.c) } : null,
    ].filter(Boolean);
    const tiles = ulpRows(P).map((u) => ({ t: nm(u.u), v: u.c == null ? '–' : fmt(u.c, 1) + '%', u: 'P2TL', c: col(u.c) }));
    const lines = [`*Kinerja UP3 Mamuju* — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, `Target s.d. 31 Des ${YEAR} · waktu berjalan ${fmt(frac() * 100, 0)}%`, ''];
    if (us) lines.push(`1. Susut distribusi: ${fmt(us.r, 2)}% (target ${fmt(us.t, 2)}%) → capaian ${pc(us.c)}`);
    if (up) lines.push(`2. Perolehan P2TL: ${fmt(up.r)} kWh${up.t ? ` dari target ${fmt(up.t)} kWh` : ''} → ${pc(up.c)}`);
    if (ug) lines.push(`3. Meter tua diganti: ${fmt(ug.r)}${ug.t ? ` dari ${fmt(ug.t)}` : ''} → ${pc(ug.c)}`);
    if (ul) lines.push(`4. Tindak lanjut LBKB: ${fmt(ul.r, 1)}% → capaian ${pc(ul.c)}`);
    const worst = (r) => ulpRows(r).filter((u) => u.c != null).sort((a, b) => a.c - b.c)[0];
    [['P2TL', P], ['Ganti meter', G]].forEach(([n, r]) => { const w = r && r.rows && worst(r); if (w && w.c < 100) lines.push(`Perlu dikejar (${n}): ${nm(w.u)} ${pc(w.c)}`); });
    const al = alerts(R).filter((a) => a.lv !== 'info');
    if (al.length) { lines.push('', '*Peringatan*'); al.slice(0, 5).forEach((a) => lines.push('• ' + a.t)); }
    DashShare.set(el, { title: 'Kinerja UP3 Mamuju', subtitle: `Capaian target s.d. 31 Desember ${YEAR}`, tag: 'Waktu berjalan ' + fmt(frac() * 100, 0) + '%', hero, tilesTitle: 'Capaian perolehan P2TL per ULP', tiles, text: lines.join('\n'), file: 'kinerja-up3-mamuju', foot: 'PLN UP3 Mamuju · Dashboard TE' });
    void d;
  }

  // ---------- proyeksi ----------
  function proyeksi(R) {
    const f = frac(), left = Math.max(0.25, (1 - f) * 12);
    const tbl = (r, unit) => {
      if (!r || !r.rows) return '<p class="hint">Data belum tersedia.</p>';
      return '<div class="table-wrap"><table class="b-tbl"><thead><tr><th>ULP</th><th>Target (' + unit + ')</th><th>Realisasi</th><th>Proyeksi 31 Des</th><th>Capaian proyeksi</th><th>Perlu per bulan (sisa)</th><th>Status</th></tr></thead><tbody>' +
        r.rows.map((x) => {
          if (!x.t) return `<tr${x.u === UP3 ? ' class="tot"' : ''}><td>${esc(x.u)}</td><td>–</td><td>${fmt(x.r)}</td><td>–</td><td>–</td><td>–</td><td>target belum diisi</td></tr>`;
          const pj = x.r / f, pc = pj / x.t * 100, need = Math.max(0, x.t - x.r) / left, st = pc >= 100 ? ['Diperkirakan tercapai', '#1baf7a'] : pc >= 90 ? ['Berisiko', '#eda100'] : ['Tertinggal', '#e34948'];
          return `<tr${x.u === UP3 ? ' class="tot"' : ''}><td>${esc(x.u)}</td><td>${fmt(x.t)}</td><td>${fmt(x.r)}</td><td>${fmt(pj)}</td><td><b style="color:${st[1]}">${fmt(pc, 1)}%</b></td><td>${fmt(need)}</td><td><b style="color:${st[1]}">${st[0]}</b></td></tr>`;
        }).join('') + '</tbody></table></div>';
    };
    return `<article class="card k-card"><div class="card-head"><div><h2>Proyeksi capaian s.d. 31 Desember ${YEAR}</h2><p class="hint">Linear dari realisasi tahun berjalan (${fmt(f * 100, 0)}% waktu berjalan); "perlu per bulan" = sisa target ÷ sisa bulan</p></div></div>
      <h3 class="ts-h">Perolehan P2TL (kWh)</h3>${tbl(R.p2tl, 'kWh')}<h3 class="ts-h" style="margin-top:14px">Peremajaan kWh tua (meter)</h3>${tbl(R.gm, 'meter')}
      <p class="hint k-note">Proyeksi mengandaikan laju tetap sepanjang tahun, jadi hanya perkiraan kasar: temuan P2TL dan ganti meter biasanya tidak merata antar bulan.</p></article>`;
  }

  // ---------- tren ----------
  function tren(R, d) {
    const sm = d && d.susut, parts = [];
    if (sm && sm.up3 && sm.up3.bulanan) {
      const last = sm.last, row = (u) => { const b = u.bulanan, cur = b[last], prv = last > 0 ? b[last - 1] : null, a3 = b.slice(Math.max(0, last - 3), last).filter((v) => v != null);
        const avg = a3.length ? a3.reduce((s, v) => s + v, 0) / a3.length : null, dl = cur != null && prv != null ? cur - prv : null;
        return `<tr${u === sm.up3 ? ' class="tot"' : ''}><td>${esc(String(u.name).replace(/^ULP\s+/i, ''))}</td><td>${cur == null ? '–' : fmt(cur, 2)}</td><td>${prv == null ? '–' : fmt(prv, 2)}</td><td>${dl == null ? '–' : `<b style="color:${dl > 0 ? '#e34948' : '#1baf7a'}">${dl > 0 ? '▲ +' : '▼ '}${fmt(dl, 2)}</b>`}</td><td>${avg == null ? '–' : fmt(avg, 2)}</td><td>${u.trg != null ? fmt(u.trg, 2) : '–'}</td></tr>`; };
      parts.push(`<div><h3 class="ts-h">Susut bulanan (%) — ${esc(sm.monthsFull[last])} dibanding bulan lalu</h3><div class="chart" id="iChSusut" style="height:260px"></div>
        <div class="table-wrap"><table class="b-tbl"><thead><tr><th>Unit</th><th>Bulan ini</th><th>Bulan lalu</th><th>Perubahan (poin)</th><th>Rata-rata 3 bln sebelumnya</th><th>Target</th></tr></thead><tbody>${sm.units.map(row).join('')}${row(sm.up3)}</tbody></table></div></div>`);
    }
    const P = R.p2tl;
    if (P && P.mon) parts.push(`<div><h3 class="ts-h">Perolehan P2TL per bulan (kWh) ${YEAR}</h3><div class="chart" id="iChP2tl" style="height:260px"></div></div>`);
    return `<article class="card k-card"><div class="card-head"><div><h2>Tren bulanan</h2><p class="hint">Perubahan dibanding bulan sebelumnya dan rata-rata tiga bulan sebelumnya</p></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px">${parts.join('') || '<p class="hint">Data belum tersedia.</p>'}</div></article>`;
  }

  function drawCharts(R, d) {
    const ink = css('--ink-2') || '#444', mut = css('--muted') || '#888', grid = css('--border') || '#ddd';
    const mk = (id, opt) => { const el = $(id); if (!el) return; if (!charts[id] || charts[id].getDom() !== el) { if (charts[id]) charts[id].dispose(); charts[id] = echarts.init(el, null, { renderer: 'svg' }); } charts[id].setOption({ animation: false, textStyle: { color: ink }, legend: { top: 0, textStyle: { color: ink, fontSize: 12 } }, grid: { left: 8, right: 14, top: 34, bottom: 8, containLabel: true }, tooltip: { trigger: 'axis' }, ...opt }, true); };
    const sm = d && d.susut;
    if (sm && sm.up3 && $('iChSusut')) {
      const ms = sm.months || sm.monthsFull.map((m) => m.slice(0, 3));
      mk('iChSusut', { xAxis: { type: 'category', data: ms, axisLabel: { color: ink } }, yAxis: { type: 'value', axisLabel: { color: mut, formatter: '{value}%' }, splitLine: { lineStyle: { color: grid } }, scale: true },
        series: [{ name: 'Susut bulanan UP3', type: 'line', smooth: true, symbolSize: 7, itemStyle: { color: '#2a78d6' }, data: sm.up3.bulanan.map((v, i) => (i <= sm.last ? v : null)), label: { show: true, color: ink, fontSize: 10, formatter: (p) => (p.value == null ? '' : fmt(p.value, 2)) } },
          { name: 'Target', type: 'line', symbol: 'none', lineStyle: { type: 'dashed', color: '#e34948' }, itemStyle: { color: '#e34948' }, data: sm.up3.bulanan.map(() => sm.up3.trg) }] });
    }
    const P = R.p2tl;
    if (P && P.mon && $('iChP2tl')) {
      mk('iChP2tl', { xAxis: { type: 'category', data: BLN, axisLabel: { color: ink } }, yAxis: { type: 'value', axisLabel: { color: mut, formatter: (v) => fmt(v) }, splitLine: { lineStyle: { color: grid } } },
        series: [{ name: 'Realisasi (kWh)', type: 'bar', barMaxWidth: 26, itemStyle: { color: '#2a78d6' }, data: P.mon.real },
          { name: 'Target (kWh)', type: 'line', symbolSize: 6, itemStyle: { color: '#eda100' }, data: P.mon.targ.map((v) => v || null) }] });
    }
  }

  function render(R, d) {
    lastArgs = [R, d];
    const host = $('hInsight'); if (!host) return;
    host.innerHTML = proyeksi(R) + tren(R, d);
    share(R, d);
    drawCharts(R, d);
    if (window.DashBeranda && DashBeranda.addAlerts) DashBeranda.addAlerts(alerts(R), 'Kinerja', 'LBKB', 'Data');
  }

  new MutationObserver(() => { if (lastArgs && document.body.dataset.view === 'beranda') { drawCharts(...lastArgs); share(...lastArgs); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
  window.DashInsight = { render };
})();
