-- Edge Function'lar (service_role) uchun yangi PIN'ni xeshlash yordamchisi.
create or replace function public.hash_pin(p_pin text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select extensions.crypt(p_pin, extensions.gen_salt('bf'))
$$;
revoke execute on function public.hash_pin(text) from public, anon, authenticated;
grant execute on function public.hash_pin(text) to service_role;
