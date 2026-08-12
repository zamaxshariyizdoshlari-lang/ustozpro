# Ustoz Pro — Oylik Test Platformasi

Zamaxshariy Izdoshlari Maktabi uchun o'quvchilarni test qilish, natijalarni saqlash va oylik reyting yuritish platformasi. Sof HTML/CSS/JavaScript (build vositasisiz), ma'lumotlar brauzerning `localStorage`'ida saqlanadi.

## Loyiha tuzilishi

```
Ustozpro/
├── index.html              — sahifa tarkibi (markup)
├── css/
│   └── style.css           — barcha uslublar
├── js/
│   ├── app.js               — ilova mantig'i (ekranlar, test, admin, reyting, eksport)
│   ├── config.js             — maxfiy sozlamalar (.gitignore'da, GitHub'ga yuklanmaydi)
│   └── config.example.js     — config.js uchun namuna/shablon
├── .gitignore
└── README.md
```

## Ishga tushirish (lokal)

Bu statik sayt — server kerak emas, lekin `fetch()` chaqiruvlari (Google Sheets, Supabase, Telegram) `file://` protokolida ba'zi brauzerlarda bloklanishi mumkin, shuning uchun lokal server orqali ochish tavsiya etiladi:

```bash
cd Ustozpro
python -m http.server 8080
```

Keyin brauzerda: `http://localhost:8080`

## Sozlash (`js/config.js`)

`js/config.js` fayli `.gitignore`'da bo'lgani uchun repozitoriyga tushmaydi. Loyihani birinchi marta klonlaganda `js/config.example.js`'ni nusxalab `js/config.js` deb saqlang va o'z qiymatlaringizni kiriting:

- `TG_TOKEN`, `TG_CHAT` — Telegram bot orqali natija xabarnomalari yuborish uchun (@BotFather)
- `SHEET_CSV` — Google Sheets'da savollar jadvali ("Publish to web → CSV" havolasi)
- `SUPABASE_URL` — natijalarni serverga saqlaydigan Supabase Edge Function manzili
- `ADMIN_LOGIN` / `ADMIN_PASS` — admin panelga kirish
- `ANSWER_PASS` — natija sahifasida "to'g'ri javoblarni ko'rish" paroli

## ⚠️ Muhim xavfsizlik eslatmasi

Bu sof frontend (backend/server yo'q), shuning uchun `config.js` ichidagi barcha qiymatlar — Telegram bot tokeni, admin paroli, javoblarni ko'rish paroli — sahifa manba kodida (`view-source`) har doim ko'rinadi. Bu quyidagilarni anglatadi:

- Har qanday o'quvchi brauzer konsolidan yoki "view source" orqali admin parolini va to'g'ri javoblar parolini topishi mumkin.
- Telegram bot tokenini bilgan har kim o'sha bot nomidan xabar yubora oladi.

`config.js` `.gitignore`ga qo'shilgani sababli **GitHub repozitoriyga hech qachon yuklanmaydi** — bu maxfiylikni oshiradi, lekin sahifani ko'rgan har bir foydalanuvchi baribur qiymatlarni ko'ra oladi, chunki ular brauzerga jo'natiladi. Haqiqiy himoya uchun kelajakda quyidagilar tavsiya etiladi: admin autentifikatsiyasi va Telegram xabarlarini serverga (masalan, mavjud Supabase Edge Function'ga) ko'chirish, parolni faqat backend orqali tekshirish.

## Texnologiyalar

- Vanilla JavaScript (ES6+), CSS custom properties
- [jsPDF](https://github.com/parallax/jsPDF) + AutoTable — PDF eksport
- [SheetJS](https://sheetjs.com/) — Excel eksport
- Google Sheets — savollar bazasi manbai (CSV)
- Supabase Edge Function — natijalarni saqlash
- Telegram Bot API — natija xabarnomalari
