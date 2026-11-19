/* Pemeliharaan Meter > Ganti Meter H+1: database harian pergantian meter + ringkasan per ULP, alasan, merek, tahun, dan kategori meter tua.
   Data: tabel Supabase tul_data, id = 'gm' (ringkasan) dan 'gml:<yyyymm>' (daftar per bulan, dibaca saat diminta).
   Diisi otomatis oleh sync_drive.py dari folder Drive "Pemeliharaan Meter/Ganti Meter H+1". Hash: #gm, #gm/<halaman> */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pc = (a, b) => (b ? a / b * 100 : 0);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  const dayShort = (d) => +d.slice(8) + ' ' + MON[+d.slice(5, 7) - 1];
  const RED = () => css('--down') || '#d6453a';

  const T = { page: 'ringkasan', ym: null, pg: 0 };
  const F = { u: '', a: '', m: '', j: '', t: '', d: '', q: '' };
  let D = null, loading = null, rows = [], cols = [], allRows = [], listKey = '';
  const charts = {}, docs = new Map(), PAGE = 100;

  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'gm').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.order || []).length) throw new Error('belum ada data');
          return (D = data.data);
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }
  const per = () => D.months[T.ym];

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
  const axisCommon = () => ({ axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } });
  const cnt = (v) => (v >= 1e3 ? fmt(v / 1e3, 1) + ' rb' : fmt(v));

  // batang mendatar bertumpuk: tua (merah) + bukan tua
  function hstack(id, items) {
    $(id).style.height = (70 + items.length * 34) + 'px';
    chart(id).setOption(Object.assign(base(), {
      color: [RED(), css('--s1')],
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 56, top: 32, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ps.map((x) => ttRow(x.seriesName, fmt(x.value), x.color)).join('') + ttRow('Jumlah', fmt(ps.reduce((s, x) => s + x.value, 0))) }),
      xAxis: { type: 'value', minInterval: 1, axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((x) => x.name) }, axisCommon()),
      series: [
        { name: 'Kategori tua', type: 'bar', stack: 'a', barMaxWidth: 18, data: items.map((x) => x.tua) },
        { name: 'Bukan tua / tidak diketahui', type: 'bar', stack: 'a', barMaxWidth: 18, itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => fmt(items[p.dataIndex].n) }, data: items.map((x) => x.n - x.tua) },
      ],
    }), true);
  }
  function hbar(id, items, color) {
    $(id).style.height = (56 + items.length * 34) + 'px';
    chart(id).setOption(Object.assign(base(), {
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ttRow('Jumlah', fmt(ps[0].value), color) }),
      xAxis: { type: 'value', minInterval: 1, axisLabel: { color: css('--muted'), fontSize: 11, formatter: cnt }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: Object.assign({ type: 'category', inverse: true, data: items.map((x) => x.name) }, axisCommon()),
      series: [{ type: 'bar', barMaxWidth: 18, itemStyle: { color, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => fmt(p.value) }, data: items.map((x) => x.n) }],
    }), true);
  }
  // kolom tegak bertumpuk (per hari / per tahun)
  function vstack(id, cats, tua, bukan, h) {
    $(id).style.height = h + 'px';
    chart(id).setOption(Object.assign(base(), {
      color: [RED(), css('--s1')],
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => `<b>${esc(ps[0].name)}</b>` + ps.map((x) => ttRow(x.seriesName, fmt(x.value), x.color)).join('') + ttRow('Jumlah', fmt(ps.reduce((s, x) => s + x.value, 0))) }),
      xAxis: Object.assign({ type: 'category', data: cats }, axisCommon()),
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: css('--muted'), fontSize: 11 }, splitLine: { lineStyle: { color: css('--grid') } } },
      series: [{ name: 'Kategori tua', type: 'bar', stack: 'a', barMaxWidth: 28, data: tua }, { name: 'Bukan tua / tidak diketahui', type: 'bar', stack: 'a', barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: bukan }],
    }), true);
  }

  // ---------- kartu ----------
  const ICON = {
    n: 'M19.4 12.9a7 7 0 0 0 0-1.8l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.6-.9L15.2 4h-4l-.4 2.3a7 7 0 0 0-1.6.9l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 1.8l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.6.9l.4 2.3h4l.4-2.3a7 7 0 0 0 1.6-.9l2.3 1 2-3.4zM13.2 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z', warn: 'M12 2 1 21h22zm1 16h-2v-2h2zm0-4h-2V9h2z', ok: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8z',
    cal: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v10H5V10z',
  };
  const go = (o) => Object.entries(o).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const kpiHtml = (defs) => defs.map((d, i) =>
    `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON[d.i]}"/></svg></span><div class="lbl">${d.l}</div></div>` +
    `<div class="val">${d.s != null ? d.s : fmt(d.v)}<small>${d.u || ''}</small></div><div class="ytd">${d.sub}${d.go && d.v ? ` · <button type="button" class="b-link"${go(d.go)}>Lihat daftar ›</button>` : ''}</div></div>`).join('');
  const lastDay = () => { const m = per(); return D.days.find((x) => x.d === m.last); };

  function renderRingkasan() {
    const m = per(), n = m.n, ld = lastDay();
    $('gMeta').innerHTML = `<span class="chip">Periode ${esc(m.label)}</span><span class="chip">${fmt(m.hari)} hari ada data</span><span class="chip">${esc(dayShort(m.first))} – ${esc(dayShort(m.last))}</span><span class="chip">${fmt(D.files)} file Excel</span>`;
    $('gKpis').innerHTML = kpiHtml([
      { i: 'n', l: 'Total ganti meter', v: n, u: 'meter', sub: `${esc(m.label)} · ${fmt(m.hari)} hari ada data` },
      { i: 'cal', l: `Hari terakhir (${esc(dayShort(m.last))})`, v: ld ? ld.n : 0, u: 'meter', sub: `${fmt(ld ? ld.tua : 0)} kategori tua` },
      { i: 'warn', l: 'Kategori tua', v: m.tua, u: 'meter', sub: `${fmt(pc(m.tua, n), 1)}% dari pergantian`, go: { t: 'tua' } },
      { i: 'bolt', l: 'Prabayar', v: m.pra, u: 'meter', sub: `${fmt(m.tua_pra)} tua (usia > ${D.rule.Prabayar} th)`, go: { j: 'Prabayar' } },
      { i: 'bolt', l: 'Pascabayar', v: m.pasca, u: 'meter', sub: `${fmt(m.tua_pasca)} tua (usia > ${D.rule.Pascabayar} th)`, go: { j: 'Pascabayar' } },
      { i: 'ok', l: 'Alasan "Program meter tua" belum memenuhi kriteria', v: m.program_tua.bukan, u: 'meter', sub: `dari ${fmt(m.program_tua.n)} program meter tua`, go: null },
    ]);
    $('gNote').innerHTML = (m.tera ? `<div class="s-msg b-note">${fmt(m.tera)} meter lama tidak punya tahun buat di data, jadi usianya dihitung dari <b>tahun tera</b> (usia sebenarnya sama atau lebih tua). Ditandai "tera" di daftar pelanggan.</div>` : '') +
      (m.unk ? `<div class="s-msg b-note">${fmt(m.unk)} meter tidak bisa dinilai tua/tidaknya karena tahun buat dan tahun tera sama-sama kosong.</div>` : '');
    const days = D.days.filter((x) => x.d.slice(0, 7).replace('-', '') === T.ym);
    vstack('gChDay', days.map((x) => dayShort(x.d)), days.map((x) => x.tua), days.map((x) => x.n - x.tua), 300);
    hstack('gChUlp', m.ulp.filter((u) => u.n).map((u) => ({ name: u.name, n: u.n, tua: u.tua })));
    const btn = (v, o) => (v ? `<button type="button" class="qb"${go(o)}><b>${fmt(v)}</b></button>` : '<span class="qb"><b>0</b></span>');
    const row = (name, x, cls, u) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(name)}</td><td class="qc">${btn(x.n, { u })}</td><td>${fmt(x.pra)}</td><td>${fmt(x.pasca)}</td><td class="qc">${btn(x.tua, { u, t: 'tua' })}</td><td>${fmt(pc(x.tua, x.n), 1)}%</td></tr>`;
    $('gUlpTbl').innerHTML = '<thead><tr><th>ULP</th><th>Total</th><th>Prabayar</th><th>Pascabayar</th><th>Kategori tua</th><th>% tua</th></tr></thead><tbody>' +
      m.ulp.map((u) => row(u.name, u, '', u.name)).join('') + row('UP3 Mamuju', { n, pra: m.pra, pasca: m.pasca, tua: m.tua }, 'tot', '') + '</tbody>';
    shareGm(m, ld);
  }

  function shareGm(m, ld) {
    const C = DashShare.COL, L = (k, v) => `${k} : ${v}`;
    const text = [`*GANTI METER H+1* — ${m.label}`, `Data sampai ${dayLabel(m.last)} · UP3 Mamuju`, '', L('Total ganti meter', fmt(m.n)), L(`Hari terakhir (${dayShort(m.last)})`, fmt(ld ? ld.n : 0)),
      L('Kategori tua', `${fmt(m.tua)} (${fmt(pc(m.tua, m.n), 1)}%)`), L('Prabayar', `${fmt(m.pra)} (tua ${fmt(m.tua_pra)})`), L('Pascabayar', `${fmt(m.pasca)} (tua ${fmt(m.tua_pasca)})`), '', '*PER ULP*']
      .concat(m.ulp.filter((u) => u.n).map((u) => `${u.name} : ${fmt(u.n)} (tua ${fmt(u.tua)})`)).concat(['', '*ALASAN TERBANYAK*']).concat(m.alasan.slice(0, 5).map((a) => `${a.name} : ${fmt(a.n)}`))
      .concat(['', `Kriteria tua: usia meter lama > ${D.rule.Prabayar} th (prabayar), > ${D.rule.Pascabayar} th (pascabayar)`]).join('\n');
    DashShare.set($('gShare'), {
      title: 'Ganti Meter H+1', subtitle: `UP3 Mamuju · ${m.label} · data sampai ${dayShort(m.last)}`, tag: 'Pemeliharaan Meter', file: `ganti-meter-${m.ym}`, foot: 'Sumber: Monitoring Ganti Meter H+1 · PLN UP3 Mamuju · Dashboard TE', text,
      hero: [
        { t: 'Total ganti meter', u: 'meter', v: fmt(m.n), s: `${fmt(m.hari)} hari ada data`, c: C.BLUE },
        { t: 'Kategori tua', u: 'meter', v: fmt(m.tua), s: fmt(pc(m.tua, m.n), 1) + '% dari pergantian', c: C.RED },
        { t: `Hari terakhir (${dayShort(m.last)})`, u: 'meter', v: fmt(ld ? ld.n : 0), s: `${fmt(ld ? ld.tua : 0)} kategori tua`, c: C.GRN },
      ],
      tilesTitle: 'Rincian',
      tiles: [{ t: 'Prabayar', v: fmt(m.pra), u: `tua ${fmt(m.tua_pra)}`, c: C.BLUE }, { t: 'Pascabayar', v: fmt(m.pasca), u: `tua ${fmt(m.tua_pasca)}`, c: C.VIO },
        { t: 'Program meter tua', v: fmt(m.program_tua.n), u: 'pergantian', c: C.AMB }, { t: 'Alasan terbanyak', v: (m.alasan[0] || { name: '–' }).name.length > 14 ? (m.alasan[0].name.slice(0, 13) + '…') : (m.alasan[0] || { name: '–' }).name, u: m.alasan[0] ? fmt(m.alasan[0].n) + ' meter' : '', c: C.ORG },
        { t: 'ULP terbanyak', v: (() => { const u = m.ulp.slice().sort((a, b) => b.n - a.n)[0]; return u ? u.name.replace('ULP ', '') : '–'; })(), u: 'meter', c: C.GRN }],
    });
  }

  // ---------- alasan ----------
  function renderAlasan() {
    const m = per();
    hstack('gChAlasan', m.alasan.map((a) => ({ name: a.name, n: a.n, tua: a.tua })));
    const al = m.alasan, ulp = m.ulp.filter((u) => u.n);
    const btn = (v, o) => (v ? `<button type="button" class="qb"${go(o)}><b>${fmt(v)}</b></button>` : '<span class="qb muted">–</span>');
    $('gAlTbl').innerHTML = `<thead><tr><th>ULP</th>${al.map((a) => `<th title="${esc(a.name)}">${esc(a.name)}</th>`).join('')}<th>Total</th></tr></thead><tbody>` +
      ulp.map((u) => `<tr><td>${esc(u.name)}</td>${al.map((a) => `<td class="qc">${btn((m.ulp_alasan[u.code] || {})[a.name] || 0, { u: u.name, a: a.name })}</td>`).join('')}<td><b>${fmt(u.n)}</b></td></tr>`).join('') +
      `<tr class="tot"><td>UP3 Mamuju</td>${al.map((a) => `<td class="qc">${btn(a.n, { a: a.name })}</td>`).join('')}<td>${fmt(m.n)}</td></tr></tbody>`;
  }

  // ---------- merek & tahun ----------
  function renderMerek() {
    const m = per();
    hstack('gChMerekL', m.merek_lama.map((x) => ({ name: x.name, n: x.n, tua: x.tua })));
    hbar('gChMerekB', m.merek_baru, css('--s3'));
    const ty = m.tahun_lama.filter((x) => x.y);
    vstack('gChTahun', ty.map((x) => String(x.y) + (x.tera ? '*' : '')), ty.map((x) => x.tua), ty.map((x) => x.n - x.tua), 320);
    const unk = m.tahun_lama.find((x) => !x.y);
    $('gTahunHint').textContent = `Tahun buat meter lama${m.tera ? ' · tanda * = sebagian memakai tahun tera karena tahun buat kosong' : ''}${unk ? ` · ${fmt(unk.n)} meter tanpa tahun` : ''}`;
    const mt = m.merek_tahun, yrs = mt.years;
    $('gMtTbl').innerHTML = `<thead><tr><th>Merek lama</th>${yrs.map((y) => `<th>${y}</th>`).join('')}<th>Tanpa tahun</th></tr></thead><tbody>` +
      mt.rows.map((r) => `<tr><td>${esc(r.name)}</td>${yrs.map((y) => `<td>${r.by[y] ? fmt(r.by[y]) : '<span class="muted">·</span>'}</td>`).join('')}<td>${r.unk ? fmt(r.unk) : '<span class="muted">·</span>'}</td></tr>`).join('') + '</tbody>';
  }

  // ---------- meter tua ----------
  function renderTua() {
    const m = per(), n = m.n;
    $('gRule').innerHTML = `<b>Kriteria meter tua:</b> usia meter lama &gt; <b>${D.rule.Prabayar} tahun</b> untuk <b>prabayar</b> dan &gt; <b>${D.rule.Pascabayar} tahun</b> untuk <b>pascabayar</b>. ` +
      `Usia = tahun ganti meter − tahun buat meter lama (bila tahun buat kosong dipakai tahun tera). Prabayar/pascabayar ditentukan dari kolom <b>kdpembmeter</b> (kode P = prabayar).`;
    $('gTuaKpis').innerHTML = kpiHtml([
      { i: 'warn', l: 'Kategori tua', v: m.tua, u: 'meter', sub: `${fmt(pc(m.tua, n), 1)}% dari ${fmt(n)} pergantian`, go: { t: 'tua' } },
      { i: 'bolt', l: 'Prabayar tua', v: m.tua_pra, u: 'meter', sub: `${fmt(pc(m.tua_pra, m.pra), 1)}% dari ${fmt(m.pra)} prabayar`, go: { j: 'Prabayar', t: 'tua' } },
      { i: 'bolt', l: 'Pascabayar tua', v: m.tua_pasca, u: 'meter', sub: `${fmt(pc(m.tua_pasca, m.pasca), 1)}% dari ${fmt(m.pasca)} pascabayar`, go: { j: 'Pascabayar', t: 'tua' } },
      { i: 'ok', l: 'Tidak bisa dinilai', v: m.unk, u: 'meter', sub: 'Tahun buat dan tera kosong', go: { t: 'unk' } },
    ]);
    hstack('gChTuaUlp', m.ulp.filter((u) => u.n).map((u) => ({ name: u.name, n: u.n, tua: u.tua })));
    const pt = m.program_tua;
    $('gProg').innerHTML = pt.n ? `Dari <b>${fmt(pt.n)}</b> pergantian beralasan <b>"Program meter tua"</b>: <b>${fmt(pt.tua)}</b> memenuhi kriteria tua, <b>${fmt(pt.bukan)}</b> belum memenuhi kriteria` + (pt.unk ? `, ${fmt(pt.unk)} tidak bisa dinilai` : '') +
      '. Meter yang belum memenuhi kriteria biasanya berusia tepat di batas (mis. prabayar 10 tahun).' : 'Tidak ada pergantian dengan alasan "Program meter tua" pada periode ini.';
    const B = ['0 – 5 tahun', '6 – 10 tahun', '11 – 15 tahun', '> 15 tahun', 'Tidak diketahui'], g = (b, j) => (m.usia.find((x) => x.name === b && x.jenis === j) || { n: 0 }).n;
    $('gUsiaTbl').innerHTML = '<thead><tr><th>Usia meter lama</th><th>Prabayar</th><th>Pascabayar</th><th>Total</th></tr></thead><tbody>' +
      B.filter((b) => g(b, 'Prabayar') || g(b, 'Pascabayar')).map((b) => `<tr><td>${b}</td><td>${fmt(g(b, 'Prabayar'))}</td><td>${fmt(g(b, 'Pascabayar'))}</td><td><b>${fmt(g(b, 'Prabayar') + g(b, 'Pascabayar'))}</b></td></tr>`).join('') + '</tbody>';
  }

  // ---------- harian ----------
  function renderHarian() {
    const m = per(), y = +T.ym.slice(0, 4), mo = +T.ym.slice(4), end = T.ym === D.order[D.order.length - 1] ? +D.latest.slice(8) : new Date(y, mo, 0).getDate();
    const by = Object.fromEntries(D.days.map((x) => [x.d, x]));
    const ulps = m.ulp.filter((u) => u.n), list = [];
    for (let d = 1; d <= end; d++) { const k = `${T.ym.slice(0, 4)}-${T.ym.slice(4)}-${String(d).padStart(2, '0')}`; list.push([k, by[k]]); }
    const miss = list.filter((x) => !x[1]).length;
    $('gHrNote').innerHTML = miss ? `<div class="s-msg b-note">${fmt(miss)} tanggal tidak ada data (ditandai "–"). Bisa berarti file hari itu belum diunggah ke Drive, atau memang tidak ada pergantian meter.</div>` : '';
    $('gHrTbl').innerHTML = `<thead><tr><th>Tanggal</th>${ulps.map((u) => `<th>${esc(u.name.replace('ULP ', ''))}</th>`).join('')}<th>Total</th><th>Prabayar</th><th>Pascabayar</th><th>Tua</th></tr></thead><tbody>` +
      list.slice().reverse().map(([k, x]) => (x ? `<tr><td>${esc(dayLabel(k))}</td>${ulps.map((u) => `<td>${x.ulp[u.code] ? fmt(x.ulp[u.code]) : '<span class="muted">·</span>'}</td>`).join('')}<td><b>${fmt(x.n)}</b></td><td>${fmt(x.pra)}</td><td>${fmt(x.pasca)}</td><td>${fmt(x.tua)}</td></tr>`
        : `<tr class="gap"><td>${esc(dayLabel(k))}</td><td colspan="${ulps.length + 4}" class="muted">– tidak ada data</td></tr>`)).join('') +
      `<tr class="tot"><td>Total bulan</td>${ulps.map((u) => `<td>${fmt(u.n)}</td>`).join('')}<td>${fmt(m.n)}</td><td>${fmt(m.pra)}</td><td>${fmt(m.pasca)}</td><td>${fmt(m.tua)}</td></tr></tbody>`;
  }

  // ---------- daftar ----------
  const LABEL = { tgl: 'Tanggal', idpel: 'ID pelanggan', nama: 'Nama', alamat: 'Alamat', ulp: 'ULP', kec: 'Kecamatan', kel: 'Kelurahan', tarif: 'Tarif', daya: 'Daya (VA)', jenis: 'Jenis', alasan: 'Alasan ganti meter',
    merek_lama: 'Merek lama', type_lama: 'Tipe lama', no_lama: 'No. meter lama', thbuat_lama: 'Tahun buat lama', thtera_lama: 'Tahun tera lama', usia: 'Usia (th)', sumber: 'Sumber tahun', tua: 'Kategori tua',
    merek_baru: 'Merek baru', type_baru: 'Tipe baru', no_baru: 'No. meter baru', thbuat_baru: 'Tahun buat baru', petugas: 'Petugas' };
  const NUM = new Set(['daya', 'thbuat_lama', 'thtera_lama', 'usia', 'thbuat_baru']);
  const SHOW = ['tgl', 'idpel', 'nama', 'alamat', 'ulp', 'jenis', 'alasan', 'merek_lama', 'thbuat_lama', 'usia', 'tua', 'merek_baru', 'petugas'];
  const col = (k) => cols.indexOf(k);
  async function ensureRows() {
    if (listKey === T.ym) return;
    const id = `gml:${T.ym}`;
    if (!docs.has(id)) {
      const { data, error } = await DashAuth.sb.from('tul_data').select('data').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('daftar belum tersedia — tunggu sinkron berikutnya');
      docs.set(id, data.data);
    }
    const d = docs.get(id); cols = d.cols; allRows = d.rows; listKey = T.ym;
    const opts = (k, all) => `<option value="">${all}</option>` + [...new Set(allRows.map((r) => r[col(k)]))].filter(Boolean).sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    $('gFU').innerHTML = opts('ulp', 'Semua ULP'); $('gFA').innerHTML = opts('alasan', 'Semua alasan'); $('gFM').innerHTML = opts('merek_lama', 'Semua merek');
    $('gFD').innerHTML = opts('tgl', 'Semua tanggal');
  }
  function applyFilter() {
    const q = F.q.trim().toLowerCase(), c = col, tuaOk = (v) => (F.t === 'tua' ? v === 1 : F.t === 'bukan' ? v === 0 : F.t === 'unk' ? v == null : true);
    rows = allRows.filter((r) => (!F.u || r[c('ulp')] === F.u) && (!F.a || r[c('alasan')] === F.a) && (!F.m || r[c('merek_lama')] === F.m) && (!F.j || r[c('jenis')] === F.j) &&
      (!F.d || r[c('tgl')] === F.d) && tuaOk(r[c('tua')]) && (!q || [r[c('idpel')], r[c('nama')], r[c('alamat')], r[c('no_lama')], r[c('no_baru')]].some((v) => String(v).toLowerCase().includes(q))));
  }
  function syncUi() {
    Object.entries({ gFU: 'u', gFA: 'a', gFM: 'm', gFJ: 'j', gFT: 't', gFD: 'd' }).forEach(([id, k]) => { $(id).value = F[k]; });
    $('gDQ').value = F.q;
  }
  function renderDetail() {
    applyFilter();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE)); T.pg = Math.min(T.pg, pages - 1);
    const idx = SHOW.map(col);
    const cell = (k, v, r) => (k === 'tua' ? (v === 1 ? '<b style="color:var(--down)">Tua</b>' : v === 0 ? 'Tidak' : '–')
      : k === 'thbuat_lama' ? (v ? String(v) : r[col('thtera_lama')] ? r[col('thtera_lama')] + '*' : '–') : v == null || v === '' ? '–' : k === 'daya' ? fmt(v) : esc(v));
    $('gDTbl').innerHTML = `<thead><tr>${SHOW.map((k) => `<th${NUM.has(k) ? '' : ' class="l"'}>${esc(k === 'thbuat_lama' ? 'Tahun buat lama' : LABEL[k])}</th>`).join('')}</tr></thead><tbody>` +
      rows.slice(T.pg * PAGE, T.pg * PAGE + PAGE).map((r) => '<tr>' + SHOW.map((k, j) => `<td${NUM.has(k) ? '' : ' class="l"'}>${cell(k, r[idx[j]], r)}</td>`).join('') + '</tr>').join('') +
      (rows.length ? '' : `<tr><td class="l" colspan="${SHOW.length}">Tidak ada data yang cocok.</td></tr>`) + '</tbody>';
    $('gDHint').textContent = `${per().label} · ${fmt(rows.length)} dari ${fmt(allRows.length)} pergantian · * = memakai tahun tera karena tahun buat kosong`;
    $('gDPage').textContent = `Halaman ${T.pg + 1} dari ${pages}`;
    $('gDPrev').disabled = T.pg === 0; $('gDNext').disabled = T.pg >= pages - 1; $('gDCsv').disabled = !rows.length;
  }
  async function renderDaftar() {
    $('gDMsg').hidden = false; $('gDMsg').textContent = 'Memuat daftar…'; $('gDTbl').innerHTML = '';
    try { await ensureRows(); } catch (e) { listKey = ''; $('gDMsg').textContent = 'Gagal memuat (' + e.message + ').'; return; }
    $('gDMsg').hidden = true; syncUi(); renderDetail();
  }
  function csvDetail() {
    if (!rows.length) return;
    const txt = (v) => { v = v == null ? '' : String(v).replace(/"/g, '""'); return '"' + (/^[=+\-@]/.test(v) ? "'" + v : v) + '"'; };
    const lines = [cols.map((k) => LABEL[k] || k).join(';')].concat(rows.map((r) => cols.map((k, i) => { const v = r[i]; return k === 'idpel' || k === 'no_lama' || k === 'no_baru' ? '="' + v + '"' : k === 'tua' ? (v == null ? '' : v ? 'Tua' : 'Tidak') : NUM.has(k) ? (v == null ? '' : String(v)) : txt(v); }).join(';')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `Ganti_Meter_${T.ym}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function openList(o) {
    Object.keys(F).forEach((k) => { F[k] = ''; }); Object.entries(o).forEach(([k, v]) => { F[k] = v; }); T.pg = 0;
    show('daftar', true);
  }

  // ---------- halaman ----------
  const PAGES = { ringkasan: renderRingkasan, alasan: renderAlasan, merek: renderMerek, tua: renderTua, harian: renderHarian, daftar: renderDaftar };
  const TITLE = { ringkasan: 'Ringkasan', alasan: 'Alasan penggantian', merek: 'Merek & tahun meter', tua: 'Meter tua', harian: 'Data harian', daftar: 'Daftar pergantian' };
  function renderAll() {
    if (!PAGES[T.page]) T.page = 'ringkasan';
    $('gCrumb').innerHTML = `<span>Pemeliharaan Meter</span><i>›</i><span>Ganti Meter H+1</span><i>›</i><b>${TITLE[T.page]}</b>`;
    $('gPeriod').innerHTML = D.order.map((k) => `<option value="${k}"${k === T.ym ? ' selected' : ''}>${esc(D.months[k].label)}</option>`).join('');
    $('gPeriod').hidden = D.order.length < 2;
    document.querySelectorAll('#gBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== T.page; });
    document.querySelectorAll('#subGm button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === T.page)));
    PAGES[T.page]();
    $('gFoot').innerHTML = `Sumber: Excel Monitoring Ganti Meter H+1 (${fmt(D.files)} file, ${fmt(D.total)} pergantian, data terakhir ${esc(dayLabel(D.latest))}) · Data diperbarui ${new Date(D.generated_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
    setTimeout(() => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()), 30);
  }
  const hashPage = () => { const m = location.hash.match(/^#gm(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'ringkasan'; };
  async function show(page, keep) {
    window.DashSetView('gm');
    T.page = page || hashPage();
    if (!keep && page) { Object.keys(F).forEach((k) => { F[k] = ''; }); T.pg = 0; }
    const h = '#gm' + (T.page === 'ringkasan' ? '' : '/' + T.page);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    $('gMsg').hidden = false; $('gMsg').textContent = 'Memuat data Ganti Meter H+1…'; $('gBody').hidden = true;
    try { await load(); } catch (e) { $('gMsg').textContent = 'Data Ganti Meter H+1 belum tersedia (' + e.message + ').'; return; }
    $('gMsg').hidden = true; $('gBody').hidden = false;
    if (!T.ym || !D.months[T.ym]) T.ym = D.order[D.order.length - 1];
    renderAll(); window.scrollTo({ top: 0 });
  }

  function init() {
    $('gPeriod').onchange = (e) => { T.ym = e.target.value; listKey = ''; Object.keys(F).forEach((k) => { F[k] = ''; }); T.pg = 0; renderAll(); };
    ['gKpis', 'gTuaKpis', 'gUlpTbl', 'gAlTbl'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-u],button[data-a],button[data-j],button[data-t],.b-link'); if (!b) return;
      openList(Object.fromEntries(['u', 'a', 'j', 't'].filter((k) => b.dataset[k]).map((k) => [k, b.dataset[k]])));
    }));
    Object.entries({ gFU: 'u', gFA: 'a', gFM: 'm', gFJ: 'j', gFT: 't', gFD: 'd' }).forEach(([id, k]) => { $(id).onchange = (e) => { F[k] = e.target.value; T.pg = 0; renderDetail(); }; });
    let qt = 0;
    $('gDQ').oninput = (e) => { F.q = e.target.value; T.pg = 0; clearTimeout(qt); qt = setTimeout(renderDetail, 150); };
    $('gDPrev').onclick = () => { T.pg = Math.max(0, T.pg - 1); renderDetail(); };
    $('gDNext').onclick = () => { T.pg += 1; renderDetail(); };
    $('gDCsv').onclick = csvDetail;
    $('subGm').addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; document.body.classList.remove('nav-open'); show(b.dataset.p); });
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'gm') renderAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#gm') && (document.body.dataset.view !== 'gm' || hashPage() !== T.page)) show(); });
  }

  window.DashGm = { show };
  init();
})();
