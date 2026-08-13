create table public.teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
-- Hech qanday policy yo'q — faqat SECURITY DEFINER RPC orqali kirish mumkin

create table public.teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_name text not null,
  unique(teacher_id, subject_name)
);
alter table public.teacher_subjects enable row level security;
-- Hech qanday policy yo'q — faqat SECURITY DEFINER RPC orqali kirish mumkin

create index teacher_subjects_teacher_id_idx on public.teacher_subjects (teacher_id);

-- Berilgan fan nomi bo'yicha joriy foydalanuvchi shu fan o'qituvchisimi
create or replace function public.is_teacher_for_subject(p_subject_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teacher_subjects ts
    join public.teachers t on t.id = ts.teacher_id
    where t.id = auth.uid() and ts.subject_name = p_subject_name
  )
$$;
revoke execute on function public.is_teacher_for_subject(text) from public;
grant execute on function public.is_teacher_for_subject(text) to anon, authenticated;

-- questions.subject_id orqali: admin YOKI shu fan o'qituvchisi boshqara oladimi
create or replace function public.can_manage_subject(p_subject_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_teacher_for_subject(
    (select s.name from public.subjects s where s.id = p_subject_id)
  )
$$;
revoke execute on function public.can_manage_subject(uuid) from public;
grant execute on function public.can_manage_subject(uuid) to anon, authenticated;

-- Joriy foydalanuvchi umuman o'qituvchimi (frontend login branching uchun)
create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.teachers where id = auth.uid())
$$;
revoke execute on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

-- Login'dan keyin frontend "men kimman" deb shu RPC'ni chaqiradi
create or replace function public.get_my_teacher_info()
returns table(full_name text, subject_names text[])
language sql stable security definer set search_path = public as $$
  select t.full_name, coalesce(array_agg(ts.subject_name order by ts.subject_name) filter (where ts.subject_name is not null), '{}')
  from public.teachers t
  left join public.teacher_subjects ts on ts.teacher_id = t.id
  where t.id = auth.uid()
  group by t.full_name
$$;
revoke execute on function public.get_my_teacher_info() from public, anon;
grant execute on function public.get_my_teacher_info() to authenticated;
