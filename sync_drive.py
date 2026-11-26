"""Sinkronisasi otomatis: Google Drive (Excel)  ->  Supabase.

Dijalankan terjadwal oleh GitHub Actions (.github/workflows/sync.yml).
Folder Drive (DRIVE_ROOT_ID) harus meniru struktur proyek:
    <root>/Transaksi Energi/309/{UP,UPI,KABUPATEN}/<tahun>/*.xlsx
    <root>/Pengendalian Susut/Laporan Susut/*.xlsx

Per kumpulan data (Transaksi Energi, Laporan Susut) skrip membandingkan checksum file
di Drive dengan yang tercatat di tabel sync_state; hanya yang berubah yang diproses ulang.

Drive dibaca lewat jembatan Google Apps Script (apps_script/Code.gs) — tanpa Google Cloud.

Variabel lingkungan:
    GDRIVE_BRIDGE_URL             alamat web app Apps Script (…/exec)
    GDRIVE_BRIDGE_TOKEN           token yang sama dengan di Code.gs
    SUPABASE_URL                  mis. https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY          kunci service_role / secret (RAHASIA)

Uji lokal tanpa Drive/Supabase:
    python sync_drive.py --local-root . --dry-run
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import build_data
import build_susut

CHUNK = 6 * 1024 * 1024  # byte per potongan unduhan
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
FOLDER = "application/vnd.google-apps.folder"
BILLING_DIR = "transaksi energi/mon billing/"  # menu Mon Billing; bukan bagian dari 309
DLPD_DIR = "transaksi energi/dlpd prabayar/"  # menu DLPD Prabayar; bukan bagian dari 309
DPM_DIR = "transaksi energi/mon dpm/"  # menu LBKB; bukan bagian dari 309
DIL_DIR = "transaksi energi/dil/"  # koordinat pelanggan (untuk peta TO); bukan bagian dari 309
PJU_DIR = "pengendalian susut/pju/"  # menu PJU Non Meter; bukan bagian dari Laporan Susut
TS_DIR = "pengendalian susut/p2tl/laporan tagihan susulan/"  # menu P2TL > Realisasi Tagihan Susulan
AMR_DIR = "pemeliharaan meter/amr/"  # menu Pemeliharaan Meter > Automatic Meter Reading
GM_DIR = "pemeliharaan meter/ganti meter h+1/"  # menu Pemeliharaan Meter > Ganti Meter H+1
TOP = {
    "tul": ("Transaksi Energi", "309"),
    "billing": ("Transaksi Energi", "Mon Billing"),
    "dlpd": ("Transaksi Energi", "DLPD PRABAYAR"),
    "gm": ("Pemeliharaan Meter", "Ganti Meter H+1"),
    "koordinat": ("Transaksi Energi", "DIL"),
    "lbkb": ("Transaksi Energi", "Mon DPM"),
    "susut": ("Pengendalian Susut", "Laporan Susut"),
    "pju": ("Pengendalian Susut", "PJU"),
    "amr": ("Pemeliharaan Meter", "AMR"),
    "ts": ("Pengendalian Susut", "P2TL/Laporan Tagihan Susulan"),
    "lbt": ("Transaksi Energi", "Mon DPM"),             # file target LBKB (nama file memuat "target") di folder Mon DPM
    "gmt": ("Pemeliharaan Meter", "Ganti Meter H+1"),   # file target Ganti Meter (nama file memuat "target") di folder yang sama
}


# ---------------------------------------------------------------- Drive (via Apps Script)
class Drive:
    def __init__(self, url: str, token: str):
        import requests
        self.url, self.token, self.r = url, token, requests

    def _get(self, **params):
        for attempt in range(3):
            try:
                r = self.r.get(self.url, params={"token": self.token, **params}, timeout=300)
                r.raise_for_status()
                j = r.json()
                break
            except (self.r.RequestException, ValueError) as e:
                if attempt == 2:
                    raise RuntimeError(f"jembatan Drive tidak bisa dihubungi: {e}")
        if isinstance(j, dict) and j.get("error"):
            raise RuntimeError(f"jembatan Drive: {j['error']}")
        return j

    def list_files(self):
        """-> {path_str: (penanda, id)} untuk semua .xlsx di folder induk."""
        out = {}
        for f in self._get(action="list")["files"]:
            out["/".join(f["path"])] = (f["mark"], f["id"])
        return out

    def download(self, file_id, dest: Path):
        import base64
        dest.parent.mkdir(parents=True, exist_ok=True)
        # file besar diambil per potongan (Apps Script membatasi ukuran satu balasan);
        # skrip jembatan lama mengabaikan offset dan mengirim seluruh file sekaligus -> tetap didukung
        buf, off = bytearray(), 0
        while True:
            j = self._get(action="get", id=file_id, offset=off, len=CHUNK)
            buf += base64.b64decode(j["b64"])
            if "total" not in j or len(buf) >= j["total"] or not j["b64"]:
                break
            off = len(buf)
        dest.write_bytes(bytes(buf))


# ---------------------------------------------------------------- Supabase (REST)
class Supa:
    def __init__(self, url, key, dry=False):
        import requests
        self.base = url.rstrip("/").removesuffix("/rest/v1") + "/rest/v1"
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self.dry, self.r = dry, requests

    def _do(self, method, path, **kw):
        if self.dry:
            print(f"  [dry-run] {method} {path}")
            return None
        r = self.r.request(method, self.base + path, headers={**self.h, **kw.pop("headers", {})}, timeout=120, **kw)
        if not r.ok:
            raise RuntimeError(f"Supabase {method} {path}: {r.status_code} {r.text[:300]}")
        return r

    def upsert(self, table, rows, conflict):
        return self._do("POST", f"/{table}?on_conflict={conflict}", data=json.dumps(rows, ensure_ascii=False).encode("utf8"),
                        headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def select(self, table, query=""):
        if self.dry:
            return []
        return self._do("GET", f"/{table}?{query}").json()

    def delete(self, table, query):
        return self._do("DELETE", f"/{table}?{query}", headers={"Prefer": "return=minimal"})


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- kumpulan data
def manifest_of(files):
    """files: dict path_str -> md5/ukuran  -> manifest yang stabil"""
    return dict(sorted(files.items()))


def publish_tul(sb: Supa, src: Path, work: Path):
    out = work / "data.json"
    build_data.main(src, out)
    data = json.loads(out.read_text(encoding="utf8"))
    sb.upsert("tul_data", [{"id": "main", "data": data, "generated_at": data["generated_at"]}], "id")
    return list(build_data.LAST_WARNINGS)


BILLING_MAX_NEW = 3   # maksimal file Excel baru dibaca per sinkron (tiap file ~2,5 menit); sisanya di sinkron berikutnya
_PARTIAL = {"billing": False}


def publish_billing(sb: Supa, src: Path, work: Path):
    import build_billing as bb
    prev = {}
    for row in sb.select("tul_data", "select=data&id=eq.billing"):
        prev = row.get("data") or {}
    cached = prev.get("periods") or {}
    chosen, warns = bb.pick_files(src)
    periods, new = {}, []
    for ym, p in chosen.items():
        old = cached.get(ym)
        if old and old.get("src_md5") == bb.md5(p) and old.get("detail_v") == bb.DETAIL_VERSION:
            periods[ym] = old
        else:
            new.append((ym, p))
            if old:
                periods[ym] = old  # tampilkan hasil lama sampai file ini dibaca ulang
    parsed = {}  # ym -> (vektor, nama) hanya yang baru dibaca

    def doc(id_, data, stamp):
        sb.upsert("tul_data", [{"id": id_, "data": data, "generated_at": stamp}], "id")

    def save(analytics):
        stamp = now()
        order = sorted(periods)
        doc("billing", {"generated_at": stamp, "order": order, "periods": periods, "warnings": warns, "analytics": analytics}, stamp)

    analytics = prev.get("analytics")
    for ym, p in new[:BILLING_MAX_NEW]:
        print(f"  {p.name}: membaca…", flush=True)
        try:
            summary, detail, vec, names = bb.build_period(p)
        except Exception as e:
            warns.append(f"{p.name}: gagal ({e})")
            continue
        stamp = now()
        for k, rows in detail.items():
            doc(f"bd:{ym}:{k}", {"cols": bb.DETAIL_COLS, "rows": rows}, stamp)
        doc(f"bc:{ym}", vec, stamp)
        doc(f"bn:{ym}", names, stamp)
        periods[ym] = summary
        parsed[ym] = (vec, names)
        save(analytics)
    rest = new[BILLING_MAX_NEW:]
    if rest:
        _PARTIAL["billing"] = True
        warns.append(f"{len(rest)} file belum dibaca ({', '.join(x[1].name for x in rest)}); dilanjutkan di sinkron berikutnya")
        print("  " + warns[-1])

    # ---- analisis lintas bulan (butuh vektor tiap periode)
    order = [ym for ym in sorted(periods) if ym in parsed or periods[ym].get("detail_v") == bb.DETAIL_VERSION]
    if len(order) >= 2:
        want = (not analytics or analytics.get("v") != bb.ANALYTICS_VERSION or parsed
                or sorted(analytics.get("anom", {})) != order)
        if want:
            print(f"  analisis lintas bulan: {len(order)} periode", flush=True)
            vecs, names = {}, {}
            for ym in order:
                vec = parsed[ym][0] if ym in parsed else (sb.select("tul_data", f"select=data&id=eq.bc:{ym}") or [{}])[0].get("data")
                if not vec:
                    raise RuntimeError(f"vektor pelanggan {ym} tidak ditemukan")
                vecs[ym] = bb.decode_vec(vec)
            for ym in order[-2:]:
                nm = parsed[ym][1] if ym in parsed else (sb.select("tul_data", f"select=data&id=eq.bn:{ym}") or [{}])[0].get("data")
                names[ym] = nm
            analytics, lists = bb.analyze(order, vecs, names)
            stamp = now()
            for c, d in lists.items():
                doc(f"bx:{order[-1]}:{c}", d, stamp)
    else:
        analytics = None
    save(analytics)

    # ---- bersihkan dokumen yatim
    keep_bd = {f"bd:{ym}:{k}" for ym in periods for k, _ in bb.FLAGS}
    keep_bc = {f"bc:{ym}" for ym in periods}
    keep_bn = {f"bn:{ym}" for ym in order[-2:]}
    keep_bx = {f"bx:{order[-1]}:{c}" for c, _, _ in bb.ANOM} | {f"bx:{order[-1]}:{c}" for c in ("baru", "hilang", "ganti_tarif", "ganti_daya")} if order else set()
    keep = keep_bd | keep_bc | keep_bn | keep_bx
    for pre in ("bd", "bc", "bn", "bx"):
        for row in sb.select("tul_data", f"select=id&id=like.{pre}:*"):
            if row["id"] not in keep:
                sb.delete("tul_data", f"id=eq.{row['id']}")
    return warns


def publish_dlpd(sb: Supa, src: Path, work: Path):
    import build_dlpd as bd
    summary, detail, warns = bd.build(src)
    if not summary["order"]:
        raise RuntimeError("tidak ada data DLPD Prabayar yang terbaca")
    stamp = now()
    keep_periods = set(summary["order"][-bd.KEEP_DETAIL:])
    for key, d in detail.items():
        if key.split(":")[0] in keep_periods:
            sb.upsert("tul_data", [{"id": f"dl:{key}", "data": d, "generated_at": stamp}], "id")
    summary["generated_at"] = stamp
    sb.upsert("tul_data", [{"id": "dlpd", "data": summary, "generated_at": stamp}], "id")
    keep = {f"dl:{k}" for k in detail if k.split(":")[0] in keep_periods}
    for row in sb.select("tul_data", "select=id&id=like.dl:*"):
        if row["id"] not in keep:
            sb.delete("tul_data", f"id=eq.{row['id']}")
    return warns


def publish_koordinat(sb: Supa, src: Path, work: Path):
    """Gabungkan koordinat DIL dengan pelanggan pascabayar ber-penanda DLPD (Mon Billing) -> tul_data id='to:pasca'."""
    import build_billing as bb
    import build_to as bt
    coords, info, warns = bt.load_coords(src)
    print("    koordinat:", {i["file"]: i["ok"] for i in info}, f"total {len(coords)}")
    if not coords:
        raise RuntimeError("tidak ada koordinat yang terbaca")
    b = sb.select("tul_data", "select=data&id=eq.billing")
    order = ((b[0].get("data") or {}).get("order") or []) if b else []
    if not order:
        if sb.dry:
            return warns
        raise RuntimeError("data Mon Billing belum ada; peta TO pascabayar menunggu sinkron Mon Billing")
    ym = order[-1]
    lists = {}
    for k, _ in bb.FLAGS:
        r = sb.select("tul_data", f"select=data&id=eq.bd:{ym}:{k}")
        if r:
            lists[k] = r[0]["data"]
    hist = names = None
    try:  # riwayat jam nyala (aturan TO 2 & 3): vektor sampai 6 bulan terakhir + nama bulan terakhir
        ho = order[-6:]
        vecs = {}
        for m in ho:
            v = sb.select("tul_data", f"select=data&id=eq.bc:{m}")
            if v:
                vecs[m] = bb.decode_vec(v[0]["data"])
        ho = [m for m in ho if m in vecs]
        if len(ho) >= 2 and ho[-1] == ym:
            nr = sb.select("tul_data", f"select=data&id=eq.bn:{ym}")
            if nr:
                hist, names = (ho, vecs), nr[0]["data"]
    except Exception as e:  # riwayat gagal dimuat: peta tetap jalan dengan penanda DLPD saja
        warns.append(f"riwayat jam nyala TO dilewati ({e})")
    doc = bt.build_pasca(ym, lists, coords, hist, names)
    doc["files"] = info
    doc["generated_at"] = now()
    print(f"    pascabayar {ym}: {doc['flagged']} ber-penanda, {len(doc['rows'])} di peta, {doc['nocoord']} tanpa koordinat")
    sb.upsert("tul_data", [{"id": "to:pasca", "data": doc, "generated_at": doc["generated_at"]}], "id")
    return warns


_GM = {"full": True, "total": 0, "failed": set()}   # full=True: baca semua file; False: inkremental (hanya file baru/berubah, sisanya dari simpanan)


def publish_gm(sb: Supa, src: Path, work: Path):
    import build_gm as bg
    full = _GM["full"]
    prior = None
    if not full:
        stored = [r["value"] for r in sb.select("sync_state", "select=key,value&key=like.gmrec:*")]
        prior = bg.unpack(stored)
        print(f"    inkremental: {len(prior)} baris dari simpanan + file baru/berubah")
    summary, detail, warns, recs, touched = bg.build_all(src, prior)
    _GM["failed"] = set(summary.get("failed", []))   # file gagal dibaca: tidak dicatat selesai, dicoba lagi di sinkron berikutnya
    if not summary["order"]:
        raise RuntimeError("tidak ada data Ganti Meter yang terbaca")
    for x in summary.get("sources", []):
        print(f"    {x['file']}: {x['rows']} baris, tanggal {x['from']} s/d {x['to']}, kolom tanggal dipakai {x['used']}, dilewati {x['skipped']}")
    print("    bulan terbaca:", {k: v["n"] for k, v in summary["months"].items()})
    stamp = now()
    if _GM["total"]:
        summary["files"] = _GM["total"]   # jumlah seluruh file di Drive (mode inkremental hanya membaca sebagian)
    # simpanan baris per bulan (tabel sync_state: tertutup untuk pengguna web)
    for ym, doc in bg.pack(recs, None if full else touched).items():
        sb.upsert("sync_state", [{"key": f"gmrec:{ym}", "value": doc, "updated_at": stamp}], "key")
    if full:
        keep_rec = {f"gmrec:{ym}" for ym in summary["order"]}
        for row in sb.select("sync_state", "select=key&key=like.gmrec:*"):
            if row["key"] not in keep_rec:
                sb.delete("sync_state", f"key=eq.{row['key']}")
    keep_m = set(summary["order"][-bg.KEEP_DETAIL:])
    for ym, d in detail.items():
        if ym in keep_m and (full or ym in touched):
            sb.upsert("tul_data", [{"id": f"gml:{ym}", "data": d, "generated_at": stamp}], "id")
    summary["generated_at"] = stamp
    sb.upsert("tul_data", [{"id": "gm", "data": summary, "generated_at": stamp}], "id")
    for row in sb.select("tul_data", "select=id&id=like.gml:*"):
        if row["id"] not in {f"gml:{m}" for m in keep_m}:
            sb.delete("tul_data", f"id=eq.{row['id']}")
    return warns


def publish_pju(sb: Supa, src: Path, work: Path):
    import build_pju as bp
    doc, warns = bp.build(src)
    for x in doc["files"]:
        print(f"    {x['file']}: {x['rows']} titik")
    sb.upsert("tul_data", [{"id": "pju", "data": doc, "generated_at": doc["generated_at"]}], "id")
    return warns


def publish_amr(sb: Supa, src: Path, work: Path):
    import build_amr as ba
    doc, warns = ba.build(src)
    for x in doc["files"]:
        print(f"    {x['file']}: {x['rows']} pelanggan")
    sb.upsert("tul_data", [{"id": "amr", "data": doc, "generated_at": doc["generated_at"]}], "id")
    return warns


def publish_lbkb(sb: Supa, src: Path, work: Path):
    import build_lbkb as bl
    doc, warns = bl.build(src)
    for x in doc["files"]:
        print(f"    {x['file']}: {x['rows']} baris")
    print(f"    bulan {doc['months'][0]}..{doc['months'][-1]}, {len(doc['rows'])} pelanggan berkode pantau")
    sb.upsert("tul_data", [{"id": "lbkb", "data": doc, "generated_at": doc["generated_at"]}], "id")
    return warns


def publish_ts(sb: Supa, src: Path, work: Path):
    import build_ts as bt
    doc, warns = bt.build(src)
    targets = doc.pop("targets", [])
    tfiles = doc.pop("target_files", [])
    for x in doc["files"]:
        print(f"    {x['file']}: {x['rows']} baris")
    if doc["rows"]:
        sb.upsert("tul_data", [{"id": "p2tl_ts", "data": doc, "generated_at": doc["generated_at"]}], "id")
    if targets:
        for x in tfiles:
            print(f"    target {x['file']}: {x['rows']} baris")
        try:  # tabel ts_targets dibuat lewat supabase/schema.sql; bila belum ada, data tagihan tetap terkirim
            stamp = now()
            sb.upsert("ts_targets", [{"ulp": t["ulp"], "bln": t["bln"], "target": t["target"], "updated_at": stamp} for t in targets], "ulp,bln")
            print(f"    {len(targets)} target (ULP x bulan) disimpan")
        except Exception as e:
            warns.append(f"target tidak tersimpan: {e} (sudah menjalankan bagian 6 supabase/schema.sql?)")
    return warns


def publish_gmt(sb: Supa, src: Path, work: Path):
    """Target Ganti Meter (meter per ULP per bulan) -> tabel gm_targets. File target = Excel ber-nama memuat "target" di folder Ganti Meter H+1."""
    import build_ts as bt
    targets, info, warns = bt.read_targets(src)
    for x in info:
        print(f"    target {x['file']}: {x['rows']} baris")
    if targets:
        sb.upsert("gm_targets", [{"ulp": t["ulp"], "bln": t["bln"], "target": t["target"], "updated_at": now()} for t in targets], "ulp,bln")
        print(f"    {len(targets)} target (ULP x bulan) disimpan")
    return warns


def publish_lbt(sb: Supa, src: Path, work: Path):
    """Target LBKB (% per ULP) -> tul_data id='lbkb_target'. File target = Excel ber-nama memuat "target" di folder Mon DPM."""
    import build_lbkb as bl
    targets, info, warns = bl.read_targets(src)
    for x in info:
        print(f"    target {x['file']}: {x['rows']} baris")
    if targets:
        stamp = now()
        sb.upsert("tul_data", [{"id": "lbkb_target", "data": {"targets": targets, "files": info, "generated_at": stamp}, "generated_at": stamp}], "id")
        print(f"    {len(targets)} target LBKB disimpan")
    return warns


def publish_susut(sb: Supa, src: Path, work: Path):
    out = work / "susut.json"
    build_susut.main(src, out)
    data = json.loads(out.read_text(encoding="utf8"))
    keep = []
    for rep in data["reports"]:
        keep.append(rep["file"])
        sheets = rep["sheets"]
        sb.upsert("susut_reports", [{
            "file": rep["file"], "title": rep["title"], "modified": rep["modified"],
            "sheets": [s["name"] for s in sheets], "updated_at": now(),
        }], "file")
        for i, sh in enumerate(sheets):
            sb.upsert("susut_sheets", [{"file": rep["file"], "idx": i, "name": sh["name"], "data": sh}], "file,idx")
        # ringkasan disimpan sebagai "sheet" khusus idx = -1 (tanpa perubahan skema database)
        from urllib.parse import quote as _q
        if rep.get("summary"):
            sb.upsert("susut_sheets", [{"file": rep["file"], "idx": -1, "name": "__ringkasan__", "data": rep["summary"]}], "file,idx")
        else:
            sb.delete("susut_sheets", f"file=eq.{_q(rep['file'])}&idx=eq.-1")
        if rep.get("produksi"):
            sb.upsert("susut_sheets", [{"file": rep["file"], "idx": -2, "name": "__produksi__", "data": rep["produksi"]}], "file,idx")
        else:
            sb.delete("susut_sheets", f"file=eq.{_q(rep['file'])}&idx=eq.-2")
        from urllib.parse import quote
        sb.delete("susut_sheets", f"file=eq.{quote(rep['file'])}&idx=gte.{len(sheets)}")
    for row in sb.select("susut_reports", "select=file"):
        if row["file"] not in keep:
            from urllib.parse import quote
            sb.delete("susut_reports", f"file=eq.{quote(row['file'])}")  # sheets ikut terhapus (cascade)
    return []


def _belongs(name: str, path_str: str) -> bool:
    """Mon Billing dan DLPD Prabayar punya folder sendiri; 309 tidak boleh ikut terhitung."""
    low = path_str.lower()
    if name == "billing":
        return low.startswith(BILLING_DIR)
    if name == "dlpd":
        return low.startswith(DLPD_DIR)
    if name == "gm":
        return low.startswith(GM_DIR) and "target" not in low.rsplit("/", 1)[-1]
    if name == "gmt":
        return low.startswith(GM_DIR) and "target" in low.rsplit("/", 1)[-1]
    if name == "koordinat":
        return low.startswith(DIL_DIR)
    if name == "lbkb":
        return low.startswith(DPM_DIR) and "target" not in low.rsplit("/", 1)[-1]
    if name == "lbt":
        return low.startswith(DPM_DIR) and "target" in low.rsplit("/", 1)[-1]
    if name == "pju":
        return low.startswith(PJU_DIR)
    if name == "amr":
        return low.startswith(AMR_DIR)
    if name == "ts":
        return low.startswith(TS_DIR)
    if name == "susut":
        return not (low.startswith(PJU_DIR) or low.startswith("pengendalian susut/p2tl/"))
    return not (low.startswith(BILLING_DIR) or low.startswith(DLPD_DIR) or low.startswith(DIL_DIR) or low.startswith(DPM_DIR)) if name == "tul" else True


def _ci_dir(parent: Path, name: str) -> Path:
    """Subfolder dengan nama yang sama tanpa peduli huruf besar/kecil (Drive vs Linux)."""
    if parent.exists():
        for d in parent.iterdir():
            if d.is_dir() and d.name.strip().lower() == name.strip().lower():
                return d
    return parent / name


PUBLISH = {"tul": publish_tul, "susut": publish_susut, "billing": publish_billing, "dlpd": publish_dlpd, "gm": publish_gm, "pju": publish_pju, "amr": publish_amr, "ts": publish_ts, "gmt": publish_gmt, "lbt": publish_lbt, "lbkb": publish_lbkb, "koordinat": publish_koordinat}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local-root", type=Path, help="pakai folder lokal sebagai pengganti Drive (uji)")
    ap.add_argument("--dry-run", action="store_true", help="jangan menulis ke Supabase")
    ap.add_argument("--force", action="store_true", help="proses ulang walau tidak ada perubahan")
    ap.add_argument("--only", choices=["tul", "susut", "billing", "dlpd", "gm", "koordinat", "pju", "amr", "ts", "gmt", "lbt", "lbkb"], help="hanya satu kumpulan data")
    a = ap.parse_args()

    sb = Supa(os.environ.get("SUPABASE_URL", "http://dry.invalid"), os.environ.get("SUPABASE_SERVICE_KEY", "dry"), a.dry_run)
    if not a.dry_run:
        for v in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
            if not os.environ.get(v):
                sys.exit(f"Variabel {v} belum diisi")

    work = Path(tempfile.mkdtemp(prefix="dashte_"))
    failures = []
    try:
        drive, all_remote = None, {}
        if not a.local_root:
            for v in ("GDRIVE_BRIDGE_URL", "GDRIVE_BRIDGE_TOKEN"):
                if not os.environ.get(v):
                    sys.exit(f"Variabel {v} belum diisi")
            drive = Drive(os.environ["GDRIVE_BRIDGE_URL"], os.environ["GDRIVE_BRIDGE_TOKEN"])
            try:
                all_remote = drive.list_files()
            except RuntimeError as e:
                sys.exit(f"GAGAL: {e}")
            print(f"Drive: {len(all_remote)} file .xlsx ditemukan.")

        state = {r["key"]: r["value"] for r in sb.select("sync_state", "select=key,value&key=not.like.gmrec:*")}

        for name, (top, sub) in TOP.items():
            if a.only and a.only != name:
                continue
            print(f"\n=== {top} ===")
            # 1) daftar file + penanda perubahan
            listing = {}  # path_str -> (penanda, sumber)
            if a.local_root:
                base = a.local_root / top
                for p in sorted(base.rglob("*.xlsx")) if base.exists() else []:
                    if p.name.startswith("~$"):
                        continue
                    key = "/".join(p.relative_to(a.local_root).parts)
                    if not _belongs(name, key):
                        continue
                    h = hashlib.md5(p.read_bytes()).hexdigest()
                    listing[key] = (h, p)
            else:
                pre = top.strip().lower() + "/"
                listing = {k: v for k, v in all_remote.items() if k.lower().startswith(pre) and _belongs(name, k)}
                if not listing and name in ("gmt", "lbt"):
                    print("  Belum ada file target - dilewati.")
                    continue
                if not listing:
                    print(f"  Folder '{top}' kosong / tidak ditemukan di Drive — dilewati.")
                    failures.append(f"folder '{top}' kosong atau tidak ada di Drive")
                    continue
            if not listing:
                print("  Tidak ada file .xlsx — dilewati.")
                continue
            marks = {k: v[0] for k, v in listing.items()}
            if name == "koordinat":  # hasil gabungan juga bergantung pada data Mon Billing -> ikut dibangun ulang bila itu berubah
                b = sb.select("tul_data", "select=generated_at&id=eq.billing")
                marks["_mon_billing"] = (b[0].get("generated_at") if b else "") or ""
            manifest = manifest_of(marks)
            if not a.force and state.get(f"manifest_{name}", {}).get("files") == manifest:
                print(f"  {len(listing)} file, tidak ada perubahan.")
                continue
            changed = None   # None = proses semua file; himpunan = hanya file ini (inkremental, saat ini hanya Ganti Meter)
            if name == "gm" and not a.force:
                old = state.get("manifest_gm", {})
                if old.get("incr") and old.get("files"):
                    changed = {k for k, m in marks.items() if old["files"].get(k) != m}
            _GM["full"], _GM["total"] = changed is None, len(listing)
            if changed is None:
                print(f"  {len(listing)} file, ada perubahan -> memproses.")
            elif not changed:
                print("  Tidak ada file baru/berubah (hanya ada yang dihapus); data lama dipertahankan. Gunakan force untuk membangun ulang.")
                sb.upsert("sync_state", [{"key": "manifest_gm", "value": {**old, "files": manifest, "synced_at": now()}, "updated_at": now()}], "key")
                continue
            else:
                print(f"  {len(listing)} file, {len(changed)} baru/berubah -> inkremental.")

            # 2) siapkan salinan lokal dengan struktur folder yang sama
            tree = work / name
            if tree.exists():
                shutil.rmtree(tree)
            for path_str, (_, ref) in listing.items():
                if changed is not None and path_str not in changed:
                    continue
                dest = tree.joinpath(*path_str.split("/"))
                if a.local_root:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(ref, dest)
                else:
                    drive.download(ref, dest)
            src = _ci_dir(_ci_dir(tree, top), sub)

            # 3) bangun & kirim
            try:
                warns = PUBLISH[name](sb, src, work / name)
                if _PARTIAL.get(name):
                    print("  Sebagian selesai — manifest tidak disimpan agar sinkron berikutnya melanjutkan.")
                    continue
                if name == "gm" and _GM["failed"]:
                    manifest = {k: v for k, v in manifest.items() if k.rsplit("/", 1)[-1] not in _GM["failed"]}
                    print(f"  {len(_GM['failed'])} file gagal dibaca, dicoba ulang di sinkron berikutnya: {', '.join(sorted(_GM['failed']))}")
                state_row = {"files": manifest, "warnings": warns, "synced_at": now(), "ok": True, **({"incr": True} if name == "gm" else {})}
                sb.upsert("sync_state", [{"key": f"manifest_{name}", "value": state_row, "updated_at": now()}], "key")
                print(f"  Selesai. Peringatan: {len(warns)}")
            except Exception as e:  # satu menu gagal tidak menghentikan menu lain
                print(f"  GAGAL: {e}")
                failures.append(f"{top}: {e}")
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if failures:
        print("\nAda kegagalan:\n  - " + "\n  - ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
