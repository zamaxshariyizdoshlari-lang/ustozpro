-- ═══════════════════════════════════════════════════════════════
-- MULTI-TENANT SAAS — 1-BOSQICH: SXEMA POYDEVORI
-- Ma'lumotlar bazasi ATAYLAB NOLDAN boshlanadi (foydalanuvchi bilan
-- aniq kelishilgan qaror) — barcha eski maktab ma'lumotlari (o'quvchilar,
-- natijalar tarixi, savollar) TOZALANADI. Hozirgi yagona admin
-- identifikatsiyasi (Supabase Auth) platform_admins'ga ko'tariladi — u
-- endi istalgan tashkilotni yaratuvchi platforma egasi bo'ladi.
--
-- Bu migratsiyadan keyin sayt VAQTINCHA ishlamaydi (Edge Function'lar
-- eski sxemaga — id=1 settings, global app_secrets — murojaat qiladi).
-- Bu kutilgan holat: RLS (2-bosqich) va Edge Function'lar (3-5-bosqich)
-- darhol ketma-ket qayta yoziladi, hech qanday haqiqiy tashkilot hali
-- yaratilmagan bo'lganida.
-- ═══════════════════════════════════════════════════════════════

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);
create unique index organizations_slug_lower_idx on public.organizations (lower(slug));
alter table public.organizations enable row level security;

create table public.platform_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

-- Hozirgi yagona admin — platforma egasi sifatida ko'tariladi
insert into public.platform_admins (id, full_name, email)
values ('4b7fbd98-a9ff-450b-8cd2-d8ba6ac3e0bd', 'Administrator', 'ustozpro@ustozpro.local');

-- Barcha eski maktab ma'lumotlari tozalanadi (ataylab, kelishilgan)
truncate table
  public.audit_log,
  public.custom_sessions,
  public.test_sessions,
  public.class_settings,
  public.results,
  public.questions,
  public.teacher_subjects,
  public.student_accounts,
  public.students,
  public.subjects,
  public.teachers,
  public.classes,
  public.settings,
  public.app_secrets,
  public.admin_accounts
  restart identity cascade;

-- org_id qo'shish (jadvallar bo'sh, shuning uchun to'g'ridan-to'g'ri NOT NULL)
alter table public.admin_accounts add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.classes add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.students add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.subjects add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.questions add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.results add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.teachers add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.teacher_subjects add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.student_accounts add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.custom_sessions add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.test_sessions add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.audit_log add column org_id uuid not null references public.organizations(id) on delete cascade;
alter table public.class_settings add column org_id uuid not null references public.organizations(id) on delete cascade;

-- login/nom cheklovlarini "global noyob"dan "tashkilot ichida noyob"ga o'zgartirish
alter table public.classes drop constraint classes_name_key;
alter table public.classes add constraint classes_org_id_name_key unique (org_id, name);
alter table public.teachers drop constraint teachers_login_key;
alter table public.teachers add constraint teachers_org_id_login_key unique (org_id, login);
alter table public.student_accounts drop constraint student_accounts_login_key;
alter table public.student_accounts add constraint student_accounts_org_id_login_key unique (org_id, login);

-- settings: id=1 yagona global qatordan har-tashkilot-bitta-qator (org_id pk)ga
drop table public.settings;
create table public.settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  max_attempts integer not null default 3,
  question_count integer not null default 15,
  time_limit_minutes integer not null default 20,
  allow_custom boolean not null default true,
  enable_attempt_limit boolean not null default false
);
alter table public.settings enable row level security;

-- app_secrets: global key'dan (org_id,key) composite primary key'ga
-- (har tashkilot o'z Telegram bot/chat'i va o'z "javob paroli"ni saqlaydi)
drop table public.app_secrets;
create table public.app_secrets (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table public.app_secrets enable row level security;
