// submit-result — javoblarni SERVERDA baholaydi, natijani bazaga yozadi,
// va Telegram xabarnomasini yuboradi (bot tokeni faqat shu yerda, service_role orqali).
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
    const {
      student_name, class_name, subject_name,
      question_ids, answers, cheat_count, elapsed_seconds,
    } = await req.json();

    if (!student_name || !class_name || !subject_name || !Array.isArray(question_ids)) {
      return json({ error: "missing_fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("id, question_text, option_a, option_b, option_c, option_d, correct_option")
      .in("id", question_ids);

    if (qErr || !questions) return json({ error: "questions_fetch_failed" }, 500);

    const byId = new Map(questions.map((q) => [q.id, q]));
    let score = 0;
    const wrong_review: { question_text: string; selected_text: string }[] = [];

    for (const qid of question_ids) {
      const q = byId.get(qid);
      if (!q) continue;
      const selected = answers?.[qid];
      if (selected && selected === q.correct_option) {
        score++;
      } else {
        const optionKey = `option_${selected}` as "option_a" | "option_b" | "option_c" | "option_d";
        wrong_review.push({
          question_text: q.question_text,
          selected_text: selected ? (q[optionKey] ?? "") : "Belgilanmagan",
        });
      }
    }

    const total = question_ids.length;
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    const { data: inserted, error: insErr } = await supabase
      .from("results")
      .insert({
        student_name, class_name, subject_name,
        score, total, percent,
        cheat_count: cheat_count || 0,
        elapsed_seconds: elapsed_seconds ?? null,
      })
      .select()
      .single();

    if (insErr || !inserted) return json({ error: "insert_failed" }, 500);

    // Telegram xabarnomasi — muvaffaqiyatsiz bo'lsa ham natija allaqachon saqlangan
    try {
      const { data: tgTokenRow } = await supabase.from("app_secrets").select("value").eq("key", "TG_TOKEN").maybeSingle();
      const { data: tgChatRow } = await supabase.from("app_secrets").select("value").eq("key", "TG_CHAT").maybeSingle();
      if (tgTokenRow?.value && tgChatRow?.value) {
        const text =
          `📝 *Yangi test natijasi*\n` +
          `👤 ${student_name}\n` +
          `🏫 ${class_name} · 📚 ${subject_name}\n` +
          `✅ ${score}/${total} (${percent}%)\n` +
          `🚫 Chetlanish: ${cheat_count || 0}`;
        await fetch(`https://api.telegram.org/bot${tgTokenRow.value}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgChatRow.value, text, parse_mode: "Markdown" }),
        });
      }
    } catch (_e) {
      // Telegram xatoligi natijani saqlashga ta'sir qilmaydi
    }

    return json({ result: inserted, wrong_review });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
