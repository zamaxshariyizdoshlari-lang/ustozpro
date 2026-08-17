-- Reyting funksiyasi mahsulotdan butunlay olib tashlandi (foydalanuvchi bilan
-- aniq kelishilgan qaror) — yangi ko'p-tashkilotli sxemaga ko'chirilmaydi.
drop function if exists public.get_monthly_rating(text, text);
drop function if exists public.get_mutolaa_rating(text);
drop function if exists public.get_rating_formula_info(text);
drop function if exists public.get_my_rating();
drop function if exists public._compute_monthly_rating(text, text);
drop function if exists public._compute_mutolaa_rating(text);
