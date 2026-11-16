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
