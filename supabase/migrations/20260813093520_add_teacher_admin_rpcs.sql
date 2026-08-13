-- Yangi o'qituvchi yaratish: auth.users + auth.identities (bootstrap-admin bilan bir xil texnika) + teachers + teacher_subjects
create or replace function public.admin_create_teacher(
  p_full_name text, p_email text, p_password text, p_subject_names text[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  s text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_full_name is null or trim(p_full_name) = '' then raise exception 'full_name_required'; end if;
  if p_email is null or trim(p_email) = '' then raise exception 'email_required'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'password_too_short'; end if;

  new_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', lower(trim(p_email)),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    false, false, false
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), new_id, new_id::text,
    jsonb_build_object('sub', new_id::text, 'email', lower(trim(p_email)), 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.teachers (id, full_name) values (new_id, trim(p_full_name));

  foreach s in array coalesce(p_subject_names, '{}') loop
    insert into public.teacher_subjects (teacher_id, subject_name) values (new_id, s)
    on conflict (teacher_id, subject_name) do nothing;
  end loop;

  return new_id;
end;
$$;
revoke execute on function public.admin_create_teacher(text, text, text, text[]) from public, anon;
grant execute on function public.admin_create_teacher(text, text, text, text[]) to authenticated;

-- Parolni tiklash
create or replace function public.admin_reset_teacher_password(p_teacher_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_teacher_id and exists(select 1 from public.teachers where id = p_teacher_id);
  if not found then raise exception 'teacher_not_found'; end if;
end;
$$;
revoke execute on function public.admin_reset_teacher_password(uuid, text) from public, anon;
grant execute on function public.admin_reset_teacher_password(uuid, text) to authenticated;

-- Fanlarni almashtirish (mavjudlarini o'chirib, yangilarini qo'shadi)
create or replace function public.admin_set_teacher_subjects(p_teacher_id uuid, p_subject_names text[])
returns void
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.teachers where id = p_teacher_id) then raise exception 'teacher_not_found'; end if;
  delete from public.teacher_subjects where teacher_id = p_teacher_id;
  foreach s in array coalesce(p_subject_names, '{}') loop
    insert into public.teacher_subjects (teacher_id, subject_name) values (p_teacher_id, s)
    on conflict (teacher_id, subject_name) do nothing;
  end loop;
end;
$$;
revoke execute on function public.admin_set_teacher_subjects(uuid, text[]) from public, anon;
grant execute on function public.admin_set_teacher_subjects(uuid, text[]) to authenticated;

-- O'qituvchini butunlay o'chirish (auth.users'dan ham — login butunlay ishlamay qoladi)
create or replace function public.admin_delete_teacher(p_teacher_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  delete from auth.users where id = p_teacher_id and exists(select 1 from public.teachers where id = p_teacher_id);
end;
$$;
revoke execute on function public.admin_delete_teacher(uuid) from public, anon;
grant execute on function public.admin_delete_teacher(uuid) to authenticated;

-- Admin panelda ro'yxat uchun
create or replace function public.admin_list_teachers()
returns table(id uuid, full_name text, email text, subject_names text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.full_name, u.email::text,
         coalesce(array_agg(ts.subject_name order by ts.subject_name) filter (where ts.subject_name is not null), '{}')
  from public.teachers t
  join auth.users u on u.id = t.id
  left join public.teacher_subjects ts on ts.teacher_id = t.id
  where public.is_admin()
  group by t.id, t.full_name, u.email
  order by t.full_name
$$;
revoke execute on function public.admin_list_teachers() from public, anon;
grant execute on function public.admin_list_teachers() to authenticated;
