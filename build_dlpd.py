"""Analisis DLPD Prabayar (pelanggan prabayar yang tidak membeli token) dari Excel.

Sumber: folder Drive "Transaksi Energi/DLPD PRABAYAR/<kriteria>/DLPD_Prabayar_Tdk_Beli_Token_<yyyymm>_<kodeULP>.xlsx"
(satu file = satu ULP untuk satu periode; subfolder = kriteria, mis. 4SD6_BULAN). Periode dibaca dari kolom `thbl`.

Keluaran:
  * ringkasan agregat  -> tul_data id='dlpd'
  * daftar pelanggan   -> tul_data id='dl:<periode>:<kodeULP>' (hanya dibaca saat diminta, perlu login)
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import openpyxl

from build_billing import BULAN, ULP, ym_label

DETAIL_VERSION = 1
KEEP_DETAIL = 6  # daftar pelanggan disimpan untuk N periode terakhir
COLS = ["idpel", "nama", "alamat", "ulp", "tarif", "daya", "kriteria", "status", "idle", "beli_akhir", "meter", "merek", "thn_meter",
        "dlpd", "p2tl", "ct", "petugas", "gardu", "tiang", "lat", "lng"]
NEED = ["thbl", "idpel", "nomorMeter", "unitup", "tarif", "daya", "kriteria", "nama", "alamat", "kodeGardu", "noTiang", "koordinatX", "koordinatY",
        "merekMeter", "thnBuatMeter", "jmlP2tl", "beliTokenAkhir", "namaPetugasCt", "jmlCt", "dlpd"]
MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
DAYA_GRP = [(450, "≤ 450 VA"), (900, "900 VA"), (1300, "1.300 VA"), (2200, "2.200 VA"), (5500, "3.500 – 5.500 VA"), (10 ** 9, "> 5.500 VA")]


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _i(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _coord(v):
    try:
        f = float(str(v).replace(",", "."))
        return round(f, 6) if f else None
    except (TypeError, ValueError):
        return None


def _ym_of(v) -> str | None:
    """'2026-05-21' / datetime / date -> '202605'."""
    if v is None or v == "":
        return None
    if hasattr(v, "year"):
        return f"{v.year:04d}{v.month:02d}"
    m = re.match(r"(\d{4})-(\d{2})", _s(v))
    return m.group(1) + m.group(2) if m else None


def _months_between(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[4:]) - int(a[4:])


def _ym_name(ym: str) -> str:
    return f"{MON[int(ym[4:]) - 1]} {ym[:4]}"


def _daya_grp(d: int) -> str:
    for lim, name in DAYA_GRP:
        if d <= lim:
            return name
    return DAYA_GRP[-1][1]


def read_file(p: Path):
    """-> list[dict] baris pelanggan satu file (kolom yang dibutuhkan saja)."""
    wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        it = ws.iter_rows(values_only=True)
        head = [_s(h) for h in next(it)]
        ix = {h: i for i, h in enumerate(head)}
        miss = [c for c in ("thbl", "idpel", "unitup") if c not in ix]
        if miss:
            raise ValueError("kolom wajib tidak ada: " + ", ".join(miss))
        out = []
        for r in it:
            if not r or r[ix["idpel"]] in (None, ""):
                continue
            out.append({c: (r[ix[c]] if c in ix and ix[c] < len(r) else None) for c in NEED})
        return out
    finally:
        wb.close()


def build(src: Path):
    """-> (ringkasan, detail{ 'ym:kodeULP': {'cols','rows'} }, peringatan)"""
    warns = []
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    raw = defaultdict(dict)  # ym -> {(idpel, kriteria): baris}
    names = defaultdict(list)
    dup = Counter()
    for p in files:
        try:
            rows = read_file(p)
        except Exception as e:  # satu file rusak tidak menggagalkan yang lain
            warns.append(f"{p.name}: dilewati ({e})")
            continue
        if not rows:
            warns.append(f"{p.name}: kosong")
            continue
        m = re.search(r"_(\d{6})_", p.name)
        for r in rows:
            ym = _s(r["thbl"])[:6] or (m.group(1) if m else "")
            if not re.fullmatch(r"\d{6}", ym):
                warns.append(f"{p.name}: periode tidak terbaca")
                break
            key = (_s(r["idpel"]), _s(r["kriteria"]) or p.parent.name)
            if key in raw[ym]:
                dup[ym] += 1
                continue
            raw[ym][key] = r
        else:
            names[ym].append(p.name)
    order = sorted(raw)
    ids = {ym: {k[0] for k in raw[ym]} for ym in order}
    crit_of = {ym: {k[0]: k[1] for k in raw[ym]} for ym in order}

    periods, detail = {}, {}
    for i, ym in enumerate(order):
        prev = order[i - 1] if i else None
        rows_out = []  # untuk daftar
        agg = {"ulp": defaultdict(Counter), "tarif": Counter(), "daya": Counter(), "merek": Counter(), "umur": Counter(), "beli": Counter(),
               "dlpd": Counter(), "kriteria": Counter(), "idle": Counter()}
        n_ct = n_p2 = n_nocoord = 0
        for (idpel, krit), r in raw[ym].items():
            code = _s(r["unitup"])
            daya = _i(r["daya"])
            thn = _i(r["thnBuatMeter"])
            beli = _ym_of(r["beliTokenAkhir"])
            idle = _months_between(beli, ym) if beli else None
            ct, p2 = _i(r["jmlCt"]), _i(r["jmlP2tl"])
            lat, lng = _coord(r["koordinatX"]), _coord(r["koordinatY"])
            if prev is None:
                st = ""
            elif idpel not in ids[prev]:
                st = "Baru"
            else:
                st = "Berlanjut" if crit_of[prev][idpel] == krit else "Pindah kriteria"
            row = [idpel, _s(r["nama"]), _s(r["alamat"]), ULP.get(code, code), _s(r["tarif"]), daya, krit, st, idle, _s(r["beliTokenAkhir"])[:10],
                   _s(r["nomorMeter"]), _s(r["merekMeter"]), thn or None, _s(r["dlpd"]), p2, ct, _s(r["namaPetugasCt"]), _s(r["kodeGardu"]), _s(r["noTiang"]), lat, lng]
            rows_out.append((code, row))
            u = agg["ulp"][code]
            u["n"] += 1
            u["ct"] += ct > 0
            u["p2tl"] += p2 > 0
            u["nocoord"] += lat is None or lng is None
            if st:
                u[{"Baru": "baru", "Berlanjut": "berlanjut", "Pindah kriteria": "pindah"}[st]] += 1
            n_ct += ct > 0
            n_p2 += p2 > 0
            n_nocoord += lat is None or lng is None
            agg["tarif"][_s(r["tarif"]) or "-"] += 1
            agg["daya"][_daya_grp(daya)] += 1
            agg["merek"][_s(r["merekMeter"]) or "Tidak diketahui"] += 1
            if thn and thn > 1990:
                age = int(ym[:4]) - thn
                agg["umur"]["< 5 tahun" if age < 5 else "5 – 9 tahun" if age < 10 else "10 – 14 tahun" if age < 15 else "≥ 15 tahun"] += 1
            else:
                agg["umur"]["Tidak diketahui"] += 1
            agg["beli"][beli or "-"] += 1
            agg["dlpd"][_s(r["dlpd"]) or "-"] += 1
            agg["kriteria"][krit] += 1
        n = len(rows_out)
        gone = {c: 0 for c in ULP}
        keluar = 0
        if prev:
            for key, r in raw[prev].items():
                if key[0] not in ids[ym]:
                    keluar += 1
                    gone[_s(r["unitup"])] = gone.get(_s(r["unitup"]), 0) + 1
        ulp_list = []
        for code in sorted(set(ULP) | set(agg["ulp"])):
            c = agg["ulp"].get(code, Counter())
            ulp_list.append({"code": code, "name": ULP.get(code, code), "n": c["n"], "ct": c["ct"], "p2tl": c["p2tl"], "nocoord": c["nocoord"],
                             "baru": c["baru"], "berlanjut": c["berlanjut"], "pindah": c["pindah"], "keluar": gone.get(code, 0)})
        tot = {"n": n, "ct": n_ct, "p2tl": n_p2, "nocoord": n_nocoord, "baru": sum(u["baru"] for u in ulp_list), "berlanjut": sum(u["berlanjut"] for u in ulp_list),
               "pindah": sum(u["pindah"] for u in ulp_list), "keluar": keluar}
        top = lambda c, k=None: [{"name": a, "n": b} for a, b in sorted(c.items(), key=lambda x: (-x[1], x[0]))[:k]]
        merek = top(agg["merek"])
        if len(merek) > 8:
            merek = merek[:8] + [{"name": "Lainnya", "n": sum(x["n"] for x in merek[8:])}]
        umur_order = ["< 5 tahun", "5 – 9 tahun", "10 – 14 tahun", "≥ 15 tahun", "Tidak diketahui"]
        daya_order = [g for _, g in DAYA_GRP]
        beli = [{"k": k, "name": _ym_name(k) if k != "-" else "Tidak ada data", "n": c, "idle": _months_between(k, ym) if k != "-" else None}
                for k, c in sorted(agg["beli"].items(), key=lambda x: (x[0] == "-", x[0]))]
        periods[ym] = {
            "ym": ym, "label": ym_label(ym), "files": sorted(names[ym]), "dup": dup[ym], "prev": prev, "total": tot, "ulp": ulp_list,
            "kriteria": top(agg["kriteria"]), "tarif": top(agg["tarif"]), "merek": merek,
            "daya": [{"name": g, "n": agg["daya"][g]} for g in daya_order if agg["daya"][g]],
            "umur": [{"name": g, "n": agg["umur"][g]} for g in umur_order if agg["umur"][g]],
            "beli": beli, "dlpd": top(agg["dlpd"]),
        }
        # daftar pelanggan per ULP, diurutkan: paling lama tidak beli token, lalu daya terbesar
        by_u = defaultdict(list)
        for code, row in rows_out:
            by_u[code].append(row)
        for code, rs in by_u.items():
            rs.sort(key=lambda r: (-(r[8] if r[8] is not None else -1), -r[5], r[0]))
            detail[f"{ym}:{code}"] = {"cols": COLS, "rows": rs}
    return {"order": order, "periods": periods, "warnings": warns, "v": DETAIL_VERSION, "latest": order[-1] if order else None}, detail, warns


def main(src: Path, out: Path | None = None):  # uji lokal
    import json
    summary, detail, warns = build(src)
    print({ym: p["total"] for ym, p in summary["periods"].items()}, warns)
    print("daftar:", {k: len(v["rows"]) for k, v in detail.items()})
    if out:
        out.write_text(json.dumps(summary, ensure_ascii=False), encoding="utf8")
    return summary, detail


if __name__ == "__main__":
    import sys
    main(Path(sys.argv[1]))
