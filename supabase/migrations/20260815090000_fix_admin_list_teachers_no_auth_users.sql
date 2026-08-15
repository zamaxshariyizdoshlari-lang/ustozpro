-- admin_list_teachers() hali ham auth.users'ga JOIN qilardi (u.email) — lekin
-- o'qituvchilar endi auth.users'da umuman yo'q (Phase 6-oldi migratsiyada
-- o'chirilgan), shu sabab bu funksiya doim BO'SH natija qaytarardi. Endi
-- to'g'ridan-to'g'ri teachers.login'dan o'qiydi, hech qanday join shart emas.
-- Qaytariladigan ustun nomi "email"dan "login"ga o'zgardi (chunki bu endi
-- haqiqiy email bo'lishi shart emas) — frontend ham shunga moslashtiriladi.

drop function if exists public.admin_list_teachers();

create function public.admin_list_teachers()
returns table(id uuid, full_name text, login text, subject_names text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.full_name, t.login,
         coalesce(array_agg(ts.subject_name order by ts.subject_name) filter (where ts.subject_name is not null), '{}')
  from public.teachers t
  left join public.teacher_subjects ts on ts.teacher_id = t.id
  where public.is_admin()
  group by t.id, t.full_name, t.login
  order by t.full_name
$$;
revoke execute on function public.admin_list_teachers() from public, anon;
grant execute on function public.admin_list_teachers() to authenticated;
