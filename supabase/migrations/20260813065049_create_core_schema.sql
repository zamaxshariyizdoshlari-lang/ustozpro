-- Asosiy jadvallar
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  unique(class_id, full_name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(class_id, name)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_text text not null,
  option_a text not null default '',
  option_b text not null default '',
  option_c text not null default '',
  option_d text not null default '',
  correct_option text not null check (correct_option in ('a','b','c','d')),
  hint text not null default '',
  created_at timestamptz not null default now()
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  class_name text not null,
  subject_name text not null,
  score int not null,
  total int not null,
  percent int not null,
  cheat_count int not null default 0,
  elapsed_seconds int,
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1,
  max_attempts int not null default 3,
  question_count int not null default 15,
  time_limit_minutes int not null default 20,
  allow_custom boolean not null default true,
  enable_attempt_limit boolean not null default false,
  check (id = 1)
);
insert into public.settings (id) values (1);

create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Admin tekshiruvi: faqat shu bitta belgilangan UUID admin hisoblanadi
-- MUHIM: bu UUID Supabase Auth'da yaratilgan admin foydalanuvchining haqiqiy id'siga mos kelishi kerak.
-- Yangi loyihada ishga tushirishda avval admin foydalanuvchini yarating, so'ng shu UUID'ni bu yerga qo'ying.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = '4b7fbd98-a9ff-450b-8cd2-d8ba6ac3e0bd'::uuid
$$;

-- RLS yoqish
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.questions enable row level security;
alter table public.results enable row level security;
alter table public.settings enable row level security;
alter table public.app_secrets enable row level security;

-- classes: hamma o'qiy oladi (test-setup dropdown uchun), faqat admin yozadi
create policy "classes_select_all" on public.classes for select using (true);
create policy "classes_write_admin" on public.classes for insert with check (public.is_admin());
create policy "classes_update_admin" on public.classes for update using (public.is_admin());
create policy "classes_delete_admin" on public.classes for delete using (public.is_admin());

-- students: hamma o'qiy oladi (dropdown uchun), faqat admin yozadi
create policy "students_select_all" on public.students for select using (true);
create policy "students_write_admin" on public.students for insert with check (public.is_admin());
create policy "students_update_admin" on public.students for update using (public.is_admin());
create policy "students_delete_admin" on public.students for delete using (public.is_admin());

-- subjects: hamma o'qiy oladi (dropdown uchun), faqat admin yozadi
create policy "subjects_select_all" on public.subjects for select using (true);
create policy "subjects_write_admin" on public.subjects for insert with check (public.is_admin());
create policy "subjects_update_admin" on public.subjects for update using (public.is_admin());
create policy "subjects_delete_admin" on public.subjects for delete using (public.is_admin());

-- questions: anon hech qachon o'qiy olmaydi (to'g'ri javoblar himoyalangan) — faqat admin CRUD, o'quvchilar get-test edge function orqali oladi
create policy "questions_admin_select" on public.questions for select using (public.is_admin());
create policy "questions_write_admin" on public.questions for insert with check (public.is_admin());
create policy "questions_update_admin" on public.questions for update using (public.is_admin());
create policy "questions_delete_admin" on public.questions for delete using (public.is_admin());

-- results: faqat admin ko'radi/o'chiradi, yozish faqat submit-result edge function (service_role) orqali
create policy "results_admin_select" on public.results for select using (public.is_admin());
create policy "results_delete_admin" on public.results for delete using (public.is_admin());

-- settings: hamma o'qiy oladi (test-setup uchun kerak), faqat admin yozadi
create policy "settings_select_all" on public.settings for select using (true);
create policy "settings_update_admin" on public.settings for update using (public.is_admin());

-- app_secrets: hech kim (anon ham, admin ham) to'g'ridan-to'g'ri o'qiy olmaydi — faqat Edge Function service_role orqali
-- (RLS yoqilgan va hech qanday policy yo'q => hamma so'rovlar rad etiladi, service_role RLS'ni chetlab o'tadi)
