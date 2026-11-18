"""Ringkasan Monitoring Billing dari Excel (satu baris = satu pelanggan, 92 kolom).

Ringkasan (agregat) disimpan di baris tul_data id='billing'. Daftar pelanggan per penanda kualitas
(kWh nol, selisih > 50%, dst.) disimpan terpisah di tul_data id='bd:<periode>:<penanda>' agar bisa dilihat
dan diunduh dari menu (hanya untuk pengguna yang login). Satu file = satu periode (kolom thblrek, mis. 202611).
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

# kode unitup -> nama ULP (UP3 Mamuju)
ULP = {"32910": "ULP Manakarra", "32920": "ULP Pasangkayu", "32930": "ULP Majene",
       "32940": "ULP Wonomulyo", "32950": "ULP Polewali", "32960": "ULP Mamasa"}
BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

DETAIL_VERSION = 2  # naikkan bila isi daftar pelanggan berubah -> periode dibaca ulang
DETAIL_COLS = ["idpel", "nama", "alamat", "ulp", "tarif", "daya", "kelompok", "kwh_pakai", "kwh_tagih", "jamnyala", "rptag", "status", "status_lalu"]
NEED = ["thblrek", "idpel", "nama", "alamat", "jamnyala", "pemkwh_real", "dlpd_lm", "unitup", "tarif", "daya", "kdprosesklp", "kogol", "rptag", "rppln", "rpbpju", "rpppn",
        "pemkwh", "dlpd", "dlpd_kvarh", "dlpd_3bln", "dlpd_jnsmutasi", "jamnyala400", "jamnyala600"]
# penanda kualitas (jumlah pelanggan); urutan = urutan tampil
FLAGS = [
    ("nol", "kWh nol"),
    ("jam40", "Pemakaian < 40 jam nyala"),
    ("dev50", "Selisih > 50% rata-rata 3 bulan"),
    ("jn400", "Jam nyala > 400"),
    ("jn600", "Jam nyala > 600"),
    ("pecah", "Rekening pecahan"),
    ("mundur", "Stand meter mundur"),
    ("kvarh", "kVArh bermasalah"),
]
DLPD = {"N": "Normal", "C": "kWh < 40 jam", "K": "kWh nol", "J": "Rekening pecahan", "L": "Stand meter mundur", "M": "kWh maksimum"}


def md5(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def _num(v) -> float:
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def ym_label(ym: str) -> str:
    return f"{BULAN[int(ym[4:]) - 1]} {ym[:4]}"


def peek_period(path: Path):
    """Periode (thblrek) dari baris data pertama, tanpa membaca seluruh file."""
    wb = openpyxl.load_workbook(path, read_only=True)
    try:
        it = wb.active.iter_rows(values_only=True)
        hdr = [_s(x).lower() for x in next(it)]
        row = next(it)
        return _s(row[hdr.index("thblrek")])
    finally:
        wb.close()


def _acc():
    return {"n": 0, "kwh": 0.0, "rptag": 0.0, "rppln": 0.0, "daya": 0.0}


def _add(a, n, kwh, rptag, rppln, daya):
    a["n"] += 1
    a["kwh"] += kwh
    a["rptag"] += rptag
    a["rppln"] += rppln
    a["daya"] += daya


def _fin(a, extra=None):
    d = {"n": a["n"], "kwh": round(a["kwh"]), "rptag": round(a["rptag"]), "rppln": round(a["rppln"]), "kva": round(a["daya"] / 1000, 1)}
    if extra:
        d.update(extra)
    return d


def build_period(path: Path) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    hdr = [_s(x).lower() for x in next(it)]
    missing = [c for c in NEED if c not in hdr]
    if missing:
        raise ValueError(f"kolom tidak ditemukan: {', '.join(missing)}")
    ix = {c: hdr.index(c) for c in NEED}
    g = lambda r, c: r[ix[c]]  # noqa: E731

    tot, bpju, ppn = _acc(), 0.0, 0.0
    ulp, tarif, proses = {}, {}, {}
    ulp_flag, flag_tot = {}, {k: 0 for k, _ in FLAGS}
    dlpd_c, mut_c, kogol_c = {}, {}, {}
    detail = {k: [] for k, _ in FLAGS}
    periods, seen, dup = {}, set(), 0
    for r in it:
        if not r or g(r, "idpel") is None:
            continue
        idp = _s(g(r, "idpel"))
        if idp in seen:
            dup += 1
            continue
        seen.add(idp)
        ym = _s(g(r, "thblrek"))
        periods[ym] = periods.get(ym, 0) + 1
        kwh, rptag, rppln, daya = _num(g(r, "pemkwh")), _num(g(r, "rptag")), _num(g(r, "rppln")), _num(g(r, "daya"))
        bpju += _num(g(r, "rpbpju"))
        ppn += _num(g(r, "rpppn"))
        _add(tot, 1, kwh, rptag, rppln, daya)
        u = _s(g(r, "unitup"))
        _add(ulp.setdefault(u, _acc()), 1, kwh, rptag, rppln, daya)
        _add(tarif.setdefault(_s(g(r, "tarif")) or "-", _acc()), 1, kwh, rptag, rppln, daya)
        _add(proses.setdefault(_s(g(r, "kdprosesklp")) or "-", _acc()), 1, kwh, rptag, rppln, daya)
        kg = _s(g(r, "kogol")) or "-"
        kogol_c[kg] = kogol_c.get(kg, 0) + 1

        d = _s(g(r, "dlpd")).upper()
        k3 = _s(g(r, "dlpd_3bln"))
        fl = {
            "nol": d.startswith("K"), "jam40": d.startswith("C"), "dev50": k3.startswith(">"),
            "jn400": _s(g(r, "jamnyala400")).startswith(">"), "jn600": _s(g(r, "jamnyala600")).startswith(">"),
            "pecah": d.startswith("J"), "mundur": d.startswith("L"),
            "kvarh": _s(g(r, "dlpd_kvarh")).upper() not in ("", "TANPA KVARH"),
        }
        uf = ulp_flag.setdefault(u, {k: 0 for k, _ in FLAGS})
        rec = None
        for k, on in fl.items():
            if on:
                uf[k] += 1
                flag_tot[k] += 1
                if rec is None:
                    rec = [idp, _s(g(r, "nama")), _s(g(r, "alamat")), ULP.get(u, f"ULP {u}"), _s(g(r, "tarif")), round(daya),
                           _s(g(r, "kdprosesklp")), round(_num(g(r, "pemkwh_real"))), round(kwh), round(_num(g(r, "jamnyala"))), round(rptag),
                           DLPD.get(d[:1], d.title()), DLPD.get(_s(g(r, "dlpd_lm")).upper()[:1], _s(g(r, "dlpd_lm")).title())]
                detail[k].append(rec)
        dk = DLPD.get(d[:1], d.title() or "Lainnya")
        dlpd_c[dk] = dlpd_c.get(dk, 0) + 1
        m = _s(g(r, "dlpd_jnsmutasi")).capitalize()
        if m and m.upper() != "TANPA PECAHAN":
            mut_c[m] = mut_c.get(m, 0) + 1
    wb.close()

    ym = max(periods, key=periods.get) if periods else ""
    if not re.fullmatch(r"\d{6}", ym):
        raise ValueError("kolom thblrek tidak berisi periode (YYYYMM)")
    for k in detail:
        detail[k].sort(key=lambda x: -x[8])  # kWh terbesar dulu
    srt = lambda d: sorted(d.items(), key=lambda kv: -kv[1]["kwh"])  # noqa: E731
    out = {
        "ym": ym, "label": ym_label(ym), "detail_v": DETAIL_VERSION, "src_md5": md5(path), "file": path.name, "rows": tot["n"], "dup": dup,
        "other_periods": {k: v for k, v in periods.items() if k != ym},
        "total": _fin(tot, {"bpju": round(bpju), "ppn": round(ppn)}),
        "ulp": [_fin(a, {"code": k, "name": ULP.get(k, f"ULP {k}"), "flags": ulp_flag[k]}) for k, a in sorted(ulp.items(), key=lambda kv: kv[0])],
        "tarif": [_fin(a, {"name": k}) for k, a in srt(tarif)],
        "proses": [_fin(a, {"name": k}) for k, a in sorted(proses.items())],
        "flags": [{"k": k, "label": lb, "n": flag_tot[k]} for k, lb in FLAGS],
        "dlpd": [{"label": k, "n": v} for k, v in sorted(dlpd_c.items(), key=lambda kv: -kv[1])],
        "mutasi": [{"label": k, "n": v} for k, v in sorted(mut_c.items(), key=lambda kv: -kv[1])],
        "kogol": [{"label": k, "n": v} for k, v in sorted(kogol_c.items(), key=lambda kv: -kv[1])],
    }
    return out, detail


def main(src: Path, cached: dict | None = None, log=print) -> dict:
    """-> {generated_at, order, periods, warnings, details: {ym: {penanda: [baris...]}}} (details hanya periode yang baru dibaca)"""
    """src = folder 'Mon Billing'. cached = {ym: hasil_periode_sebelumnya} (dipakai ulang bila file tidak berubah)."""
    cached = cached or {}
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    by_ym, warns, details = {}, [], {}
    for p in files:
        try:
            ym = peek_period(p)
        except Exception as e:  # satu file rusak tidak menggagalkan yang lain
            warns.append(f"{p.name}: dilewati ({e})")
            continue
        by_ym.setdefault(ym, []).append(p)
    periods = {}
    for ym, ps in by_ym.items():
        p = ps[-1]  # nama terurut -> yang terakhir
        if len(ps) > 1:
            warns.append(f"periode {ym} ada di {len(ps)} file ({', '.join(x.name for x in ps)}); dipakai {p.name}")
        old = cached.get(ym)
        h = md5(p)
        if old and old.get("src_md5") == h and old.get("detail_v") == DETAIL_VERSION:
            log(f"  {p.name}: tidak berubah, pakai hasil sebelumnya")
            periods[ym] = old
            continue
        log(f"  {p.name}: membaca…")
        try:
            periods[ym], details[ym] = build_period(p)
        except Exception as e:
            warns.append(f"{p.name}: gagal ({e})")
            continue
        tail = p.stem[-4:]
        if tail.isdigit() and tail != ym[2:]:
            warns.append(f"{p.name}: periode di isi file ({ym}) berbeda dengan nama file")
    order = sorted(periods)
    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "order": order,
            "periods": periods, "warnings": warns, "details": details}
