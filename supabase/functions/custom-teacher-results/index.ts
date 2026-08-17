// custom-teacher-results — o'qituvchining o'z fani(lar)i natijalarini
// ko'rish/o'chirish. RLS o'rniga fan nomi teacher_subjects ro'yxatida
// ekani kodda tekshiriladi, VA hammasi tashkilot doirasida.
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

    const body = await req.json();
    const action = body.action;

    if (action === "list") {
      if (teacherSubjects.length === 0) return json({ results: [] });
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("org_id", orgId)
        .in("subject_name", teacherSubjects)
        .order("created_at", { ascending: false });
      if (error) return json({ error: "fetch_failed" }, 500);
      return json({ results: data || [] });
    }

    if (action === "delete") {
      const { data: existing } = await supabase.from("results").select("subject_name").eq("id", body.result_id).eq("org_id", orgId).maybeSingle();
      if (!existing || !teacherSubjects.includes(existing.subject_name)) return json({ error: "not_your_subject" }, 403);
      const { error } = await supabase.from("results").delete().eq("id", body.result_id).eq("org_id", orgId);
      if (error) return json({ error: "delete_failed" }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
