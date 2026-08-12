/* ═══════════════════════════════════════════════
   CONFIG TEMPLATE — nusxa oling va "config.js" deb saqlang
   Bu fayl GitHub'ga yuklanadi, lekin config.js yuklanmaydi (.gitignore).
═══════════════════════════════════════════════ */
const CONFIG = {
  // Telegram bot orqali natijalar yuboriladi. @BotFather'dan token oling.
  TG_TOKEN:    "YOUR_TELEGRAM_BOT_TOKEN",
  TG_CHAT:     "YOUR_TELEGRAM_CHAT_ID",

  // Savollar bazasi (Google Sheets -> "Publish to web" -> CSV link)
  SHEET_CSV:   "YOUR_GOOGLE_SHEET_CSV_URL",

  // Supabase Edge Function (natijalarni serverga saqlash uchun)
  SUPABASE_URL:"YOUR_SUPABASE_FUNCTION_URL",

  STORAGE_KEY: "ustoz_pro_v50",
  SESSION_KEY: "ustoz_pro_session_v3",
  SETTINGS_KEY:"ustoz_pro_settings_v2",

  // Admin panelga kirish
  ADMIN_LOGIN: "admin",
  ADMIN_PASS:  "CHANGE_ME",

  // To'g'ri javoblarni ko'rish uchun parol
  ANSWER_PASS: "CHANGE_ME"
};
