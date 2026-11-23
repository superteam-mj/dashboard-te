/* Pengendalian Susut > P2TL > Realisasi Tagihan Susulan: pendapatan TS (tagihan susulan) per ULP dan per pelanggan; tunai vs angsuran.
   Data: tabel Supabase tul_data id='p2tl_ts', diisi otomatis oleh sync_drive.py dari folder Drive "Pengendalian Susut/P2TL/Laporan Tagihan Susulan".
   Hash: #ts */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const rp = (v) => 'Rp ' + fmt(Math.round(v));
  const rpM = (v) => (Math.abs(v) >= 1e9 ? fmt(v / 1e9, 2) + ' miliar' : Math.abs(v) >= 1e6 ? fmt(v / 1e6, 1) + ' juta' : fmt(v));
  const pc = (a, b) => (b ? a / b * 100 : 0);
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dmy = (d) => (d ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  const ICON = { cash: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15v1h-2v-1.1c-1.2-.2-2.2-.9-2.4-2.1h1.7c.2.5.7.8 1.4.8.8 0 1.3-.4 1.3-.9 0-.6-.4-.8-1.6-1.1-1.5-.4-2.6-.9-2.6-2.3 0-1 .8-1.8 2.2-2V7h2v1.1c1 .2 1.9.8 2.1 1.9h-1.7c-.2-.4-.6-.7-1.2-.7-.7 0-1.1.3-1.1.8 0 .5.4.7 1.6 1 1.4.4 2.6.9 2.6 2.4 0 1.1-.9 1.9-2.3 2.1z', ok: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8z', warn: 'M12 2 1 21h22zm1 16h-2v-2h2zm0-4h-2V9h2z', list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z' };

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let ch = null;
  const hc = {};
  const T = { pg: 0 };
  const F = { b: '', u: '', s: '', q: '' };
  let D = null, loading = null, all = [], cols = {}, view = [];
  const PAGE = 100;

  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'p2tl_ts').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.rows || []).length) throw new Error('belum ada data');
          D = data.data;
          D.cols.forEach((c, i) => { cols[c] = i; });
          all = D.rows.map((r) => { const o = {}; D.cols.forEach((c, i) => { o[c] = r[i]; }); o.bln = o.tgl ? o.tgl.slice(0, 7) : ''; o.lunas = o.angsur <= 0; return o; });
          return D;
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
  const kpi = (i, l, v, u, sub) => `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON[l[0]]}"/></svg></span><div class="lbl">${l[1]}</div></div><div class="val">${v}<small>${u}</small></div><div class="ytd">${sub}</div></div>`;

  function filtered() {
    const q = F.q.trim().toLowerCase();
    return all.filter((r) => (!F.b || r.bln === F.b) && (!F.u || r.ulp === F.u) && (!F.s || (F.s === 'lunas' ? r.lunas : !r.lunas)) &&
      (!q || (r.idpel + ' ' + r.nama + ' ' + r.alamat + ' ' + r.agenda + ' ' + r.sip).toLowerCase().includes(q)));
  }

  function renderSummary() {
    const a = all.filter((r) => !F.b || r.bln === F.b);
    const total = sum(a, 'total'), tunai = sum(a, 'tunai'), ang = sum(a, 'angsur'), nl = a.filter((r) => r.lunas).length;
    const lbl = F.b ? BLN[+F.b.slice(5) - 1] + ' ' + F.b.slice(0, 4) : 'semua periode';
    $('tsKpis').innerHTML = [
      kpi(0, ['list', 'Jumlah tagihan susulan'], fmt(a.length), 'kasus', `${esc(lbl)} · ${fmt(sum(a, 'kwh'))} kWh`),
      kpi(1, ['cash', 'Total tagihan P2TL'], rpM(total), '', rp(total)),
      kpi(2, ['ok', 'Realisasi (tunai)'], rpM(tunai), '', `${fmt(pc(tunai, total), 1)}% dari tagihan · ${fmt(nl)} lunas`),
      kpi(3, ['warn', 'Belum terbayar (angsuran)'], rpM(ang), '', `${fmt(pc(ang, total), 1)}% dari tagihan · ${fmt(a.length - nl)} kasus`),
    ].join('');
    const ulps = [...new Set(a.map((r) => r.ulp))].sort();
    const row = (n, x) => `<tr${n === 'UP3 Mamuju' ? ' class="tot"' : ''}><td>${esc(n)}</td><td>${fmt(x.length)}</td><td>${fmt(sum(x, 'kwh'))}</td><td>${fmt(sum(x, 'rp_ts'))}</td><td>${fmt(sum(x, 'total'))}</td><td>${fmt(sum(x, 'tunai'))}</td><td>${fmt(sum(x, 'angsur'))}</td><td>${fmt(pc(sum(x, 'tunai'), sum(x, 'total')), 1)}%</td></tr>`;
    $('tsUlpTbl').innerHTML = '<thead><tr><th>ULP</th><th>Kasus</th><th>kWh</th><th>Rp TS</th><th>Total tagihan</th><th>Tunai</th><th>Angsuran</th><th>% realisasi</th></tr></thead><tbody>' +
      ulps.map((u) => row(u, a.filter((r) => r.ulp === u))).join('') + row('UP3 Mamuju', a) + '</tbody>';
    const g = [...new Set(a.map((r) => r.gol || '-'))].sort();
    $('tsGolTbl').innerHTML = '<thead><tr><th>Golongan</th><th>Kasus</th><th>Total tagihan</th><th>Tunai</th><th>Angsuran</th></tr></thead><tbody>' +
      g.map((k) => { const x = a.filter((r) => (r.gol || '-') === k); return `<tr><td>${esc(k)}</td><td>${fmt(x.length)}</td><td>${fmt(sum(x, 'total'))}</td><td>${fmt(sum(x, 'tunai'))}</td><td>${fmt(sum(x, 'angsur'))}</td></tr>`; }).join('') + '</tbody>';
  }

  function renderChart() {
    const el = $('tsChBln');
    if (!el || !el.offsetWidth) return;
    if (ch && ch.getDom() !== el) { ch.dispose(); ch = null; }
    if (!ch) ch = echarts.init(el, null, { renderer: 'svg' });
    const ms = [...new Set(all.map((r) => r.bln).filter(Boolean))].sort();
    const by = ms.map((m) => all.filter((r) => r.bln === m && (!F.u || r.ulp === F.u)));
    const tunai = by.map((a) => Math.round(sum(a, 'tunai') / 1e6 * 10) / 10), ang = by.map((a) => Math.round(sum(a, 'angsur') / 1e6 * 10) / 10);
    const pct = by.map((a) => Math.round(pc(sum(a, 'tunai'), sum(a, 'total')) * 10) / 10);
    const row = (n, v, c) => `<div style="display:flex;gap:8px;justify-content:space-between;min-width:190px"><span>${c ? `<i style="width:9px;height:9px;border-radius:3px;background:${c};display:inline-block;margin-right:6px"></i>` : ''}${n}</span><b>${v}</b></div>`;
    const ax = { axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } };
    const c1 = css('--s1') || '#2a78d6', c2 = css('--down') || '#d6453a', c3 = css('--ink-2') || '#64748b';
    ch.setOption({
      animationDuration: 400, color: [c1, c2, c3],
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: css('--ink-2') },
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 8, top: 38, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: css('--surface'), borderColor: css('--border'), borderWidth: 1, textStyle: { color: css('--ink'), fontSize: 12 },
        formatter: (ps) => `<b>${ps[0].name}</b>` + ps.map((x) => row(x.seriesName, x.seriesName.startsWith('%') ? fmt(x.value, 1) + '%' : 'Rp ' + fmt(x.value, 1) + ' juta', x.color)).join('') },
      xAxis: Object.assign({ type: 'category', data: ms.map((m) => BLN[+m.slice(5) - 1].slice(0, 3) + ' ' + m.slice(2, 4)) }, ax),
      yAxis: [{ type: 'value', axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => fmt(v) }, splitLine: { lineStyle: { color: css('--grid') } } },
        { type: 'value', min: 0, max: 100, axisLabel: { color: css('--muted'), fontSize: 11, formatter: '{value}%' }, splitLine: { show: false } }],
      series: [
        { name: 'Tunai', type: 'bar', stack: 'a', barMaxWidth: 34, data: tunai },
        { name: 'Angsuran', type: 'bar', stack: 'a', barMaxWidth: 34, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: ang },
        { name: '% realisasi tunai', type: 'line', yAxisIndex: 1, symbolSize: 7, lineStyle: { width: 2 }, data: pct },
      ],
    }, true);
    ch.resize();
  }

  const renderChartUlp = () => hChart('tsChUlp', 'ulp');
  const renderChartGol = () => { hChart('tsChGol', 'gol'); hChart('tsChTrf', 'tarif'); };
  function hChart(id, field) {
    const el = $(id);
    if (!el || !el.offsetWidth) return;
    if (hc[id] && hc[id].getDom() !== el) { hc[id].dispose(); delete hc[id]; }
    const a = all.filter((r) => !F.b || r.bln === F.b);
    const us = [...new Set(a.map((r) => r[field] || '-'))].map((u) => { const x = a.filter((r) => (r[field] || '-') === u); return { u, t: sum(x, 'tunai'), g: sum(x, 'angsur'), p: pc(sum(x, 'tunai'), sum(x, 'total')), n: x.length }; }).sort((p, q) => (q.t + q.g) - (p.t + p.g));
    el.style.height = (80 + us.length * 40) + 'px';
    if (!hc[id]) hc[id] = echarts.init(el, null, { renderer: 'svg' });
    const cu = hc[id];
    const j = (v) => Math.round(v / 1e6 * 10) / 10;
    const row = (n, v, c) => `<div style="display:flex;gap:8px;justify-content:space-between;min-width:190px"><span><i style="width:9px;height:9px;border-radius:3px;background:${c};display:inline-block;margin-right:6px"></i>${n}</span><b>${v}</b></div>`;
    const c1 = css('--s1') || '#2a78d6', c2 = css('--down') || '#d6453a';
    cu.setOption({
      animationDuration: 400, color: [c1, c2],
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: css('--ink-2') },
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 64, top: 32, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: css('--surface'), borderColor: css('--border'), borderWidth: 1, textStyle: { color: css('--ink'), fontSize: 12 },
        formatter: (ps) => { const u = us[ps[0].dataIndex]; return `<b>${esc(u.u)}</b>` + ps.map((x) => row(x.seriesName, 'Rp ' + fmt(x.value, 1) + ' juta', x.color)).join('') + `<div style="margin-top:4px">${fmt(u.n)} kasus · ${fmt(u.p, 1)}% realisasi tunai</div>`; } },
      xAxis: { type: 'value', axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => fmt(v) }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: { type: 'category', inverse: true, data: us.map((u) => u.u), axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } },
      series: [
        { name: 'Tunai', type: 'bar', stack: 'a', barMaxWidth: 20, data: us.map((u) => j(u.t)) },
        { name: 'Angsuran', type: 'bar', stack: 'a', barMaxWidth: 20, itemStyle: { borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => fmt(us[p.dataIndex].p, 1) + '%' }, data: us.map((u) => j(u.g)) },
      ],
    }, true);
    cu.resize();
  }

  function renderDetail() {
    view = filtered();
    const pages = Math.max(1, Math.ceil(view.length / PAGE));
    T.pg = Math.min(T.pg, pages - 1);
    const sl = view.slice(T.pg * PAGE, (T.pg + 1) * PAGE);
    $('tsDHint').textContent = `${fmt(view.length)} dari ${fmt(all.length)} kasus · tagihan ${rp(sum(view, 'total'))} · tunai ${rp(sum(view, 'tunai'))} · angsuran ${rp(sum(view, 'angsur'))}`;
    $('tsDTbl').innerHTML = '<thead><tr><th>Tgl register</th><th>ULP</th><th>IDPEL</th><th class="l">Nama</th><th class="l">Alamat</th><th>Gol</th><th>Tarif</th><th>Daya</th><th>kWh</th><th>Rp TS</th><th>Total tagihan</th><th>Tunai</th><th>Angsuran</th><th>Status</th><th class="l">No. agenda</th></tr></thead><tbody>' +
      (sl.map((r) => `<tr><td>${dmy(r.tgl)}</td><td>${esc(r.ulp)}</td><td>${esc(r.idpel)}</td><td class="l">${esc(r.nama)}</td><td class="l">${esc(r.alamat)}</td><td>${esc(r.gol)}</td><td>${esc(r.tarif)}</td><td>${fmt(r.daya)}</td><td>${fmt(r.kwh)}</td><td>${fmt(r.rp_ts)}</td><td>${fmt(r.total)}</td><td>${fmt(r.tunai)}</td><td>${fmt(r.angsur)}</td><td>${r.lunas ? 'Lunas' : 'Angsuran'}</td><td class="l">${esc(r.agenda)}</td></tr>`).join('') || '<tr><td colspan="15">Tidak ada data.</td></tr>') + '</tbody>';
    $('tsDPage').textContent = `Halaman ${fmt(T.pg + 1)} dari ${fmt(pages)}`;
    $('tsDPrev').disabled = T.pg === 0; $('tsDNext').disabled = T.pg >= pages - 1;
  }

  function csv() {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const h = ['Tgl register', 'ULP', 'IDPEL', 'Nama', 'Alamat', 'Golongan', 'Tarif', 'Daya', 'kWh', 'Rp TS', 'Total tagihan', 'Tunai', 'Angsuran', 'Status', 'No agenda', 'No SIP'];
    const body = view.map((r) => [dmy(r.tgl), r.ulp, r.idpel, r.nama, r.alamat, r.gol, r.tarif, r.daya, r.kwh, r.rp_ts, r.total, r.tunai, r.angsur, r.lunas ? 'Lunas' : 'Angsuran', r.agenda, r.sip].map(q).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + h.map(q).join(',') + '\n' + body.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'realisasi-tagihan-susulan.csv'; a.click();
  }

  async function show() {
    window.DashSetView('ts');
    document.querySelectorAll('#subP2tl button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === 'ts')));
    if (location.hash !== '#ts') history.replaceState(null, '', location.pathname + location.search + '#ts');
    $('tsMsg').hidden = false; $('tsMsg').textContent = 'Memuat data tagihan susulan…';
    $('tsBody').hidden = true;
    try { await load(); } catch (e) { $('tsMsg').textContent = 'Data tagihan susulan belum tersedia (' + e.message + ').'; return; }
    $('tsMsg').hidden = true; $('tsBody').hidden = false;
    const bl = [...new Set(all.map((r) => r.bln).filter(Boolean))].sort().reverse();
    $('tsFB').innerHTML = '<option value="">Semua periode</option>' + bl.map((b) => `<option value="${b}">${BLN[+b.slice(5) - 1]} ${b.slice(0, 4)}</option>`).join('');
    $('tsFB').value = F.b;
    $('tsFU').innerHTML = '<option value="">Semua ULP</option>' + [...new Set(all.map((r) => r.ulp))].sort().map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
    $('tsFU').value = F.u;
    $('tsFoot').textContent = 'Sumber: Laporan P2TL Tagihan Susulan · ' + D.files.map((f) => f.file).join(', ') + ' · diperbarui ' + new Date(D.generated_at).toLocaleString('id-ID');
    renderSummary(); renderDetail(); renderChart(); renderChartUlp(); renderChartGol();
    window.scrollTo({ top: 0 });
  }

  function init() {
    $('tsFB').onchange = (e) => { F.b = e.target.value; T.pg = 0; renderSummary(); renderDetail(); renderChartUlp(); renderChartGol(); };
    $('tsFU').onchange = (e) => { F.u = e.target.value; T.pg = 0; renderDetail(); renderChart(); };
    $('tsFS').onchange = (e) => { F.s = e.target.value; T.pg = 0; renderDetail(); };
    let qt = 0;
    $('tsFQ').oninput = (e) => { F.q = e.target.value; T.pg = 0; clearTimeout(qt); qt = setTimeout(renderDetail, 150); };
    $('tsDPrev').onclick = () => { T.pg = Math.max(0, T.pg - 1); renderDetail(); };
    $('tsDNext').onclick = () => { T.pg += 1; renderDetail(); };
    $('tsDCsv').onclick = csv;
    window.addEventListener('resize', () => { [ch, ...Object.values(hc)].forEach((c) => { if (c && c.getDom() && c.getDom().isConnected) c.resize(); }); });
    new MutationObserver(() => { if (D && document.body.dataset.view === 'ts') renderChart(); renderChartUlp(); renderChartGol(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash === '#ts' && document.body.dataset.view !== 'ts') show(); });
  }

  window.DashTs = { show };
  init();
})();
