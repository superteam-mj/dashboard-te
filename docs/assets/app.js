/* Dashboard Laporan TUL III-09 — data dari data/data.json (dibuat oleh build_data.py) */
(function () {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const LEVEL_NAME = { UP: 'UP3', UPI: 'ULP', KABUPATEN: 'Kabupaten' };
  const JENIS_NAME = { TOTAL: 'Total', NORMAL: 'Pascabayar', LPB: 'Prabayar' };
  const GOL = {
    S: { name: 'Sosial', c: '--s5' },
    R: { name: 'Rumah Tangga', c: '--s1' },
    B: { name: 'Bisnis', c: '--s2' },
    I: { name: 'Industri', c: '--s3' },
    P: { name: 'Pemerintah', c: '--s4' },
    T: { name: 'Traksi', c: '--s8' },
    C: { name: 'Curah', c: '--s7' },
    L: { name: 'Layanan Khusus', c: '--s6' },
  };
  const GOL_ORDER = ['S', 'R', 'B', 'I', 'P', 'T', 'C', 'L'];
  const METRIC = {
    kwh: { label: 'Penjualan kWh', unit: 'kWh' },
    rp: { label: 'Pendapatan', unit: 'Rp' },
    c: { label: 'Pelanggan', unit: 'plg' },
    va: { label: 'Daya tersambung', unit: 'VA' },
    rpkwhavg: { label: 'Rata-rata Rp/kWh', unit: 'Rp/kWh' },
  };

  let DATA, F;
  const S = {
    level: 'UP', unit: null, year: null, ym: null, jenis: 'TOTAL', gol: null,
    tMetric: 'kwh', gMetric: 'kwh', gPeriod: 'm', topMetric: 'kwh', cMetric: 'kwh',
    sort: null, closed: new Set(), q: '', hideZero: true,
  };
  const charts = {};
  const $ = (id) => document.getElementById(id);

  // ---------- format ----------
  const nf = (d = 0) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  function compact(v, d = 2) {
    const a = Math.abs(v || 0);
    if (a >= 1e12) return fmt(v / 1e12, d) + ' T';
    if (a >= 1e9) return fmt(v / 1e9, d) + ' M';
    if (a >= 1e6) return fmt(v / 1e6, d) + ' Jt';
    if (a >= 1e3) return fmt(v / 1e3, 1) + ' Rb';
    return fmt(v, 0);
  }
  function fmtMetric(m, v, short) {
    if (m === 'rp') return 'Rp ' + (short ? compact(v) : fmt(v));
    if (m === 'kwh') return (short ? compact(v) : fmt(v)) + ' kWh';
    if (m === 'c') return (short ? compact(v) : fmt(v)) + ' plg';
    if (m === 'va') return (short ? compact(v) : fmt(v)) + ' VA';
    if (m === 'rpkwhavg') return 'Rp ' + fmt(v, 2);
    return fmt(v);
  }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const golColor = (g) => css((GOL[g] || GOL.L).c);
  const ymLabel = (ym, short) => { const [y, m] = ym.split('-'); return (short ? BLN : BULAN)[+m - 1] + (short ? '' : ' ' + y); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- data access ----------
  const unitData = () => (DATA.levels[S.level] || {})[S.unit];
  const allMonths = () => Object.keys((unitData() || { months: {} }).months).sort();
  const yearMonths = () => allMonths().filter((k) => k.startsWith(S.year + '-'));
  const zero = () => F.names.map(() => 0);
  const realUnits = (level) => Object.keys(DATA.levels[level] || {}).filter((k) => !DATA.levels[level][k].merged);
  // apakah unit punya rincian pascabayar/prabayar
  const hasSplit = (u) => { u = u || unitData(); return !!u && Object.values(u.months).some((m) => m.NORMAL || m.LPB); };

  function rowsFor(ym, jenis, u) {
    u = u || unitData();
    const mon = u && u.months[ym];
    const out = {};
    if (!mon) return out;
    const parts = jenis === 'TOTAL' ? (mon.TOTAL ? ['TOTAL'] : ['NORMAL', 'LPB']) : [jenis];
    for (const t of u.tarif) {
      let acc = null;
      for (const p of parts) {
        const r = mon[p] && mon[p][t];
        if (!r) continue;
        acc = acc || zero();
        for (let i = 0; i < r.length; i++) acc[i] += r[i];
      }
      if (acc) out[t] = acc;
    }
    return out;
  }
  function agg(ym, jenis, gol, u) {
    const rows = rowsFor(ym, jenis, u), s = zero();
    for (const [t, r] of Object.entries(rows)) {
      if (gol && t[0] !== gol) continue;
      for (let i = 0; i < r.length; i++) s[i] += r[i];
    }
    return s;
  }
  function val(arr, m) {
    if (m === 'rpkwhavg') return arr[F.kwh] ? arr[F.rp] / arr[F.kwh] : 0;
    return arr[F[m]];
  }
  // Unit gabungan ("Semua ULP") untuk level yang punya lebih dari satu unit
  function buildMerged() {
    for (const level of Object.keys(DATA.levels)) {
      const lv = DATA.levels[level], names = Object.keys(lv);
      if (names.length < 2) continue;
      const m = { merged: true, code: '', parent: '', tarif: [], months: {} };
      names.forEach((n) => lv[n].tarif.forEach((t) => { if (!m.tarif.includes(t)) m.tarif.push(t); }));
      const yms = [...new Set(names.flatMap((n) => Object.keys(lv[n].months)))].sort();
      for (const ym of yms) {
        if (!names.every((n) => lv[n].months[ym])) continue; // hanya bulan yang lengkap semua unitnya
        const split = names.every((n) => lv[n].months[ym].NORMAL && lv[n].months[ym].LPB);
        const mon = { status: {}, source: {} };
        for (const j of split ? ['NORMAL', 'LPB'] : ['TOTAL']) {
          const acc = {};
          for (const n of names) {
            for (const [t, r] of Object.entries(rowsFor(ym, j, lv[n]))) {
              acc[t] = acc[t] || zero();
              r.forEach((v, i) => (acc[t][i] += v));
            }
          }
          mon[j] = acc;
          mon.status[j] = `gabungan ${names.length} unit`;
        }
        m.months[ym] = mon;
      }
      lv[`Semua ${LEVEL_NAME[level] || level} (gabungan)`] = m;
    }
  }

  function ytd(jenis, gol, fn) {
    const s = zero();
    for (const ym of yearMonths()) {
      if (ym > S.ym) break;
      const a = (fn || agg)(ym, jenis, gol);
      for (let i = 0; i < s.length; i++) s[i] += a[i];
    }
    return s;
  }

  // ---------- chart base ----------
  function base() {
    return {
      animationDuration: 400,
      textStyle: { fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: css('--ink-2') },
      tooltip: {
        backgroundColor: css('--surface'), borderColor: css('--border'), borderWidth: 1,
        textStyle: { color: css('--ink'), fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);',
      },
    };
  }
  const axisLine = () => ({ lineStyle: { color: css('--axis') } });
  const splitLine = () => ({ lineStyle: { color: css('--grid'), type: 'solid' } });
  const axisLabel = (extra) => Object.assign({ color: css('--muted'), fontSize: 11 }, extra || {});
  function chart(id) {
    if (!charts[id]) {
      charts[id] = echarts.init($(id), null, { renderer: 'svg' });
    }
    return charts[id];
  }
  const ttRow = (color, name, value) =>
    `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:180px">` +
    `<span style="display:flex;gap:6px;align-items:center">${color ? `<i style="width:9px;height:9px;border-radius:3px;background:${color};display:inline-block"></i>` : ''}${esc(name)}</span>` +
    `<b style="font-variant-numeric:tabular-nums">${value}</b></div>`;

  // ---------- filters ----------
  function setSeg(id, v) {
    $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  }
  function bindSeg(id, key) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      S[key] = b.dataset.v; setSeg(id, S[key]); render();
    });
  }
  function fillSelect(sel, opts, value) {
    sel.innerHTML = opts.map((o) => `<option value="${esc(o.v)}"${o.dis ? ' disabled' : ''}${o.v === value ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
  }
  function syncFilters() {
    const levels = Object.keys(DATA.levels);
    fillSelect($('fLevel'), levels.map((l) => {
      const n = Object.keys(DATA.levels[l]).length;
      return { v: l, t: LEVEL_NAME[l] + (n ? '' : ' (belum ada data)'), dis: !n };
    }), S.level);
    const lv = DATA.levels[S.level] || {};
    const units = Object.keys(lv).sort((a, b) => (lv[b].merged ? 1 : 0) - (lv[a].merged ? 1 : 0) || a.localeCompare(b));
    if (!units.includes(S.unit)) S.unit = units[0];
    fillSelect($('fUnit'), units.map((u) => ({ v: u, t: u })), S.unit);
    const split = hasSplit();
    if (!split) S.jenis = 'TOTAL';
    $('fJenis').querySelectorAll('button').forEach((b) => {
      b.disabled = b.dataset.v !== 'TOTAL' && !split;
      b.title = b.disabled ? 'Rincian pascabayar/prabayar tidak tersedia untuk unit ini' : '';
    });
    const months = allMonths();
    const years = [...new Set(months.map((m) => m.slice(0, 4)))];
    if (!years.includes(S.year)) S.year = years[years.length - 1];
    fillSelect($('fYear'), years.map((y) => ({ v: y, t: y })), S.year);
    const ym = yearMonths();
    if (!ym.includes(S.ym)) S.ym = ym[ym.length - 1];
    fillSelect($('fMonth'), ym.map((m) => ({ v: m, t: ymLabel(m, false).split(' ')[0] })), S.ym);
    setSeg('fJenis', S.jenis);

    $('chips').innerHTML = S.gol
      ? `<span class="chip"><i class="dot" style="background:${golColor(S.gol)}"></i>Golongan ${S.gol} · ${GOL[S.gol].name}<button type="button" aria-label="Hapus filter golongan" id="clrGol">×</button></span>`
      : '';
    if (S.gol) $('clrGol').onclick = () => { S.gol = null; render(); };
    writeHash();
  }
  function writeHash() {
    const p = new URLSearchParams({ l: S.level, u: S.unit || '', m: S.ym || '', j: S.jenis });
    if (S.gol) p.set('g', S.gol);
    if ((document.body.dataset.view || 'transaksi') === 'transaksi') history.replaceState(null, '', '#' + p.toString());
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('l') && DATA.levels[p.get('l')]) S.level = p.get('l');
    if (p.get('u')) S.unit = p.get('u');
    if (p.get('m')) { S.ym = p.get('m'); S.year = S.ym.slice(0, 4); }
    if (JENIS_NAME[p.get('j')]) S.jenis = p.get('j');
    if (GOL[p.get('g')]) S.gol = p.get('g');
  }

  // ---------- render: meta + KPI ----------
  function renderMeta() {
    const u = unitData(), mon = u && u.months[S.ym];
    if ((document.body.dataset.view || 'transaksi') === 'transaksi') $('subtitle').textContent = `TUL III-09 · ${S.unit || '-'} · ${JENIS_NAME[S.jenis]}${S.gol ? ' · Golongan ' + GOL[S.gol].name : ''}`;
    if (!mon) { $('meta').innerHTML = ''; return; }
    const st = Object.entries(mon.status || {}).map(([j, s]) =>
      `<span class="badge" title="${esc((mon.source || {})[j] || '')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>${JENIS_NAME[j]}: ${esc(s || '-')}</span>`).join('');
    $('meta').innerHTML = `<span class="period">${ymLabel(S.ym)}</span>${st}`;
  }

  const KPI_ICON = {
    c: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    va: 'M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.05.88-3.9 2.29-5.19L5.88 5.4A8.96 8.96 0 0 0 3 12a9 9 0 0 0 18 0c0-2.74-1.23-5.18-3.17-6.83z',
    kwh: 'M7 2v11h3v9l7-12h-4l4-8z',
    rp: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
    rpkwhavg: 'M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  };

  function renderKpis() {
    const months = allMonths(), idx = months.indexOf(S.ym);
    const prev = idx > 0 ? months[idx - 1] : null;
    const cur = agg(S.ym, S.jenis, S.gol), pv = prev ? agg(prev, S.jenis, S.gol) : null;
    const yt = ytd(S.jenis, S.gol);
    const ym = yearMonths();
    const defs = [
      { m: 'c', lbl: 'Jumlah pelanggan', v: (a) => a[F.c], show: (v) => fmt(v), unit: 'plg' },
      { m: 'va', lbl: 'Daya tersambung', v: (a) => a[F.va] / 1e6, show: (v) => fmt(v, 2), unit: 'MVA' },
      { m: 'kwh', lbl: 'Penjualan energi', v: (a) => a[F.kwh] / 1e6, show: (v) => fmt(v, 2), unit: 'GWh', ytd: (a) => 'Kumulatif ' + fmt(a[F.kwh] / 1e6, 2) + ' GWh' },
      { m: 'rp', lbl: 'Pendapatan', v: (a) => a[F.rp] / 1e9, show: (v) => 'Rp ' + fmt(v, 2), unit: 'M', ytd: (a) => 'Kumulatif Rp ' + fmt(a[F.rp] / 1e9, 2) + ' M' },
      { m: 'rpkwhavg', lbl: 'Harga jual rata-rata', v: (a) => (a[F.kwh] ? a[F.rp] / a[F.kwh] : 0), show: (v) => fmt(v, 2), unit: 'Rp/kWh', ytd: (a) => 'Kumulatif ' + fmt(a[F.kwh] ? a[F.rp] / a[F.kwh] : 0, 2) + ' Rp/kWh' },
    ];
    const ly = `${+S.ym.slice(0, 4) - 1}${S.ym.slice(4)}`;
    const lyA = months.includes(ly) ? agg(ly, S.jenis, S.gol) : null;
    const dl = (v, p, label) => {
      const ch = p ? (v - p) / Math.abs(p) * 100 : 0;
      const cls = Math.abs(ch) < 0.05 ? 'flat' : ch > 0 ? 'up' : 'down';
      const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■';
      return `<span class="delta ${cls}">${arrow} ${fmt(Math.abs(ch), 1)}% <span>vs ${label}</span></span>`;
    };
    $('kpis').innerHTML = defs.map((d, i) => {
      const v = d.v(cur);
      let delta = pv ? dl(v, d.v(pv), ymLabel(prev, true)) : '<span class="delta flat">— <span>tidak ada bulan sebelumnya</span></span>';
      if (lyA) delta += dl(v, d.v(lyA), ymLabel(ly, true) + ' ' + ly.slice(0, 4));
      return `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${KPI_ICON[d.m]}"/></svg></span><div class="lbl">${d.lbl}</div></div>` +
        `<div class="val">${d.show(v)}<small>${d.unit}</small></div>${delta}` +
        `<div class="ytd">${d.ytd ? d.ytd(yt) : '&nbsp;'}</div>` +
        `<div class="spark" id="sp${i}" aria-hidden="true"></div></div>`;
    }).join('');
    Object.keys(charts).filter((k) => k.startsWith('sp')).forEach((k) => { charts[k].dispose(); delete charts[k]; });
    defs.forEach((d, i) => {
      const data = ym.map((m) => d.v(agg(m, S.jenis, S.gol)));
      const sel = ym.indexOf(S.ym);
      const accent = css('--accent');
      chart('sp' + i).setOption(Object.assign(base(), {
        grid: { left: 2, right: 2, top: 6, bottom: 2 },
        xAxis: { type: 'category', show: false, data: ym, boundaryGap: false },
        yAxis: { type: 'value', show: false, scale: true },
        tooltip: Object.assign(base().tooltip, {
          trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: css('--axis') } },
          formatter: (p) => `${ymLabel(ym[p[0].dataIndex])}<br><b>${d.show(p[0].value)} ${d.unit}</b>`,
        }),
        series: [{
          type: 'line', data, smooth: 0.3, symbol: 'circle', symbolSize: (v, p) => (p.dataIndex === sel ? 7 : 0),
          showAllSymbol: true, lineStyle: { width: 2, color: accent }, itemStyle: { color: accent, borderColor: css('--surface'), borderWidth: 2 },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: accent + '33' }, { offset: 1, color: accent + '00' }]) },
        }],
      }));
    });
  }

  // ---------- trend ----------
  function renderTrend() {
    const ym = yearMonths(), m = S.tMetric, sel = ym.indexOf(S.ym);
    const c = chart('chTrend');
    const split = hasSplit();
    const parts = S.jenis === 'TOTAL' ? (split ? ['NORMAL', 'LPB'] : ['TOTAL']) : [S.jenis];
    const color = { NORMAL: css('--s1'), LPB: css('--s2'), TOTAL: css('--s3') };
    const surface = css('--surface');
    let series;
    if (m === 'rpkwhavg') {
      const lines = S.jenis === 'TOTAL' ? (split ? ['NORMAL', 'LPB', 'TOTAL'] : ['TOTAL']) : [S.jenis];
      series = lines.map((j) => ({
        name: JENIS_NAME[j], type: 'line', data: ym.map((x) => val(agg(x, j, S.gol), m)),
        symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, color: color[j] },
        itemStyle: { color: color[j], borderColor: surface, borderWidth: 2 },
        endLabel: { show: lines.length <= 4, formatter: (p) => fmt(p.value, 0), color: css('--ink-2'), fontSize: 11 },
      }));
    } else {
      const totals = ym.map((x) => val(agg(x, S.jenis, S.gol), m));
      series = parts.map((j, k) => ({
        name: JENIS_NAME[j], type: 'bar', stack: 'a', barMaxWidth: 38,
        data: ym.map((x, i) => ({
          value: val(agg(x, j, S.gol), m),
          itemStyle: { opacity: i === sel ? 1 : 0.55 },
        })),
        itemStyle: { color: color[j], borderColor: surface, borderWidth: 1, borderRadius: k === parts.length - 1 ? [4, 4, 0, 0] : 0 },
        label: k === parts.length - 1 ? {
          show: true, position: 'top', color: css('--ink'), fontWeight: 600, fontSize: 11,
          formatter: (p) => (p.dataIndex === sel ? compact(totals[p.dataIndex]) : ''),
        } : undefined,
      }));
    }
    $('trendHint').textContent = `${METRIC[m].label} ${S.year}${S.gol ? ' · Golongan ' + GOL[S.gol].name : ''} — klik batang untuk memilih bulan`;
    c.setOption(Object.assign(base(), {
      grid: { left: 8, right: m === 'rpkwhavg' ? 56 : 16, top: 40, bottom: 4, containLabel: true },
      legend: { show: series.length > 1, top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: css('--ink-2') } },
      xAxis: { type: 'category', data: ym.map((x) => ymLabel(x, true)), axisLine: axisLine(), axisTick: { show: false }, axisLabel: axisLabel() },
      yAxis: { type: 'value', scale: m === 'rpkwhavg', splitLine: splitLine(), axisLabel: axisLabel({ formatter: (v) => compact(v, 0) }) },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'axis', axisPointer: { type: m === 'rpkwhavg' ? 'line' : 'shadow', shadowStyle: { color: css('--surface-2'), opacity: 0.6 } },
        formatter: (ps) => {
          let h = `<div style="font-weight:650;margin-bottom:4px">${ymLabel(ym[ps[0].dataIndex])}</div>`;
          let tot = 0;
          ps.forEach((p) => { tot += p.value || 0; h += ttRow(p.color, p.seriesName, fmtMetric(m, p.value)); });
          if (ps.length > 1 && m !== 'rpkwhavg') h += `<div style="border-top:1px solid ${css('--grid')};margin-top:4px;padding-top:4px">${ttRow('', 'Total', fmtMetric(m, tot))}</div>`;
          return h;
        },
      }),
      series,
    }), true);
    c.off('click');
    c.on('click', (p) => { const t = ym[p.dataIndex]; if (t) { S.ym = t; render(); } });
    c.getZr().off('click');
    c.getZr().on('click', (e) => {
      if (m === 'rpkwhavg') return;
      const pt = [e.offsetX, e.offsetY];
      if (!c.containPixel('grid', pt)) return;
      const i = c.convertFromPixel({ seriesIndex: 0 }, pt)[0];
      if (ym[i] && ym[i] !== S.ym) { S.ym = ym[i]; render(); }
    });
  }

  // ---------- golongan ----------
  function golAgg(arr) { // arr = row map → {g: summed}
    const out = {};
    for (const [t, r] of Object.entries(arr)) {
      const g = t[0]; out[g] = out[g] || zero();
      for (let i = 0; i < r.length; i++) out[g][i] += r[i];
    }
    return out;
  }
  function renderGol() {
    const m = S.gMetric;
    let byG;
    if (S.gPeriod === 'ytd' && m !== 'c') {
      byG = {};
      for (const x of yearMonths()) {
        if (x > S.ym) break;
        const g = golAgg(rowsFor(x, S.jenis));
        for (const k in g) { byG[k] = byG[k] || zero(); g[k].forEach((v, i) => (byG[k][i] += v)); }
      }
    } else byG = golAgg(rowsFor(S.ym, S.jenis));
    const items = GOL_ORDER.filter((g) => byG[g] && val(byG[g], m) > 0)
      .map((g) => ({ g, v: val(byG[g], m) })).sort((a, b) => a.v - b.v);
    const total = items.reduce((s, x) => s + x.v, 0);
    const c = chart('chGol');
    c.setOption(Object.assign(base(), {
      grid: { left: 16, right: 110, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category', data: items.map((x) => x.g), axisLine: axisLine(), axisTick: { show: false },
        axisLabel: axisLabel({ color: css('--ink-2'), fontSize: 12, formatter: (g) => GOL[g].name }),
      },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: (p) => `<div style="font-weight:650;margin-bottom:4px">Golongan ${p.name} · ${GOL[p.name].name}</div>` +
          ttRow(p.color, METRIC[m].label, fmtMetric(m, p.value)) + ttRow('', 'Porsi', fmt(p.value / total * 100, 1) + '%') +
          `<div style="color:${css('--muted')};margin-top:4px">Klik untuk ${S.gol === p.name ? 'hapus' : 'terapkan'} filter</div>`,
      }),
      series: [{
        type: 'bar', barMaxWidth: 22, cursor: 'pointer',
        data: items.map((x) => ({
          value: x.v, name: x.g,
          itemStyle: { color: golColor(x.g), opacity: !S.gol || S.gol === x.g ? 1 : 0.3, borderRadius: [0, 4, 4, 0] },
        })),
        label: {
          show: true, position: 'right', color: css('--ink'), fontSize: 11.5,
          formatter: (p) => `{b|${compact(p.value)}}  {m|${fmt(p.value / total * 100, 1)}%}`,
          rich: { b: { fontWeight: 600, color: css('--ink') }, m: { color: css('--muted') } },
        },
      }],
    }), true);
    c.off('click');
    c.on('click', (p) => { S.gol = S.gol === p.name ? null : p.name; render(); });
  }

  // ---------- pasca vs pra ----------
  function renderMix() {
    if (!hasSplit()) {
      chart('chMix').setOption(Object.assign(base(), {
        title: {
          text: 'Rincian pascabayar/prabayar\ntidak tersedia untuk unit ini', left: 'center', top: 'middle',
          textStyle: { color: css('--muted'), fontSize: 13, fontWeight: 400, lineHeight: 20 },
        },
        series: [],
      }), true);
      return;
    }
    const n = agg(S.ym, 'NORMAL', S.gol), l = agg(S.ym, 'LPB', S.gol);
    const ms = ['c', 'va', 'kwh', 'rp'];
    const names = { c: 'Pelanggan', va: 'Daya', kwh: 'kWh', rp: 'Rupiah' };
    const pct = (a, b) => (a + b ? a / (a + b) * 100 : 0);
    const c = chart('chMix');
    const mk = (j, arr, other, color, radius) => ({
      name: JENIS_NAME[j], type: 'bar', stack: 'x', barWidth: 26,
      data: ms.map((m) => ({ value: pct(arr[F[m]], other[F[m]]), raw: arr[F[m]], m })),
      itemStyle: { color, borderColor: css('--surface'), borderWidth: 1, borderRadius: radius },
      label: { show: true, position: 'inside', color: '#fff', fontWeight: 600, fontSize: 11.5, formatter: (p) => (p.value >= 9 ? fmt(p.value, 1) + '%' : '') },
    });
    c.setOption(Object.assign(base(), {
      grid: { left: 16, right: 16, top: 34, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: css('--ink-2') } },
      xAxis: { type: 'value', max: 100, splitLine: splitLine(), axisLabel: axisLabel({ formatter: '{value}%' }) },
      yAxis: { type: 'category', inverse: true, data: ms.map((m) => names[m]), axisLine: axisLine(), axisTick: { show: false }, axisLabel: axisLabel({ color: css('--ink-2'), fontSize: 12 }) },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: css('--surface-2'), opacity: 0.6 } },
        formatter: (ps) => `<div style="font-weight:650;margin-bottom:4px">${ps[0].name}</div>` +
          ps.map((p) => ttRow(p.color, p.seriesName, `${fmtMetric(p.data.m, p.data.raw, true)} · ${fmt(p.value, 1)}%`)).join(''),
      }),
      series: [mk('NORMAL', n, l, css('--s1'), [4, 0, 0, 4]), mk('LPB', l, n, css('--s2'), [0, 4, 4, 0])],
    }), true);
  }

  // ---------- perbandingan antar unit ----------
  function renderCmp() {
    const names = realUnits(S.level);
    $('cardCmp').hidden = names.length < 2;
    if (names.length < 2) return;
    const m = S.cMetric, lv = DATA.levels[S.level];
    const items = names.map((n) => {
      const u = lv[n];
      const j = S.jenis !== 'TOTAL' && !hasSplit(u) ? null : S.jenis;
      return { n, v: j && u.months[S.ym] ? val(agg(S.ym, j, S.gol, u), m) : 0 };
    }).sort((a, b) => a.v - b.v);
    const total = m === 'rpkwhavg' ? 0 : items.reduce((s, x) => s + x.v, 0);
    $('cmpHint').textContent = `${METRIC[m].label} · ${ymLabel(S.ym)} · ${JENIS_NAME[S.jenis]}${S.gol ? ' · Golongan ' + GOL[S.gol].name : ''} — klik untuk membuka unit`;
    const c = chart('chCmp');
    $('chCmp').style.height = Math.max(220, items.length * 40 + 30) + 'px';
    c.resize();
    const accent = css('--s1');
    c.setOption(Object.assign(base(), {
      grid: { left: 16, right: 120, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', data: items.map((x) => x.n), axisLine: axisLine(), axisTick: { show: false }, axisLabel: axisLabel({ color: css('--ink-2'), fontSize: 12 }) },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: (p) => `<div style="font-weight:650;margin-bottom:4px">${esc(p.name)}</div>` +
          ttRow(p.color, METRIC[m].label, fmtMetric(m, p.value)) + (total ? ttRow('', 'Porsi', fmt(p.value / total * 100, 1) + '%') : ''),
      }),
      series: [{
        type: 'bar', barMaxWidth: 22, cursor: 'pointer',
        data: items.map((x) => ({ value: x.v, name: x.n, itemStyle: { color: accent, opacity: lv[S.unit].merged || S.unit === x.n ? 1 : 0.4, borderRadius: [0, 4, 4, 0] } })),
        label: {
          show: true, position: 'right', fontSize: 11.5,
          formatter: (p) => m === 'rpkwhavg' ? `{b|${fmt(p.value, 2)}}` : `{b|${compact(p.value)}}  {m|${fmt(total ? p.value / total * 100 : 0, 1)}%}`,
          rich: { b: { fontWeight: 600, color: css('--ink') }, m: { color: css('--muted') } },
        },
      }],
    }), true);
    c.off('click');
    c.on('click', (p) => { S.unit = p.name; render(); });
  }

  // ---------- top tarif ----------
  function renderTop() {
    const m = S.topMetric;
    const rows = Object.entries(rowsFor(S.ym, S.jenis))
      .filter(([t]) => !S.gol || t[0] === S.gol)
      .map(([t, r]) => ({ t, v: val(r, m) })).filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v).slice(0, 10).reverse();
    const total = val(agg(S.ym, S.jenis, S.gol), m);
    $('topHint').textContent = `${METRIC[m].label} · ${ymLabel(S.ym)} · ${JENIS_NAME[S.jenis]}${S.gol ? ' · Golongan ' + GOL[S.gol].name : ''} · warna = golongan`;
    const c = chart('chTop');
    c.setOption(Object.assign(base(), {
      grid: { left: 16, right: 120, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', data: rows.map((x) => x.t), axisLine: axisLine(), axisTick: { show: false }, axisLabel: axisLabel({ color: css('--ink-2'), fontSize: 12 }) },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: (p) => `<div style="font-weight:650;margin-bottom:4px">${esc(p.name)}</div>` +
          ttRow(p.color, METRIC[m].label, fmtMetric(m, p.value)) + ttRow('', 'Porsi', fmt(total ? p.value / total * 100 : 0, 1) + '%'),
      }),
      series: [{
        type: 'bar', barMaxWidth: 20,
        data: rows.map((x) => ({ value: x.v, name: x.t, itemStyle: { color: golColor(x.t[0]), borderRadius: [0, 4, 4, 0] } })),
        label: {
          show: true, position: 'right', fontSize: 11.5,
          formatter: (p) => `{b|${compact(p.value)}}  {m|${fmt(total ? p.value / total * 100 : 0, 1)}%}`,
          rich: { b: { fontWeight: 600, color: css('--ink') }, m: { color: css('--muted') } },
        },
      }],
    }), true);
  }

  // ---------- table ----------
  const COLS = [
    { k: 'tarif', t: 'Tarif' },
    { k: 'c', t: 'Pelanggan' }, { k: 'va', t: 'Daya (VA)' }, { k: 'kwh', t: 'kWh' },
    { k: 'lwbp', t: 'LWBP' }, { k: 'wbp', t: 'WBP' }, { k: 'kvarh', t: 'Kel. kVArh' },
    { k: 'beban', t: 'Biaya beban (Rp)' }, { k: 'rpkwh', t: 'B. pemakaian kWh (Rp)' }, { k: 'rpkvarh', t: 'B. kVArh (Rp)' },
    { k: 'rp', t: 'Jumlah (Rp)' }, { k: 'rpkwhavg', t: 'Rp/kWh', d: 2 }, { k: 'kwhplg', t: 'kWh/plg', d: 1 },
  ];
  function cell(r, k) {
    if (k === 'rpkwhavg') return r[F.kwh] ? r[F.rp] / r[F.kwh] : 0;
    if (k === 'kwhplg') return r[F.c] ? r[F.kwh] / r[F.c] : 0;
    return r[F[k]];
  }
  function tableModel() {
    const rows = rowsFor(S.ym, S.jenis), q = S.q.trim().toLowerCase();
    const groups = [];
    for (const g of GOL_ORDER) {
      if (S.gol && g !== S.gol) continue;
      let items = Object.entries(rows).filter(([t]) => t[0] === g)
        .filter(([, r]) => !S.hideZero || r[F.c] || r[F.kwh] || r[F.rp])
        .filter(([t]) => !q || t.toLowerCase().includes(q));
      if (!items.length) continue;
      if (S.sort) {
        const { k, dir } = S.sort;
        items.sort((a, b) => (k === 'tarif' ? a[0].localeCompare(b[0]) : cell(a[1], k) - cell(b[1], k)) * dir);
      }
      const sum = zero();
      items.forEach(([, r]) => r.forEach((v, i) => (sum[i] += v)));
      groups.push({ g, items, sum });
    }
    const total = zero();
    groups.forEach((x) => x.sum.forEach((v, i) => (total[i] += v)));
    return { groups, total };
  }
  function renderTable() {
    const { groups, total } = tableModel();
    const td = (r, c) => {
      if (c.k === 'tarif') return '';
      const v = cell(r, c.k);
      return `<td class="${v ? '' : 'zero'}">${fmt(v, c.d || 0)}</td>`;
    };
    let h = '<thead><tr>' + COLS.map((c) => {
      const s = S.sort && S.sort.k === c.k ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" data-k="${c.k}" aria-sort="${s}" tabindex="0">${c.t}</th>`;
    }).join('') + '</tr></thead><tbody>';
    if (!groups.length) h += `<tr><td colspan="${COLS.length}" style="text-align:center;color:var(--muted);padding:28px">Tidak ada data yang cocok</td></tr>`;
    for (const x of groups) {
      const closed = S.closed.has(x.g);
      h += `<tr class="grp${closed ? ' closed' : ''}" data-g="${x.g}" tabindex="0" aria-expanded="${!closed}"><td><span class="car">▾</span><i class="sw" style="background:${golColor(x.g)}"></i>${x.g} · ${GOL[x.g].name} <span style="color:var(--muted);font-weight:450">(${x.items.length})</span></td>${COLS.map((c) => td(x.sum, c)).join('')}</tr>`;
      if (!closed) for (const [t, r] of x.items) h += `<tr class="sub"><td>${esc(t)}</td>${COLS.map((c) => td(r, c)).join('')}</tr>`;
    }
    if (groups.length) h += `<tr class="tot"><td>JUMLAH</td>${COLS.map((c) => td(total, c)).join('')}</tr>`;
    $('tbl').innerHTML = h + '</tbody>';
  }
  function exportCsv() {
    const { groups, total } = tableModel();
    const n = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');
    const lines = [['Golongan', ...COLS.map((c) => c.t)].join(';')];
    for (const x of groups) {
      for (const [t, r] of x.items) lines.push([GOL[x.g].name, '"' + t + '"', ...COLS.slice(1).map((c) => n(cell(r, c.k)))].join(';'));
      lines.push([GOL[x.g].name, '"JUMLAH ' + x.g + '"', ...COLS.slice(1).map((c) => n(cell(x.sum, c.k)))].join(';'));
    }
    lines.push(['', '"JUMLAH"', ...COLS.slice(1).map((c) => n(cell(total, c.k)))].join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TUL309_${(S.unit || '').replace(/\s+/g, '_')}_${S.ym}_${S.jenis}${S.gol ? '_' + S.gol : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Data Pengusahaan + bagikan WhatsApp ----------
  const AMBANG_TR_TM_KVA = 200; // <= 200 kVA = TR, di atasnya TM
  function maxKva(daya) {
    let max = null;
    for (const m of String(daya).matchAll(/([\d.]+)\s*(k?va)/gi)) {
      const n = parseFloat(m[1].replace(/\./g, ''));
      if (isNaN(n)) continue;
      const kva = m[2].toLowerCase() === 'kva' ? n : n / 1000;
      if (max === null || kva > max) max = kva;
    }
    return max;
  }
  // "> 200 kVA" (tanpa "s.d") berarti semua pelanggan di atas 200 kVA -> TM; "6.600 VA s.d 200 kVA" -> TR.
  function isTM(tarif) {
    const i = tarif.indexOf('/');
    const daya = i < 0 ? '' : tarif.slice(i + 1).replace(/\s+I$/, '').trim();
    if (!daya) return false;
    const openEnded = /^\s*>/.test(daya) && !/s\.?\s*d\.?/i.test(daya);
    const m = maxKva(daya);
    if (m === null) return false;
    return openEnded ? m >= AMBANG_TR_TM_KVA : m > AMBANG_TR_TM_KVA;
  }
  const sumField = (rows, f) => Object.values(rows).reduce((a, r) => a + r[F[f]], 0);

  function pengusahaan() {
    const u = unitData(), mon = u && S.ym && u.months[S.ym];
    if (!mon) return null;
    const split = !!(mon.NORMAL && mon.LPB);
    const tot = rowsFor(S.ym, 'TOTAL');
    const yt = ytd('TOTAL', null);
    let tr = 0, tm = 0;
    for (const [t, r] of Object.entries(tot)) (isTM(t) ? (tm += r[F.c]) : (tr += r[F.c]));
    const kwhKum = yt[F.kwh], rpKum = yt[F.rp];
    return {
      unit: S.unit, bulan: ymLabel(S.ym), split,
      pasca: split ? sumField(rowsFor(S.ym, 'NORMAL'), 'c') : null,
      pra: split ? sumField(rowsFor(S.ym, 'LPB'), 'c') : null,
      dayaKva: sumField(tot, 'va') / 1000,
      mwhKini: sumField(tot, 'kwh') / 1000, mwhKum: kwhKum / 1000,
      rpKini: sumField(tot, 'rp'), rpKum,
      bpp: kwhKum ? rpKum / kwhKum : 0,
      tr, tm,
    };
  }

  function pengusahaanText(p) {
    const L = (k, v) => `${k} : ${v}`;
    const lines = [`*DATA PENGUSAHAAN* — ${p.bulan}`, p.unit, '', '*TRANSAKSI ENERGI*'];
    if (p.split) lines.push(L('Pelanggan Pascabayar', fmt(p.pasca)), L('Pelanggan Prabayar', fmt(p.pra)));
    lines.push(
      L('Daya Tersambung (kVA)', fmt(p.dayaKva)),
      L('Penjualan (MWh)', `${fmt(p.mwhKini, 3)} (Kini)  ${fmt(p.mwhKum, 3)} (Kum)`),
      L('Pendapatan (Rp)', `${fmt(p.rpKini)} (Kini)  ${fmt(p.rpKum)} (Kum)`),
      L('Rp/kWh', fmt(p.bpp, 2)),
      L('Pelanggan TR', fmt(p.tr)),
      L('Pelanggan TM', fmt(p.tm)),
    );
    return lines.join('\n');
  }

  function renderPng() {
    const p = pengusahaan();
    $('cardPng').hidden = !p;
    if (!p) { S.pngText = ''; return; }
    S.pngText = pengusahaanText(p);
    $('pngHint').textContent = `${p.unit} · ${p.bulan}`;
    const svg = pengSvg(p);
    S.pngSvg = svg;
    $('pngBody').innerHTML = `<div class="peng-wrap">${svg}</div>`;
  }

  // ---- infografis Data Pengusahaan (SVG -> PNG untuk PPT) ----
  const PW = 1600, PH = 900;
  function pengSvg(p) {
    const INK = '#0f172a', MUT = '#64748b', CARD = '#f1f5f9', BLUE = '#2a78d6', ORG = '#eb6834', GRN = '#1baf7a', VIO = '#6250d6', AMB = '#eda100';
    const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const T = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${o.s || 20}" font-weight="${o.w || 500}" fill="${o.c || INK}" text-anchor="${o.a || 'start'}">${esc(t)}</text>`;
    const o = [`<rect width="${PW}" height="${PH}" fill="#fff"/>`, `<rect width="${PW}" height="12" fill="${BLUE}"/>`];
    o.push(T(60, 90, 'Data Pengusahaan', { s: 46, w: 800 }));
    o.push(T(60, 130, `${p.unit} · ${p.bulan}`, { s: 24, w: 600, c: MUT }));
    o.push(`<rect x="${PW - 330}" y="52" width="270" height="44" rx="22" fill="${CARD}"/>` + T(PW - 195, 82, 'Transaksi Energi', { s: 20, w: 700, c: BLUE, a: 'middle' }));
    // kartu utama
    const hero = [
      { c: BLUE, t: 'Penjualan', u: 'MWh', a: fmt(p.mwhKini, 3), b: fmt(p.mwhKum, 3) },
      { c: GRN, t: 'Pendapatan', u: 'Rp', a: fmt(p.rpKini), b: fmt(p.rpKum) },
      { c: ORG, t: 'Harga jual rata-rata', u: 'Rp/kWh', a: fmt(p.bpp, 2), b: null },
    ];
    const hw = 480, hg = 30, hy = 175, hh = 322;
    hero.forEach((h, i) => {
      const x = 60 + i * (hw + hg);
      o.push(`<rect x="${x}" y="${hy}" width="${hw}" height="${hh}" rx="22" fill="${CARD}"/><rect x="${x}" y="${hy + 28}" width="8" height="${hh - 56}" rx="4" fill="${h.c}"/>`);
      o.push(T(x + 36, hy + 58, h.t, { s: 24, w: 700, c: MUT }) + T(x + hw - 30, hy + 58, h.u, { s: 22, w: 700, c: h.c, a: 'end' }));
      if (h.b === null) {
        o.push(T(x + 36, hy + 190, h.a, { s: 84, w: 800 }), T(x + 36, hy + 250, 'kumulatif sampai bulan ini', { s: 22, w: 500, c: MUT }));
      } else {
        o.push(T(x + 36, hy + 150, h.a, { s: h.a.length > 15 ? 40 : h.a.length > 11 ? 46 : 60, w: 800 }), T(x + 36, hy + 184, 'bulan ini', { s: 20, w: 600, c: MUT }));
        o.push(`<line x1="${x + 36}" x2="${x + hw - 30}" y1="${hy + 206}" y2="${hy + 206}" stroke="#cbd5e1" stroke-width="2"/>`);
        o.push(T(x + 36, hy + 258, h.b, { s: h.b.length > 15 ? 30 : 36, w: 700, c: h.c }), T(x + 36, hy + 284, 'kumulatif', { s: 20, w: 600, c: MUT }));
      }
    });
    // pelanggan & daya
    const tiles = [];
    if (p.split) tiles.push({ c: BLUE, t: 'Pelanggan Pascabayar', v: fmt(p.pasca), u: 'pelanggan' }, { c: GRN, t: 'Pelanggan Prabayar', v: fmt(p.pra), u: 'pelanggan' });
    tiles.push({ c: VIO, t: 'Pelanggan TR', v: fmt(p.tr), u: '≤ 200 kVA' }, { c: AMB, t: 'Pelanggan TM', v: fmt(p.tm), u: '> 200 kVA' }, { c: ORG, t: 'Daya Tersambung', v: fmt(p.dayaKva), u: 'kVA' });
    o.push(T(60, 540, 'Pelanggan & daya tersambung', { s: 26, w: 800 }));
    const n = tiles.length, tg = 24, tw = (PW - 120 - tg * (n - 1)) / n, ty = 570, th = 230;
    tiles.forEach((t, i) => {
      const x = 60 + i * (tw + tg);
      o.push(`<rect x="${x}" y="${ty}" width="${tw}" height="${th}" rx="20" fill="${CARD}"/><rect x="${x}" y="${ty}" width="${tw}" height="8" rx="4" fill="${t.c}"/>`);
      o.push(T(x + 26, ty + 62, t.t, { s: 21, w: 700, c: MUT }), T(x + 26, ty + 150, t.v, { s: t.v.length > 9 ? 44 : 54, w: 800 }), T(x + 26, ty + 195, t.u, { s: 21, w: 600, c: t.c }));
    });
    o.push(T(60, PH - 28, 'Sumber: TUL III-09 · PLN UP3 Mamuju · Dashboard TE', { s: 18, c: MUT }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" font-family="${FONT}">${o.join('')}</svg>`;
  }
  function pengPng() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = PW * 2; cv.height = PH * 2;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
      };
      img.onerror = () => reject(new Error('svg'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.pngSvg);
    });
  }
  async function copyPengImage() {
    const btn = $('pngImg');
    try {
      if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pengPng() })]);
      flash(btn, 'Tersalin ✓ — tempel di PPT');
    } catch (e) {
      try {
        const blob = await pengPng(), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'data-pengusahaan.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        flash(btn, 'Salin tidak didukung — gambar diunduh');
      } catch (e2) { flash(btn, 'Gagal'); }
    }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }
  function flash(btn, msg) {
    const old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old; btn.textContent = msg;
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = old; }, 1600);
  }

  // ---------- main ----------
  function render() {
    syncFilters();
    const u = unitData();
    if (!u || !S.ym) { $('kpis').innerHTML = '<div class="empty">Belum ada data</div>'; return; }
    renderMeta(); renderKpis(); renderPng(); renderTrend(); renderCmp(); renderGol(); renderMix(); renderTop(); renderTable();
  }

  function bind() {
    $('fLevel').onchange = (e) => { S.level = e.target.value; S.unit = null; S.gol = null; render(); };
    $('fUnit').onchange = (e) => { S.unit = e.target.value; render(); };
    $('fYear').onchange = (e) => { S.year = e.target.value; S.ym = null; render(); };
    $('fMonth').onchange = (e) => { S.ym = e.target.value; render(); };
    bindSeg('fJenis', 'jenis'); bindSeg('tMetric', 'tMetric'); bindSeg('gMetric', 'gMetric');
    bindSeg('gPeriod', 'gPeriod'); bindSeg('topMetric', 'topMetric'); bindSeg('cMetric', 'cMetric');
    $('q').oninput = (e) => { S.q = e.target.value; renderTable(); };
    $('hideZero').onchange = (e) => { S.hideZero = e.target.checked; renderTable(); };
    $('csvBtn').onclick = exportCsv;
    $('waBtn').onclick = () => { if (S.pngText) window.open('https://wa.me/?text=' + encodeURIComponent(S.pngText), '_blank', 'noopener'); };
    $('pngImg').onclick = copyPengImage;
    $('pngCopy').onclick = () => { if (S.pngText) copyText(S.pngText).then(() => flash($('pngCopy'), 'Tersalin ✓'), () => flash($('pngCopy'), 'Gagal menyalin')); };
    const onTbl = (e) => {
      const th = e.target.closest('th');
      if (th) {
        const k = th.dataset.k;
        S.sort = !S.sort || S.sort.k !== k ? { k, dir: k === 'tarif' ? 1 : -1 } : S.sort.dir === -1 && k !== 'tarif' ? { k, dir: 1 } : null;
        renderTable(); return;
      }
      const tr = e.target.closest('tr.grp');
      if (tr) { const g = tr.dataset.g; S.closed.has(g) ? S.closed.delete(g) : S.closed.add(g); renderTable(); }
    };
    $('tbl').addEventListener('click', onTbl);
    $('tbl').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTbl(e); } });
    $('themeBtn').onclick = () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (err) { /* abaikan */ }
      render();
    };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => Object.values(charts).forEach((c) => c.resize()), 120); });
  }

  // ---------- muat data ----------
  // dibaca halaman Beranda: ringkasan penjualan UP3 (tidak bergantung pada filter yang sedang dipilih)
  let tulResolve;
  window.DashTulReady = new Promise((res) => { tulResolve = res; });
  window.DashTulKpi = () => {
    if (!DATA) return null;
    const unit = realUnits('UP')[0], u = unit && DATA.levels.UP[unit];
    if (!u) return null;
    const yms = Object.keys(u.months).sort(), ym = yms[yms.length - 1];
    if (!ym) return null;
    const sum = (m, jenis) => { const s = zero(); for (const r of Object.values(rowsFor(m, jenis, u))) for (let i = 0; i < s.length; i++) s[i] += r[i]; return s; };
    const pick = (s) => ({ kwh: s[F.kwh], rp: s[F.rp], c: s[F.c], va: s[F.va] });
    const cur = sum(ym, 'TOTAL'), pm = yms[yms.length - 2], prev = pm ? sum(pm, 'TOTAL') : null;
    const kum = zero();
    for (const m of yms) if (m.startsWith(ym.slice(0, 4)) && m <= ym) { const a = sum(m, 'TOTAL'); for (let i = 0; i < kum.length; i++) kum[i] += a[i]; }
    const split = !!(u.months[ym].NORMAL && u.months[ym].LPB);
    return { unit, ym, label: ymLabel(ym), prevLabel: pm ? ymLabel(pm) : null, cur: pick(cur), prev: prev && pick(prev), kum: pick(kum),
      bpp: kum[F.kwh] ? kum[F.rp] / kum[F.kwh] : 0, pasca: split ? sum(ym, 'NORMAL')[F.c] : null, pra: split ? sum(ym, 'LPB')[F.c] : null, generated_at: DATA.generated_at };
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function setData(d) {
    DATA = clone(d);
    F = { names: DATA.fields };
    DATA.fields.forEach((f, i) => (F[f] = i));
    buildMerged();
    if (!Object.keys(DATA.levels[S.level] || {}).length) S.level = Object.keys(DATA.levels).find((l) => Object.keys(DATA.levels[l]).length) || 'UP';
    const gen = new Date(DATA.generated_at);
    $('foot').innerHTML = `Sumber: Laporan TUL III-09 (Lampiran 1) · Total = Pascabayar + Prabayar (bila rincian tersedia) · Data diperbarui ${gen.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
  }

  DashAuth.ready
    // tunggu huruf Inter siap (maks 1,5 dtk) agar label grafik diukur dengan huruf yang benar
    .then(() => Promise.race([document.fonts ? Promise.all(['400 12px Inter', '500 12px Inter', '600 12px Inter', '700 12px Inter'].map((f) => document.fonts.load(f))) : null, new Promise((r) => setTimeout(r, 2500))]))
    .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'main').maybeSingle())
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      if (!data) throw new Error('data belum tersedia — sinkronisasi pertama dari Drive belum berjalan');
      setData(data.data);
      tulResolve(true);
      readHash();
      bind();
      render();
      $('loading').classList.add('hide');
    })
    .catch((err) => {
      $('loading').classList.remove('hide');
      $('loading').innerHTML = `<div style="text-align:center">Gagal memuat data (${esc(err.message)}).</div>`;
    });
})();
