"""Monitoring Ganti Meter (H+1) dari Excel harian -> database harian.

Sumber: folder Drive "Pemeliharaan Meter/Ganti Meter H+1/" (nama file bebas, boleh dalam subfolder). Satu file = data satu hari (H+1),
satu baris = satu pergantian meter. Tanggal ganti meter dibaca dari isi file (kolom tglremaja), bukan dari nama file;
baris yang sama (noagenda) di beberapa file hanya dihitung sekali (yang tglrekap-nya lebih baru dipakai).

Kategori TUA (kriteria dari pengguna): usia meter lama >= 10 tahun untuk prabayar, >= 15 tahun untuk pascabayar.
  usia = tahun ganti meter - tahun buat meter lama
  * prabayar  = kolom kdpembmeter diawali "P"; selain itu pascabayar
  * bila tahun buat kosong, dipakai tahun tera meter lama (tera >= buat, jadi usia yang dihitung adalah batas bawah) dan ditandai sumber "tera"
  * bila tahun buat DAN tahun tera kosong -> dianggap TUA (sumber "kosong", usia kosong)
Keluaran: ringkasan di tul_data id='gm'; daftar per bulan di tul_data id='gml:<yyyymm>'.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

from build_billing import BULAN, ULP, ym_label

LIMIT = {"Prabayar": 10, "Pascabayar": 15}   # tua bila usia >= batas
KEEP_DETAIL = 12                              # daftar pelanggan disimpan untuk N bulan terakhir
COLS = ["tgl", "idpel", "nama", "alamat", "ulp", "kec", "kel", "tarif", "daya", "jenis", "alasan", "merek_lama", "type_lama", "no_lama",
        "thbuat_lama", "thtera_lama", "usia", "sumber", "tua", "merek_baru", "type_baru", "no_baru", "thbuat_baru", "petugas"]
NEED = ["noagenda", "unitup", "idpel", "nama", "alamat", "nama_kec", "nama_kel", "tarif", "daya", "kdpembmeter", "id_ganti_meter", "alasan_ganti_meter",
        "merk_meter_lama", "type_meter_lama", "no_meter_lama", "thbuat_meter_lama", "thtera_meter_lama", "merk_meter_baru", "type_meter_baru",
        "no_meter_baru", "thbuat_meter_baru", "petugasremaja", "tglnyala", "tglremaja", "tglaktivasi", "tglrekap"]


DATE_COLS = ("tglnyala", "tglremaja", "tglaktivasi")
STORE_COLS = [c for c in NEED if c not in DATE_COLS]   # kolom yang disimpan untuk sinkron inkremental (tanggal sudah diwakili 'tgl')


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _date(v) -> str | None:
    """Tanggal dari datetime, angka serial Excel, 'yyyy-mm-dd ...', atau 'dd/mm/yyyy' (hari lebih dulu) -> 'yyyy-mm-dd'; selain itu None."""
    if v is None or v == "":
        return None
    if hasattr(v, "year"):
        return f"{v.year:04d}-{v.month:02d}-{v.day:02d}"
    if isinstance(v, (int, float)) and not isinstance(v, bool) and 30000 < v < 80000:
        d = date(1899, 12, 30) + timedelta(days=int(v))
        return d.isoformat()
    s = _s(v)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    m = re.match(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})", s)
    if m and 1 <= int(m.group(1)) <= 31 and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def _year(v) -> int | None:
    try:
        y = int(float(_s(v)))
    except ValueError:
        return None
    return y if 1900 <= y <= 2100 else None


def _int(v) -> int:
    try:
        return int(float(_s(v)))
    except ValueError:
        return 0


def read_file(p: Path):
    wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
    try:
        it = wb.worksheets[0].iter_rows(values_only=True)
        head = [_s(h) for h in next(it)]
        ix = {h: i for i, h in enumerate(head)}
        miss = [c for c in ("noagenda", "unitup", "kdpembmeter", "alasan_ganti_meter", "thbuat_meter_lama") if c not in ix]
        if miss:
            raise ValueError("kolom wajib tidak ada: " + ", ".join(miss))
        out = []
        for r in it:
            if not r or r[ix["noagenda"]] in (None, ""):
                continue
            out.append({c: (r[ix[c]] if c in ix and ix[c] < len(r) else None) for c in NEED})
        return out
    finally:
        wb.close()


def classify(r: dict, tgl: str) -> dict:
    jenis = "Prabayar" if _s(r["kdpembmeter"]).upper().startswith("P") else "Pascabayar"
    buat, tera = _year(r["thbuat_meter_lama"]), _year(r["thtera_meter_lama"])
    acuan, sumber = (buat, "buat") if buat else (tera, "tera") if tera else (None, "")
    usia = int(tgl[:4]) - acuan if acuan else None
    if usia is not None and usia < 0:
        usia = None
    tua = True if usia is None else usia >= LIMIT[jenis]   # tahun buat & tera kosong dianggap tua
    merek = _s(r["merk_meter_lama"])
    return {"jenis": jenis, "acuan": acuan if usia is not None else None, "sumber": sumber if usia is not None else "kosong", "usia": usia, "tua": tua,
            "merek_lama": merek or "Tidak tercatat"}


def _top(c: Counter, k: int | None = None):
    return [{"name": a, "n": b} for a, b in sorted(c.items(), key=lambda x: (-x[1], str(x[0])))[:k]]


def pack(recs: dict, months=None) -> dict:
    """recs -> {ym: {'cols','rows'}} (bentuk ringkas untuk disimpan); months = hanya bulan tertentu."""
    out = {}
    for key, (rec, tgl, r, _) in sorted(recs.items(), key=lambda kv: kv[1][1]):
        ym = tgl[:4] + tgl[5:7]
        if months is not None and ym not in months:
            continue
        out.setdefault(ym, {"cols": ["tgl"] + STORE_COLS, "rows": []})["rows"].append([tgl] + [_s(r.get(c)) for c in STORE_COLS])
    for ym in (months or ()):
        out.setdefault(ym, {"cols": ["tgl"] + STORE_COLS, "rows": []})
    return out


def unpack(docs) -> dict:
    """kebalikan pack: daftar dokumen simpanan -> recs (klasifikasi dihitung ulang, jadi perubahan aturan ikut berlaku)."""
    recs = {}
    for d in docs:
        cols = d["cols"]
        for row in d["rows"]:
            r = dict(zip(cols, row))
            tgl = r.pop("tgl")
            recs[_s(r["noagenda"])] = (_s(r["tglrekap"]), tgl, r, classify(r, tgl))
    return recs


def build(src: Path):
    """-> (ringkasan, detail{ym: {'cols','rows'}}, peringatan)"""
    summary, detail, warns, _, _ = build_all(src)
    return summary, detail, warns


def build_all(src: Path, prior: dict | None = None):
    """prior = recs dari simpanan (sinkron inkremental: hanya file baru/berubah yang ada di src).
    -> (ringkasan, detail, peringatan, recs, bulan_tersentuh)"""
    warns, sources = [], []
    recs = dict(prior) if prior else {}   # recs: noagenda -> (tglrekap, tgl, baris, klasifikasi)
    touched = set()
    files = sorted(p for p in src.rglob("*.xlsx") if not p.name.startswith("~$")) if src.exists() else []
    nfiles = 0
    for p in files:
        try:
            rows = read_file(p)
        except Exception as e:  # satu file rusak tidak menggagalkan yang lain
            warns.append(f"{p.name}: dilewati ({e})")
            continue
        nfiles += 1
        used, dates, skipped, sample = Counter(), [], 0, ""
        for r in rows:
            tgl = None
            for col_ in ("tglremaja", "tglnyala", "tglaktivasi", "tglrekap"):
                tgl = _date(r[col_])
                if tgl:
                    used[col_] += 1
                    break
            if not tgl:
                skipped += 1
                continue
            if used and not _date(r["tglremaja"]) and not sample and _s(r["tglremaja"]):
                sample = _s(r["tglremaja"])[:30]
            dates.append(tgl)
            key = _s(r["noagenda"])
            rec = _s(r["tglrekap"])
            if key not in recs or rec >= recs[key][0]:
                if key in recs:
                    touched.add(recs[key][1][:4] + recs[key][1][5:7])
                touched.add(tgl[:4] + tgl[5:7])
                recs[key] = (rec, tgl, {c: _s(r[c]) for c in STORE_COLS}, classify(r, tgl))
        sources.append({"file": p.name, "rows": len(rows), "from": min(dates) if dates else None, "to": max(dates) if dates else None,
                        "used": dict(used), "skipped": skipped})
        if used.get("tglremaja", 0) < len(rows) - skipped:
            n_fb = len(rows) - skipped - used.get("tglremaja", 0)
            warns.append(f"{p.name}: {n_fb} baris tanggal gantinya (tglremaja) tidak terbaca" + (f" (contoh isi: '{sample}')" if sample else "") + "; dipakai tanggal lain (tglnyala/aktivasi/rekap)")
        if skipped:
            warns.append(f"{p.name}: {skipped} baris tanpa tanggal sama sekali, dilewati")
    items = sorted(recs.values(), key=lambda x: (x[1], _s(x[2]["noagenda"])))

    by_day = defaultdict(list)
    by_month = defaultdict(list)
    for _, tgl, r, c in items:
        by_day[tgl].append((r, c))
        by_month[tgl[:4] + tgl[5:7]].append((tgl, r, c))

    days = []
    for d in sorted(by_day):
        L = by_day[d]
        days.append({"d": d, "n": len(L), "tua": sum(1 for _, c in L if c["tua"]), "pra": sum(1 for _, c in L if c["jenis"] == "Prabayar"),
                     "pasca": sum(1 for _, c in L if c["jenis"] == "Pascabayar"), "ulp": dict(Counter(_s(r["unitup"]) for r, _ in L))})

    months, detail = {}, {}
    for ym in sorted(by_month):
        L = by_month[ym]
        n = len(L)
        ulp = defaultdict(Counter)
        alasan, merek, merek_baru, tahun = {}, defaultdict(Counter), Counter(), {}
        mt = defaultdict(Counter)
        usia_b = Counter()
        prog = Counter()
        ulp_alasan = defaultdict(Counter)
        for tgl, r, c in L:
            code, name = _s(r["unitup"]), (_s(r["alasan_ganti_meter"]) or "Tidak dicatat")
            u = ulp[code]
            u["n"] += 1
            u["pra" if c["jenis"] == "Prabayar" else "pasca"] += 1
            u["tua"] += bool(c["tua"])
            u["unk"] += c["usia"] is None
            a = alasan.setdefault(name, Counter(id=_s(r["id_ganti_meter"])))
            a["n"] += 1
            a["tua"] += bool(c["tua"])
            ulp_alasan[code][name] += 1
            mm = merek[c["merek_lama"]]
            mm["n"] += 1
            mm["tua"] += bool(c["tua"])
            merek_baru[_s(r["merk_meter_baru"]) or "Tidak diketahui"] += 1
            y = c["acuan"]
            t = tahun.setdefault(y, Counter())
            t["n"] += 1
            t["tua"] += bool(c["tua"])
            t["tera"] += c["sumber"] == "tera"
            mt[c["merek_lama"]][y] += 1
            u_ = c["usia"]
            usia_b[("Tidak diketahui" if u_ is None else "0 – 5 tahun" if u_ <= 5 else "6 – 10 tahun" if u_ <= 10 else "11 – 15 tahun" if u_ <= 15 else "> 15 tahun", c["jenis"])] += 1
            if name.lower().startswith("program meter tua"):
                prog["n"] += 1
                prog["tua"] += bool(c["tua"])
                prog["bukan"] += c["tua"] is False
                prog["unk"] += c["usia"] is None
        tot = Counter()
        for _, r, c in L:
            tot["pra" if c["jenis"] == "Prabayar" else "pasca"] += 1
            tot["tua"] += bool(c["tua"])
            tot["tua_pra"] += bool(c["tua"]) and c["jenis"] == "Prabayar"
            tot["tua_pasca"] += bool(c["tua"]) and c["jenis"] == "Pascabayar"
            tot["unk"] += c["usia"] is None
            tot["tera"] += c["sumber"] == "tera"
        mday = [x for x in days if x["d"][:4] + x["d"][5:7] == ym]
        ulp_codes = sorted(set(ULP) | set(ulp))
        top_alasan = [k for k, _ in sorted(((k, v["n"]) for k, v in alasan.items()), key=lambda x: (-x[1], x[0]))]
        top_merek = [k for k, _ in sorted(((k, v["n"]) for k, v in merek.items()), key=lambda x: (-x[1], x[0]))]
        years = sorted((y for y in tahun if y), reverse=True)
        months[ym] = {
            "ym": ym, "label": ym_label(ym), "n": n, "hari": len(mday), "first": mday[0]["d"], "last": mday[-1]["d"], "pra": tot["pra"], "pasca": tot["pasca"],
            "tua": tot["tua"], "tua_pra": tot["tua_pra"], "tua_pasca": tot["tua_pasca"], "unk": tot["unk"], "tera": tot["tera"],
            "ulp": [{"code": c, "name": ULP.get(c, c or "Tanpa unit"), "n": ulp[c]["n"], "pra": ulp[c]["pra"], "pasca": ulp[c]["pasca"], "tua": ulp[c]["tua"], "unk": ulp[c]["unk"]} for c in ulp_codes],
            "alasan": [{"id": alasan[k]["id"], "name": k, "n": alasan[k]["n"], "tua": alasan[k]["tua"]} for k in top_alasan],
            "ulp_alasan": {c: dict(ulp_alasan[c]) for c in ulp_codes if c in ulp_alasan},
            "merek_lama": [{"name": k, "n": merek[k]["n"], "tua": merek[k]["tua"]} for k in top_merek],
            "merek_baru": _top(merek_baru),
            "tahun_lama": [{"y": y, "n": tahun[y]["n"], "tua": tahun[y]["tua"], "tera": tahun[y]["tera"]} for y in sorted((y for y in tahun if y))] +
                          ([{"y": None, "n": tahun[None]["n"], "tua": 0, "tera": 0}] if None in tahun else []),
            "merek_tahun": {"years": years, "rows": [{"name": k, "by": {str(y): mt[k][y] for y in years if mt[k].get(y)}, "unk": mt[k].get(None, 0)} for k in top_merek]},
            "usia": [{"name": b, "jenis": j, "n": c} for (b, j), c in sorted(usia_b.items())],
            "program_tua": {"n": prog["n"], "tua": prog["tua"], "bukan": prog["bukan"], "unk": prog["unk"]},
        }
        rows = []
        for tgl, r, c in sorted(L, key=lambda x: (x[0], _s(x[1]["noagenda"])), reverse=True):
            rows.append([tgl, _s(r["idpel"]), _s(r["nama"]), _s(r["alamat"]), ULP.get(_s(r["unitup"]), _s(r["unitup"]) or "Tanpa unit"), _s(r["nama_kec"]), _s(r["nama_kel"]), _s(r["tarif"]),
                         _int(r["daya"]), c["jenis"], _s(r["alasan_ganti_meter"]), c["merek_lama"], _s(r["type_meter_lama"]), _s(r["no_meter_lama"]),
                         _year(r["thbuat_meter_lama"]), _year(r["thtera_meter_lama"]), c["usia"], c["sumber"], None if c["tua"] is None else int(c["tua"]),
                         _s(r["merk_meter_baru"]), _s(r["type_meter_baru"]), _s(r["no_meter_baru"]), _year(r["thbuat_meter_baru"]), _s(r["petugasremaja"])])
        detail[ym] = {"cols": COLS, "rows": rows}
    order = sorted(months)
    summary = {"order": order, "months": months, "days": days, "rule": LIMIT, "files": nfiles, "sources": sources, "warnings": warns, "latest": days[-1]["d"] if days else None,
               "total": len(items)}
    return summary, detail, warns, recs, touched


def main(src: Path, out: Path | None = None):  # uji lokal
    import json
    s, d, w = build(src)
    print({k: s[k] for k in ("order", "latest", "total", "files")}, w)
    print({ym: len(v["rows"]) for ym, v in d.items()})
    if out:
        out.write_text(json.dumps(s, ensure_ascii=False), encoding="utf8")
    return s, d


if __name__ == "__main__":
    import sys
    main(Path(sys.argv[1]))
