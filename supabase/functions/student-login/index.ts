// student-login — sinf + ism + PIN orqali kirish. Muvaffaqiyatli bo'lsa
// student_sessions'ga opaque token yozadi (30 kun amal qiladi) va uni qaytaradi.
// 5 marta xato PIN = 15 daqiqa bloklash.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_DAYS = 30;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { class_name, student_name, pin } = await req.json();
    if (!class_name || !student_name || !pin) return json({ error: "missing_fields" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cls } = await supabase.from("classes").select("id").eq("name", class_name).maybeSingle();
    if (!cls) return json({ error: "invalid_credentials" });

    const { data: student } = await supabase.from("students").select("id, full_name").eq("class_id", cls.id).eq("full_name", student_name).maybeSingle();
    if (!student) return json({ error: "invalid_credentials" });

    const { data: auth } = await supabase.from("student_auth").select("*").eq("student_id", student.id).maybeSingle();
    if (!auth || !auth.pin_hash) return json({ error: "pin_not_set" });

    if (auth.pin_locked_until && new Date(auth.pin_locked_until) > new Date()) {
      return json({ error: "locked", locked_until: auth.pin_locked_until });
    }

    const { data: valid } = await supabase.rpc("verify_pin_hash", { p_hash: auth.pin_hash, p_pin: pin });

    if (!valid) {
      const attempts = (auth.pin_attempts || 0) + 1;
      const update: Record<string, unknown> = { pin_attempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        update.pin_locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        update.pin_attempts = 0;
      }
      await supabase.from("student_auth").update(update).eq("student_id", student.id);
      if (attempts >= MAX_ATTEMPTS) return json({ error: "locked", locked_until: update.pin_locked_until });
      return json({ error: "wrong_pin", attempts_left: MAX_ATTEMPTS - attempts });
    }

    await supabase.from("student_auth").update({ pin_attempts: 0, pin_locked_until: null }).eq("student_id", student.id);

    const token = crypto.randomUUID() + crypto.randomUUID();
    const expires_at = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    const { error: sessErr } = await supabase.from("student_sessions").insert({ token, student_id: student.id, expires_at });
    if (sessErr) return json({ error: "session_create_failed" }, 500);

    return json({ token, student: { full_name: student.full_name, class_name } });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
