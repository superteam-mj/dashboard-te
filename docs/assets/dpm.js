/* Transaksi Energi > Mon DPM: kode RBM pada Monitoring DPM yang tidak ada di "Rekap jumlah pelanggan per RBM" (untuk diperbaiki datanya).
   Data: tul_data id='dpm_rbm' (build_dpm.py, sinkron Drive folder Transaksi Energi/Mon DPM). Hash: #dpm */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => new Intl.NumberFormat('id-ID').format(Math.round(v || 0));
  const PER = (p) => { const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']; return b[+p.slice(4) - 1] + ' ' + p.slice(0, 4); };
  let D = null, loading = null, R = [], C = [], F = { u: '', q: '', rbm: '' };

  function load() {
    if (!loading) {
      loading = DashAuth.ready.then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'dpm_rbm').maybeSingle()).then(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || !data.data) throw new Error('belum ada data');
        D = data.data;
        R = D.rows.map((r) => ({ unit: r[0], ulp: r[1], rbm: r[2], n: r[3], daya: r[4], inRekap: !!r[5], nRekap: r[6], dayaRekap: r[7], noFile: !D.units_rekap.includes(r[0]) }));
        C = D.cust.map((r) => ({ unit: r[0], rbm: r[1], idpel: r[2], nama: r[3], tarif: r[4], daya: r[5], pesan: r[6], jalan: r[7] }));
        return D;
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  const missing = () => R.filter((x) => x.n && !x.inRekap && !x.noFile);
  const noFile = () => R.filter((x) => x.n && x.noFile);
  const sel = (rows) => rows.filter((x) => (!F.u || x.unit === F.u) && (!F.q || x.rbm.toLowerCase().includes(F.q.toLowerCase())));
  const th = (a) => '<thead><tr>' + a.map((h, i) => `<th${i === 0 || i === 1 ? ' class="l"' : ''}>${h}</th>`).join('') + '</tr></thead>';
  const kpi = (l, v, s) => `<div class="kpi"><div class="kpi-top"><div class="lbl">${l}</div></div><div class="val">${v}</div><div class="ytd">${s}</div></div>`;

  function sampleJalan(rbm, unit) { const m = {}; C.filter((c) => c.rbm === rbm && c.unit === unit).forEach((c) => { if (c.jalan) m[c.jalan] = (m[c.jalan] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join(' · '); }

  function render() {
    const ms = missing(), all = R.filter((x) => x.n), nf = noFile();
    $('dpKpis').innerHTML = kpi('Kode RBM di Mon DPM', fmt(all.length), PER(D.period)) + kpi('Ada di rekap', fmt(all.filter((x) => x.inRekap).length), 'sudah sesuai') +
      kpi('Tidak ada di rekap', fmt(ms.length), 'perlu diperbaiki datanya') + kpi('Pelanggan terdampak', fmt(ms.reduce((s, x) => s + x.n, 0)), `${fmt(ms.reduce((s, x) => s + x.daya, 0))} VA`);
    const u = [...new Set(R.map((x) => x.unit))].sort();
    $('dpU').innerHTML = '<option value="">Semua ULP</option>' + u.map((c) => `<option value="${c}">${esc((R.find((x) => x.unit === c) || {}).ulp || c)}</option>`).join(''); $('dpU').value = F.u;
    const rows = sel(ms);
    $('dpHint').textContent = `${fmt(rows.length)} kode RBM · ${fmt(rows.reduce((s, x) => s + x.n, 0))} pelanggan · klik "Pelanggan" untuk melihat daftarnya`;
    $('dpTbl').innerHTML = th(['ULP', 'Kode RBM', 'Pelanggan di Mon DPM', 'Daya (VA)', 'Jalan / lokasi (contoh)', '']) + '<tbody>' +
      (rows.map((x) => `<tr><td class="l">${esc(x.ulp)}</td><td class="l"><b>${esc(x.rbm)}</b></td><td>${fmt(x.n)}</td><td>${fmt(x.daya)}</td><td class="l">${esc(sampleJalan(x.rbm, x.unit))}</td><td><button type="button" class="b-link" data-u="${x.unit}" data-r="${esc(x.rbm)}">Pelanggan ›</button></td></tr>`).join('') || '<tr><td colspan="6">Tidak ada kode RBM yang hilang dari rekap ✓</td></tr>') + '</tbody>';
    $('dpNoFile').hidden = !nf.length;
    if (nf.length) {
      const g = {}; nf.forEach((x) => { g[x.ulp] = g[x.ulp] || { k: 0, n: 0 }; g[x.ulp].k++; g[x.ulp].n += x.n; });
      $('dpNoFile').innerHTML = '<b>Rekap belum ada untuk:</b> ' + Object.entries(g).map(([n, v]) => `${esc(n)} (${v.k} kode RBM, ${fmt(v.n)} pelanggan)`).join('; ') + '. Unduh laporan rekap unit tersebut ke folder Mon DPM agar bisa dibandingkan; kode RBM-nya belum dihitung sebagai salah.';
    }
    // jumlah pelanggan berbeda antara Mon DPM dan rekap
    const diff = sel(all.filter((x) => x.inRekap && x.n !== x.nRekap)).sort((a, b) => Math.abs(b.n - b.nRekap) - Math.abs(a.n - a.nRekap));
    $('dpDHint').textContent = `${fmt(diff.length)} kode RBM ada di keduanya tetapi jumlah pelanggannya berbeda`;
    $('dpDTbl').innerHTML = th(['ULP', 'Kode RBM', 'Mon DPM', 'Rekap', 'Selisih']) + '<tbody>' +
      (diff.slice(0, 300).map((x) => { const d = x.n - x.nRekap; return `<tr><td class="l">${esc(x.ulp)}</td><td class="l"><b>${esc(x.rbm)}</b></td><td>${fmt(x.n)}</td><td>${fmt(x.nRekap)}</td><td><b style="color:${d > 0 ? '#e34948' : '#eda100'}">${d > 0 ? '+' : ''}${fmt(d)}</b></td></tr>`; }).join('') || '<tr><td colspan="5">Semua jumlah pelanggan sama ✓</td></tr>') + '</tbody>';
    custPanel();
  }

  function custPanel() {
    const box = $('dpCust');
    if (!F.rbm) { box.hidden = true; return; }
    const [u, r] = F.rbm.split('|'), rows = C.filter((c) => c.unit === u && c.rbm === r);
    box.hidden = false;
    $('dpCTitle').textContent = `Pelanggan pada RBM ${r} (${(R.find((x) => x.unit === u) || {}).ulp || u}) · ${fmt(rows.length)} pelanggan`;
    $('dpCTbl').innerHTML = th(['IDPEL', 'Nama', 'Tarif', 'Daya (VA)', 'Kode pesan', 'Jalan']) + '<tbody>' + rows.slice(0, 500).map((c) => `<tr><td class="l">${esc(c.idpel)}</td><td class="l">${esc(c.nama)}</td><td>${esc(c.tarif)}</td><td>${fmt(c.daya)}</td><td>${esc(c.pesan)}</td><td class="l">${esc(c.jalan)}</td></tr>`).join('') + '</tbody>';
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function xlsRbm() {
    const rows = sel(missing());
    XlsxMini.download(`rbm_tidak_ada_di_rekap_${D.period}.xlsx`, 'RBM tidak ada di rekap', ['ULP', 'Kode RBM', 'Pelanggan di Mon DPM', 'Daya (VA)', 'Jalan / lokasi (contoh)', 'Kode RBM yang benar', 'Catatan'],
      rows.map((x) => [x.ulp, x.rbm, x.n, x.daya, sampleJalan(x.rbm, x.unit), '', '']));
  }
  function xlsCust() {
    const keys = new Set(sel(missing()).map((x) => x.unit + '|' + x.rbm)), rows = C.filter((c) => (F.rbm ? F.rbm === c.unit + '|' + c.rbm : keys.has(c.unit + '|' + c.rbm)));
    const ulp = (u) => (R.find((x) => x.unit === u) || {}).ulp || u;
    XlsxMini.download(`pelanggan_rbm_tidak_ada_di_rekap_${D.period}.xlsx`, 'Pelanggan', ['ULP', 'Kode RBM', 'IDPEL', 'Nama', 'Tarif', 'Daya (VA)', 'Kode pesan', 'Jalan', 'Kode RBM yang benar'],
      rows.map((c) => [ulp(c.unit), c.rbm, c.idpel, c.nama, c.tarif, c.daya, c.pesan, c.jalan, '']));
  }

  async function show() {
    window.DashSetView('dpm');
    if (location.hash !== '#dpm') history.replaceState(null, '', location.pathname + location.search + '#dpm');
    $('dpMsg').hidden = false; $('dpMsg').textContent = 'Memuat data Mon DPM…'; $('dpBody').hidden = true;
    try { await load(); } catch (e) { $('dpMsg').textContent = 'Data Mon DPM belum tersedia (' + e.message + '). Pastikan rekap pelanggan per RBM dan Monitoring DPM periode yang sama ada di folder Drive Mon DPM, lalu tunggu sinkron.'; return; }
    $('dpMsg').hidden = true; $('dpBody').hidden = false;
    $('dpFoot').textContent = 'Sumber: ' + D.files.map((f) => f.file).join(', ') + ' · periode ' + PER(D.period) + ' · diperbarui ' + new Date(D.generated_at).toLocaleString('id-ID');
    render();
    window.scrollTo({ top: 0 });
  }

  function init() {
    $('dpU').onchange = (e) => { F.u = e.target.value; F.rbm = ''; render(); };
    let t = 0;
    $('dpQ').oninput = (e) => { F.q = e.target.value; clearTimeout(t); t = setTimeout(render, 150); };
    $('dpXls').onclick = xlsRbm; $('dpCXls').onclick = xlsCust; $('dpAllXls').onclick = () => { const k = F.rbm; F.rbm = ''; xlsCust(); F.rbm = k; };
    $('dpCClose').onclick = () => { F.rbm = ''; custPanel(); };
    $('dpTbl').addEventListener('click', (e) => { const b = e.target.closest('button[data-r]'); if (b) { F.rbm = b.dataset.u + '|' + b.dataset.r; custPanel(); } });
    window.addEventListener('hashchange', () => { if (location.hash === '#dpm' && document.body.dataset.view !== 'dpm') show(); });
  }

  window.DashDpm = { show };
  init();
})();
