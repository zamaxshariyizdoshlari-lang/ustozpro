// custom-student-panel — o'quvchi paneli uchun kerakli hamma narsani bir
// so'rovda qaytaradi: profil, o'z sinfidagi fanlar, samarali sozlamalar
// (global+class_settings), test tarixi va reyting. Identifikatsiya
// custom_sessions token orqali (verify_jwt=false).
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

    const { data: account } = await supabase.from("student_accounts").select("student_id, login").eq("id", session.account_id).maybeSingle();
    if (!account) return json({ error: "not_a_student" }, 403);

    const { data: student } = await supabase.from("students").select("id, full_name, class_id").eq("id", account.student_id).single();
    const { data: cls } = await supabase.from("classes").select("id, name").eq("id", student.class_id).single();

    const { data: subjects } = await supabase.from("subjects").select("name").eq("class_id", cls.id).order("name");
    const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).single();
    const { data: classSettings } = await supabase.from("class_settings").select("*").eq("class_id", cls.id).maybeSingle();

    const effSettings = {
      question_count: classSettings?.question_count ?? settings?.question_count ?? 15,
      time_limit_minutes: classSettings?.time_limit_minutes ?? settings?.time_limit_minutes ?? 20,
      allow_custom: settings?.allow_custom ?? true,
    };

    const { data: history } = await supabase
      .from("results")
      .select("subject_name, score, total, percent, created_at")
      .eq("student_name", student.full_name)
      .eq("class_name", cls.name)
      .order("created_at", { ascending: false });

    const { data: monthlyRows } = await supabase.rpc("_compute_monthly_rating", { p_class: cls.name, p_subject: null });
    const { data: mutRows } = await supabase.rpc("_compute_mutolaa_rating", { p_class: cls.name });

    const rating: Record<string, number | null> = {
      monthly_rank: null, monthly_total: null, monthly_score: null,
      mutolaa_rank: null, mutolaa_total: null, mutolaa_score: null,
    };
    const mIdx = (monthlyRows || []).findIndex((r: { student_name: string }) => r.student_name === student.full_name);
    if (mIdx >= 0) {
      rating.monthly_rank = mIdx + 1;
      rating.monthly_total = (monthlyRows || []).length;
      rating.monthly_score = monthlyRows[mIdx].rating_score;
    }
    const mutIdx = (mutRows || []).findIndex((r: { student_name: string }) => r.student_name === student.full_name);
    if (mutIdx >= 0) {
      rating.mutolaa_rank = mutIdx + 1;
      rating.mutolaa_total = (mutRows || []).length;
      rating.mutolaa_score = mutRows[mutIdx].mut_score;
    }

    return json({
      profile: { full_name: student.full_name, class_name: cls.name, login: account.login },
      subjects: (subjects || []).map((s: { name: string }) => s.name),
      settings: effSettings,
      history: history || [],
      rating,
    });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
