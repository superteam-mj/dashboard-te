# Setup awal otomatisasi (sekali saja)

## A. Supabase
1. **Tabel & keamanan:** Supabase → *SQL Editor* → *New query* → tempel isi `supabase/schema.sql` → *Run*.
2. **Matikan pendaftaran bebas** (penting!): *Authentication* → *Sign In / Providers* (atau *Settings*) →
   matikan **Allow new users to sign up**. Tanpa ini siapa pun bisa mendaftar dan membaca data.
3. **Buat pengguna (login memakai NAMA PENGGUNA, bukan email):** *Authentication* → *Users* →
   *Add user* → *Create new user*. Isi **Email** = `<nama pengguna>@dashte.invalid` (huruf kecil, tanpa spasi;
   contoh `budi@dashte.invalid`) dan **Password**, lalu centang **Auto Confirm User**.
   Di website pengguna cukup mengetik `budi` + kata sandi; domain `@dashte.invalid` ditambahkan otomatis
   (domain tiruan, tidak ada email yang terkirim). Akun lama berbentuk email asli tetap bisa login dengan mengetik emailnya.
   Lupa kata sandi: admin mengganti di *Authentication → Users* (tidak ada reset lewat email).
4. **Kunci rahasia:** *Project Settings* → *API Keys* → salin **Secret key** (`sb_secret_...`) atau
   *service_role* (tab Legacy). Jangan dikirim ke siapa pun; dipakai di langkah C.

## B. Google Drive + Apps Script (tanpa Google Cloud)
1. Buat folder induk di Drive (mis. `Dashboard TE`) berisi `Transaksi Energi/309/...` dan
   `Pengendalian Susut/Laporan Susut/...` (struktur seperti README). Unggah file Excel .xlsx ke sana.
   ID folder = bagian akhir URL: `drive.google.com/drive/folders/<ID>`.
2. Buka https://script.google.com (akun Google yang sama) → **New project**. Hapus isi `Code.gs`,
   tempel seluruh isi `apps_script/Code.gs` dari repo ini.
3. Ubah dua baris di atas kode: `TOKEN` (kata acak panjang buatan Anda, min. 30 karakter; simpan, dipakai lagi di C)
   dan `ROOT_ID` (ID folder dari langkah 1). Klik **Save**.
4. **Deploy → New deployment** → ikon roda gigi → **Web app**. Isi: *Execute as* = **Me**,
   *Who has access* = **Anyone** → **Deploy**. Izinkan akses saat diminta
   (*Advanced → Go to ... (unsafe) → Allow*; ini wajar karena skripnya milik Anda sendiri).
5. Salin **Web app URL** (berakhiran `/exec`).
6. Uji: buka `<Web app URL>?action=list&token=<TOKEN>` di browser. Harus muncul JSON berisi daftar file.
   Tanpa token yang benar harus muncul `{"error":"unauthorized"}`.
   Jika Anda mengubah kode lagi, buat **New deployment/Manage deployments → Edit → New version** agar berlaku.

## C. GitHub Secrets
Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
| Nama | Isi |
|---|---|
| `SUPABASE_URL` | `https://frgioczyzvzdaqdkuafs.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Secret key / service_role dari A.4 |
| `GDRIVE_BRIDGE_URL` | Web app URL dari B.5 |
| `GDRIVE_BRIDGE_TOKEN` | TOKEN yang sama dengan di Code.gs |

## D. Jalankan pertama kali
1. Repo → *Actions* → *Sinkron Drive ke Supabase* → *Run workflow* (centang *force*).
2. Pastikan log menunjukkan `Selesai` untuk kedua menu.
3. Buka website, login dengan akun dari A.3.

---

# E. Pemulihan setelah komputer rusak / disk terhapus

Repo ini **publik**: jangan pernah menulis nilai secret, token, atau password di file mana pun di sini.

## E.1 Apa yang tersimpan di mana
| Komponen | Lokasi | Aman jika disk rusak? |
|---|---|---|
| Kode, situs (`docs/`), workflow | GitHub `superteam-mj/dashboard-te` | Ya, selama sudah di-`git push` |
| File Excel sumber | Google Drive (salinan lokal di-gitignore) | Ya, jika file asli ada di Drive |
| Data tabel (`tul_data`, `susut_*`) | Supabase | Ya, dan bisa dibangun ulang dari Drive (lihat E.3 langkah 5) |
| Akun pengguna & password | Supabase Auth | Ya di Supabase, tetapi daftar username perlu dicatat sendiri |
| `Code.gs` dengan TOKEN asli | Google Apps Script (akun Google) | Ya selama akun Google bisa diakses |
| Secrets Actions | GitHub (tidak bisa dibaca kembali) | **Tidak**: simpan nilainya di password manager |
| `.claude/` (memori Claude) | Hanya disk lokal | Tidak, tetapi hanya konteks kerja |

## E.2 Yang WAJIB dicadangkan di luar repo (password manager, mis. Bitwarden)
- `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` (Secret key, langkah A.4)
- `GDRIVE_BRIDGE_URL` (Web app URL) dan `GDRIVE_BRIDGE_TOKEN` (TOKEN di `Code.gs`)
- ID folder induk Drive (`ROOT_ID`)
- Daftar username pengguna dashboard (password dikelola di Supabase Auth)
- Recovery codes 2FA untuk akun GitHub, Supabase, dan Google
- Token GitHub (fine-grained / PAT) bila dipakai di komputer

Aktifkan 2FA di GitHub, Supabase, dan Google, dan simpan recovery codes terpisah dari komputer ini
(bukan di HP yang sama dengan aplikasi 2FA).

## E.3 Langkah pemulihan di komputer baru
1. Pasang Git, Python 3, dan GitHub CLI (`gh`), lalu login: `gh auth login`.
2. Ambil kode:
   ```
   git clone https://github.com/superteam-mj/dashboard-te.git
   cd dashboard-te
   pip install -r requirements.txt
   ```
3. Folder Excel lokal tidak ikut ter-clone (di-gitignore). Unduh ulang dari Drive bila perlu menjalankan skrip
   `build_*.py` secara lokal. Untuk operasi normal ini tidak perlu karena sinkronisasi berjalan di GitHub Actions.
4. Cek secrets: repo → *Settings* → *Secrets and variables* → *Actions*. Keempat secret di bagian C harus ada.
   Jika hilang atau ragu, isi ulang dari password manager (E.2). Jika TOKEN/URL hilang total, ulangi bagian B
   dengan TOKEN baru, lalu perbarui `GDRIVE_BRIDGE_TOKEN` dan `GDRIVE_BRIDGE_URL`.
5. Bangun ulang data: *Actions* → *Sinkron Drive ke Supabase* → *Run workflow* (centang *force*).
6. Jika proyek Supabase hilang: buat proyek baru, jalankan `supabase/schema.sql` (A.1), matikan sign-up (A.2),
   buat ulang pengguna (A.3), perbarui `docs/assets/config.js` (URL & publishable key) dan secret `SUPABASE_*`,
   lalu jalankan sinkron seperti langkah 5.
7. Pastikan situs hidup: https://superteam-mj.github.io/dashboard-te/ (GitHub Pages, sumber `main` folder `/docs`).

## E.4 Kebiasaan agar tetap aman
- `git push` setelah setiap perubahan; cek dengan `git status -sb` (tidak boleh ada `ahead`).
- Ekspor berkala data Supabase (menu Backup di dashboard Supabase atau `pg_dump`) ke Drive. Opsional.
- Jika token atau secret pernah bocor, buat ulang (rotate) dan perbarui di GitHub Secrets dan `Code.gs`.
