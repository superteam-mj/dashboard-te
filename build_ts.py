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


def build(src: Path):
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    recs, warns, info = {}, [], []
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
                warns.append(f"{f.name}/{ws.title}: kolom NO AGENDA/TOTAL P2TL/TUNAI tidak lengkap, dilewati")
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
        info.append({"file": f.name, "rows": n})
    if not recs:
        raise RuntimeError("tidak ada data tagihan susulan yang terbaca")
    rows = sorted(recs.values(), key=lambda x: (x[18] or "", x[0]))
    return {"cols": COLS, "rows": rows, "files": info,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, warns


def main(src: Path):  # uji lokal
    d, w = build(src)
    print(len(d["rows"]), "baris", d["files"], w)
    print("total", sum(r[15] for r in d["rows"]), "tunai", sum(r[16] for r in d["rows"]), "angsur", sum(r[17] for r in d["rows"]))


if __name__ == "__main__":
    import sys
    main(Path(sys.argv[1]))
