/* PJU Non Meter: perencanaan titik kWh meter (pengelompokan radius), tangga daya PLN, dan RAB NIDI+SLO + kabel.
   Murni perhitungan (tanpa DOM) supaya bisa diuji di Node. Dipakai oleh pju.js. */
(function (root) {
  'use strict';
  // tangga daya PLN (VA)
  const TIERS = [450, 900, 1300, 2200, 3500, 4400, 5500, 6600, 7700, 10600, 11000, 13200, 16500, 23000, 33000, 41500, 53000, 66000, 82500, 105000, 131000, 147000, 164000, 197000];
  // batas atas biaya SLO tegangan rendah, Permen ESDM 2/2025 (Lampiran III): tetap untuk <= 2200 VA, selebihnya Rp per VA
  const sloDefault = (va) => (va === 450 ? 40000 : va === 900 ? 60000 : va === 1300 ? 120000 : va === 2200 ? 135000 : va <= 7700 ? 35 * va : va <= 23000 ? 30 * va : va <= 66000 ? 25 * va : 20 * va);
  const tierOf = (va) => TIERS.find((t) => t >= va) || null; // null = di atas 197 kVA

  function project(pts) {
    const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180);
    return pts.map((p) => [(p.lng - 105) * 111320 * k, (p.lat + 5) * 110574]);
  }

  // satu kelompok titik (indeks ke pts) -> panjang jaringan minimum (Prim) dalam meter
  function mst(xy, ids) {
    const n = ids.length; if (n < 2) return 0;
    const d = new Float64Array(n).fill(Infinity), used = new Uint8Array(n); d[0] = 0; let tot = 0;
    for (let it = 0; it < n; it++) {
      let b = -1; for (let i = 0; i < n; i++) if (!used[i] && (b < 0 || d[i] < d[b])) b = i;
      used[b] = 1; tot += d[b];
      const [bx, by] = xy[ids[b]];
      for (let i = 0; i < n; i++) if (!used[i]) { const e = Math.hypot(xy[ids[i]][0] - bx, xy[ids[i]][1] - by); if (e < d[i]) d[i] = e; }
    }
    return tot;
  }

  /* pts: [{ulp, watt, lat, lng}] (hanya yang menyala, watt > 0). Hasil: meters[] dengan anggota (idx) dan hasil hitung. */
  function plan(pts, o) {
    const R = o.radius, pf = o.pf, meters = [];
    const byU = new Map();
    pts.forEach((p, i) => { if (!byU.has(p.ulp)) byU.set(p.ulp, []); byU.get(p.ulp).push(i); });
    byU.forEach((ids, ulp) => {
      const xy = project(ids.map((i) => pts[i]));
      const n = ids.length, cell = R, grid = new Map(), key = (cx, cy) => cx * 100003 + cy;
      xy.forEach((q, i) => { const k = key(Math.floor(q[0] / cell), Math.floor(q[1] / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
      const near = (i) => { // semua titik dalam radius dari i (termasuk i)
        const cx = Math.floor(xy[i][0] / cell), cy = Math.floor(xy[i][1] / cell), out = [];
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(key(cx + a, cy + b)) || []) if (Math.hypot(xy[j][0] - xy[i][0], xy[j][1] - xy[i][1]) <= R) out.push(j);
        return out;
      };
      const nb = Array.from({ length: n }, (_, i) => near(i));
      const cov = new Uint8Array(n); let left = n; const centers = [];
      while (left > 0) {
        let best = -1, bc = -1, bw = -1;
        for (let i = 0; i < n; i++) {
          if (cov[i]) continue;
          let c = 0, w = 0; for (const j of nb[i]) if (!cov[j]) { c++; w += pts[ids[j]].watt; }
          if (c > bc || (c === bc && w > bw)) { best = i; bc = c; bw = w; }
        }
        for (const j of nb[best]) if (!cov[j]) { cov[j] = 1; left--; }
        centers.push(best);
      }
      // setiap lampu ikut kWh meter terdekat (memperpendek kabel); kWh meter selalu berada di salah satu titik lampu
      const mem = centers.map(() => []);
      for (let i = 0; i < n; i++) {
        let bj = 0, bd = Infinity;
        centers.forEach((c, j) => { const d = Math.hypot(xy[i][0] - xy[c][0], xy[i][1] - xy[c][1]); if (d < bd) { bd = d; bj = j; } });
        mem[bj].push(i);
      }
      const order = centers.map((c, j) => j).sort((a, b) => xy[centers[a]][1] - xy[centers[b]][1] || xy[centers[a]][0] - xy[centers[b]][0]);
      order.forEach((j) => {
        const g = mem[j], gi = g.map((i) => ids[i]), w = gi.reduce((s, i) => s + pts[i].watt, 0), va = w / pf, c = pts[ids[centers[j]]];
        meters.push({ ulp, lat: c.lat, lng: c.lng, idx: gi, n: gi.length, w, va, tier: tierOf(va), len: mst(xy, g) * o.route });
      });
    });
    // nomor urut per ULP
    const cnt = {}; meters.forEach((m) => { cnt[m.ulp] = (cnt[m.ulp] || 0) + 1; m.no = cnt[m.ulp]; });
    return meters;
  }

  /* RAB per kWh meter. P: {cable (Rp/m), rok (%), nidi: {tier: Rp}, slo: {tier: Rp}} */
  function rab(m, P) {
    const t = m.tier, nidi = t ? (+P.nidi[t] || 0) : 0, slo = t ? (+P.slo[t] || 0) : 0, base = nidi + slo, rok = base * P.rok / 100, cable = m.len * P.cable;
    return { nidi, slo, base, rok, nidiSlo: base + rok, cable, total: base + rok + cable };
  }

  const api = { TIERS, sloDefault, tierOf, plan, rab, mst };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PjuPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
