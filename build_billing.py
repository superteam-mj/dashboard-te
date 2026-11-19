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

DETAIL_VERSION = 3  # naikkan bila isi daftar/vektor pelanggan berubah -> periode dibaca ulang
ANALYTICS_VERSION = 2  # naikkan bila isi daftar pelanggan berubah -> periode dibaca ulang
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
    V = []  # vektor pelanggan untuk analisis lintas bulan
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
        try:
            V.append((int(idp), u, _s(g(r, "tarif")) or "-", round(daya), round(_num(g(r, "pemkwh_real"))), round(kwh),
                      round(_num(g(r, "jamnyala"))), round(rppln), _s(g(r, "nama")), _s(g(r, "alamat"))))
        except ValueError:
            pass
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
    V.sort(key=lambda v: v[0])
    vec = encode_vec(V)
    names = {"nm": [v[8] for v in V], "al": [v[9] for v in V]}
    return out, detail, vec, names


def pick_files(src: Path):
    """-> ({periode: file_terpilih}, peringatan). Periode dibaca dari isi file (bukan dari nama)."""
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$"))
    by_ym, warns = {}, []
    for p in files:
        try:
            ym = peek_period(p)
        except Exception as e:  # satu file rusak tidak menggagalkan yang lain
            warns.append(f"{p.name}: dilewati ({e})")
            continue
        by_ym.setdefault(ym, []).append(p)
    chosen = {}
    for ym, ps in sorted(by_ym.items()):
        chosen[ym] = ps[-1]  # nama terurut -> yang terakhir
        if len(ps) > 1:
            warns.append(f"periode {ym} ada di {len(ps)} file ({', '.join(x.name for x in ps)}); dipakai {ps[-1].name}")
        tail = ps[-1].stem[-4:]
        if tail.isdigit() and tail != ym[2:]:
            warns.append(f"{ps[-1].name}: periode di isi file ({ym}) berbeda dengan nama file")
    return chosen, warns


# ---------------------------------------------------------------- vektor pelanggan (kolom, id di-delta)
def encode_vec(V):
    units = sorted({v[1] for v in V})
    tarifs = sorted({v[2] for v in V})
    ui, ti = {u: i for i, u in enumerate(units)}, {t: i for i, t in enumerate(tarifs)}
    ids = [v[0] for v in V]
    return {"n": len(V), "units": units, "tarifs": tarifs,
            "id": [ids[0]] + [ids[i] - ids[i - 1] for i in range(1, len(ids))] if ids else [],
            "u": [ui[v[1]] for v in V], "t": [ti[v[2]] for v in V], "d": [v[3] for v in V],
            "kp": [v[4] for v in V], "kt": [v[5] for v in V], "jn": [v[6] for v in V], "rp": [v[7] for v in V]}


def decode_vec(d):
    ids, acc = [], 0
    for x in d["id"]:
        acc += x
        ids.append(acc)
    out = {"id": ids, "u": [d["units"][i] for i in d["u"]], "t": [d["tarifs"][i] for i in d["t"]]}
    for k in ("d", "kp", "kt", "jn", "rp"):
        out[k] = d[k]
    out["pos"] = {i: k for k, i in enumerate(ids)}
    return out


# ---------------------------------------------------------------- analisis lintas bulan
# Anomali hanya dihitung bila berulang minimal CONSEC bulan berturut-turut (termasuk bulan terbaru).
CONSEC = 3
BASE_N, BASE_MIN = 3, 2  # pembanding naik/turun: rata-rata sampai BASE_N bulan sebelum jendela, minimal BASE_MIN bulan
MIN_AVG, DROP, RISE, RISE_ABS = 50, 0.5, 1.5, 100
ANOM = [
    ("nol_berulang", "kWh nol berturut-turut", f"Pemakaian nyata 0 kWh selama minimal {CONSEC} bulan berturut-turut sampai bulan ini"),
    ("turun", "Pemakaian turun drastis berulang", f"Pemakaian < 50% rata-rata pembanding selama {CONSEC} bulan berturut-turut (pembanding = rata-rata sampai {BASE_N} bulan sebelum jendela itu, minimal {BASE_MIN} bulan dan ≥ 50 kWh; pemakaian > 0)"),
    ("naik", "Pemakaian naik drastis berulang", f"Pemakaian > 150% rata-rata pembanding selama {CONSEC} bulan berturut-turut (pembanding sama; selisih ≥ 100 kWh per bulan)"),
    ("jn_berulang", "Jam nyala > 400 berulang", f"Jam nyala > 400 selama minimal {CONSEC} bulan berturut-turut sampai bulan ini"),
]
NEED_IDX = {"nol_berulang": CONSEC - 1, "jn_berulang": CONSEC - 1, "turun": CONSEC + BASE_MIN - 1, "naik": CONSEC + BASE_MIN - 1}
EMPTY_SUM = lambda: {"n": 0, "kwh": 0}  # noqa: E731


