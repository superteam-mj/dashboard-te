# Dashboard TE — UP3 Mamuju

Website dashboard (GitHub Pages) dengan dua menu:
- **Transaksi Energi** — Laporan TUL III-09 (penjualan tenaga listrik)
- **Pengendalian Susut › Laporan Susut** — sheet Excel laporan susut ditampilkan sebagai tabel

Data **otomatis** diperbarui: file Excel di Google Drive → GitHub Actions (tiap 30 menit) → Supabase → website.
Pengunjung harus **login** (akun dibuat admin di Supabase).

```
Google Drive (folder Excel)
   │  jembatan Apps Script (apps_script/Code.gs) dibaca oleh sync_drive.py
   │  — jalan di GitHub Actions, hanya memproses file yang berubah
   ▼
Supabase (tabel tul_data, susut_reports, susut_sheets) + Auth
   ▼
docs/  (GitHub Pages): halaman login → dashboard
```

## Berkas penting
| Berkas | Fungsi |
|---|---|
| `sync_drive.py` | Drive → build → Supabase (dipanggil Actions) |
| `apps_script/Code.gs` | Jembatan Google Apps Script: daftar & unduh file Excel dari Drive (tanpa Google Cloud) |
| `build_data.py` | Excel TUL III-09 → JSON (validasi total & cek silang) |
| `build_susut.py` | Excel Laporan Susut → JSON (sel gabungan, warna, format angka) |
| `supabase/schema.sql` | Tabel + aturan keamanan (RLS: hanya yang login boleh baca) |
| `.github/workflows/sync.yml` | Jadwal sinkron tiap 30 menit + tombol jalankan manual |
| `docs/assets/config.js` | URL & kunci *publishable* Supabase (aman terlihat publik) |

## Struktur folder Drive
Folder induk (ID-nya ditulis di `Code.gs` di Apps Script) meniru struktur proyek:
```
<folder induk>/
  Transaksi Energi/309/UP|UPI|KABUPATEN/<tahun>/*.xlsx
  Pengendalian Susut/Laporan Susut/*.xlsx
```
Format nama file TUL III-09 yang dikenali ada di docstring `build_data.py`.
Cukup simpan/ganti file di Drive; dalam ±30 menit website ikut berubah.

## Pemeliharaan harian
- **Update data:** simpan Excel ke Drive. Selesai.
- **Paksa sinkron sekarang:** GitHub → Actions → *Sinkron Drive ke Supabase* → *Run workflow*
  (centang *force* untuk memproses ulang semua file).
- **Cek hasil:** log Actions menampilkan jumlah file, peringatan validasi, dan kegagalan.
  Status terakhir juga tersimpan di tabel `sync_state`.
- **Tambah/hapus pengguna:** Supabase → Authentication → Users.
- Sinkron terjadwal GitHub dihentikan otomatis jika repo tidak ada aktivitas 60 hari;
  jalankan workflow sekali secara manual untuk mengaktifkannya lagi.

## Uji lokal (tanpa Drive/Supabase)
```
pip install -r requirements.txt
python sync_drive.py --local-root . --dry-run --force
python build_data.py --out hasil/data.json
python build_susut.py --out hasil/susut.json
```
(Excel di `Transaksi Energi/` dan `Pengendalian Susut/` tidak di-upload ke GitHub — lihat `.gitignore`.)

## Setup awal (sekali saja)
Lihat `SETUP.md`.
