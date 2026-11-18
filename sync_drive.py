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
TOP = {
    "tul": ("Transaksi Energi", "309"),
    "billing": ("Transaksi Energi", "Mon Billing"),
    "susut": ("Pengendalian Susut", "Laporan Susut"),
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


def publish_billing(sb: Supa, src: Path, work: Path):
    import build_billing
    cached = {}
    for row in sb.select("tul_data", "select=data&id=eq.billing"):
        cached = (row.get("data") or {}).get("periods") or {}
    data = build_billing.main(src, cached)
    details = data.pop("details", {})
    # daftar pelanggan per penanda -> baris tul_data 'bd:<periode>:<penanda>' (dulu, baru ringkasan)
    for ym, flags in details.items():
        for k, rows in flags.items():
            sb.upsert("tul_data", [{"id": f"bd:{ym}:{k}", "data": {"cols": build_billing.DETAIL_COLS, "rows": rows}, "generated_at": data["generated_at"]}], "id")
    sb.upsert("tul_data", [{"id": "billing", "data": data, "generated_at": data["generated_at"]}], "id")
    keep = {f"bd:{ym}:{k}" for ym in data["periods"] for k, _ in build_billing.FLAGS}
    for row in sb.select("tul_data", "select=id&id=like.bd:*"):
        if row["id"] not in keep:
            sb.delete("tul_data", f"id=eq.{row['id']}")
    return data["warnings"]


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
    """Folder Mon Billing hanya milik 'billing'; 309 tidak boleh ikut terhitung."""
    in_billing = path_str.lower().startswith(BILLING_DIR)
    return in_billing if name == "billing" else (not in_billing if name == "tul" else True)


def _ci_dir(parent: Path, name: str) -> Path:
    """Subfolder dengan nama yang sama tanpa peduli huruf besar/kecil (Drive vs Linux)."""
    if parent.exists():
        for d in parent.iterdir():
            if d.is_dir() and d.name.strip().lower() == name.strip().lower():
                return d
    return parent / name


PUBLISH = {"tul": publish_tul, "susut": publish_susut, "billing": publish_billing}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local-root", type=Path, help="pakai folder lokal sebagai pengganti Drive (uji)")
    ap.add_argument("--dry-run", action="store_true", help="jangan menulis ke Supabase")
    ap.add_argument("--force", action="store_true", help="proses ulang walau tidak ada perubahan")
    ap.add_argument("--only", choices=["tul", "susut", "billing"], help="hanya satu kumpulan data")
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

        state = {r["key"]: r["value"] for r in sb.select("sync_state", "select=key,value")}

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
                if not listing:
                    print(f"  Folder '{top}' kosong / tidak ditemukan di Drive — dilewati.")
                    failures.append(f"folder '{top}' kosong atau tidak ada di Drive")
                    continue
            if not listing:
                print("  Tidak ada file .xlsx — dilewati.")
                continue
            manifest = manifest_of({k: v[0] for k, v in listing.items()})
            if not a.force and state.get(f"manifest_{name}", {}).get("files") == manifest:
                print(f"  {len(listing)} file, tidak ada perubahan.")
                continue
            print(f"  {len(listing)} file, ada perubahan -> memproses.")

            # 2) siapkan salinan lokal dengan struktur folder yang sama
            tree = work / name
            if tree.exists():
                shutil.rmtree(tree)
            for path_str, (_, ref) in listing.items():
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
                state_row = {"files": manifest, "warnings": warns, "synced_at": now(), "ok": True}
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
