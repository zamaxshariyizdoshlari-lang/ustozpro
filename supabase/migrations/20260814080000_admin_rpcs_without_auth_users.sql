-- Admin RPC'lari endi auth.users/auth.identities'ga umuman tegmaydi — parol
-- to'g'ridan-to'g'ri student_accounts/teachers.password_hash'ga (_hash_password()
-- yordamida) yoziladi. Parol tiklanganda/hisob o'chirilganda tegishli
-- custom_sessions qatorlari ham tozalanadi — darhol chiqib ketishni ta'minlash uchun.

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
  insert into public.student_accounts (id, student_id, login, password_hash, must_change_password)
  values (v_new_id, p_student_id, v_login, public._hash_password(v_password), true);

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
  update public.student_accounts
  set password_hash = public._hash_password(p_new_password), must_change_password = true
  where student_id = p_student_id;
  if not found then raise exception 'student_account_not_found'; end if;
  delete from public.custom_sessions cs
  using public.student_accounts sa
  where sa.student_id = p_student_id and cs.role = 'student' and cs.account_id = sa.id;
  perform public._log_action('reset_student_password', jsonb_build_object('student_id', p_student_id));
end;
$$;

-- p_email parametri endi haqiqiy email bo'lishi shart emas — shunchaki login (masalan
-- o'qituvchining o'zi tanlagan yoki mavjud email'i). Nom o'zgarishsiz qoldirildi (turi
-- bir xil bo'lgani uchun CREATE OR REPLACE ishlaydi), faqat ma'no kengaydi.
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
  if p_email is null or trim(p_email) = '' then raise exception 'login_required'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'password_too_short'; end if;

  new_id := gen_random_uuid();
  insert into public.teachers (id, full_name, login, password_hash, must_change_password)
  values (new_id, trim(p_full_name), lower(trim(p_email)), public._hash_password(p_password), true);

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
  update public.teachers
  set password_hash = public._hash_password(p_new_password), must_change_password = true
  where id = p_teacher_id;
  if not found then raise exception 'teacher_not_found'; end if;
  delete from public.custom_sessions where role = 'teacher' and account_id = p_teacher_id;
  perform public._log_action('reset_teacher_password', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;

create or replace function public.admin_delete_teacher(p_teacher_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  delete from public.custom_sessions where role = 'teacher' and account_id = p_teacher_id;
  delete from public.teachers where id = p_teacher_id;
  perform public._log_action('delete_teacher', jsonb_build_object('teacher_id', p_teacher_id));
end;
$$;
