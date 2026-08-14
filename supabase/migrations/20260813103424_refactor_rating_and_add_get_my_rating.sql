-- Formulani bitta manbaga birlashtiramiz: ichki (hech kimga to'g'ridan-to'g'ri ochiq bo'lmagan) hisoblovchi
-- funksiyalar, ularni get_monthly_rating (admin, to'liq ro'yxat) va get_my_rating (o'quvchi, faqat o'zi) chaqiradi.
create or replace function public._compute_monthly_rating(p_class text default null, p_subject text default null)
returns table(student_name text, class_name text, total_correct bigint, rating_score int)
language sql stable security definer set search_path = public as $$
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
$$;
revoke execute on function public._compute_monthly_rating(text, text) from public, anon, authenticated;

create or replace function public._compute_mutolaa_rating(p_class text default null)
returns table(student_name text, class_name text, mut_correct bigint, mut_score int)
language sql stable security definer set search_path = public as $$
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
$$;
revoke execute on function public._compute_mutolaa_rating(text) from public, anon, authenticated;

create or replace function public.get_monthly_rating(p_class text default null, p_subject text default null)
returns table(student_name text, class_name text, total_correct bigint, rating_score int)
language sql stable security definer set search_path = public as $$
  select * from public._compute_monthly_rating(p_class, p_subject) where public.is_admin()
$$;

create or replace function public.get_mutolaa_rating(p_class text default null)
returns table(student_name text, class_name text, mut_correct bigint, mut_score int)
language sql stable security definer set search_path = public as $$
  select * from public._compute_mutolaa_rating(p_class) where public.is_admin()
$$;

-- O'quvchi faqat o'z reytingdagi o'rnini/ballini ko'radi (boshqalarning ismini emas)
create or replace function public.get_my_rating()
returns table(monthly_rank int, monthly_total int, monthly_score int, mutolaa_rank int, mutolaa_total int, mutolaa_score int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_student_name text;
  v_class_name text;
begin
  if not public.is_student() then raise exception 'not authorized'; end if;
  select st.full_name, c.name into v_student_name, v_class_name
  from public.student_accounts sa
  join public.students st on st.id = sa.student_id
  join public.classes c on c.id = st.class_id
  where sa.id = auth.uid();

  select x.rn::int, x.cnt::int, x.rating_score into monthly_rank, monthly_total, monthly_score
  from (
    select row_number() over (order by rating_score desc) as rn, count(*) over () as cnt, rating_score, student_name
    from public._compute_monthly_rating(v_class_name, null)
  ) x where x.student_name = v_student_name;

  select x.rn::int, x.cnt::int, x.mut_score into mutolaa_rank, mutolaa_total, mutolaa_score
  from (
    select row_number() over (order by mut_score desc) as rn, count(*) over () as cnt, mut_score, student_name
    from public._compute_mutolaa_rating(v_class_name)
  ) x where x.student_name = v_student_name;

  return next;
end;
$$;
revoke execute on function public.get_my_rating() from public, anon;
grant execute on function public.get_my_rating() to authenticated;
