-- Edge Function'lar (service_role) parolni bcrypt bilan xeshlashi uchun
-- yordamchi — pgcrypto'ga to'g'ridan-to'g'ri PostgREST orqali kirish yo'q,
-- shuning uchun kichik funksiya sifatida o'raymiz.
create or replace function public._hash_password(p_password text)
returns text
language sql stable security definer set search_path = public as $$
  select extensions.crypt(p_password, extensions.gen_salt('bf'))
$$;
revoke execute on function public._hash_password(text) from public, anon, authenticated;
