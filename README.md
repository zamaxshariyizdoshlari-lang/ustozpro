# Ustoz Pro — Oylik Test Platformasi

Zamaxshariy Izdoshlari Maktabi uchun o'quvchilarni test qilish, natijalarni saqlash va oylik reyting yuritish platformasi. Frontend — sof HTML/CSS/JavaScript (build vositasisiz); backend — Supabase (Postgres + Auth + Edge Functions).

## Arxitektura

- **Frontend**: statik sayt, hech qanday build qadam kerak emas.
- **Baza**: Supabase Postgres — `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `class_settings`, `app_secrets`, `teachers`, `teacher_subjects`, `student_accounts`, `admin_accounts`, `custom_sessions`, `test_sessions`, `audit_log` jadvallari. Sxema `supabase/migrations/` papkasida versiyalangan.
- **Auth — ikki mustaqil mexanizm, rol bo'yicha ajratilgan**:
  - **Admin** — haqiqiy **Supabase Auth** (email/parol), RLS `admin_accounts`/`is_admin()` orqali ishlaydi. Istalgan sondagi admin bo'lishi mumkin.
  - **O'qituvchi va o'quvchi** — Supabase Auth'da **umuman mavjud emas**. Ular o'z login+parolini (bcrypt bilan to'g'ridan-to'g'ri `teachers.password_hash`/`student_accounts.password_hash`da saqlangan) `custom-login` Edge Function orqali tekshiradilar, muvaffaqiyatli bo'lsa `custom_sessions` jadvaliga tasodifiy bearer-token yoziladi — shu token brauzerning `localStorage`'ida saqlanadi va keyingi har bir so'rovda ishlatiladi. Ularning barcha ma'lumotlarga kirishi RLS orqali emas, tegishli `custom-*` Edge Function ichida (`service_role` bilan, qo'lda "bu mening fanim/natijam"mi tekshiruvi bilan) amalga oshadi — chunki ular hech qachon Supabase JWT olmaydi, `auth.uid()` ular uchun hech qachon to'lmaydi.
  - Uch rol ham bitta umumiy login darvozasidan kiradi (kim ekanligi avtomatik aniqlanadi — avval admin sifatida, keyin custom-login orqali sinaladi) va to'liq alohida ekranlarda ishlaydi (`screen-admin`/`screen-manage`, `screen-teacher`, `screen-student`).
- **Edge Functions** (`supabase/functions/` — bu repoda ham saqlanadi, Supabase loyihasiga alohida deploy qilinadi, barchasi `verify_jwt=false` — chunki o'quvchi/o'qituvchi chaqiruvchisida haqiqiy Supabase JWT yo'q, identifikatsiya `custom_sessions` orqali qo'lda tekshiriladi):
  - `custom-login` — login+parolni `student_accounts`/`teachers`da (pgcrypto bcrypt orqali) tekshiradi, muvaffaqiyatli bo'lsa `custom_sessions`ga 60 kunlik token yozadi.
  - `custom-logout` — chaqiruvchining `custom_sessions` qatorini o'chiradi.
  - `custom-change-password` — o'quvchi/o'qituvchi o'z parolini almashtiradi (`password_hash`ni yangilaydi, `must_change_password`ni o'chiradi).
  - `custom-student-panel` — o'quvchi paneli uchun profil, o'z sinfidagi fanlar, samarali sozlamalar, test tarixi va reytingni bitta so'rovda qaytaradi.
  - `custom-teacher-panel` — o'qituvchi paneli uchun profil, biriktirilgan fanlar, barcha sinflar va fan ro'yxatini (savol CRUD kaskad-tanlovi uchun) qaytaradi.
  - `custom-teacher-questions` — o'qituvchining savol CRUD amallari (`list`/`create`/`update`/`delete`/`bulk_create`), fan egaligi (`teacher_subjects`) har bir amalda qo'lda tekshiriladi.
  - `custom-teacher-results` — o'qituvchining o'z fani(lari) natijalarini ko'rish/o'chirishi, xuddi shunday fan egaligi tekshiruvi bilan.
  - `get-test` — tanlangan fan uchun savollarni **to'g'ri javobsiz** qaytaradi; o'quvchini chaqiruvchining **custom-session tokeni** orqali aniqlaydi (mijoz yuborgan ism/sinfga ishonmaydi). Tanlangan savollarni bir martalik `test_sessions` biletiga yozadi.
  - `submit-result` — javoblarni serverda baholaydi, natijani bazaga yozadi, Telegram xabarnomasini yuboradi (bot tokeni faqat serverda). `question_ids`/`subject_name`ni mijozdan emas, `get-test` yaratgan bir martalik sessiya biletidan oladi — bilet bir marta ishlatiladi va faqat egasiga tegishli.
  - `reveal-answers` — custom-session tokenini talab qiladi, faqat chaqiruvchining o'ziga tegishli va allaqachon topshirilgan sessiyaning javoblarini qaytaradi (parol qo'shimcha himoya qatlami sifatida qoladi).
- **Reyting hisob-kitobi** (`get_monthly_rating`, `get_mutolaa_rating`, `get_rating_formula_info` admin uchun; `_compute_monthly_rating`/`_compute_mutolaa_rating` `custom-student-panel` ichidan chaqiriladi) — Postgres funksiyalari sifatida serverda hisoblanadi, hech qachon butun natijalar jadvali brauzerga tortib olinmaydi.

> ⚠️ **Eslatma**: `supabase/migrations/` da o'quvchi/sinf/fan **seed (namunaviy) ma'lumotlari yo'q** — chunki bu repo public, va haqiqiy o'quvchi ismlari (F.I.Sh.) shaxsiy ma'lumot hisoblanadi. Ular faqat Supabase bazasida saqlanadi, GitHub'ga hech qachon yuklanmaydi.

Bu arxitektura tufayli **to'g'ri javoblar, parollar va Telegram tokeni hech qachon brauzerga to'liq jo'natilmaydi** — hammasi server tomonida (Edge Function ichida, `service_role` kaliti bilan) ishlanadi.

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

1. `supabase/migrations` orqali barcha jadvallarni yarating: `classes`, `students`, `subjects`, `questions`, `results`, `settings`, `class_settings`, `app_secrets`, `teachers`, `teacher_subjects`, `student_accounts`, `admin_accounts`, `custom_sessions`, `test_sessions`, `audit_log`. RLS faqat admin uchun ma'noga ega (`questions`/`results`/`classes`/`students`/`subjects`/`settings`/`class_settings` — barchasi `is_admin()` bilan cheklangan); `app_secrets`/`teachers`/`teacher_subjects`/`student_accounts`/`admin_accounts`/`custom_sessions`/`test_sessions` esa RLS yoqilgan-lekin-siyosatsiz — faqat `service_role` (Edge Function ichidan) yoki `SECURITY DEFINER` RPC orqali kirish mumkin.
2. `app_secrets` jadvaliga `TG_TOKEN`, `TG_CHAT`, `ANSWER_PASS` qiymatlarini kiriting (faqat Edge Function'lar `service_role` orqali o'qiy oladi).
3. Supabase Auth'da bitta admin foydalanuvchi yarating, uning UUID'sini `admin_accounts`ga yozing.
4. Barcha Edge Function'larni deploy qiling (`get-test`, `submit-result`, `reveal-answers`, `custom-login`, `custom-logout`, `custom-change-password`, `custom-student-panel`, `custom-teacher-panel`, `custom-teacher-questions`, `custom-teacher-results`) — barchasi `verify_jwt=false` bilan.
5. `js/config.js`'ga yangi loyihaning URL/anon key'ini yozing.
6. Admin panel → Boshqarish → O'quvchilar → "🔑 Login yo'q o'quvchilar uchun barchasiga login yaratish" tugmasi orqali barcha o'quvchilarga bir yo'la login+parol yaratiladi (pastda batafsil).

## Savollarni qo'shish

Ikki yo'l bor:

- **Qo'lda**: Admin panel → Boshqarish → Savollar — sinf va fanni tanlab, savol/variantlar/to'g'ri javob/izohni kiritasiz.
- **Ommaviy import**: Admin panel → Bazani yangilash — eski Google Sheets havolasini (CSV) kiritib, "Import qilish" tugmasini bosasiz. Ustunlar tartibi: Sinf, Fan, Savol, A, B, C, D, To'g'ri javob (a/b/c/d), Izoh. Sinf ustunida bir nechta sinf ham qo'llab-quvvatlanadi ("5,6,7" yoki "5-8").

## Kirish darvozasi (barcha rollar uchun yagona)

Saytga kirilganda darhol to'liq ekranli login karta chiqadi — hech narsa avval ko'rinmaydi, login shart. Bitta umumiy login+parol maydoni bor; kim ekanligi kiritilgandan keyin **avtomatik aniqlanadi**, login shakliga qarab oldindan taxmin qilinmaydi:

1. Login `"@"` belgisini o'z ichiga olsa yoki `ADMIN_LOGIN_HINT`ga teng bo'lsa — avval **haqiqiy Supabase Auth** orqali admin sifatida sinaladi (`supabase.auth.signInWithPassword`).
2. Muvaffaqiyatsiz bo'lsa (yoki login boshidanoq email-shaklda bo'lmasa) — **`custom-login` Edge Function** orqali o'quvchi/o'qituvchi sifatida sinaladi.

Bu ikki bosqichli yondashuv zarur, chunki o'qituvchi login'lari ham ko'pincha email-ko'rinishda bo'ladi (masalan tarixiy sabablarga ko'ra) — shakliga qarab emas, qaysi tizimda haqiqatda mavjudligiga qarab ajratiladi. Muvaffaqiyatli kirishdan so'ng `resolveCurrentRole()` avval joriy Supabase Auth sessiyasini (`is_admin()`), bo'lmasa saqlangan custom-token'ni (`custom-teacher-panel`/`custom-student-panel`) tekshiradi va tegishli, to'liq alohida panelga yo'naltiradi: admin → `screen-admin`/`screen-manage`, o'qituvchi → alohida `screen-teacher`, o'quvchi → alohida `screen-student`. Custom-token brauzerning `localStorage`'ida (`ustoz_pro_custom_session`) saqlanadi — sahifa qayta yuklanganda ham sessiya davom etadi, muddati tugagan/yaroqsiz token esa avtomatik tozalanadi. Anonim (login qilmagan) test topshirish umuman yo'q — har bir o'quvchi avval o'z hisobiga kirib, testni **o'z panelidan** boshlaydi.

## O'quvchi paneli (custom login + parol, Supabase Auth'dan mustaqil)

O'quvchilar o'z login+paroli bilan kirib, "Mening kabinetim"da fan tanlab yangi test boshlashlari, o'zlarining test tarixini, 1200/2000 ballik reytingdagi o'rnini va fan bo'yicha rivojlanish grafigini ko'rishlari, shuningdek o'z parolini almashtirishlari mumkin.

- **Nega Supabase Auth emas endi**: avvalgi bosqichda o'quvchi/o'qituvchi ham Supabase Auth orqali "sintetik email" (`login@ustozpro.local`) hiylasi bilan kirar edi — bu professional emas edi va parolni tiklashning yagona yo'li faqat admin qo'lda ekanligi bilan cheklanardi. Endi ular Supabase Auth'ga umuman tegmaydi: login+parol to'g'ridan-to'g'ri `student_accounts.password_hash`da (bcrypt) saqlanadi, `custom-login` Edge Function tekshiradi, `custom_sessions`ga o'z sessiya-tokenini oladi. Mavjud 69 o'quvchining parollari o'tishda **saqlanib qoldi** (Supabase Auth ham bcrypt ishlatgani uchun hash to'g'ridan-to'g'ri ko'chirildi) — hech kim yangi parol o'rganishga majbur bo'lmadi.
- **Login+parol qanday paydo bo'ladi**: o'quvchilar o'zlari ro'yxatdan o'tmaydi — admin ularga hisob yaratadi. Login ism-familiyadan avtomatik generatsiya qilinadi (kichik harf, bo'shliq → nuqta, apostrof olib tashlanadi, to'qnashuvda raqam qo'shiladi — masalan `abdumutaliyeva.asalxon`), parol esa 8 xonali tasodifiy satr. Ikkalasi ham **faqat yaratilgan paytda bir marta** ko'rsatiladi.
- **Yaratish**: Admin panel → Boshqarish → O'quvchilar:
  - **"🔑 Login yo'q o'quvchilar uchun barchasiga login yaratish"** — hisobi hali yo'q barcha o'quvchilar uchun bir yo'la yaratadi (`admin_bulk_create_student_logins` RPC), natijani ro'yxat ko'rinishida (login/parol) modal orqali ko'rsatadi, nusxalab olish mumkin.
  - Har bir o'quvchi qatorida: hisobi yo'q bo'lsa 🔑 (bitta login yaratish, `admin_create_student_login`), bor bo'lsa 🔄 (parolni tiklash, `admin_reset_student_password` — darhol tegishli `custom_sessions` qatorini ham o'chiradi, eski sessiya tirik qolmasin uchun).
- **Ma'lumotlar izolyatsiyasi — RLS emas, Edge Function**: o'quvchi hech qachon Supabase JWT olmagani uchun RLS unga umuman tegishli emas (`student_accounts`da RLS yoqilgan-lekin-siyosatsiz). Buning o'rniga har bir so'rov `custom-student-panel`/`get-test`/`submit-result`/`reveal-answers`/`custom-change-password` Edge Function'i ichida `service_role` bilan, lekin **avval `custom_sessions`dan bearer-tokenni tekshirib, shu token qaysi o'quvchiga tegishli ekanini aniqlab, faqat o'sha o'quvchining ma'lumotini qaytarib** amalga oshadi.
- **Identifikatsiya soxtalashtirishdan himoya**: `get-test`/`submit-result` mijoz yuborgan ism/sinfga ishonmaydi — chaqiruvchining `custom_sessions` bearer-tokenini tekshirib, `student_accounts`dan haqiqiy ism/sinfni serverda o'zi aniqlaydi. Boshqa o'quvchi nomidan soxta so'rov yuborishga urinish natijani baribir haqiqiy hisobga yozadi.

## O'qituvchi paneli (fan bo'yicha cheklangan, to'liq alohida ekran)

Admin panel orqali **fan o'qituvchilari** uchun hisob yaratish mumkin — har biri **faqat o'ziga biriktirilgan fan(lar)ni, barcha sinflar bo'yicha** ko'radi/boshqaradi (masalan "Tarix o'qituvchisi" 5–8-sinflarning barcha Tarix savol/natijalarini boshqaradi, boshqa fanlarga tegmaydi). O'qituvchi paneli (`screen-teacher`) admin ekranlaridan (`screen-admin`/`screen-manage`) **to'liq mustaqil** — bitta umumiy ekranni bo'lishmaydi. O'quvchi kabi, o'qituvchi ham endi Supabase Auth'dan mustaqil — o'z custom login+paroli va `custom_sessions` tokeni bilan ishlaydi.

- **Hisob yaratish**: Admin panel → Boshqarish → O'qituvchilar — ism, login, vaqtinchalik parol va fan(lar)ni belgilab qo'shasiz (`admin_create_teacher` RPC). Login endi haqiqiy email bo'lishi shart emas. Parolni keyinroq 🔑 tugmasi orqali tiklash (darhol eski sessiyani ham bekor qiladi), 🗑️ orqali hisobni butunlay o'chirish (login va sessiya darhol ishlamay qoladi) mumkin.
- **Kirish**: umumiy login darvozasi orqali — avval admin sifatida, keyin `custom-login` orqali sinaladi (yuqorida batafsil). Muvaffaqiyatli kirishdan so'ng `resolveCurrentRole()` o'qituvchini to'g'ridan-to'g'ri `screen-teacher`ga yo'naltiradi — admin ekranlarini umuman ko'rmaydi.
- **Panelda mavjud**: faqat o'z fani(lar)i bo'yicha savol qo'shish/tahrirlash/o'chirish (bitta-bitta yoki ommaviy matn orqali), faqat o'z fani natijalari jadvali (o'chirish tugmasi bilan), va parolni almashtirish.
- **Haqiqiy xavfsizlik chegarasi — Edge Function kodi, RLS emas**: o'qituvchi endi Supabase JWT olmagani uchun `questions`/`results` RLS siyosatlari unga umuman tegishli emas (ular admin-only'ga soddalashtirilgan). Fan egaligi tekshiruvi endi `custom-teacher-questions`/`custom-teacher-results` Edge Function'lari ichida, TypeScript kodida amalga oshadi (`teacher_subjects` jadvalidan o'qituvchining fanlar ro'yxatini olib, so'ralgan `subject_id`/natija shu ro'yxatga tegishli ekanini tekshiradi) — boshqa fanga yozishga urinish `not_your_subject` (403) bilan rad etiladi, UI cheklovini devtools orqali chetlab o'tishga urinilsa ham server baribir rad etadi (jonli sinovda tasdiqlangan).

## Ko'p-adminlik va audit jurnali

`is_admin()` endi bitta qattiq kodlangan UUID emas, `admin_accounts` jadvalidan tekshiradi — Boshqarish → Adminlar bo'limidan ikkinchi (zaxira) admin qo'shish mumkin (`admin_create_admin` RPC). O'zini-o'zi o'chirish va oxirgi qolgan adminni o'chirish taqiqlangan (`admin_delete_admin` ichida tekshiriladi) — hech qachon adminsiz qolib ketmaslik uchun.

Muhim harakatlar (hisob yaratish/o'chirish, parol tiklash, sinf/o'quvchi/fan o'chirish, barcha natijalarni tozalash) `audit_log` jadvaliga yoziladi (`_log_action()` ichki yordamchisi orqali, faqat admin o'qiy oladi) va Boshqarish → Adminlar → "Audit jurnali"da so'nggi 200 yozuv sifatida ko'rinadi.

## Sinf darajasidagi sozlamalar

Global "Test sozlamalari" (savol soni, vaqt, urinishlar chegarasi) endi `class_settings` jadvali orqali bitta sinf uchun ustunlik bilan almashtirilishi mumkin — Admin panel → Sozlamalar → "Sinf uchun maxsus sozlamalar"da sinfni tanlab, faqat kerakli maydonlarni to'ldirasiz (bo'sh qoldirilgan maydonlar global sozlamadan meros oladi). `get-test`/`submit-result` shu ustuvorlikni serverda ham qo'llaydi — UI'da ko'rsatilgan qiymat bilan haqiqatda enforce qilingan qiymat har doim bir xil.

## Birinchi kirishda majburiy parol almashtirish

Admin yaratgan (yoki tiklagan) har bir o'quvchi/o'qituvchi hisobi `must_change_password = true` bilan boshlanadi. Shu holatda kirilganda panelning faqat "Parolni almashtirish" bo'limi ko'rinadi — qolgan hamma narsa (test boshlash, savol boshqaruvi, natijalar) parol almashtirilmaguncha yashiringan. Parol muvaffaqiyatli almashtirilgach (`custom-change-password` Edge Function `must_change_password`ni serverda o'chiradi) panel to'liq ochiladi.

## Xavfsizlik

- Admin RLS orqali himoyalangan (`is_admin()`); o'quvchi/o'qituvchi esa Supabase JWT olmagani uchun RLS'ga umuman tegishli emas — ularning barcha ma'lumot kirishi `custom-*` Edge Function'lar ichida, `custom_sessions` bearer-tokenidan kelib chiqib qo'lda tekshiriladi. Anonim (login qilmagan) foydalanuvchi hech narsani o'qiy olmaydi, anonim test topshirish umuman yo'q.
- `questions.correct_option` va `results` jadvallari anon/authenticated foydalanuvchiga hech qachon to'g'ridan-to'g'ri REST orqali ko'rinmaydi (RLS admin-only, qolgan hamma narsa Edge Function orqali).
- Test paytida savollar `get-test` orqali **to'g'ri javobsiz** yuboriladi; baholash `submit-result`da serverda amalga oshadi.
- **Bir martalik test-sessiyasi (`test_sessions`)**: `get-test` tanlagan savollarni serverda "bilet" sifatida saqlaydi; `submit-result` faqat shu biletga (mijoz yuborgan savol ro'yxatiga emas) ishonadi va uni bir marta ishlatadi. Bu uchta muammoni yopadi: (1) identifikatsiya soxtalashtirish, (2) `enable_attempt_limit` yoqilgan bo'lsa ham `submit-result`ni to'g'ridan-to'g'ri chaqirib chegarani chetlab o'tish, (3) `wrong_review` javobidan foydalanib to'g'ri javoblarni asta-sekin "taxmin qilib topish". `reveal-answers` ham endi shu biletga bog'langan — faqat egasi, faqat allaqachon topshirilgan test uchun.
- "To'g'ri javoblarni ko'rish" paroli ham serverda (`reveal-answers`) tekshiriladi — parol noto'g'ri bo'lsa hech qanday javob qaytmaydi.
- **Sessiya bekor qilish**: parol tiklanganda (admin tomonidan) yoki hisob o'chirilganda tegishli `custom_sessions` qatori(lari) darhol o'chiriladi — eski/kompromis bo'lgan token hisobdan uzoqroq umr ko'rolmaydi. `custom-logout` ham xuddi shunday — chiqishda token darhol ishlamay qoladi.
- Reyting hisob-kitobi hech qachon butun natijalar jadvalini brauzerga tortib olib client'da hisoblamaydi — admin uchun serverdagi RPC'lar, o'quvchi uchun `custom-student-panel` ichidagi hisob-kitob orqali, faqat o'zining o'rnini ko'radi (boshqalarning ismini emas).
- Muhim admin harakatlari `audit_log`ga yoziladi (yuqorida batafsil).
- Bu arxitektura Supabase'ning rasmiy "JWT Signing Key import" yo'lidan qasddan farqli tanlov — RLS o'quvchi/o'qituvchi uchun endi xavfsizlik devori emas (uning o'rnini Edge Function kodidagi qo'lda tekshiruvlar egallaydi), lekin bu tanlov loyihaning umumiy JWT kalitini almashtirish kabi hech qanday Dashboard-darajasidagi sezgir amalni talab qilmaydi.

### Bitta ixtiyoriy xavfsizlik yaxshilanishi (hozircha qo'llanilmagan)

Supabase'ning **"Leaked password protection"** (HaveIBeenPwned.org bazasi orqali parol tekshiruvi) funksiyasi faqat **Pro Plan va undan yuqori** tarifda mavjud, Free tarifda Dashboard'da umuman ko'rinmaydi. Loyiha hozir Free tarifda ishlaydi va bitta admin akkaunti bo'lgani uchun bu ayni damda kritik emas. Agar kelajakda Pro Plan'ga o'tilsa, buni Dashboard → Authentication → Sign In / Providers → Email → Password Security bo'limidan yoqish mumkin.

## Texnologiyalar

- Vanilla JavaScript (ES6+), CSS custom properties
- [jsPDF](https://github.com/parallax/jsPDF) + AutoTable — PDF eksport
- [SheetJS](https://sheetjs.com/) — Excel eksport
- [Supabase](https://supabase.com/) — Postgres, Auth, Edge Functions
- Telegram Bot API — natija xabarnomalari (server tomonidan yuboriladi)
