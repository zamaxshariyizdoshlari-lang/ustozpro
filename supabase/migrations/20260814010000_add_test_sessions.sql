-- test_sessions: get-test tanlagan savollarni serverda bir martalik "bilet" sifatida
-- saqlaydi. submit-result endi mijoz yuborgan question_ids/subject_name'ga emas,
-- shu sessiyaga ishonadi (bir marta ishlatiladi, chaqiruvchining o'ziga tegishli
-- bo'lishi kerak) — bu identifikatsiya soxtalashtirish va "javob taxmin qilish"
-- (wrong_review orqali) hujumlarining oldini oladi.
create table public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_ids uuid[] not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.test_sessions enable row level security;
-- RLS yoqilgan, siyosat yo'q => faqat Edge Function ichidagi service_role kira oladi.
