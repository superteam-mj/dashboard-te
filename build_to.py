"""Peta Target Operasi (TO) P2TL: gabungan DLPD Pascabayar (penanda Mon Billing) + koordinat pelanggan (DIL).

Sumber koordinat: Excel di Drive "Transaksi Energi/DIL/TITIK KOORDINAT/KOORDINAT <ULP>.xlsx" dengan kolom IDPEL, KOORDINAT X, KOORDINAT Y.
Nilainya tidak seragam: kadang bilangan bulat tanpa titik desimal (-26861222222 = -2,6861222222), kadang desimal biasa,
dan X/Y kadang tertukar (X = bujur). `norm_pair` memulihkannya dan membuang yang di luar wilayah Sulawesi Barat.

Keluaran: tul_data id='to:pasca' = pelanggan pascabayar ber-penanda DLPD yang punya koordinat, lengkap dengan skor potensi.
Skor prabayar dihitung di peta (dlpd.js) dari daftar DLPD Prabayar yang sudah punya koordinat sendiri.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

import openpyxl

from build_billing import ULP, ym_label

LAT = (-5.0, 1.0)
LNG = (117.0, 121.0)
MAX_ROWS = 25000
MIN_SCORE = 25
COLS = ["idpel", "nama", "alamat", "ulp", "tarif", "daya", "flags", "status", "status_lalu", "kwh", "jam", "lat", "lng", "s", "sd"]

# bobot penanda DLPD pascabayar (potensi pemakaian tidak tercatat / meter dimanipulasi)
FLAG_PTS = {"nol": 45, "mundur": 40, "jam40": 35, "dev50": 25, "kvarh": 20, "pecah": 15, "jn600": 15, "jn400": 10}
FLAG_ORDER = list(FLAG_PTS)


def _cand(v, rng, kind):
    """Satu nilai mentah -> derajat desimal bila masuk rentang `rng`, selain itu None."""
    if v is None or str(v).strip() == "":
        return None
    t = str(v).strip().replace(",", ".")
    try:
        f = float(t)
    except ValueError:
        return None
    if "." in t and abs(f) < 1000:  # sudah desimal biasa
        return f if rng[0] < f < rng[1] else None
    s = str(int(abs(f)))
    sign = -1 if f < 0 else 1
    # lintang: 1 digit bulat (atau 0,x bila nol di depan hilang); bujur: 3 digit bulat
    for sc in ((len(s) - 1, len(s)) if kind == "lat" else (len(s) - 3,)):
        if sc < 0:
            continue
        g = sign * int(s) / 10 ** sc
        if rng[0] < g < rng[1]:
            return g
    return None


def norm_pair(x, y):
    """-> (lat, lng) atau None. Mencoba urutan (X=lintang, Y=bujur) lalu tertukar."""
    for a, b in ((x, y), (y, x)):
        la, ln = _cand(a, LAT, "lat"), _cand(b, LNG, "lng")
        if la is not None and ln is not None:
            return round(la, 6), round(ln, 6)
    return None


def load_coords(src: Path):
    """-> ({idpel: (lat, lng)}, ringkasan per file, peringatan)"""
    coords, info, warns = {}, [], []
    for p in sorted(src.rglob("*.xlsx")):
        if p.name.startswith("~$"):
            continue
        ok = bad = 0
        try:
            wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
            try:
                it = wb.worksheets[0].iter_rows(values_only=True)
                head = [str(h).strip().upper() if h is not None else "" for h in next(it)]
                need = ["IDPEL", "KOORDINAT X", "KOORDINAT Y"]
                if any(c not in head for c in need):
                    raise ValueError("kolom IDPEL / KOORDINAT X / KOORDINAT Y tidak lengkap")
                i0, i1, i2 = (head.index(c) for c in need)
                for r in it:
                    if not r or r[i0] in (None, ""):
                        continue
                    pr = norm_pair(r[i1], r[i2]) if len(r) > max(i1, i2) else None
                    if pr:
                        coords[str(r[i0]).strip()] = pr
                        ok += 1
                    else:
                        bad += 1
            finally:
                wb.close()
        except Exception as e:
            warns.append(f"{p.name}: dilewati ({e})")
            continue
        info.append({"file": p.name, "ok": ok, "bad": bad})
        if bad:
            warns.append(f"{p.name}: {bad} baris koordinat tidak valid/di luar wilayah diabaikan")
    return coords, info, warns


def score(flags, daya, status_lalu):
    pts = sorted((FLAG_PTS[f] for f in flags if f in FLAG_PTS), reverse=True)
    a = pts[0] if pts else 0
    b = min(15, 5 * (len(pts) - 1)) if pts else 0
    c = 25 if daya >= 3500 else 15 if daya >= 2200 else 8 if daya >= 1300 else 3
    d = 10 if status_lalu and status_lalu not in ("Normal", "-") else 0
    return a + b + c + d, [a, b, c, d]


def build_pasca(ym: str, lists: dict, coords: dict):
    """lists = {penanda: {'cols': DETAIL_COLS, 'rows': [...]}} dari tul_data bd:<ym>:<penanda>."""
    cust = {}
    for flag, doc in lists.items():
        cols = doc["cols"]
        ix = {c: i for i, c in enumerate(cols)}
        for r in doc["rows"]:
            e = cust.get(r[ix["idpel"]])
            if e is None:
                e = cust[r[ix["idpel"]]] = {"r": {c: r[i] for c, i in ix.items()}, "f": []}
            e["f"].append(flag)
    rows, nocoord, total = [], Counter(), Counter()
    for idpel, e in cust.items():
        r = e["r"]
        total[r["ulp"]] += 1
        pr = coords.get(str(idpel).strip())
        if not pr:
            nocoord[r["ulp"]] += 1
            continue
        fl = sorted(e["f"], key=FLAG_ORDER.index)
        daya = r.get("daya") or 0
        s, sd = score(fl, daya, r.get("status_lalu") or "")
        if s < MIN_SCORE:
            continue
        rows.append([idpel, r["nama"], r["alamat"], r["ulp"], r["tarif"], daya, fl, r["status"], r.get("status_lalu") or "", r.get("kwh_pakai"), r.get("jamnyala"),
                     pr[0], pr[1], s, sd])
    rows.sort(key=lambda x: (-x[13], -x[5], x[0]))
    cut = max(0, len(rows) - MAX_ROWS)
    rows = rows[:MAX_ROWS]
    return {"ym": ym, "label": ym_label(ym), "cols": COLS, "rows": rows, "flagged": len(cust), "nocoord": sum(nocoord.values()), "cut": cut,
            "ulp_total": dict(total), "ulp_nocoord": dict(nocoord)}
