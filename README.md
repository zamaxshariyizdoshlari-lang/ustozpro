# Ustoz Pro — Oylik Test Platformasi

Zamaxshariy Izdoshlari Maktabi uchun o'quvchilarni test qilish, natijalarni saqlash va oylik reyting yuritish platformasi. Frontend — sof HTML/CSS/JavaScript (build vositasisiz); backend — Supabase (Postgres + Auth + Edge Functions).

## Arxitektura

- **Frontend**: statik sayt, hech qanday build qadam kerak emas.
- **Baza**: Supabase Postgres — `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `app_secrets`, `teachers`, `teacher_subjects`, `student_accounts` jadvallari, barchasi Row Level Security bilan himoyalangan. Sxema `supabase/migrations/` papkasida versiyalangan.
- **Auth**: Supabase Auth (email/parol) — **uchta rol**, hammasi bitta login darvozasidan kiradi va **avtomatik o'z paneliga yo'naltiriladi**: bitta **super-admin** (`is_admin()` orqali, hammasini boshqaradi), istalgan sondagi **o'qituvchi**lar (`teachers`/`teacher_subjects` orqali, faqat o'z fan(lar)i bilan cheklangan) va barcha **o'quvchi**lar (`student_accounts` orqali, faqat o'z natijalari/reytingi bilan cheklangan). Uch rol ham to'liq alohida ekranlarda ishlaydi (`screen-admin`/`screen-manage`, `screen-teacher`, `screen-student`) — bitta umumiy ekran yo'q.
- **Edge Functions** (`supabase/functions/` — bu repoda ham saqlanadi, Supabase loyihasiga alohida deploy qilinadi):
  - `get-test` — tanlangan fan uchun savollarni **to'g'ri javobsiz** qaytaradi; o'quvchini chaqiruvchining **haqiqiy sessiya tokeni** orqali aniqlaydi (mijoz yuborgan ism/sinfga ishonmaydi).
  - `submit-result` — javoblarni serverda baholaydi, natijani bazaga yozadi, Telegram xabarnomasini yuboradi (bot tokeni faqat serverda); `student_name`/`class_name`ni ham mijozdan emas, token orqali aniqlangan hisobdan oladi.
  - `reveal-answers` — o'qituvchi paroli tekshirilgach, to'g'ri javoblarni qaytaradi.
- **Reyting hisob-kitobi** (`get_monthly_rating`, `get_mutolaa_rating`, `get_rating_formula_info`, `get_my_rating`) — Postgres RPC funksiyalari sifatida serverda hisoblanadi (admin panel butun natijalar jadvalini brauzerga tortib olib client'da hisoblamaydi; o'quvchi esa faqat `get_my_rating()` orqali o'zining o'rnini ko'radi, boshqalarning ismini emas).

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

1. `supabase/migrations` orqali quyidagi jadvallarni yarating: `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `app_secrets`, `teachers`, `teacher_subjects`, `student_accounts` — barchasida RLS yoqilgan; `questions`/`results` admin YOKI shu fanning o'qituvchisiga ochiq (`can_manage_subject()`/`is_teacher_for_subject()`), qolganlari `app_secrets`/`teachers`/`teacher_subjects`/`student_accounts` kabi anon/authenticated uchun umuman yopiq (faqat RPC orqali). Anonim (login qilmagan) foydalanuvchi hech narsani o'qiy olmaydi — `classes`/`subjects`/`students`/`settings` ham `auth.uid() is not null` bilan cheklangan.
2. `app_secrets` jadvaliga `TG_TOKEN`, `TG_CHAT`, `ANSWER_PASS` qiymatlarini kiriting (faqat Edge Function'lar `service_role` orqali o'qiy oladi).
3. Supabase Auth'da bitta admin foydalanuvchi yarating, uning UUID'sini `is_admin()` funksiyasiga yozing.
4. `get-test`, `submit-result`, `reveal-answers` Edge Function'larini deploy qiling.
5. `js/config.js`'ga yangi loyihaning URL/anon key'ini yozing.
6. Admin panel → Boshqarish → O'quvchilar → "🔑 Login yo'q o'quvchilar uchun barchasiga login yaratish" tugmasi orqali barcha o'quvchilarga bir yo'la login+parol yaratiladi (pastda batafsil).

## Savollarni qo'shish

Ikki yo'l bor:

- **Qo'lda**: Admin panel → Boshqarish → Savollar — sinf va fanni tanlab, savol/variantlar/to'g'ri javob/izohni kiritasiz.
- **Ommaviy import**: Admin panel → Bazani yangilash — eski Google Sheets havolasini (CSV) kiritib, "Import qilish" tugmasini bosasiz. Ustunlar tartibi: Sinf, Fan, Savol, A, B, C, D, To'g'ri javob (a/b/c/d), Izoh. Sinf ustunida bir nechta sinf ham qo'llab-quvvatlanadi ("5,6,7" yoki "5-8").

## Kirish darvozasi (barcha rollar uchun yagona)

