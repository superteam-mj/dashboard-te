"""P2TL > Realisasi Tagihan Susulan (TS): laporan pendapatan TS per pelanggan.

Sumber: folder Drive "Pengendalian Susut/P2TL/Laporan Tagihan Susulan/" (satu atau lebih Excel; header baris pertama, tidak peka huruf besar/kecil).
Kolom dipakai: NO AGENDA, IDPEL, NAMA, GOLONGAN, ALAMAT, TARIP, DAYA, KWH, RP KWH, RP BEBAN, RP TS, RP METERAI, RP MATERIAL, TOTAL P2TL,
TUNAI, RP TOTAL ANGSUR, TGL REGISTER (dd/mm/yyyy), NO SIP, RP PPJ. ULP diambil dari kode unit pada NO AGENDA (P2TL/<unit>/...).
Keluaran: tul_data id='p2tl_ts' = {cols, rows, files, ...}; ringkasan dihitung di browser (docs/assets/ts.js).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ULP = {"32910": "ULP Manakarra", "32920": "ULP Pasangkayu", "32930": "ULP Majene",
       "32940": "ULP Wonomulyo", "32950": "ULP Polewali", "32960": "ULP Mamasa"}
COLS = ["agenda", "ulp", "idpel", "nama", "gol", "alamat", "tarif", "daya", "kwh", "rp_kwh", "rp_beban", "rp_ts", "meterai", "material",
        "ppj", "total", "tunai", "angsur", "tgl", "sip"]
NEED = ("NO AGENDA", "TOTAL P2TL", "TUNAI")


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _n(v) -> float:
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        try:
            return float(_s(v).replace(".", "").replace(",", "."))
        except ValueError:
            return 0.0


def _date(v) -> str | None:
    if isinstance(v, datetime):
        return v.date().isoformat()
    t = _s(v)
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", t)
    if m:
        d, mo, y = map(int, m.groups())
        return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", t)
    return m.group(0) if m else None


# ---- file target (kWh per ULP per bulan) -------------------------------------------------------------------------------
# Excel di folder yang sama dengan laporan. Dikenali dari header: kolom ULP + (kolom BULAN dan TARGET) atau (ULP + kolom bulan).
#   Format panjang :  ULP | BULAN | TARGET (kWh)           mis. Manakarra | 2026-11 | 120000
#   Format lebar   :  ULP | 2026-01 | 2026-02 | ...        (judul kolom = bulan; sel = target kWh)
BULAN_ID = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MEI": 5, "JUN": 6, "JUL": 7, "AGU": 8, "AGT": 8, "SEP": 9, "OKT": 10, "NOV": 11, "DES": 12,
            "JANUARI": 1, "FEBRUARI": 2, "MARET": 3, "APRIL": 4, "JUNI": 6, "JULI": 7, "AGUSTUS": 8, "SEPTEMBER": 9, "OKTOBER": 10,
            "NOVEMBER": 11, "DESEMBER": 12, "PEBRUARI": 2, "NOPEMBER": 11, "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "MAY": 5, "JUNE": 6, "JULY": 7,
            "AUGUST": 8, "OCTOBER": 10, "DECEMBER": 12, "AUG": 8, "OCT": 10, "DEC": 12}


def _ym(v) -> str | None:
    """Tanggal / '2026-11' / '11/2026' / 'Nov 2026' / 'November-26' -> 'YYYY-MM'."""
    if isinstance(v, datetime):
        return f"{v.year:04d}-{v.month:02d}"
    t = _s(v).upper()
    m = re.match(r"^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$", t)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}" if 1 <= mo <= 12 else None
    m = re.match(r"^(\d{1,2})[-/.](\d{4})$", t)
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}" if 1 <= mo <= 12 else None
    m = re.match(r"^([A-Z]+)[\s\-/.']*(\d{2}|\d{4})$", t)
    if m and m.group(1) in BULAN_ID:
        y = int(m.group(2))
        return f"{(2000 + y) if y < 100 else y:04d}-{BULAN_ID[m.group(1)]:02d}"
    return None


def _ulp(v) -> str | None:
    t = re.sub(r"^ULP\s+", "", _s(v).upper()).strip()
    if not t:
        return None
    for code, name in ULP.items():
        if t == code or t == name.replace("ULP ", "").upper():
            return name
    return None


def _targets(ws, head, it, warns, fname):
    """-> daftar {ulp, bln, target} bila sheet ini berformat target, selain itu None."""
    idx = {_s(h).upper(): i for i, h in enumerate(head) if _s(h)}
    iu = next((i for k, i in idx.items() if k in ("ULP", "UNIT", "UNITUP")), None)
    if iu is None:
        return None
    ib = next((i for k, i in idx.items() if k in ("BULAN", "PERIODE", "THBL")), None)
    it_ = next((i for k, i in idx.items() if k.startswith("TARGET")), None)
    out, bad = [], 0
    if ib is not None and it_ is not None:                      # format panjang
        for r in it:
            u, b = _ulp(r[iu]), _ym(r[ib]) if ib < len(r) else None
            if u is None and not _s(r[iu]):
                continue
            if u is None or b is None:
                bad += 1
                continue
            out.append({"ulp": u, "bln": b, "target": round(_n(r[it_]), 2)})
    else:                                                        # format lebar
        mcols = [(i, _ym(h)) for i, h in enumerate(head) if i != iu and _ym(h)]
        if not mcols:
            return None
        for r in it:
            u = _ulp(r[iu])
            if u is None:
                if _s(r[iu]):
                    bad += 1
                continue
            for i, b in mcols:
                if i < len(r) and r[i] not in (None, ""):
                    out.append({"ulp": u, "bln": b, "target": round(_n(r[i]), 2)})
    if bad:
        warns.append(f"{fname}/{ws.title}: {bad} baris target dilewati (nama ULP atau bulan tidak dikenali)")
    return out


def build(src: Path):
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    recs, warns, info, tgt, info_t = {}, [], [], {}, []
    for f in files:
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        n = 0
        for ws in wb:
            it = ws.iter_rows(values_only=True)
            head = next(it, None)
            if not head:
                continue
            idx = {_s(h).upper(): i for i, h in enumerate(head) if _s(h)}
            if not all(k in idx for k in NEED):
                tl = _targets(ws, head, it, warns, f.name)
                if tl is None:
                    warns.append(f"{f.name}/{ws.title}: bukan laporan tagihan susulan maupun file target, dilewati")
                else:
                    for x in tl:
                        tgt[(x["ulp"], x["bln"])] = x      # file yang lebih belakang (urut nama) menimpa
                    info_t.append({"file": f.name, "rows": len(tl)})
                continue
            g = lambda r, k: r[idx[k]] if k in idx and idx[k] < len(r) else None
            for r in it:
                ag = _s(g(r, "NO AGENDA"))
                if not ag:
                    continue
                unit = ag.split("/")[1] if ag.count("/") >= 2 else ""
                total, tunai = _n(g(r, "TOTAL P2TL")), _n(g(r, "TUNAI"))
                angsur = _n(g(r, "RP TOTAL ANGSUR"))
                recs[ag] = [ag, ULP.get(unit, unit or "Tanpa unit"), _s(g(r, "IDPEL")), _s(g(r, "NAMA")), _s(g(r, "GOLONGAN")), _s(g(r, "ALAMAT")),
                            _s(g(r, "TARIP")), round(_n(g(r, "DAYA"))), round(_n(g(r, "KWH"))), round(_n(g(r, "RP KWH"))), round(_n(g(r, "RP BEBAN"))),
                            round(_n(g(r, "RP TS"))), round(_n(g(r, "RP METERAI"))), round(_n(g(r, "RP MATERIAL"))), round(_n(g(r, "RP PPJ"))),
                            round(total), round(tunai), round(angsur), _date(g(r, "TGL REGISTER")), _s(g(r, "NO SIP"))]
                n += 1
        if n or not any(t["file"] == f.name for t in info_t):   # file target murni tidak dihitung sebagai sumber laporan
            info.append({"file": f.name, "rows": n})
    if not recs and not tgt:
        raise RuntimeError("tidak ada data tagihan susulan yang terbaca")
    rows = sorted(recs.values(), key=lambda x: (x[18] or "", x[0]))
    return {"cols": COLS, "rows": rows, "files": info, "targets": list(tgt.values()), "target_files": info_t,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, warns


def main(src: Path):  # uji lokal
    d, w = build(src)
    print(len(d["rows"]), "baris", d["files"], w)
    print("total", sum(r[15] for r in d["rows"]), "tunai", sum(r[16] for r in d["rows"]), "angsur", sum(r[17] for r in d["rows"]))


if __name__ == "__main__":
    import sys
    main(Path(sys.argv[1]))
