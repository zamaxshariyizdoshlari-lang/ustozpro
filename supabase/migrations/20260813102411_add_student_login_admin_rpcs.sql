create or replace function public.admin_create_student_login(p_student_id uuid)
returns table(login text, password text)
language plpgsql security definer set search_path = public as $$
declare
  v_full_name text;
  v_base_login text;
  v_login text;
  v_password text;
  v_suffix int := 1;
  v_new_id uuid;
  v_charset text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  i int;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  select full_name into v_full_name from public.students where id = p_student_id;
  if v_full_name is null then raise exception 'student_not_found'; end if;

  if exists(select 1 from public.student_accounts where student_id = p_student_id) then
    raise exception 'already_has_account';
  end if;

  v_base_login := lower(translate(v_full_name, '''ʻ''`', ''));
  v_base_login := regexp_replace(v_base_login, '\s+', '.', 'g');
  v_base_login := regexp_replace(v_base_login, '[^a-z0-9.]', '', 'g');
  v_login := v_base_login;
  while exists(select 1 from public.student_accounts where login = v_login) loop
    v_suffix := v_suffix + 1;
    v_login := v_base_login || v_suffix::text;
  end loop;

  v_password := '';
  for i in 1..8 loop
    v_password := v_password || substr(v_charset, (floor(random() * length(v_charset)) + 1)::int, 1);
  end loop;

  v_new_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_new_id, 'authenticated', 'authenticated', v_login || '@ustozpro.local',
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(), now(), now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    false, false, false
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_new_id, v_new_id::text,
    jsonb_build_object('sub', v_new_id::text, 'email', v_login || '@ustozpro.local', 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.student_accounts (id, student_id, login) values (v_new_id, p_student_id, v_login);

  return query select v_login, v_password;
end;
$$;
revoke execute on function public.admin_create_student_login(uuid) from public, anon;
grant execute on function public.admin_create_student_login(uuid) to authenticated;

create or replace function public.admin_bulk_create_student_logins()
returns table(student_id uuid, full_name text, class_name text, login text, password text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  res record;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  for r in
    select st.id, st.full_name, c.name as class_name
    from public.students st
    join public.classes c on c.id = st.class_id
    where not exists (select 1 from public.student_accounts sa where sa.student_id = st.id)
    order by c.name, st.full_name
  loop
    select * into res from public.admin_create_student_login(r.id);
    student_id := r.id;
    full_name := r.full_name;
    class_name := r.class_name;
    login := res.login;
    password := res.password;
    return next;
  end loop;
end;
$$;
revoke execute on function public.admin_bulk_create_student_logins() from public, anon;
grant execute on function public.admin_bulk_create_student_logins() to authenticated;

create or replace function public.admin_reset_student_password(p_student_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = (select id from public.student_accounts where student_id = p_student_id);
  if not found then raise exception 'student_account_not_found'; end if;
end;
$$;
revoke execute on function public.admin_reset_student_password(uuid, text) from public, anon;
grant execute on function public.admin_reset_student_password(uuid, text) to authenticated;
