create table public.student_auth (
  student_id uuid primary key references public.students(id) on delete cascade,
  pin_hash text,
  pin_attempts int not null default 0,
  pin_locked_until timestamptz
);
alter table public.student_auth enable row level security;
-- Hech qanday policy qo'shilmaydi — faqat service_role (Edge Function) va SECURITY DEFINER RPC orqali kirish mumkin

create table public.student_sessions (
  token text primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.student_sessions enable row level security;
-- Hech qanday policy qo'shilmaydi — faqat service_role (Edge Function) orqali kirish mumkin

create index student_sessions_student_id_idx on public.student_sessions (student_id);

-- Admin uchun: PIN yaratish/qayta tiklash. Tasodifiy 4 xonali kod qaytaradi (faqat shu chaqiruvda ko'rinadi, keyin faqat xeshi saqlanadi).
create or replace function public.admin_reset_student_pin(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pin text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  new_pin := lpad((floor(random()*10000))::text, 4, '0');
  insert into public.student_auth (student_id, pin_hash, pin_attempts, pin_locked_until)
  values (p_student_id, extensions.crypt(new_pin, extensions.gen_salt('bf')), 0, null)
  on conflict (student_id) do update
    set pin_hash = excluded.pin_hash, pin_attempts = 0, pin_locked_until = null;
  return new_pin;
end;
$$;
revoke execute on function public.admin_reset_student_pin(uuid) from public, anon;
grant execute on function public.admin_reset_student_pin(uuid) to authenticated;
