-- Vùng đất Tinh linh — Supabase Schema (Giai đoạn 1 & 2)
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
  -- Tên cột viết thường: Postgres tự gấp tên không có ngoặc kép về chữ thường
  drumpieces jsonb not null default '[]'::jsonb,
  quests jsonb not null default '{"main1": 1}'::jsonb,
  questprog jsonb not null default '{}'::jsonb,
  title text default '',
  life jsonb not null default '{}'::jsonb, -- Nghe Song: cap nghe, Gio Tre, buff an uong
  mapid text not null default 'lang_tre', -- bản đồ đang đứng (Giai đoạn 3)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration nếu bảng đã tồn tại từ trước:
alter table public.profiles
  add column if not exists drumpieces jsonb not null default '[]'::jsonb,
  add column if not exists quests jsonb not null default '{"main1": 1}'::jsonb,
  add column if not exists questprog jsonb not null default '{}'::jsonb,
  add column if not exists title text default '',
  add column if not exists mapid text not null default 'lang_tre',
  add column if not exists life jsonb not null default '{}'::jsonb;

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

-- ------------------------------------------------------------------
-- Đăng nhập nhanh (server giả): mỗi email gắn với tối đa 1 nhân vật, tạo 1 lần.
create table if not exists public.accounts (
  email text primary key,
  profile_token text references public.profiles(token) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Một nhân vật chỉ thuộc về một tài khoản
create unique index if not exists idx_accounts_profile_token on public.accounts(profile_token) where profile_token is not null;

alter table public.accounts enable row level security;

drop policy if exists "Cho phep game server doc ghi account" on public.accounts;
create policy "Cho phep game server doc ghi account"
  on public.accounts
  for all
  using (true)
  with check (true);
