/* Beranda > Pencapaian kinerja per ULP dan UP3 (target sampai 31 Desember tahun berjalan):
   1) Menurunkan susut distribusi  2) Perolehan P2TL (kWh tagihan susulan)  3) Peremajaan kWh meter tua  4) Tindak lanjut LBKB.
   Data dibaca dari sumber yang sama dengan menu masing-masing; satu sumber gagal tidak menghalangi yang lain. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ULPS = ['Manakarra', 'Pasangkayu', 'Majene', 'Wonomulyo', 'Polewali', 'Mamasa'];
  const UP3 = 'UP3 Mamuju';
  const key = (n) => String(n || '').toUpperCase().replace(/^ULP\s+/, '').trim();
  const YEAR = new Date().getFullYear();
  const charts = {};
  let last = null;

  const NOTE = {
    susut: 'Capaian = target susut ÷ susut kumulatif (di atas 100% bila susut lebih rendah dari target; makin rendah susut makin baik).',
    p2tl: 'Target = jumlah target kWh tagihan susulan Januari–Desember; realisasi = kWh tagihan susulan dengan tanggal register tahun ini.',
    gm: 'Target = jumlah target ganti meter Januari–Desember; realisasi = hanya meter kategori tua.',
    lbkb: 'Realisasi bulan terakhir = 100% − (pelanggan berulang 3 bulan berturut-turut + pelanggan berulang > 3 bulan) ÷ pelanggan pascabayar. Pelanggan berulang < 3 kali dihitung tuntas (100%); berulang tepat 3 kali atau lebih tidak tuntas. Capaian dihitung dari realisasi yang dibulatkan terhadap target (bawaan 100% bila Target LBKB belum diisi).',
  };

  async function fetchAll(sb, table, cols) {
    const out = []; let from = 0;
    for (;;) {
      const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...data);
      if (data.length < 1000) return out;
      from += 1000;
    }
  }
  const tul = async (sb, id) => { const r = await sb.from('tul_data').select('data').eq('id', id).maybeSingle(); if (r.error) throw new Error(r.error.message); if (!r.data) throw new Error('belum ada data'); return r.data.data; };

  // ---------- hitung per kartu: baris = { u, t, r, c } (c = capaian %, null bila belum ada target) ----------
  const pct = (r, t) => (t > 0 ? r / t * 100 : null);

  function calcSusut(sm) {
    if (!sm) throw new Error('data susut belum ada');
    const mk = (name, x) => { const kum = x.kum != null ? x.kum : x.kumulatif[sm.last], trg = x.trg; return { u: name, t: trg, r: kum, g: kum - trg, c: kum > 0 && trg > 0 ? trg / kum * 100 : trg > 0 ? 100 : null }; };
    const by = {}; sm.units.forEach((u) => { by[key(u.name)] = u; });
    return { rows: ULPS.map((n) => (by[key(n)] ? mk(n, by[key(n)]) : { u: n, t: null, r: null, g: null, c: null })).concat([mk(UP3, sm.up3)]), sub: `Kumulatif Januari–${sm.monthsFull[sm.last]} ${sm.year || YEAR} dibanding target` };
  }

  async function calcP2tl(sb) {
    const [tg, doc] = await Promise.all([fetchAll(sb, 'ts_targets', 'ulp,bln,target'), tul(sb, 'p2tl_ts')]);
    const T = {}, R = {}, iu = doc.cols.indexOf('ulp'), ik = doc.cols.indexOf('kwh'), ig = doc.cols.indexOf('tgl'), mon = { real: Array(12).fill(0), targ: Array(12).fill(0) };
    tg.filter((x) => String(x.bln).startsWith(String(YEAR))).forEach((x) => { T[key(x.ulp)] = (T[key(x.ulp)] || 0) + +x.target; mon.targ[+String(x.bln).slice(5, 7) - 1] += +x.target; });
    doc.rows.filter((r) => String(r[ig] || '').startsWith(String(YEAR))).forEach((r) => { R[key(r[iu])] = (R[key(r[iu])] || 0) + (+r[ik] || 0); mon.real[+String(r[ig]).slice(5, 7) - 1] += +r[ik] || 0; });
    const mk = (n, t, r) => ({ u: n, t, r, c: pct(r, t) });
    const rows = ULPS.map((n) => mk(n, T[key(n)] || 0, R[key(n)] || 0));
    rows.push(mk(UP3, rows.reduce((s, x) => s + x.t, 0), rows.reduce((s, x) => s + x.r, 0)));
    return { rows, mon, gen: doc.generated_at, sub: `kWh tagihan susulan tahun ${YEAR} dibanding target` };
  }

  async function calcGm(sb, gm) {
    if (!gm) throw new Error('data ganti meter belum ada');
    const tg = await fetchAll(sb, 'gm_targets', 'ulp,bln,target');
    const T = {}, R = {};
    tg.filter((x) => String(x.bln).startsWith(String(YEAR))).forEach((x) => { T[key(x.ulp)] = (T[key(x.ulp)] || 0) + +x.target; });
    Object.entries(gm.months).filter(([k]) => k.startsWith(String(YEAR))).forEach(([, m]) => m.ulp.forEach((u) => { R[key(u.name)] = (R[key(u.name)] || 0) + (u.tua || 0); }));
    const mk = (n, t, r) => ({ u: n, t, r, c: pct(r, t) });
    const rows = ULPS.map((n) => mk(n, T[key(n)] || 0, R[key(n)] || 0));
    rows.push(mk(UP3, rows.reduce((s, x) => s + x.t, 0), rows.reduce((s, x) => s + x.r, 0)));
    return { rows, sub: `Meter kategori tua yang sudah diganti tahun ${YEAR} dibanding target` };
  }

  const nextYm = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(4); return `${y + (m === 12 ? 1 : 0)}${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; };
  async function calcLbkb(sb, billing) {
    const [doc, tdoc] = await Promise.all([tul(sb, 'lbkb'), tul(sb, 'lbkb_target').catch(() => null)]);
    if (!billing) throw new Error('jumlah pelanggan pascabayar (Mon Billing) belum ada');
    const bp = billing.periods[billing.order[billing.order.length - 1]], P = {};
    bp.ulp.forEach((u) => { P[key(u.name)] = u.n; });
    const months = doc.months, li = months.length - 1, W = new Set(doc.watch), n3 = {}, n4 = {};
    doc.rows.forEach((r) => {
      const codes = r[5]; let i = li, n = 0;
      while (i >= 0 && W.has(codes[i])) { n++; if (i === 0 || nextYm(months[i - 1]) !== months[i]) break; i--; }
      const k = key(r[2]);
      if (n === 3) n3[k] = (n3[k] || 0) + 1; else if (n > 3) n4[k] = (n4[k] || 0) + 1;
    });
    const T = {};
    ((tdoc && tdoc.targets) || []).filter((x) => String(x.bln).startsWith(String(YEAR))).sort((a, b) => (a.bln < b.bln ? -1 : 1)).forEach((x) => { T[key(x.ulp)] = +x.target; });   // nilai bulan terakhir yang diisi (Desember bila ada)
    const mk = (n, a3, a4, p, t) => { const r = p > 0 ? Math.max(0, (p - a3 - a4) / p * 100) : 100, tg = t || 100; return { u: n, p, a3, a4, r, t: tg, tdef: !t, c: Math.round(r) / tg * 100 }; };   // capaian memakai realisasi yang dibulatkan (99,88% -> 100%); target bawaan 100%
    const rows = ULPS.map((n) => mk(n, n3[key(n)] || 0, n4[key(n)] || 0, P[key(n)] || 0, T[key(n)]));
    const tp = rows.reduce((s, x) => s + x.p, 0), a3 = rows.reduce((s, x) => s + x.a3, 0), a4 = rows.reduce((s, x) => s + x.a4, 0);
    const tt = rows.every((x) => x.t) ? rows.reduce((s, x) => s + x.t, 0) / rows.length : (T[key(UP3)] || null);
    rows.push(mk(UP3, a3, a4, tp, tt));
    return { rows, gen: doc.generated_at, sub: `Bulan ${months[li].slice(4)}/${months[li].slice(0, 4)} · ${tdoc ? 'target dari file Excel di Drive' : 'target bawaan 100% (unggah Target LBKB.xlsx untuk mengubah)'}` };
  }

  // ---------- tampilan ----------
  const cc = (c) => (c == null ? css('--muted') : c >= 100 ? '#1baf7a' : c >= 75 ? '#eda100' : '#e34948');
  const cap = (c) => (c == null ? '<span class="muted">–</span>' : `<b style="color:${cc(c)}">${fmt(c, 1)}%</b>`);

  function chart(id, rows) {
    const el = $(id); if (!el) return;
    if (!charts[id] || charts[id].getDom() !== el) { if (charts[id]) charts[id].dispose(); charts[id] = echarts.init(el, null, { renderer: 'svg' }); }
    const ink = css('--ink-2') || '#444', mut = css('--muted') || '#888', grid = css('--border') || '#ddd';
    const cats = rows.map((x) => x.u), vals = rows.map((x) => (x.c == null ? null : +x.c.toFixed(1)));
    charts[id].setOption({
      animation: false, grid: { left: 96, right: 56, top: 14, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => { const x = rows[ps[0].dataIndex]; return `<b>${esc(x.u)}</b><br>Capaian: <b>${x.c == null ? '–' : fmt(x.c, 1) + '%'}</b>`; } },
      xAxis: { type: 'value', min: 0, max: (v) => Math.max(100, Math.ceil(v.max / 20) * 20), axisLabel: { color: mut, formatter: '{value}%' }, splitLine: { lineStyle: { color: grid } } },
      yAxis: { type: 'category', inverse: true, data: cats, axisLabel: { color: ink, fontWeight: 600 }, axisLine: { lineStyle: { color: grid } } },
      series: [{
        type: 'bar', barMaxWidth: 20, data: vals.map((v, i) => ({ value: v, itemStyle: { color: cc(v), borderRadius: [0, 4, 4, 0], opacity: rows[i].u === UP3 ? 1 : 0.85 } })),
        label: { show: true, position: 'right', color: ink, fontSize: 11, formatter: (p) => (p.value == null ? 'target belum diisi' : fmt(p.value, 1) + '%') },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: mut, type: 'dashed' }, label: { color: mut, formatter: '100%' }, data: [{ xAxis: 100 }] },
      }],
    }, true);
  }

  const wrap = (id, title, sub, note, thead, body) => `<article class="card k-card"><div class="card-head"><div><h2>${title}</h2><p class="hint">${esc(sub)}</p></div></div>
    <div class="k-grid"><div class="chart" id="${id}" style="height:300px"></div>
    <div class="table-wrap"><table class="b-tbl" id="${id}T"><thead><tr>${thead}</tr></thead><tbody>${body}</tbody></table></div></div>
    <p class="hint k-note">${esc(note)}</p></article>`;
  const trCls = (x) => (x.u === UP3 ? ' class="tot"' : '');
  const yearPct = () => { const n = new Date(), a = new Date(n.getFullYear(), 0, 1), b = new Date(n.getFullYear() + 1, 0, 1); return (n - a) / (b - a) * 100; };

  async function render(d) {
    const host = $('hKinerja'); if (!host) return;
    last = d;
    host.innerHTML = '<div class="s-msg">Menghitung pencapaian kinerja…</div>';
    await DashAuth.ready;
    const sb = DashAuth.sb;
    const jobs = {
      susut: async () => calcSusut(d.susut),
      p2tl: () => calcP2tl(sb),
      gm: () => calcGm(sb, d.gm),
      lbkb: () => calcLbkb(sb, d.billing),
    };
    const R = {};
    await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { R[k] = await fn(); } catch (e) { R[k] = { err: e.message }; } }));
    const err = (title, e) => `<article class="card k-card miss"><div class="card-head"><div><h2>${title}</h2><p class="hint">Data belum tersedia (${esc(e)})</p></div></div></article>`;
    const out = [`<div class="card-head k-head"><div><h2>Pencapaian kinerja per ULP dan UP3</h2><p class="hint">Target sampai 31 Desember ${YEAR} · waktu berjalan ${fmt(yearPct(), 0)}% dari tahun · hijau ≥ 100%, kuning ≥ 75%, merah &lt; 75%</p></div></div>`];
    const S = R.susut, P = R.p2tl, G = R.gm, L = R.lbkb;
    out.push(S.err ? err('1. Menurunkan susut distribusi', S.err) : wrap('kSusut', '1. Menurunkan susut distribusi', S.sub, NOTE.susut,
      '<th>ULP</th><th>Target (%)</th><th>Susut kumulatif (%)</th><th>Selisih (poin)</th><th>Capaian</th>',
      S.rows.map((x) => `<tr${trCls(x)}><td>${esc(x.u)}</td><td>${x.t == null ? '–' : fmt(x.t, 2)}</td><td>${x.r == null ? '–' : fmt(x.r, 2)}</td><td>${x.g == null ? '–' : (x.g > 0 ? '+' : '') + fmt(x.g, 2)}</td><td>${cap(x.c)}</td></tr>`).join('')));
    out.push(P.err ? err('2. Perolehan P2TL', P.err) : wrap('kP2tl', '2. Perolehan P2TL', P.sub, NOTE.p2tl,
      '<th>ULP</th><th>Target s.d. 31 Des (kWh)</th><th>Realisasi (kWh)</th><th>Sisa target (kWh)</th><th>Capaian</th>',
      P.rows.map((x) => `<tr${trCls(x)}><td>${esc(x.u)}</td><td>${x.t ? fmt(x.t) : '–'}</td><td>${fmt(x.r)}</td><td>${x.t ? fmt(Math.max(0, x.t - x.r)) : '–'}</td><td>${cap(x.c)}</td></tr>`).join('')));
    out.push(G.err ? err('3. Peremajaan kWh meter tua', G.err) : wrap('kGm', '3. Peremajaan kWh meter tua', G.sub, NOTE.gm,
      '<th>ULP</th><th>Target s.d. 31 Des (meter)</th><th>Realisasi tua (meter)</th><th>Sisa target (meter)</th><th>Capaian</th>',
      G.rows.map((x) => `<tr${trCls(x)}><td>${esc(x.u)}</td><td>${x.t ? fmt(x.t) : '–'}</td><td>${fmt(x.r)}</td><td>${x.t ? fmt(Math.max(0, x.t - x.r)) : '–'}</td><td>${cap(x.c)}</td></tr>`).join('')));
    out.push(L.err ? err('4. Tindak lanjut LBKB', L.err) : wrap('kLbkb', '4. Tindak lanjut LBKB', L.sub, NOTE.lbkb,
      '<th>ULP</th><th>Pelanggan pascabayar</th><th>Berulang 3 bulan</th><th>Berulang &gt; 3 bulan</th><th>Realisasi (%)</th><th>Target (%)</th><th>Capaian</th>',
      L.rows.map((x) => `<tr${trCls(x)}><td>${esc(x.u)}</td><td>${fmt(x.p)}</td><td>${fmt(x.a3)}</td><td>${fmt(x.a4)}</td><td>${fmt(x.r, 2)}</td><td>${fmt(x.t, 1)}${x.tdef ? '<span class="muted"> (bawaan)</span>' : ''}</td><td>${cap(x.c)}</td></tr>`).join('')));
    host.innerHTML = out.join('');
    if (window.DashInsight) { try { window.DashInsight.render(R, d); } catch (e) { console.error(e); } }
    [['kSusut', S], ['kP2tl', P], ['kGm', G], ['kLbkb', L]].forEach(([id, r]) => { if (r && r.rows) chart(id, r.rows); });
  }

  new MutationObserver(() => { if (last && document.body.dataset.view === 'beranda') render(last); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.getDom() && c.getDom().isConnected && c.resize()));
  window.DashKinerja = { render };
})();
