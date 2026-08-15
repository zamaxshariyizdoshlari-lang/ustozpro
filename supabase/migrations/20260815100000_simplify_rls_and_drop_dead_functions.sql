-- O'quvchi/o'qituvchi endi Supabase Auth JWT'ini umuman olmaydi (custom_sessions
-- orqali, Edge Function ichida service_role bilan ishlaydi) — shu sabab RLS
-- endi FAQAT admin uchun ma'noga ega. questions/results siyosatlari
-- can_manage_subject()/is_teacher_for_subject()/is_own_result() kabi endi
-- hech qachon haqiqiy bo'lmaydigan (chunki auth.uid() ular uchun hech qachon
-- to'lmaydi) shartlarga tayanardi — bularni is_admin()ga soddalashtiramiz.
-- *_select_authenticated siyosatlari ham xuddi shunday — "authenticated" rolida
-- endi faqat admin bo'ladi, shuning uchun is_admin() bilan almashtiramiz (aniqroq).

drop policy if exists questions_select_scoped on public.questions;
drop policy if exists questions_write_scoped on public.questions;
drop policy if exists questions_update_scoped on public.questions;
drop policy if exists questions_delete_scoped on public.questions;
create policy questions_select_admin on public.questions for select using (public.is_admin());
create policy questions_write_admin on public.questions for insert with check (public.is_admin());
create policy questions_update_admin on public.questions for update using (public.is_admin()) with check (public.is_admin());
create policy questions_delete_admin on public.questions for delete using (public.is_admin());

drop policy if exists results_select_scoped on public.results;
drop policy if exists results_delete_scoped on public.results;
create policy results_select_admin on public.results for select using (public.is_admin());
create policy results_delete_admin on public.results for delete using (public.is_admin());

drop policy if exists classes_select_authenticated on public.classes;
create policy classes_select_admin on public.classes for select using (public.is_admin());

drop policy if exists students_select_authenticated on public.students;
create policy students_select_admin on public.students for select using (public.is_admin());

drop policy if exists subjects_select_authenticated on public.subjects;
create policy subjects_select_admin on public.subjects for select using (public.is_admin());

drop policy if exists settings_select_authenticated on public.settings;
create policy settings_select_admin on public.settings for select using (public.is_admin());

drop policy if exists class_settings_select_authenticated on public.class_settings;
create policy class_settings_select_admin on public.class_settings for select using (public.is_admin());

-- Endi hech qachon haqiqiy Supabase JWT bilan chaqirilmaydigan (o'quvchi/o'qituvchi
-- buni umuman olmaydi) RLS-davri funksiyalari — barcha o'rinlarda custom-*
-- Edge Function'lar bilan almashtirilgan.
drop function if exists public.is_teacher();
drop function if exists public.is_teacher_for_subject(text);
drop function if exists public.is_student();
drop function if exists public.get_my_teacher_info();
drop function if exists public.get_my_student_info();
drop function if exists public.can_manage_subject(uuid);
drop function if exists public.is_own_result(text, text);
drop function if exists public.mark_password_changed();
