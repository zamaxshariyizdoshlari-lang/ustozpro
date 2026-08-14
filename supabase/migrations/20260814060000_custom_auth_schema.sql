-- O'quvchi/o'qituvchi uchun Supabase Auth'dan butunlay voz kechish: endi parol
-- to'g'ridan-to'g'ri shu jadvallarda (pgcrypto bcrypt bilan) saqlanadi, va
-- sessiya Supabase JWT emas, o'zimizning custom_sessions jadvalimizdagi
-- tasodifiy tokendir. Admin o'zgarishsiz — haqiqiy Supabase Auth'da qoladi.

alter table public.student_accounts add column password_hash text;
alter table public.teachers add column password_hash text;
-- O'qituvchining "login"i hozirgacha Supabase Auth email'i edi (teachers jadvalida
-- alohida ustun sifatida saqlanmagan) — endi buni o'z ustunimizga ko'chiramiz.
alter table public.teachers add column login text;

-- Mavjud bcrypt hash'larni va o'qituvchi email'ini Supabase Auth'dan ko'chiramiz
-- — parollar o'zgarmaydi.
update public.student_accounts sa
set password_hash = u.encrypted_password
from auth.users u
where u.id = sa.id;

update public.teachers t
set password_hash = u.encrypted_password, login = lower(u.email)
from auth.users u
where u.id = t.id;

alter table public.student_accounts alter column password_hash set not null;
alter table public.teachers alter column password_hash set not null;
alter table public.teachers alter column login set not null;
alter table public.teachers add constraint teachers_login_key unique (login);

-- id endi auth.users'ga bog'liq emas, mustaqil UUID
alter table public.student_accounts drop constraint student_accounts_id_fkey;
alter table public.teachers drop constraint teachers_id_fkey;

-- Endi kerak bo'lmagan Supabase Auth qatorlarini tozalaymiz
delete from auth.identities where user_id in (select id from public.student_accounts union select id from public.teachers);
delete from auth.users where id in (select id from public.student_accounts union select id from public.teachers);

-- custom_sessions: bir martalik tasodifiy token = shu qatorning o'zi (id)
create table public.custom_sessions (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('student', 'teacher')),
  account_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.custom_sessions enable row level security;
-- Hech qanday policy yo'q — faqat Edge Function service_role orqali kirish mumkin
create index custom_sessions_account_id_idx on public.custom_sessions (account_id);

-- Parol tekshiruvi — faqat Edge Function'lar (service_role) chaqiradi
create or replace function public._verify_student_login(p_login text, p_password text)
returns table(account_id uuid, student_id uuid, must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select id, student_id, must_change_password
  from public.student_accounts
  where login = lower(trim(p_login)) and password_hash = extensions.crypt(p_password, password_hash)
$$;
revoke execute on function public._verify_student_login(text, text) from public, anon, authenticated;

create or replace function public._verify_teacher_login(p_login text, p_password text)
returns table(account_id uuid, must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select id, must_change_password
  from public.teachers
  where login = lower(trim(p_login)) and password_hash = extensions.crypt(p_password, password_hash)
$$;
revoke execute on function public._verify_teacher_login(text, text) from public, anon, authenticated;
