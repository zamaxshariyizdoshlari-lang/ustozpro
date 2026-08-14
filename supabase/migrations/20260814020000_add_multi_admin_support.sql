-- Ko'p-adminlik: is_admin() endi bitta qattiq kodlangan UUID emas, admin_accounts
-- jadvalidan tekshiradi. Hozirgi admin shu jadvalga bir martalik ko'chiriladi
-- (orqaga moslik — mavjud admin hech narsa sezmasdan ishlashda davom etadi).
create table public.admin_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_accounts enable row level security;
-- Hech qanday policy yo'q — faqat SECURITY DEFINER RPC orqali kirish mumkin

insert into public.admin_accounts (id, full_name)
select id, 'Administrator' from auth.users where id = '4b7fbd98-a9ff-450b-8cd2-d8ba6ac3e0bd'::uuid
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_accounts where id = auth.uid())
$$;

-- Yangi admin yaratish (teachers naqshiga o'xshab, bootstrap texnikasi bilan)
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

  return new_id;
end;
$$;
revoke execute on function public.admin_create_admin(text, text, text) from public, anon;
grant execute on function public.admin_create_admin(text, text, text) to authenticated;

create or replace function public.admin_list_admins()
returns table(id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select a.id, a.full_name, u.email::text
  from public.admin_accounts a
  join auth.users u on u.id = a.id
  where public.is_admin()
  order by a.full_name
$$;
revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

-- O'zini-o'zi o'chirish va oxirgi adminni o'chirish taqiqlanadi — admin hisobisiz qolib ketmaslik uchun
create or replace function public.admin_delete_admin(p_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_admin_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if (select count(*) from public.admin_accounts) <= 1 then raise exception 'cannot_delete_last_admin'; end if;
  delete from auth.users where id = p_admin_id and exists(select 1 from public.admin_accounts where id = p_admin_id);
end;
$$;
revoke execute on function public.admin_delete_admin(uuid) from public, anon;
grant execute on function public.admin_delete_admin(uuid) to authenticated;
