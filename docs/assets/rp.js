/* Pengendalian Susut > P2TL > Realisasi P2TL: rincian kategori pelanggaran (kolom GOLONGAN pada laporan tagihan susulan: P1–P4, K1, K2)
   dan hitrate terhadap Target Operasi (TO).
   Data: tul_data id='p2tl_ts' (temuan + tagihan susulan) dan tabel to_inspections (hasil pemeriksaan TO per IDPEL). Hash: #rp2tl
   Definisi:
   - Hitrate TO = pemeriksaan TO berhasil temuan ÷ pemeriksaan TO yang selesai (Normal + Temuan P2TL + tidak ditemukan/kosong; "Tidak bisa diakses" tidak dihitung).
   - Temuan dari TO = tagihan susulan yang IDPEL-nya tercatat di hasil pemeriksaan TO.
   - ULP pemeriksaan diambil dari 5 digit pertama IDPEL (kode unit). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const pc = (a, b) => (b ? a / b * 100 : null);
  const pct = (v) => (v == null ? '–' : fmt(v, 1) + '%');
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const ULPS = ['ULP Manakarra', 'ULP Pasangkayu', 'ULP Majene', 'ULP Wonomulyo', 'ULP Polewali', 'ULP Mamasa'];
  const UNIT = { '32910': 'ULP Manakarra', '32920': 'ULP Pasangkayu', '32930': 'ULP Majene', '32940': 'ULP Wonomulyo', '32950': 'ULP Polewali', '32960': 'ULP Mamasa' };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const katName = (k) => (k ? 'Golongan ' + k : 'Tanpa kategori');
  const PALET = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];

  let TS = null, INS = null, insErr = '', loading = null, cur = '';
  let ch1 = null, ch2 = null;

  async function loadAll() {
    await DashAuth.ready;
    const sb = DashAuth.sb;
    const { data, error } = await sb.from('tul_data').select('data').eq('id', 'p2tl_ts').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.data || !(data.data.rows || []).length) throw new Error('belum ada data tagihan susulan');
    const D = data.data, cols = D.cols;
    TS = D.rows.map((r) => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); o.bln = o.tgl ? o.tgl.slice(0, 7) : ''; o.kat = String(o.gol || '').trim().toUpperCase(); o.idpel = String(o.idpel || ''); return o; });
    TS.gen = D.generated_at;
    INS = []; insErr = '';
    try {
      for (let from = 0; ; from += 1000) {
        const { data: d, error: e } = await sb.from('to_inspections').select('idpel,jenis,hasil,tanggal').order('id', { ascending: true }).range(from, from + 999);
        if (e) throw new Error(e.message);
        d.forEach((r) => { r.idpel = String(r.idpel || ''); r.ulp = UNIT[r.idpel.slice(0, 5)] || 'Tanpa unit'; r.bln = (r.tanggal || '').slice(0, 7); INS.push(r); });
        if (d.length < 1000) break;
      }
    } catch (e) { insErr = e.message; INS = []; }
  }
  function load() {
    if (!loading) { loading = loadAll(); loading.catch(() => { loading = null; }); }
    return loading;
  }

  // hitrate: dihitung per ULP dari pemeriksaan TO periode terpilih; temuan TO = IDPEL tagihan susulan yang pernah diperiksa lewat TO
  function calc() {
    const ts = TS.filter((r) => !cur || r.bln === cur), ins = INS.filter((r) => !cur || r.bln === cur);
    const inspected = new Set(INS.map((r) => r.idpel));          // semua riwayat: temuan boleh dicatat bulan setelah pemeriksaan
    const fromTo = (r) => inspected.has(r.idpel);
    const kats = [...new Set(ts.map((r) => r.kat))].sort((a, b) => (a || 'zz').localeCompare(b || 'zz'));
    const mkUlp = (u) => {
      const t = ts.filter((r) => !u || r.ulp === u), i = ins.filter((r) => !u || r.ulp === u);
      const done = i.filter((r) => r.hasil !== 'akses'), hit = i.filter((r) => r.hasil === 'temuan');
      return { u: u || 'UP3 Mamuju', ts: t.length, rp: t.reduce((s, r) => s + (r.total || 0), 0), kwh: t.reduce((s, r) => s + (r.kwh || 0), 0), toTs: t.filter(fromTo).length,
        n: i.length, done: done.length, hit: hit.length, normal: i.filter((r) => r.hasil === 'normal').length, kosong: i.filter((r) => r.hasil === 'kosong').length, akses: i.filter((r) => r.hasil === 'akses').length,
        hr: pc(hit.length, done.length) };
    };
    const rowsU = ULPS.map(mkUlp), tot = mkUlp('');
    const mkKat = (k) => {
      const t = ts.filter((r) => r.kat === k);
      const o = { k, n: t.length, kwh: t.reduce((s, r) => s + (r.kwh || 0), 0), rp: t.reduce((s, r) => s + (r.total || 0), 0), toN: t.filter(fromTo).length };
      o.avg = o.n ? o.rp / o.n : 0; o.share = pc(o.toN, o.n);
      return o;
    };
    return { ts, ins, kats, rowsU, tot, rowsK: kats.map(mkKat), byUk: ULPS.map((u) => kats.map((k) => ts.filter((r) => r.ulp === u && r.kat === k).length)) };
  }

  let R = null;
  const th = (a) => '<thead><tr>' + a.map((h, i) => `<th${i === 0 ? ' class="l"' : ''}>${h}</th>`).join('') + '</tr></thead>';
  const tr = (a, bold) => '<tr' + (bold ? ' style="font-weight:700"' : '') + '>' + a.map((v, i) => `<td${i === 0 ? ' class="l"' : ''}>${v}</td>`).join('') + '</tr>';

  function render() {
    R = calc();
    const { tot, rowsU, rowsK } = R;
    const lbl = cur ? BLN[+cur.slice(5) - 1] + ' ' + cur.slice(0, 4) : 'semua periode';
    const kpi = (l, v, s) => `<div class="kpi"><div class="kpi-top"><div class="lbl">${l}</div></div><div class="val">${v}</div><div class="ytd">${s}</div></div>`;
    $('rpKpis').innerHTML = kpi('Temuan P2TL (tagihan susulan)', fmt(tot.ts), lbl) +
      kpi('Pemeriksaan TO selesai', fmt(tot.done), `${fmt(tot.n)} dicatat, ${fmt(tot.akses)} tidak bisa diakses`) +
      kpi('Temuan dari pemeriksaan TO', fmt(tot.hit), 'hasil "Temuan P2TL"') +
      kpi('Hitrate TO', pct(tot.hr), 'temuan ÷ pemeriksaan selesai');
    $('rpHint').textContent = `Periode: ${lbl}. ` + (insErr ? `Hasil pemeriksaan TO tidak dapat dimuat (${insErr}).` : INS.length ? '' : 'Belum ada hasil pemeriksaan TO yang diinput, hitrate akan terisi setelah petugas menginput hasil di peta TO.');

    $('rpKatTbl').innerHTML = th(['Kategori pelanggaran', 'Jumlah temuan', 'kWh', 'Total tagihan (Rp)', 'Rata-rata (Rp)', 'Dari TO', '% dari TO']) +
      '<tbody>' + rowsK.map((x) => tr([esc(katName(x.k)), fmt(x.n), fmt(x.kwh), fmt(x.rp), fmt(x.avg), fmt(x.toN), pct(x.share)])).join('') +
      tr(['Total', fmt(tot.ts), fmt(tot.kwh), fmt(tot.rp), fmt(tot.ts ? tot.rp / tot.ts : 0), fmt(tot.toTs), pct(pc(tot.toTs, tot.ts))], true) + '</tbody>';

    $('rpUlpTbl').innerHTML = th(['ULP', 'Temuan P2TL', 'Total tagihan (Rp)', 'Pemeriksaan TO', 'Selesai', 'Temuan', 'Normal', 'Kosong', 'Tidak bisa diakses', 'Hitrate TO']) +
      '<tbody>' + rowsU.map((x) => tr([esc(x.u), fmt(x.ts), fmt(x.rp), fmt(x.n), fmt(x.done), fmt(x.hit), fmt(x.normal), fmt(x.kosong), fmt(x.akses), pct(x.hr)])).join('') +
      tr([esc(tot.u), fmt(tot.ts), fmt(tot.rp), fmt(tot.n), fmt(tot.done), fmt(tot.hit), fmt(tot.normal), fmt(tot.kosong), fmt(tot.akses), pct(tot.hr)], true) + '</tbody>';
    chart();
  }

  function chart() {
    if (!R || document.body.dataset.view !== 'rp') return;
    const ax = { axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false }, axisLabel: { color: css('--ink-2'), fontSize: 12 } };
    const base = { textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: css('--ink-2') }, legend: { top: 0, textStyle: { color: css('--ink-2'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: css('--surface'), borderColor: css('--border'), borderWidth: 1, textStyle: { color: css('--ink'), fontSize: 12 } } };
    const names = ULPS.map((u) => u.replace('ULP ', ''));
    if (!ch1) ch1 = echarts.init($('rpCh1'), null, { renderer: 'svg' });
    ch1.setOption({ ...base, color: PALET.map((c, i) => css(c) || ['#2a78d6', '#e8a33d', '#2ba58a', '#9b59b6', '#d6453a', '#64748b'][i]),
      xAxis: { type: 'category', data: names, ...ax }, yAxis: { type: 'value', axisLabel: { color: css('--muted'), fontSize: 11 }, splitLine: { lineStyle: { color: css('--grid') } } },
      series: R.kats.map((k, j) => ({ name: katName(k).replace('Golongan ', ''), type: 'bar', stack: 'k', barMaxWidth: 46, data: R.byUk.map((a) => a[j]) })) }, true);
    if (!ch2) ch2 = echarts.init($('rpCh2'), null, { renderer: 'svg' });
    const hr = R.rowsU.map((x) => x.hr), c1 = css('--s1') || '#2a78d6', c2 = css('--s2') || '#e8a33d';
    ch2.setOption({ ...base, legend: { ...base.legend },
      xAxis: { type: 'category', data: names.concat('UP3'), ...ax },
      yAxis: [{ type: 'value', axisLabel: { color: css('--muted'), fontSize: 11 }, splitLine: { lineStyle: { color: css('--grid') } } },
        { type: 'value', min: 0, axisLabel: { color: css('--muted'), fontSize: 11, formatter: '{value}%' }, splitLine: { show: false } }],
      series: [
        { name: 'Pemeriksaan selesai', type: 'bar', barMaxWidth: 28, itemStyle: { color: c1 }, data: R.rowsU.map((x) => x.done).concat(R.tot.done) },
        { name: 'Temuan P2TL', type: 'bar', barMaxWidth: 28, itemStyle: { color: css('--down') || '#d6453a' }, data: R.rowsU.map((x) => x.hit).concat(R.tot.hit) },
        { name: 'Hitrate (%)', type: 'line', yAxisIndex: 1, symbolSize: 7, itemStyle: { color: c2 }, lineStyle: { color: c2 }, label: { show: true, formatter: (p) => (p.value == null ? '' : fmt(p.value, 1) + '%'), color: css('--ink'), fontSize: 11 },
          data: hr.concat(R.tot.hr) }] }, true);
  }

  function xlsx() {
    if (!R) return;
    const { tot, rowsU, rowsK } = R;
    XlsxMini.download('realisasi-p2tl-' + (cur || 'semua') + '.xlsx', 'Kategori pelanggaran',
      ['Kategori pelanggaran', 'Jumlah temuan', 'kWh', 'Total tagihan (Rp)', 'Rata-rata (Rp)', 'Dari TO', '% dari TO'],
      rowsK.map((x) => [katName(x.k), x.n, x.kwh, x.rp, Math.round(x.avg), x.toN, x.share == null ? '' : +x.share.toFixed(1)]).concat([['Total', tot.ts, tot.kwh, tot.rp, Math.round(tot.ts ? tot.rp / tot.ts : 0), tot.toTs, tot.ts ? +pc(tot.toTs, tot.ts).toFixed(1) : '']]));
    void rowsU;
  }

  async function show() {
    window.DashSetView('rp');
    document.querySelectorAll('#subP2tl button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === 'rp')));
    if (location.hash !== '#rp2tl') history.replaceState(null, '', location.pathname + location.search + '#rp2tl');
    $('rpMsg').hidden = false; $('rpMsg').textContent = 'Memuat realisasi P2TL…'; $('rpBody').hidden = true;
    try { await load(); } catch (e) { $('rpMsg').textContent = 'Data realisasi P2TL belum tersedia (' + e.message + ').'; return; }
    $('rpMsg').hidden = true; $('rpBody').hidden = false;
    const bl = [...new Set(TS.map((r) => r.bln).filter(Boolean))].sort().reverse();
    $('rpFB').innerHTML = '<option value="">Semua periode</option>' + bl.map((b) => `<option value="${b}">${BLN[+b.slice(5) - 1]} ${b.slice(0, 4)}</option>`).join('');
    $('rpFB').value = cur;
    $('rpFoot').textContent = 'Sumber: Laporan P2TL Tagihan Susulan (kolom GOLONGAN = kategori pelanggaran) dan hasil pemeriksaan TO · diperbarui ' + new Date(TS.gen).toLocaleString('id-ID');
    render();
    window.scrollTo({ top: 0 });
  }

  function init() {
    $('rpFB').onchange = (e) => { cur = e.target.value; render(); };
    $('rpXls').onclick = xlsx;
    window.addEventListener('resize', () => { [ch1, ch2].forEach((c) => { if (c && c.getDom() && c.getDom().isConnected) c.resize(); }); });
    new MutationObserver(() => { if (R) chart(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('hashchange', () => { if (location.hash === '#rp2tl' && document.body.dataset.view !== 'rp') show(); });
  }

  window.DashRp = { show };
  init();
})();
