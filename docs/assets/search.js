/* Pencarian pelanggan global (bilah atas): ketik IDPEL atau nama -> jejak pelanggan di tagihan susulan, hasil pemeriksaan TO, dan LBKB.
   Data dimuat sekali saat kolom cari pertama kali difokuskan. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => new Intl.NumberFormat('id-ID').format(Math.round(v || 0));
  const dmy = (d) => (d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(0, 4) : '');
  const HASIL = { normal: 'Normal', temuan: 'Temuan P2TL', kosong: 'Tidak ditemukan / kosong', akses: 'Tidak bisa diakses' };
  const UNIT = { '32910': 'ULP Manakarra', '32920': 'ULP Pasangkayu', '32930': 'ULP Majene', '32940': 'ULP Wonomulyo', '32950': 'ULP Polewali', '32960': 'ULP Mamasa' };
  let IDX = null, loading = null;

  async function doc(sb, id) { const r = await sb.from('tul_data').select('data').eq('id', id).maybeSingle(); return r.error || !r.data ? null : r.data.data; }
  async function build() {
    await DashAuth.ready;
    const sb = DashAuth.sb, M = new Map();
    const rec = (id) => { let o = M.get(id); if (!o) { o = { id, nama: '', alamat: '', ulp: UNIT[id.slice(0, 5)] || '', ts: [], ins: [], lbkb: null }; M.set(id, o); } return o; };
    const [ts, lb] = await Promise.all([doc(sb, 'p2tl_ts').catch(() => null), doc(sb, 'lbkb').catch(() => null)]);
    if (ts) { const c = {}; ts.cols.forEach((n, i) => { c[n] = i; }); ts.rows.forEach((r) => { const o = rec(String(r[c.idpel])); o.nama = o.nama || r[c.nama]; o.alamat = o.alamat || r[c.alamat]; o.ts.push({ tgl: r[c.tgl], gol: r[c.gol], kwh: r[c.kwh], total: r[c.total], angsur: r[c.angsur] }); }); }
    if (lb) {
      const W = new Set(lb.watch || []);
      lb.rows.forEach((r) => { const o = rec(String(r[0])); o.nama = o.nama || r[1]; o.ulp = o.ulp || r[2]; const codes = r[5] || []; let n = 0; for (let i = codes.length - 1; i >= 0 && W.has(codes[i]); i--) n++; o.lbkb = { tarif: r[3], daya: r[4], berulang: n }; });
    }
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('to_inspections').select('idpel,hasil,tanggal,catatan').order('id').range(from, from + 999);
        if (error) throw new Error(error.message);
        data.forEach((r) => { rec(String(r.idpel)).ins.push(r); });
        if (data.length < 1000) break;
      }
    } catch (e) { /* tabel pemeriksaan tidak wajib */ }
    IDX = [...M.values()];
  }
  const load = () => { if (!loading) { loading = build(); loading.catch(() => { loading = null; }); } return loading; };

  function card(o) {
    const L = [];
    if (o.ts.length) L.push('<b>Tagihan susulan</b>: ' + o.ts.sort((a, b) => (b.tgl || '').localeCompare(a.tgl || '')).map((t) => `${dmy(t.tgl)} · gol. ${esc(t.gol)} · ${fmt(t.kwh)} kWh · Rp ${fmt(t.total)}${t.angsur > 0 ? ' (angsuran)' : ''}`).join('<br>'));
    if (o.ins.length) L.push('<b>Pemeriksaan TO</b>: ' + o.ins.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '')).map((t) => `${dmy(t.tanggal)} · ${esc(HASIL[t.hasil] || t.hasil)}${t.catatan ? ' · ' + esc(t.catatan) : ''}`).join('<br>'));
    if (o.lbkb) L.push(`<b>LBKB</b>: tarif ${esc(o.lbkb.tarif)} ${fmt(o.lbkb.daya)} VA · berulang ${o.lbkb.berulang} bulan terakhir`);
    return `<div class="gs-item"><div class="gs-t"><b>${esc(o.nama || '(tanpa nama)')}</b> <span>${esc(o.id)}${o.ulp ? ' · ' + esc(o.ulp) : ''}</span></div>${o.alamat ? `<div class="gs-a">${esc(o.alamat)}</div>` : ''}${L.map((x) => `<div class="gs-l">${x}</div>`).join('') || '<div class="gs-l">Tidak ada jejak di sumber yang dicari.</div>'}</div>`;
  }

  async function run() {
    const q = $('gsInput').value.trim().toLowerCase(), box = $('gsPanel');
    if (q.length < 3) { box.hidden = true; return; }
    box.hidden = false;
    if (!IDX) { box.innerHTML = '<div class="gs-l">Memuat data pencarian…</div>'; try { await load(); } catch (e) { box.innerHTML = '<div class="gs-l">Data pencarian tidak dapat dimuat.</div>'; return; } }
    if ($('gsInput').value.trim().toLowerCase() !== q) return;
    const hit = IDX.filter((o) => o.id.includes(q) || String(o.nama).toLowerCase().includes(q) || String(o.alamat).toLowerCase().includes(q));
    box.innerHTML = `<div class="gs-h">${fmt(hit.length)} pelanggan ditemukan${hit.length > 20 ? ' · menampilkan 20 pertama, persempit kata kunci' : ''} <small>(sumber: tagihan susulan, pemeriksaan TO, LBKB)</small></div>` + hit.slice(0, 20).map(card).join('');
  }

  function init() {
    const i = $('gsInput'); if (!i) return;
    let t = 0;
    i.addEventListener('focus', () => { load().catch(() => {}); if (i.value.trim().length >= 3) run(); });
    i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 200); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#gSearch')) $('gsPanel').hidden = true; });
    i.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('gsPanel').hidden = true; i.blur(); } });
  }
  init();
})();
