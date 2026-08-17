-- ═══════════════════════════════════════════════════════════════
-- MULTI-TENANT SAAS — 4-BOSQICH: ADMIN RPC'LARNI ORG-AWARE QAYTA YOZISH
-- is_admin() endi yetarli emas — u faqat "kimdir admin_accounts'da
-- bormi"ni tekshiradi, org_id'ga qaramaydi. Har bir admin RPC endi
-- chaqiruvchining o'z org_id'sini _my_org_id() orqali aniqlaydi va
-- BARCHA o'qish/yozish/o'chirishni shu org_id bilan cheklaydi — aks
-- holda org-A admini org-B'ning o'quvchi/o'qituvchi/admin qatorlarini
-- ID orqali to'g'ridan-to'g'ri boshqarib qo'yishi mumkin edi.
-- ═══════════════════════════════════════════════════════════════

create or replace function public._my_org_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.admin_accounts where id = auth.uid()
$$;
revoke execute on function public._my_org_id() from public, anon;
grant execute on function public._my_org_id() to authenticated;

create or replace function public._log_action(p_action text, p_target_info jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  insert into public.audit_log (org_id, actor_id, actor_role, action, target_info)
  values (v_org_id, auth.uid(), 'admin', p_action, p_target_info);
end;
$$;

create or replace function public.admin_create_student_login(p_student_id uuid)
returns table(login text, password text)
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_full_name text;
  v_base_login text;
  v_login text;
  v_password text;
  v_suffix int := 1;
  v_new_id uuid;
  v_charset text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  i int;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;

  select full_name into v_full_name from public.students where id = p_student_id and org_id = v_org_id;
  if v_full_name is null then raise exception 'student_not_found'; end if;

  if exists(select 1 from public.student_accounts where student_id = p_student_id) then
    raise exception 'already_has_account';
  end if;

  v_base_login := lower(translate(v_full_name, '''ʻ''`', ''));
  v_base_login := regexp_replace(v_base_login, '\s+', '.', 'g');
  v_base_login := regexp_replace(v_base_login, '[^a-z0-9.]', '', 'g');
  v_login := v_base_login;
  while exists(select 1 from public.student_accounts sa where sa.org_id = v_org_id and sa.login = v_login) loop
    v_suffix := v_suffix + 1;
    v_login := v_base_login || v_suffix::text;
  end loop;

  v_password := '';
  for i in 1..8 loop
    v_password := v_password || substr(v_charset, (floor(random() * length(v_charset)) + 1)::int, 1);
  end loop;

  v_new_id := gen_random_uuid();
  insert into public.student_accounts (id, org_id, student_id, login, password_hash, must_change_password)
  values (v_new_id, v_org_id, p_student_id, v_login, public._hash_password(v_password), true);

  perform public._log_action('create_student_login', jsonb_build_object('student_id', p_student_id, 'login', v_login));
  return query select v_login, v_password;
end;
$$;

create or replace function public.admin_bulk_create_student_logins()
returns table(student_id uuid, full_name text, class_name text, login text, password text)
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  r record;
  res record;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  for r in
    select st.id, st.full_name, c.name as class_name
    from public.students st
    join public.classes c on c.id = st.class_id
    where st.org_id = v_org_id and not exists (select 1 from public.student_accounts sa where sa.student_id = st.id)
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

create or replace function public.admin_reset_student_password(p_student_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update public.student_accounts
  set password_hash = public._hash_password(p_new_password), must_change_password = true
  where student_id = p_student_id and org_id = v_org_id;
  if not found then raise exception 'student_account_not_found'; end if;
  delete from public.custom_sessions cs
  using public.student_accounts sa
  where sa.student_id = p_student_id and sa.org_id = v_org_id and cs.role = 'student' and cs.account_id = sa.id;
  perform public._log_action('reset_student_password', jsonb_build_object('student_id', p_student_id));
end;
$$;

create or replace function public.admin_create_teacher(
  p_full_name text, p_email text, p_password text, p_subject_names text[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  new_id uuid;
  s text;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  if p_full_name is null or trim(p_full_name) = '' then raise exception 'full_name_required'; end if;
  if p_email is null or trim(p_email) = '' then raise exception 'login_required'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'password_too_short'; end if;

  new_id := gen_random_uuid();
  insert into public.teachers (id, org_id, full_name, login, password_hash, must_change_password)
  values (new_id, v_org_id, trim(p_full_name), lower(trim(p_email)), public._hash_password(p_password), true);

  foreach s in array coalesce(p_subject_names, '{}') loop
    insert into public.teacher_subjects (teacher_id, org_id, subject_name) values (new_id, v_org_id, s)
    on conflict (teacher_id, subject_name) do nothing;
  end loop;

  perform public._log_action('create_teacher', jsonb_build_object('teacher_id', new_id, 'full_name', p_full_name, 'subjects', p_subject_names));
  return new_id;
end;
$$;

create or replace function public.admin_reset_teacher_password(p_teacher_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 6 then raise exception 'password_too_short'; end if;
  update public.teachers
  set password_hash = public._hash_password(p_new_password), must_change_password = true
  where id = p_teacher_id and org_id = v_org_id;
  if not found then raise exception 'teacher_not_found'; end if;
  delete from public.custom_sessions where role = 'teacher' and account_id = p_teacher_id;
  perform public._log_action('reset_teacher_password', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;

create or replace function public.admin_delete_teacher(p_teacher_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  delete from public.custom_sessions where role = 'teacher' and account_id = p_teacher_id;
  delete from public.teachers where id = p_teacher_id and org_id = v_org_id;
  perform public._log_action('delete_teacher', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;

create or replace function public.admin_set_teacher_subjects(p_teacher_id uuid, p_subject_names text[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; s text;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.teachers where id = p_teacher_id and org_id = v_org_id) then raise exception 'teacher_not_found'; end if;
  delete from public.teacher_subjects where teacher_id = p_teacher_id;
  foreach s in array coalesce(p_subject_names, '{}') loop
    insert into public.teacher_subjects (teacher_id, org_id, subject_name) values (p_teacher_id, v_org_id, s)
    on conflict (teacher_id, subject_name) do nothing;
  end loop;
end;
$$;

create or replace function public.admin_list_teachers()
returns table(id uuid, full_name text, login text, subject_names text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.full_name, t.login,
         coalesce(array_agg(ts.subject_name order by ts.subject_name) filter (where ts.subject_name is not null), '{}')
  from public.teachers t
  left join public.teacher_subjects ts on ts.teacher_id = t.id
  where t.org_id = public._my_org_id()
  group by t.id, t.full_name, t.login
  order by t.full_name
$$;

create or replace function public.admin_list_student_logins()
returns table(student_id uuid, login text)
language sql stable security definer set search_path = public as $$
  select sa.student_id, sa.login from public.student_accounts sa where sa.org_id = public._my_org_id()
$$;

create or replace function public.admin_list_audit_log(p_limit integer default 200)
returns table(id uuid, actor_id uuid, actor_role text, action text, target_info jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, actor_id, actor_role, action, target_info, created_at
  from public.audit_log
  where org_id = public._my_org_id()
  order by created_at desc
  limit greatest(1, least(p_limit, 500))
$$;

create or replace function public.admin_create_admin(
  p_full_name text, p_email text, p_password text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  new_id uuid;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
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

  insert into public.admin_accounts (id, org_id, full_name) values (new_id, v_org_id, trim(p_full_name));

  perform public._log_action('create_admin', jsonb_build_object('admin_id', new_id, 'full_name', p_full_name));
  return new_id;
end;
$$;

-- MUHIM XAVFSIZLIK TUZATISHI: avvalgi versiya p_admin_id qaysi org'ga
-- tegishli ekanini UMUMAN tekshirmasdan auth.users'dan o'chirar edi —
-- org-A admini org-B'ning istalgan adminini ID orqali o'chira olardi.
create or replace function public.admin_delete_admin(p_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  v_org_id := public._my_org_id();
  if v_org_id is null then raise exception 'not authorized'; end if;
  if p_admin_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if not exists(select 1 from public.admin_accounts where id = p_admin_id and org_id = v_org_id) then
    raise exception 'admin_not_found';
  end if;
  if (select count(*) from public.admin_accounts where org_id = v_org_id) <= 1 then raise exception 'cannot_delete_last_admin'; end if;
  delete from auth.users where id = p_admin_id;
  perform public._log_action('delete_admin', jsonb_build_object('admin_id', p_admin_id));
end;
$$;

create or replace function public.admin_list_admins()
returns table(id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select a.id, a.full_name, u.email::text
  from public.admin_accounts a
  join auth.users u on u.id = a.id
  where a.org_id = public._my_org_id()
  order by a.full_name
$$;
