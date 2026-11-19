/* Beranda: angka kunci dari semua menu (penjualan, susut, Mon Billing, DLPD) + peringatan otomatis.
   Data dibaca dari sumber yang sama dengan menu masing-masing; satu sumber gagal tidak menghalangi yang lain.
   Peringatan dihitung di browser dari data terbaru (aturan & ambang ada di objek TH di bawah). Hash: #beranda */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const sg = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  const chg = (a, b) => (b ? (a - b) / Math.abs(b) * 100 : null);
  const titleCase = (n) => String(n).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/\bUp3\b/g, 'UP3');

  // ambang peringatan (ubah di sini bila perlu)
  const TH = {
    susutEps: 0.005,        // selisih susut ke target (poin) yang masih dianggap sesuai target
    susutNaik: 0.5,         // kenaikan susut bulanan dibanding bulan lalu (poin)
    kwhTurun: 5,            // penurunan kWh terjual dibanding bulan lalu (%)
    pelangganTurun: 1,      // penurunan jumlah pelanggan billing dibanding bulan lalu (%)
    penandaNaik: 20,        // kenaikan penanda billing / anomali dibanding bulan lalu (%)
    dlpdNaik: 5, dlpdNaikBesar: 15,  // kenaikan pelanggan DLPD (%): peringatan / genting
    dlpdUlpNaik: 15,        // kenaikan DLPD per ULP (%)
    gmBasi: 3,              // data ganti meter terakhir lebih tua dari N hari -> peringatan (file harian belum diunggah)
    belumCt: 60,            // porsi DLPD belum ada CT (%) -> informasi
  };
  const S = { data: null, loading: null, alerts: [] };

  async function loadAll() {
    await DashAuth.ready;
    const sb = DashAuth.sb, out = {};
    const jobs = {
      tul: () => Promise.race([window.DashTulReady, new Promise((_, rej) => setTimeout(() => rej(new Error('waktu habis')), 20000))]).then(() => { const k = window.DashTulKpi(); if (!k) throw new Error('kosong'); return k; }),
      susut: async () => {
        const r = await sb.from('susut_reports').select('file,title').order('file');
        if (r.error || !r.data.length) throw new Error(r.error ? r.error.message : 'belum ada laporan');
        const f = r.data[r.data.length - 1].file;
        const s = await sb.from('susut_sheets').select('data').eq('file', f).eq('idx', -1).maybeSingle();
        if (s.error || !s.data) throw new Error('ringkasan susut belum ada');
        return s.data.data;
      },
      billing: async () => { const r = await sb.from('tul_data').select('data').eq('id', 'billing').maybeSingle(); if (r.error || !r.data || !(r.data.data.order || []).length) throw new Error('belum ada data'); return r.data.data; },
      gm: async () => { const r = await sb.from('tul_data').select('data').eq('id', 'gm').maybeSingle(); if (r.error || !r.data || !(r.data.data.order || []).length) throw new Error('belum ada data'); return r.data.data; },
      dlpd: async () => { const r = await sb.from('tul_data').select('data').eq('id', 'dlpd').maybeSingle(); if (r.error || !r.data || !(r.data.data.order || []).length) throw new Error('belum ada data'); return r.data.data; },
    };
    await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { out[k] = await fn(); } catch (e) { out[k] = null; (out._err = out._err || {})[k] = e.message; } }));
    return out;
  }
  function load() {
    if (S.data) return Promise.resolve(S.data);
    if (!S.loading) S.loading = loadAll().then((d) => { S.data = d; S.alerts = buildAlerts(d); paintBell(); return d; });
    return S.loading;
  }

  // ---------- peringatan ----------
  function buildAlerts(d) {
    const A = [], add = (lv, src, t, det, go) => A.push({ lv, src, t, d: det, go });
    const sm = d.susut;
    if (sm) {
      const up = sm.up3, last = sm.last, kum = up.kum != null ? up.kum : up.kumulatif[last], gap = up.gap != null ? up.gap : kum - up.trg, month = sm.monthsFull[last];
      if (gap > TH.susutEps) add('bad', 'Susut', `Susut ${titleCase(up.name)} di atas target`, `Kumulatif Januari–${month} ${fmt(kum, 2)}% vs target ${fmt(up.trg, 2)}% (${sg(gap, 2)} poin).`, '#susut');
      const over = sm.units.filter((u) => u.gap != null && u.gap > TH.susutEps).sort((a, b) => b.gap - a.gap);
      if (over.length) add('warn', 'Susut', `${over.length} dari ${sm.units.length} ULP susutnya di atas target`, over.map((u) => `${titleCase(u.name)} (${sg(u.gap, 2)})`).join(', ') + '.', '#susut');
      const cur = up.bulanan[last], prv = last > 0 ? up.bulanan[last - 1] : null;
      if (cur != null && prv != null && cur - prv > TH.susutNaik) add('warn', 'Susut', 'Susut bulanan naik tajam', `${month}: ${fmt(cur, 2)}% (naik ${fmt(cur - prv, 2)} poin dari bulan sebelumnya).`, '#susut');
    }
    const t = d.tul;
    if (t && t.prev) {
      const c = chg(t.cur.kwh, t.prev.kwh);
      if (c != null && c < -TH.kwhTurun) add('warn', 'Penjualan', 'Energi terjual turun', `${t.label}: ${fmt(t.cur.kwh)} kWh, turun ${fmt(Math.abs(c), 1)}% dari ${t.prevLabel}.`, 'transaksi');
    }
    const b = d.billing;
    if (b) {
      const o = b.order, p = b.periods[o[o.length - 1]], pv = o.length > 1 ? b.periods[o[o.length - 2]] : null;
      if (pv) {
        const ck = chg(p.total.kwh, pv.total.kwh), cn = chg(p.total.n, pv.total.n);
        if (ck != null && ck < -TH.kwhTurun) add('warn', 'Mon Billing', 'kWh tertagih turun', `${p.label}: ${fmt(p.total.kwh)} kWh, turun ${fmt(Math.abs(ck), 1)}% dari ${pv.label}.`, '#billing/sebab');
        if (cn != null && cn < -TH.pelangganTurun) add('warn', 'Mon Billing', 'Jumlah pelanggan tertagih turun', `${p.label}: ${fmt(p.total.n)} pelanggan (${sg(p.total.n - pv.total.n)} dari ${pv.label}).`, '#billing/pelanggan');
        const grow = [];
        p.flags.forEach((f) => { const q = pv.flags.find((x) => x.k === f.k); if (q && q.n >= 20 && chg(f.n, q.n) > TH.penandaNaik) grow.push(`${f.label} ${fmt(f.n)} (${sg(f.n - q.n)})`); });
        if (grow.length) add('warn', 'Mon Billing', 'Penanda kualitas pembacaan naik', grow.join('; ') + '.', '#billing');
      }
      const A2 = b.analytics;
      if (A2 && A2.anom && A2.anom[A2.latest]) {
        const i = o.indexOf(A2.latest), cur = A2.anom[A2.latest], prv = i > 0 ? A2.anom[o[i - 1]] : null, grow = [];
        A2.rules.forEach((r) => { const v = cur[r.k], q = prv && prv[r.k]; if (v != null && q != null && q >= 20 && chg(v, q) > TH.penandaNaik) grow.push(`${r.label} ${fmt(v)} (${sg(v - q)})`); });
        if (grow.length) add('warn', 'Mon Billing', 'Anomali berulang bertambah', grow.join('; ') + '.', '#billing/anomali');
      }
    }
    const dl = d.dlpd;
    if (dl) {
      const o = dl.order, p = dl.periods[o[o.length - 1]], pv = p.prev ? dl.periods[p.prev] : null, tot = p.total;
      if (pv) {
        const c = chg(tot.n, pv.total.n);
        if (c != null && c > TH.dlpdNaik) add(c > TH.dlpdNaikBesar ? 'bad' : 'warn', 'DLPD Prabayar', 'Pelanggan tidak beli token bertambah', `${p.label}: ${fmt(tot.n)} pelanggan, naik ${fmt(c, 1)}% dari ${pv.label} (${fmt(tot.baru)} baru, ${fmt(tot.keluar)} keluar).`, '#dlpd');
        const up = p.ulp.map((u) => { const q = pv.ulp.find((x) => x.code === u.code); return q && q.n >= 20 ? { name: u.name, c: chg(u.n, q.n), d: u.n - q.n } : null; }).filter((x) => x && x.c > TH.dlpdUlpNaik);
        if (up.length) add('warn', 'DLPD Prabayar', `${up.length} ULP naik lebih dari ${TH.dlpdUlpNaik}%`, up.map((x) => `${x.name} (${sg(x.d)}, ${sg(x.c, 1)}%)`).join(', ') + '.', '#dlpd');
      }
      const bp = tot.n ? (tot.n - tot.ct) / tot.n * 100 : 0;
      if (bp > TH.belumCt) add('info', 'DLPD Prabayar', 'Banyak pelanggan belum ada CT', `${fmt(tot.n - tot.ct)} pelanggan (${fmt(bp, 1)}%) belum ada CT pada ${p.label}.`, '#dlpd/daftar');
    }
    const g = d.gm;
    if (g && g.latest) {
      const age = Math.floor((Date.now() - new Date(g.latest + 'T00:00:00').getTime()) / 864e5);
      if (age > TH.gmBasi) add(age > TH.gmBasi * 2 ? 'bad' : 'warn', 'Ganti Meter', 'Data ganti meter H+1 belum diperbarui', `Data terakhir tanggal ${g.latest.split('-').reverse().join('/')} (${age} hari lalu). Unggah file harian ke Drive.`, '#gm/harian');
    }
    const rank = { bad: 0, warn: 1, info: 2 };
    return A.sort((a, b) => rank[a.lv] - rank[b.lv]);
  }
  const alertCount = () => S.alerts.filter((a) => a.lv !== 'info').length;
  function paintBell() {
    const n = alertCount(), b = $('alertBtn'), c = $('alertN');
    if (!b) return;
    c.textContent = n > 99 ? '99+' : String(n); c.hidden = !n;
    b.title = n ? `${n} peringatan — buka Beranda` : 'Tidak ada peringatan';
    b.classList.toggle('has', n > 0);
  }

  // ---------- tampilan ----------
  const dTxt = (v, p, unit, bad) => {
    if (v == null || p == null || !p) return '';
    const c = chg(v, p), cls = Math.abs(c) < 0.05 ? 'flat' : (c > 0) === !bad ? 'up' : 'down';
    return `<span class="delta ${cls}">${c > 0 ? '▲' : c < 0 ? '▼' : '■'} ${fmt(Math.abs(c), 1)}%${unit ? ' ' + unit : ''}</span>`;
  };
  const stat = (l, v, d) => `<div class="h-stat"><span>${l}</span><b>${v}</b>${d || ''}</div>`;
  const card = (cls, title, sub, go, rows, note) => `<article class="card h-card ${cls}"><div class="card-head"><div><h2>${title}</h2><p class="hint">${sub}</p></div>` +
    `<button type="button" class="btn ghost" data-go="${esc(go)}">Buka ›</button></div>${note ? `<p class="h-note">${note}</p>` : ''}<div class="h-stats">${rows.join('')}</div></article>`;
  const missing = (title, why) => `<article class="card h-card miss"><div class="card-head"><div><h2>${title}</h2><p class="hint">Data belum tersedia${why ? ' (' + esc(why) + ')' : ''}</p></div></div></article>`;

  function render(d) {
    const E = d._err || {}, cards = [];
    const t = d.tul;
    cards.push(t ? card('c1', 'Penjualan listrik', `${esc(t.unit)} · ${esc(t.label)}`, 'transaksi', [
      stat('Energi terjual', fmt(t.cur.kwh) + ' kWh', t.prev && dTxt(t.cur.kwh, t.prev.kwh, 'vs ' + t.prevLabel)),
      stat('Pendapatan', 'Rp ' + fmt(t.cur.rp), t.prev && dTxt(t.cur.rp, t.prev.rp)),
      stat('Pelanggan', fmt(t.cur.c), t.prev && dTxt(t.cur.c, t.prev.c)),
      stat('Rp/kWh kumulatif', fmt(t.bpp, 2)),
      t.pasca != null ? stat('Pascabayar / Prabayar', `${fmt(t.pasca)} / ${fmt(t.pra)}`) : '',
    ]) : missing('Penjualan listrik', E.tul));

    const sm = d.susut;
    if (sm) {
      const up = sm.up3, last = sm.last, kum = up.kum != null ? up.kum : up.kumulatif[last], gap = up.gap != null ? up.gap : kum - up.trg, over = gap > TH.susutEps;
      const nOver = sm.units.filter((u) => u.gap != null && u.gap > TH.susutEps).length;
      cards.push(card('c2', 'Pengendalian susut', `${esc(titleCase(up.name))} · Januari–${esc(sm.monthsFull[last])}`, '#susut', [
        stat('Susut kumulatif', fmt(kum, 2) + '%', `<span class="delta ${over ? 'down' : 'up'}">${over ? '▲ di atas target' : '✓ sesuai target'}</span>`),
        stat('Target', fmt(up.trg, 2) + '%'),
        stat('Selisih', sg(gap, 2) + ' poin'),
        stat(`Bulan ${esc(sm.monthsFull[last])}`, up.bulanan[last] == null ? '–' : fmt(up.bulanan[last], 2) + '%'),
        stat('ULP di atas target', `${nOver} dari ${sm.units.length}`),
      ]));
    } else cards.push(missing('Pengendalian susut', E.susut));

    const b = d.billing;
    if (b) {
      const o = b.order, p = b.periods[o[o.length - 1]], pv = o.length > 1 ? b.periods[o[o.length - 2]] : null, tt = p.total;
      const dev = (p.flags.find((f) => f.k === 'dev50') || { n: 0 }).n;
      cards.push(card('c3', 'Mon Billing', esc(p.label), '#billing', [
        stat('Pelanggan', fmt(tt.n), pv && dTxt(tt.n, pv.total.n, 'vs ' + pv.label)),
        stat('Energi tertagih', fmt(tt.kwh) + ' kWh', pv && dTxt(tt.kwh, pv.total.kwh)),
        stat('Pendapatan listrik', 'Rp ' + fmt(tt.rppln), pv && dTxt(tt.rppln, pv.total.rppln)),
        stat('Rp/kWh', fmt(tt.kwh ? tt.rppln / tt.kwh : 0, 2)),
        stat('Selisih > 50% rata-rata', fmt(dev) + ' plg', pv && dTxt(dev, (pv.flags.find((f) => f.k === 'dev50') || {}).n, '', true)),
      ]));
    } else cards.push(missing('Mon Billing', E.billing));

    const dl = d.dlpd;
    if (dl) {
      const p = dl.periods[dl.order[dl.order.length - 1]], pv = p.prev ? dl.periods[p.prev] : null, tt = p.total;
      cards.push(card('c4', 'DLPD Prabayar', esc(p.label), '#dlpd', [
        stat('Tidak membeli token', fmt(tt.n) + ' plg', pv && dTxt(tt.n, pv.total.n, 'vs ' + pv.label, true)),
        stat('Belum ada CT', `${fmt(tt.n - tt.ct)} (${fmt(tt.n ? (tt.n - tt.ct) / tt.n * 100 : 0, 1)}%)`),
        stat('Ada temuan P2TL', fmt(tt.p2tl)),
        pv ? stat('Baru / keluar', `${fmt(tt.baru)} / ${fmt(tt.keluar)}`) : '',
        stat('ULP terbanyak', (() => { const m = p.ulp.slice().sort((a, c) => c.n - a.n)[0]; return m ? `${esc(m.name)} (${fmt(m.n)})` : '–'; })()),
      ]));
    } else cards.push(missing('DLPD Prabayar', E.dlpd));

    const gm = d.gm;
    if (gm) {
      const m = gm.months[gm.order[gm.order.length - 1]], ld = gm.days.find((x) => x.d === m.last);
      cards.push(card('c5', 'Ganti meter H+1', `Pemeliharaan Meter · ${esc(m.label)}`, '#gm', [
        stat('Total ganti meter', fmt(m.n) + ' meter'),
        stat(`Hari terakhir (${esc(m.last.split('-').reverse().join('/'))})`, fmt(ld ? ld.n : 0) + ' meter'),
        stat('Kategori tua', `${fmt(m.tua)} (${fmt(m.n ? m.tua / m.n * 100 : 0, 1)}%)`),
        stat('Prabayar / Pascabayar', `${fmt(m.pra)} / ${fmt(m.pasca)}`),
      ]));
    } else cards.push(missing('Ganti meter H+1', E.gm));
    $('hCards').innerHTML = cards.join('');
    renderAlerts();
  }

  const LV = { bad: ['Genting', 'bad'], warn: ['Perhatian', 'warn'], info: ['Informasi', 'info'] };
  function renderAlerts() {
    const A = S.alerts, n = alertCount();
    $('hAlertHead').innerHTML = `<div><h2>Peringatan otomatis</h2><p class="hint">${A.length ? `${n} perlu perhatian${A.length > n ? ` · ${A.length - n} informasi` : ''} · dihitung dari data terbaru tiap menu` : 'Tidak ada peringatan. Semua indikator dalam batas aturan di bawah.'}</p></div>`;
    $('hAlerts').innerHTML = A.length ? A.map((a, i) => `<li class="h-alert ${LV[a.lv][1]}"><span class="h-dot" aria-hidden="true"></span><div class="h-at"><div><span class="h-tag">${LV[a.lv][0]}</span> <span class="h-src">${esc(a.src)}</span></div><b>${esc(a.t)}</b><p>${esc(a.d)}</p></div>` +
      `<button type="button" class="b-link" data-go="${esc(a.go)}">Lihat ›</button></li>`).join('') : '<li class="h-ok">✓ Semua aman</li>';
    $('hRules').innerHTML = [
      `Susut kumulatif UP3 atau ULP di atas target (selisih > ${TH.susutEps} poin)`, `Susut bulanan naik lebih dari ${TH.susutNaik} poin dari bulan sebelumnya`,
      `kWh terjual (penjualan atau billing) turun lebih dari ${TH.kwhTurun}% dari bulan lalu`, `Pelanggan tertagih turun lebih dari ${TH.pelangganTurun}%`,
      `Penanda kualitas pembacaan atau anomali berulang naik lebih dari ${TH.penandaNaik}% (minimal 20 pelanggan bulan lalu)`,
      `Pelanggan tidak beli token naik lebih dari ${TH.dlpdNaik}% (genting di atas ${TH.dlpdNaikBesar}%), atau satu ULP naik lebih dari ${TH.dlpdUlpNaik}%`,
      `Data ganti meter H+1 terakhir lebih tua dari ${TH.gmBasi} hari (file harian belum diunggah)`,
      `Informasi: lebih dari ${TH.belumCt}% pelanggan DLPD belum ada CT`,
    ].map((r) => `<li>${esc(r)}</li>`).join('');
  }

  function goTo(go) {
    document.body.classList.remove('nav-open');
    if (go === 'transaksi') { const b = document.querySelector('#sections button[data-v="transaksi"]'); if (b) b.click(); return; }
    if (location.hash === go) location.hash = ''; // paksa hashchange bila sudah di hash yang sama
    location.hash = go;
  }

  async function show() {
    window.DashSetView('beranda');
    if (location.hash !== '#beranda') history.replaceState(null, '', location.pathname + location.search + '#beranda');
    $('hMsg').hidden = false; $('hMsg').textContent = 'Memuat ringkasan semua menu…';
    $('hBody').hidden = true;
    const d = await load();
    $('hMsg').hidden = true; $('hBody').hidden = false;
    render(d);
    window.scrollTo({ top: 0 });
  }

  function init() {
    $('hBody').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) goTo(b.dataset.go); });
    $('alertBtn').onclick = async () => { await show(); const el = $('hAlertCard'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#beranda') && document.body.dataset.view !== 'beranda') show(); });
    load().catch(() => {});   // lonceng terisi sejak awal, walau halaman lain yang dibuka
  }

  window.DashBeranda = { show };
  init();
})();
