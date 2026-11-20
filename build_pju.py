"""PJU Non Meter: titik koordinat lampu -> data untuk peta, rencana kWh meter, dan RAB.

Sumber: folder Drive "Pengendalian Susut/PJU/" (satu atau lebih Excel) dengan kolom ULP, JENIS LAMPU, WATT, KOORDINAT ("lat, lng").
Keluaran: tul_data id='pju' = daftar titik. Pengelompokan titik ke kWh meter (radius 750 m), tangga daya PLN, dan RAB dihitung di
browser (docs/assets/pju.js) supaya radius, harga kabel, dan tarif NIDI/SLO bisa diubah langsung di halaman.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

LAT = (-5.0, 1.0)
LNG = (117.0, 121.0)
COLS = ["ulp", "jenis", "watt", "lat", "lng"]


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _coord(v):
    m = re.match(r"^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$", _s(v))
    if not m:
        return None
    a, b = (float(x.replace(",", ".")) for x in m.groups())
    for la, ln in ((a, b), (b, a)):  # bila tertukar
        if LAT[0] < la < LAT[1] and LNG[0] < ln < LNG[1]:
            return round(la, 6), round(ln, 6)
    return None


def build(src: Path):
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    ulps, rows, seen, warns, info = [], [], set(), [], []
    skipped = 0
    for f in files:
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        n = 0
        for ws in wb:
            it = ws.iter_rows(values_only=True)
            head = next(it, None)
            if not head:
                continue
            idx = {_s(h).upper(): i for i, h in enumerate(head)}
            if not all(k in idx for k in ("ULP", "WATT", "KOORDINAT")):
                warns.append(f"{f.name}/{ws.title}: kolom ULP/WATT/KOORDINAT tidak lengkap, dilewati")
                continue
            ji = idx.get("JENIS LAMPU")
            for r in it:
                u, c = _s(r[idx["ULP"]]).upper(), _coord(r[idx["KOORDINAT"]])
                if not u:
                    continue
                if c is None:
                    skipped += 1
                    continue
                try:
                    w = round(float(r[idx["WATT"]] or 0))
                except (TypeError, ValueError):
                    w = 0
                j = _s(r[ji]) if ji is not None else ""
                key = (u, c, w, j)
                if key in seen:
                    continue
                seen.add(key)
                if u not in ulps:
                    ulps.append(u)
                rows.append([ulps.index(u), j or "Tidak Ada", w, c[0], c[1]])
                n += 1
        info.append({"file": f.name, "rows": n})
    if skipped:
        warns.append(f"{skipped} baris dilewati karena koordinat tidak terbaca / di luar Sulawesi Barat")
    if not rows:
        raise RuntimeError("tidak ada titik PJU yang terbaca")
    return {"cols": COLS, "ulp": ulps, "rows": rows, "files": info, "skipped": skipped,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, warns
