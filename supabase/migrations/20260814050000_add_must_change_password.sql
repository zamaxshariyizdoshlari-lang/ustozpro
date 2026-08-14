-- Admin bergan (yoki tiklagan) parolni o'quvchi/o'qituvchi birinchi kirishda
-- almashtirishga majburlash uchun bayroq.
alter table public.student_accounts add column must_change_password boolean not null default true;
alter table public.teachers add column must_change_password boolean not null default true;

-- Qaytariladigan ustunlar to'plami o'zgargani uchun CREATE OR REPLACE yetarli emas
-- (Postgres funksiya qaytarish turini shu yo'l bilan o'zgartirishga ruxsat bermaydi)
drop function if exists public.get_my_student_info();
create function public.get_my_student_info()
returns table(student_id uuid, full_name text, class_name text, login text, must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select st.id, st.full_name, c.name, sa.login, sa.must_change_password
  from public.student_accounts sa
  join public.students st on st.id = sa.student_id
  join public.classes c on c.id = st.class_id
  where sa.id = auth.uid()
$$;
revoke execute on function public.get_my_student_info() from public, anon;
grant execute on function public.get_my_student_info() to authenticated;

drop function if exists public.get_my_teacher_info();
create function public.get_my_teacher_info()
returns table(full_name text, subject_names text[], must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select t.full_name,
         coalesce(array_agg(ts.subject_name order by ts.subject_name) filter (where ts.subject_name is not null), '{}'),
         t.must_change_password
  from public.teachers t
  left join public.teacher_subjects ts on ts.teacher_id = t.id
  where t.id = auth.uid()
  group by t.full_name, t.must_change_password
$$;
revoke execute on function public.get_my_teacher_info() from public, anon;
grant execute on function public.get_my_teacher_info() to authenticated;

-- Parolni o'zi almashtirgach, bayroqni o'chiradi (o'zining hisobiga cheklangan)
create or replace function public.mark_password_changed()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.student_accounts set must_change_password = false where id = auth.uid();
  update public.teachers set must_change_password = false where id = auth.uid();
end;
$$;
revoke execute on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

-- Admin qayta tiklagan parol ham "vaqtinchalik" hisoblanadi — yana majburiy almashtirish talab qilinadi
create or replace function public.admin_reset_student_password(p_student_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = (select id from public.student_accounts where student_id = p_student_id);
  if not found then raise exception 'student_account_not_found'; end if;
  update public.student_accounts set must_change_password = true where student_id = p_student_id;
  perform public._log_action('reset_student_password', jsonb_build_object('student_id', p_student_id));
end;
$$;

create or replace function public.admin_reset_teacher_password(p_teacher_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_teacher_id and exists(select 1 from public.teachers where id = p_teacher_id);
  if not found then raise exception 'teacher_not_found'; end if;
  update public.teachers set must_change_password = true where id = p_teacher_id;
  perform public._log_action('reset_teacher_password', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;
