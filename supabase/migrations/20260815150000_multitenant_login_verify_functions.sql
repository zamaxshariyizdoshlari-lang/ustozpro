-- ═══════════════════════════════════════════════════════════════
-- MULTI-TENANT SAAS — 5-BOSQICH (SQL qismi): login endi tashkilot
-- ichida noyob (unique(org_id, login)), shuning uchun parol
-- tekshiruvchi funksiyalar ham qaysi tashkilotda qidirishni bilishi
-- kerak — p_org_id parametri qo'shildi.
-- ═══════════════════════════════════════════════════════════════

drop function if exists public._verify_student_login(text, text);
drop function if exists public._verify_teacher_login(text, text);

create function public._verify_student_login(p_org_id uuid, p_login text, p_password text)
returns table(account_id uuid, student_id uuid, must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select id, student_id, must_change_password
  from public.student_accounts
  where org_id = p_org_id and login = lower(trim(p_login)) and password_hash = extensions.crypt(p_password, password_hash)
$$;
revoke execute on function public._verify_student_login(uuid, text, text) from public, anon, authenticated;

create function public._verify_teacher_login(p_org_id uuid, p_login text, p_password text)
returns table(account_id uuid, must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select id, must_change_password
  from public.teachers
  where org_id = p_org_id and login = lower(trim(p_login)) and password_hash = extensions.crypt(p_password, password_hash)
$$;
revoke execute on function public._verify_teacher_login(uuid, text, text) from public, anon, authenticated;
