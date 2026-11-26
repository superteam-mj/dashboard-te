/* Transaksi Energi > DLPD Prabayar: analisis pelanggan prabayar yang tidak membeli token.
   Data: tabel Supabase tul_data, baris id = 'dlpd' (ringkasan) dan 'dl:<periode>:<kodeULP>' (daftar pelanggan, dibaca saat diminta).
   Keduanya diisi otomatis oleh sync_drive.py dari folder Drive "DLPD PRABAYAR". Hash: #dlpd, #dlpd/<halaman> */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const ymShort = (ym) => MON[+ym.slice(4) - 1] + ' ' + ym.slice(2, 4);
  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
  const pc = (a, b) => (b ? a / b * 100 : 0);

  const T = { page: 'ringkasan', ym: null, pg: 0 };
  const F = { u: '', k: '', t: '', c: '', p: '', s: '', d: '', q: '', x: null };  // x = {kind, val, label} dari grafik karakteristik  // filter daftar
  let D = null, loading = null, rows = [], listKey = '';
  const charts = {}, docs = new Map();
  const PAGE = 100;

  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'dlpd').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.order || []).length) throw new Error('belum ada data');
          return (D = data.data);
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }
  const per = () => D.periods[T.ym];
  const prevP = () => { const p = per(); return p.prev ? D.periods[p.prev] : null; };

  // ---------- grafik ----------
  function base() {
    return {
      animationDuration: 400,
      textStyle: { fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: css('--ink-2') },
      tooltip: { backgroundColor: css('--surface'), borderColor: css('--border'), borderWidth: 1, textStyle: { color: css('--ink'), fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);' },
    };
  }
  function chart(id) {
    if (charts[id] && charts[id].getDom() !== $(id)) { charts[id].dispose(); delete charts[id]; }
    if (!charts[id]) charts[id] = echarts.init($(id), null, { renderer: 'svg' });
    return charts[id];
  }
  const ttRow = (name, value, color) =>
    `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:170px"><span style="display:flex;gap:6px;align-items:center">` +
    `${color ? `<i style="width:9px;height:9px;border-radius:3px;background:${color};display:inline-block"></i>` : ''}${esc(name)}</span><b style="font-variant-numeric:tabular-nums">${value}</b></div>`;
  const cnt = (v) => (v >= 1e3 ? fmt(v / 1e3, v >= 1e4 ? 0 : 1) + ' rb' : fmt(v));
  const axisCommon = () => ({ axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } });

  function hbar(id, items, color, total) {
    $(id).style.height = (56 + items.length * 34) + 'px';
    chart(id).setOption(Object.assign(base(), {
      grid: { left: 8, right: 70, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => { const p = ps[0]; return `<b>${esc(p.name)}</b>` + ttRow('Pelanggan', fmt(p.value), color) + ttRow('Porsi', fmt(pc(p.value, total), 1) + '%'); } }),
      xAxis: { type: 'value', splitNumber: $(id).clientWidth < 500 ? 2 : 5, axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((x) => x.name) }, axisCommon()),
      series: [{ type: 'bar', barMaxWidth: 18, itemStyle: { color, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => cnt(p.value) + ' · ' + fmt(pc(p.value, total), 1) + '%' },
        data: items.map((x) => x.n) }],
    }), true);
  }
  const top = (list, k) => { const a = list.slice(0, k), r = list.slice(k).reduce((s, x) => s + x.n, 0); return r > 0 ? a.concat([{ name: 'Lainnya', n: r }]) : a; };

  // ---------- ringkasan ----------
  const ICON = {
    n: 'M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
    chk: 'M12 2 1 21h22zm1 16h-2v-2h2zm0-4h-2V9h2z',
    ok: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8z',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    plus: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4z',
  };
  // mode: 'bad' = naik itu buruk (merah), 'good' = naik itu baik (hijau), 'neutral' = tanpa penilaian
  const dl = (v, p, label, mode = 'bad') => {
    if (p == null) return '';
    const d = v - p, cls = d === 0 || mode === 'neutral' ? 'flat' : (d > 0) === (mode === 'good') ? 'up' : 'down';
    return `<span class="delta ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${fmt(Math.abs(d))} <span>vs ${esc(label)}</span></span>`;
  };
  const go = (o) => Object.entries(o).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const kpiHtml = (defs) => defs.map((d, i) =>
    `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON[d.i]}"/></svg></span><div class="lbl">${d.l}</div></div>` +
    `<div class="val">${fmt(d.v)}<small>plg</small></div>${d.d || '<span class="delta flat">— <span>bulan pertama</span></span>'}<div class="ytd">${d.sub}${d.go && d.v ? ` · <button type="button" class="b-link"${go(d.go)}>Lihat daftar ›</button>` : ''}</div></div>`).join('');

  const bigN = (p) => p.daya.filter((x) => x.name.startsWith('3.500') || x.name.startsWith('>')).reduce((s, x) => s + x.n, 0);

  function renderRingkasan() {
    const p = per(), t = p.total, pv = prevP(), lb = pv ? pv.label : '';
    $('dMeta').innerHTML = `<span class="chip">Periode ${esc(p.label)}</span><span class="chip">${fmt(t.n)} pelanggan</span><span class="chip">${p.files.length} file Excel</span>` +
      (p.dup ? `<span class="chip warn">${fmt(p.dup)} baris ganda dilewati</span>` : '');
    $('dKpis').innerHTML = kpiHtml([
      { i: 'n', l: 'Tidak membeli token', v: t.n, d: pv && dl(t.n, pv.total.n, lb), sub: 'Seluruh kriteria di folder DLPD', go: {} },
      { i: 'chk', l: 'Belum ada CT', v: t.n - t.ct, d: pv && dl(t.n - t.ct, pv.total.n - pv.total.ct, lb), sub: fmt(pc(t.n - t.ct, t.n), 1) + '% dari pelanggan', go: { c: 'belum' } },
      { i: 'ok', l: 'Sudah ada CT', v: t.ct, d: pv && dl(t.ct, pv.total.ct, lb, 'good'), sub: fmt(pc(t.ct, t.n), 1) + '% dari pelanggan', go: { c: 'sudah' } },
      { i: 'chk', l: 'Ada temuan P2TL', v: t.p2tl, d: pv && dl(t.p2tl, pv.total.p2tl, lb, 'neutral'), sub: fmt(pc(t.p2tl, t.n), 2) + '% dari pelanggan', go: { p: 'ada' } },
      { i: 'bolt', l: 'Daya ≥ 3.500 VA', v: bigN(p), d: pv && dl(bigN(p), bigN(pv), lb), sub: 'Pelanggan besar, perlu diprioritaskan', go: { d: 'big' } },
      { i: 'plus', l: 'Baru bulan ini', v: pv ? t.baru : 0, d: pv ? `<span class="delta flat">Keluar ${fmt(t.keluar)} <span>dari daftar ${esc(lb)}</span></span>` : '', sub: pv ? 'Tidak ada di daftar bulan lalu' : 'Perlu 2 periode', go: pv ? { s: 'Baru' } : null },
    ]);
    hbar('dChUlp', p.ulp.map((u) => ({ name: u.name, n: u.n })), css('--s1'), t.n);
    const row = (n, x, cls, code) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(n)}</td><td>${fmt(x.n)}</td><td>${fmt(pc(x.n, t.n), 1)}%</td><td>${fmt(x.n - x.ct)}</td><td>${fmt(x.ct)}</td><td>${fmt(pc(x.ct, x.n), 1)}%</td><td>${fmt(x.p2tl)}</td>` +
      (pv ? `<td>${fmt(x.baru)}</td><td>${fmt(x.keluar)}</td>` : '') + '</tr>';
    $('dUlpTbl').innerHTML = `<thead><tr><th>ULP</th><th>Pelanggan</th><th>Porsi</th><th>Belum CT</th><th>Sudah CT</th><th>% CT</th><th>P2TL</th>${pv ? '<th>Baru</th><th>Keluar</th>' : ''}</tr></thead><tbody>` +
      p.ulp.map((u) => row(u.name, u)).join('') + row('UP3 Mamuju', t, 'tot') + '</tbody>';
    hbar('dChKrit', p.kriteria.map((k) => ({ name: k.name.replace(/^[a-z]\.\s*/i, ''), n: k.n })), css('--s3'), t.n);
    shareDlpd(p, pv);
  }

  function shareDlpd(p, pv) {
    const C = DashShare.COL, t = p.total, lb = pv ? pv.label : '';
    const ch = (v, q) => (pv && q != null ? `${v >= q ? '▲' : '▼'} ${fmt(Math.abs(v - q))} vs ${lb}` : '');
    const L = (k, v) => `${k} : ${v}`;
    const top1 = p.ulp.slice().sort((a, b) => b.n - a.n)[0];
    const text = [`*DLPD PRABAYAR* — ${p.label}`, 'Pelanggan prabayar tidak membeli token · UP3 Mamuju', '',
      L('Tidak membeli token', fmt(t.n) + ' plg'), L('Belum ada CT', `${fmt(t.n - t.ct)} (${fmt(pc(t.n - t.ct, t.n), 1)}%)`), L('Sudah ada CT', `${fmt(t.ct)} (${fmt(pc(t.ct, t.n), 1)}%)`),
      L('Ada temuan P2TL', fmt(t.p2tl)), L('Daya ≥ 3.500 VA', fmt(bigN(p)))]
      .concat(pv ? [L('Baru / keluar dari daftar', `${fmt(t.baru)} / ${fmt(t.keluar)}`)] : [])
      .concat(['', '*PER ULP*']).concat(p.ulp.map((u) => `${u.name} : ${fmt(u.n)} plg (belum CT ${fmt(u.n - u.ct)})`)).join('\n');
    DashShare.set($('dShare'), {
      title: 'DLPD Prabayar', subtitle: `Pelanggan tidak membeli token · UP3 Mamuju · ${p.label}`, tag: 'Transaksi Energi', file: `dlpd-prabayar-${p.ym}`, foot: 'Sumber: Excel DLPD Prabayar · PLN UP3 Mamuju · Dashboard TE', text,
      hero: [
        { t: 'Tidak membeli token', u: 'pelanggan', v: fmt(t.n), s: ch(t.n, pv && pv.total.n), c: C.BLUE },
        { t: 'Belum ada CT', u: 'pelanggan', v: fmt(t.n - t.ct), s: fmt(pc(t.n - t.ct, t.n), 1) + '% dari pelanggan', c: C.RED },
        { t: 'Sudah ada CT', u: 'pelanggan', v: fmt(t.ct), s: fmt(pc(t.ct, t.n), 1) + '% dari pelanggan', c: C.GRN },
      ],
      tilesTitle: 'Rincian',
      tiles: [
        { t: 'Ada temuan P2TL', v: fmt(t.p2tl), u: 'pelanggan', c: C.VIO }, { t: 'Daya ≥ 3.500 VA', v: fmt(bigN(p)), u: 'pelanggan', c: C.AMB },
        { t: pv ? 'Baru bulan ini' : 'Jumlah ULP', v: pv ? fmt(t.baru) : fmt(p.ulp.filter((u) => u.n).length), u: pv ? 'pelanggan' : 'unit', c: C.ORG },
        { t: pv ? 'Keluar dari daftar' : 'File Excel', v: pv ? fmt(t.keluar) : fmt(p.files.length), u: pv ? 'pelanggan' : 'file', c: C.GRN },
        { t: 'ULP terbanyak', v: top1 ? top1.name.replace('ULP ', '') : '–', u: top1 ? fmt(top1.n) + ' pelanggan' : '', c: C.BLUE },
      ],
    });
  }

  // grafik karakteristik: tiap batang & tombol di bawahnya membuka Daftar pelanggan terfilter
  const CARDS = { dChTarif: 'tarif', dChDaya: 'daya', dChBeli: 'beli', dChMerek: 'merek', dChUmur: 'umur', dChKode: 'kode' };
  const KIND = { tarif: 'Tarif', daya: 'Daya', beli: 'Terakhir beli', merek: 'Merek meter', umur: 'Umur meter', kode: 'Kode DLPD' };
  const REST = '\u0000';  // penanda nilai "Lainnya" (gabungan kategori kecil)
  function cardChart(id, items, color, n) {
    const kind = CARDS[id];
    hbar(id, items, color, n);
    chart(id).off('click'); chart(id).on('click', (e) => { const it = items[e.dataIndex]; if (it) openList({ x: { kind, val: it.v, label: KIND[kind] + ': ' + it.name } }); });
    let box = $(id).nextElementSibling;
    if (!box || !box.classList.contains('d-dets')) { box = document.createElement('div'); box.className = 'd-dets'; $(id).after(box); }
    box.innerHTML = '<span class="d-dets-l">Detail pelanggan:</span>' + items.map((it, i) => `<button type="button" class="d-det" data-i="${i}">${esc(it.name)} <b>${fmt(it.n)}</b></button>`).join('');
    box.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = items[+b.dataset.i]; openList({ x: { kind, val: it.v, label: KIND[kind] + ': ' + it.name } }); };
  }
  function renderKarakter() {
    const p = per(), n = p.total.n;
    const topT = p.tarif.slice(0, 10).map((x) => ({ name: x.name, n: x.n, v: x.name }));
    const resT = p.tarif.slice(10);
    if (resT.length) topT.push({ name: 'Lainnya', n: resT.reduce((s, x) => s + x.n, 0), v: REST });
    cardChart('dChTarif', topT, css('--s2'), n);
    $('dTarifHint').textContent = `${p.tarif.length} golongan tarif · 10 terbesar · klik batang atau tombol untuk melihat pelanggannya`;
    cardChart('dChDaya', p.daya.map((x) => ({ name: x.name, n: x.n, v: x.name })), css('--s1'), n);
    cardChart('dChBeli', p.beli.map((b) => ({ name: b.idle == null ? b.name : `${b.name} (${b.idle} bln lalu)`, n: b.n, v: b.k })), css('--s4'), n);
    cardChart('dChMerek', p.merek.map((x) => ({ name: x.name, n: x.n, v: x.name === 'Lainnya' ? REST : x.name })), css('--s3'), n);
    cardChart('dChUmur', p.umur.map((x) => ({ name: x.name, n: x.n, v: x.name })), css('--s5'), n);
    cardChart('dChKode', p.dlpd.map((x) => ({ name: 'Kode ' + x.name, n: x.n, v: x.name })), css('--s6'), n);
  }

  // ---------- tindak lanjut ----------
  function renderTindak() {
    const p = per(), t = p.total, pv = prevP(), lb = pv ? pv.label : '';
    $('dTdKpis').innerHTML = kpiHtml([
      { i: 'chk', l: 'Belum ada CT', v: t.n - t.ct, d: pv && dl(t.n - t.ct, pv.total.n - pv.total.ct, lb), sub: fmt(pc(t.n - t.ct, t.n), 1) + '%', go: { c: 'belum' } },
      { i: 'ok', l: 'Sudah ada CT', v: t.ct, d: pv && dl(t.ct, pv.total.ct, lb, 'good'), sub: fmt(pc(t.ct, t.n), 1) + '%', go: { c: 'sudah' } },
      { i: 'chk', l: 'Ada temuan P2TL', v: t.p2tl, d: pv && dl(t.p2tl, pv.total.p2tl, lb, 'neutral'), sub: fmt(pc(t.p2tl, t.n), 2) + '%', go: { p: 'ada' } },
      { i: 'n', l: 'Tanpa koordinat', v: t.nocoord, d: '', sub: 'Sulit dikunjungi petugas', go: null },
    ]);
    const items = p.ulp;
    $('dChCt').style.height = (80 + items.length * 40) + 'px';
    chart('dChCt').setOption(Object.assign(base(), {
      color: [css('--s2'), css('--s4')],
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 30, top: 34, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ps.map((x) => ttRow(x.seriesName, fmt(x.value), x.color)).join('') }),
      xAxis: { type: 'value', axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((u) => u.name) }, axisCommon()),
      series: [
        { name: 'Sudah ada CT', type: 'bar', stack: 'a', barMaxWidth: 20, data: items.map((u) => u.ct) },
        { name: 'Belum ada CT', type: 'bar', stack: 'a', barMaxWidth: 20, itemStyle: { borderRadius: [0, 4, 4, 0] }, data: items.map((u) => u.n - u.ct) },
      ],
    }), true);
    const btn = (n, o) => (n ? `<button type="button" class="qb"${go(o)} title="Lihat daftar pelanggan"><b>${fmt(n)}</b></button>` : `<span class="qb"><b>0</b></span>`);
    const row = (name, x, cls, code) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(name)}</td>` +
      `<td class="qc">${btn(x.n - x.ct, { u: code, c: 'belum' })}</td><td class="qc">${btn(x.ct, { u: code, c: 'sudah' })}</td><td>${fmt(pc(x.ct, x.n), 1)}%</td>` +
      `<td class="qc">${btn(x.p2tl, { u: code, p: 'ada' })}</td><td>${fmt(x.nocoord)}</td></tr>`;
    $('dTdTbl').innerHTML = `<thead><tr><th>ULP</th><th>Belum CT</th><th>Sudah CT</th><th>% sudah CT</th><th>P2TL</th><th>Tanpa koordinat</th></tr></thead><tbody>` +
      p.ulp.map((u) => row(u.name, u, '', u.name)).join('') + row('UP3 Mamuju', t, 'tot', '') + '</tbody>';
  }

  // ---------- tren ----------
  function renderTren() {
    const order = D.order, multi = order.length >= 2;
    $('dTrNote').innerHTML = multi ? '' : `<div class="s-msg b-note">Tren dan perubahan baru muncul setelah ada minimal 2 periode data. Saat ini baru ada ${order.length}.</div>`;
    $('dTrBody').hidden = !multi;
    if (!multi) return;
    const last = D.periods[order[order.length - 1]], ulps = last.ulp.map((u) => [u.code, u.name]);
    const val = (k, code) => { const u = D.periods[k].ulp.find((x) => x.code === code); return u ? u.n : null; };
    chart('dChTr').setOption(Object.assign(base(), {
      color: ulps.map((_, i) => css('--s' + (i + 1))),
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      grid: { left: 8, right: 28, top: 40, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', formatter: (ps) => `<b>${esc(D.periods[order[ps[0].dataIndex]].label)}</b>` + ps.map((p) => ttRow(p.seriesName, p.value == null ? '–' : fmt(p.value), p.color)).join('') }),
      xAxis: Object.assign({ type: 'category', data: order.map(ymShort), boundaryGap: false }, axisCommon()),
      yAxis: { type: 'value', axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      series: ulps.map(([code, name], i) => ({ name, type: 'line', symbol: 'circle', symbolSize: 8, lineStyle: { width: 2 }, itemStyle: { color: css('--s' + (i + 1)), borderColor: css('--surface'), borderWidth: 2 }, data: order.map((k) => val(k, code)) })),
    }), true);
    $('dTrHint').textContent = `${order.length} periode: ${ymShort(order[0])} – ${ymShort(order[order.length - 1])}`;
    const head = (first) => `<thead><tr><th>${first}</th>${order.map((k) => `<th class="${k === T.ym ? 'cur' : ''}">${ymShort(k)}</th>`).join('')}</tr></thead>`;
    $('dTrTbl').innerHTML = head('ULP') + '<tbody>' + ulps.map(([code, name]) => `<tr><td>${esc(name)}</td>${order.map((k) => `<td class="${k === T.ym ? 'cur' : ''}">${val(k, code) == null ? '–' : fmt(val(k, code))}</td>`).join('')}</tr>`).join('') +
      `<tr class="tot"><td>UP3 Mamuju</td>${order.map((k) => `<td class="${k === T.ym ? 'cur' : ''}">${fmt(D.periods[k].total.n)}</td>`).join('')}</tr></tbody>`;
    const rowOf = (label, f) => `<tr><td>${label}</td>${order.map((k) => { const p = D.periods[k]; const v = p.prev ? f(p.total) : null; return `<td class="${k === T.ym ? 'cur' : ''}">${v == null ? '–' : fmt(v)}</td>`; }).join('')}</tr>`;
    $('dTrChg').innerHTML = head('Perubahan') + '<tbody>' + rowOf('Baru masuk daftar', (x) => x.baru) + rowOf('Berlanjut (kriteria sama)', (x) => x.berlanjut) + rowOf('Pindah kriteria', (x) => x.pindah) + rowOf('Keluar dari daftar', (x) => x.keluar) +
      `<tr class="tot"><td>Sudah ada CT</td>${order.map((k) => `<td class="${k === T.ym ? 'cur' : ''}">${fmt(D.periods[k].total.ct)}</td>`).join('')}</tr></tbody>`;
  }

  // ---------- daftar pelanggan ----------
  const LABEL = { idpel: 'ID pelanggan', nama: 'Nama', alamat: 'Alamat', ulp: 'ULP', tarif: 'Tarif', daya: 'Daya (VA)', kriteria: 'Kriteria', status: 'Status', idle: 'Lama tidak beli (bln)', beli_akhir: 'Terakhir beli token',
    meter: 'No. meter', merek: 'Merek meter', thn_meter: 'Tahun meter', dlpd: 'Kode DLPD', p2tl: 'Jml P2TL', ct: 'Jml CT', petugas: 'Petugas CT', gardu: 'Kode gardu', tiang: 'No. tiang', lat: 'Lintang', lng: 'Bujur' };
  const NUM = new Set(['daya', 'idle', 'thn_meter', 'p2tl', 'ct', 'lat', 'lng']);
  const SHOW = ['idpel', 'nama', 'alamat', 'ulp', 'tarif', 'daya', 'kriteria', 'beli_akhir', 'idle', 'status', 'ct', 'p2tl', 'merek'];
  const col = (cols, k) => cols.indexOf(k);

  async function loadDocs(codes) {
    const out = [];
    await Promise.all(codes.map(async (code) => {
      const id = `dl:${T.ym}:${code}`;
      if (!docs.has(id)) {
        const { data, error } = await DashAuth.sb.from('tul_data').select('data').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('daftar pelanggan belum tersedia — tunggu sinkron berikutnya');
        docs.set(id, data.data);
      }
      out.push(docs.get(id));
    }));
    return out;
  }
  let cols = [], allRows = [];
  async function ensureRows() {
    const key = T.ym;
    if (listKey === key) return;
    const codes = per().ulp.filter((u) => u.n).map((u) => u.code);
    const ds = await loadDocs(codes);
    cols = ds[0].cols; allRows = [];
    ds.forEach((d) => d.rows.forEach((r) => allRows.push(r)));
    const id = col(cols, 'idle'), dy = col(cols, 'daya'), ip = col(cols, 'idpel');
    allRows.sort((a, b) => (b[id] == null ? -1 : b[id]) - (a[id] == null ? -1 : a[id]) || b[dy] - a[dy] || (a[ip] < b[ip] ? -1 : 1));
    listKey = key;
    const opts = (k, all) => `<option value="">${all}</option>` + [...new Set(allRows.map((r) => r[col(cols, k)]))].filter(Boolean).sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    $('dFU').innerHTML = opts('ulp', 'Semua ULP'); $('dFK').innerHTML = opts('kriteria', 'Semua kriteria'); $('dFT').innerHTML = opts('tarif', 'Semua tarif');
  }
  const DAYA_GRP = [[450, '≤ 450 VA'], [900, '900 VA'], [1300, '1.300 VA'], [2200, '2.200 VA'], [5500, '3.500 – 5.500 VA'], [1e9, '> 5.500 VA']];
  const dayaGrp = (d) => (DAYA_GRP.find((g) => d <= g[0]) || DAYA_GRP[5])[1];
  const umurGrp = (thn) => { if (!thn || thn <= 1990) return 'Tidak diketahui'; const a = +T.ym.slice(0, 4) - thn; return a < 5 ? '< 5 tahun' : a < 10 ? '5 – 9 tahun' : a < 15 ? '10 – 14 tahun' : '≥ 15 tahun'; };
  function xMatch(r) {
    const x = F.x; if (!x) return true;
    const c = (k) => col(cols, k), v = x.val, rest = v === REST;
    switch (x.kind) {
      case 'tarif': return rest ? !per().tarif.slice(0, 10).some((t) => t.name === r[c('tarif')]) : r[c('tarif')] === v;
      case 'daya': return dayaGrp(r[c('daya')]) === v;
      case 'beli': return v === '-' ? !r[c('beli_akhir')] : String(r[c('beli_akhir')] || '').slice(0, 7).replace('-', '') === v;
      case 'merek': return rest ? !per().merek.some((m) => m.name !== 'Lainnya' && m.name === (r[c('merek')] || 'Tidak diketahui')) : (r[c('merek')] || 'Tidak diketahui') === v;
      case 'umur': return umurGrp(r[c('thn_meter')]) === v;
      case 'kode': return (r[c('dlpd')] || '-') === v;
    }
    return true;
  }
  function applyFilter() {
    const c = (k) => col(cols, k), q = F.q.trim().toLowerCase();
    rows = allRows.filter((r) => (!F.u || r[c('ulp')] === F.u) && (!F.k || r[c('kriteria')] === F.k) && (!F.t || r[c('tarif')] === F.t) &&
      (!F.c || (F.c === 'sudah') === (r[c('ct')] > 0)) && (!F.p || r[c('p2tl')] > 0) && (!F.s || r[c('status')] === F.s) && (!F.d || r[c('daya')] >= 3500) &&
      xMatch(r) && (!q || [r[c('idpel')], r[c('nama')], r[c('alamat')], r[c('meter')]].some((v) => String(v).toLowerCase().includes(q))));
  }
  function syncFilterUi() {
    const m = { dFU: 'u', dFK: 'k', dFT: 't', dFC: 'c', dFP: 'p', dFS: 's', dFD: 'd' };
    Object.entries(m).forEach(([id, k]) => { $(id).value = F[k]; });
    $('dDQ').value = F.q;
    $('dFx').innerHTML = F.x ? `<span class="d-chip">${esc(F.x.label)}<button type="button" aria-label="Hapus filter" id="dFxClr">✕</button></span>` : '';
    if (F.x) $('dFxClr').onclick = () => { F.x = null; T.pg = 0; syncFilterUi(); renderDetail(); };
    const hasStatus = !!per().prev;
    $('dFS').closest('label').hidden = !hasStatus;
  }
  function renderDetail() {
    applyFilter();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    T.pg = Math.min(T.pg, pages - 1);
    const shown = SHOW.filter((k) => k !== 'status' || per().prev);
    const idx = shown.map((k) => col(cols, k)), il = col(cols, 'lat'), ig = col(cols, 'lng');
    const cell = (k, v) => (v == null || v === '' ? '–' : k === 'daya' ? fmt(v) : k === 'ct' || k === 'p2tl' ? (v > 0 ? fmt(v) : '0') : esc(v));
    $('dDTbl').innerHTML = `<thead><tr>${shown.map((k) => `<th${NUM.has(k) ? '' : ' class="l"'}>${esc(LABEL[k])}</th>`).join('')}<th class="l">Peta</th></tr></thead><tbody>` +
      rows.slice(T.pg * PAGE, T.pg * PAGE + PAGE).map((r) => '<tr>' + shown.map((k, j) => `<td${NUM.has(k) ? '' : ' class="l"'}>${cell(k, r[idx[j]])}</td>`).join('') +
        `<td class="l">${r[il] != null && r[ig] != null ? `<a href="https://www.google.com/maps?q=${r[il]},${r[ig]}" target="_blank" rel="noopener noreferrer">Buka ›</a>` : '–'}</td></tr>`).join('') +
      (rows.length ? '' : `<tr><td class="l" colspan="${shown.length + 1}">Tidak ada pelanggan yang cocok.</td></tr>`) + '</tbody>';
    $('dDHint').textContent = `${per().label} · ${fmt(rows.length)} dari ${fmt(allRows.length)} pelanggan · urut dari yang paling lama tidak membeli token`;
    $('dDPage').textContent = `Halaman ${T.pg + 1} dari ${pages}`;
    $('dDPrev').disabled = T.pg === 0; $('dDNext').disabled = T.pg >= pages - 1; $('dDCsv').disabled = !rows.length;
  }
  async function renderDaftar() {
    $('dDMsg').hidden = false; $('dDMsg').textContent = 'Memuat daftar pelanggan…';
    $('dDTbl').innerHTML = '';
    try { await ensureRows(); } catch (e) { listKey = ''; $('dDMsg').textContent = 'Gagal memuat (' + e.message + ').'; return; }
    $('dDMsg').hidden = true;
    syncFilterUi();
    renderDetail();
  }
  function csvDetail() {
    if (!rows.length) return;
    const keys = cols.filter((k) => k !== 'status' || per().prev);
    XlsxMini.download(`DLPD_Prabayar_${T.ym}${F.u ? '_' + F.u.toLowerCase().replace(/[^a-z0-9]+/g, '_') : ''}.xlsx`, 'DLPD Prabayar', keys.map((k) => LABEL[k] || k),
      rows.map((r) => keys.map((k) => { const v = r[col(cols, k)]; return v == null ? '' : k === 'idpel' || k === 'meter' ? String(v) : NUM.has(k) && isFinite(+v) ? +v : String(v); })));
  }
  function openList(o) {
    Object.keys(F).forEach((k) => { F[k] = k === 'x' ? null : ''; });
    Object.entries(o).forEach(([k, v]) => { F[k] = v; });
    T.pg = 0;
    show('daftar', true);
  }

  // ---------- peta ----------
  const M = { u: '', c: '', i: '' };
  let map = null, mlayer = null, mPeriod = '';
  const BUCKET = [['≤ 3 bulan', '#eda100'], ['4 bulan', '#eb6834'], ['5 bulan', '#d6453a'], ['≥ 6 bulan', '#7a1fa2'], ['Tidak ada data', '#94a3b8']];
  const bucket = (i) => (i == null ? 4 : i <= 3 ? 0 : i === 4 ? 1 : i === 5 ? 2 : 3);
  const inArea = (la, ln) => la > -5 && la < 1 && ln > 117 && ln < 121;  // kira-kira wilayah Sulawesi Barat; titik di luar dianggap salah input
  function popupHtml(r) {
    const c = (k) => r[col(cols, k)], la = c('lat'), ln = c('lng');
    return `<div class="d-pop"><b>${esc(c('nama') || '-')}</b><br>${esc(c('idpel'))}<br>${esc(c('alamat') || '')}<br>` +
      `${esc(c('ulp'))} · ${esc(c('tarif'))} · ${fmt(c('daya'))} VA<br>Terakhir beli token: ${esc(c('beli_akhir') || '–')}${c('idle') != null ? ` (${c('idle')} bln)` : ''}<br>` +
      `CT: ${c('ct') > 0 ? 'ada (' + c('ct') + ')' : 'belum ada'} · P2TL: ${c('p2tl') > 0 ? c('p2tl') : '0'}${c('status') ? ' · ' + esc(c('status')) : ''}<br>` +
      `<a href="https://www.google.com/maps/dir/?api=1&destination=${la},${ln}" target="_blank" rel="noopener noreferrer">Navigasi di Google Maps ›</a></div>`;
  }
  function drawMap(fit) {
    const c = (k) => col(cols, k), il = c('lat'), ig = c('lng'), iu = c('ulp'), ic = c('ct'), ii = c('idle');
    let nocoord = 0, outside = 0;
    const pts = [];
    allRows.forEach((r) => {
      if ((M.u && r[iu] !== M.u) || (M.c && (M.c === 'sudah') !== (r[ic] > 0))) return;
      if (M.i && !(M.i === '6' ? r[ii] >= 6 : M.i === '3' ? r[ii] != null && r[ii] <= 3 : r[ii] === +M.i)) return;
      if (r[il] == null || r[ig] == null) { nocoord++; return; }
      if (!inArea(r[il], r[ig])) { outside++; return; }
      pts.push(r);
    });
    if (mlayer) mlayer.remove();
    mlayer = L.layerGroup();
    const cnt = [0, 0, 0, 0, 0];
    pts.forEach((r) => {
      const k = bucket(r[ii]); cnt[k]++;
      L.circleMarker([r[il], r[ig]], { radius: 5, weight: 1, color: '#fff', fillColor: BUCKET[k][1], fillOpacity: 0.9 }).bindPopup(() => popupHtml(r)).addTo(mlayer);
    });
    mlayer.addTo(map);
    if (fit && pts.length) map.fitBounds(L.latLngBounds(pts.map((r) => [r[il], r[ig]])), { padding: [30, 30], maxZoom: 15 });
    $('dMapLegend').innerHTML = BUCKET.map((b, k) => (cnt[k] ? `<span><i style="background:${b[1]}"></i>${b[0]} <b>${fmt(cnt[k])}</b></span>` : '')).join('');
    $('dMapHint').textContent = `${per().label} · ${fmt(pts.length)} titik di peta` + (nocoord ? ` · ${fmt(nocoord)} tanpa koordinat` : '') + (outside ? ` · ${fmt(outside)} koordinat di luar wilayah (diabaikan)` : '') + ' · klik titik untuk detail dan navigasi';
  }
  // ---------- lokasi saya (GPS) pada peta ----------
  function addLocate(m) {
    const ctl = L.control({ position: 'topleft' });
    ctl.onAdd = () => {
      const b = L.DomUtil.create('a', 'leaflet-bar');
      b.href = '#'; b.textContent = '◎';
      b.style.cssText = 'background:#fff;width:34px;height:34px;line-height:34px;text-align:center;font-size:22px;color:#2a78d6;text-decoration:none;cursor:pointer';
      L.DomEvent.disableClickPropagation(b);
      let wid = null, dot = null, ring = null, first = true;
      const stop = () => { if (wid != null) navigator.geolocation.clearWatch(wid); wid = null; if (dot) { m.removeLayer(dot); m.removeLayer(ring); dot = ring = null; } b.style.background = '#fff'; b.style.color = '#2a78d6'; };
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        if (!navigator.geolocation) { alert('Peramban tidak mendukung lokasi.'); return; }
        if (wid != null) { if (dot) m.setView(dot.getLatLng(), Math.max(m.getZoom(), 16)); return; }
        b.style.background = '#2a78d6'; b.style.color = '#fff'; first = true;
        wid = navigator.geolocation.watchPosition((p) => {
          const ll = [p.coords.latitude, p.coords.longitude];
          if (!dot) {
            ring = L.circle(ll, { radius: p.coords.accuracy, weight: 1, color: '#2a78d6', fillOpacity: 0.12, interactive: false }).addTo(m);
            dot = L.circleMarker(ll, { radius: 8, weight: 3, color: '#fff', fillColor: '#2a78d6', fillOpacity: 1 }).addTo(m).bindTooltip('Lokasi saya');
          } else { dot.setLatLng(ll); ring.setLatLng(ll); ring.setRadius(p.coords.accuracy); }
          if (first) { first = false; m.setView(ll, 16); }
        }, (er) => { stop(); alert('Lokasi tidak dapat diakses: ' + (er.code === 1 ? 'izin ditolak. Aktifkan izin lokasi untuk situs ini.' : er.message)); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      });
      L.DomEvent.on(b, 'dblclick', (e) => { L.DomEvent.stop(e); stop(); });
      b.title = 'Lokasi saya (klik dua kali untuk mematikan)';
      return b;
    };
    ctl.addTo(m);
  }

  async function renderPeta() {
    const msg = $('dMapMsg');
    if (typeof L === 'undefined') { msg.hidden = false; msg.textContent = 'Pustaka peta tidak dapat dimuat.'; return; }
    msg.hidden = false; msg.textContent = 'Memuat data pelanggan…';
    try { await ensureRows(); } catch (e) { listKey = ''; msg.textContent = 'Gagal memuat (' + e.message + ').'; return; }
    msg.hidden = true;
    if (mPeriod !== T.ym) {
      mPeriod = T.ym;
      $('dMU').innerHTML = '<option value="">Semua ULP</option>' + per().ulp.filter((u) => u.n).map((u) => `<option value="${esc(u.name)}">${esc(u.name)}</option>`).join('');
      M.u = ''; M.c = ''; M.i = ''; $('dMC').value = ''; $('dMI').value = '';
    }
    if (!map) {
      map = L.map('dMap', { preferCanvas: true }).setView([-2.7, 118.9], 9);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      addLocate(map);
    }
    map.invalidateSize();
    drawMap(true);
  }

  // ---------- peta Target Operasi (TO) P2TL ----------
  // Skor potensi (maks. 90) dihitung di peta dari kolom daftar: lama tidak beli token, daya, status CT, riwayat P2TL.
  const TO = { u: '', l: '0', c: '', k: '', h: '', o: 'daya' };
  let pasca = null, pascaErr = '';
  const FLAG_LBL = { nol: 'kWh nol', mundur: 'Stand meter mundur', jam40: '< 40 jam nyala', dev50: 'Selisih > 50%', kvarh: 'kVArh bermasalah', pecah: 'Rekening pecahan', jn600: 'Jam nyala > 600', jn400: 'Jam nyala > 400', jn_turun: 'Jam nyala < 40 (sebelumnya > 40)', jn_anjlok: 'Jam nyala anjlok > 50%', jn_datar: 'Jam nyala datar ≥ 3 bulan (daya besar)', jn6080: 'Jam nyala 60–80', jn6080_turun: 'Jam nyala 60–80 & turun ≥ 25%' };
  const ULP_COL = ['#2a78d6', '#e34948', '#1baf7a', '#eda100', '#7a1fa2', '#0aa5b8', '#e87ba4', '#6a7380'];
  let tmap = null, tlayer = null, tPeriod = '', tUlpIdx = {}, hotCur = [], hotSel = null, toPts = [];
  function toScore(r) {
    const c = (k) => r[col(cols, k)], idle = c('idle'), d = c('daya') || 0;
    const a = idle == null ? 0 : idle >= 6 ? 40 : idle === 5 ? 30 : idle === 4 ? 20 : 10;
    const b = d >= 3500 ? 25 : d >= 2200 ? 15 : d >= 1300 ? 8 : 3;
    const ct = c('ct') > 0 ? 0 : 15, p = c('p2tl') > 0 ? 10 : 0;
    return { s: a + b + ct + p, a, b, ct, p };
  }
  const toLevel = (s) => (s >= 65 ? 2 : s >= 50 ? 1 : 0);
  const LV = ['Biasa', 'Tinggi', 'Sangat tinggi'], LVC = ['#6a7380', '#eb6834', '#d6232a'];
  // urutan prioritas: 'daya' = pelanggan tidak beli token (prabayar) dulu, daya terbesar di atas; 'skor' = skor potensi tertinggi
  const ptCmp = (a, b) => (TO.o === 'daya' ? (a.kind === 'pra' ? 0 : 1) - (b.kind === 'pra' ? 0 : 1) || (b.dy || 0) - (a.dy || 0) || b.sc.s - a.sc.s : b.sc.s - a.sc.s || (b.dy || 0) - (a.dy || 0));
  function toPopup(r, sc) {
    const c = (k) => r[col(cols, k)], lv = toLevel(sc.s);
    return `<div class="d-pop"><b>${esc(c('nama') || '-')}</b><br>${esc(c('idpel'))}<br>${esc(c('alamat') || '')}<br>${esc(c('ulp'))} · ${esc(c('tarif'))} · ${fmt(c('daya'))} VA<br>` +
      `Terakhir beli token: ${esc(c('beli_akhir') || '–')}${c('idle') != null ? ` (${c('idle')} bln)` : ''}<br>CT: ${c('ct') > 0 ? 'ada' : 'belum ada'} · P2TL: ${c('p2tl') > 0 ? c('p2tl') : '0'}<br>` +
      `<span class="to-badge" style="background:${LVC[lv]}">${LV[lv]} · skor ${sc.s}</span> <small>(lama ${sc.a} + daya ${sc.b} + belum CT ${sc.ct} + riwayat P2TL ${sc.p})</small><br>` +
      `<a href="https://www.google.com/maps/dir/?api=1&destination=${c('lat')},${c('lng')}" target="_blank" rel="noopener noreferrer">Navigasi di Google Maps ›</a></div>`;
  }
  // ---- hasil pemeriksaan TO (tabel to_inspections). Hasil normal / temuan / kosong menyembunyikan titik selama 3 bulan; 'akses' tetap tampil.
  const HASIL = { normal: 'Normal', temuan: 'Temuan P2TL', kosong: 'Pelanggan tidak ditemukan / bangunan kosong', akses: 'Tidak bisa diakses' };
  const HIDES = new Set(['normal', 'temuan', 'kosong']);
  let insp = new Map(), inspErr = '', isEditor = false, inspLoaded = false, userMail = '';
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const inspActive = (r) => { const d = new Date(r.tanggal + 'T00:00:00'); d.setMonth(d.getMonth() + 3); return new Date() <= d; };  // muncul lagi setelah > 3 bulan
  const inspHides = (idpel) => { const r = insp.get(String(idpel)); return !!r && HIDES.has(r.hasil) && inspActive(r); };
  async function loadInsp(force) {
    if (inspLoaded && !force) return;
    inspErr = '';
    try {
      const sb = DashAuth.sb;
      const { data: ses } = await sb.auth.getSession();
      userMail = ((ses.session && ses.session.user.email) || '').toLowerCase();
      const since = new Date(); since.setDate(since.getDate() - 130);
      const m = new Map();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('to_inspections').select('id,idpel,jenis,hasil,catatan,tanggal,created_by')
          .gte('tanggal', since.toISOString().slice(0, 10)).order('tanggal', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
        if (error) throw new Error(error.message);
        data.forEach((r) => { if (!m.has(r.idpel)) m.set(r.idpel, r); });
        if (data.length < 1000) break;
      }
      insp = m;
      const { data: ed } = await sb.from('to_editors').select('email').maybeSingle();
      isEditor = !!ed;
      inspLoaded = true;
    } catch (e) { inspErr = e.message; isEditor = false; insp = new Map(); }
  }
  function inspBlock(p) {
    const id = String(p.id), r = insp.get(id);
    let h = '';
    if (r) {
      h += `<div class="to-insp-last"><b>Pemeriksaan terakhir:</b> ${esc(HASIL[r.hasil] || r.hasil)} · ${esc(r.tanggal)}${r.catatan ? '<br>' + esc(r.catatan) : ''}` +
        (HIDES.has(r.hasil) ? (inspActive(r) ? '<br><small>Disembunyikan dari peta sampai > 3 bulan sejak tanggal ini.</small>' : '<br><small>Sudah lewat 3 bulan, muncul kembali.</small>') : '') +
        (isEditor ? ` <button type="button" class="b-link ti-del" data-id="${r.id}">Hapus catatan</button>` : '') + '</div>';
    }
    if (isEditor) {
      h += '<div class="to-insp"><b>Input hasil pemeriksaan</b><select class="ti-h">' + Object.entries(HASIL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('') + '</select>' +
        `<input class="ti-d" type="date" value="${todayIso()}" max="${todayIso()}"><input class="ti-n" type="text" maxlength="300" placeholder="Catatan (opsional)"><button type="button" class="btn ti-s">Simpan</button><span class="ti-m"></span></div>`;
    }
    return h;
  }
  function popupFor(p) {
    let html = p.kind === 'pasca' ? popupPasca(p.r) : toPopup(p.r, p.sc);
    const extra = inspBlock(p);
    if (!extra) return html;
    html = html.replace(/<\/div>$/, extra + '</div>');
    if (!isEditor) return html;
    const el = document.createElement('div');
    el.innerHTML = html;
    const msg = el.querySelector('.ti-m'), save = el.querySelector('.ti-s'), del = el.querySelector('.ti-del');
    save.onclick = async () => {
      save.disabled = true; msg.textContent = 'Menyimpan…';
      const row = { idpel: String(p.id), jenis: p.kind, hasil: el.querySelector('.ti-h').value, catatan: el.querySelector('.ti-n').value.trim() || null, tanggal: el.querySelector('.ti-d').value || todayIso() };
      const { error } = await DashAuth.sb.from('to_inspections').insert(row);
      if (error) { save.disabled = false; msg.textContent = 'Gagal: ' + error.message; return; }
      await loadInsp(true); tmap.closePopup(); drawTo(false);
    };
    if (del) del.onclick = async () => {
      if (!confirm('Hapus catatan pemeriksaan ini?')) return;
      const { error } = await DashAuth.sb.from('to_inspections').delete().eq('id', +del.dataset.id);
      if (error) { msg.textContent = 'Gagal: ' + error.message; return; }
      await loadInsp(true); tmap.closePopup(); drawTo(false);
    };
    return el;
  }
  function popupPasca(r) {
    const c = (k) => r[pasca.cols.indexOf(k)], lv = toLevel(c('s')), sd = c('sd');
    return `<div class="d-pop"><b>${esc(c('nama') || '-')}</b> <small>(pascabayar)</small><br>${esc(c('idpel'))}<br>${esc(c('alamat') || '')}<br>${esc(c('ulp'))} · ${esc(c('tarif'))} · ${fmt(c('daya'))} VA<br>` +
      `Penanda: ${c('flags').map((f) => esc(FLAG_LBL[f] || f)).join(', ')}<br>Status ${esc(pasca.label)}: ${esc(c('status') || '–')} · bulan lalu: ${esc(c('status_lalu') || '–')}<br>kWh ${fmt(c('kwh'))} · jam nyala ${fmt(c('jam'))}<br>` +
      `<span class="to-badge" style="background:${LVC[lv]}">${LV[lv]} · skor ${c('s')}</span> <small>(penanda ${sd[0]} + penanda lain ${sd[1]} + daya ${sd[2]} + berlanjut ${sd[3]})</small><br>` +
      `<a href="https://www.google.com/maps/dir/?api=1&destination=${c('lat')},${c('lng')}" target="_blank" rel="noopener noreferrer">Navigasi di Google Maps ›</a></div>`;
  }
  // penanda pascabayar = belah ketupat (prabayar = lingkaran), digambar lewat kanvas Leaflet
  const Diamond = L.CircleMarker.extend({ _updatePath() { this._renderer._updateDiamond(this); } });
  L.Canvas.include({ _updateDiamond(layer) {
    if (!this._drawing || layer._empty()) return;
    const p = layer._point, r = Math.max(layer._radius, 1) * 1.25, ctx = this._ctx;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath();
    this._fillStroke(ctx, layer);
  } });
  // daftar pelanggan TO (semua yang lolos filter, atau satu titik panas): tabel + unduh .xlsx, urut menurut lokasi (kurva Hilbert = titik berdekatan berurutan)
  function hilbert(x, y) {   // x,y 0..65535 -> posisi di sepanjang kurva Hilbert
    let d = 0;
    for (let s = 32768; s > 0; s >>= 1) {
      const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) { if (rx === 1) { x = 65535 - x; y = 65535 - y; } const t = x; x = y; y = t; }
    }
    return d;
  }
  function byLocation(arr) {
    if (!arr.length) return [];
    let a0 = Infinity, a1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    arr.forEach((p) => { a0 = Math.min(a0, p.la); a1 = Math.max(a1, p.la); n0 = Math.min(n0, p.ln); n1 = Math.max(n1, p.ln); });
    const sc = (v, lo, hi) => (hi > lo ? Math.round((v - lo) / (hi - lo) * 65535) : 0);
    return arr.map((p) => ({ p, h: hilbert(sc(p.ln, n0, n1), sc(p.la, a0, a1)) })).sort((x, y) => x.h - y.h).map((x) => x.p);
  }
  function hotRows(arr, mode) {
    const ord = mode === 'prio' ? arr.slice().sort(ptCmp) : byLocation(arr);
    return ord.map((p, i) => {
      const alamat = p.kind === 'pasca' ? p.r[pasca.cols.indexOf('alamat')] : (cols.indexOf('alamat') >= 0 ? p.r[col(cols, 'alamat')] : '');
      return { p, v: [i + 1, String(p.id == null ? '' : p.id), p.nm || '', alamat || '', p.u || '', p.kind === 'pasca' ? 'Pascabayar' : 'Prabayar', +p.dy || 0, p.sc.s, LV[toLevel(p.sc.s)], p.sub || '', p.la, p.ln,
        `https://www.google.com/maps?q=${p.la},${p.ln}`, '', ''] };
    });
  }
  const HOT_HEAD = ['No', 'IDPEL', 'Nama', 'Alamat', 'ULP', 'Jenis', 'Daya (VA)', 'Skor', 'Tingkat potensi', 'Keterangan', 'Lintang', 'Bujur', 'Peta (Google Maps)', 'Hasil pemeriksaan', 'Catatan'];
  const HOT_MAX = 1500;   // baris yang digambar di layar; Excel selalu berisi semua
  function listXls(sel) {
    const mode = $('dToHotOrd').value;
    XlsxMini.download(`${sel.file}_${T.ym}_${mode === 'prio' ? 'prioritas' : 'urut_lokasi'}.xlsx`, sel.sheet, HOT_HEAD, hotRows(sel.pts, mode).map((r) => r.v));
  }
  function showList(sel) {
    hotSel = sel;
    const rows = hotRows(sel.pts, $('dToHotOrd').value), box = $('dToHotList'), shown = rows.slice(0, HOT_MAX);
    $('dToHotTitle').textContent = sel.title;
    $('dToHotHint').textContent = sel.hint + (rows.length > HOT_MAX ? ` · ditampilkan ${fmt(HOT_MAX)} baris pertama, Excel berisi semua ${fmt(rows.length)}` : ' · klik baris untuk memperbesar peta');
    $('dToHotTbl').innerHTML = '<thead><tr>' + HOT_HEAD.slice(0, 10).map((h, i) => `<th${[2, 3, 9].includes(i) ? ' class="l"' : ''}>${esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
      shown.map((r) => `<tr class="to-row" data-la="${r.p.la}" data-ln="${r.p.ln}" tabindex="0"><td>${r.v[0]}</td><td>${esc(r.v[1])}</td><td class="l">${esc(r.v[2])}</td><td class="l">${esc(r.v[3])}</td><td>${esc(r.v[4])}</td><td>${r.v[5]}</td><td>${fmt(r.v[6])}</td><td>${r.v[7]}</td><td><span class="to-badge" style="background:${LVC[toLevel(r.v[7])]}">${r.v[8]}</span></td><td class="l">${esc(r.v[9])}</td></tr>`).join('') + '</tbody>';
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const hotSelOf = (e) => ({ title: `Daftar pelanggan · Titik panas #${e.rank}`, hint: `${fmt(e.n)} pelanggan · ${fmt(e.hi)} potensi sangat tinggi · total skor ${fmt(e.sum)}`, pts: e.pts, file: `Titik_panas_${e.rank}`, sheet: 'Titik panas ' + e.rank });
  const showHot = (e) => showList(hotSelOf(e));
  const toSel = () => ({ title: `Daftar pelanggan Target Operasi${TO.u ? ' · ' + TO.u : ''}`, hint: `${fmt(toPts.length)} pelanggan sesuai filter peta, ${$('dToHotOrd').value === 'prio' ? 'urut prioritas' : 'diurutkan menurut lokasi (titik berdekatan berurutan)'}`, pts: toPts, file: 'Daftar_TO' + (TO.u ? '_' + TO.u.replace(/\s+/g, '_') : ''), sheet: 'Daftar TO' });
  function drawTo(fit) {
    const c = (k) => col(cols, k), il = c('lat'), ig = c('lng'), iu = c('ulp'), ic = c('ct');
    const pts = [];
    if (TO.k !== 'pasca') allRows.forEach((r) => {
      if ((TO.u && r[iu] !== TO.u) || (TO.c && (TO.c === 'sudah') !== (r[ic] > 0))) return;
      if (r[il] == null || r[ig] == null || !inArea(r[il], r[ig])) return;
      const sc = toScore(r);
      if (toLevel(sc.s) < +TO.l) return;
      pts.push({ r, sc, kind: 'pra', id: r[c('idpel')], la: r[il], ln: r[ig], u: r[iu], nm: r[c('nama')], dy: r[c('daya')],
        sub: `${r[c('idle')] != null ? r[c('idle')] + ' bln tidak beli' : 'tanpa data beli'}${r[c('ct')] > 0 ? '' : ' · belum CT'}` });
    });
    if (pasca && TO.k !== 'pra' && !TO.c) {
      const g = (r, k) => r[pasca.cols.indexOf(k)];
      pasca.rows.forEach((r) => {
        const u = g(r, 'ulp'), s_ = g(r, 's');
        if ((TO.u && u !== TO.u) || toLevel(s_) < +TO.l) return;
        pts.push({ r, sc: { s: s_ }, kind: 'pasca', id: g(r, 'idpel'), la: g(r, 'lat'), ln: g(r, 'lng'), u, nm: g(r, 'nama'), dy: g(r, 'daya'), sub: 'Pasca · ' + g(r, 'flags').map((f) => FLAG_LBL[f] || f).slice(0, 2).join(', ') });
      });
    }
    let hidden = 0;
    if (TO.h !== 'tampil') { for (let i = pts.length - 1; i >= 0; i--) if (inspHides(pts[i].id)) { pts.splice(i, 1); hidden++; } }
    if (tlayer) tlayer.remove();
    tlayer = L.layerGroup();
    // titik panas: sel ~0,005° (±550 m) dengan jumlah skor terbesar
    const cells = new Map();
    pts.forEach((p) => {
      const k = Math.floor(p.la / 0.005) + ':' + Math.floor(p.ln / 0.005);
      let e = cells.get(k); if (!e) cells.set(k, e = { n: 0, sum: 0, hi: 0, la: 0, ln: 0, u: {}, pts: [] });
      e.pts.push(p); e.n++; e.sum += p.sc.s; e.hi += toLevel(p.sc.s) === 2 ? 1 : 0; e.la += p.la; e.ln += p.ln; e.u[p.u] = (e.u[p.u] || 0) + 1;
    });
    const hot = [...cells.values()].filter((e) => e.n >= 3).sort((a, b) => b.sum - a.sum).slice(0, 10);
    hotCur = hot; hotSel = null; toPts = pts; $('dToHotList').hidden = true;
    $('dToListBtn').textContent = `Lihat data detail (${fmt(pts.length)})`;
    hot.forEach((e, i) => { e.la /= e.n; e.ln /= e.n; e.rank = i + 1; });
    hot.slice().reverse().forEach((e) => {
      L.circle([e.la, e.ln], { radius: 450, color: '#d6232a', weight: 2, dashArray: '6 5', fillColor: '#d6232a', fillOpacity: 0.12, className: 'to-pulse', interactive: false }).addTo(tlayer);
    });
    // titik per pelanggan: warna = ULP; ukuran + cincin merah = tingkat potensi
    pts.slice().sort((a, b) => a.sc.s - b.sc.s).forEach((p) => {
      const ri = insp.get(String(p.id)), tried = ri && ri.hasil === 'akses' && inspActive(ri);
      const lv = toLevel(p.sc.s), fc = ULP_COL[(tUlpIdx[p.u] || 0) % ULP_COL.length], Mk = p.kind === 'pasca' ? Diamond : L.CircleMarker;
      new Mk([p.la, p.ln], { radius: lv === 2 ? 9 : lv === 1 ? 6.5 : 4, weight: lv === 2 ? 3 : lv === 1 ? 1.5 : 1, color: lv === 2 ? '#d6232a' : '#fff', fillColor: fc, fillOpacity: lv === 0 ? 0.65 : 0.95, dashArray: tried ? '2 3' : null })
        .bindPopup(() => popupFor(p), { maxWidth: 320 }).addTo(tlayer);
    });
    hot.forEach((e) => L.marker([e.la, e.ln], { icon: L.divIcon({ className: '', html: `<div class="to-pin">${e.rank}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 1000 })
      .bindPopup(`<div class="d-pop"><b>Titik panas #${e.rank}</b><br>${e.n} pelanggan · ${e.hi} potensi sangat tinggi<br>Total skor ${fmt(e.sum)}</div>`).on('click', () => showHot(e)).addTo(tlayer));
    tlayer.addTo(tmap);
    if (fit && pts.length) tmap.fitBounds(L.latLngBounds(pts.map((p) => [p.la, p.ln])), { padding: [30, 30], maxZoom: 15 });
    const cnt = {}; pts.forEach((p) => { cnt[p.u] = (cnt[p.u] || 0) + 1; });
    $('dToLegend').innerHTML = Object.keys(tUlpIdx).map((n) => `<span><i style="background:${ULP_COL[tUlpIdx[n] % ULP_COL.length]}"></i>${esc(n)} <b>${fmt(cnt[n] || 0)}</b></span>`).join('') +
      '<span>● prabayar · ◆ pascabayar</span>' +
      `<span><i style="background:#fff;border:3px solid #d6232a;box-sizing:border-box"></i>Cincin merah = potensi sangat tinggi <b>${fmt(pts.filter((p) => toLevel(p.sc.s) === 2).length)}</b></span>` +
      '<span><i style="background:#d6232a;opacity:.25"></i>Lingkaran putus-putus = titik panas</span>';
    const nP = pts.filter((p) => p.kind === 'pasca').length;
    $('dToHint').textContent = `Prabayar ${per().label}: ${fmt(pts.length - nP)} · Pascabayar ${pasca ? pasca.label : '(belum tersedia)'}: ${fmt(nP)} · warna = ULP · ukuran = tingkat potensi`
      + (TO.h === 'tampil' ? '' : ` · ${fmt(hidden)} disembunyikan (sudah diperiksa)`) + (inspErr ? ' · hasil pemeriksaan tidak dapat dimuat' : '');
    $('dToHot').innerHTML = hot.length ? hot.map((e) => `<li><button type="button" data-la="${e.la}" data-ln="${e.ln}" data-z="16" data-h="${e.rank - 1}"><span class="to-rank">${e.rank}</span><span><b>${e.n} pelanggan</b> · ${e.hi} sangat tinggi<small>${esc(Object.entries(e.u).sort((a, b) => b[1] - a[1])[0][0])} · skor ${fmt(e.sum)}</small></span></button></li>`).join('') : '<li class="hint">Belum ada area dengan ≥ 3 pelanggan.</li>';
    const topc = pts.slice().sort(ptCmp).slice(0, 15);
    document.querySelector('#dToTopH').textContent = TO.o === 'daya' ? 'Prioritas 1: tidak beli token, daya terbesar' : 'Pelanggan potensi tertinggi';
    $('dToTop').innerHTML = topc.map((p, i) => `<li><button type="button" data-la="${p.la}" data-ln="${p.ln}" data-z="18"><span class="to-rank" style="background:${LVC[toLevel(p.sc.s)]}">${i + 1}</span><span><b>${esc(p.nm || '-')}</b> · skor ${p.sc.s}<small>${esc(p.u)} · ${fmt(p.dy)} VA · ${esc(p.sub)}</small></span></button></li>`).join('');
    $('dToNote').textContent = 'Skor potensi (maks. 90) = lama tidak beli token (≥6 bln 40 · 5 bln 30 · 4 bln 20 · lainnya 10) + daya (≥3.500 VA 25 · ≥2.200 15 · ≥1.300 8 · lainnya 3) + belum ada CT 15 + pernah ada temuan P2TL 10. ' +
      'Sangat tinggi ≥ 65, tinggi 50–64. Skor ini alat bantu memilih TO, bukan bukti pelanggaran; verifikasi tetap lewat pemeriksaan lapangan.';
    $('dToNote').textContent += ' Hasil pemeriksaan Normal, Temuan P2TL, dan Tidak ditemukan/kosong menyembunyikan titik selama 3 bulan (setelah itu muncul lagi bila masih masuk DLPD bulan berjalan); Tidak bisa diakses tetap tampil dengan garis putus-putus.' + (isEditor ? ' Klik titik untuk menginput hasil.' : '') + ' Pascabayar (belah ketupat): skor = penanda terberat (kWh nol 45 · stand mundur 40 · jam nyala < 40 padahal sebelumnya > 40 = 40 · <40 jam 35 · jam nyala anjlok > 50% dari rata-rata 40 · jam nyala datar ≥ 3 bulan pada ≥ 4.400 VA (di luar PJU/P3) 20 · jam nyala 60–80 & turun ≥ 25% 20 · jam nyala 60–80 tanpa penurunan 10 · selisih >50% 25 · kVArh 20 · pecahan 15 · jam nyala >600 15 · >400 10) + 5 per penanda tambahan (maks. 15) + daya (sama seperti prabayar) + 10 bila bulan lalu juga tidak normal. Koordinat dari file DIL' + (pasca ? `; ${fmt(pasca.nocoord)} dari ${fmt(pasca.flagged)} pelanggan ber-penanda tidak punya koordinat` + (pasca.cut ? `; ${fmt(pasca.cut)} skor terendah tidak ditampilkan` : '') : '; data pascabayar belum tersedia (' + pascaErr + ')') + '.';
  }
  async function renderTo() {
    const msg = $('dToMsg');
    if (typeof L === 'undefined') { msg.hidden = false; msg.textContent = 'Pustaka peta tidak dapat dimuat.'; return; }
    msg.hidden = false; msg.textContent = 'Memuat data pelanggan…';
    try { await ensureRows(); } catch (e) { listKey = ''; msg.textContent = 'Gagal memuat (' + e.message + ').'; return; }
    if (!pasca && !pascaErr) {
      try {
        const { data, error } = await DashAuth.sb.from('tul_data').select('data').eq('id', 'to:pasca').maybeSingle();
        if (error) throw new Error(error.message);
        if (data && data.data) pasca = data.data; else pascaErr = 'belum ada';
      } catch (e) { pascaErr = e.message; }
    }
    await loadInsp();
    msg.hidden = true;
    if (tPeriod !== T.ym) {
      tPeriod = T.ym;
      const us = per().ulp.filter((u) => u.n);
      const names = new Set(us.map((u) => u.name)); if (pasca) Object.keys(pasca.ulp_total || {}).forEach((n) => names.add(n));
      tUlpIdx = {}; [...names].sort().forEach((n, i) => { tUlpIdx[n] = i; });
      $('dToU').innerHTML = '<option value="">Semua ULP</option>' + Object.keys(tUlpIdx).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      TO.u = ''; TO.l = '0'; TO.c = ''; TO.k = ''; TO.h = ''; TO.o = 'daya'; $('dToO').value = 'daya'; $('dToL').value = '0'; $('dToC').value = ''; $('dToK').value = ''; $('dToH').value = '';
    }
    if (!tmap) {
      tmap = L.map('dToMap', { preferCanvas: true }).setView([-2.7, 118.9], 9);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(tmap);
      addLocate(tmap);
    }
    tmap.invalidateSize();
    drawTo(true);
  }

  // ---------- hasil pemeriksaan TO ----------
  let hsRows = null, hsBound = false;
  async function renderHasil() {
    const msg = $('dHsMsg');
    if (!hsBound) {
      hsBound = true;
      $('dHsH').innerHTML = '<option value="">Semua hasil</option>' + Object.entries(HASIL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
      ['dHsH', 'dHsJ', 'dHsD1', 'dHsD2'].forEach((i) => $(i).addEventListener('change', drawHasil));
      $('dHsQ').addEventListener('input', drawHasil);
      $('dHsCsv').addEventListener('click', () => {
        XlsxMini.download('hasil-pemeriksaan-to.xlsx', 'Hasil TO', ['Tanggal', 'IDPEL', 'Jenis', 'Hasil', 'Catatan', 'Penginput'],
          hsFiltered().map((r) => [r.tanggal, String(r.idpel == null ? '' : r.idpel), r.jenis === 'pasca' ? 'Pascabayar' : 'Prabayar', HASIL[r.hasil] || r.hasil, r.catatan || '', r.created_by || '']));
      });
    }
    msg.hidden = false; msg.textContent = 'Memuat hasil pemeriksaan…';
    try {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await DashAuth.sb.from('to_inspections').select('id,idpel,jenis,hasil,catatan,tanggal,created_by')
          .order('tanggal', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...data);
        if (data.length < 1000) break;
      }
      hsRows = out; msg.hidden = true;
    } catch (e) { hsRows = null; msg.textContent = 'Gagal memuat (' + e.message + ').'; return; }
    drawHasil();
  }
  function hsFiltered() {
    const h = $('dHsH').value, j = $('dHsJ').value, d1 = $('dHsD1').value, d2 = $('dHsD2').value, q = $('dHsQ').value.trim().toLowerCase();
    return (hsRows || []).filter((r) => (!h || r.hasil === h) && (!j || r.jenis === j) && (!d1 || r.tanggal >= d1) && (!d2 || r.tanggal <= d2) &&
      (!q || String(r.idpel).toLowerCase().includes(q) || (r.catatan || '').toLowerCase().includes(q)));
  }
  function drawHasil() {
    const rows = hsFiltered(), cnt = {};
    rows.forEach((r) => { cnt[r.hasil] = (cnt[r.hasil] || 0) + 1; });
    $('dHsHint').textContent = `${fmt(rows.length)} dari ${fmt((hsRows || []).length)} catatan pemeriksaan`;
    $('dHsSum').innerHTML = Object.entries(HASIL).map(([k, v]) => `<span style="margin-right:14px"><b>${fmt(cnt[k] || 0)}</b> ${esc(v)}</span>`).join('');
    const shown = rows.slice(0, 500);
    $('dHsTbl').innerHTML = '<thead><tr><th>Tanggal</th><th>IDPEL</th><th>Jenis</th><th>Hasil</th><th>Catatan</th><th>Penginput</th></tr></thead><tbody>' +
      (shown.map((r) => `<tr><td>${esc(r.tanggal)}</td><td>${esc(r.idpel)}</td><td>${r.jenis === 'pasca' ? 'Pascabayar' : 'Prabayar'}</td><td>${esc(HASIL[r.hasil] || r.hasil)}</td><td>${esc(r.catatan || '')}</td><td>${esc(r.created_by || '')}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada data.</td></tr>') +
      '</tbody>' + (rows.length > 500 ? `<tfoot><tr><td colspan="6">Menampilkan 500 teratas; persempit filter atau unduh CSV untuk semuanya (${fmt(rows.length)}).</td></tr></tfoot>` : '');
  }

  // ---------- halaman ----------
  const PAGES = { ringkasan: renderRingkasan, karakter: renderKarakter, tindak: renderTindak, tren: renderTren, peta: renderPeta, to: renderTo, hasil: renderHasil, daftar: renderDaftar };
  const TITLE = { ringkasan: 'Ringkasan', karakter: 'Karakteristik pelanggan', tindak: 'Tindak lanjut (CT & P2TL)', tren: 'Tren & perubahan', peta: 'Peta pelanggan', to: 'Peta Target Operasi P2TL', hasil: 'Hasil pemeriksaan TO', daftar: 'Daftar pelanggan' };
  function renderAll() {
    if (!PAGES[T.page]) T.page = 'ringkasan';
    $('dCrumb').innerHTML = (T.page === 'to' || T.page === 'hasil' ? '<span>Pengendalian Susut</span><i>›</i><span>P2TL</span>' : '<span>Transaksi Energi</span><i>›</i><span>DLPD Prabayar</span>') + `<i>›</i><b>${TITLE[T.page]}</b>`;
    const sel = $('dPeriod');
    sel.innerHTML = D.order.map((k) => `<option value="${k}"${k === T.ym ? ' selected' : ''}>${esc(D.periods[k].label)}</option>`).join('');
    sel.hidden = D.order.length < 2 || T.page === 'tren';
    document.querySelectorAll('#dBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== T.page; });
    document.querySelectorAll('#subDlpd button[data-p], #subP2tl button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === T.page)));
    PAGES[T.page]();
    const gen = new Date(D.generated_at);
    $('dFoot').innerHTML = `Sumber: Excel DLPD Prabayar (${esc(per().files.length)} file, ${esc(per().label)}) · CT dan P2TL mengikuti kolom jmlCt dan jmlP2tl · Data diperbarui ${gen.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
    setTimeout(() => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()), 30);
  }

  const hashPage = () => { const m = location.hash.match(/^#dlpd(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'ringkasan'; };
  async function show(page, keepFilter) {
    T.page = page || hashPage();
    window.DashSetView('dlpd', T.page);
    if (!keepFilter && page) { Object.keys(F).forEach((k) => { F[k] = k === 'x' ? null : ''; }); T.pg = 0; }
    const h = '#dlpd' + (T.page === 'ringkasan' ? '' : '/' + T.page);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    $('dMsg').hidden = false; $('dMsg').textContent = 'Memuat data DLPD Prabayar…';
    $('dBody').hidden = true;
    try { await load(); } catch (e) { $('dMsg').textContent = 'Data DLPD Prabayar belum tersedia (' + e.message + ').'; return; }
    $('dMsg').hidden = true; $('dBody').hidden = false;
    if (!T.ym || !D.periods[T.ym]) T.ym = D.order[D.order.length - 1];
    renderAll();
    window.scrollTo({ top: 0 });
  }

  function init() {
    $('dPeriod').onchange = (e) => { T.ym = e.target.value; listKey = ''; Object.keys(F).forEach((k) => { F[k] = k === 'x' ? null : ''; }); T.pg = 0; renderAll(); };
    ['dKpis', 'dTdKpis', 'dTdTbl'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c],button[data-p],button[data-s],button[data-d],button[data-u]');
      if (b) openList(Object.fromEntries(['u', 'c', 'p', 's', 'd'].filter((k) => b.dataset[k]).map((k) => [k, b.dataset[k]])));
      else { const l = e.target.closest('.b-link'); if (l) openList({}); }
    }));
    const m = { dFU: 'u', dFK: 'k', dFT: 't', dFC: 'c', dFP: 'p', dFS: 's', dFD: 'd' };
    Object.entries(m).forEach(([id, k]) => { $(id).onchange = (e) => { F[k] = e.target.value; T.pg = 0; renderDetail(); }; });
    let qt = 0;
    $('dDQ').oninput = (e) => { F.q = e.target.value; T.pg = 0; clearTimeout(qt); qt = setTimeout(renderDetail, 150); };
    $('dDPrev').onclick = () => { T.pg = Math.max(0, T.pg - 1); renderDetail(); };
    $('dDNext').onclick = () => { T.pg += 1; renderDetail(); };
    $('dDCsv').onclick = csvDetail;
    ['dMU:u', 'dMC:c', 'dMI:i'].forEach((x) => { const [id, k] = x.split(':'); $(id).onchange = (e) => { M[k] = e.target.value; if (map) drawMap(true); }; });
    ['dToU:u', 'dToL:l', 'dToC:c', 'dToK:k', 'dToH:h', 'dToO:o'].forEach((x) => { const [id, k] = x.split(':'); $(id).onchange = (e) => { TO[k] = e.target.value; if (tmap) drawTo(true); }; });
    document.querySelector('#dBody .to-side').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-la]'); if (b && tmap) tmap.setView([+b.dataset.la, +b.dataset.ln], +b.dataset.z);
      if (b && b.dataset.h != null && hotCur[+b.dataset.h]) showHot(hotCur[+b.dataset.h]);
    });
    $('dToHotTbl').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-la]'); if (tr && tmap) { tmap.setView([+tr.dataset.la, +tr.dataset.ln], 18); $('dToMap').scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
    $('dToHotClose').onclick = () => { $('dToHotList').hidden = true; };
    $('dToHotXls').onclick = () => { if (hotSel) listXls(hotSel); };
    $('dToHotOrd').onchange = () => { if (hotSel && !$('dToHotList').hidden) showList(hotSel); };
    $('dToListBtn').onclick = () => { if (toPts.length) showList(toSel()); };
    $('dToListXls').onclick = () => { if (toPts.length) listXls(toSel()); };
    ['subDlpd', 'subP2tl'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]'); if (!b) return;
      document.body.classList.remove('nav-open');
      if (b.dataset.p === 'ts') window.DashTs.show(); else show(b.dataset.p);
    }));
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'dlpd') renderAll(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#dlpd') && (document.body.dataset.view !== 'dlpd' || hashPage() !== T.page)) show(); });
  }

  window.DashDlpd = { show };
  init();
})();
