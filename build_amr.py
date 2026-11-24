"""Automatic Meter Reading (AMR): daftar pelanggan ber-AMR dari Excel "DETAIL STATISTIK PELANGGAN".

Sumber: folder Drive "Pemeliharaan Meter/AMR/" (satu atau lebih Excel; header di baris pertama, satu baris = satu pelanggan).
Bila ada beberapa file, ID pelanggan yang sama hanya dihitung sekali (file yang lebih akhir menurut nama dipakai).
Keluaran: tul_data id='amr' = daftar pelanggan (kolom kategorikal disimpan sebagai indeks ke kamus `dict`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import openpyxl

# kolom kategorikal -> kunci kamus
CAT = {"ulp": "UNITUP NAME", "tarif": "TARIFF", "merk": "MERK METER", "type": "TYPE METER", "cmerk": "MERK COMM DEVICE",
       "ctype": "TYPE COMM DEVICE", "prov": "PROVIDER", "bill": "BILL REFF KWH", "tg": "T / G", "mccb": "MCCB STATUS"}
# kolom teks bebas
TXT = {"idpel": "ID PELANGGAN", "nama": "NAME", "alamat": "ADDRESS", "daya": "DAYA", "nometer": "NO METER", "nocomm": "NO COMM DEVICE",
       "sim": "NO SIM", "ip": "IP ADDRESS"}
COLS = list(TXT) + list(CAT)   # urutan kolom pada `rows`; kolom kategorikal berisi indeks ke dict[nama]


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _ulp(v: str) -> str:
    v = v.upper()
    v = v[4:] if v.startswith("ULP ") else v
    return v.title() if v else "Tidak tercatat"


def build(src: Path):
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    recs: dict[str, dict] = {}
    warns, info = [], []
    for f in files:
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        n = 0
        try:
            for ws in wb:
                ws.reset_dimensions()   # file ekspor ini menyimpan dimensi A1:C1 yang salah -> mode baca cepat hanya melihat 3 kolom
                it = ws.iter_rows(values_only=True)
                head = next(it, None)
                if not head:
                    continue
                ix = {_s(h).upper(): i for i, h in enumerate(head)}
                need = ["ID PELANGGAN", "UNITUP NAME", "MERK METER", "MERK COMM DEVICE"]
                if not all(k in ix for k in need):
                    warns.append(f"{f.name}/{ws.title}: kolom {', '.join(k for k in need if k not in ix)} tidak ada, dilewati")
                    continue
                for r in it:
                    if not r:
                        continue
                    g = lambda k: _s(r[ix[k]]) if k in ix and ix[k] < len(r) else ""
                    idp = g("ID PELANGGAN")
                    if not idp:
                        continue
                    recs[idp] = {k: g(c) for k, c in {**TXT, **CAT}.items()}
                    n += 1
        finally:
            wb.close()
        info.append({"file": f.name, "rows": n})
    if not recs:
        raise RuntimeError("tidak ada data AMR yang terbaca")
    dic = {k: [] for k in CAT}
    pos = {k: {} for k in CAT}
    rows = []
    for idp in sorted(recs):
        r = recs[idp]
        out = [r[k] for k in TXT]
        for k in CAT:
            v = _ulp(r[k]) if k == "ulp" else (r[k] or "Tidak tercatat")
            if v not in pos[k]:
                pos[k][v] = len(dic[k])
                dic[k].append(v)
            out.append(pos[k][v])
        rows.append(out)
    return {"cols": COLS, "dict": dic, "rows": rows, "files": info,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, warns
