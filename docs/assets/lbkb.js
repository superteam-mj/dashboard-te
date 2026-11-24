/* Transaksi Energi > LBKB: ringkasan menurut kode pesan (kd_pesan) + peringatan kode berulang.
   Data: tabel Supabase tul_data id='lbkb', diisi otomatis oleh sync_drive.py dari folder Drive "Transaksi Energi/Mon DPM".
   Aturan: kode dipantau = D.watch. Rangkaian bulan berturut-turut berkode dipantau (kode boleh berbeda): 2 = Hati-hati (kuning),
   3 = Bahaya (merah), 4 atau lebih = Kinerja 0 (hitam). Hash: #lbkb, #lbkb/<halaman> */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const ym = (m) => BLN[+m.slice(4) - 1] + ' ' + m.slice(0, 4);
  const ymS = (m) => BLN[+m.slice(4) - 1].slice(0, 3) + ' ' + m.slice(2, 4);
  const PAGE = 100;
  const LV = ['Aman', 'Hati-hati', 'Bahaya', 'Kinerja 0'];
  const LVC = ['', 'lb-b1', 'lb-b2', 'lb-b3'];
  const T = { page: 'ringkasan', pg: 0, m: '' };
  const F = { u: '', l: '2', k: '', q: '' };   // l: '1' = semua berkode pantau, '2' = peringatan (>= Hati-hati), '3' = Bahaya ke atas, 'x' = Kinerja 0
  let D = null, loading = null, charts = {}, rows = [];

  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'lbkb').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.months || []).length) throw new Error('belum ada data');
          D = data.data;
          return D;
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }
  const watch = (k) => D.watch.includes(k);
  const nextYm = (m) => { let y = +m.slice(0, 4), q = +m.slice(4); if (q === 12) { y++; q = 1; } else q++; return String(y) + String(q).padStart(2, '0'); };
  // panjang rangkaian kode dipantau yang berakhir di bulan ke-i (bulan harus berurutan menurut kalender)
  function streak(codes, i) {
    let n = 0;
    while (i >= 0 && watch(codes[i])) { n++; if (i === 0 || nextYm(D.months[i - 1]) !== D.months[i]) break; i--; }
    return n;
  }
  const lvl = (n) => (n < 2 ? 0 : n === 2 ? 1 : n === 3 ? 2 : 3);

  // ---------- grafik ----------
  const base = () => ({
    animationDuration: 400,
    textStyle: { fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: css('--ink-2') },
    tooltip: { backgroundColor: css('--surface'), borderColor: css('--border'), borderWidth: 1, textStyle: { color: css('--ink'), fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);' },
  });
  function chart(id) {
    if (charts[id] && charts[id].getDom() !== $(id)) { charts[id].dispose(); delete charts[id]; }
    if (!charts[id]) charts[id] = echarts.init($(id), null, { renderer: 'svg' });
    return charts[id];
  }
  const ttRow = (name, value, color) => `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:150px"><span style="display:flex;gap:6px;align-items:center">${color ? `<i style="width:9px;height:9px;border-radius:3px;background:${color};display:inline-block"></i>` : ''}${esc(name)}</span><b style="font-variant-numeric:tabular-nums">${value}</b></div>`;
  const axisCommon = () => ({ axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } });
  const LVCOL = () => ['#e0a800', css('--down') || '#d6453a', '#111827'];

  // ---------- data per bulan ----------
  const mi = () => D.months.indexOf(T.m);
  function kodeTotals(m) {   // {kode: {ulp: n}}
    const o = {};
    Object.entries(D.counts[m] || {}).forEach(([u, ks]) => Object.entries(ks).forEach(([k, n]) => { (o[k] || (o[k] = {}))[u] = n; }));
    return o;
  }
  const sumv = (o) => Object.values(o).reduce((s, x) => s + x, 0);
  const lvTot = (m) => { const a = [0, 0, 0, 0]; Object.values(D.lv[m] || {}).forEach((v) => v.forEach((x, i) => { a[i] += x; })); return a; };

  const ICON = { n: 'M19.4 12.9a7 7 0 0 0 0-1.8l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.6-.9L15.2 4h-4l-.4 2.3a7 7 0 0 0-1.6.9l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 1.8l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.6.9l.4 2.3h4l.4-2.3a7 7 0 0 0 1.6-.9l2.3 1 2-3.4zM13.2 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z', warn: 'M12 2 1 21h22zm1 16h-2v-2h2zm0-4h-2V9h2z' };
  const kpiHtml = (defs) => defs.map((d, i) =>
    `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON[d.i]}"/></svg></span><div class="lbl">${d.l}</div></div>` +
    `<div class="val">${fmt(d.v)}<small>${d.u || ''}</small></div><div class="ytd">${d.sub}${d.go ? ` · <button type="button" class="b-link" data-l="${d.go}">Lihat daftar ›</button>` : ''}</div></div>`).join('');

  // ---------- halaman ----------
  function renderRingkasan() {
    const m = T.m, kt = kodeTotals(m), tot = Object.values(kt).reduce((s, o) => s + sumv(o), 0), lv = lvTot(m);
    $('lbMeta').innerHTML = `<span class="chip">${ym(m)}</span><span class="chip">kode dipantau: ${D.watch.join(', ')}</span>`;
    $('lbKpis').innerHTML = kpiHtml([
      { i: 'n', l: 'Pelanggan terbaca', v: tot, u: 'pelanggan', sub: `${fmt(Object.keys(kt).length)} kode pesan` },
      { i: 'warn', l: 'Berkode dipantau', v: lv[0], u: 'pelanggan', sub: `${fmt(tot ? lv[0] / tot * 100 : 0, 2)}% dari pelanggan`, go: '1' },
      { i: 'warn', l: 'Hati-hati (2 bulan)', v: lv[1], u: 'pelanggan', sub: 'kode dipantau 2 bulan berturut-turut', go: '2' },
      { i: 'warn', l: 'Bahaya (3 bulan)', v: lv[2], u: 'pelanggan', sub: 'kode dipantau 3 bulan berturut-turut', go: '3' },
      { i: 'warn', l: 'Kinerja 0 (4+ bulan)', v: lv[3], u: 'pelanggan', sub: 'kode dipantau 4 bulan atau lebih', go: 'x' },
    ]);
    // per kode pesan (batang; kode dipantau berwarna, lainnya abu-abu, skala log agar kode kecil tetap terlihat)
    const items = Object.entries(kt).map(([k, o]) => ({ k, n: sumv(o) })).sort((a, b) => b.n - a.n);
    $('lbChKode').style.height = (56 + items.length * 30) + 'px';
    chart('lbChKode').setOption(Object.assign(base(), {
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>Kode ${esc(ps[0].name)}</b>` + ttRow('Pelanggan', fmt(ps[0].value), ps[0].color) + (watch(ps[0].name) ? '<div style="color:#a16207">kode dipantau</div>' : '') }),
      xAxis: { type: 'log', min: 1, axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => (v >= 1e3 ? fmt(v / 1e3, 0) + ' rb' : fmt(v)) }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((x) => x.k) }, axisCommon()),
      series: [{ type: 'bar', barMaxWidth: 18, label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => fmt(p.value) },
        data: items.map((x) => ({ value: x.n, itemStyle: { color: watch(x.k) ? '#e0a800' : css('--muted'), borderRadius: [0, 4, 4, 0], opacity: watch(x.k) ? 1 : 0.55 } })) }],
    }), true);
    // tabel kode x ULP
    const ks = items.map((x) => x.k);
    $('lbKodeTbl').innerHTML = `<thead><tr><th class="l">Kode</th>${D.ulps.map((u) => `<th>${esc(u)}</th>`).join('')}<th>UP3 Mamuju</th></tr></thead><tbody>` +
      ks.map((k) => `<tr${watch(k) ? ' class="lb-watch"' : ''}><td class="l"><b>${esc(k)}</b>${watch(k) ? ' <span class="lb-tag">dipantau</span>' : ''}</td>${D.ulps.map((u) => `<td>${kt[k][u] ? fmt(kt[k][u]) : '–'}</td>`).join('')}<td><b>${fmt(sumv(kt[k]))}</b></td></tr>`).join('') +
      `<tr class="tot"><td class="l"><b>Total</b></td>${D.ulps.map((u) => `<td><b>${fmt(ks.reduce((s, k) => s + (kt[k][u] || 0), 0))}</b></td>`).join('')}<td><b>${fmt(tot)}</b></td></tr></tbody>`;
    // peringatan per ULP
    $('lbUlpTbl').innerHTML = '<thead><tr><th class="l">ULP</th><th>Berkode dipantau</th><th>Hati-hati</th><th>Bahaya</th><th>Kinerja 0</th></tr></thead><tbody>' +
      D.ulps.map((u) => { const v = (D.lv[m] || {})[u] || [0, 0, 0, 0]; return `<tr><td class="l">${esc(u)}</td><td>${lk(v[0], '1', u)}</td><td>${lk(v[1], '2', u, 'lb-b1')}</td><td>${lk(v[2], '3', u, 'lb-b2')}</td><td>${lk(v[3], 'x', u, 'lb-b3')}</td></tr>`; }).join('') +
      `<tr class="tot"><td class="l"><b>UP3 Mamuju</b></td><td><b>${fmt(lv[0])}</b></td><td><b>${fmt(lv[1])}</b></td><td><b>${fmt(lv[2])}</b></td><td><b>${fmt(lv[3])}</b></td></tr></tbody>`;
    // tren per bulan
    const ms = D.months, tr = ms.map(lvTot), col = LVCOL();
    chart('lbChTren').setOption(Object.assign(base(), {
      color: ['#9ca3af'].concat(col),
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ps.map((x) => ttRow(x.seriesName, fmt(x.value), x.color)).join('') + ttRow('Berkode dipantau', fmt(ps.reduce((s, x) => s + x.value, 0))) }),
      xAxis: Object.assign({ type: 'category', data: ms.map(ymS) }, axisCommon()),
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: css('--muted'), fontSize: 11 }, splitLine: { lineStyle: { color: css('--grid') } } },
      series: [
        { name: 'Baru 1 bulan', type: 'bar', stack: 'a', barMaxWidth: 46, data: tr.map((v) => v[0] - v[1] - v[2] - v[3]) },
        { name: 'Hati-hati', type: 'bar', stack: 'a', barMaxWidth: 46, data: tr.map((v) => v[1]) },
        { name: 'Bahaya', type: 'bar', stack: 'a', barMaxWidth: 46, data: tr.map((v) => v[2]) },
        { name: 'Kinerja 0', type: 'bar', stack: 'a', barMaxWidth: 46, data: tr.map((v) => v[3]) },
      ],
    }), true);
  }
  const lk = (n, l, u, cls) => (n ? `<button type="button" class="b-link ${cls || ''}" data-l="${l}" data-u="${esc(u)}">${fmt(n)}</button>` : '–');

  // ---------- peringatan ----------
  function listAll() {
    const i = mi();
    return D.rows.map((r) => { const s = streak(r[5], i); return { idpel: r[0], nama: r[1], ulp: r[2], tarif: r[3], daya: r[4], codes: r[5], n: s, l: lvl(s) }; }).filter((r) => r.n >= 1);
  }
  function applyFilter() {
    const q = F.q.trim().toLowerCase();
    rows = listAll().filter((r) => (!F.u || r.ulp === F.u) && (F.l === '1' || (F.l === '2' && r.l >= 1) || (F.l === '3' && r.l >= 2) || (F.l === 'x' && r.l >= 3)) &&
      (!F.k || r.codes[mi()] === F.k) && (!q || r.idpel.toLowerCase().includes(q) || String(r.nama).toLowerCase().includes(q)))
      .sort((a, b) => b.l - a.l || b.n - a.n || a.ulp.localeCompare(b.ulp) || a.idpel.localeCompare(b.idpel));
  }
  function renderPeringatan() {
    applyFilter();
    const i = mi(), ms = D.months.slice(Math.max(0, i - 5), i + 1);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE)); T.pg = Math.min(T.pg, pages - 1);
    const cell = (c) => `<td>${c ? `<span class="lb-c${watch(c) ? ' w' : ''}">${esc(c)}</span>` : '–'}</td>`;
    $('lbTbl').innerHTML = `<thead><tr><th class="l">Status</th><th class="l">ULP</th><th class="l">ID Pelanggan</th><th class="l">Nama</th><th class="l">Tarif</th><th>Daya (VA)</th>${ms.map((m) => `<th>${ymS(m)}</th>`).join('')}<th>Berturut-turut</th></tr></thead><tbody>` +
      rows.slice(T.pg * PAGE, T.pg * PAGE + PAGE).map((r) => `<tr><td class="l"><span class="lb-b ${LVC[r.l]}">${r.l ? LV[r.l] : 'Pantau'}</span></td><td class="l">${esc(r.ulp)}</td><td class="l">${esc(r.idpel)}</td><td class="l">${esc(r.nama)}</td><td class="l">${esc(r.tarif)}</td><td>${r.daya ? fmt(+r.daya) : '–'}</td>${ms.map((m) => cell(r.codes[D.months.indexOf(m)])).join('')}<td>${r.n} bulan</td></tr>`).join('') +
      (rows.length ? '' : `<tr><td class="l" colspan="${7 + ms.length}">Tidak ada pelanggan yang cocok.</td></tr>`) + '</tbody>';
    $('lbHint').textContent = `${fmt(rows.length)} pelanggan · bulan ${ym(T.m)} · Hati-hati 2 bulan, Bahaya 3 bulan, Kinerja 0 mulai 4 bulan berturut-turut`;
    $('lbPage').textContent = `Halaman ${T.pg + 1} dari ${pages}`;
    $('lbPrev').disabled = T.pg === 0; $('lbNext').disabled = T.pg >= pages - 1; $('lbCsv').disabled = !rows.length;
  }
  function csvDetail() {
    const txt = (v) => { v = v == null ? '' : String(v).replace(/"/g, '""'); return '"' + (/^[=+\-@]/.test(v) ? "'" + v : v) + '"'; };
    const head = ['Status', 'ULP', 'ID Pelanggan', 'Nama', 'Tarif', 'Daya (VA)', ...D.months.map(ym), 'Berturut-turut (bulan)'];
    const body = rows.map((r) => [r.l ? LV[r.l] : 'Pantau', r.ulp, r.idpel, r.nama, r.tarif, r.daya, ...r.codes, r.n].map(txt).join(';'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [head.map(txt).join(';')].concat(body).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'LBKB_peringatan_' + T.m + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- tampilan ----------
  const PAGES = { ringkasan: renderRingkasan, peringatan: renderPeringatan };
  const TITLE = { ringkasan: 'Ringkasan kode pesan', peringatan: 'Peringatan kode berulang' };
  function fillUi() {
    const sel = $('lbPeriod');
    if (sel.options.length !== D.months.length) sel.innerHTML = D.months.slice().reverse().map((m) => `<option value="${m}">${ym(m)}</option>`).join('');
    sel.value = T.m; sel.hidden = false;
    $('lbFU').innerHTML = '<option value="">Semua ULP</option>' + D.ulps.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
    $('lbFK').innerHTML = '<option value="">Semua kode</option>' + D.watch.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  }
  function renderAll() {
    if (!PAGES[T.page]) T.page = 'ringkasan';
    $('lbCrumb').innerHTML = `<span>Transaksi Energi</span><i>›</i><span>LBKB</span><i>›</i><b>${esc(TITLE[T.page])}</b>`;
    document.querySelectorAll('#lbBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== T.page; });
    document.querySelectorAll('#subLbkb button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === T.page)));
    $('lbPeriod').value = T.m;
    if (T.page === 'peringatan') { $('lbFU').value = F.u; $('lbFL').value = F.l; $('lbFK').value = F.k; $('lbQ').value = F.q; }
    PAGES[T.page]();
    $('lbFoot').innerHTML = `Sumber: Excel Mon DPM (${fmt(D.files.reduce((s, x) => s + x.rows, 0))} baris, ${D.months.length} bulan) · Data diperbarui ${new Date(D.generated_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
    setTimeout(() => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()), 30);
  }
  const hashPage = () => { const m = location.hash.match(/^#lbkb(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'ringkasan'; };
  async function show(page) {
    window.DashSetView('lbkb');
    T.page = page || hashPage();
    const h = '#lbkb' + (T.page === 'ringkasan' ? '' : '/' + T.page);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    $('lbMsg').hidden = false; $('lbMsg').textContent = 'Memuat data LBKB…'; $('lbBody').hidden = true;
    try { await load(); } catch (e) { $('lbMsg').textContent = 'Data LBKB belum tersedia (' + e.message + '). Letakkan Excel monitoring_dpm_YYMM di folder Drive Transaksi Energi / Mon DPM, lalu tunggu sinkron berikutnya.'; return; }
    if (!T.m || !D.months.includes(T.m)) T.m = D.months[D.months.length - 1];
    fillUi();
    $('lbMsg').hidden = true; $('lbBody').hidden = false;
    renderAll(); window.scrollTo({ top: 0 });
  }
  function init() {
    $('lbPeriod').onchange = (e) => { T.m = e.target.value; T.pg = 0; renderAll(); };
    $('lbFU').onchange = (e) => { F.u = e.target.value; T.pg = 0; renderPeringatan(); };
    $('lbFL').onchange = (e) => { F.l = e.target.value; T.pg = 0; renderPeringatan(); };
    $('lbFK').onchange = (e) => { F.k = e.target.value; T.pg = 0; renderPeringatan(); };
    $('lbQ').oninput = (e) => { F.q = e.target.value; T.pg = 0; renderPeringatan(); };
    $('lbPrev').onclick = () => { T.pg = Math.max(0, T.pg - 1); renderPeringatan(); };
    $('lbNext').onclick = () => { T.pg += 1; renderPeringatan(); };
    $('lbCsv').onclick = csvDetail;
    ['lbKpis', 'lbUlpTbl'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.b-link'); if (!b) return;
      F.u = b.dataset.u || ''; F.l = b.dataset.l || '2'; F.k = ''; F.q = ''; T.pg = 0; show('peringatan');
    }));
    $('subLbkb').addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; document.body.classList.remove('nav-open'); if (b.dataset.p === 'peringatan') { F.u = ''; F.l = '2'; F.k = ''; F.q = ''; T.pg = 0; } show(b.dataset.p); });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#lbkb') && (document.body.dataset.view !== 'lbkb' || hashPage() !== T.page)) show(); });
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'lbkb') renderAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.DashLbkb = { show };
  init();
})();
