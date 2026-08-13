// student-me — token orqali shu o'quvchining shaxsiy ma'lumotlarini qaytaradi:
// test tarixi, 1200 ballik va 2000 ballik (Mutolaa) reytingdagi o'z o'rni.
// Formulalar get_monthly_rating/get_mutolaa_rating RPC'lari bilan bir xil.
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

function rankOf(rows: { student_name: string; score: number }[], name: string) {
  const idx = rows.findIndex((r) => r.student_name === name);
  if (idx < 0) return null;
  return { rank: idx + 1, total_students: rows.length, score: rows[idx].score };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) return json({ error: "missing_fields" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await supabase.from("student_sessions").select("student_id, expires_at").eq("token", token).maybeSingle();
    if (!session || new Date(session.expires_at) < new Date()) return json({ error: "invalid_session" });

    const { data: student } = await supabase.from("students").select("id, full_name, class_id").eq("id", session.student_id).single();
    const { data: cls } = await supabase.from("classes").select("id, name").eq("id", student.class_id).single();

    const { data: history } = await supabase
      .from("results")
      .select("id, subject_name, score, total, percent, cheat_count, elapsed_seconds, created_at")
      .eq("student_name", student.full_name)
      .eq("class_name", cls.name)
      .order("created_at", { ascending: false });

    const { data: classResults } = await supabase
      .from("results")
      .select("student_name, subject_name, score")
      .eq("class_name", cls.name);

    const rows = classResults || [];
    const nonMut = rows.filter((r) => r.subject_name !== "Mutolaa");
    const nonMutSubjects = new Set(nonMut.map((r) => r.subject_name));
    const coeff = nonMutSubjects.size > 0 ? 1200 / nonMutSubjects.size : 0;
    const byStudent = new Map<string, number>();
    nonMut.forEach((r) => byStudent.set(r.student_name, (byStudent.get(r.student_name) || 0) + (r.score || 0)));
    const monthlyRanked = [...byStudent.entries()]
      .map(([student_name, total]) => ({ student_name, score: Math.round(total * coeff) }))
      .sort((a, b) => b.score - a.score);

    const mut = rows.filter((r) => r.subject_name === "Mutolaa");
    const mutSubjects = new Set(mut.map((r) => r.subject_name));
    const mutCoeff = 2000 / Math.max(mutSubjects.size, 1);
    const byStudentMut = new Map<string, number>();
    mut.forEach((r) => byStudentMut.set(r.student_name, (byStudentMut.get(r.student_name) || 0) + (r.score || 0)));
    const mutRanked = [...byStudentMut.entries()]
      .map(([student_name, total]) => ({ student_name, score: Math.round(total * mutCoeff) }))
      .sort((a, b) => b.score - a.score);

    return json({
      student: { full_name: student.full_name, class_name: cls.name },
      history: history || [],
      monthly_rating: rankOf(monthlyRanked, student.full_name),
      mutolaa_rating: rankOf(mutRanked, student.full_name),
    });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
