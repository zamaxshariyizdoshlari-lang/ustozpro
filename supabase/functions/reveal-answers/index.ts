// reveal-answers — o'qituvchi paroli tekshirilgach, to'g'ri javoblarni qaytaradi.
// Parol app_secrets jadvalida, faqat service_role orqali o'qiladi.
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
    const { question_ids, password } = await req.json();
    if (!Array.isArray(question_ids) || !password) {
      return json({ error: "missing_fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: passRow } = await supabase.from("app_secrets").select("value").eq("key", "ANSWER_PASS").maybeSingle();
    if (!passRow || password !== passRow.value) {
      return json({ error: "wrong_password" });
    }

    const { data: questions, error } = await supabase
      .from("questions")
      .select("id, correct_option")
      .in("id", question_ids);

    if (error || !questions) return json({ error: "fetch_failed" }, 500);

    return json({ answers: questions });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
