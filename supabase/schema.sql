-- Dashboard TE — skema Supabase
-- Jalankan sekali di Supabase: SQL Editor -> New query -> tempel semua -> Run.
-- Aman dijalankan ulang (idempotent).

-- 1) Data Transaksi Energi (isi data.json, satu baris)
create table if not exists public.tul_data (
  id           text primary key,
  data         jsonb       not null,
  generated_at timestamptz not null default now()
);

-- 2) Laporan Susut: daftar laporan (satu file Excel = satu baris)
create table if not exists public.susut_reports (
  file       text primary key,
  title      text        not null,
  modified   timestamptz,
  sheets     jsonb       not null default '[]'::jsonb,   -- daftar nama sheet berurutan
  updated_at timestamptz not null default now()
);

-- 3) Laporan Susut: isi tiap sheet
create table if not exists public.susut_sheets (
  file text    not null references public.susut_reports(file) on delete cascade,
  idx  integer not null,
  name text    not null,
  data jsonb   not null,
  primary key (file, idx)
);

-- 4) Status sinkronisasi (dipakai skrip sinkron; tidak terbaca dari website)
create table if not exists public.sync_state (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Keamanan: hanya pengguna yang LOGIN yang boleh membaca. Penulisan hanya lewat
-- service_role (skrip sinkron di GitHub Actions), yang melewati RLS.
alter table public.tul_data       enable row level security;
alter table public.susut_reports  enable row level security;
alter table public.susut_sheets   enable row level security;
alter table public.sync_state     enable row level security;

drop policy if exists "login boleh baca" on public.tul_data;
drop policy if exists "login boleh baca" on public.susut_reports;
drop policy if exists "login boleh baca" on public.susut_sheets;

create policy "login boleh baca" on public.tul_data      for select to authenticated using (true);
create policy "login boleh baca" on public.susut_reports for select to authenticated using (true);
create policy "login boleh baca" on public.susut_sheets  for select to authenticated using (true);
-- sync_state: sengaja tanpa policy -> tertutup untuk anon & authenticated.

-- Pencabutan hak eksplisit untuk pengunjung tanpa login
revoke all on public.tul_data, public.susut_reports, public.susut_sheets, public.sync_state from anon;
revoke insert, update, delete on public.tul_data, public.susut_reports, public.susut_sheets from authenticated;
revoke all on public.sync_state from authenticated;

-- ============================================================================
-- 5) Hasil pemeriksaan Target Operasi (TO) P2TL — diinput dari peta TO
--    Semua pengguna login boleh MELIHAT; hanya akun di tabel to_editors yang boleh MENGINPUT / MENGHAPUS.
--    Tambah akun penginput (setelah akunnya dibuat di Authentication -> Users, Auto Confirm):
--        insert into public.to_editors(email) values ('namaakun@dashte.invalid');
--    Cabut: delete from public.to_editors where email = 'namaakun@dashte.invalid';
-- ============================================================================
create table if not exists public.to_editors (
  email text primary key
);

create table if not exists public.to_inspections (
  id         bigint generated always as identity primary key,
  idpel      text        not null,
  jenis      text        not null check (jenis in ('pra', 'pasca')),
  hasil      text        not null check (hasil in ('normal', 'temuan', 'kosong', 'akses')),
  catatan    text        check (char_length(catatan) <= 300),
  tanggal    date        not null default current_date,
  created_by text        not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now()
);
create index if not exists to_inspections_idpel_idx   on public.to_inspections (idpel);
create index if not exists to_inspections_tanggal_idx on public.to_inspections (tanggal desc);

alter table public.to_editors     enable row level security;
alter table public.to_inspections enable row level security;

drop policy if exists "baca diri sendiri" on public.to_editors;
drop policy if exists "login boleh baca"  on public.to_inspections;
drop policy if exists "editor boleh isi"  on public.to_inspections;
drop policy if exists "editor boleh hapus" on public.to_inspections;

-- to_editors: tiap pengguna hanya bisa melihat barisnya sendiri (untuk tahu apakah ia penginput); tidak bisa diubah dari website.
create policy "baca diri sendiri" on public.to_editors for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));
create policy "login boleh baca"  on public.to_inspections for select to authenticated using (true);
create policy "editor boleh isi"  on public.to_inspections for insert to authenticated
  with check (lower(created_by) = lower(auth.jwt() ->> 'email')
              and exists (select 1 from public.to_editors e where lower(e.email) = lower(auth.jwt() ->> 'email')));
create policy "editor boleh hapus" on public.to_inspections for delete to authenticated
  using (exists (select 1 from public.to_editors e where lower(e.email) = lower(auth.jwt() ->> 'email')));

revoke all on public.to_editors, public.to_inspections from anon;
revoke all on public.to_editors from authenticated;
grant select on public.to_editors to authenticated;
revoke all on public.to_inspections from authenticated;
grant select, insert, delete on public.to_inspections to authenticated;

-- 6) Target Realisasi Tagihan Susulan (P2TL) per ULP per bulan, dalam kWh (kolom target = kWh). Dibaca semua pengguna login; diisi/diubah hanya penginput (to_editors).
create table if not exists public.ts_targets (
  ulp        text        not null,
  bln        text        not null check (bln ~ '^[0-9]{4}-[0-9]{2}$'),
  target     numeric     not null check (target >= 0),
  updated_by text        not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  updated_at timestamptz not null default now(),
  primary key (ulp, bln)
);
alter table public.ts_targets enable row level security;
drop policy if exists "login boleh baca"    on public.ts_targets;
drop policy if exists "editor boleh isi"    on public.ts_targets;
drop policy if exists "editor boleh ubah"   on public.ts_targets;
drop policy if exists "editor boleh hapus"  on public.ts_targets;
create policy "login boleh baca" on public.ts_targets for select to authenticated using (true);
create policy "editor boleh isi" on public.ts_targets for insert to authenticated
  with check (exists (select 1 from public.to_editors e where lower(e.email) = lower(auth.jwt() ->> 'email')));
create policy "editor boleh ubah" on public.ts_targets for update to authenticated
  using (exists (select 1 from public.to_editors e where lower(e.email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.to_editors e where lower(e.email) = lower(auth.jwt() ->> 'email')));
create policy "editor boleh hapus" on public.ts_targets for delete to authenticated
  using (exists (select 1 from public.to_editors e where lower(e.email) = lower(auth.jwt() ->> 'email')));
revoke all on public.ts_targets from anon;
revoke all on public.ts_targets from authenticated;
grant select, insert, update, delete on public.ts_targets to authenticated;
