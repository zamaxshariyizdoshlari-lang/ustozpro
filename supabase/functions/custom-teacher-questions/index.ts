// custom-teacher-questions — o'qituvchining savol CRUD amallari. RLS o'rniga
// bu yerda kodda tekshiriladi: fan nomi o'qituvchining teacher_subjects
// ro'yxatida bo'lishi shart (avvalgi can_manage_subject()ning ekvivalenti),
// VA fan o'qituvchi bilan bir xil tashkilotga tegishli bo'lishi shart.
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
    const orgId = session.org_id;
    const teacherId = session.account_id;

    const { data: subjRows } = await supabase.from("teacher_subjects").select("subject_name").eq("teacher_id", teacherId).eq("org_id", orgId);
    const teacherSubjects: string[] = (subjRows || []).map((r: { subject_name: string }) => r.subject_name);

    async function subjectOwned(subjectId: string): Promise<boolean> {
      const { data: subj } = await supabase.from("subjects").select("name").eq("id", subjectId).eq("org_id", orgId).maybeSingle();
      return !!subj && teacherSubjects.includes(subj.name);
    }

    const body = await req.json();
    const action = body.action;

    if (action === "list") {
      if (!(await subjectOwned(body.subject_id))) return json({ error: "not_your_subject" }, 403);
      const { data, error } = await supabase.from("questions").select("*").eq("subject_id", body.subject_id).eq("org_id", orgId).order("created_at");
      if (error) return json({ error: "fetch_failed" }, 500);
      return json({ questions: data || [] });
    }

    if (action === "create") {
      if (!(await subjectOwned(body.subject_id))) return json({ error: "not_your_subject" }, 403);
      const payload = {
        org_id: orgId,
        subject_id: body.subject_id,
        question_text: body.question_text, option_a: body.option_a, option_b: body.option_b,
        option_c: body.option_c, option_d: body.option_d, correct_option: body.correct_option, hint: body.hint,
      };
      const { error } = await supabase.from("questions").insert(payload);
      if (error) return json({ error: "insert_failed" }, 500);
      return json({ ok: true });
    }

    if (action === "update") {
      const { data: existing } = await supabase.from("questions").select("subject_id").eq("id", body.question_id).eq("org_id", orgId).maybeSingle();
      if (!existing || !(await subjectOwned(existing.subject_id)) || !(await subjectOwned(body.subject_id))) {
        return json({ error: "not_your_subject" }, 403);
      }
      const payload = {
        subject_id: body.subject_id,
        question_text: body.question_text, option_a: body.option_a, option_b: body.option_b,
        option_c: body.option_c, option_d: body.option_d, correct_option: body.correct_option, hint: body.hint,
      };
      const { error } = await supabase.from("questions").update(payload).eq("id", body.question_id).eq("org_id", orgId);
      if (error) return json({ error: "update_failed" }, 500);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { data: existing } = await supabase.from("questions").select("subject_id").eq("id", body.question_id).eq("org_id", orgId).maybeSingle();
      if (!existing || !(await subjectOwned(existing.subject_id))) return json({ error: "not_your_subject" }, 403);
      const { error } = await supabase.from("questions").delete().eq("id", body.question_id).eq("org_id", orgId);
      if (error) return json({ error: "delete_failed" }, 500);
      return json({ ok: true });
    }

    if (action === "bulk_create") {
      if (!(await subjectOwned(body.subject_id))) return json({ error: "not_your_subject" }, 403);
      const rows = (body.rows || []).map((r: Record<string, string>) => ({ ...r, subject_id: body.subject_id, org_id: orgId }));
      const { error } = await supabase.from("questions").insert(rows);
      if (error) return json({ error: "insert_failed" }, 500);
      return json({ ok: true, count: rows.length });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
