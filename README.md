# Ustoz Pro — Ko'p-tashkilotli (multi-tenant) test platformasi

Istalgan maktab/o'quv markazi o'ziga alohida, bir-biridan **butunlay ajratilgan** (izolyatsiyalangan) hisob ochib, o'z o'quvchi/o'qituvchi/administratorlarini mustaqil boshqarishi mumkin bo'lgan SaaS platforma. Frontend — sof HTML/CSS/JavaScript (build vositasisiz); backend — Supabase (Postgres + Auth + Edge Functions).

## Uch pog'onali identifikatsiya

1. **Platforma egasi** (`platform_admins`) — haqiqiy Supabase Auth. Yangi tashkilot (maktab) yaratadi, tashkilotlar ro'yxatini ko'radi, to'xtatadi/faollashtiradi. **Hech qaysi tashkilotning ichki (o'quvchi/o'qituvchi/natija) ma'lumotini ko'rmaydi** — bu izolyatsiya va'dasining bir qismi.
2. **Tashkilot admini** (`admin_accounts.org_id`) — haqiqiy Supabase Auth (real email), RLS orqali **faqat o'z tashkilotiga** tegishli ma'lumotni ko'radi/yozadi (`is_org_member(org_id)`).
3. **O'qituvchi/o'quvchi** — Supabase Auth'da umuman mavjud emas. Login+parol bcrypt bilan to'g'ridan-to'g'ri `teachers.password_hash`/`student_accounts.password_hash`da saqlanadi, `custom-login` Edge Function orqali tekshiriladi (endi **tashkilot kodi (slug) + login + parol** — chunki login endi global emas, faqat o'z tashkiloti ichida noyob), muvaffaqiyatli bo'lsa `custom_sessions` jadvaliga (`org_id` bilan birga) tasodifiy bearer-token yoziladi.

## Ma'lumotlar izolyatsiyasi qanday ta'minlanadi

- **Admin uchun — RLS**: har bir tashkilot-jadvalida (`classes`, `students`, `subjects`, `questions`, `results`, `settings`, `class_settings`, `audit_log`) `org_id` ustuni bor, va har bir siyosat (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) `is_org_member(org_id)` bilan cheklangan — ham `USING`, ham `WITH CHECK` (faqat o'qishni emas, yozishni ham).
- **O'qituvchi/o'quvchi uchun — Edge Function kodi**: ular hech qachon Supabase JWT olmaydi, shuning uchun RLS ularga tegishli emas. Har bir `custom-*`/`get-test`/`submit-result`/`reveal-answers` chaqiruvi avval `custom_sessions`dan bearer-tokenni tekshiradi, undan `org_id`ni oladi va **har bir keyingi so'rovga shu `org_id` filtrini qo'shadi** — bu butun arxitekturaning eng xavfli nuqtasi (bitta unutilgan filtr — tashkilotlar aro sizish), shu sabab har bir funksiya ikkita mustaqil test-tashkilot bilan alohida tekshirilgan.
- **Platforma egasi uchun**: `is_platform_admin()` faqat `organizations`/`admin_accounts`/`platform_admins` jadvallariga kirish beradi — tashkilot ma'lumotiga (o'quvchi/natija/savol) RLS orqali kira olmaydi.

## Tashkilotni aniqlash (login darvozasida)

- **Admin/platforma egasi**: hech narsa o'zgarmaydi — real email bilan Supabase Auth'ga kiradi, o'z tashkiloti/roli muvaffaqiyatli kirishdan **keyin** aniqlanadi (`is_platform_admin()`, keyin `is_admin()`).
- **O'qituvchi/o'quvchi**: login darvozasida qo'shimcha **"Maktab kodi"** maydoni bor (tashkilot slug'i, masalan `yunusobod-42`). `?org=<slug>` havolasi orqali bu maydon avtomatik to'ldiriladi (maktab bergan shaxsiy havola) va oxirgi ishlatilgan kod qulaylik uchun `localStorage`'da eslab qolinadi (haqiqiy tekshiruv har doim serverda).
- **Nega subdomain emas**: bitta statik sayt, bitta URL, hech qanday custom domen/wildcard DNS infratuzilmasi yo'q — bu keyingi, alohida infratuzilma loyihasi bo'lishi mumkin.

## Arxitektura

