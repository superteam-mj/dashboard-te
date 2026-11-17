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
