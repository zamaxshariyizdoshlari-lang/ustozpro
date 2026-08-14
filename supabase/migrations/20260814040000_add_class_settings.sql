-- class_settings: sinf darajasida test parametrlarini global settings'dan farqli
-- belgilash imkoniyati. Har bir ustun nullable — null bo'lsa global settings'dan
-- meros olinadi (frontend/get-test COALESCE mantig'i bilan).
create table public.class_settings (
  class_id uuid primary key references public.classes(id) on delete cascade,
  question_count int,
  time_limit_minutes int,
  max_attempts int,
  enable_attempt_limit boolean
);
alter table public.class_settings enable row level security;
create policy "class_settings_select_authenticated" on public.class_settings for select using (auth.uid() is not null);
create policy "class_settings_write_admin" on public.class_settings for insert with check (public.is_admin());
create policy "class_settings_update_admin" on public.class_settings for update using (public.is_admin());
create policy "class_settings_delete_admin" on public.class_settings for delete using (public.is_admin());
