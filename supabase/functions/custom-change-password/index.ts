// custom-change-password — o'quvchi yoki o'qituvchi o'z parolini almashtiradi.
// Rol custom_sessions'dan aniqlanadi, tegishli jadvalning password_hash'i
// yangilanadi va must_change_password o'chiriladi.
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

    const { data: session } = await supabase.from("custom_sessions").select("*").eq("id", token).maybeSingle();
    if (!session || new Date(session.expires_at).getTime() < Date.now()) return json({ error: "unauthorized" }, 401);

    const { new_password } = await req.json();
    if (!new_password || new_password.length < 6) return json({ error: "password_too_short" }, 400);

    const { data: hashed } = await supabase.rpc("_hash_password", { p_password: new_password });
    if (!hashed) return json({ error: "hash_failed" }, 500);

    const table = session.role === "teacher" ? "teachers" : "student_accounts";
    const { error } = await supabase.from(table).update({ password_hash: hashed, must_change_password: false }).eq("id", session.account_id);
    if (error) return json({ error: "update_failed" }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
