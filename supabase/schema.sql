-- Happy Land — Supabase Schema (Giai đoạn 1 & 2)
-- Chạy script này trong Supabase Dashboard > SQL Editor > New query

create table if not exists public.profiles (
  token text primary key,
  name text not null,
  cls text not null,
  level integer not null default 1,
  xp integer not null default 0,
  gold integer not null default 0,
  inv jsonb not null default '[]'::jsonb,
  weapon text not null,
  drumPieces jsonb not null default '[]'::jsonb,
  quests jsonb not null default '{"main1": 1}'::jsonb,
  questProg jsonb not null default '{}'::jsonb,
  title text default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration nếu bảng đã tồn tại từ trước:
alter table public.profiles
  add column if not exists drumPieces jsonb not null default '[]'::jsonb,
  add column if not exists quests jsonb not null default '{"main1": 1}'::jsonb,
  add column if not exists questProg jsonb not null default '{}'::jsonb,
  add column if not exists title text default '';

-- Index hỗ trợ bảng xếp hạng cấp độ
create index if not exists idx_profiles_level on public.profiles(level desc);

-- Bật Row Level Security (RLS)
alter table public.profiles enable row level security;

-- Policy: Cho phép game server đọc và ghi profile
drop policy if exists "Cho phep game server doc ghi profile" on public.profiles;
create policy "Cho phep game server doc ghi profile"
  on public.profiles
  for all
  using (true)
  with check (true);
