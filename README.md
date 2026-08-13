# Ustoz Pro — Oylik Test Platformasi

Zamaxshariy Izdoshlari Maktabi uchun o'quvchilarni test qilish, natijalarni saqlash va oylik reyting yuritish platformasi. Frontend — sof HTML/CSS/JavaScript (build vositasisiz); backend — Supabase (Postgres + Auth + Edge Functions).

## Arxitektura

- **Frontend**: statik sayt, hech qanday build qadam kerak emas.
- **Baza**: Supabase Postgres — `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `app_secrets` jadvallari, barchasi Row Level Security bilan himoyalangan. Sxema `supabase/migrations/` papkasida versiyalangan.
- **Auth**: Supabase Auth (email/parol) — bitta admin akkaunt, `is_admin()` funksiyasi orqali RLS siyosatlariga bog'langan.
- **Edge Functions** (`supabase/functions/` — bu repoda ham saqlanadi, Supabase loyihasiga alohida deploy qilinadi):
  - `get-test` — tanlangan sinf/fan uchun savollarni **to'g'ri javobsiz** qaytaradi va urinishlar limitini tekshiradi.
  - `submit-result` — javoblarni serverda baholaydi, natijani bazaga yozadi, Telegram xabarnomasini yuboradi (bot tokeni faqat serverda).
  - `reveal-answers` — o'qituvchi paroli tekshirilgach, to'g'ri javoblarni qaytaradi.
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

1. `supabase/migrations` orqali quyidagi jadvallarni yarating: `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `app_secrets` — barchasida RLS yoqilgan, faqat admin (`is_admin()`) yozishi mumkin, `questions`/`results`/`app_secrets` anon uchun umuman o'qilmaydi.
2. `app_secrets` jadvaliga `TG_TOKEN`, `TG_CHAT`, `ANSWER_PASS` qiymatlarini kiriting (faqat Edge Function'lar `service_role` orqali o'qiy oladi).
3. Supabase Auth'da bitta admin foydalanuvchi yarating, uning UUID'sini `is_admin()` funksiyasiga yozing.
4. `get-test`, `submit-result`, `reveal-answers` Edge Function'larini deploy qiling.
5. `js/config.js`'ga yangi loyihaning URL/anon key'ini yozing.

## Savollarni qo'shish

Ikki yo'l bor:

- **Qo'lda**: Admin panel → Boshqarish → Savollar — sinf va fanni tanlab, savol/variantlar/to'g'ri javob/izohni kiritasiz.
- **Ommaviy import**: Admin panel → Bazani yangilash — eski Google Sheets havolasini (CSV) kiritib, "Import qilish" tugmasini bosasiz. Ustunlar tartibi: Sinf, Fan, Savol, A, B, C, D, To'g'ri javob (a/b/c/d), Izoh. Sinf ustunida bir nechta sinf ham qo'llab-quvvatlanadi ("5,6,7" yoki "5-8").

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
