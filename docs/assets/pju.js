/* PJU Non Meter: peta titik lampu, rencana titik kWh meter (radius), dan RAB meterisasi (NIDI + SLO + ROK + kabel).
   Data: tabel Supabase tul_data id='pju' (titik lampu), diisi otomatis oleh sync_drive.py dari folder Drive "Pengendalian Susut/PJU".
   Pengelompokan titik, tangga daya, dan RAB dihitung di sini lewat pju-plan.js. Hash: #pju, #pju/<halaman> */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 0) => nf(d).format(v || 0);
  const rp = (v) => 'Rp ' + fmt(Math.round(v));
  const rpM = (v) => (Math.abs(v) >= 1e9 ? fmt(v / 1e9, 2) + ' miliar' : Math.abs(v) >= 1e6 ? fmt(v / 1e6, 1) + ' juta' : fmt(v));
  const P = window.PjuPlan;
  const COL = ['#2a78d6', '#e34948', '#1baf7a', '#eda100', '#7a1fa2', '#0aa5b8', '#e87ba4', '#6a7380'];
  const WCOL = [[0, '#9aa3b0', '0 W (Tidak Ada)'], [50, '#1baf7a', '≤ 50 W'], [100, '#2a78d6', '51–100 W'], [160, '#eda100', '101–160 W'], [250, '#e87b2c', '161–250 W'], [1e9, '#d6453a', '> 250 W']];
  const wcol = (w) => WCOL.find((b) => w <= b[0])[1];
  const KEY = 'pjuParams';
  const DEF = () => ({ radius: 750, pf: 0.85, cable: 15000, route: 1, rok: 10, nidi: {}, slo: {} });

  const T = { page: 'peta' };
  let D = null, loading = null, pts = [], ulps = [], prm = DEF(), meters = [], planKey = '';
  let mapP = null, layerP = null, mapR = null, layerR = null;

  // ---------- parameter ----------
  function loadPrm() {
    prm = DEF();
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); ['radius', 'pf', 'cable', 'route', 'rok'].forEach((k) => { if (isFinite(s[k]) && s[k] !== null) prm[k] = +s[k]; }); prm.nidi = s.nidi || {}; prm.slo = s.slo || {}; } catch (e) { /* abaikan */ }
  }
  const savePrm = () => { try { localStorage.setItem(KEY, JSON.stringify(prm)); } catch (e) { /* abaikan */ } };
  const tarif = () => {
    const t = { cable: prm.cable, rok: prm.rok, nidi: {}, slo: {} };
    P.TIERS.forEach((v) => { t.nidi[v] = prm.nidi[v] != null ? prm.nidi[v] : 0; t.slo[v] = prm.slo[v] != null ? prm.slo[v] : P.sloDefault(v); });
    return t;
  };
  function replan() {
    const key = [prm.radius, prm.pf, prm.route].join('|');
    if (key === planKey) return;
    planKey = key;
    meters = P.plan(pts.filter((p) => p.watt > 0), { radius: prm.radius, pf: prm.pf, route: prm.route });
  }
  const lit = () => pts.filter((p) => p.watt > 0);

  // ---------- data ----------
  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('tul_data').select('data').eq('id', 'pju').maybeSingle())
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data || !data.data || !(data.data.rows || []).length) throw new Error('belum ada data');
          D = data.data; ulps = D.ulp.map((u) => u.charAt(0) + u.slice(1).toLowerCase());
          pts = D.rows.map((r) => ({ ulp: ulps[r[0]], jenis: r[1], watt: r[2], lat: r[3], lng: r[4] }));
          return D;
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  // ---------- peta dasar ----------
  function mkMap(id) {
    const m = L.map(id, { preferCanvas: true }).setView([-2.7, 118.9], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    return m;
  }
  const opts = (arr, all) => `<option value="">${all}</option>` + arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const navLink = (lat, lng) => `<a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener">Navigasi ›</a>`;
  const uIdx = (u) => ulps.indexOf(u);

  // ---------- halaman 1: peta titik ----------
  function renderPeta() {
    const lamps = pts, on = lit();
    const kw = on.reduce((s, p) => s + p.watt, 0) / 1000, jc = {};
    lamps.forEach((p) => { jc[p.jenis] = (jc[p.jenis] || 0) + 1; });
    const topJ = Object.entries(jc).sort((x, y) => y[1] - x[1])[0];
    $('pjKpis').innerHTML = [
      ['Titik PJU Non Meter', fmt(lamps.length), 'titik', `${fmt(ulps.length)} ULP`],
      ['Titik menyala (ada watt)', fmt(on.length), 'titik', `${fmt(lamps.length - on.length)} titik "Tidak Ada" (0 W)`],
      ['Total daya lampu', fmt(kw, 1), 'kW', `rata-rata ${fmt(on.length ? kw * 1000 / on.length : 0)} W per titik`],
      ['Jenis lampu terbanyak', esc(topJ[0]), '', `${fmt(topJ[1])} titik (${fmt(lamps.length ? topJ[1] / lamps.length * 100 : 0)}%)`],
    ].map((k, i) => `<div class="kpi" style="--i:${i}"><div class="kpi-top"><div class="lbl">${k[0]}</div></div><div class="val">${k[1]}<small>${k[2]}</small></div><div class="ytd">${k[3]}</div></div>`).join('');
    const sel = (id, h, all) => { if (!$(id).options.length) $(id).innerHTML = opts(h, all); };
    sel('pjMU', ulps, 'Semua ULP'); sel('pjMJ', [...new Set(pts.map((p) => p.jenis))].sort(), 'Semua jenis');
    const jn = [...new Set(pts.map((p) => p.jenis))].sort();
    const rows = ulps.map((u) => { const a = pts.filter((p) => p.ulp === u), l = a.filter((p) => p.watt > 0); return { u, n: a.length, off: a.length - l.length, kw: l.reduce((s, p) => s + p.watt, 0) / 1000, j: jn.map((j) => a.filter((p) => p.jenis === j).length) }; });
    const tot = (f) => rows.reduce((s, r) => s + f(r), 0);
    $('pjUlpTbl').innerHTML = `<thead><tr><th>ULP</th><th>Titik</th>${jn.map((j) => `<th>${esc(j)}</th>`).join('')}<th>0 W</th><th>Daya (kW)</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${esc(r.u)}</td><td>${fmt(r.n)}</td>${r.j.map((v) => `<td>${fmt(v)}</td>`).join('')}<td>${fmt(r.off)}</td><td>${fmt(r.kw, 1)}</td></tr>`).join('') +
      `<tr class="tot"><td>Total</td><td>${fmt(tot((r) => r.n))}</td>${jn.map((_, i) => `<td>${fmt(tot((r) => r.j[i]))}</td>`).join('')}<td>${fmt(tot((r) => r.off))}</td><td>${fmt(tot((r) => r.kw), 1)}</td></tr></tbody>`;
    if (typeof L === 'undefined') { $('pjMapHint').textContent = 'Pustaka peta tidak dapat dimuat.'; return; }
    if (!mapP) { mapP = mkMap('pjMap'); layerP = L.layerGroup().addTo(mapP); }
    mapP.invalidateSize();
    drawPeta(true);
  }
  function drawPeta(fit) {
    const u = $('pjMU').value, j = $('pjMJ').value, byW = $('pjMC').value === 'watt';
    const a = pts.filter((p) => (!u || p.ulp === u) && (!j || p.jenis === j));
    layerP.clearLayers();
    const cnt = new Map();
    a.forEach((p) => {
      const c = byW ? wcol(p.watt) : COL[uIdx(p.ulp) % COL.length];
      cnt.set(c, (cnt.get(c) || 0) + 1);
      L.circleMarker([p.lat, p.lng], { radius: 5, weight: 1, color: '#fff', fillColor: c, fillOpacity: 0.9 })
        .bindPopup(`<b>${esc(p.jenis)}</b> · ${fmt(p.watt)} W<br>ULP ${esc(p.ulp)}<br>${p.lat}, ${p.lng}<br>${navLink(p.lat, p.lng)}`).addTo(layerP);
    });
    if (fit && a.length) mapP.fitBounds(L.latLngBounds(a.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 16 });
    const legend = byW ? WCOL.map((b) => [b[1], b[2]]) : ulps.map((x, i) => [COL[i % COL.length], 'ULP ' + x]);
    $('pjMapLegend').innerHTML = legend.filter((l) => cnt.get(l[0])).map((l) => `<span><i style="background:${l[0]}"></i>${esc(l[1])} <b>${fmt(cnt.get(l[0]))}</b></span>`).join('');
    $('pjMapHint').textContent = `${fmt(a.length)} titik di peta · klik titik untuk detail dan navigasi`;
  }

  // ---------- halaman 2: rencana kWh meter ----------
  const tierName = (m) => (m.tier ? fmt(m.tier) + ' VA' : '> 41,5 kVA');
  const sumBy = (list, key) => { const o = new Map(); list.forEach((m) => { const k = key(m); (o.get(k) || o.set(k, []).get(k)).push(m); }); return o; };
  function renderRencana() {
    replan();
    const lamps = lit(), n = meters.length, w = meters.reduce((s, m) => s + m.w, 0), len = meters.reduce((s, m) => s + m.len, 0);
    const big = meters.filter((m) => !m.tier).length;
    $('pjRKpis').innerHTML = [
      ['Titik kWh meter rencana', fmt(n), 'meter', `radius ${fmt(prm.radius)} m · ${fmt(lamps.length)} titik lampu menyala`],
      ['Rata-rata lampu per meter', fmt(n ? lamps.length / n : 0, 1), 'titik', `terbanyak ${fmt(Math.max(0, ...meters.map((m) => m.n)))} titik`],
      ['Total daya terpasang', fmt(meters.reduce((s, m) => s + (m.tier || m.va), 0) / 1000, 1), 'kVA', `kebutuhan ${fmt(w / prm.pf / 1000, 1)} kVA (${fmt(w / 1000, 1)} kW ÷ ${fmt(prm.pf, 2)})`],
      ['Kabel penghubung lampu', fmt(len / 1000, 1), 'km', big ? `${fmt(big)} meter melebihi 41,5 kVA` : 'jaringan terpendek antar titik tiap meter'],
    ].map((k, i) => `<div class="kpi" style="--i:${i}"><div class="kpi-top"><div class="lbl">${k[0]}</div></div><div class="val">${k[1]}<small>${k[2]}</small></div><div class="ytd">${k[3]}</div></div>`).join('');
    const cur = $('pjRU').value;
    $('pjRU').innerHTML = opts(ulps, 'Semua ULP'); $('pjRU').value = cur;
    // tabel tangga daya
    const byT = sumBy(meters, (m) => m.tier || 0), tiers = [...P.TIERS, 0].filter((t) => byT.has(t));
    $('pjTierTbl').innerHTML = `<thead><tr><th>Tangga daya</th><th>Titik kWh meter</th><th>Titik lampu</th><th>Watt lampu</th><th>Kapasitas (kVA)</th></tr></thead><tbody>` +
      tiers.map((t) => { const a = byT.get(t); return `<tr><td>${t ? fmt(t) + ' VA' : '&gt; 41,5 kVA'}</td><td>${fmt(a.length)}</td><td>${fmt(a.reduce((s, m) => s + m.n, 0))}</td><td>${fmt(a.reduce((s, m) => s + m.w, 0))}</td><td>${fmt(a.reduce((s, m) => s + (m.tier || m.va), 0) / 1000, 1)}</td></tr>`; }).join('') +
      `<tr class="tot"><td>Total</td><td>${fmt(n)}</td><td>${fmt(lamps.length)}</td><td>${fmt(w)}</td><td>${fmt(meters.reduce((s, m) => s + (m.tier || m.va), 0) / 1000, 1)}</td></tr></tbody>`;
    drawRencana(true);
    renderMeterTbl();
  }
  const selMeters = () => { const u = $('pjRU').value; return meters.filter((m) => !u || m.ulp === u); };
  function drawRencana(fit) {
    if (typeof L === 'undefined') { $('pjRHint').textContent = 'Pustaka peta tidak dapat dimuat.'; return; }
    if (!mapR) { mapR = mkMap('pjRMap'); layerR = L.layerGroup().addTo(mapR); }
    mapR.invalidateSize();
    layerR.clearLayers();
    const ms = selMeters(), lamps = lit(), showR = $('pjRR').value === '1', all = [];
    ms.forEach((m, k) => {
      const c = COL[k % COL.length];
      if (showR) L.circle([m.lat, m.lng], { radius: prm.radius, weight: 1, color: c, fillOpacity: 0.05, interactive: false }).addTo(layerR);
      m.idx.forEach((i) => { const p = lamps[i]; all.push([p.lat, p.lng]); L.circleMarker([p.lat, p.lng], { radius: 4, weight: 1, color: '#fff', fillColor: c, fillOpacity: 0.9 }).bindPopup(`${esc(p.jenis)} · ${fmt(p.watt)} W<br>ikut kWh meter ${esc(m.ulp)} #${m.no}`).addTo(layerR); });
    });
    ms.forEach((m, k) => {
      L.circleMarker([m.lat, m.lng], { radius: 9, weight: 3, color: '#111', fillColor: '#ffd400', fillOpacity: 1 })
        .bindTooltip(`${m.no}`, { permanent: ms.length < 80, direction: 'center', className: 'pj-tip' })
        .bindPopup(`<b>kWh meter ${esc(m.ulp)} #${m.no}</b><br>${fmt(m.n)} titik lampu · ${fmt(m.w)} W<br>Kebutuhan ${fmt(m.va)} VA → <b>${tierName(m)}</b><br>Kabel ${fmt(m.len)} m<br>${navLink(m.lat, m.lng)}`).addTo(layerR);
    });
    if (fit && all.length) mapR.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 16 });
    $('pjRLegend').innerHTML = `<span><i style="background:#ffd400;box-shadow:0 0 0 2px #111"></i>Titik kWh meter rencana <b>${fmt(ms.length)}</b></span><span><i style="background:${COL[0]}"></i>Titik lampu (warna = kelompok per kWh meter)</span>`;
    $('pjRHint').textContent = `Setiap kWh meter ditempatkan di salah satu titik lampu yang sudah ada; semua lampu dalam radius ${fmt(prm.radius)} m ikut satu meter`;
  }
  function renderMeterTbl() {
    const ms = selMeters();
    $('pjMetHint').textContent = `${fmt(ms.length)} titik kWh meter`;
    $('pjMetTbl').innerHTML = `<thead><tr><th>ULP</th><th>No.</th><th>Koordinat</th><th>Titik lampu</th><th>Watt lampu</th><th>Kebutuhan (VA)</th><th>Tangga daya</th><th>Kabel (m)</th></tr></thead><tbody>` +
      ms.map((m) => `<tr><td>${esc(m.ulp)}</td><td>${m.no}</td><td>${m.lat}, ${m.lng}</td><td>${fmt(m.n)}</td><td>${fmt(m.w)}</td><td>${fmt(m.va)}</td><td>${tierName(m)}</td><td>${fmt(m.len)}</td></tr>`).join('') + '</tbody>';
  }

  // ---------- halaman 3: RAB ----------
  function renderRab() {
    replan();
    const t = tarif(), rows = meters.map((m) => Object.assign({ m }, P.rab(m, t)));
    const sum = (a, f) => a.reduce((s, r) => s + f(r), 0), ns = sum(rows, (r) => r.nidi + r.slo), rk = sum(rows, (r) => r.rok), cb = sum(rows, (r) => r.cable), tt = sum(rows, (r) => r.total);
    const noNidi = P.TIERS.every((v) => !+t.nidi[v]);
    $('pjRabNote').hidden = false;
    $('pjRabNote').innerHTML = `Rumus per kWh meter: <b>(NIDI + SLO) + ROK ${fmt(prm.rok)}% dari (NIDI + SLO) + kabel</b>; kabel = panjang jaringan terpendek antar titik lampu satu meter × faktor lintasan ${fmt(prm.route, 2)} × ${rp(prm.cable)}/m. Tarif SLO = batas atas Permen ESDM 2/2025; biaya aktual dari Lembaga Inspeksi Teknik bisa lebih rendah. Harga di luar PPN.` +
      (noNidi ? ' <b>Tarif NIDI belum diisi (Rp 0)</b> — isi di tabel tarif di bawah agar RAB lengkap.' : '');
    $('pjBKpis').innerHTML = [
      ['Total RAB', rpM(tt), '', rp(tt)],
      ['NIDI + SLO', rpM(ns), '', `${fmt(rows.length)} kWh meter`],
      [`ROK ${fmt(prm.rok)}%`, rpM(rk), '', 'dari NIDI + SLO'],
      ['Kabel + aksesoris', rpM(cb), '', `${fmt(sum(rows, (r) => r.m.len) / 1000, 1)} km × ${rp(prm.cable)}/m`],
    ].map((k, i) => `<div class="kpi" style="--i:${i}"><div class="kpi-top"><div class="lbl">${k[0]}</div></div><div class="val">${k[1]}<small>${k[2]}</small></div><div class="ytd">${k[3]}</div></div>`).join('');
    const byU = sumBy(rows, (r) => r.m.ulp), head = '<thead><tr><th>ULP</th><th>kWh meter</th><th>Titik lampu</th><th>Kabel (m)</th><th>NIDI + SLO</th><th>ROK</th><th>Kabel + aksesoris</th><th>Total RAB</th></tr></thead>';
    const line = (name, a, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(name)}</td><td>${fmt(a.length)}</td><td>${fmt(sum(a, (r) => r.m.n))}</td><td>${fmt(sum(a, (r) => r.m.len))}</td><td>${rp(sum(a, (r) => r.nidi + r.slo))}</td><td>${rp(sum(a, (r) => r.rok))}</td><td>${rp(sum(a, (r) => r.cable))}</td><td>${rp(sum(a, (r) => r.total))}</td></tr>`;
    $('pjBUlp').innerHTML = head + '<tbody>' + ulps.filter((u) => byU.has(u)).map((u) => line(u, byU.get(u))).join('') + line('Total', rows, 'tot') + '</tbody>';
    // tarif
    $('pjTarif').innerHTML = '<thead><tr><th>Tangga daya</th><th>Titik kWh meter</th><th>NIDI (Rp)</th><th>SLO (Rp)</th></tr></thead><tbody>' +
      P.TIERS.map((v) => `<tr><td>${fmt(v)} VA</td><td>${fmt(meters.filter((m) => m.tier === v).length)}</td><td><input class="pj-in" type="number" min="0" step="1000" data-k="nidi" data-t="${v}" value="${t.nidi[v]}"></td><td><input class="pj-in" type="number" min="0" step="1000" data-k="slo" data-t="${v}" value="${t.slo[v]}"></td></tr>`).join('') + '</tbody>';
    const cur = $('pjBU').value;
    $('pjBU').innerHTML = opts(ulps, 'Semua ULP'); $('pjBU').value = cur;
    renderRabDetail();
  }
  const rabRows = () => { const u = $('pjBU').value, t = tarif(); return meters.filter((m) => !u || m.ulp === u).map((m) => Object.assign({ m }, P.rab(m, t))); };
  function renderRabDetail() {
    const rows = rabRows();
    $('pjBHint').textContent = `${fmt(rows.length)} titik kWh meter`;
    $('pjBTbl').innerHTML = '<thead><tr><th>ULP</th><th>No.</th><th>Tangga daya</th><th>NIDI</th><th>SLO</th><th>ROK</th><th>Kabel (m)</th><th>Kabel + aks.</th><th>Total</th></tr></thead><tbody>' +
      rows.map((r) => `<tr><td>${esc(r.m.ulp)}</td><td>${r.m.no}</td><td>${tierName(r.m)}</td><td>${fmt(r.nidi)}</td><td>${fmt(r.slo)}</td><td>${fmt(r.rok)}</td><td>${fmt(r.m.len)}</td><td>${fmt(r.cable)}</td><td>${fmt(r.total)}</td></tr>`).join('') + '</tbody>';
  }

  // ---------- unduh Excel (.xlsx) ----------
  const csvMeters = () => XlsxMini.download('PJU_kWh_meter_rencana.xlsx', 'kWh meter', ['ULP', 'No', 'Lintang', 'Bujur', 'Titik lampu', 'Watt lampu', 'Kebutuhan VA', 'Tangga daya VA', 'Kabel m'],
    selMeters().map((m) => [m.ulp, m.no, m.lat, m.lng, m.n, m.w, Math.round(m.va), m.tier || '>41500', Math.round(m.len)]));
  const csvRab = () => XlsxMini.download('PJU_RAB_meterisasi.xlsx', 'RAB', ['ULP', 'No', 'Lintang', 'Bujur', 'Titik lampu', 'Watt lampu', 'Tangga daya VA', 'NIDI', 'SLO', 'ROK', 'Kabel m', 'Kabel+aksesoris', 'Total RAB'],
    rabRows().map((r) => [r.m.ulp, r.m.no, r.m.lat, r.m.lng, r.m.n, r.m.w, r.m.tier || '>41500', r.nidi, r.slo, Math.round(r.rok), Math.round(r.m.len), Math.round(r.cable), Math.round(r.total)]));

  // ---------- halaman ----------
  const PAGES = { peta: renderPeta, rencana: renderRencana, rab: renderRab };
  const TITLE = { peta: 'Peta titik PJU', rencana: 'Rencana kWh meter', rab: 'RAB meterisasi' };
  function syncAssume() { $('pjRadius').value = prm.radius; $('pjPf').value = prm.pf; $('pjCable').value = prm.cable; $('pjRoute').value = prm.route; $('pjRok').value = prm.rok; }
  function renderAll() {
    if (!PAGES[T.page]) T.page = 'peta';
    $('pjCrumb').innerHTML = `<span>PJU Non Meter</span><i>›</i><b>${TITLE[T.page]}</b>`;
    document.querySelectorAll('#pjBody .b-page').forEach((el) => { el.hidden = el.dataset.p !== T.page; });
    $('pjAssume').hidden = T.page === 'peta';
    document.querySelectorAll('#subPju button[data-p]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === T.page)));
    PAGES[T.page]();
    $('pjFoot').innerHTML = `Sumber: Excel koordinat PJU Non Meter (${fmt(D.rows.length)} titik${D.skipped ? `, ${fmt(D.skipped)} baris dilewati karena koordinat tidak valid` : ''}) · Data diperbarui ${new Date(D.generated_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
  }
  const hashPage = () => { const m = location.hash.match(/^#pju(?:\/(\w+))?/); return m && PAGES[m[1]] ? m[1] : 'peta'; };
  async function show(page) {
    window.DashSetView('pju');
    T.page = page || hashPage();
    const h = '#pju' + (T.page === 'peta' ? '' : '/' + T.page);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    $('pjMsg').hidden = false; $('pjMsg').textContent = 'Memuat data PJU Non Meter…'; $('pjBody').hidden = true;
    try { await load(); } catch (e) { $('pjMsg').textContent = 'Data PJU Non Meter belum tersedia (' + e.message + ').'; return; }
    $('pjMsg').hidden = true; $('pjBody').hidden = false;
    syncAssume(); renderAll(); window.scrollTo({ top: 0 });
  }

  function init() {
    loadPrm();
    const num = (id, k, min, max) => { $(id).onchange = (e) => { const v = parseFloat(e.target.value); prm[k] = isFinite(v) ? Math.min(max, Math.max(min, v)) : DEF()[k]; e.target.value = prm[k]; savePrm(); if (D) renderAll(); }; };
    num('pjRadius', 'radius', 100, 3000); num('pjPf', 'pf', 0.5, 1); num('pjCable', 'cable', 0, 1e7); num('pjRoute', 'route', 1, 3); num('pjRok', 'rok', 0, 100);
    $('pjReset').onclick = () => { prm = DEF(); savePrm(); syncAssume(); if (D) renderAll(); };
    ['pjMU', 'pjMJ', 'pjMC'].forEach((id) => { $(id).onchange = () => drawPeta(true); });
    $('pjRU').onchange = () => { drawRencana(true); renderMeterTbl(); };
    $('pjRR').onchange = () => drawRencana(false);
    $('pjBU').onchange = renderRabDetail;
    $('pjMetCsv').onclick = csvMeters; $('pjRabCsv').onclick = csvRab;
    $('pjTarif').addEventListener('change', (e) => {
      const i = e.target.closest('input[data-k]'); if (!i) return;
      const v = Math.max(0, parseFloat(i.value) || 0); prm[i.dataset.k][i.dataset.t] = v; savePrm(); renderRab();
    });
    $('subPju').addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; document.body.classList.remove('nav-open'); show(b.dataset.p); });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#pju') && (document.body.dataset.view !== 'pju' || hashPage() !== T.page)) show(); });
  }

  window.DashPju = { show };
  init();
})();