def _ulpn(code):
    return ULP.get(code, f"ULP {code}")


def _pair(prev, cur):
    """Perbandingan dua bulan berurutan -> (ringkasan total + per ULP, indeks untuk daftar)."""
    def blank():
        return {"baru": EMPTY_SUM(), "hilang": EMPTY_SUM(), "naik": {"n": 0, "kwh": 0}, "turun": {"n": 0, "kwh": 0},
                "sama": 0, "ganti_tarif": 0, "ganti_daya": 0}
    tot, per = blank(), {}
    rows = {"baru": [], "hilang": [], "ganti_tarif": [], "ganti_daya": []}
    pp, cp = prev["pos"], cur["pos"]
    for k, i in enumerate(cur["id"]):
        u = _ulpn(cur["u"][k])
        b = per.setdefault(u, blank())
        j = pp.get(i)
        if j is None:
            for x in (tot, b):
                x["baru"]["n"] += 1
                x["baru"]["kwh"] += cur["kt"][k]
            rows["baru"].append(k)
            continue
        dlt = cur["kt"][k] - prev["kt"][j]
        key = "naik" if dlt > 0 else "turun" if dlt < 0 else None
        for x in (tot, b):
            if key:
                x[key]["n"] += 1
                x[key]["kwh"] += dlt
            else:
                x["sama"] += 1
            if cur["t"][k] != prev["t"][j]:
                x["ganti_tarif"] += 1
            if cur["d"][k] != prev["d"][j]:
                x["ganti_daya"] += 1
        if cur["t"][k] != prev["t"][j]:
            rows["ganti_tarif"].append((k, j))
        if cur["d"][k] != prev["d"][j]:
            rows["ganti_daya"].append((k, j))
    for j, i in enumerate(prev["id"]):
        if i not in cp:
            u = _ulpn(prev["u"][j])
            b = per.setdefault(u, blank())
            for x in (tot, b):
                x["hilang"]["n"] += 1
                x["hilang"]["kwh"] += prev["kt"][j]
            rows["hilang"].append(j)
    return {"total": tot, "ulp": per}, rows


def _scan(order, vecs, idx, want_rows):
    """Penanda anomali bulan order[idx]; hanya bila berulang CONSEC bulan berturut-turut pada riwayat pelanggan itu sendiri."""
    cur = vecs[order[idx]]
    prevs = [vecs[o] for o in order[:idx]][::-1]  # terdekat dulu
    cnt = {k: 0 for k, _, _ in ANOM}
    rows = {k: [] for k, _, _ in ANOM}
    for k, i in enumerate(cur["id"]):
        series = [(cur["kp"][k], cur["jn"][k])]  # series[0] = bulan ini, [1] = bulan lalu, ...
        for pv in prevs:
            j = pv["pos"].get(i)
            series.append(None if j is None else (pv["kp"][j], pv["jn"][j]))
        streak = 0
        for sv in series:
            if sv is not None and sv[0] == 0:
                streak += 1
            else:
                break
        jn_run = 0
        for sv in series:
            if sv is not None and sv[1] > 400:
                jn_run += 1
            else:
                break
        win = series[:CONSEC]
        full = len(win) == CONSEC and all(v is not None for v in win)
        base = [v[0] for v in series[CONSEC:CONSEC + BASE_N] if v is not None]
        avg = sum(base) / len(base) if len(base) >= BASE_MIN else None
        ok_avg = full and avg is not None and avg >= MIN_AVG
        hit = {
            "nol_berulang": streak >= CONSEC,
            "turun": ok_avg and all(0 < v[0] < DROP * avg for v in win),
            "naik": ok_avg and all(v[0] > RISE * avg and v[0] - avg >= RISE_ABS for v in win),
            "jn_berulang": jn_run >= CONSEC,
        }
        for c, on in hit.items():
            if on:
                cnt[c] += 1
                if want_rows:
                    pct = round((sum(v[0] for v in win) / CONSEC - avg) / avg * 100) if (avg and c in ("turun", "naik")) else None
                    rows[c].append((k, [None if sv is None else sv[0] for sv in series[:6]], avg if c in ("turun", "naik") else None, pct, streak))
    return cnt, rows


