-- Endi anonim (login qilmagan) oqim umuman yo'q — hamma avval login qiladi.
drop policy if exists "classes_select_all" on public.classes;
create policy "classes_select_authenticated" on public.classes for select using (auth.uid() is not null);

drop policy if exists "subjects_select_all" on public.subjects;
create policy "subjects_select_authenticated" on public.subjects for select using (auth.uid() is not null);

drop policy if exists "students_select_all" on public.students;
create policy "students_select_authenticated" on public.students for select using (auth.uid() is not null);

drop policy if exists "settings_select_all" on public.settings;
create policy "settings_select_authenticated" on public.settings for select using (auth.uid() is not null);

-- results: admin, shu fan o'qituvchisi, YOKI natijaning egasi bo'lgan o'quvchi ko'ra oladi
drop policy if exists "results_select_scoped" on public.results;
create policy "results_select_scoped" on public.results for select using (
  public.is_admin() or public.is_teacher_for_subject(subject_name) or public.is_own_result(student_name, class_name)
);

-- Endi o'qituvchi ham o'z fani natijasini o'chira oladi (avval faqat admin edi)
create policy "results_delete_scoped" on public.results for delete using (
  public.is_admin() or public.is_teacher_for_subject(subject_name)
);
drop policy if exists "results_delete_admin" on public.results;

-- Anonim hech kim qolmagani uchun get_public_stats()ni ham authenticated'ga cheklaymiz
revoke execute on function public.get_public_stats() from anon;
