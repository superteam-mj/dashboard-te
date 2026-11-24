"""LBKB (Laporan Baca Kelainan/Kode pesan) dari Excel "Mon DPM": ringkasan per kode pesan + peringatan kode berulang.

Sumber: folder Drive "Transaksi Energi/Mon DPM/" - satu Excel per bulan (monitoring_dpm_YYMM.xlsx), header di baris pertama,
satu baris = satu pelanggan. Kolom dipakai: thblrek (YYYYMM), idpel, nama, unitup, tarif, daya, kd_pesan.

Aturan peringatan: kode pesan yang dipantau = WATCH. Rangkaian = bulan-bulan berturut-turut (dari bulan yang dilihat mundur) yang kodenya
ada di WATCH (kode boleh berbeda, mis. I lalu H). 2 bulan = Hati-hati (kuning), 3 bulan = Bahaya (merah), 4 bulan atau lebih = Kinerja 0 (hitam).
Bulan tanpa baris pelanggan / tanpa kode WATCH memutus rangkaian. Hitungan per bulan dihitung di sini (lv) dan di browser (daftar).

Keluaran: tul_data id='lbkb'.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import openpyxl

WATCH = ["3", "7", "C", "E", "U", "W", "A", "H", "I", "1"]
ULP = {"32910": "Manakarra", "32920": "Pasangkayu", "32930": "Majene", "32940": "Wonomulyo", "32950": "Polewali", "32960": "Mamasa"}
NEED = ["thblrek", "idpel", "unitup", "kd_pesan"]
COLS = ["idpel", "nama", "ulp", "tarif", "daya", "kode"]   # kode = daftar kode per bulan (urut sesuai months; "" = tidak ada baris)


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _ulp(v: str) -> str:
    v = v.split(".")[0]
    return ULP.get(v, v or "Tidak tercatat")


def _next(ym: str) -> str:
    y, m = int(ym[:4]), int(ym[4:])
    return f"{y + (m == 12)}{1 if m == 12 else m + 1:02d}"


def streak(codes: list[str], months: list[str], i: int) -> int:
    """panjang rangkaian kode WATCH yang berakhir di bulan ke-i (bulan berturut-turut menurut kalender)."""
    n = 0
    while i >= 0 and codes[i] in WATCH:
        n += 1
        if i == 0 or _next(months[i - 1]) != months[i]:
            break
        i -= 1
    return n


def level(n: int) -> int:
    """0 = aman, 1 = kuning, 2 = merah, 3 = hitam."""
    return 0 if n < 2 else 1 if n == 2 else 2 if n == 3 else 3


def build(src: Path):
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    counts: dict[str, dict[str, dict[str, int]]] = {}   # ym -> ulp -> kode -> n
    seq: dict[str, dict[str, str]] = {}                 # idpel -> ym -> kode
    meta: dict[str, tuple] = {}                         # idpel -> (nama, ulp, tarif, daya, ym terakhir)
    warns, info = [], []
    for f in files:
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        n = 0
        try:
            for ws in wb:
                ws.reset_dimensions()
                it = ws.iter_rows(values_only=True)
                head = next(it, None)
                if not head:
                    continue
                ix = {_s(h).lower(): i for i, h in enumerate(head)}
                miss = [k for k in NEED if k not in ix]
                if miss:
                    warns.append(f"{f.name}/{ws.title}: kolom {', '.join(miss)} tidak ada, dilewati")
                    continue
                ti, ii, ui, ki = ix["thblrek"], ix["idpel"], ix["unitup"], ix["kd_pesan"]
                ni, ri, di = ix.get("nama"), ix.get("tarif"), ix.get("daya")
                top = max(x for x in (ti, ii, ui, ki, ni, ri, di) if x is not None)
                for r in it:
                    if not r or len(r) <= top:
                        continue
                    ym, idp = _s(r[ti])[:6], _s(r[ii])
                    if len(ym) != 6 or not ym.isdigit() or not idp:
                        continue
                    u, k = _ulp(_s(r[ui])), _s(r[ki]).upper() or "(kosong)"
                    c = counts.setdefault(ym, {}).setdefault(u, {})
                    c[k] = c.get(k, 0) + 1
                    n += 1
                    seq.setdefault(idp, {})[ym] = k
                    if k in WATCH:
                        old = meta.get(idp)
                        if not old or old[4] <= ym:
                            meta[idp] = (_s(r[ni]) if ni is not None else "", u, _s(r[ri]) if ri is not None else "", _s(r[di]) if di is not None else "", ym)
        finally:
            wb.close()
        info.append({"file": f.name, "rows": n})
    months = sorted(counts)
    if not months:
        raise RuntimeError("tidak ada data Mon DPM yang terbaca")
    return _finish(months, counts, seq, meta, info, warns)


def _finish(months, counts, seq, meta, info, warns):
    # hanya pelanggan yang pernah berkode WATCH disimpan (lengkap dengan kode di bulan lainnya)
    ulps = sorted({u for m in counts.values() for u in m})
    codes = sorted({k for m in counts.values() for u in m.values() for k in u}, key=lambda k: (k not in WATCH, k))
    rows = []
    for idp, s in seq.items():
        if idp not in meta:
            continue
        nama, u, trf, dy, _ = meta[idp]
        rows.append([idp, nama, u, trf, dy, [s.get(m, "") for m in months]])
    rows.sort(key=lambda r: (r[2], r[0]))
    lv = {m: {u: [0, 0, 0, 0] for u in ulps} for m in months}   # per ULP: [pelanggan berkode pantau, kuning, merah, hitam]
    for r in rows:
        for i, m in enumerate(months):
            if r[5][i] in WATCH:
                a = lv[m][r[2]]
                a[0] += 1
                L = level(streak(r[5], months, i))
                if L:
                    a[L] += 1
    return {"months": months, "ulps": ulps, "codes": codes, "watch": WATCH, "counts": counts, "lv": lv,
            "cols": COLS, "rows": rows, "files": info,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, warns
