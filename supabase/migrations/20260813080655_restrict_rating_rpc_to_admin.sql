-- Postgres funksiya yaratilganda EXECUTE avtomatik PUBLIC'ga beriladi;
-- buni bekor qilib, faqat "authenticated" (bitta admin) uchun qoldiramiz.
revoke execute on function public.get_rating_formula_info(text) from public, anon;
revoke execute on function public.get_monthly_rating(text, text) from public, anon;
revoke execute on function public.get_mutolaa_rating(text) from public, anon;
grant execute on function public.get_rating_formula_info(text) to authenticated;
grant execute on function public.get_monthly_rating(text, text) to authenticated;
grant execute on function public.get_mutolaa_rating(text) to authenticated;
