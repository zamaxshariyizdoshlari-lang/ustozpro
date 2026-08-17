// get-test — tanlangan fan uchun savollarni TO'G'RI JAVOBSIZ qaytaradi,
// va agar admin "urinishlar chegarasi"ni yoqqan bo'lsa, uni tekshiradi.
// Chaqiruvchi kimligi custom_sessions bir martalik tokenimiz orqali
// aniqlanadi (verify_jwt=false). Har bir so'rov session.org_id bilan
// cheklanadi — boshqa tashkilotning savol/sozlamalariga kirish mumkin emas.
//
// Tanlangan savollar bir martalik "test_sessions" biletiga yoziladi — submit-result
// endi mijoz yuborgan savol ro'yxatiga emas, shu biletga ishonadi.
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

    const { data: account } = await supabase.from("student_accounts").select("student_id").eq("id", session.account_id).eq("org_id", orgId).maybeSingle();
    if (!account) return json({ error: "not_a_student" }, 403);

    const { data: student } = await supabase.from("students").select("id, full_name, class_id").eq("id", account.student_id).eq("org_id", orgId).single();
    const { data: cls } = await supabase.from("classes").select("id, name").eq("id", student.class_id).eq("org_id", orgId).single();

    const { subject_name, count } = await req.json();
    if (!subject_name) return json({ error: "missing_fields" }, 400);

    const { data: subj } = await supabase.from("subjects").select("id").eq("class_id", cls.id).eq("org_id", orgId).eq("name", subject_name).maybeSingle();
    if (!subj) return json({ error: "subject_not_found" });

    const { data: settings } = await supabase.from("settings").select("*").eq("org_id", orgId).maybeSingle();
    const { data: classSettings } = await supabase.from("class_settings").select("*").eq("class_id", cls.id).eq("org_id", orgId).maybeSingle();

    const effQuestionCount = classSettings?.question_count ?? settings?.question_count ?? 15;
    const effTimeLimit = classSettings?.time_limit_minutes ?? settings?.time_limit_minutes ?? 20;
    const effMaxAttempts = classSettings?.max_attempts ?? settings?.max_attempts ?? 3;
    const effEnableAttemptLimit = classSettings?.enable_attempt_limit ?? settings?.enable_attempt_limit ?? false;

    if (effEnableAttemptLimit) {
      const { count: attemptCount } = await supabase
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("student_name", student.full_name)
        .eq("class_name", cls.name)
        .eq("subject_name", subject_name);
      if ((attemptCount ?? 0) >= effMaxAttempts) {
        return json({ error: "attempt_limit_reached", max_attempts: effMaxAttempts });
      }
    }

    const { data: questions } = await supabase
      .from("questions")
      .select("id, question_text, option_a, option_b, option_c, option_d, hint")
      .eq("subject_id", subj.id)
      .eq("org_id", orgId);

    if (!questions || questions.length === 0) return json({ error: "no_questions" });

    const requestedCount = settings?.allow_custom ? (count || effQuestionCount) : effQuestionCount;
    const wanted = Math.max(1, Math.min(requestedCount, questions.length));
    const picked = shuffle(questions).slice(0, wanted);

    const expiresAt = new Date(Date.now() + (effTimeLimit + 10) * 60 * 1000).toISOString();

    const { data: testSession, error: sessErr } = await supabase
      .from("test_sessions")
      .insert({
        org_id: orgId,
        student_id: student.id,
        subject_id: subj.id,
        question_ids: picked.map((q) => q.id),
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (sessErr || !testSession) return json({ error: "session_create_failed" }, 500);

    return json({
      session_id: testSession.id,
      questions: picked,
      student: { full_name: student.full_name, class_name: cls.name },
    });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
