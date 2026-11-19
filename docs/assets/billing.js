/* Transaksi Energi > Mon Billing: ringkasan monitoring billing (agregat per ULP, tarif, kualitas pembacaan).
   Data: tabel Supabase tul_data, baris id = 'billing' (diisi otomatis oleh sync_drive.py dari folder "Mon Billing").
   Daftar pelanggan (bd:/bx:) hanya dibaca saat diminta. Hash: #billing, #billing/<halaman> */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const B = { page: 'ringkasan', du: '', dq: '', dp: 0, ym: null, uMetric: 'kwh', tMetric: 'kwh', trMetric: 'kwh' };
  let D = null, loading = null;
  const charts = {};
  const detCache = new Map();

  const MET = {
    kwh: { t: 'kWh', f: (v) => fmt(v) + ' kWh', c: (v) => (v >= 1e6 ? fmt(v / 1e6, 1) + ' jt' : v >= 1e3 ? fmt(v / 1e3, 0) + ' rb' : fmt(v)), g: (p) => p.kwh },
    rp: { t: 'Rupiah', f: (v) => 'Rp ' + fmt(v), c: (v) => (v >= 1e9 ? fmt(v / 1e9, 1) + ' M' : v >= 1e6 ? fmt(v / 1e6, 0) + ' jt' : fmt(v)), g: (p) => p.rppln },
    n: { t: 'Pelanggan', f: (v) => fmt(v) + ' plg', c: (v) => (v >= 1e3 ? fmt(v / 1e3, 0) + ' rb' : fmt(v)), g: (p) => p.n },
  };

  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'billing').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.order || []).length) throw new Error('belum ada data');
          return (D = data.data);
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

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

  function hbar(id, items, metric, color, height) {
    const m = MET[metric];
    $(id).style.height = height + 'px';
    chart(id).setOption(Object.assign(base(), {
      grid: { left: 8, right: 70, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => { const p = ps[0]; return `<b>${esc(p.name)}</b>` + ttRow(m.t, m.f(p.value), color) + (p.data.share != null ? ttRow('Porsi', fmt(p.data.share, 1) + '%') : ''); },
      }),
      xAxis: { type: 'value', splitNumber: $(id).clientWidth < 500 ? 2 : 5, axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => m.c(v) }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: { type: 'category', inverse: true, data: items.map((x) => x.name), axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } },
      series: [{
        type: 'bar', barMaxWidth: 18, itemStyle: { color, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => m.c(p.value) },
        data: items.map((x) => ({ value: x.v, share: x.share })),
      }],
    }), true);
  }

  // ---------- render ----------
  const ICON = {
    n: 'M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
    kwh: 'M13 2 4 14h7l-1 8 9-12h-7z',
    rp: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15.9V19h-2v-1.1c-1.4-.3-2.5-1.2-2.6-2.7h1.9c.1.7.7 1.2 1.7 1.2 1 0 1.6-.5 1.6-1.1 0-.7-.5-1-1.9-1.4-1.6-.4-3.1-1-3.1-2.7 0-1.3 1-2.2 2.4-2.5V6h2v1.1c1.3.3 2.2 1.2 2.3 2.5h-1.9c-.1-.7-.6-1.1-1.5-1.1-.9 0-1.5.4-1.5 1 0 .6.5.9 1.9 1.3 1.6.4 3.1 1 3.1 2.8 0 1.4-1 2.3-2.4 2.6z',
    avg: 'M3 17h2v4H3zm4-6h2v10H7zm4-4h2v14h-2zm4 6h2v8h-2zm4-8h2v16h-2z',
    va: 'M12 4a9 9 0 0 0-9 9c0 2.5 1 4.8 2.6 6.4l1.4-1.4A7 7 0 1 1 19 13a7 7 0 0 1-2 4.9l1.4 1.4A9 9 0 0 0 12 4zm1 3h-2v6.4l4.2 2.5 1-1.7-3.2-1.9z',
    chk: 'M12 2 1 21h22zm1 16h-2v-2h2zm0-4h-2V9h2z',
  };
  const dl = (v, p, label) => {
    if (!p) return '';
    const ch = (v - p) / Math.abs(p) * 100, cls = Math.abs(ch) < 0.05 ? 'flat' : ch > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■'} ${fmt(Math.abs(ch), 1)}% <span>vs ${esc(label)}</span></span>`;
  };
  const per = () => D.periods[B.ym];
  const prevP = () => { const i = D.order.indexOf(B.ym); return i > 0 ? D.periods[D.order[i - 1]] : null; };
  const rpkwh = (x) => (x.kwh ? x.rppln / x.kwh : 0);

  function renderKpis(p, pv) {
    const t = p.total, q = pv && pv.total, lb = pv ? pv.label : '';
    const dev = p.flags.find((f) => f.k === 'dev50') || { n: 0 };
    const defs = [
      { k: 'n', l: 'Jumlah pelanggan', v: t.n, s: fmt(t.n), u: 'plg', d: q && dl(t.n, q.n, lb), sub: 'Pelanggan yang tertagih bulan ini' },
      { k: 'kwh', l: 'Energi terjual', v: t.kwh, s: fmt(t.kwh / 1e6, 2), u: 'GWh', d: q && dl(t.kwh, q.kwh, lb), sub: fmt(t.kwh) + ' kWh' },
      { k: 'rp', l: 'Pendapatan listrik', v: t.rppln, s: 'Rp ' + fmt(t.rppln / 1e9, 2), u: 'M', d: q && dl(t.rppln, q.rppln, lb), sub: 'Tagihan total Rp ' + fmt(t.rptag / 1e9, 2) + ' M (termasuk PPJ & PPN)' },
      { k: 'avg', l: 'Harga jual rata-rata', v: rpkwh(t), s: fmt(rpkwh(t), 2), u: 'Rp/kWh', d: q && dl(rpkwh(t), rpkwh(q), lb), sub: 'Pendapatan listrik ÷ kWh' },
      { k: 'va', l: 'Daya tersambung', v: t.kva, s: fmt(t.kva / 1e3, 2), u: 'MVA', d: q && dl(t.kva, q.kva, lb), sub: fmt(t.kva) + ' kVA' },
      { k: 'chk', l: 'Selisih > 50% dari rata-rata 3 bulan', v: dev.n, s: fmt(dev.n), u: 'plg', d: q && dl(dev.n, (pv.flags.find((f) => f.k === 'dev50') || {}).n, lb), sub: fmt(dev.n / (t.n || 1) * 100, 1) + '% dari pelanggan · <button type="button" class="b-link" data-k="dev50" data-u="">Lihat detail ›</button>' },
    ];
    $('bKpis').innerHTML = defs.map((d, i) =>
      `<div class="kpi" style="--i:${i}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON[d.k]}"/></svg></span><div class="lbl">${d.l}</div></div>` +
      `<div class="val">${d.s}<small>${d.u}</small></div>${d.d || '<span class="delta flat">— <span>bulan pertama</span></span>'}<div class="ytd">${d.sub}</div></div>`).join('');
  }

  function ulpTable(p) {
    const t = p.total;
    const row = (n, x, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(n)}</td><td>${fmt(x.n)}</td><td>${fmt(x.kwh)}</td><td>${fmt(x.rppln)}</td><td>${fmt(x.rptag)}</td><td>${fmt(rpkwh(x), 2)}</td><td>${fmt(x.kva)}</td></tr>`;
    $('bUlpTbl').innerHTML = `<thead><tr><th>ULP</th><th>Pelanggan</th><th>kWh</th><th>Pendapatan listrik (Rp)</th><th>Tagihan (Rp)</th><th>Rp/kWh</th><th>Daya (kVA)</th></tr></thead><tbody>` +
      p.ulp.map((u) => row(u.name, u)).join('') + row('UP3 Mamuju', t, 'tot') + '</tbody>';
  }

  function renderUlp(p) {
    const g = MET[B.uMetric].g, tot = g(p.total) || 1;
    const items = p.ulp.map((u) => ({ name: u.name, v: g(u), share: g(u) / tot * 100 }));
    hbar('bChUlp', items, B.uMetric, css('--s1'), 60 + items.length * 40);
    ulpTable(p);
  }

  function renderTarif(p) {
    const g = MET[B.tMetric].g, tot = g(p.total) || 1;
    const all = p.tarif.map((x) => ({ name: x.name, v: g(x) })).sort((a, b) => b.v - a.v);
    const top = all.slice(0, 10), rest = all.slice(10).reduce((s, x) => s + x.v, 0);
    if (rest > 0) top.push({ name: 'Lainnya', v: rest });
    top.forEach((x) => { x.share = x.v / tot * 100; });
    hbar('bChTarif', top, B.tMetric, css('--s3'), 60 + top.length * 34);
    $('bTarifHint').textContent = `${all.length} golongan tarif · 10 terbesar menurut ${MET[B.tMetric].t}`;
  }

  function renderQual(p) {
    const heads = p.flags.map((f) => `<th>${esc(f.label)}</th>`).join('');
    const cell = (n, tot, max, k, u) => {
      const pc = tot ? n / tot * 100 : 0, a = max ? Math.min(1, pc / max) * 0.55 : 0;
      return `<td class="qc" style="background:color-mix(in srgb, var(--s2) ${Math.round(a * 100)}%, transparent)">` +
        (n ? `<button type="button" class="qb" data-k="${k}" data-u="${esc(u)}" title="Lihat daftar pelanggan">` : '<span class="qb">') +
        `<b>${fmt(n)}</b><small>${fmt(pc, 1)}%</small>` + (n ? '</button>' : '</span>') + '</td>';
    };
    const maxPc = p.flags.map((f, j) => Math.max(...p.ulp.map((u) => (u.flags[f.k] || 0) / (u.n || 1) * 100), (f.n / (p.total.n || 1)) * 100, 0.0001));
    $('bQualTbl').innerHTML = `<thead><tr><th>ULP</th>${heads}</tr></thead><tbody>` +
      p.ulp.map((u) => `<tr><td>${esc(u.name)}</td>${p.flags.map((f, j) => cell(u.flags[f.k] || 0, u.n, maxPc[j], f.k, u.name)).join('')}</tr>`).join('') +
      `<tr class="tot"><td>UP3 Mamuju</td>${p.flags.map((f, j) => cell(f.n, p.total.n, maxPc[j], f.k, '')).join('')}</tr></tbody>`;
    const tot = p.total.n || 1;
    const items = p.dlpd.map((x) => ({ name: x.label, v: x.n, share: x.n / tot * 100 }));
    hbar('bChDlpd', items, 'n', css('--s4'), 60 + items.length * 36);
  }

  // ---------- util analisis ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const ymShort = (ym) => MON[+ym.slice(4) - 1] + ' ' + ym.slice(2, 4);
  const ULPS = () => { const m = new Map(); D.order.forEach((k) => D.periods[k].ulp.forEach((u) => { if (!m.has(u.code)) m.set(u.code, u.name); })); return [...m].sort((a, b) => a[0].localeCompare(b[0])); };
  const ulpColor = (i) => css('--s' + (i + 1));
  // metrik tren: n, kwh, rp (pendapatan listrik), avg (Rp/kWh)
  const TM = {
    kwh: { t: 'kWh', g: (x) => x.kwh, f: (v) => fmt(v), c: (v) => MET.kwh.c(v) },
    rp: { t: 'Pendapatan listrik', g: (x) => x.rppln, f: (v) => 'Rp ' + fmt(v / 1e9, 2) + ' M', c: (v) => MET.rp.c(v) },
    n: { t: 'Pelanggan', g: (x) => x.n, f: (v) => fmt(v), c: (v) => MET.n.c(v) },
    avg: { t: 'Rp/kWh', g: (x) => (x.kwh ? x.rppln / x.kwh : 0), f: (v) => fmt(v, 1), c: (v) => fmt(v, 0) },
  };
  const pct = (v, p) => (p ? (v - p) / Math.abs(p) * 100 : null);
  const pctCell = (v, p) => {
    const c = pct(v, p); if (c == null) return '<td class="muted">–</td>';
    const cls = Math.abs(c) < 0.05 ? 'flat' : c > 0 ? 'up' : 'down';
    return `<td class="dc ${cls}">${cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■'} ${fmt(Math.abs(c), 1)}%</td>`;
  };
  const sgn = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  const note = (id, html) => { $(id).innerHTML = html ? `<div class="s-msg b-note">${html}</div>` : ''; };

  // ---------- halaman: Tren & perbandingan ----------
  function renderTren() {
    const order = D.order, multi = order.length >= 2;
    note('bTrNote', multi ? '' : 'Tren dan perbandingan baru muncul setelah ada minimal 2 periode data. Saat ini baru ada ' + order.length + '.');
    $('bTrBody').hidden = !multi;
    if (!multi) return;
    const m = TM[B.trMetric], ulps = ULPS();
    const series = ulps.map(([code, name], i) => ({
      name, type: 'line', symbol: 'circle', symbolSize: 8, lineStyle: { width: 2 }, itemStyle: { color: ulpColor(i), borderColor: css('--surface'), borderWidth: 2 }, color: ulpColor(i),
      data: order.map((k) => { const u = D.periods[k].ulp.find((x) => x.code === code); return u ? m.g(u) : null; }),
    }));
    chart('bChTr').setOption(Object.assign(base(), {
      color: ulps.map((_, i) => ulpColor(i)),
      legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      grid: { left: 8, right: 28, top: 40, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (ps) => `<b>${esc(D.periods[order[ps[0].dataIndex]].label)}</b>` + ps.map((p) => ttRow(p.seriesName, p.value == null ? '–' : m.f(p.value), p.color)).join('') }),
      xAxis: { type: 'category', data: order.map(ymShort), boundaryGap: false, axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--muted'), fontSize: 11 } },
      yAxis: { type: 'value', scale: B.trMetric === 'avg', axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => m.c(v) }, splitLine: { lineStyle: { color: css('--grid') } } },
      series,
    }), true);
    $('bTrHint').textContent = `${order.length} periode: ${ymShort(order[0])} – ${ymShort(order[order.length - 1])} · ${m.t}`;
    // tabel: baris = ULP + total, kolom = periode
    const head = `<thead><tr><th>ULP</th>${order.map((k) => `<th class="${k === B.ym ? 'cur' : ''}">${ymShort(k)}</th>`).join('')}<th>vs bulan lalu</th></tr></thead>`;
    const row = (name, vals, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(name)}</td>${vals.map((v, i) => `<td class="${order[i] === B.ym ? 'cur' : ''}">${v == null ? '–' : m.f(v)}</td>`).join('')}` +
      pctCell(vals[vals.length - 1], vals[vals.length - 2]) + '</tr>';
    $('bTrTbl').innerHTML = head + '<tbody>' + ulps.map(([code, name]) => row(name, order.map((k) => { const u = D.periods[k].ulp.find((x) => x.code === code); return u ? m.g(u) : null; }))).join('') +
      row('UP3 Mamuju', order.map((k) => m.g(D.periods[k].total)), 'tot') + '</tbody>';
    // tarif: 10 terbesar menurut periode terakhir
    const last = D.periods[order[order.length - 1]], tops = last.tarif.slice().sort((a, b) => m.g(b) - m.g(a)).slice(0, 10).map((x) => x.name);
    $('bTrTarif').innerHTML = head.replace('<th>ULP</th>', '<th>Tarif</th>') + '<tbody>' + tops.map((t) => row(t, order.map((k) => { const x = D.periods[k].tarif.find((y) => y.name === t); return x ? m.g(x) : null; }))).join('') + '</tbody>';
    // kualitas pembacaan per bulan
    const fl = last.flags.map((f) => f.k);
    $('bTrQual').innerHTML = `<thead><tr><th>Penanda</th>${order.map((k) => `<th class="${k === B.ym ? 'cur' : ''}">${ymShort(k)}</th>`).join('')}<th>vs bulan lalu</th></tr></thead><tbody>` +
      fl.map((k) => {
        const vals = order.map((o) => { const f = D.periods[o].flags.find((x) => x.k === k); return f ? f.n : null; });
        return `<tr><td>${esc(last.flags.find((f) => f.k === k).label)}</td>${vals.map((v, i) => `<td class="${order[i] === B.ym ? 'cur' : ''}">${v == null ? '–' : fmt(v)}</td>`).join('')}${pctCell(vals[vals.length - 1], vals[vals.length - 2])}</tr>`;
      }).join('') + '</tbody>';
  }

  // ---------- halaman: Penyebab naik/turun ----------
  const pairOf = () => (D.analytics && D.analytics.pairs && D.analytics.pairs[B.ym]) || null;
  function dbar(id, items, h) {
    $(id).style.height = h + 'px';
    const up = css('--up'), dn = css('--down');
    chart(id).setOption(Object.assign(base(), {
      grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => { const p = ps[0]; return `<b>${esc(p.name)}</b>` + ttRow('Perubahan kWh', (p.value >= 0 ? '▲ ' : '▼ ') + sgn(p.value) + ' kWh', p.value >= 0 ? up : dn) + (p.data.sub ? `<div style="color:${css('--muted')}">${esc(p.data.sub)}</div>` : ''); } }),
      xAxis: { type: 'value', splitNumber: $(id).clientWidth < 500 ? 2 : 5, axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => (v < 0 ? '−' : '') + MET.kwh.c(Math.abs(v)) }, splitLine: { lineStyle: { color: css('--grid') } } },
      yAxis: { type: 'category', inverse: true, data: items.map((x) => x.name), axisLine: { onZero: true, lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 }, position: 'left' },
      series: [{ type: 'bar', barMaxWidth: 18, label: { show: true, position: 'right', color: css('--ink-2'), fontSize: 11, formatter: (p) => (p.value >= 0 ? '▲ ' : '▼ ') + MET.kwh.c(Math.abs(p.value)) },
        data: items.map((x) => ({ value: x.v, sub: x.sub, itemStyle: { color: x.v >= 0 ? up : dn, borderRadius: x.v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })) }],
    }), true);
  }
  function renderSebab() {
    const i = D.order.indexOf(B.ym), pv = i > 0 ? D.periods[D.order[i - 1]] : null, p = per(), pr = pairOf();
    note('bSbNote', pv ? '' : 'Periode ini adalah bulan pertama, belum ada bulan sebelumnya untuk dibandingkan. Pilih periode yang lebih baru.');
    $('bSbBody').hidden = !pv;
    if (!pv) return;
    const T = p.total, Q = pv.total, dk = T.kwh - Q.kwh;
    const kp = [
      { l: 'Perubahan energi', v: sgn(dk), u: 'kWh', d: dl(T.kwh, Q.kwh, pv.label) },
      { l: 'Perubahan pendapatan listrik', v: sgn((T.rppln - Q.rppln) / 1e6, 1), u: 'juta Rp', d: dl(T.rppln, Q.rppln, pv.label) },
      { l: 'Perubahan pelanggan', v: sgn(T.n - Q.n), u: 'plg', d: dl(T.n, Q.n, pv.label) },
      { l: 'Perubahan Rp/kWh', v: sgn(rpkwh(T) - rpkwh(Q), 2), u: 'Rp/kWh', d: dl(rpkwh(T), rpkwh(Q), pv.label) },
    ];
    $('bSbKpis').innerHTML = kp.map((d, k) => `<div class="kpi" style="--i:${k}"><div class="kpi-top"><div class="lbl">${d.l}</div></div><div class="val">${d.v}<small>${d.u}</small></div>${d.d}<div class="ytd">${esc(pv.label)} → ${esc(p.label)}</div></div>`).join('');
    // dekomposisi berdasarkan pelanggan (butuh analisis lintas bulan)
    if (pr) {
      const t = pr.total;
      const items = [
        { name: 'Pelanggan baru', v: t.baru.kwh, sub: fmt(t.baru.n) + ' pelanggan' },
        { name: 'Pelanggan hilang', v: -t.hilang.kwh, sub: fmt(t.hilang.n) + ' pelanggan' },
        { name: 'Tetap, pemakaian naik', v: t.naik.kwh, sub: fmt(t.naik.n) + ' pelanggan' },
        { name: 'Tetap, pemakaian turun', v: t.turun.kwh, sub: fmt(t.turun.n) + ' pelanggan' },
      ];
      dbar('bSbChCust', items, 60 + items.length * 44);
      const sum = items.reduce((s, x) => s + x.v, 0);
      $('bSbCustHint').textContent = `Jumlah keempat batang = ${sgn(sum)} kWh (selisih dengan perubahan total ${sgn(dk)} kWh hanya pembulatan)`;
      $('bSbCust').hidden = false;
    } else { $('bSbCust').hidden = true; }
    // per ULP
    const ulps = ULPS(), rows = ulps.map(([code, name]) => {
      const a = pv.ulp.find((x) => x.code === code) || { n: 0, kwh: 0 }, b = p.ulp.find((x) => x.code === code) || { n: 0, kwh: 0 };
      const per0 = a.n ? a.kwh / a.n : 0, vol = (b.n - a.n) * per0, use = (b.kwh - a.kwh) - vol, pp = pr && pr.ulp[name];
      return { name, a, b, d: b.kwh - a.kwh, vol, use, pp };
    });
    dbar('bSbChUlp', rows.map((r) => ({ name: r.name, v: r.d, sub: `Pelanggan ${sgn(r.b.n - r.a.n)} · ${fmt(pct(r.b.kwh, r.a.kwh), 1)}%` })), 60 + rows.length * 40);
    $('bSbUlpTbl').innerHTML = `<thead><tr><th>ULP</th><th>kWh ${esc(ymShort(pv.ym))}</th><th>kWh ${esc(ymShort(p.ym))}</th><th>Δ kWh</th><th>Δ %</th><th>Karena jumlah pelanggan</th><th>Karena pemakaian per pelanggan</th>${pr ? '<th>Baru (kWh)</th><th>Hilang (kWh)</th>' : ''}</tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${fmt(r.a.kwh)}</td><td>${fmt(r.b.kwh)}</td><td class="dc ${r.d >= 0 ? 'up' : 'down'}">${sgn(r.d)}</td>${pctCell(r.b.kwh, r.a.kwh)}<td>${sgn(r.vol)}</td><td>${sgn(r.use)}</td>` +
        (pr ? `<td>${r.pp ? sgn(r.pp.baru.kwh) : '–'}</td><td>${r.pp ? sgn(-r.pp.hilang.kwh) : '–'}</td>` : '') + '</tr>').join('') +
      `<tr class="tot"><td>UP3 Mamuju</td><td>${fmt(Q.kwh)}</td><td>${fmt(T.kwh)}</td><td class="dc ${dk >= 0 ? 'up' : 'down'}">${sgn(dk)}</td>${pctCell(T.kwh, Q.kwh)}<td>${sgn(rows.reduce((s, r) => s + r.vol, 0))}</td><td>${sgn(rows.reduce((s, r) => s + r.use, 0))}</td>${pr ? `<td>${sgn(pr.total.baru.kwh)}</td><td>${sgn(-pr.total.hilang.kwh)}</td>` : ''}</tr></tbody>`;
    // per tarif: 10 kontribusi terbesar (nilai mutlak)
    const names = [...new Set([...p.tarif.map((x) => x.name), ...pv.tarif.map((x) => x.name)])];
    const tr = names.map((n) => { const a = pv.tarif.find((x) => x.name === n) || { kwh: 0, n: 0 }, b = p.tarif.find((x) => x.name === n) || { kwh: 0, n: 0 }; return { name: n, d: b.kwh - a.kwh, a, b }; })
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 10);
    dbar('bSbChTarif', tr.map((r) => ({ name: r.name, v: r.d, sub: `Pelanggan ${sgn(r.b.n - r.a.n)} · ${fmt(r.a.kwh)} → ${fmt(r.b.kwh)} kWh` })), 60 + tr.length * 34);
  }

  // ---------- halaman: Anomali berulang ----------
  const ANOM_BTN = (k, n, label) => (n && B.ym === D.analytics.latest ? `<button type="button" class="qb" data-x="${k}" title="Lihat daftar pelanggan">${label}</button>` : label);
  function renderAnomali() {
    const A = D.analytics, order = D.order;
    if (!A) {
      note('bAnNote', 'Analisis berulang membutuhkan data minimal 2 bulan (3 bulan untuk pemakaian naik/turun). Saat ini data belum cukup atau analisis belum selesai diproses oleh sinkron.');
      $('bAnBody').hidden = true; return;
    }
    const lat = A.anom[A.latest] || {}, short = (lat.turun == null || lat.naik == null);
    note('bAnNote', [B.ym === A.latest ? '' : `Daftar pelanggan hanya tersedia untuk periode terbaru (${D.periods[A.latest].label}). Pilih periode itu untuk melihat dan mengunduh daftarnya; angka bulan lain tetap ditampilkan.`,
      short ? 'Pemakaian naik/turun drastis dihitung untuk pelanggan yang berulang 3 bulan berturut-turut dan dibandingkan dengan rata-rata bulan sebelumnya, sehingga butuh minimal 5 bulan data. Angkanya muncul otomatis setelah data cukup.' : ''].filter(Boolean).join('<br>'));
    $('bAnBody').hidden = false;
    const cur = A.anom[B.ym] || {}, i = order.indexOf(B.ym), prv = i > 0 ? A.anom[order[i - 1]] : null, n = D.periods[B.ym].total.n || 1;
    $('bAnKpis').innerHTML = A.rules.map((r, k) => {
      const v = cur[r.k], pv = prv ? prv[r.k] : null;
      return `<div class="kpi" style="--i:${k}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON.chk}"/></svg></span><div class="lbl">${esc(r.label)}</div></div>` +
        `<div class="val">${v == null ? '–' : fmt(v)}<small>plg</small></div>${v == null ? '<span class="delta flat">— <span>riwayat belum cukup</span></span>' : (pv != null ? dl(v, pv, ymShort(order[i - 1])) : '')}` +
        `<div class="ytd">${v == null ? '&nbsp;' : fmt(v / n * 100, 2) + '% dari pelanggan' + (v && B.ym === A.latest ? ` · <button type="button" class="b-link" data-x="${r.k}">Lihat daftar ›</button>` : '')}</div></div>`;
    }).join('');
    $('bAnRules').innerHTML = A.rules.map((r) => `<li><b>${esc(r.label)}</b> — ${esc(r.rule)}</li>`).join('');
    $('bAnTbl').innerHTML = `<thead><tr><th>Penanda</th>${order.map((k) => `<th class="${k === B.ym ? 'cur' : ''}">${ymShort(k)}</th>`).join('')}</tr></thead><tbody>` +
      A.rules.map((r) => `<tr><td>${esc(r.label)}</td>${order.map((k) => { const v = (A.anom[k] || {})[r.k]; return `<td class="${k === B.ym ? 'cur' : ''}">${v == null ? '–' : fmt(v)}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
  }

  // ---------- halaman: Pelanggan baru / hilang / berubah ----------
  function renderPelanggan() {
    const A = D.analytics, pr = pairOf(), order = D.order, i = order.indexOf(B.ym);
    if (!A || !pr) {
      note('bPlNote', i <= 0 ? 'Periode ini adalah bulan pertama, belum ada bulan sebelumnya untuk dibandingkan. Pilih periode yang lebih baru.' : 'Analisis pelanggan antar bulan belum tersedia (menunggu sinkron).');
      $('bPlBody').hidden = true; return;
    }
    note('bPlNote', B.ym === A.latest ? '' : `Daftar pelanggan hanya tersedia untuk periode terbaru (${D.periods[A.latest].label}). Angka bulan lain tetap ditampilkan.`);
    $('bPlBody').hidden = false;
    const t = pr.total, pvl = D.periods[order[i - 1]].label, nett = t.baru.n - t.hilang.n;
    const defs = [
      { k: 'baru', l: 'Pelanggan baru', v: fmt(t.baru.n), sub: sgn(t.baru.kwh) + ' kWh bulan ini' },
      { k: 'hilang', l: 'Pelanggan hilang', v: fmt(t.hilang.n), sub: '−' + fmt(t.hilang.kwh) + ' kWh dibanding bulan lalu' },
      { k: null, l: 'Selisih bersih', v: sgn(nett), sub: `${esc(pvl)} → ${esc(D.periods[B.ym].label)}` },
      { k: 'ganti_tarif', l: 'Pindah golongan tarif', v: fmt(t.ganti_tarif), sub: '' },
      { k: 'ganti_daya', l: 'Ubah daya', v: fmt(t.ganti_daya), sub: '' },
    ];
    $('bPlKpis').innerHTML = defs.map((d, k) => `<div class="kpi" style="--i:${k}"><div class="kpi-top"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICON.n}"/></svg></span><div class="lbl">${d.l}</div></div>` +
      `<div class="val">${d.v}<small>plg</small></div><div class="ytd">${d.sub}${d.k && B.ym === A.latest && +d.v.replace(/\D/g, '') ? `${d.sub ? ' · ' : ''}<button type="button" class="b-link" data-x="${d.k}">Lihat daftar ›</button>` : ''}</div></div>`).join('');
    const ulps = ULPS().map((u) => u[1]);
    const row = (name, x, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(name)}</td><td>${fmt(x.baru.n)}</td><td>${fmt(x.hilang.n)}</td><td class="dc ${x.baru.n - x.hilang.n >= 0 ? 'up' : 'down'}">${sgn(x.baru.n - x.hilang.n)}</td><td>${fmt(x.naik.n)}</td><td>${fmt(x.turun.n)}</td><td>${fmt(x.sama)}</td><td>${fmt(x.ganti_tarif)}</td><td>${fmt(x.ganti_daya)}</td></tr>`;
    $('bPlTbl').innerHTML = `<thead><tr><th>ULP</th><th>Baru</th><th>Hilang</th><th>Bersih</th><th>Pemakaian naik (plg)</th><th>Pemakaian turun (plg)</th><th>Pemakaian sama (plg)</th><th>Pindah tarif</th><th>Ubah daya</th></tr></thead><tbody>` +
      ulps.filter((u) => pr.ulp[u]).map((u) => row(u, pr.ulp[u])).join('') + row('UP3 Mamuju', t, 'tot') + '</tbody>';
    const ps = order.filter((k) => A.pairs[k]);
    $('bPlHist').innerHTML = `<thead><tr><th>Periode</th><th>Baru</th><th>Hilang</th><th>Bersih</th><th>Pindah tarif</th><th>Ubah daya</th></tr></thead><tbody>` +
      ps.map((k) => { const x = A.pairs[k].total; return `<tr class="${k === B.ym ? 'curr' : ''}"><td>${ymShort(k)}</td><td>${fmt(x.baru.n)}</td><td>${fmt(x.hilang.n)}</td><td class="dc ${x.baru.n - x.hilang.n >= 0 ? 'up' : 'down'}">${sgn(x.baru.n - x.hilang.n)}</td><td>${fmt(x.ganti_tarif)}</td><td>${fmt(x.ganti_daya)}</td></tr>`; }).join('') + '</tbody>';
  }

  // ---------- halaman ----------
  const PAGES = { ringkasan: () => { const p = per(); renderKpis(p, prevP()); renderUlp(p); renderTarif(p); renderQual(p); $('bMeta').innerHTML = `<span class="chip">Periode ${esc(p.label)}</span><span class="chip">${fmt(p.total.n)} pelanggan</span>` + (p.dup ? `<span class="chip warn">${fmt(p.dup)} baris ganda dilewati</span>` : ''); },
    tren: renderTren, sebab: renderSebab, anomali: renderAnomali, pelanggan: renderPelanggan };
  const TITLE = { ringkasan: 'Ringkasan', tren: 'Tren & perbandingan bulan', sebab: 'Penyebab naik/turun kWh', anomali: 'Anomali berulang', pelanggan: 'Pelanggan baru, hilang, berubah' };
  function renderAll() {
    if (!PAGES[B.page]) B.page = 'ringkasan';
    $('bCrumb').innerHTML = `<span>Transaksi Energi</span><i>›</i><span>Mon Billing</span><i>›</i><b>${TITLE[B.page]}</b>`;
    const sel = $('bPeriod');
    sel.innerHTML = D.order.map((k) => `<option value="${k}"${k === B.ym ? ' selected' : ''}>${esc(D.periods[k].label)}</option>`).join('');
    sel.hidden = D.order.length < 2 || B.page === 'tren';
    document.querySelectorAll('#bBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== B.page; });
    document.querySelectorAll('#subBilling button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === B.page)));
    PAGES[B.page]();
    const p = per(), gen = new Date(D.generated_at);
    $('bFoot').innerHTML = `Sumber: Excel Monitoring Billing (${esc(p.file)}) · Pendapatan listrik = komponen energi (rppln); Tagihan = rptag, termasuk PPJ dan PPN · Data diperbarui ${gen.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
    setTimeout(() => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()), 30);
  }

  // ---------- daftar pelanggan (umum) ----------
  const PAGE = 100;
  const LABEL = { idpel: 'ID pelanggan', nama: 'Nama', alamat: 'Alamat', ulp: 'ULP', tarif: 'Tarif', daya: 'Daya (VA)', kelompok: 'Kelompok', kwh_pakai: 'kWh pakai', kwh_tagih: 'kWh ditagih', jamnyala: 'Jam nyala',
    rptag: 'Tagihan (Rp)', status: 'Status', status_lalu: 'Status bulan lalu', rata_sebelum: 'Rata-rata pembanding', selisih_pct: 'Selisih %', streak_nol: 'Bulan nol berturut', tarif_lama: 'Tarif lama', tarif_baru: 'Tarif baru',
    daya_lama: 'Daya lama (VA)', daya_baru: 'Daya baru (VA)' };
  const NUMK = new Set(['daya', 'kwh_pakai', 'kwh_tagih', 'jamnyala', 'rptag', 'rata_sebelum', 'selisih_pct', 'streak_nol', 'daya_lama', 'daya_baru']);
  const lab = (k) => LABEL[k] || (/^\d{6}$/.test(k) ? 'kWh ' + ymShort(k) : k);
  const isNum = (k) => NUMK.has(k) || /^\d{6}$/.test(k);
  const cell = (k, v) => (v == null || v === '' ? '–' : isNum(k) ? (k === 'selisih_pct' ? (v > 0 ? '+' : '') + fmt(v) + '%' : fmt(v)) : esc(v));
  const DOC = { id: '', title: '', file: '', flags: false };
  async function loadDoc(id) {
    if (!detCache.has(id)) {
      const { data, error } = await DashAuth.sb.from('tul_data').select('data').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('daftar pelanggan belum tersedia — tunggu sinkron berikutnya');
      detCache.set(id, data.data);
    }
    return detCache.get(id);
  }
  let detRows = [];
  function filtered() {
    const d = detCache.get(DOC.id); if (!d) return [];
    const q = B.dq.trim().toLowerCase(), ix = (c) => d.cols.indexOf(c);
    const iu = ix('ulp'), i1 = ix('idpel'), i2 = ix('nama'), i3 = ix('alamat');
    return d.rows.filter((r) => (!B.du || r[iu] === B.du) && (!q || String(r[i1]).toLowerCase().includes(q) || String(r[i2]).toLowerCase().includes(q) || String(r[i3]).toLowerCase().includes(q)));
  }
  function renderDetail() {
    const d = detCache.get(DOC.id); if (!d) return;
    detRows = filtered();
    const pages = Math.max(1, Math.ceil(detRows.length / PAGE));
    B.dp = Math.min(B.dp, pages - 1);
    $('bDTbl').innerHTML = `<thead><tr>${d.cols.map((k) => `<th${isNum(k) ? '' : ' class="l"'}>${esc(lab(k))}</th>`).join('')}</tr></thead><tbody>` +
      detRows.slice(B.dp * PAGE, B.dp * PAGE + PAGE).map((r) => '<tr>' + r.map((v, i) => `<td${isNum(d.cols[i]) ? '' : ' class="l"'}>${cell(d.cols[i], v)}</td>`).join('') + '</tr>').join('') +
      (detRows.length ? '' : `<tr><td class="l" colspan="${d.cols.length}">Tidak ada pelanggan yang cocok.</td></tr>`) + '</tbody>';
    $('bDTitle').textContent = 'Detail pelanggan · ' + DOC.title;
    $('bDHint').textContent = `${DOC.period} · ${B.du || 'Semua ULP'} · ${fmt(detRows.length)} pelanggan${B.dq ? ' (hasil pencarian)' : ''}`;
    $('bDPage').textContent = `Halaman ${B.dp + 1} dari ${pages}`;
    $('bDPrev').disabled = B.dp === 0; $('bDNext').disabled = B.dp >= pages - 1;
    $('bDCsv').disabled = !detRows.length;
  }
  async function openDoc(id, title, period, u, flags, scroll = true) {
    Object.assign(DOC, { id, title, period, flags: !!flags });
    B.du = u || ''; B.dq = ''; B.dp = 0; $('bDQ').value = '';
    const p = per();
    $('bDFlagF').hidden = !flags;
    if (flags) $('bDFlag').innerHTML = p.flags.map((f) => `<option value="${f.k}"${id.endsWith(':' + f.k) ? ' selected' : ''}${f.n ? '' : ' disabled'}>${esc(f.label)} (${fmt(f.n)})</option>`).join('');
    $('bDUlp').innerHTML = `<option value="">Semua ULP</option>` + ULPS().map(([, n]) => `<option value="${esc(n)}"${n === B.du ? ' selected' : ''}>${esc(n)}</option>`).join('');
    $('bDetail').hidden = false;
    $('bDMsg').hidden = false; $('bDMsg').textContent = 'Memuat daftar pelanggan…';
    $('bDTbl').innerHTML = '';
    if (scroll) $('bDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { await loadDoc(id); } catch (e) { $('bDMsg').textContent = 'Gagal memuat (' + e.message + ').'; return; }
    $('bDMsg').hidden = true;
    renderDetail();
  }
  const openFlag = (k, u) => openDoc(`bd:${B.ym}:${k}`, ((per().flags.find((f) => f.k === k) || {}).label) || k, per().label, u, true);
  const XTITLE = { nol_berulang: 'kWh nol berturut-turut', turun: 'Pemakaian turun drastis berulang', naik: 'Pemakaian naik drastis berulang', jn_berulang: 'Jam nyala > 400 berulang',
    baru: 'Pelanggan baru', hilang: 'Pelanggan hilang', ganti_tarif: 'Pindah golongan tarif', ganti_daya: 'Ubah daya' };
  const openX = (k) => openDoc(`bx:${D.analytics.latest}:${k}`, XTITLE[k] || k, D.periods[D.analytics.latest].label, '', false);
  function csvDetail() {
    const d = detCache.get(DOC.id); if (!d || !detRows.length) return;
    const H = d.cols.map((k) => lab(k));
    const txt = (v) => { v = v == null ? '' : String(v).replace(/"/g, '""'); return '"' + (/^[=+\-@]/.test(v) ? "'" + v : v) + '"'; };
    const lines = [H.join(';')].concat(detRows.map((r) => r.map((v, i) => { const k = d.cols[i]; return k === 'idpel' ? '="' + v + '"' : isNum(k) ? (v == null ? '' : String(v)) : txt(v); }).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const sl = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    a.download = `MonBilling_${DOC.id.split(':')[1]}_${sl(DOC.title)}${B.du ? '_' + sl(B.du) : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function bindSeg(id, key, fn) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      B[key] = b.dataset.v;
      $(id).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (D) fn(per());
    });
  }

  const hashPage = () => { const m = location.hash.match(/^#billing(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'ringkasan'; };
  async function show(page) {
    window.DashSetView('billing');
    B.page = page || hashPage();
    const h = '#billing' + (B.page === 'ringkasan' ? '' : '/' + B.page);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    $('bMsg').hidden = false; $('bMsg').textContent = 'Memuat data Mon Billing…';
    $('bBody').hidden = true;
    try { await load(); } catch (e) { $('bMsg').textContent = 'Data Mon Billing belum tersedia (' + e.message + ').'; return; }
    $('bMsg').hidden = true; $('bBody').hidden = false;
    if (!B.ym || !D.periods[B.ym]) B.ym = D.order[D.order.length - 1];
    $('bDetail').hidden = true;
    renderAll();
    window.scrollTo({ top: 0 });
  }

  function init() {
    bindSeg('bUMetric', 'uMetric', renderUlp);
    bindSeg('bTMetric', 'tMetric', renderTarif);
    bindSeg('bTrMetric', 'trMetric', () => renderTren());
    $('bPeriod').onchange = (e) => { B.ym = e.target.value; $('bDetail').hidden = true; renderAll(); };
    $('bQualTbl').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b) openFlag(b.dataset.k, b.dataset.u); });
    $('bKpis').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b) openFlag(b.dataset.k, b.dataset.u); });
    ['bAnKpis', 'bPlKpis'].forEach((id) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-x]'); if (b) openX(b.dataset.x); }));
    $('bDFlag').onchange = (e) => openDoc(`bd:${B.ym}:${e.target.value}`, ((per().flags.find((f) => f.k === e.target.value) || {}).label) || e.target.value, per().label, B.du, true, false);
    $('bDUlp').onchange = (e) => { B.du = e.target.value; B.dp = 0; renderDetail(); };
    let qt = 0;
    $('bDQ').oninput = (e) => { B.dq = e.target.value; B.dp = 0; clearTimeout(qt); qt = setTimeout(renderDetail, 150); };
    $('bDPrev').onclick = () => { B.dp = Math.max(0, B.dp - 1); renderDetail(); };
    $('bDNext').onclick = () => { B.dp += 1; renderDetail(); };
    $('bDCsv').onclick = csvDetail;
    $('bDClose').onclick = () => { $('bDetail').hidden = true; };
    $('subBilling').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]'); if (!b) return;
      document.body.classList.remove('nav-open');
      show(b.dataset.p);
    });
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'billing') renderAll(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#billing') && (document.body.dataset.view !== 'billing' || hashPage() !== B.page)) show(); });
  }

  window.DashBilling = { show };
  init();
})();
