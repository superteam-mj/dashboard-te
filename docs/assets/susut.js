/* Pengendalian Susut > Laporan Susut: menampilkan sheet Excel sebagai tabel.
   Data: tabel Supabase susut_reports & susut_sheets (diisi otomatis oleh sync_drive.py). Navigasi lewat hash: #susut/<sheet>  (#susut/Ringkasan = halaman ringkasan)  */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CH = 7.2; // px per karakter lebar kolom Excel
  let DATA = null, loading = null, TOTAL = 0;
  const S = { rep: 0, sheet: 0 };

  function setView(v) {
    document.body.dataset.view = v;
    document.querySelectorAll('#sections button[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    document.querySelectorAll('#sections .nav-group').forEach((g) => g.classList.toggle('open', g.dataset.g === v));
    const T = { susut: ['Pengendalian Susut · Laporan Susut', 'Laporan Susut — Dashboard TE'],
      transaksi: ['Transaksi Energi · Laporan TUL III-09', 'Dashboard Penjualan Listrik'],
      billing: ['Transaksi Energi · Mon Billing', 'Mon Billing — Dashboard TE'],
      dlpd: ['Transaksi Energi · DLPD Prabayar', 'DLPD Prabayar — Dashboard TE'] };
    $('subtitle').textContent = T[v][0];
    document.title = T[v][1];
    document.body.classList.remove('nav-open');
  }

  window.DashSetView = setView;

  const sheetCache = new Map();
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('susut_reports').select('file,title,modified,sheets').order('file'))
        .then(async ({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data.length) throw new Error('belum ada laporan');
          // ringkasan tersimpan sebagai "sheet" khusus idx = -1; boleh tidak ada
          const sm = await DashAuth.sb.from('susut_sheets').select('file,idx,data').in('idx', [-1, -2]);
          const rows = (sm && sm.data) || [];
          const pick = (file, idx) => { const x = rows.find((y) => y.file === file && y.idx === idx); return x ? x.data : null; };
          data.forEach((r) => { r.summary = pick(r.file, -1); r.produksi = pick(r.file, -2); });
          return (DATA = { path: ['Pengendalian Susut', 'Laporan Susut'], reports: data });
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  async function loadSheet(file, idx) {
    const key = file + '|' + idx;
    if (!sheetCache.has(key)) {
      const { data, error } = await DashAuth.sb.from('susut_sheets').select('data').eq('file', file).eq('idx', idx).maybeSingle();
      if (error || !data) throw new Error(error ? error.message : 'sheet tidak ditemukan');
      sheetCache.set(key, data.data);
    }
    return sheetCache.get(key);
  }

  function cssFor(st, i) {
    const p = [];
    if (st.b) p.push('font-weight:650');
    if (st.i) p.push('font-style:italic');
    if (st.bg) p.push('background:#' + st.bg);
    if (st.fg) p.push('color:#' + st.fg);
    if (st.al) p.push('text-align:' + { c: 'center', r: 'right', l: 'left' }[st.al]);
    if (st.w) p.push('white-space:normal');
    if (st.in) p.push('padding-left:' + (6 + st.in * 9) + 'px');
    if (st.bd) p.push('border-bottom-color:var(--axis)');
    return `.x${i}{${p.join(';')}}`;
  }

  function tableHtml(sh) {
    const [, fc] = sh.freeze;
    const frozen = fc > 0 && fc <= 4 ? fc : 0;
    const left = [];
    let acc = 0;
    for (let i = 0; i < frozen; i++) { left.push(acc); acc += Math.max(Math.round(sh.widths[i] * CH + 10), 18); }

    const px = sh.widths.map((w) => Math.max(Math.round(w * CH + 10), 18));
    TOTAL = px.reduce((a, b) => a + b, 0);
    let h = `<colgroup>${px.map((w) => `<col style="width:${w}px">`).join('')}</colgroup><tbody>`;
    for (const row of sh.rows) {
      h += '<tr>';
      let col = 0;
      for (let k = 0; k < row.length; k++) {
        const c = row[k];
        if (c === null) { h += '<td class="e"></td>'; col++; continue; }
        const [txt, sid, cs, rs, num, err] = c;
        const cls = [`x${sid}`];
        if (num) cls.push('n');
        if (err) cls.push('err');
        if (txt == null) cls.push('e');
        else if (!num && !err && cs === 1 && (k + 1 >= row.length || row[k + 1] === null || row[k + 1][0] == null)) cls.push('o');
        if (col < frozen && cs === 1) cls.push('fz');
        const st = col < frozen && cs === 1 ? ` style="left:${left[col]}px"` : '';
        h += `<td class="${cls.join(' ')}"${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${st}>${txt == null ? '' : esc(txt)}</td>`;
        col += cs;
      }
      h += '</tr>';
    }
    return h + '</tbody>';
  }

  let renderTok = 0;
  async function renderSheet() {
    const rep = DATA.reports[S.rep];
    const tok = ++renderTok;
    $('sTabs').innerHTML = (rep.summary ? `<button type="button" role="tab" class="tab-sum" aria-selected="${S.sheet === -1}" data-i="-1">Ringkasan</button>` : '') +
      rep.sheets.map((n, i) => (i === 0 && rep.produksi ? `<button type="button" role="tab" class="tab-sum" aria-selected="${S.sheet === -2}" data-i="-2">Ringkasan Produksi</button>` : '') +
        `<button type="button" role="tab" aria-selected="${i === S.sheet}" data-i="${i}">${esc(n)}</button>`).join('');
    $('subSusut').innerHTML = $('sTabs').innerHTML.replace(/ role="tab"/g, '').replace(/aria-selected/g, 'aria-current');
    const active = $('sTabs').querySelector('[aria-selected="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const isSum = (S.sheet === -1 && rep.summary) || (S.sheet === -2 && rep.produksi);
    $('sSummary').hidden = !isSum;
    $('sWrap').hidden = !!isSum;
    $('sMeta').hidden = !!isSum;
    if (isSum) { if (S.sheet === -1) renderSummary(rep.summary); else renderProduksi(rep.produksi); return; }
    disposeSummaryChart();
    $('sMeta').textContent = 'Memuat sheet…';
    let sh;
    try { sh = await loadSheet(rep.file, S.sheet); } catch (e) {
      if (tok === renderTok) $('sMeta').textContent = 'Gagal memuat sheet: ' + e.message;
      return;
    }
    if (tok !== renderTok) return;  // pengguna sudah pindah tab
    $('sStyle').textContent = sh.styles.map(cssFor).join('');
    const t = $('sTbl');
    t.innerHTML = tableHtml(sh);
    t.style.width = TOTAL + 'px';
    $('sWrap').scrollTo(0, 0);
    $('sMeta').textContent = `Sheet ${S.sheet + 1} dari ${rep.sheets.length} · ${sh.rows.length} baris`;
  }

  // ---------- Ringkasan ----------
  let sumChart = null;
  function disposeSummaryChart() { if (sumChart) { sumChart.dispose(); sumChart = null; } }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const nfm = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v) => (v == null ? '–' : nfm(2).format(v) + '%');
  const poin = (v) => nfm(2).format(Math.abs(v)) + ' poin';
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nfm(2).format(Math.abs(v));
  const gwh = (v) => (v == null ? '–' : nfm(2).format(v / 1e6) + ' GWh');
  const EPS = 0.005;
  const titleCase = (n) => n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/\bUp3\b/g, 'UP3');
  const ulpName = (n) => 'ULP ' + titleCase(n);

  function renderSummary(sm) {
    const last = sm.last, month = sm.monthsFull[last], up = sm.up3;
    const cur = up.bulanan[last], prev = last > 0 ? up.bulanan[last - 1] : null;
    const kum = up.kum != null ? up.kum : up.kumulatif[last], trg = up.trg, gap = up.gap != null ? up.gap : kum - trg;
    const over = gap > EPS;
    const unitsOver = sm.units.filter((u) => u.gap != null && u.gap > EPS).sort((a, b) => b.gap - a.gap);
    const unitsOk = sm.units.filter((u) => u.gap != null && u.gap <= EPS);

    // --- 1) kesimpulan dalam bahasa sederhana ---
    const verdict = `<section class="verdict ${over ? 'over' : 'ok'}" aria-live="polite">
      <div class="v-ico" aria-hidden="true">${over ? '⚠' : '✓'}</div>
      <div class="v-txt">
        <div class="v-title">${over ? 'Susut kumulatif belum mencapai target' : 'Susut kumulatif sudah sesuai target'}</div>
        <p>Susut distribusi ${esc(titleCase(up.name))} <b>${pct(kum)}</b> (Januari–${esc(month)} ${sm.year || ''}),
        ${over ? `<b>${poin(gap)} di atas</b>` : `<b>${poin(gap)} di bawah</b> atau sama dengan`} target <b>${pct(trg)}</b>.
        <span class="v-note">Makin kecil susut, makin baik.</span></p>
        ${sm.units.length ? `<p class="v-units">${unitsOver.length
          ? `<b>${unitsOver.length} dari ${sm.units.length} ULP di atas target:</b> ${unitsOver.map((u) => `<span class="chip-bad">${esc(titleCase(u.name))} <i>+${nfm(2).format(u.gap)}</i></span>`).join(' ')}`
          : `<b>Semua ${sm.units.length} ULP sesuai target.</b>`}
          ${unitsOk.length && unitsOver.length ? `<br><b>${unitsOk.length} ULP sesuai target:</b> ${unitsOk.map((u) => `<span class="chip-good">${esc(titleCase(u.name))}</span>`).join(' ')}` : ''}</p>` : ''}
      </div>
    </section>`;

    // --- 2) kartu angka utama ---
    const dMonth = prev != null && cur != null ? cur - prev : null;
    const pill = (d, label) => d == null ? '' : Math.abs(d) < EPS
      ? `<span class="pill flat">■ tetap <em>${label}</em></span>`
      : `<span class="pill ${d > 0 ? 'bad' : 'good'}">${d > 0 ? '▲ naik' : '▼ turun'} ${nfm(2).format(Math.abs(d))} <em>${label}</em></span>`;
    const kpis = `<section class="s-kpis">
      <div class="kpi"><div class="kpi-top"><div class="lbl">Susut bulan ${esc(month)}</div></div>
        <div class="val">${pct(cur)}</div>${pill(dMonth, 'dari bulan lalu')}</div>
      <div class="kpi"><div class="kpi-top"><div class="lbl">Susut kumulatif Jan–${esc(sm.months[last])}</div></div>
        <div class="val">${pct(kum)}</div>${pill(last > 0 ? kum - up.kumulatif[last - 1] : null, 'dari bulan lalu')}</div>
      <div class="kpi"><div class="kpi-top"><div class="lbl">Target susut</div></div>
        <div class="val">${pct(trg)}</div><span class="pill flat">sheet REKAP, kolom TRG</span></div>
      <div class="kpi"><div class="kpi-top"><div class="lbl">Selisih ke target</div></div>
        <div class="val ${over ? 'neg' : 'pos'}">${signed(gap)}<small>poin</small></div>
        <span class="pill ${over ? 'bad' : 'good'}">${over ? '▲ di atas target' : '✓ sesuai target'}</span></div>
    </section>`;

    // --- 3) tren ---
    const trend = `<section class="card s-card">
      <div class="card-head"><div><h2>Tren susut bulanan</h2><p class="hint">Persentase susut ${esc(titleCase(up.name))} per bulan, dibanding target</p></div></div>
      <div class="chart" id="sChTrend" style="height:340px"></div></section>`;

    // --- 4) tabel per unit ---
    const rows = sm.units.slice().sort((a, b) => (b.gap ?? -9) - (a.gap ?? -9)).concat([up]);
    const scale = Math.max(...rows.flatMap((r) => [r.kum || 0, r.trg || 0])) * 1.12 || 1;
    const tr = rows.map((r) => {
      const isUp = r === up, ov = r.gap != null && r.gap > EPS;
      const w = Math.min(100, ((r.kum || 0) / scale) * 100), t = Math.min(100, ((r.trg || 0) / scale) * 100);
      return `<tr class="${isUp ? 'tot' : ''}">
        <td>${esc(isUp ? titleCase(r.name) : ulpName(r.name))}</td>
        <td class="n">${pct(r.bulanan[last])}</td>
        <td class="bar-c"><div class="bullet" title="Kumulatif ${pct(r.kum)} · target ${pct(r.trg)}"><i class="fill ${ov ? 'bad' : 'good'}" style="width:${w}%"></i><b class="tick" style="left:${t}%"></b></div></td>
        <td class="n">${pct(r.kum)}</td><td class="n">${pct(r.trg)}</td>
        <td class="n ${ov ? 'neg' : 'pos'}">${r.gap == null ? '–' : signed(r.gap)}</td>
        <td><span class="st ${ov ? 'bad' : 'good'}">${ov ? '▲ Di atas target' : '✓ Sesuai target'}</span></td></tr>`;
    }).join('');
    const table = `<section class="card s-card">
      <div class="card-head"><div><h2>Susut per unit</h2><p class="hint">Diurutkan dari yang paling jauh di atas target · garis tegak pada batang = target</p></div></div>
      <div class="table-wrap"><table class="s-sum-tbl"><thead><tr>
        <th>Unit</th><th>Bulan ${esc(sm.months[last])}</th><th>Kumulatif vs target</th><th>Kumulatif</th><th>Target</th><th>Selisih</th><th>Status</th>
      </tr></thead><tbody>${tr}</tbody></table></div></section>`;

    // --- 5) energi ---
    const k = sm.kwh, at = (a) => (a ? a[last] : null);
    const netto = at(k.netto) ?? at(k.terima), siap = at(k.siap), jual = at(k.jual), sus = at(k.susut);
    const share = (v) => (netto && v != null ? ` <em>${nfm(1).format((v / netto) * 100)}% dari netto</em>` : '');
    const energi = `<section class="card s-card">
      <div class="card-head"><div><h2>Energi bulan ${esc(month)}</h2><p class="hint">Dari sheet SUSUT 2026 — alur kWh dari diterima sampai terjual</p></div></div>
      <div class="flow">
        <div class="step"><span>kWh netto distribusi</span><b>${gwh(netto)}</b><em>diterima/dibeli</em></div>
        <div class="arrow" aria-hidden="true">↓</div>
        <div class="step"><span>Siap jual</span><b>${gwh(siap)}</b>${share(siap)}</div>
        <div class="arrow" aria-hidden="true">↓</div>
        <div class="step"><span>Terjual (TUL III-09)</span><b>${gwh(jual)}</b>${share(jual)}</div>
        <div class="arrow" aria-hidden="true">↓</div>
        <div class="step loss"><span>Susut</span><b>${gwh(sus)}</b>${share(sus)}</div>
      </div></section>`;

    const help = `<details class="s-help"><summary>Cara membaca ringkasan ini</summary>
      <ul>
        <li><b>Susut (%)</b> = kWh susut ÷ kWh netto distribusi × 100 (rumus k2 pada sheet SUSUT 2026). Hasilnya makin kecil makin baik.</li>
        <li><b>Bulan ini</b> = susut bulan itu saja. <b>Kumulatif</b> = susut gabungan dari Januari sampai bulan itu.</li>
        <li><b>Target</b> dibaca dari kolom TRG sheet REKAP (basis tanpa EMIN). <b>Selisih</b> = kumulatif − target; positif berarti di atas target.</li>
        <li>Angka lengkap dan seluruh perhitungannya ada di tab-tab sheet di samping tab Ringkasan.</li>
      </ul></details>`;

    $('sSummary').innerHTML = verdict + kpis + `<div class="s-grid">${trend}${energi}</div>` + table + help;
    drawTrend(sm);
  }

  function drawTrend(sm) {
    const el = $('sChTrend');
    if (!el || !window.echarts) return;
    disposeSummaryChart();
    sumChart = echarts.init(el, null, { renderer: 'svg' });
    const n = sm.last + 1, labels = sm.months.slice(0, n), up = sm.up3;
    const c1 = css('--s1'), c2 = css('--s2'), surface = css('--surface'), ink2 = css('--ink-2'), muted = css('--muted');
    const line = (name, data, color, extra) => Object.assign({
      name, type: 'line', data, symbol: 'circle', symbolSize: 8, showSymbol: true,
      lineStyle: { width: 2, color }, itemStyle: { color, borderColor: surface, borderWidth: 2 }, emphasis: { focus: 'series' },
    }, extra || {});
    sumChart.setOption({
      animationDuration: 400,
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: ink2 },
      grid: { left: 8, right: 22, top: 46, bottom: 6, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 4, textStyle: { color: ink2, fontSize: 12 } },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: css('--axis') } },
        backgroundColor: surface, borderColor: css('--border'), textStyle: { color: css('--ink'), fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);',
        valueFormatter: (v) => (v == null ? '–' : nfm(2).format(v) + '%'),
      },
      xAxis: { type: 'category', data: labels, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: css('--axis') } }, axisLabel: { color: muted, fontSize: 11 } },
      yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: css('--grid') } }, axisLabel: { color: muted, fontSize: 11, formatter: (v) => nfm(1).format(v) + '%' } },
      series: [
        line('Susut bulanan', up.bulanan.slice(0, n), c1),
        line('Susut kumulatif', up.kumulatif.slice(0, n), c2),
        { name: 'Target', type: 'line', data: labels.map(() => up.trg), symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: muted }, itemStyle: { color: muted }, emphasis: { disabled: true } },
      ],
    });
  }

  // ---------- Ringkasan Produksi (pasokan kWh per sumber) ----------
  const gwhN = (v) => nfm(2).format(v / 1e6);
  function renderProduksi(pr) {
    const last = pr.last, month = pr.monthsFull[last];
    const cur = pr.terima[last], prev = last > 0 ? pr.terima[last - 1] : null;
    const kum = pr.terima.slice(0, last + 1).reduce((a, b) => a + b, 0);
    const kirimKum = pr.kirim.slice(0, last + 1).reduce((a, b) => a + b, 0);
    const srcs = pr.sources.map((x, i) => ({ ...x, i, now: x.v[last], was: last > 0 ? x.v[last - 1] : null, kum: x.v.slice(0, last + 1).reduce((a, b) => a + b, 0) }));
    const top = srcs.slice().sort((a, b) => b.now - a.now)[0];
    const dPct = prev ? ((cur - prev) / prev) * 100 : null;
    const arrow = (d) => (d == null ? '–' : Math.abs(d) < 0.05 ? '■ tetap' : (d > 0 ? '▲ naik ' : '▼ turun ') + nfm(1).format(Math.abs(d)) + '%');

    const verdict = `<section class="verdict info"><div class="v-ico" aria-hidden="true">⚡</div><div class="v-txt">
      <div class="v-title">Energi masuk ${esc(month)} ${pr.year}: ${gwhN(cur)} GWh</div>
      <p>Total energi yang diterima/dibeli jaringan distribusi UP3 Mamuju ${dPct == null ? '' : `<b>${arrow(dPct).replace('■ ', '')}</b> dibanding bulan lalu (${gwhN(prev)} GWh)`}.
      Sumber terbesar <b>${esc(top.name)}</b> (${nfm(1).format((top.now / cur) * 100)}% dari total).
      Kumulatif Januari–${esc(pr.months[last])}: <b>${gwhN(kum)} GWh</b>.</p></div></section>`;

    const kpis = `<section class="s-kpis">
      <div class="kpi"><div class="kpi-top"><div class="lbl">Energi diterima ${esc(month)}</div></div><div class="val">${gwhN(cur)}<small>GWh</small></div><span class="pill flat">${arrow(dPct)} <em>dari bulan lalu</em></span></div>
      <div class="kpi"><div class="kpi-top"><div class="lbl">Kumulatif Jan–${esc(pr.months[last])}</div></div><div class="val">${gwhN(kum)}<small>GWh</small></div><span class="pill flat">rata-rata ${gwhN(kum / (last + 1))} GWh/bulan</span></div>
      <div class="kpi"><div class="kpi-top"><div class="lbl">Sumber terbesar</div></div><div class="val">${esc(top.name)}</div><span class="pill flat">${gwhN(top.now)} GWh · ${nfm(1).format((top.now / cur) * 100)}%</span></div>
      <div class="kpi"><div class="kpi-top"><div class="lbl">Energi dikirim keluar ${esc(month)}</div></div><div class="val">${gwhN(pr.kirim[last])}<small>GWh</small></div><span class="pill flat">kumulatif ${gwhN(kirimKum)} GWh</span></div>
    </section>`;

    const trend = `<section class="card s-card"><div class="card-head"><div><h2>Energi diterima per bulan</h2><p class="hint">Dalam GWh, ditumpuk menurut sumber</p></div></div><div class="chart" id="sChTrend" style="height:360px"></div></section>`;

    const rows = srcs.slice().sort((a, b) => b.now - a.now).map((x) => {
      const d = x.was ? ((x.now - x.was) / x.was) * 100 : null;
      return `<tr><td><span class="dot" style="background:var(--s${x.i + 1})"></span>${esc(x.name)}</td>
        <td class="n">${gwhN(x.now)}</td><td class="n">${x.was == null ? '–' : gwhN(x.was)}</td><td class="n">${arrow(d)}</td><td class="n">${gwhN(x.kum)}</td>
        <td class="bar-c"><div class="bullet" title="${nfm(1).format((x.now / cur) * 100)}% dari total"><i class="fill" style="width:${(x.now / cur) * 100}%;background:var(--s${x.i + 1})"></i></div></td>
        <td class="n">${nfm(1).format((x.now / cur) * 100)}%</td></tr>`;
    }).join('');
    const table = `<section class="card s-card"><div class="card-head"><div><h2>Pasokan per sumber</h2><p class="hint">Angka dalam GWh · sumber: sheet SUSUT 2026 (kWh terima/beli distribusi)</p></div></div>
      <div class="table-wrap"><table class="s-sum-tbl"><thead><tr><th>Sumber</th><th>${esc(pr.months[last])}</th><th>${last > 0 ? esc(pr.months[last - 1]) : ''}</th><th>Perubahan</th><th>Kumulatif</th><th>Porsi bulan ini</th><th></th></tr></thead>
      <tbody>${rows}<tr class="tot"><td>Total diterima</td><td class="n">${gwhN(cur)}</td><td class="n">${prev == null ? '–' : gwhN(prev)}</td><td class="n">${arrow(dPct)}</td><td class="n">${gwhN(kum)}</td><td></td><td class="n">100%</td></tr></tbody></table></div></section>`;

    const help = `<details class="s-help"><summary>Cara membaca ringkasan ini</summary><ul>
      <li><b>Energi diterima</b> = kWh terima/beli distribusi (huruf D pada SUSUT 2026): energi dari GI (Polewali, Majene, Mamuju, Mamuju Baru, Topoyo, Pasangkayu), UPDK Bakaru, dan lainnya (UP3 tetangga, IPP 150 kV, PLTD sewa).</li>
      <li><b>Dikirim keluar</b> = kWh yang disalurkan ke unit lain (huruf E), tidak termasuk dalam penjualan UP3 Mamuju.</li>
      <li>Naik/turun di sini hanya menunjukkan perubahan volume, bukan baik/buruk. Data stand meter mentah ada di tab KWH PRODUKSI.</li></ul></details>`;

    const svg = infographicSvg(pr, srcs);
    const info = `<section class="card s-card info-card"><div class="card-head"><div><h2>Infografis untuk presentasi</h2><p class="hint">Gambar 16:9 (1920×1080) berisi ringkasan dan seluruh titik transaksi — klik Salin gambar lalu tempel (Ctrl+V) di PowerPoint</p></div>
      <div class="tools"><button type="button" class="btn" id="infoCopy">Salin gambar</button><button type="button" class="btn ghost" id="infoDl">Unduh PNG</button></div></div>
      <div class="info-wrap">${svg}</div></section>`;
    $('sSummary').innerHTML = verdict + kpis + info + trend + table + help;
    wireInfographic(svg, `infografis-produksi-${month.toLowerCase()}-${pr.year}.png`);
    drawProduksi(pr, srcs);
  }

  // ---------- Infografis (gambar 16:9 untuk PowerPoint) ----------
  const IW = 1920, IH = 1080;
  const IC = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  function infographicSvg(pr, srcs) {
    const last = pr.last, month = pr.monthsFull[last];
    const INK = '#0f172a', MUT = '#64748b', LINE = '#e2e8f0', CARD = '#f1f5f9', FONT = "Inter, 'Segoe UI', Arial, sans-serif";
    const gw = (v) => nfm(2).format(v / 1e6);
    const mw = (v) => (!v || Math.abs(v) < 0.005 ? '–' : nfm(2).format(v / 1000));
    const sum = (a) => a.slice(0, last + 1).reduce((x, y) => x + y, 0);
    const cur = pr.terima[last], prev = last > 0 ? pr.terima[last - 1] : null, kum = sum(pr.terima);
    const dP = prev ? ((cur - prev) / prev) * 100 : null;
    const top = srcs.slice().sort((a, b) => b.now - a.now)[0];
    const T = (x, y, txt, o = {}) => `<text x="${x}" y="${y}" font-size="${o.s || 16}" font-weight="${o.w || 400}" fill="${o.c || INK}" text-anchor="${o.a || 'start'}">${esc(txt)}</text>`;
    const o = [];
    o.push(`<rect width="${IW}" height="${IH}" fill="#ffffff"/><rect width="${IW}" height="10" fill="${IC[0]}"/>`);
    o.push(T(48, 66, `Pasokan Energi UP3 Mamuju — ${month} ${pr.year}`, { s: 40, w: 750 }));
    o.push(T(48, 98, 'kWh terima/beli distribusi menurut sumber dan seluruh titik transaksi', { s: 18, c: MUT }));

    // kartu angka (kiri)
    const cards = [
      ['Energi diterima ' + month, gw(cur) + ' GWh', dP == null ? '' : (dP >= 0 ? '▲ naik ' : '▼ turun ') + nfm(1).format(Math.abs(dP)) + '% dari ' + pr.monthsFull[last - 1]],
      ['Kumulatif Jan–' + pr.months[last], gw(kum) + ' GWh', 'rata-rata ' + gw(kum / (last + 1)) + ' GWh per bulan'],
      ['Sumber terbesar', top.name, gw(top.now) + ' GWh · ' + nfm(1).format((top.now / cur) * 100) + '% dari total'],
    ];
    cards.forEach((c, i) => {
      const y = 126 + i * 104;
      o.push(`<rect x="48" y="${y}" width="340" height="94" rx="14" fill="${CARD}"/><rect x="48" y="${y}" width="6" height="94" rx="3" fill="${IC[i === 2 ? 3 : i]}"/>`);
      o.push(T(70, y + 28, c[0], { s: 15, c: MUT, w: 600 }), T(70, y + 62, c[1], { s: 30, w: 750 }), T(70, y + 84, c[2], { s: 14, c: MUT }));
    });

    // grafik batang bertumpuk (kanan atas)
    const px0 = 470, px1 = 1872, base = 372, ptop = 178, n = last + 1;
    const maxG = Math.max(...pr.terima.slice(0, n)) / 1e6, step = maxG > 80 ? 20 : 10, yMax = Math.ceil(maxG / step) * step;
    const yy = (g) => base - (g / yMax) * (base - ptop);
    for (let g = 0; g <= yMax; g += step) {
      o.push(`<line x1="${px0}" x2="${px1}" y1="${yy(g)}" y2="${yy(g)}" stroke="${g ? LINE : '#94a3b8'}" stroke-width="1"/>`, T(px0 - 10, yy(g) + 5, String(g), { s: 13, c: MUT, a: 'end' }));
    }
    o.push(T(px0, 134, 'Energi diterima per bulan (GWh)', { s: 17, w: 650 }));
    let lx = px0;
    srcs.forEach((x) => {
      o.push(`<rect x="${lx}" y="146" width="13" height="13" rx="3" fill="${IC[x.i]}"/>`, T(lx + 19, 158, x.name, { s: 13, c: '#334155' }));
      lx += 40 + x.name.length * 7.4;
    });
    const slot = (px1 - px0) / n, bw = Math.min(58, slot * 0.58);
    for (let m = 0; m < n; m++) {
      const cx = px0 + slot * (m + 0.5);
      let acc = 0;
      srcs.forEach((x) => {
        const g = x.v[m] / 1e6;
        if (g <= 0) return;
        o.push(`<rect x="${cx - bw / 2}" y="${yy(acc + g)}" width="${bw}" height="${Math.max(0, yy(acc) - yy(acc + g))}" fill="${IC[x.i]}" stroke="#fff" stroke-width="1"/>`);
        acc += g;
      });
      o.push(T(cx, yy(acc) - 7, nfm(1).format(acc), { s: 13, w: 700, a: 'middle' }), T(cx, base + 22, pr.months[m], { s: 14, c: MUT, a: 'middle' }));
    }

    // daftar seluruh titik transaksi (tiga kolom)
    const gy = 450;
    o.push(`<line x1="48" x2="${IW - 48}" y1="${gy - 14}" y2="${gy - 14}" stroke="${LINE}"/>`);
    o.push(T(48, gy + 12, 'Seluruh titik transaksi', { s: 20, w: 700 }), T(300, gy + 12, `Satuan MWh · ${month} dan kumulatif Jan–${pr.months[last]} · (−) pemakaian sendiri (PS) gardu induk/pembangkit`, { s: 14, c: MUT }));
    const items = [];
    const section = (kind, title) => {
      const gs = (pr.groups || []).filter((g) => g.kind === kind);
      if (!gs.length) return;
      items.push({ t: 'sec', txt: title });
      gs.forEach((g) => {
        const si = srcs.findIndex((x) => x.name === g.name);
        const col = kind === 'kirim' ? '#94a3b8' : si >= 0 ? IC[si] : IC[7];
        if (g.flat) { items.push({ t: 'flat', txt: g.name, v: g.v, col }); return; }
        items.push({ t: 'head', txt: g.name, v: g.v, col });
        g.points.forEach((p) => items.push({ t: 'pt', txt: (p.ps ? '(−) ' : '') + p.name, v: p.v }));
      });
    };
    section('terima', 'ENERGI DITERIMA / DIBELI');
    section('kirim', 'ENERGI DIKIRIM KE UNIT LAIN');
    const NC = 4, GAP = 30, cw = (IW - 96 - (NC - 1) * GAP) / NC, top0 = gy + 56, avail = IH - 44 - top0;
    // kelompokkan menjadi blok (judul bagian + grup + titiknya) agar grup tidak terpotong antar kolom
    const blocks = [];
    let pendingSec = null;
    items.forEach((it) => {
      if (it.t === 'sec') { pendingSec = it; return; }
      if (it.t === 'head' || it.t === 'flat') { blocks.push(pendingSec ? [pendingSec, it] : [it]); pendingSec = null; } else blocks[blocks.length - 1].push(it);
    });
    const total = blocks.reduce((a, bl) => a + bl.length, 0), target = Math.ceil(total / NC);
    const cols = Array.from({ length: NC }, () => []);
    let c = 0;
    blocks.forEach((bl) => {
      if (c < NC - 1 && cols[c].length && cols[c].length + bl.length > target + 1) c++;
      cols[c].push(...bl);
    });
    const LH = Math.min(26, avail / (Math.max(...cols.map((x) => x.length)) + 0.4));
    cols.forEach((col, ci) => {
      const x0 = 48 + ci * (cw + GAP);
      o.push(`<rect x="${x0}" y="${gy + 26}" width="${cw}" height="24" rx="6" fill="${CARD}"/>`, T(x0 + 10, gy + 43, 'Titik transaksi', { s: 13, c: MUT, w: 650 }),
        T(x0 + cw - 105, gy + 43, month.slice(0, 3), { s: 13, c: MUT, w: 650, a: 'end' }), T(x0 + cw - 8, gy + 43, 'Kum', { s: 13, c: MUT, w: 650, a: 'end' }));
      col.forEach((it, r) => {
        const y = top0 + (r + 1) * LH - 5, kv = sum(it.v || []), cv = it.v ? it.v[last] : 0;
        if (it.t === 'sec') { o.push(T(x0, y, it.txt, { s: 13, c: IC[0], w: 800 })); return; }
        if (it.t === 'pt') { o.push(T(x0 + 22, y, it.txt, { s: 14, c: '#334155' }), T(x0 + cw - 105, y, mw(cv), { s: 14, c: cv ? INK : '#94a3b8', a: 'end' }), T(x0 + cw - 8, y, mw(kv), { s: 14, c: kv ? INK : '#94a3b8', a: 'end' })); return; }
        o.push(`<rect x="${x0}" y="${y - 11}" width="12" height="12" rx="3" fill="${it.col}"/>`, T(x0 + 22, y, it.txt, { s: 14.5, w: 700 }), T(x0 + cw - 105, y, mw(cv), { s: 14.5, w: 700, a: 'end' }), T(x0 + cw - 8, y, mw(kv), { s: 14.5, w: 700, a: 'end' }));
      });
    });
    o.push(T(48, IH - 16, 'Sumber: Laporan Susut Distribusi UP3 (sheet SUSUT 2026) · PLN UP3 Mamuju · Dashboard TE', { s: 13, c: MUT }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${IW} ${IH}" width="${IW}" height="${IH}" font-family="${FONT}">${o.join('')}</svg>`;
  }

  function svgToPng(svg) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = IW * 2; cv.height = IH * 2;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error('gagal membuat gambar'))), 'image/png');
      };
      img.onerror = () => reject(new Error('gagal merender gambar'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function labelFlash(btn, msg) {
    const old = btn.dataset.l || btn.textContent; btn.dataset.l = old; btn.textContent = msg;
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = old; }, 2000);
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function wireInfographic(svg, name) {
    $('infoDl').onclick = async () => { try { download(await svgToPng(svg), name); labelFlash($('infoDl'), 'Terunduh ✓'); } catch (e) { labelFlash($('infoDl'), 'Gagal'); } };
    $('infoCopy').onclick = async () => {
      try {
        if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('clipboard');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPng(svg) })]);
        labelFlash($('infoCopy'), 'Tersalin ✓ — tempel di PPT');
      } catch (e) {
        try { download(await svgToPng(svg), name); labelFlash($('infoCopy'), 'Disalin tidak didukung — gambar diunduh'); } catch (e2) { labelFlash($('infoCopy'), 'Gagal'); }
      }
    };
  }

  function drawProduksi(pr, srcs) {
    const el = $('sChTrend');
    if (!el || !window.echarts) return;
    disposeSummaryChart();
    sumChart = echarts.init(el, null, { renderer: 'svg' });
    const n = pr.last + 1, surface = css('--surface'), ink2 = css('--ink-2'), muted = css('--muted');
    sumChart.setOption({
      animationDuration: 400,
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: ink2 },
      color: srcs.map((x) => css('--s' + (x.i + 1))),
      grid: { left: 8, right: 14, top: 64, bottom: 6, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 8, itemGap: 14, textStyle: { color: ink2, fontSize: 12 } },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(120,130,150,.10)' } },
        backgroundColor: surface, borderColor: css('--border'), textStyle: { color: css('--ink'), fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);',
        valueFormatter: (v) => nfm(2).format(v) + ' GWh',
      },
      xAxis: { type: 'category', data: pr.months.slice(0, n), axisTick: { show: false }, axisLine: { lineStyle: { color: css('--axis') } }, axisLabel: { color: muted, fontSize: 11 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: css('--grid') } }, axisLabel: { color: muted, fontSize: 11, formatter: (v) => nfm(0).format(v) } },
      series: srcs.map((x) => ({
        name: x.name, type: 'bar', stack: 'total', barMaxWidth: 34, data: x.v.slice(0, n).map((v) => +(v / 1e6).toFixed(4)),
        itemStyle: { borderColor: surface, borderWidth: 1 }, emphasis: { focus: 'series' },
      })),
    });
  }

  function renderHead() {
    const rep = DATA.reports[S.rep];
    const [a, b] = DATA.path;
    $('sCrumb').innerHTML = `<span>${esc(a)}</span><i>›</i><span>${esc(b)}</span><i>›</i><b>${esc(rep.title)}</b>`;
    const sel = $('sRep');
    sel.hidden = DATA.reports.length < 2;
    sel.innerHTML = DATA.reports.map((r, i) => `<option value="${i}"${i === S.rep ? ' selected' : ''}>${esc(r.title)}</option>`).join('');
    const upd = new Date(DATA.reports[S.rep].modified);
    $('sFoot').textContent = `Sumber: ${rep.file} · file Excel diperbarui ${upd.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
  }

  function writeHash() {
    const rep = DATA.reports[S.rep];
    const parts = ['susut'];
    if (DATA.reports.length > 1) parts.push(encodeURIComponent(rep.file));
    parts.push(encodeURIComponent(S.sheet === -1 ? 'Ringkasan' : S.sheet === -2 ? 'Ringkasan-Produksi' : rep.sheets[S.sheet]));
    history.replaceState(null, '', '#' + parts.join('/'));
  }

  function applyHash() {
    const m = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
    if (!DATA) return;
    if (m[0] !== 'susut') { S.sheet = DATA.reports[S.rep].summary ? -1 : 0; return; }  // tanpa hash: buka Ringkasan
    let rest = m.slice(1);
    if (DATA.reports.length > 1 && rest.length > 1) {
      const i = DATA.reports.findIndex((r) => r.file === rest[0]);
      if (i >= 0) S.rep = i;
      rest = rest.slice(1);
    }
    const rep = DATA.reports[S.rep];
    const j = rep.sheets.indexOf(rest[0]);
    S.sheet = rest[0] === 'Ringkasan-Produksi' && rep.produksi ? -2 : rest[0] === 'Ringkasan' && rep.summary ? -1 : j >= 0 ? j : rep.summary ? -1 : 0;
  }

  async function show() {
    setView('susut');
    $('sMsg').hidden = false; $('sMsg').textContent = 'Memuat laporan…';
    try {
      await load();
    } catch (e) {
      $('sMsg').textContent = 'Laporan susut belum tersedia (' + e.message + ').';
      return;
    }
    $('sMsg').hidden = true;
    applyHash();
    renderHead(); renderSheet(); writeHash();
  }

  function showTransaksi() {
    setView('transaksi');
    if (location.hash.startsWith('#susut') || location.hash.startsWith('#billing')) history.replaceState(null, '', location.pathname + location.search);
    // ukuran grafik perlu dihitung ulang setelah kembali tampil
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }

  // ---------- submenu di sidebar ----------
  function initSubnav() {
    // Pengendalian Susut: sama dengan tab halaman
    $('subSusut').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b || !DATA) return;
      S.sheet = +b.dataset.i; renderSheet(); writeHash();
      document.body.classList.remove('nav-open');
    });
    // Transaksi Energi: lompat ke bagian halaman
    const sub = $('subTransaksi'), btns = [...sub.querySelectorAll('button[data-t]')];
    const target = (b) => { const el = document.querySelector(b.dataset.t); return el && (el.closest('.card, .kpis') || el); };
    sub.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]'); if (!b) return;
      const el = target(b);
      if (el && !el.hidden) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.body.classList.remove('nav-open');
    });
    const refresh = () => {
      btns.forEach((b) => { const el = target(b); b.hidden = !el || el.hidden; });
      let cur = null;
      btns.forEach((b) => { const el = target(b); if (el && !el.hidden && el.getBoundingClientRect().top <= 140) cur = b; });
      btns.forEach((b) => b.classList.toggle('on', b === cur));
    };
    let raf = 0;
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(); }); }, { passive: true });
    ['cardPng', 'cardCmp'].forEach((id) => { const el = $(id); if (el) new MutationObserver(refresh).observe(el, { attributes: true, attributeFilter: ['hidden'] }); });
    setTimeout(refresh, 800); setTimeout(refresh, 2500);
  }

  function init() {
    document.querySelectorAll('#sections button[data-v]').forEach((b) => {
      b.onclick = () => (b.dataset.v === 'susut' ? show() : b.dataset.v === 'billing' ? window.DashBilling.show() : b.dataset.v === 'dlpd' ? window.DashDlpd.show() : showTransaksi());
    });
    initSubnav();
    $('sTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      S.sheet = +b.dataset.i; renderSheet(); writeHash();
    });
    $('sRep').onchange = (e) => { S.rep = +e.target.value; S.sheet = DATA.reports[S.rep].summary ? -1 : 0; renderHead(); renderSheet(); writeHash(); };
    window.addEventListener('hashchange', () => {
      if (location.hash.startsWith('#susut')) { if (document.body.dataset.view !== 'susut') show(); else { applyHash(); renderHead(); renderSheet(); } }
    });
    // ganti tema terang/gelap -> gambar ulang grafik ringkasan
    new MutationObserver(() => { if (document.body.dataset.view === 'susut' && S.sheet < 0 && DATA) renderSheet(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', () => { if (sumChart) sumChart.resize(); });
    // sidebar desktop: sembunyikan/tampilkan (disimpan), dan muncul sementara saat mouse di tepi kiri
    const root = document.documentElement, wide = window.matchMedia('(min-width: 901px)');
    const setHidden = (hide) => {
      root.classList.toggle('side-hidden', hide); root.classList.remove('side-peek');
      try { localStorage.setItem('sideHidden', hide ? '1' : '0'); } catch (e) {}
      $('navToggle').setAttribute('aria-label', hide ? 'Tampilkan menu' : 'Sembunyikan menu');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    };
    $('navToggle').onclick = () => (wide.matches ? setHidden(!root.classList.contains('side-hidden')) : document.body.classList.toggle('nav-open'));
    $('sideHide').onclick = () => setHidden(true);
    let peekT = 0;
    const peek = (on) => {
      clearTimeout(peekT);
      if (!root.classList.contains('side-hidden')) return;
      if (on) root.classList.add('side-peek'); else peekT = setTimeout(() => root.classList.remove('side-peek'), 350);
    };
    $('sideHot').addEventListener('mouseenter', () => peek(true));
    $('sideHot').addEventListener('mouseleave', () => peek(false));
    $('sidebar').addEventListener('mouseenter', () => peek(true));
    $('sidebar').addEventListener('mouseleave', () => peek(false));
    $('sidebar').addEventListener('focusin', () => peek(true));
    $('navToggle').setAttribute('aria-label', root.classList.contains('side-hidden') ? 'Tampilkan menu' : 'Sembunyikan menu');
    $('navScrim').onclick = () => document.body.classList.remove('nav-open');
    if (location.hash.startsWith('#susut')) show(); else if (location.hash.startsWith('#billing')) window.DashBilling.show(); else if (location.hash.startsWith('#dlpd')) window.DashDlpd.show(); else setView('transaksi');
  }

  init();
})();
