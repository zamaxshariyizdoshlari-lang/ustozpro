// get-test — tanlangan sinf/fan uchun savollarni TO'G'RI JAVOBSIZ qaytaradi,
// va agar admin "urinishlar chegarasi"ni yoqqan bo'lsa, uni tekshiradi.
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
    const { class_name, subject_name, student_name, count } = await req.json();
    if (!class_name || !subject_name || !student_name) {
      return json({ error: "missing_fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cls } = await supabase.from("classes").select("id").eq("name", class_name).maybeSingle();
    if (!cls) return json({ error: "class_not_found" });

    const { data: subj } = await supabase.from("subjects").select("id").eq("class_id", cls.id).eq("name", subject_name).maybeSingle();
    if (!subj) return json({ error: "subject_not_found" });

    const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).single();

    if (settings?.enable_attempt_limit) {
      const { count: attemptCount } = await supabase
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("student_name", student_name)
        .eq("class_name", class_name)
        .eq("subject_name", subject_name);
      const maxAttempts = settings.max_attempts ?? 3;
      if ((attemptCount ?? 0) >= maxAttempts) {
        return json({ error: "attempt_limit_reached", max_attempts: maxAttempts });
      }
    }

    const { data: questions } = await supabase
      .from("questions")
      .select("id, question_text, option_a, option_b, option_c, option_d, hint")
      .eq("subject_id", subj.id);

    if (!questions || questions.length === 0) return json({ error: "no_questions" });

    const wanted = Math.max(1, Math.min(count || 15, questions.length));
    const picked = shuffle(questions).slice(0, wanted);

    return json({ questions: picked });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
