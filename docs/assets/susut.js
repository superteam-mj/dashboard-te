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
    document.querySelectorAll('#sections button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    $('subtitle').textContent = v === 'susut' ? 'Pengendalian Susut · Laporan Susut' : 'Laporan TUL III-09';
    document.title = v === 'susut' ? 'Laporan Susut — Dashboard TE' : 'Dashboard Penjualan Listrik';
  }

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
          const sm = await DashAuth.sb.from('susut_sheets').select('file,data').eq('idx', -1);
          const byFile = new Map(((sm && sm.data) || []).map((x) => [x.file, x.data]));
          data.forEach((r) => { r.summary = byFile.get(r.file) || null; });
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
      rep.sheets.map((n, i) => `<button type="button" role="tab" aria-selected="${i === S.sheet}" data-i="${i}">${esc(n)}</button>`).join('');
    const active = $('sTabs').querySelector('[aria-selected="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const isSum = S.sheet === -1 && rep.summary;
    $('sSummary').hidden = !isSum;
    $('sWrap').hidden = !!isSum;
    $('sMeta').hidden = !!isSum;
    if (isSum) { renderSummary(rep.summary); return; }
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
    parts.push(encodeURIComponent(S.sheet === -1 ? 'Ringkasan' : rep.sheets[S.sheet]));
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
    S.sheet = rest[0] === 'Ringkasan' && rep.summary ? -1 : j >= 0 ? j : rep.summary ? -1 : 0;
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
    if (location.hash.startsWith('#susut')) history.replaceState(null, '', location.pathname + location.search);
    // ukuran grafik perlu dihitung ulang setelah kembali tampil
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }

  function init() {
    document.querySelectorAll('#sections button').forEach((b) => {
      b.onclick = () => (b.dataset.v === 'susut' ? show() : showTransaksi());
    });
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
    new MutationObserver(() => { if (document.body.dataset.view === 'susut' && S.sheet === -1 && DATA) renderSheet(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', () => { if (sumChart) sumChart.resize(); });
    if (location.hash.startsWith('#susut')) show(); else setView('transaksi');
  }

  init();
})();
