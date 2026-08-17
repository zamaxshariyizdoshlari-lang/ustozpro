// platform-set-org-status — tashkilotni faollashtirish/to'xtatish (status='active'|'suspended').
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(url, serviceKey);
    const { data: platformAdmin } = await supabase.from("platform_admins").select("id").eq("id", userData.user.id).maybeSingle();
    if (!platformAdmin) return json({ error: "not_platform_admin" }, 403);

    const { org_id, status } = await req.json();
    if (!org_id || !["active", "suspended"].includes(status)) return json({ error: "invalid_input" }, 400);

    const { error } = await supabase.from("organizations").update({ status }).eq("id", org_id);
    if (error) return json({ error: "update_failed", message: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
