-- Endi "authenticated" o'qituvchilarni ham o'z ichiga oladi, shuning uchun bu uchta
-- funksiyani DB darajasida ham faqat haqiqiy admin (is_admin()) uchun cheklaymiz —
-- teacher chaqirsa bo'sh natija qaytadi, xato emas (UI buzilmaydi).
create or replace function public.get_rating_formula_info(p_class text default null)
returns table(total_non_mut_subjects int, coeff numeric, mut_total int, mut_coeff numeric)
language sql stable security definer set search_path = public as $$
  select * from (
    with base as (
      select * from public.results r where (p_class is null or r.class_name = p_class)
    ),
    non_mut as (select distinct subject_name from base where subject_name <> 'Mutolaa'),
    mut as (select distinct subject_name from base where subject_name = 'Mutolaa')
    select
      (select count(*) from non_mut)::int as total_non_mut_subjects,
      case when (select count(*) from non_mut) > 0 then 1200.0 / (select count(*) from non_mut) else 0 end as coeff,
      greatest((select count(*) from mut)::int, 1) as mut_total,
      2000.0 / greatest((select count(*) from mut)::int, 1) as mut_coeff
  ) x where public.is_admin()
$$;

create or replace function public.get_monthly_rating(p_class text default null, p_subject text default null)
returns table(student_name text, class_name text, total_correct bigint, rating_score int)
language sql stable security definer set search_path = public as $$
  select * from (
    with base as (
      select * from public.results r where (p_class is null or r.class_name = p_class)
    ),
    non_mut as (select distinct subject_name from base where subject_name <> 'Mutolaa'),
    coeff as (select case when count(*) > 0 then 1200.0 / count(*) else 0 end as v from non_mut),
    scored as (
      select r.student_name, r.class_name, sum(r.score) as total_correct
      from base r
      where r.subject_name <> 'Mutolaa' and (p_subject is null or r.subject_name = p_subject)
      group by r.student_name, r.class_name
    )
    select s.student_name, s.class_name, s.total_correct,
           round(s.total_correct * (select v from coeff))::int as rating_score
    from scored s
    order by rating_score desc
  ) x where public.is_admin()
$$;

create or replace function public.get_mutolaa_rating(p_class text default null)
returns table(student_name text, class_name text, mut_correct bigint, mut_score int)
language sql stable security definer set search_path = public as $$
  select * from (
    with base as (
      select * from public.results r
      where (p_class is null or r.class_name = p_class) and r.subject_name = 'Mutolaa'
    ),
    mut_total as (select greatest(count(distinct subject_name), 1) as v from base),
    scored as (
      select student_name, class_name, sum(score) as mut_correct from base group by student_name, class_name
    )
    select s.student_name, s.class_name, s.mut_correct,
           round(s.mut_correct * (2000.0 / (select v from mut_total)))::int as mut_score
    from scored s
    order by mut_score desc
  ) x where public.is_admin()
$$;
