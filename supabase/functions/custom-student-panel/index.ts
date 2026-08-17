// custom-student-panel — o'quvchi paneli uchun kerakli hamma narsani bir
// so'rovda qaytaradi: profil, o'z sinfidagi fanlar, samarali sozlamalar
// (global+class_settings), test tarixi. Identifikatsiya custom_sessions
// token orqali (verify_jwt=false). Har bir so'rov session.org_id bilan
// cheklanadi — tashkilotlar aro ma'lumot sizib chiqmasligi uchun.
// Reyting (rating) funksiyasi mahsulotdan butunlay olib tashlangan.
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
    if (!session || session.role !== "student" || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ error: "unauthorized" }, 401);
    }
    const orgId = session.org_id;

    const { data: account } = await supabase
      .from("student_accounts")
      .select("student_id, login, must_change_password")
      .eq("id", session.account_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!account) return json({ error: "not_a_student" }, 403);

    const { data: student } = await supabase.from("students").select("id, full_name, class_id").eq("id", account.student_id).eq("org_id", orgId).single();
    const { data: cls } = await supabase.from("classes").select("id, name").eq("id", student.class_id).eq("org_id", orgId).single();

    const { data: subjects } = await supabase.from("subjects").select("name").eq("class_id", cls.id).eq("org_id", orgId).order("name");
    const { data: settings } = await supabase.from("settings").select("*").eq("org_id", orgId).maybeSingle();
    const { data: classSettings } = await supabase.from("class_settings").select("*").eq("class_id", cls.id).eq("org_id", orgId).maybeSingle();

    const effSettings = {
      question_count: classSettings?.question_count ?? settings?.question_count ?? 15,
      time_limit_minutes: classSettings?.time_limit_minutes ?? settings?.time_limit_minutes ?? 20,
      allow_custom: settings?.allow_custom ?? true,
    };

    const { data: history } = await supabase
      .from("results")
      .select("subject_name, score, total, percent, created_at")
      .eq("org_id", orgId)
      .eq("student_name", student.full_name)
      .eq("class_name", cls.name)
      .order("created_at", { ascending: false });

    return json({
      profile: { full_name: student.full_name, class_name: cls.name, login: account.login },
      must_change_password: !!account.must_change_password,
      subjects: (subjects || []).map((s: { name: string }) => s.name),
      settings: effSettings,
      history: history || [],
    });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