- **Frontend**: statik sayt, hech qanday build qadam kerak emas.
- **Baza**: Supabase Postgres. Yangi jadvallar: `organizations` (id, name, slug unique, status active/suspended), `platform_admins`. Mavjud barcha jadvallarga `org_id` qo'shilgan: `admin_accounts`, `classes`, `students`, `subjects`, `questions`, `results`, `settings` (endi `org_id` primary key, `id=1` yagona qatordan farqli), `class_settings`, `teachers`, `teacher_subjects`, `student_accounts`, `custom_sessions`, `test_sessions`, `audit_log`, `app_secrets` (endi `(org_id, key)` composite primary key — har tashkilot o'z Telegram bot/chat'i va "javob paroli"ni saqlaydi). `teachers.login`/`student_accounts.login` — `unique(org_id, login)` (avval global edi). Sxema `supabase/migrations/` papkasida versiyalangan.
- **Edge Functions** (`supabase/functions/`):
  - `platform-create-org` / `platform-list-orgs` / `platform-set-org-status` — platforma egasi uchun, haqiqiy Supabase JWT bilan (`verify_jwt=true`), `is_platform_admin()` tekshiradi. `platform-create-org` tashkilot + uning birinchi adminini (Supabase Admin API orqali) bir amalda yaratadi, default `settings` qatorini urug'laydi.
  - `custom-login` — `{org_slug, login, password}` qabul qiladi: avval `organizations`ni slug+`status='active'` bo'yicha topadi, keyin login+parolni shu tashkilot ichida tekshiradi.
  - `custom-logout`, `custom-change-password`, `custom-student-panel`, `custom-teacher-panel`, `custom-teacher-questions`, `custom-teacher-results`, `get-test`, `submit-result`, `reveal-answers` — barchasi `custom_sessions.org_id` bilan cheklangan (yuqorida batafsil).
  - Barchasi `verify_jwt=false` (platform-* funksiyalaridan tashqari) — chunki o'quvchi/o'qituvchi chaqiruvchisida haqiqiy Supabase JWT yo'q.

> ⚠️ **Eslatma**: `supabase/migrations/` da o'quvchi/sinf/fan/tashkilot **seed (namunaviy) ma'lumotlari yo'q** — chunki bu repo public, va haqiqiy F.I.Sh./tashkilot ma'lumotlari shaxsiy hisoblanadi. Ular faqat Supabase bazasida saqlanadi, GitHub'ga hech qachon yuklanmaydi.

## Loyiha tuzilishi

```
Ustozpro/
├── index.html              — sahifa tarkibi (markup)
├── css/
│   └── style.css           — barcha uslublar
├── js/
│   ├── app.js               — ilova mantig'i (Supabase client, ekranlar, test, admin, platforma paneli, eksport)
│   ├── config.js             — muhitga xos sozlamalar (.gitignore'da)
│   └── config.example.js     — config.js uchun namuna/shablon
├── .gitignore
└── README.md
```

## Ishga tushirish (lokal)

```bash
cd Ustozpro
python -m http.server 8080
```

Keyin brauzerda: `http://localhost:8080`

## Sozlash (`js/config.js`)

`js/config.js` `.gitignore`'da. `js/config.example.js`'ni nusxalab `js/config.js` deb saqlang:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — Supabase loyiha sozlamalaridan (Project Settings → API).
- `ADMIN_EMAIL` — **platforma egasi**ning Supabase Auth email'i (birinchi tashkilotni yaratish uchun kerak).

## Yangi tashkilot (maktab) qo'shish

Faqat **platforma egasi** yangi tashkilot yarata oladi: "Tashkilotlar" ekranida nom, kod (slug), va birinchi adminning ism/email/parolini kiritib, "+ Tashkilot yaratish"ni bosadi (`platform-create-org`). Shu admin keyin o'z sinf/o'quvchi/o'qituvchi/savollarini mustaqil boshqaradi — boshqa tashkilotlar unga ko'rinmaydi.

## Savollarni qo'shish

- **Qo'lda**: Admin panel → Boshqarish → Savollar.
- **Ommaviy import**: Admin panel → Bazani yangilash — Google Sheets CSV havolasi orqali.

## O'quvchi/o'qituvchi hisoblari

Admin ularga hisob yaratadi (o'zlari ro'yxatdan o'tmaydi). Login ism-familiyadan avtomatik generatsiya qilinadi, parol — tasodifiy 8 xonali satr, ikkalasi ham faqat yaratilgan paytda ko'rsatiladi. Birinchi kirishda parol majburiy almashtiriladi (`must_change_password`).

## Xavfsizlik

- Admin — RLS + `is_org_member(org_id)`. Platforma egasi — RLS + `is_platform_admin()`, faqat `organizations`/`admin_accounts`ga.
- O'qituvchi/o'quvchi — RLS'ga umuman tegishli emas, barcha kirish `custom-*` Edge Function ichida `org_id` filtri bilan qo'lda tekshiriladi.
- Test paytida savollar **to'g'ri javobsiz** yuboriladi (`get-test`); baholash serverda (`submit-result`).
- **Bir martalik test-sessiyasi (`test_sessions`)** — identifikatsiya soxtalashtirish, urinishlar chegarasini chetlab o'tish, va javoblarni "taxmin qilib topish"dan himoya qiladi.
- Parol tiklanganda/hisob o'chirilganda tegishli `custom_sessions` qatorlari darhol o'chiriladi.
- Muhim admin harakatlari `audit_log`ga yoziladi (org-scoped).

## Texnologiyalar

- Vanilla JavaScript (ES6+), CSS custom properties
- [jsPDF](https://github.com/parallax/jsPDF) + AutoTable — PDF eksport
- [SheetJS](https://sheetjs.com/) — Excel eksport
- [Supabase](https://supabase.com/) — Postgres, Auth, Edge Functions
- Telegram Bot API — natija xabarnomalari (server tomonidan, org-scoped)
