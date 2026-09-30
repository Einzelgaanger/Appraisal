// Scheduled job: finds active IDP goals where next_check_in_at <= now and
// queues a friendly nudge email asking how the goal is progressing.
// Safe to run as often as hourly (no-op when nothing is due).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: due, error } = await supabase
      .from("development_plans")
      .select("id, user_id, focus_area, goal, target_date, created_at")
      .eq("status", "active")
      .lte("next_check_in_at", new Date().toISOString())
      .limit(50);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let queued = 0;
    for (const plan of due) {
      // Get user email
      const { data: profile } = await supabase
        .from("profiles").select("email, name").eq("id", plan.user_id).maybeSingle();
      if (!profile?.email) continue;

      const weeksSince = Math.round((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000));
      const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:24px auto;padding:24px;color:#1a1a1a">
        <h2 style="margin:0 0 12px">Quick check-in on your growth goal</h2>
        <p>Hi ${profile.name?.split(" ")[0] || "there"},</p>
        <p>About ${weeksSince} weeks ago you set a development goal in <strong>${escapeHtml(plan.focus_area)}</strong>:</p>
        <blockquote style="border-left:3px solid #0070f3;padding:8px 16px;background:#f5f5f7;margin:16px 0;border-radius:4px">${escapeHtml(plan.goal)}</blockquote>
        <p>How is it going? Take 2 minutes to log progress, refresh your resources, or mark it complete.</p>
        <p style="margin:24px 0"><a href="https://executive.vgg.tools/hub?tab=growth" style="background:#0070f3;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Update my plan</a></p>
        <p style="color:#666;font-size:13px">If life moved on and this no longer matters, that's OK — you can archive it in one click.</p>
      </body></html>`;

      try {
        await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to: profile.email,
            subject: `Checking in on your "${plan.focus_area}" goal`,
            html,
            template_name: "idp_check_in",
            metadata: { plan_id: plan.id, user_id: plan.user_id },
          },
        });
        queued++;
      } catch (err) {
        console.error("enqueue failed for plan", plan.id, err);
      }

      // Push next check-in 60 days out so we don't spam
      await supabase
        .from("development_plans")
        .update({ last_check_in_at: new Date().toISOString(), next_check_in_at: new Date(Date.now() + 60 * 86400000).toISOString() })
        .eq("id", plan.id);
    }

    return new Response(JSON.stringify({ processed: due.length, queued }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("idp-check-in error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
