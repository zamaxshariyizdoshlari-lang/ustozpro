-- Admin panelida tashkilot nomini ko'rsatish uchun — admin o'z org_id/nomini
-- o'qiy oladigan yagona yo'l (organizations jadvalida to'g'ridan-to'g'ri RLS
-- siyosati yo'q — faqat platform_admin uni ko'radi).
create or replace function public.admin_my_org()
returns table(id uuid, name text, slug text, status text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.slug, o.status
  from public.organizations o
  join public.admin_accounts a on a.org_id = o.id
  where a.id = auth.uid()
$$;
revoke execute on function public.admin_my_org() from public, anon;
grant execute on function public.admin_my_org() to authenticated;