Saytga kirilganda darhol to'liq ekranli login karta chiqadi — hech narsa avval ko'rinmaydi, login shart. Bitta umumiy login+parol maydoni bor; kim ekanligi (admin/o'qituvchi/o'quvchi) kiritilgandan keyin **avtomatik aniqlanadi** va tegishli, to'liq alohida panelga yo'naltiriladi:

- Login `"@"` belgisini o'z ichiga olsa — email sifatida to'g'ridan-to'g'ri ishlatiladi.
- `ADMIN_LOGIN_HINT` (masalan `ustozpro`) ga teng bo'lsa — `ADMIN_EMAIL`ga moslashtiriladi.
- Aks holda — avtomatik `@ustozpro.local` qo'shiladi (o'qituvchi/o'quvchi loginlari email shaklida bo'lishi shart emas).

Kirishdan so'ng `is_admin()` → `get_my_teacher_info()` → `get_my_student_info()` RPC'lari ketma-ket tekshiriladi va birinchi mos kelgan rolga qarab: admin → `screen-admin`/`screen-manage`, o'qituvchi → alohida `screen-teacher`, o'quvchi → alohida `screen-student`. Anonim (login qilmagan) test topshirish endi umuman yo'q — har bir o'quvchi avval o'z hisobiga kirib, testni **o'z panelidan** boshlaydi.

## O'quvchi paneli (login + parol, PIN emas)

O'quvchilar o'z login+paroli bilan kirib, "Mening kabinetim"da fan tanlab yangi test boshlashlari, o'zlarining test tarixini, 1200/2000 ballik reytingdagi o'rnini va fan bo'yicha rivojlanish grafigini ko'rishlari, shuningdek o'z parolini almashtirishlari mumkin.

- **Nega PIN emas endi**: barcha uch rol bitta autentifikatsiya mexanizmiga (Supabase Auth) o'tkazildi — bu login darvozasini, sessiya boshqaruvini va parol almashtirishni (`supabase.auth.updateUser`) uchala rol uchun ham bitta umumiy yo'l bilan ishlatish imkonini beradi. Eski PIN tizimi (`student_auth`/`student_sessions` jadvallari, 4 ta maxsus Edge Function) butunlay olib tashlangan.
- **Login+parol qanday paydo bo'ladi**: o'quvchilar o'zlari ro'yxatdan o'tmaydi — admin ularga hisob yaratadi. Login ism-familiyadan avtomatik generatsiya qilinadi (kichik harf, bo'shliq → nuqta, apostrof olib tashlanadi, to'qnashuvda raqam qo'shiladi — masalan `abdumutaliyeva.asalxon`), parol esa 8 xonali tasodifiy satr. Ikkalasi ham **faqat yaratilgan paytda bir marta** ko'rsatiladi.
- **Yaratish**: Admin panel → Boshqarish → O'quvchilar:
  - **"🔑 Login yo'q o'quvchilar uchun barchasiga login yaratish"** — hisobi hali yo'q barcha o'quvchilar uchun bir yo'la yaratadi (`admin_bulk_create_student_logins` RPC), natijani ro'yxat ko'rinishida (login/parol) modal orqali ko'rsatadi, nusxalab olish mumkin.
  - Har bir o'quvchi qatorida: hisobi yo'q bo'lsa 🔑 (bitta login yaratish, `admin_create_student_login`), bor bo'lsa 🔄 (parolni tiklash, `admin_reset_student_password`).
