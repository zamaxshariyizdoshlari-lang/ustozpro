// custom-teacher-panel — o'qituvchi paneli uchun profil, biriktirilgan
// fanlar va sinflar ro'yxatini qaytaradi. Identifikatsiya custom_sessions
// token orqali (verify_jwt=false).
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
    if (!session || session.role !== "teacher" || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ error: "unauthorized" }, 401);
    }

    const { data: teacher } = await supabase.from("teachers").select("full_name, login, must_change_password").eq("id", session.account_id).maybeSingle();
    if (!teacher) return json({ error: "not_a_teacher" }, 403);

    const { data: subjRows } = await supabase.from("teacher_subjects").select("subject_name").eq("teacher_id", session.account_id).order("subject_name");
    const { data: classes } = await supabase.from("classes").select("id, name").order("name");
    // Sinf/fan kaskad-tanlovini (savol CRUD) qurish uchun barcha fan qatorlari —
    // teacherSubjects nomi bilan mos kelganlari frontendda filtrlanadi.
    const { data: allSubjects } = await supabase.from("subjects").select("id, class_id, name").order("name");

    return json({
      profile: { full_name: teacher.full_name, login: teacher.login },
      must_change_password: !!teacher.must_change_password,
      subject_names: (subjRows || []).map((r: { subject_name: string }) => r.subject_name),
      classes: classes || [],
      subjects: allSubjects || [],
    });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
