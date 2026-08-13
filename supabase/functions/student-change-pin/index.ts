// student-change-pin — o'quvchi eski PIN'ni tasdiqlab, yangisini o'rnatadi.
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
    const { token, old_pin, new_pin } = await req.json();
    if (!token || !old_pin || !new_pin) return json({ error: "missing_fields" }, 400);
    if (!/^\d{4}$/.test(new_pin)) return json({ error: "invalid_pin_format" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await supabase.from("student_sessions").select("student_id, expires_at").eq("token", token).maybeSingle();
    if (!session || new Date(session.expires_at) < new Date()) return json({ error: "invalid_session" });

    const { data: auth } = await supabase.from("student_auth").select("*").eq("student_id", session.student_id).maybeSingle();
    if (!auth || !auth.pin_hash) return json({ error: "pin_not_set" });

    const { data: valid } = await supabase.rpc("verify_pin_hash", { p_hash: auth.pin_hash, p_pin: old_pin });
    if (!valid) return json({ error: "wrong_pin" });

    const { data: newHash } = await supabase.rpc("hash_pin", { p_pin: new_pin });
    const { error: updErr } = await supabase.from("student_auth").update({ pin_hash: newHash }).eq("student_id", session.student_id);
    if (updErr) return json({ error: "update_failed" }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
