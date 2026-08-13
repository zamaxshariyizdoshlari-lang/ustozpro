# Ustoz Pro — Oylik Test Platformasi

Zamaxshariy Izdoshlari Maktabi uchun o'quvchilarni test qilish, natijalarni saqlash va oylik reyting yuritish platformasi. Frontend — sof HTML/CSS/JavaScript (build vositasisiz); backend — Supabase (Postgres + Auth + Edge Functions).

## Arxitektura

- **Frontend**: statik sayt, hech qanday build qadam kerak emas.
- **Baza**: Supabase Postgres — `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `app_secrets`, `teachers`, `teacher_subjects` jadvallari, barchasi Row Level Security bilan himoyalangan. Sxema `supabase/migrations/` papkasida versiyalangan.
- **Auth**: Supabase Auth (email/parol) — ikki rol: bitta **super-admin** (`is_admin()` orqali, hammasini boshqaradi) va istalgan sondagi **o'qituvchi**lar (`teachers`/`teacher_subjects` orqali, faqat o'z fan(lar)i bilan cheklangan — quyida batafsil).
- **Edge Functions** (`supabase/functions/` — bu repoda ham saqlanadi, Supabase loyihasiga alohida deploy qilinadi):
  - `get-test` — tanlangan sinf/fan uchun savollarni **to'g'ri javobsiz** qaytaradi va urinishlar limitini tekshiradi.
  - `submit-result` — javoblarni serverda baholaydi, natijani bazaga yozadi, Telegram xabarnomasini yuboradi (bot tokeni faqat serverda).
  - `reveal-answers` — o'qituvchi paroli tekshirilgach, to'g'ri javoblarni qaytaradi.
  - `student-login` / `student-logout` / `student-me` / `student-change-pin` — o'quvchi shaxsiy kabineti uchun PIN-asosli autentifikatsiya (quyida batafsil).
- **Reyting hisob-kitobi** (`get_monthly_rating`, `get_mutolaa_rating`, `get_rating_formula_info`) — Postgres RPC funksiyalari sifatida serverda hisoblanadi (admin panel butun natijalar jadvalini brauzerga tortib olib client'da hisoblamaydi).

> ⚠️ **Eslatma**: `supabase/migrations/` da o'quvchi/sinf/fan **seed (namunaviy) ma'lumotlari yo'q** — chunki bu repo public, va haqiqiy o'quvchi ismlari (F.I.Sh.) shaxsiy ma'lumot hisoblanadi. Ular faqat Supabase bazasida saqlanadi, GitHub'ga hech qachon yuklanmaydi.

Bu arxitektura tufayli **to'g'ri javoblar, admin paroli va Telegram tokeni hech qachon brauzerga to'liq jo'natilmaydi** — hammasi server tomonida (Edge Function ichida, `service_role` kaliti bilan) ishlanadi.

## Loyiha tuzilishi

```
Ustozpro/
├── index.html              — sahifa tarkibi (markup)
├── css/
│   └── style.css           — barcha uslublar
├── js/
│   ├── app.js               — ilova mantig'i (Supabase client, ekranlar, test, admin, reyting, eksport)
│   ├── config.js             — muhitga xos sozlamalar (.gitignore'da)
│   └── config.example.js     — config.js uchun namuna/shablon
├── .gitignore
└── README.md
```

## Ishga tushirish (lokal)

Statik fayllarni to'g'ridan-to'g'ri `file://` orqali ochish tavsiya etilmaydi (ba'zi brauzerlar module/fetch so'rovlarini bloklaydi). Har qanday statik server ishlaydi:

```bash
cd Ustozpro
python -m http.server 8080
```

Keyin brauzerda: `http://localhost:8080`

## Sozlash (`js/config.js`)

`js/config.js` `.gitignore`'da (muhitga xos bo'lgani uchun, sirlar uchun emas). `js/config.example.js`'ni nusxalab `js/config.js` deb saqlang va o'z Supabase loyihangiz qiymatlarini kiriting:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — Supabase loyiha sozlamalaridan (Project Settings → API). Bular **maxfiy emas** — anon key faqat RLS orqali cheklangan ochiq API kaliti.
- `ADMIN_EMAIL` — admin panelga kirish uchun Supabase Auth'da yaratilgan foydalanuvchi emaili.

