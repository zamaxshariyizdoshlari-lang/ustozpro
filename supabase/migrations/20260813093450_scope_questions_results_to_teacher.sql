-- questions: admin yoki shu fan o'qituvchisi CRUD qila oladi
drop policy if exists "questions_admin_select" on public.questions;
drop policy if exists "questions_write_admin" on public.questions;
drop policy if exists "questions_update_admin" on public.questions;
drop policy if exists "questions_delete_admin" on public.questions;

create policy "questions_select_scoped" on public.questions for select using (public.can_manage_subject(subject_id));
create policy "questions_write_scoped" on public.questions for insert with check (public.can_manage_subject(subject_id));
create policy "questions_update_scoped" on public.questions for update using (public.can_manage_subject(subject_id)) with check (public.can_manage_subject(subject_id));
create policy "questions_delete_scoped" on public.questions for delete using (public.can_manage_subject(subject_id));

-- results: o'qish admin yoki shu fan o'qituvchisiga ochiq; o'chirish faqat admin (granular delete UI yo'q)
drop policy if exists "results_admin_select" on public.results;
create policy "results_select_scoped" on public.results for select using (public.is_admin() or public.is_teacher_for_subject(subject_name));
