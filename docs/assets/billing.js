/* Transaksi Energi > Mon Billing: ringkasan monitoring billing (agregat per ULP, tarif, kualitas pembacaan).
   Data: tabel Supabase tul_data, baris id = 'billing' (diisi otomatis oleh sync_drive.py dari folder "Mon Billing").
   Tidak ada nama/alamat/ID pelanggan di data ini. Hash: #billing */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const B = { dk: '', du: '', dq: '', dp: 0, ym: null, uMetric: 'kwh', tMetric: 'kwh', trMetric: 'kwh' };
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
      xAxis: { type: 'value', splitNumber: $(id).clientWidth < 500 ? 3 : 5, axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => m.c(v) }, splitLine: { lineStyle: { color: css('--grid') } } },
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

  function renderTrend(p) {
    $('bCardTrend').hidden = D.order.length < 2;
    if (D.order.length < 2) return;
    const m = MET[B.trMetric], xs = D.order, ys = xs.map((k) => m.g(D.periods[k].total));
    chart('bChTrend').setOption(Object.assign(base(), {
      grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => `<b>${esc(D.periods[xs[ps[0].dataIndex]].label)}</b>` + ttRow(m.t, m.f(ps[0].value), css('--s1')) }),
      xAxis: { type: 'category', data: xs.map((k) => D.periods[k].label.split(' ')[0].slice(0, 3)), axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--muted'), fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: css('--muted'), fontSize: 11, formatter: (v) => m.c(v) }, splitLine: { lineStyle: { color: css('--grid') } } },
      series: [{ type: 'bar', barMaxWidth: 28, data: ys.map((v, i) => ({ value: v, itemStyle: { color: xs[i] === B.ym ? css('--s1') : css('--s1'), opacity: xs[i] === B.ym ? 1 : 0.45, borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', color: css('--ink-2'), fontSize: 11, formatter: (q) => m.c(q.value) } }],
    }), true);
  }

  function renderAll() {
    const p = per(), pv = prevP();
    $('bCrumb').innerHTML = `<span>Transaksi Energi</span><i>›</i><b>Mon Billing</b>`;
    const sel = $('bPeriod');
    sel.innerHTML = D.order.map((k) => `<option value="${k}"${k === B.ym ? ' selected' : ''}>${esc(D.periods[k].label)}</option>`).join('');
    sel.hidden = D.order.length < 2;
    $('bMeta').innerHTML = `<span class="chip">Periode ${esc(p.label)}</span><span class="chip">${fmt(p.total.n)} pelanggan</span>` +
      (p.dup ? `<span class="chip warn">${fmt(p.dup)} baris ganda dilewati</span>` : '');
    renderKpis(p, pv); renderUlp(p); renderTarif(p); renderQual(p); renderTrend(p);
    const gen = new Date(D.generated_at);
    $('bFoot').innerHTML = `Sumber: Excel Monitoring Billing (${esc(p.file)}) · Hanya agregat yang ditampilkan — tanpa nama atau ID pelanggan · Pendapatan listrik = komponen energi (rppln); Tagihan = rptag, termasuk PPJ dan PPN · Data diperbarui ${gen.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
  }

  // ---------- detail pelanggan ----------
  const PAGE = 100;
  const flagLabel = (k) => ((per().flags.find((f) => f.k === k) || {}).label) || k;
  async function loadDetail(ym, k) {
    const key = ym + ':' + k;
    if (!detCache.has(key)) {
      const { data, error } = await DashAuth.sb.from('tul_data').select('data').eq('id', 'bd:' + key).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('daftar pelanggan belum tersedia — tunggu sinkron berikutnya');
      detCache.set(key, data.data);
    }
    return detCache.get(key);
  }
  let detRows = [];
  function filtered() {
    const d = detCache.get(B.ym + ':' + B.dk); if (!d) return [];
    const q = B.dq.trim().toLowerCase(), ix = (c) => d.cols.indexOf(c);
    const iu = ix('ulp'), i1 = ix('idpel'), i2 = ix('nama'), i3 = ix('alamat');
    return d.rows.filter((r) => (!B.du || r[iu] === B.du) && (!q || r[i1].toLowerCase().includes(q) || r[i2].toLowerCase().includes(q) || r[i3].toLowerCase().includes(q)));
  }
  function renderDetail() {
    const d = detCache.get(B.ym + ':' + B.dk); if (!d) return;
    detRows = filtered();
    const pages = Math.max(1, Math.ceil(detRows.length / PAGE));
    B.dp = Math.min(B.dp, pages - 1);
    const H = ['ID pelanggan', 'Nama', 'Alamat', 'ULP', 'Tarif', 'Daya (VA)', 'Kelompok', 'kWh pakai', 'kWh ditagih', 'Jam nyala', 'Tagihan (Rp)', 'Status', 'Status bulan lalu'];
    const NUM = new Set([5, 7, 8, 9, 10]);
    $('bDTbl').innerHTML = `<thead><tr>${H.map((t, i) => `<th${NUM.has(i) ? '' : ' class="l"'}>${t}</th>`).join('')}</tr></thead><tbody>` +
      detRows.slice(B.dp * PAGE, B.dp * PAGE + PAGE).map((r) => '<tr>' + r.map((v, i) => `<td${NUM.has(i) ? '' : ' class="l"'}>${NUM.has(i) ? fmt(v) : esc(v)}</td>`).join('') + '</tr>').join('') +
      (detRows.length ? '' : `<tr><td class="l" colspan="${H.length}">Tidak ada pelanggan yang cocok.</td></tr>`) + '</tbody>';
    $('bDTitle').textContent = 'Detail pelanggan · ' + flagLabel(B.dk);
    $('bDHint').textContent = `${per().label} · ${B.du || 'Semua ULP'} · ${fmt(detRows.length)} pelanggan${B.dq ? ' (hasil pencarian)' : ''} · urut kWh ditagih terbesar`;
    $('bDPage').textContent = `Halaman ${B.dp + 1} dari ${pages}`;
    $('bDPrev').disabled = B.dp === 0; $('bDNext').disabled = B.dp >= pages - 1;
    $('bDCsv').disabled = !detRows.length;
  }
  async function openDetail(k, u, scroll = true) {
    B.dk = k; B.du = u || ''; B.dq = ''; B.dp = 0; $('bDQ').value = '';
    const p = per();
    $('bDFlag').innerHTML = p.flags.map((f) => `<option value="${f.k}"${f.k === k ? ' selected' : ''}${f.n ? '' : ' disabled'}>${esc(f.label)} (${fmt(f.n)})</option>`).join('');
    $('bDUlp').innerHTML = `<option value="">Semua ULP</option>` + p.ulp.map((x) => `<option value="${esc(x.name)}"${x.name === B.du ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    $('bDetail').hidden = false;
    $('bDMsg').hidden = false; $('bDMsg').textContent = 'Memuat daftar pelanggan…';
    $('bDTbl').innerHTML = '';
    if (scroll) $('bDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { await loadDetail(B.ym, B.dk); } catch (e) { $('bDMsg').textContent = 'Gagal memuat (' + e.message + ').'; return; }
    $('bDMsg').hidden = true;
    renderDetail();
  }
  function csvDetail() {
    const d = detCache.get(B.ym + ':' + B.dk); if (!d || !detRows.length) return;
    const H = ['ID Pelanggan', 'Nama', 'Alamat', 'ULP', 'Tarif', 'Daya (VA)', 'Kelompok Baca', 'kWh Pakai', 'kWh Ditagih', 'Jam Nyala', 'Tagihan (Rp)', 'Status', 'Status Bulan Lalu'];
    const txt = (v) => { v = String(v).replace(/"/g, '""'); return '"' + (/^[=+\-@]/.test(v) ? "'" + v : v) + '"'; };
    const lines = [H.join(';')].concat(detRows.map((r) => r.map((v, i) => (i === 0 ? '="' + v + '"' : i >= 5 && i <= 10 && i !== 6 ? String(v) : txt(v))).join(';')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const sl = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    a.download = `MonBilling_${B.ym}_${sl(flagLabel(B.dk))}${B.du ? '_' + sl(B.du) : ''}.csv`;
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

  async function show() {
    window.DashSetView('billing');
    if (location.hash !== '#billing') history.replaceState(null, '', location.pathname + location.search + '#billing');
    $('bMsg').hidden = false; $('bMsg').textContent = 'Memuat data Mon Billing…';
    $('bBody').hidden = true;
    try { await load(); } catch (e) { $('bMsg').textContent = 'Data Mon Billing belum tersedia (' + e.message + ').'; return; }
    $('bMsg').hidden = true; $('bBody').hidden = false;
    if (!B.ym || !D.periods[B.ym]) B.ym = D.order[D.order.length - 1];
    renderAll();
    setTimeout(() => Object.values(charts).forEach((c) => c.resize()), 30);
  }

  function init() {
    bindSeg('bUMetric', 'uMetric', renderUlp);
    bindSeg('bTMetric', 'tMetric', renderTarif);
    bindSeg('bTrMetric', 'trMetric', renderTrend);
    $('bPeriod').onchange = (e) => { B.ym = e.target.value; $('bDetail').hidden = true; renderAll(); };
    const open = (e) => { const b = e.target.closest('button[data-k]'); if (b) openDetail(b.dataset.k, b.dataset.u); };
    $('bQualTbl').addEventListener('click', open);
    $('bKpis').addEventListener('click', open);
    $('bDFlag').onchange = (e) => openDetail(e.target.value, B.du, false);
    $('bDUlp').onchange = (e) => { B.du = e.target.value; B.dp = 0; renderDetail(); };
    let qt = 0;
    $('bDQ').oninput = (e) => { B.dq = e.target.value; B.dp = 0; clearTimeout(qt); qt = setTimeout(renderDetail, 150); };
    $('bDPrev').onclick = () => { B.dp = Math.max(0, B.dp - 1); renderDetail(); };
    $('bDNext').onclick = () => { B.dp += 1; renderDetail(); };
    $('bDCsv').onclick = csvDetail;
    $('bDClose').onclick = () => { $('bDetail').hidden = true; };
    $('subBilling').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]'); if (!b) return;
      const el = document.querySelector(b.dataset.t);
      if (el && !el.hidden) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.body.classList.remove('nav-open');
    });
    window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));
    new MutationObserver(() => { if (D && document.body.dataset.view === 'billing') renderAll(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash === '#billing' && document.body.dataset.view !== 'billing') show(); });
  }

  window.DashBilling = { show };
  init();
})();
