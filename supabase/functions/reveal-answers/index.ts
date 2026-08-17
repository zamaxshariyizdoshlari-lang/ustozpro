// reveal-answers — o'quvchi paroli tekshirilgach, to'g'ri javoblarni qaytaradi.
// Chaqiruvchi kimligi custom_sessions bir martalik tokenimiz orqali
// aniqlanadi (verify_jwt=false). Faqat chaqiruvchining O'ZIGA tegishli,
// allaqachon TOPSHIRILGAN (consumed) test sessiyasining javoblarini qaytaradi.
// Parol endi TASHKILOT-DOIRASIDA app_secrets'da (har maktab o'z parolini
// tanlaydi), faqat service_role orqali o'qiladi.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: customSession } = await supabase.from("custom_sessions").select("*").eq("id", token).maybeSingle();
    if (!customSession || customSession.role !== "student" || new Date(customSession.expires_at).getTime() < Date.now()) {
      return json({ error: "unauthorized" }, 401);
    }
    const orgId = customSession.org_id;

    const { data: account } = await supabase.from("student_accounts").select("student_id").eq("id", customSession.account_id).eq("org_id", orgId).maybeSingle();
    if (!account) return json({ error: "not_a_student" }, 403);

    const { session_id, password } = await req.json();
    if (!session_id || !password) return json({ error: "missing_fields" }, 400);

    const { data: passRow } = await supabase.from("app_secrets").select("value").eq("org_id", orgId).eq("key", "ANSWER_PASS").maybeSingle();
    if (!passRow || password !== passRow.value) {
      return json({ error: "wrong_password" });
    }

    const { data: session } = await supabase.from("test_sessions").select("*").eq("id", session_id).eq("org_id", orgId).maybeSingle();
    if (!session || session.student_id !== account.student_id) return json({ error: "invalid_session" }, 403);
    if (!session.consumed_at) return json({ error: "not_submitted_yet" }, 409);

    const { data: questions, error } = await supabase
      .from("questions")
      .select("id, correct_option")
      .eq("org_id", orgId)
      .in("id", session.question_ids);

    if (error || !questions) return json({ error: "fetch_failed" }, 500);

    return json({ answers: questions });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
