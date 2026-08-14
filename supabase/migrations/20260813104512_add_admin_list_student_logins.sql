create or replace function public.admin_list_student_logins()
returns table(student_id uuid, login text)
language sql stable security definer set search_path = public as $$
  select sa.student_id, sa.login from public.student_accounts sa where public.is_admin()
$$;
revoke execute on function public.admin_list_student_logins() from public, anon;
grant execute on function public.admin_list_student_logins() to authenticated;
