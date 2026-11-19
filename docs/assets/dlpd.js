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
    const txt = (v) => { v = v == null ? '' : String(v).replace(/"/g, '""'); return '"' + (/^[=+\-@]/.test(v) ? "'" + v : v) + '"'; };
    const lines = [keys.map((k) => LABEL[k] || k).join(';')].concat(rows.map((r) => keys.map((k) => { const v = r[col(cols, k)]; return k === 'idpel' || k === 'meter' ? '="' + v + '"' : NUM.has(k) ? (v == null ? '' : String(v).replace('.', ',')) : txt(v); }).join(';')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `DLPD_Prabayar_${T.ym}${F.u ? '_' + F.u.toLowerCase().replace(/[^a-z0-9]+/g, '_') : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function openList(o) {
    Object.keys(F).forEach((k) => { F[k] = k === 'x' ? null : ''; });
    Object.entries(o).forEach(([k, v]) => { F[k] = v; });
    T.pg = 0;
    show('daftar', true);
  }

  // ---------- halaman ----------
  const PAGES = { ringkasan: renderRingkasan, karakter: renderKarakter, tindak: renderTindak, tren: renderTren, daftar: renderDaftar };
  const TITLE = { ringkasan: 'Ringkasan', karakter: 'Karakteristik pelanggan', tindak: 'Tindak lanjut (CT & P2TL)', tren: 'Tren & perubahan', daftar: 'Daftar pelanggan' };
  function renderAll() {
    if (!PAGES[T.page]) T.page = 'ringkasan';
    $('dCrumb').innerHTML = `<span>Transaksi Energi</span><i>›</i><span>DLPD Prabayar</span><i>›</i><b>${TITLE[T.page]}</b>`;
    const sel = $('dPeriod');
    sel.innerHTML = D.order.map((k) => `<option value="${k}"${k === T.ym ? ' selected' : ''}>${esc(D.periods[k].label)}</option>`).join('');
    sel.hidden = D.order.length < 2 || T.page === 'tren';
    document.querySelectorAll('#dBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== T.page; });
    document.querySelectorAll('#subDlpd button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === T.page)));
    PAGES[T.page]();
    const gen = new Date(D.generated_at);
    $('dFoot').innerHTML = `Sumber: Excel DLPD Prabayar (${esc(per().files.length)} file, ${esc(per().label)}) · CT dan P2TL mengikuti kolom jmlCt dan jmlP2tl · Data diperbarui ${gen.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
    setTimeout(() => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()), 30);
  }

  const hashPage = () => { const m = location.hash.match(/^#dlpd(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'ringkasan'; };
  async function show(page, keepFilter) {
    window.DashSetView('dlpd');
    T.page = page || hashPage();
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
    $('subDlpd').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]'); if (!b) return;
      document.body.classList.remove('nav-open');
      show(b.dataset.p);
    });
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'dlpd') renderAll(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#dlpd') && (document.body.dataset.view !== 'dlpd' || hashPage() !== T.page)) show(); });
  }

  window.DashDlpd = { show };
  init();
})();
