# Setup awal otomatisasi (sekali saja)

## A. Supabase
1. **Tabel & keamanan:** Supabase → *SQL Editor* → *New query* → tempel isi `supabase/schema.sql` → *Run*.
2. **Matikan pendaftaran bebas** (penting!): *Authentication* → *Sign In / Providers* (atau *Settings*) →
   matikan **Allow new users to sign up**. Tanpa ini siapa pun bisa mendaftar dan membaca data.
3. **Buat pengguna:** *Authentication* → *Users* → *Add user* → *Create new user*; isi email + kata sandi,
   centang **Auto Confirm User**. Ulangi untuk setiap orang yang boleh melihat dashboard.
4. **Kunci rahasia:** *Project Settings* → *API Keys* → salin **Secret key** (`sb_secret_...`) atau
   *service_role* (tab Legacy). Jangan dikirim ke siapa pun; dipakai di langkah C.

## B. Google Drive
1. Buat folder induk di Drive (mis. `Dashboard TE`) berisi `Transaksi Energi/309/...` dan
   `Pengendalian Susut/Laporan Susut/...` (struktur seperti README). Unggah file Excel ke sana.
2. Google Cloud Console (console.cloud.google.com) → buat proyek (mis. `dashboard-te`) →
   *APIs & Services* → *Library* → aktifkan **Google Drive API**.
3. *IAM & Admin* → *Service Accounts* → *Create service account* (nama `dashboard-sync`, tanpa peran).
   Buka akun itu → tab *Keys* → *Add key* → *Create new key* → **JSON** → berkas terunduh.
4. Salin **email service account** (`...@....iam.gserviceaccount.com`). Di Drive, klik kanan folder induk →
   *Share* → tambahkan email itu sebagai **Viewer**.
5. ID folder induk = bagian akhir URL folder: `drive.google.com/drive/folders/<ID>`.

## C. GitHub Secrets
Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
| Nama | Isi |
|---|---|
| `SUPABASE_URL` | `https://frgioczyzvzdaqdkuafs.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Secret key / service_role dari A.4 |
| `GDRIVE_SERVICE_ACCOUNT_JSON` | seluruh isi berkas JSON dari B.3 |
| `DRIVE_ROOT_ID` | ID folder dari B.5 |

## D. Jalankan pertama kali
1. Repo → *Actions* → *Sinkron Drive ke Supabase* → *Run workflow* (centang *force*).
2. Pastikan log menunjukkan `Selesai` untuk kedua menu.
3. Buka website, login dengan akun dari A.3.
