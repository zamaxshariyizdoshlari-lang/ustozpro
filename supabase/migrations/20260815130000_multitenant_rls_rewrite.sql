-- ═══════════════════════════════════════════════════════════════
-- MULTI-TENANT SAAS — 2-BOSQICH: RLS QAYTA YOZISH
-- is_admin() endi YETARLI EMAS — u faqat "kimdir admin_accounts'da
-- bormi"ni tekshiradi, org_id'ga qaramaydi. Shu sababli hozirgi
-- siyosatlar (is_admin()) org-A adminiga org-B'ning HAMMA ma'lumotini
-- ko'rsatib/yozdirib qo'yardi. is_org_member(target_org_id) — org_id
-- moslashini ham tekshiradi, VA har bir siyosatga endi WITH CHECK ham
-- qo'shiladi (faqat o'qishni emas, yozishni ham cheklash — aks holda
-- org-A admin org-B nomiga yozib qo'yishi mumkin edi).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_accounts
    where id = auth.uid() and org_id = target_org_id
  )
$$;
revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where id = auth.uid())
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- classes
drop policy if exists classes_select_admin on public.classes;
drop policy if exists classes_write_admin on public.classes;
drop policy if exists classes_update_admin on public.classes;
drop policy if exists classes_delete_admin on public.classes;
create policy classes_select_org on public.classes for select using (is_org_member(org_id));
create policy classes_insert_org on public.classes for insert with check (is_org_member(org_id));
create policy classes_update_org on public.classes for update using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy classes_delete_org on public.classes for delete using (is_org_member(org_id));

-- students
drop policy if exists students_select_admin on public.students;
drop policy if exists students_write_admin on public.students;
drop policy if exists students_update_admin on public.students;
drop policy if exists students_delete_admin on public.students;
create policy students_select_org on public.students for select using (is_org_member(org_id));
create policy students_insert_org on public.students for insert with check (is_org_member(org_id));
create policy students_update_org on public.students for update using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy students_delete_org on public.students for delete using (is_org_member(org_id));

-- subjects
drop policy if exists subjects_select_admin on public.subjects;
drop policy if exists subjects_write_admin on public.subjects;
drop policy if exists subjects_update_admin on public.subjects;
drop policy if exists subjects_delete_admin on public.subjects;
create policy subjects_select_org on public.subjects for select using (is_org_member(org_id));
create policy subjects_insert_org on public.subjects for insert with check (is_org_member(org_id));
create policy subjects_update_org on public.subjects for update using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy subjects_delete_org on public.subjects for delete using (is_org_member(org_id));

-- questions
drop policy if exists questions_select_admin on public.questions;
drop policy if exists questions_write_admin on public.questions;
drop policy if exists questions_update_admin on public.questions;
drop policy if exists questions_delete_admin on public.questions;
create policy questions_select_org on public.questions for select using (is_org_member(org_id));
create policy questions_insert_org on public.questions for insert with check (is_org_member(org_id));
create policy questions_update_org on public.questions for update using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy questions_delete_org on public.questions for delete using (is_org_member(org_id));

-- results (faqat select+delete — insert doim service_role orqali)
drop policy if exists results_select_admin on public.results;
drop policy if exists results_delete_admin on public.results;
create policy results_select_org on public.results for select using (is_org_member(org_id));
create policy results_delete_org on public.results for delete using (is_org_member(org_id));

-- audit_log (faqat select — yozish doim admin_log_event() RPC orqali)
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_org on public.audit_log for select using (is_org_member(org_id));

-- class_settings
drop policy if exists class_settings_select_admin on public.class_settings;
drop policy if exists class_settings_write_admin on public.class_settings;
drop policy if exists class_settings_update_admin on public.class_settings;
drop policy if exists class_settings_delete_admin on public.class_settings;
create policy class_settings_select_org on public.class_settings for select using (is_org_member(org_id));
create policy class_settings_insert_org on public.class_settings for insert with check (is_org_member(org_id));
create policy class_settings_update_org on public.class_settings for update using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy class_settings_delete_org on public.class_settings for delete using (is_org_member(org_id));
