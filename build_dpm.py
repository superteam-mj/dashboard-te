"""Mon DPM: kode RBM pada Monitoring DPM yang tidak ada di "Rekap jumlah pelanggan per RBM".

Sumber: folder Drive "Transaksi Energi/Mon DPM/"
  - laporan_rekap_jumlah_pelanggan_per_rbm_<BLTH>*.xlsx  (satu file per ULP; kolom UNITUP, KODE_RBM, JMLPLG_LALU, JMLPLG, JMLDAYA_LALU, JMLDAYA;
    periode dibaca dari teks "BLTH - 202612")
  - Monitoring DPM (monitoring_dpm_YYMM.xlsx atau Monitoring_DPM_Detail_<BLTH>.xlsx) dengan kolom thblrek, unitup, koderbm, idpel ...
Keluaran: tul_data id='dpm_rbm' = ringkasan per kode RBM + daftar pelanggan pada RBM yang tidak ada di rekap.
Periode yang dibandingkan = periode rekap terbaru; file Mon DPM dipilih yang thblrek-nya sama.
"""
from __future__ import annotations

import re
import warnings
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

warnings.simplefilter("ignore")
ULP = {"32910": "ULP Manakarra", "32920": "ULP Pasangkayu", "32930": "ULP Majene", "32940": "ULP Wonomulyo", "32950": "ULP Polewali", "32960": "ULP Mamasa"}
CUST_COLS = ["idpel", "nama", "tarif", "daya", "kd_pesan", "jalan"]


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _num(v) -> float:
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


def read_rekap(src: Path):
    """-> ({periode: {(unit, rbm): [jml_lalu, jml, daya_lalu, daya]}}, info, warns)"""
    out, info, warns = {}, [], []
    for f in sorted(src.glob("*.xlsx")):
        if f.name.startswith("~$") or "rekap" not in f.name.lower():
            continue
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        n, per = 0, None
        try:
            for ws in wb:
                head = None
                for r in ws.iter_rows(values_only=True):
                    cells = [_s(x) for x in r]
                    if per is None:
                        m = re.search(r"BLTH\s*-?\s*(\d{6})", " ".join(cells))
                        if m:
                            per = m.group(1)
                    if head is None:
                        if "KODE_RBM" in [c.upper() for c in cells]:
                            head = {c.upper(): i for i, c in enumerate(cells) if c}
                        continue
                    u, k = _s(r[head["UNITUP"]]) if "UNITUP" in head else "", _s(r[head["KODE_RBM"]])
                    if not (u.isdigit() and k):
                        continue
                    g = lambda c: _num(r[head[c]]) if c in head and head[c] < len(r) else 0.0
                    out.setdefault(per or "", {})[(u, k.upper())] = [g("JMLPLG_LALU"), g("JMLPLG"), g("JMLDAYA_LALU"), g("JMLDAYA")]
                    n += 1
        finally:
            wb.close()
        if per is None:
            warns.append(f"{f.name}: periode (BLTH) tidak ditemukan")
        info.append({"file": f.name, "rows": n, "period": per})
    return out, info, warns


def _first_period(f: Path) -> str | None:
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        ws.reset_dimensions()
        it = ws.iter_rows(values_only=True)
        head = [_s(x).lower() for x in next(it, ())]
        if "thblrek" not in head or "koderbm" not in head:
            return None
        ti = head.index("thblrek")
        for r in it:
            if r and len(r) > ti and _s(r[ti])[:6].isdigit():
                return _s(r[ti])[:6]
    finally:
        wb.close()
    return None


def read_dpm(f: Path):
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    agg, cust = {}, {}
    try:
        ws = wb.worksheets[0]
        ws.reset_dimensions()
        it = ws.iter_rows(values_only=True)
        ix = {_s(h).lower(): i for i, h in enumerate(next(it, ())) if _s(h)}
        for k in ("idpel", "unitup", "koderbm"):
            if k not in ix:
                raise RuntimeError(f"{f.name}: kolom {k} tidak ada")
        g = lambda r, k: r[ix[k]] if k in ix and ix[k] < len(r) else None
        for r in it:
            if not r or g(r, "idpel") is None:
                continue
            key = (_s(g(r, "unitup")), _s(g(r, "koderbm")).upper() or "(KOSONG)")
            a = agg.setdefault(key, [0, 0.0])
            a[0] += 1
            a[1] += _num(g(r, "daya"))
            cust.setdefault(key, []).append([_s(g(r, "idpel")), _s(g(r, "nama")), _s(g(r, "tarif")), int(_num(g(r, "daya"))), _s(g(r, "kd_pesan")), _s(g(r, "namapnj"))])
    finally:
        wb.close()
    return agg, cust


def build(src: Path):
    rekap, rinfo, warns = read_rekap(src)
    if not rekap:
        raise RuntimeError("tidak ada file rekap jumlah pelanggan per RBM yang terbaca")
    per = max(rekap)
    rk = rekap[per]
    files = [p for p in sorted(src.glob("*.xlsx")) if not p.name.startswith("~$") and "rekap" not in p.name.lower() and "target" not in p.name.lower()]
    dpm_file = next((p for p in files if _first_period(p) == per), None)
    if dpm_file is None:
        raise RuntimeError(f"belum ada file Mon DPM periode {per} (rekap periode {per} sudah ada)")
    agg, cust = read_dpm(dpm_file)
    units_rekap = sorted({u for u, _ in rk})
    rows, miss_c = [], []
    for key in sorted(set(agg) | set(rk)):
        u, k = key
        a, r = agg.get(key), rk.get(key)
        rows.append([u, ULP.get(u, u), k, a[0] if a else 0, int(a[1]) if a else 0, 1 if r else 0, int(r[1]) if r else 0, int(r[3]) if r else 0])
        if a and not r:
            miss_c.append([u, k] + [c for c in cust[key]])
    # pelanggan RBM yang hilang: baris datar [unit, rbm, idpel, nama, tarif, daya, kd_pesan, jalan]
    miss_cust = [[u, k, *c] for u, k, *cs in miss_c for c in cs]
    for u in sorted({u for u, _ in agg} - set(units_rekap)):
        warns.append(f"rekap {ULP.get(u, u)} ({u}) tidak ada di folder: semua RBM unit ini tampil sebagai tidak ada di rekap")
    doc = {"period": per, "cols": ["unit", "ulp", "rbm", "n_dpm", "daya_dpm", "in_rekap", "n_rekap", "daya_rekap"], "rows": rows,
           "cust_cols": ["unit", "rbm"] + CUST_COLS, "cust": miss_cust, "units_rekap": units_rekap,
           "files": rinfo + [{"file": dpm_file.name, "rows": sum(v[0] for v in agg.values()), "period": per}],
           "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    return doc, warns
