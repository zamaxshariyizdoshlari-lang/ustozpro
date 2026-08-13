-- Edge Function'lar (service_role) uchun bcrypt taqqoslash yordamchisi.
-- O'zi hech qanday jadvalni o'qimaydi — faqat berilgan hash/pin juftligini solishtiradi.
create or replace function public.verify_pin_hash(p_hash text, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_hash is not null and p_hash = extensions.crypt(p_pin, p_hash)
$$;
revoke execute on function public.verify_pin_hash(text, text) from public, anon, authenticated;
grant execute on function public.verify_pin_hash(text, text) to service_role;
