/* Pemeliharaan Meter > Automatic Meter Reading (AMR): ringkasan, perangkat & komunikasi, daftar pelanggan.
   Data: tabel Supabase tul_data id='amr', diisi otomatis oleh sync_drive.py dari folder Drive "Pemeliharaan Meter/AMR".
   Hash: #amr, #amr/<halaman> */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pc = (a, b) => (b ? a / b * 100 : 0);
  const PAGE = 100;
  const T = { page: 'ringkasan', pg: 0 };
  const F = { u: '', t: '', m: '', y: '', c: '', p: '', k: '', g: '', ct: '', q: '' };
  const FKEY = { u: 'ulp', t: 'tarif', m: 'merk', y: 'type', c: 'cmerk', p: 'prov', k: 'mccb' };
  const FSEL = { u: 'aFU', t: 'aFT', m: 'aFM', y: 'aFY', c: 'aFC', p: 'aFP', k: 'aFK' };
  const ALL = { u: 'Semua ULP', t: 'Semua tarif', m: 'Semua merek', y: 'Semua tipe', c: 'Semua merek', p: 'Semua provider', k: 'Semua' };
  const LABEL = { idpel: 'ID Pelanggan', nama: 'Nama', alamat: 'Alamat', ulp: 'ULP', tarif: 'Tarif', daya: 'Daya (VA)', merk: 'Merek meter', type: 'Tipe meter', nometer: 'No. meter',
    cmerk: 'Merek modem', ctype: 'Tipe modem', nocomm: 'No. modem', prov: 'Provider', sim: 'No. SIM', ip: 'IP address', bill: 'Bill reff kWh', tg: 'Tunggal/Ganda', mccb: 'MCCB' };
  const SHOW = ['idpel', 'nama', 'alamat', 'ulp', 'tarif', 'daya', 'merk', 'type', 'nometer', 'cmerk', 'prov', 'ip', 'mccb'];
  const CSVCOLS = ['idpel', 'nama', 'alamat', 'ulp', 'tarif', 'daya', 'merk', 'type', 'nometer', 'cmerk', 'ctype', 'nocomm', 'prov', 'sim', 'ip', 'bill', 'tg', 'mccb'];
  const NUM = new Set(['daya']);
  let D = null, loading = null, R = [], rows = [], C = {}, charts = {};

  // ---------- data ----------
  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'amr').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.rows || []).length) throw new Error('belum ada data');
          D = data.data;
          D.cols.forEach((c, i) => { C[c] = i; });
          // baris -> objek dengan nilai kategorikal sudah berupa teks
          R = D.rows.map((r) => { const o = {}; D.cols.forEach((c, i) => { o[c] = D.dict[c] ? D.dict[c][r[i]] : r[i]; }); return o; });
          return D;
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }
  const count = (list, k) => { const m = new Map(); list.forEach((r) => m.set(r[k], (m.get(r[k]) || 0) + 1)); return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)); };
  const ready = (r) => r.mccb === 'Ready';

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
  const cnt = (v) => (v >= 1e3 ? fmt(v / 1e3, 1) + ' rb' : fmt(v));
  function hbar(id, items) {
    $(id).style.height = (56 + items.length * 34) + 'px';
    chart(id).setOption(Object.assign(base(), {
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ttRow('Pelanggan', fmt(ps[0].value), css('--s1')) }),
      xAxis: { type: 'value', minInterval: 1, axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((x) => x.name) }, axisCommon()),
      series: [{ type: 'bar', barMaxWidth: 18, itemStyle: { color: css('--s1'), borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => fmt(p.value) }, data: items.map((x) => x.n) }],
    }), true);
  }
  function hstackReady(id, items) {
    $(id).style.height = (70 + items.length * 34) + 'px';
    chart(id).setOption(Object.assign(base(), {
      color: [css('--s1'), css('--muted')],
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 56, top: 32, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ps.map((x) => ttRow(x.seriesName, fmt(x.value), x.color)).join('') + ttRow('Jumlah', fmt(ps.reduce((s, x) => s + x.value, 0))) }),
      xAxis: { type: 'value', minInterval: 1, axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((x) => x.name) }, axisCommon()),
      series: [
        { name: 'MCCB Ready', type: 'bar', stack: 'a', barMaxWidth: 18, data: items.map((x) => x.rd) },
        { name: 'Not Ready', type: 'bar', stack: 'a', barMaxWidth: 18, itemStyle: { opacity: 0.55, borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => fmt(items[p.dataIndex].n) }, data: items.map((x) => x.n - x.rd) },
      ],
    }), true);
  }

  // ---------- kartu ----------
  const ICON = {
    n: 'M19.4 12.9a7 7 0 0 0 0-1.8l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.6-.9L15.2 4h-4l-.4 2.3a7 7 0 0 0-1.6.9l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 1.8l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.6.9l.4 2.3h4l.4-2.3a7 7 0 0 0 1.6-.9l2.3 1 2-3.4zM13.2 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z', warn: 'M12 2 1 21h22zm1 16h-2v-2h2zm0-4h-2V9h2z', ok: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8z',
  };
  const go = (o) => Object.entries(o).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const kpiHtml = (defs) => defs.map((d, i) =>
    `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON[d.i]}"/></svg></span><div class="lbl">${d.l}</div></div>` +
    `<div class="val">${fmt(d.v)}<small>${d.u || ''}</small></div><div class="ytd">${d.sub}${d.go && d.v ? ` · <button type="button" class="b-link"${go(d.go)}>Lihat daftar ›</button>` : ''}</div></div>`).join('');
  const link = (n, f) => (n ? `<button type="button" class="b-link"${go(f)}>${fmt(n)}</button>` : '–');

  // ---------- halaman ----------
  function renderRingkasan() {
    const n = R.length, rd = R.filter(ready).length, tg = R.filter((r) => r.tg === 'Ganda').length;
    $('aMeta').innerHTML = `<span class="chip">${fmt(D.dict.ulp.length)} ULP</span><span class="chip">${fmt(D.files.length)} file Excel</span>`;
    $('aKpis').innerHTML = kpiHtml([
      { i: 'n', l: 'Pelanggan ber-AMR', v: n, u: 'pelanggan', sub: `${fmt(D.dict.ulp.length)} ULP`, go: {} },
      { i: 'ok', l: 'MCCB Ready', v: rd, u: 'pelanggan', sub: `${fmt(pc(rd, n), 1)}% dari pelanggan AMR`, go: { k: 'Ready' } },
      { i: 'warn', l: 'MCCB Not Ready', v: n - rd, u: 'pelanggan', sub: `${fmt(pc(n - rd, n), 1)}% dari pelanggan AMR`, go: { k: 'Not Ready' } },
      { i: 'bolt', l: 'Meter ganda (T/G)', v: tg, u: 'pelanggan', sub: `${fmt(n - tg)} tunggal`, go: { g: 'Ganda' } },
    ]);
    const per = D.dict.ulp.map((u) => { const l = R.filter((r) => r.ulp === u); return { name: u, n: l.length, rd: l.filter(ready).length, tg: l.filter((r) => r.tg === 'Ganda').length }; }).sort((a, b) => b.n - a.n);
    hstackReady('aChUlp', per);
    $('aUlpTbl').innerHTML = '<thead><tr><th class="l">ULP</th><th>Pelanggan AMR</th><th>MCCB Ready</th><th>MCCB Not Ready</th><th>% Ready</th><th>Meter ganda</th></tr></thead><tbody>' +
      per.map((x) => `<tr><td class="l">${esc(x.name)}</td><td>${link(x.n, { u: x.name })}</td><td>${link(x.rd, { u: x.name, k: 'Ready' })}</td><td>${link(x.n - x.rd, { u: x.name, k: 'Not Ready' })}</td><td>${fmt(pc(x.rd, x.n), 1)}%</td><td>${link(x.tg, { u: x.name, g: 'Ganda' })}</td></tr>`).join('') +
      `<tr class="tot"><td class="l"><b>UP3 Mamuju</b></td><td><b>${fmt(n)}</b></td><td><b>${fmt(rd)}</b></td><td><b>${fmt(n - rd)}</b></td><td><b>${fmt(pc(rd, n), 1)}%</b></td><td><b>${fmt(tg)}</b></td></tr></tbody>`;
  }
  // tabel silang merek x tipe: baris = tipe (dikelompokkan per merek), kolom = ULP
  function crossTbl(id, mk, tk, fm, ft) {
    const ulps = D.dict.ulp;
    const types = new Map();
    R.forEach((r) => { const k = r[mk] + '\u0000' + r[tk]; let t = types.get(k); if (!t) types.set(k, (t = { m: r[mk], t: r[tk], by: {}, n: 0 })); t.by[r.ulp] = (t.by[r.ulp] || 0) + 1; t.n++; });
    const list = [...types.values()].sort((a, b) => a.m.localeCompare(b.m) || b.n - a.n);
    $(id).innerHTML = `<thead><tr><th class="l">Merek</th><th class="l">Tipe</th>${ulps.map((u) => `<th>${esc(u)}</th>`).join('')}<th>Total</th></tr></thead><tbody>` +
      list.map((x) => `<tr><td class="l">${esc(x.m)}</td><td class="l">${esc(x.t)}</td>${ulps.map((u) => `<td>${link(x.by[u] || 0, { u, [fm]: x.m, [ft]: x.t })}</td>`).join('')}<td><b>${link(x.n, { [fm]: x.m, [ft]: x.t })}</b></td></tr>`).join('') + '</tbody>';
  }
  function renderPerangkat() {
    hbar('aChMerk', count(R, 'merk')); hbar('aChCmerk', count(R, 'cmerk')); hbar('aChProv', count(R, 'prov')); hbar('aChTarif', count(R, 'tarif'));
    crossTbl('aMtTbl', 'merk', 'type', 'm', 'y');
    crossTbl('aCtTbl', 'cmerk', 'ctype', 'c', 'ct');
  }

  // ---------- daftar ----------
  function fillSelects() {
    Object.entries(FSEL).forEach(([k, id]) => {
      const vals = [...new Set(R.map((r) => r[FKEY[k]]))].sort((a, b) => String(a).localeCompare(String(b)));
      $(id).innerHTML = `<option value="">${ALL[k]}</option>` + vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    });
  }
  function applyFilter() {
    const q = F.q.trim().toLowerCase();
    rows = R.filter((r) => Object.keys(FKEY).every((k) => !F[k] || r[FKEY[k]] === F[k]) && (!F.g || r.tg === F.g) && (!F.ct || r.ctype === F.ct) &&
      (!q || [r.idpel, r.nama, r.alamat, r.nometer, r.nocomm, r.ip, r.sim].some((v) => String(v).toLowerCase().includes(q))));
  }
  function syncUi() { Object.entries(FSEL).forEach(([k, id]) => { $(id).value = F[k]; }); $('aDQ').value = F.q; }
  function renderDaftar() {
    applyFilter();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE)); T.pg = Math.min(T.pg, pages - 1);
    $('aDTbl').innerHTML = `<thead><tr>${SHOW.map((k) => `<th${NUM.has(k) ? '' : ' class="l"'}>${esc(LABEL[k])}</th>`).join('')}</tr></thead><tbody>` +
      rows.slice(T.pg * PAGE, T.pg * PAGE + PAGE).map((r) => '<tr>' + SHOW.map((k) => `<td${NUM.has(k) ? '' : ' class="l"'}>${r[k] === '' || r[k] == null ? '–' : k === 'daya' ? fmt(+r[k]) : esc(r[k])}</td>`).join('') + '</tr>').join('') +
      (rows.length ? '' : `<tr><td class="l" colspan="${SHOW.length}">Tidak ada data yang cocok.</td></tr>`) + '</tbody>';
    const extra = [F.g && 'meter ' + F.g.toLowerCase(), F.ct && 'tipe modem ' + F.ct].filter(Boolean).join(', ');
    $('aDHint').textContent = `${fmt(rows.length)} dari ${fmt(R.length)} pelanggan${extra ? ' · ' + extra : ''}`;
    $('aDPage').textContent = `Halaman ${T.pg + 1} dari ${pages}`;
    $('aDPrev').disabled = T.pg === 0; $('aDNext').disabled = T.pg >= pages - 1; $('aDCsv').disabled = !rows.length;
  }
  function csvDetail() {
    const v = (k, x) => (x == null ? '' : k === 'daya' && x !== '' && isFinite(+x) ? +x : String(x));   // ID/nomor tetap teks (tidak jadi angka ilmiah di Excel)
    XlsxMini.download('Pelanggan_AMR.xlsx', 'Pelanggan AMR', CSVCOLS.map((k) => LABEL[k]), rows.map((r) => CSVCOLS.map((k) => v(k, r[k]))));
  }
  function openList(d) {
    Object.keys(F).forEach((k) => { F[k] = ''; });
    ['u', 't', 'm', 'y', 'c', 'p', 'k', 'g', 'ct'].forEach((k) => { if (d[k]) F[k] = d[k]; });
    T.pg = 0; show('daftar');
  }

  // ---------- tampilan ----------
  const PAGES = { ringkasan: renderRingkasan, perangkat: renderPerangkat, daftar: renderDaftar };
  const TITLE = { ringkasan: 'Ringkasan', perangkat: 'Perangkat & komunikasi', daftar: 'Daftar pelanggan' };
  function renderAll() {
    if (!PAGES[T.page]) T.page = 'ringkasan';
    $('aCrumb').innerHTML = `<span>Pemeliharaan Meter</span><i>›</i><span>Automatic Meter Reading</span><i>›</i><b>${esc(TITLE[T.page])}</b>`;
    document.querySelectorAll('#aBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== T.page; });
    document.querySelectorAll('#subAmr button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === T.page)));
    if (T.page === 'daftar') syncUi();
    PAGES[T.page]();
    $('aFoot').innerHTML = `Sumber: Excel DETAIL STATISTIK PELANGGAN (${fmt(R.length)} pelanggan AMR) · Data diperbarui ${new Date(D.generated_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
    setTimeout(() => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()), 30);
  }
  const hashPage = () => { const m = location.hash.match(/^#amr(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'ringkasan'; };
  async function show(page) {
    window.DashSetView('amr');
    T.page = page || hashPage();
    const h = '#amr' + (T.page === 'ringkasan' ? '' : '/' + T.page);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    $('aMsg').hidden = false; $('aMsg').textContent = 'Memuat data AMR…'; $('aBody').hidden = true;
    try { await load(); } catch (e) { $('aMsg').textContent = 'Data AMR belum tersedia (' + e.message + '). Letakkan Excel di folder Drive Pemeliharaan Meter / AMR, lalu tunggu sinkron berikutnya.'; return; }
    if (!$('aFU').options.length) fillSelects();
    $('aMsg').hidden = true; $('aBody').hidden = false;
    renderAll(); window.scrollTo({ top: 0 });
  }

  function init() {
    Object.entries(FSEL).forEach(([k, id]) => { $(id).onchange = (e) => { F[k] = e.target.value; T.pg = 0; renderDaftar(); }; });
    $('aDQ').oninput = (e) => { F.q = e.target.value; T.pg = 0; renderDaftar(); };
    $('aDPrev').onclick = () => { T.pg = Math.max(0, T.pg - 1); renderDaftar(); };
    $('aDNext').onclick = () => { T.pg += 1; renderDaftar(); };
    $('aDCsv').onclick = csvDetail;
    ['aKpis', 'aUlpTbl', 'aMtTbl', 'aCtTbl'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.b-link'); if (!b) return; openList(Object.assign({}, b.dataset));
    }));
    $('subAmr').addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; document.body.classList.remove('nav-open'); if (b.dataset.p === 'daftar') { Object.keys(F).forEach((k) => { F[k] = ''; }); T.pg = 0; } show(b.dataset.p); });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#amr') && (document.body.dataset.view !== 'amr' || hashPage() !== T.page)) show(); });
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'amr') renderAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.DashAmr = { show };
  init();
})();
