-- audit_log: kim, qachon, qanday muhim harakat qilganini yozib boradi.
-- Faqat admin o'qiy oladi; yozish faqat _log_action() ichki yordamchisi orqali
-- (u boshqa SECURITY DEFINER funksiyalar ichidan chaqiriladi, funksiya egasi
-- huquqi bilan ishlaydi — chaqiruvchiga alohida EXECUTE grant kerak emas,
-- _compute_monthly_rating naqshi bilan bir xil).
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  target_info jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy "audit_log_select_admin" on public.audit_log for select using (public.is_admin());

create or replace function public._log_action(p_action text, p_target_info jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_role, action, target_info)
  values (
    auth.uid(),
    case when public.is_admin() then 'admin' when public.is_teacher() then 'teacher' else 'unknown' end,
    p_action, p_target_info
  );
end;
$$;
revoke execute on function public._log_action(text, jsonb) from public, anon, authenticated;

-- Frontend to'g'ridan-to'g'ri (RPC bilan o'ralmagan) o'chirishlar uchun ham log yoza olsin
-- (masalan sinf/o'quvchi/fan o'chirish — bular RLS orqali to'g'ridan-to'g'ri jadvaldan o'chiriladi)
create or replace function public.admin_log_event(p_action text, p_target_info jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  perform public._log_action(p_action, p_target_info);
end;
$$;
revoke execute on function public.admin_log_event(text, jsonb) from public, anon;
grant execute on function public.admin_log_event(text, jsonb) to authenticated;

create or replace function public.admin_list_audit_log(p_limit int default 200)
returns table(id uuid, actor_id uuid, actor_role text, action text, target_info jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, actor_id, actor_role, action, target_info, created_at
  from public.audit_log
  where public.is_admin()
  order by created_at desc
  limit greatest(1, least(p_limit, 500))
$$;
revoke execute on function public.admin_list_audit_log(int) from public, anon;
grant execute on function public.admin_list_audit_log(int) to authenticated;

-- ═══ Mavjud admin/o'qituvchi/o'quvchi RPC'lariga log chaqiruvi qo'shish ═══

create or replace function public.admin_create_teacher(
  p_full_name text, p_email text, p_password text, p_subject_names text[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  s text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
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

  perform public._log_action('create_teacher', jsonb_build_object('teacher_id', new_id, 'full_name', p_full_name, 'subjects', p_subject_names));
  return new_id;
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
  perform public._log_action('reset_teacher_password', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;

create or replace function public.admin_delete_teacher(p_teacher_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  delete from auth.users where id = p_teacher_id and exists(select 1 from public.teachers where id = p_teacher_id);
  perform public._log_action('delete_teacher', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;

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
  while exists(select 1 from public.student_accounts sa where sa.login = v_login) loop
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

  perform public._log_action('create_student_login', jsonb_build_object('student_id', p_student_id, 'login', v_login));
  return query select v_login, v_password;
end;
$$;

create or replace function public.admin_reset_student_password(p_student_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = (select id from public.student_accounts where student_id = p_student_id);
  if not found then raise exception 'student_account_not_found'; end if;
  perform public._log_action('reset_student_password', jsonb_build_object('student_id', p_student_id));
end;
$$;

create or replace function public.admin_create_admin(
  p_full_name text, p_email text, p_password text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
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

  insert into public.admin_accounts (id, full_name) values (new_id, trim(p_full_name));

  perform public._log_action('create_admin', jsonb_build_object('admin_id', new_id, 'full_name', p_full_name));
  return new_id;
end;
$$;

create or replace function public.admin_delete_admin(p_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_admin_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if (select count(*) from public.admin_accounts) <= 1 then raise exception 'cannot_delete_last_admin'; end if;
  delete from auth.users where id = p_admin_id and exists(select 1 from public.admin_accounts where id = p_admin_id);
  perform public._log_action('delete_admin', jsonb_build_object('admin_id', p_admin_id));
end;
$$;
