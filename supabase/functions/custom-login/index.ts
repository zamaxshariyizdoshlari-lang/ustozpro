// custom-login — o'quvchi/o'qituvchi uchun to'liq maxsus autentifikatsiya,
// endi TASHKILOT-DOIRASIDA. Login endi global emas, faqat o'z tashkiloti
// ichida noyob (unique(org_id, login)) — shu sabab avval org_slug orqali
// tashkilot topiladi (va faol ekani tekshiriladi), keyin login+parol shu
// tashkilot ichida tekshiriladi. Muvaffaqiyatli bo'lsa custom_sessions'ga
// org_id bilan birga token yoziladi — shu token frontendning barcha keyingi
// so'rovlarida ishlatiladi.
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

const SESSION_DAYS = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { org_slug, login, password } = await req.json();
    if (!org_slug || !login || !password) return json({ error: "missing_fields" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, status")
      .eq("slug", String(org_slug).trim().toLowerCase())
      .maybeSingle();
    if (!org) return json({ error: "org_not_found" }, 404);
    if (org.status !== "active") return json({ error: "org_suspended" }, 403);

    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const orgInfo = { slug: org.slug, name: org.name };

    const { data: studentRows } = await supabase.rpc("_verify_student_login", { p_org_id: org.id, p_login: login, p_password: password });
    const studentMatch = studentRows && studentRows[0];
    if (studentMatch) {
      const { data: student } = await supabase.from("students").select("full_name, class_id").eq("id", studentMatch.student_id).single();
      const { data: cls } = await supabase.from("classes").select("name").eq("id", student.class_id).single();
      const { data: session, error: sessErr } = await supabase
        .from("custom_sessions")
        .insert({ org_id: org.id, role: "student", account_id: studentMatch.account_id, expires_at: expiresAt })
        .select("id")
        .single();
      if (sessErr || !session) return json({ error: "session_create_failed" }, 500);
      return json({
        session_token: session.id,
        role: "student",
        org: orgInfo,
        must_change_password: studentMatch.must_change_password,
        profile: { full_name: student.full_name, class_name: cls.name },
      });
    }

    const { data: teacherRows } = await supabase.rpc("_verify_teacher_login", { p_org_id: org.id, p_login: login, p_password: password });
    const teacherMatch = teacherRows && teacherRows[0];
    if (teacherMatch) {
      const { data: teacher } = await supabase.from("teachers").select("full_name").eq("id", teacherMatch.account_id).single();
      const { data: subjRows } = await supabase.from("teacher_subjects").select("subject_name").eq("teacher_id", teacherMatch.account_id).order("subject_name");
      const { data: session, error: sessErr } = await supabase
        .from("custom_sessions")
        .insert({ org_id: org.id, role: "teacher", account_id: teacherMatch.account_id, expires_at: expiresAt })
        .select("id")
        .single();
      if (sessErr || !session) return json({ error: "session_create_failed" }, 500);
      return json({
        session_token: session.id,
        role: "teacher",
        org: orgInfo,
        must_change_password: teacherMatch.must_change_password,
        profile: { full_name: teacher.full_name, subject_names: (subjRows || []).map((r: { subject_name: string }) => r.subject_name) },
      });
    }

    return json({ error: "invalid_credentials" }, 401);
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