def analyze(order, vecs, names):
    """order: periode menaik; vecs: {ym: vektor ter-decode}; names: {ym: {"nm": [...], "al": [...]}} (bulan terakhir & sebelumnya).
    -> (ringkasan, daftar{kategori: {"cols", "rows"}})"""
    summary = {"v": ANALYTICS_VERSION, "latest": order[-1], "pairs": {}, "anom": {},
               "rules": [{"k": k, "label": lb, "rule": rule} for k, lb, rule in ANOM]}
    lists = {}
    for a, b in zip(order, order[1:]):
        res, rows = _pair(vecs[a], vecs[b])
        summary["pairs"][b] = res
        if b == order[-1]:
            lists.update(_pair_lists(vecs[a], vecs[b], names.get(a), names.get(b), rows))
    for idx, ym in enumerate(order):
        cnt, rows = _scan(order, vecs, idx, want_rows=(idx == len(order) - 1))
        summary["anom"][ym] = {k: (cnt[k] if idx >= NEED_IDX[k] else None) for k, _, _ in ANOM}
        if idx == len(order) - 1:
            lists.update(_anom_lists(order, vecs, names.get(ym), rows))
    summary["lists"] = {k: len(v["rows"]) for k, v in lists.items()}
    return summary, lists


def _nm(names, k):
    return (names["nm"][k], names["al"][k]) if names else ("", "")


def _pair_lists(prev, cur, pn, cn, rows):
    out = {}
    base = ["idpel", "nama", "alamat", "ulp", "tarif", "daya", "kwh_tagih"]

    def rec(v, nm, k):
        n, al = _nm(nm, k)
        return [str(v["id"][k]), n, al, _ulpn(v["u"][k]), v["t"][k], v["d"][k], v["kt"][k]]
    out["baru"] = {"cols": base, "rows": sorted((rec(cur, cn, k) for k in rows["baru"]), key=lambda r: -r[6])}
    out["hilang"] = {"cols": base, "rows": sorted((rec(prev, pn, j) for j in rows["hilang"]), key=lambda r: -r[6])}
    gt = []
    for k, j in rows["ganti_tarif"]:
        r = rec(cur, cn, k)
        gt.append(r[:4] + [prev["t"][j], cur["t"][k], r[5], r[6]])
    out["ganti_tarif"] = {"cols": ["idpel", "nama", "alamat", "ulp", "tarif_lama", "tarif_baru", "daya", "kwh_tagih"], "rows": sorted(gt, key=lambda r: -r[7])}
    gd = []
    for k, j in rows["ganti_daya"]:
        r = rec(cur, cn, k)
        gd.append(r[:5] + [prev["d"][j], cur["d"][k], r[6]])
    out["ganti_daya"] = {"cols": ["idpel", "nama", "alamat", "ulp", "tarif", "daya_lama", "daya_baru", "kwh_tagih"], "rows": sorted(gd, key=lambda r: -abs(r[6] - r[5]))}
    return out


def _anom_lists(order, vecs, cn, rows):
    cur = vecs[order[-1]]
    hist_ym = order[-6:]  # sampai 6 bulan terakhir (menaik), bulan terakhir = bulan ini
    cols = ["idpel", "nama", "alamat", "ulp", "tarif", "daya"] + hist_ym + ["rata_sebelum", "selisih_pct", "streak_nol", "jamnyala"]
    out = {}
    for c, lst in rows.items():
        rs = []
        for k, series6, avg, pct, streak in lst:
            h = [series6[m] if m < len(series6) else None for m in range(len(hist_ym) - 1, -1, -1)]  # lama -> baru
            n, al = _nm(cn, k)
            rs.append([str(cur["id"][k]), n, al, _ulpn(cur["u"][k]), cur["t"][k], cur["d"][k]] + h +
                      [None if avg is None else round(avg), pct, streak or None, cur["jn"][k]])
        key = {"nol_berulang": lambda r: (-(r[-2] or 0), -r[5]), "turun": lambda r: (r[-3] is None, r[-3] or 0),
               "naik": lambda r: (-(r[-3] or 0)), "jn_berulang": lambda r: -r[-1]}[c]
        rs.sort(key=key)
        out[c] = {"cols": cols, "rows": rs}
    return out
