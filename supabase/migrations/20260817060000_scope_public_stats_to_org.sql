-- XATOLIK TUZATISH: get_public_stats() barcha tashkilotlar bo'yicha
-- umumlashtirilgan statistikani (jami test, o'rtacha ball) qaytarardi —
-- bu kichik, lekin haqiqiy tashkilotlar-aro ma'lumot sizishi edi
-- (yangi tashkilot boshqa maktabning faollik ma'lumotini ko'rar edi).
create or replace function public.get_public_stats()
returns table(total_tests bigint, avg_percent integer)
language sql stable security definer set search_path = public as $$
  select count(*)::bigint as total_tests,
         coalesce(round(avg(percent))::int, 0) as avg_percent
  from public.results
  where org_id = public._my_org_id()
$$;