- **Ma'lumotlar izolyatsiyasi**: `student_accounts` jadvalida RLS yoqilgan, lekin hech qanday siyosat yo'q — na `anon`, na oddiy `authenticated` uni to'g'ridan-to'g'ri o'qiy olmaydi, faqat `SECURITY DEFINER` RPC (`is_admin()` tekshiruvi bilan) orqali kirish mumkin. O'quvchi o'z natijalarini `is_own_result()` orqali, o'z reytingini esa faqat `get_my_rating()` orqali (boshqalarning ismini ko'rmasdan) ko'radi.
- **Identifikatsiya soxtalashtirishdan himoya**: `get-test`/`submit-result` endi mijoz yuborgan ism/sinfga ishonmaydi — chaqiruvchining haqiqiy sessiya tokenini `supabase.auth.getUser()` bilan tekshirib, `student_accounts`dan haqiqiy ism/sinfni serverda o'zi aniqlaydi. Boshqa o'quvchi nomidan soxta so'rov yuborishga urinish natijani baribir haqiqiy hisobga yozadi.

## O'qituvchi paneli (fan bo'yicha cheklangan, to'liq alohida ekran)

Bitta super-admin (`ustozpro@ustozpro.local`) dan tashqari, admin panel orqali **fan o'qituvchilari** uchun ham hisob yaratish mumkin — har biri **faqat o'ziga biriktirilgan fan(lar)ni, barcha sinflar bo'yicha** ko'radi/boshqaradi (masalan "Tarix o'qituvchisi" 5–8-sinflarning barcha Tarix savol/natijalarini boshqaradi, boshqa fanlarga tegmaydi). O'qituvchi paneli (`screen-teacher`) admin ekranlaridan (`screen-admin`/`screen-manage`) **to'liq mustaqil** — bitta umumiy ekranni bo'lishmaydi.

- **Hisob yaratish**: Admin panel → Boshqarish → O'qituvchilar — ism, email, vaqtinchalik parol va fan(lar)ni belgilab qo'shasiz (`admin_create_teacher` RPC). Parolni keyinroq 🔑 tugmasi orqali tiklash, 🗑️ orqali hisobni butunlay o'chirish (login darhol ishlamay qoladi) mumkin.
- **Kirish**: xuddi barcha rollar kabi umumiy login darvozasi orqali (email/login + parol, Supabase Auth). Muvaffaqiyatli kirishdan so'ng `resolveCurrentRole()` `is_admin()` va `get_my_teacher_info()` RPC'lari orqali "kim ekanini" aniqlaydi va o'qituvchini to'g'ridan-to'g'ri `screen-teacher`ga yo'naltiradi — admin ekranlarini umuman ko'rmaydi.
- **Panelda mavjud**: faqat o'z fani(lar)i bo'yicha savol qo'shish/tahrirlash/o'chirish (bitta-bitta yoki ommaviy matn orqali), faqat o'z fani natijalari jadvali (endi **o'chirish tugmasi bilan** — avval faqat admin o'chira olardi), va parolni almashtirish.
- **Haqiqiy xavfsizlik chegarasi — RLS, UI emas**: `questions` va `results` jadvallaridagi RLS siyosatlari `can_manage_subject()`/`is_teacher_for_subject()` funksiyalari orqali fan bo'yicha cheklangan — UI cheklovini devtools orqali chetlab o'tishga urinilsa ham (masalan boshqa fanga savol qo'shishga urinish), Postgres so'rovni to'g'ridan-to'g'ri rad etadi (`42501` xatosi, jonli sinovda tasdiqlangan). Reyting RPC'lari (`get_monthly_rating` va h.k.) ham DB darajasida faqat haqiqiy super-adminga qaytaradi, chunki ular butun sinf bo'yicha jamlangan ma'lumotni ko'rsatadi.

## Xavfsizlik

- Anonim (login qilmagan) foydalanuvchi hech narsani o'qiy olmaydi — `classes`/`subjects`/`students`/`settings`/`questions`/`results` barchasi `auth.uid() is not null` yoki fan/egalik bo'yicha cheklangan. Anonim test topshirish umuman yo'q.
- `questions.correct_option` va `results` jadvallari anon foydalanuvchiga hech qachon to'g'ridan-to'g'ri REST orqali ko'rinmaydi (RLS bilan tekshirilgan).
- Test paytida savollar `get-test` orqali **to'g'ri javobsiz** yuboriladi; baholash `submit-result`da serverda amalga oshadi.
- **`get-test`/`submit-result` mijoz yuborgan identifikatsiyaga ishonmaydi**: har ikkalasi ham chaqiruvchining `Authorization` sarlavhasidagi haqiqiy sessiya tokenini `supabase.auth.getUser()` bilan tekshirib, `student_accounts` orqali haqiqiy ism/sinfni serverda o'zi aniqlaydi — mijoz boshqa ism/sinf yuborsa ham e'tiborga olinmaydi.
- "To'g'ri javoblarni ko'rish" paroli ham serverda (`reveal-answers`) tekshiriladi — parol noto'g'ri bo'lsa hech qanday javob qaytmaydi.
- Admin/o'qituvchi/o'quvchi autentifikatsiyasi barchasi haqiqiy Supabase Auth orqali; RLS siyosatlari admin uchun bitta belgilangan UUID'ga, o'qituvchi uchun `teacher_subjects`dagi fanlarga, o'quvchi uchun `student_accounts` orqali faqat o'z natijalariga yozish/o'qishga ruxsat beradi.
- Reyting RPC funksiyalari (`get_monthly_rating` va h.k.) faqat haqiqiy super-adminga qaytaradi; o'quvchi esa faqat `get_my_rating()` orqali o'zining o'rnini ko'radi (boshqalarning ismini emas) — bularning barchasi Supabase Security Advisor orqali muntazam tasdiqlanadi.

### Bitta ixtiyoriy xavfsizlik yaxshilanishi (hozircha qo'llanilmagan)

Supabase'ning **"Leaked password protection"** (HaveIBeenPwned.org bazasi orqali parol tekshiruvi) funksiyasi faqat **Pro Plan va undan yuqori** tarifda mavjud, Free tarifda Dashboard'da umuman ko'rinmaydi. Loyiha hozir Free tarifda ishlaydi va bitta admin akkaunti bo'lgani uchun bu ayni damda kritik emas. Agar kelajakda Pro Plan'ga o'tilsa, buni Dashboard → Authentication → Sign In / Providers → Email → Password Security bo'limidan yoqish mumkin.

## Texnologiyalar

- Vanilla JavaScript (ES6+), CSS custom properties
- [jsPDF](https://github.com/parallax/jsPDF) + AutoTable — PDF eksport
- [SheetJS](https://sheetjs.com/) — Excel eksport
- [Supabase](https://supabase.com/) — Postgres, Auth, Edge Functions
- Telegram Bot API — natija xabarnomalari (server tomonidan yuboriladi)
