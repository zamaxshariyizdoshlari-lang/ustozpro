// platform-create-org — platforma egasi (platform_admins) yangi tashkilot va uning
// birinchi adminini bir amalda yaratadi. Chaqiruvchi haqiqiy Supabase JWT bilan keladi
// (verify_jwt=true), identifikatsiya auth.getUser() orqali, keyin platform_admins'da
// borligi service_role bilan tekshiriladi (RLS'da bu jadvalga siyosat yo'q — faqat
// shu kabi funksiyalar orqali o'qiladi).
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

    const { org_name, org_slug, admin_full_name, admin_email, admin_password } = await req.json();
    if (!org_name || !org_slug) return json({ error: "missing_org_fields" }, 400);
    if (!admin_full_name || !admin_email || !admin_password || admin_password.length < 6) {
      return json({ error: "missing_admin_fields" }, 400);
    }

    const slug = String(org_slug).trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: "invalid_slug" }, 400);

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name: String(org_name).trim(), slug })
      .select("id, name, slug, status, created_at")
      .single();
    if (orgErr) {
      if (orgErr.code === "23505") return json({ error: "slug_taken" }, 409);
      return json({ error: "org_create_failed", message: orgErr.message }, 500);
    }

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: String(admin_email).trim().toLowerCase(),
      password: admin_password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      await supabase.from("organizations").delete().eq("id", org.id);
      const msg = createErr?.message || "";
      return json({ error: msg.toLowerCase().includes("already") ? "email_taken" : "admin_create_failed", message: msg }, 500);
    }

    const { error: linkErr } = await supabase
      .from("admin_accounts")
      .insert({ id: created.user.id, org_id: org.id, full_name: String(admin_full_name).trim() });
    if (linkErr) {
      await supabase.auth.admin.deleteUser(created.user.id);
      await supabase.from("organizations").delete().eq("id", org.id);
      return json({ error: "admin_link_failed", message: linkErr.message }, 500);
    }

    await supabase.from("settings").insert({ org_id: org.id });

    return json({ org, admin: { id: created.user.id, email: created.user.email } });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