## Backendni birinchi marta sozlash (yangi Supabase loyihasida)

1. `supabase/migrations` orqali quyidagi jadvallarni yarating: `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `app_secrets`, `student_auth`, `student_sessions`, `teachers`, `teacher_subjects` — barchasida RLS yoqilgan; `questions`/`results` admin YOKI shu fanning o'qituvchisiga ochiq (`can_manage_subject()`/`is_teacher_for_subject()`), qolganlari `app_secrets`/`student_auth`/`student_sessions`/`teachers`/`teacher_subjects` kabi anon/authenticated uchun umuman yopiq (faqat RPC orqali).
2. `app_secrets` jadvaliga `TG_TOKEN`, `TG_CHAT`, `ANSWER_PASS` qiymatlarini kiriting (faqat Edge Function'lar `service_role` orqali o'qiy oladi).
3. Supabase Auth'da bitta admin foydalanuvchi yarating, uning UUID'sini `is_admin()` funksiyasiga yozing.
4. `get-test`, `submit-result`, `reveal-answers`, `student-login`, `student-logout`, `student-me`, `student-change-pin` Edge Function'larini deploy qiling.
5. `js/config.js`'ga yangi loyihaning URL/anon key'ini yozing.

## Savollarni qo'shish

Ikki yo'l bor:

- **Qo'lda**: Admin panel → Boshqarish → Savollar — sinf va fanni tanlab, savol/variantlar/to'g'ri javob/izohni kiritasiz.
- **Ommaviy import**: Admin panel → Bazani yangilash — eski Google Sheets havolasini (CSV) kiritib, "Import qilish" tugmasini bosasiz. Ustunlar tartibi: Sinf, Fan, Savol, A, B, C, D, To'g'ri javob (a/b/c/d), Izoh. Sinf ustunida bir nechta sinf ham qo'llab-quvvatlanadi ("5,6,7" yoki "5-8").

## O'quvchi kabineti (shaxsiy panel)

O'quvchilar "Mening kabinetim" bo'limida sinf + ism + shaxsiy 4 xonali PIN-kod bilan kirib, o'zlarining test tarixini, 1200/2000 ballik reytingdagi o'rnini va fan bo'yicha rivojlanish grafigini ko'rishlari mumkin.

- **Nega Supabase Auth emas**: o'quvchilarda email yo'q, va 69+ o'quvchi uchun parol boshqarish (unutilsa tiklash va h.k.) og'ir operatsion yuk bo'lardi. Buning o'rniga PIN `student_auth` jadvalida bcrypt bilan xeshlanib saqlanadi, kirish `student-login` Edge Function orqali tekshiriladi va muvaffaqiyatli bo'lsa `student_sessions` jadvaliga oddiy tasodifiy token yoziladi (30 kun amal qiladi, brauzer `localStorage`da saqlaydi).
- **PIN berish**: Admin panel → Boshqarish → O'quvchilar → har bir ism yonidagi 🔑 tugmasi `admin_reset_student_pin` RPC'ni chaqiradi va yangi tasodifiy PIN'ni bir martalik ko'rsatadi (admin buni o'quvchiga og'zaki/qog'ozda beradi — PIN qayta hech qayerda ko'rinmaydi, faqat xeshi saqlanadi).
- **Bloklash**: 5 marta xato PIN kiritilsa, hisob 15 daqiqaga bloklanadi (`student_auth.pin_attempts`/`pin_locked_until`).
- **Ma'lumotlar izolyatsiyasi**: `student_auth` va `student_sessions` jadvallarida RLS yoqilgan, lekin hech qanday siyosat yo'q — na `anon`, na `authenticated` (admin) ularni to'g'ridan-to'g'ri o'qiy olmaydi, faqat `service_role` (Edge Function ichida) va `SECURITY DEFINER` RPC orqali kirish mumkin.

## O'qituvchi paneli (fan bo'yicha cheklangan admin roli)

Bitta super-admin (`ustozpro@ustozpro.local`) dan tashqari, admin panel orqali **fan o'qituvchilari** uchun ham hisob yaratish mumkin — har biri **faqat o'ziga biriktirilgan fan(lar)ni, barcha sinflar bo'yicha** ko'radi/boshqaradi (masalan "Matematika o'qituvchisi" 5–8-sinflarning barcha Matematika savol/natijalarini boshqaradi, boshqa fanlarga tegmaydi).

- **Hisob yaratish**: Admin panel → Boshqarish → O'qituvchilar — ism, email, vaqtinchalik parol va fan(lar)ni belgilab qo'shasiz (`admin_create_teacher` RPC). Parolni keyinroq 🔑 tugmasi orqali tiklash, 🗑️ orqali hisobni butunlay o'chirish (login darhol ishlamay qoladi) mumkin.
- **Kirish**: xuddi admin bilan bir xil login formasi (email + parol, Supabase Auth). Muvaffaqiyatli kirishdan so'ng frontend `is_admin()` va `get_my_teacher_info()` RPC'lari orqali "kim ekanini" aniqlaydi va shunga qarab UI'ni moslaydi (o'qituvchida Sinflar/O'quvchilar/Fanlar/Reyting/Sozlamalar/"Tozalash" — hammasi yashiriladi, faqat o'z fani bo'yicha Savollar va Natijalar qoladi).
- **Haqiqiy xavfsizlik chegarasi — RLS, UI emas**: `questions` va `results` jadvallaridagi RLS siyosatlari `can_manage_subject()`/`is_teacher_for_subject()` funksiyalari orqali fan bo'yicha cheklangan — UI cheklovini devtools orqali chetlab o'tishga urinilsa ham, Postgres so'rovni to'g'ridan-to'g'ri rad etadi (`42501` xatosi). Reyting RPC'lari (`get_monthly_rating` va h.k.) ham DB darajasida faqat haqiqiy super-adminga qaytaradi, chunki ular butun sinf bo'yicha jamlangan ma'lumotni ko'rsatadi.

## Xavfsizlik

- `questions.correct_option` va `results` jadvallari anon foydalanuvchiga hech qachon to'g'ridan-to'g'ri REST orqali ko'rinmaydi (RLS bilan tekshirilgan).
- Test paytida savollar `get-test` orqali **to'g'ri javobsiz** yuboriladi; baholash `submit-result`da serverda amalga oshadi.
- "To'g'ri javoblarni ko'rish" paroli ham serverda (`reveal-answers`) tekshiriladi — parol noto'g'ri bo'lsa hech qanday javob qaytmaydi.
- Admin autentifikatsiyasi haqiqiy Supabase Auth orqali; RLS siyosatlari faqat bitta belgilangan admin UUID'siga yozishga ruxsat beradi (boshqa birov `signUp` qilsa ham yozolmaydi).
- Reyting RPC funksiyalari (`get_monthly_rating` va h.k.) faqat `authenticated` (admin) uchun ochiq — `anon` foydalanuvchi ularni chaqira olmaydi (Supabase Security Advisor orqali tasdiqlangan).

### Bitta ixtiyoriy xavfsizlik yaxshilanishi (hozircha qo'llanilmagan)

Supabase'ning **"Leaked password protection"** (HaveIBeenPwned.org bazasi orqali parol tekshiruvi) funksiyasi faqat **Pro Plan va undan yuqori** tarifda mavjud, Free tarifda Dashboard'da umuman ko'rinmaydi. Loyiha hozir Free tarifda ishlaydi va bitta admin akkaunti bo'lgani uchun bu ayni damda kritik emas. Agar kelajakda Pro Plan'ga o'tilsa, buni Dashboard → Authentication → Sign In / Providers → Email → Password Security bo'limidan yoqish mumkin.

## Texnologiyalar

- Vanilla JavaScript (ES6+), CSS custom properties
- [jsPDF](https://github.com/parallax/jsPDF) + AutoTable — PDF eksport
- [SheetJS](https://sheetjs.com/) — Excel eksport
- [Supabase](https://supabase.com/) — Postgres, Auth, Edge Functions
- Telegram Bot API — natija xabarnomalari (server tomonidan yuboriladi)
