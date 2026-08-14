create table public.student_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id uuid not null unique references public.students(id) on delete cascade,
  login text not null unique,
  created_at timestamptz not null default now()
);
alter table public.student_accounts enable row level security;
-- Hech qanday policy yo'q — faqat SECURITY DEFINER RPC orqali kirish mumkin

create index student_accounts_student_id_idx on public.student_accounts (student_id);

create or replace function public.is_student()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.student_accounts where id = auth.uid())
$$;
revoke execute on function public.is_student() from public, anon;
grant execute on function public.is_student() to authenticated;

create or replace function public.get_my_student_info()
returns table(student_id uuid, full_name text, class_name text, login text)
language sql stable security definer set search_path = public as $$
  select st.id, st.full_name, c.name, sa.login
  from public.student_accounts sa
  join public.students st on st.id = sa.student_id
  join public.classes c on c.id = st.class_id
  where sa.id = auth.uid()
$$;
revoke execute on function public.get_my_student_info() from public, anon;
grant execute on function public.get_my_student_info() to authenticated;

-- results uchun: joriy foydalanuvchi shu natijaning egasi ekanini tekshiradi
create or replace function public.is_own_result(p_student_name text, p_class_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.student_accounts sa
    join public.students st on st.id = sa.student_id
    join public.classes c on c.id = st.class_id
    where sa.id = auth.uid() and st.full_name = p_student_name and c.name = p_class_name
  )
$$;
revoke execute on function public.is_own_result(text, text) from public;
grant execute on function public.is_own_result(text, text) to anon, authenticated;
