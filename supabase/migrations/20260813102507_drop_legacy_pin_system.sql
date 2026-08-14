-- PIN tizimi login+parolga almashtirildi — eski jadval/funksiyalar endi kerak emas.
drop table if exists public.student_sessions;
drop table if exists public.student_auth;
drop function if exists public.admin_reset_student_pin(uuid);
drop function if exists public.verify_pin_hash(text, text);
drop function if exists public.hash_pin(text);
