import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const allowedOrigins = [
  "https://executive.vgg.tools",
  "https://ghc.vgg.tools",
  "https://vigipay.vgg.tools",
  "https://vgg.tools",
  "https://three60appraisal.onrender.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

type Item = {
  id?: string;
  level?: string;
  title?: string;
  priority?: string;
  status?: string;
  due_date?: string | null;
};

function corsHeaders(origin: string | null) {
  const allow = origin && (allowedOrigins.includes(origin) || origin.endsWith(".onrender.com"))
    ? origin
    : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function ruleWeight(item: Item) {
  const priority = String(item.priority || "medium").toLowerCase();
  let weight = priority === "critical" ? 4 : priority === "high" ? 3 : priority === "low" ? 1 : 2;
  if (item.status === "blocked") weight += 1;
  if (item.due_date && item.status !== "done" && item.status !== "cancelled") {
    const due = new Date(`${item.due_date}T12:00:00Z`).getTime();
    if (!Number.isNaN(due) && (due - Date.now()) / 86400000 <= 7) weight += 1;
  }
  return Math.max(1, Math.min(6, weight));
}

function rules(items: Item[]) {
  return items
    .filter((item) => item.id && item.level)
    .map((item) => ({ id: item.id, level: item.level, weight: ruleWeight(item) }));
}

serve(async (req) => {
  const headers = { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const body = await req.json();
    const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 200) as Item[];
    const fallback = rules(items);
    const apiKey = Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey || items.length === 0) {
      return new Response(JSON.stringify({ source: "rules", items: fallback }), { headers });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-5",
        max_tokens: 4096,
        system: "You assign completion weights for a work planner. Reply with JSON only, no markdown. Shape: {\"items\":[{\"id\":\"...\",\"level\":\"objective|key_result|project|task\",\"weight\":1}]}. Weight is an integer from 1 to 6. Critical and high-priority work weighs more than low-priority work. Work that is blocked or due within seven days can weigh one step more. Do not invent ids.",
        messages: [{
          role: "user",
          content: JSON.stringify(items.map((item) => ({
            id: item.id,
            level: item.level,
            title: item.title,
            priority: item.priority,
            status: item.status,
            due_date: item.due_date,
          }))),
        }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ source: "rules", items: fallback }), { headers });
    }

    const payload = await response.json();
    const text = (payload?.content ?? [])
      .filter((block: { type?: string }) => block?.type === "text")
      .map((block: { text?: string }) => block.text ?? "")
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    const byId = new Map(fallback.map((item) => [item.id, item]));
    for (const row of Array.isArray(parsed?.items) ? parsed.items : []) {
      const weight = Number(row?.weight);
      if (!row?.id || !byId.has(row.id) || !Number.isInteger(weight)) continue;
      byId.set(row.id, { ...byId.get(row.id)!, weight: Math.max(1, Math.min(6, weight)) });
    }
    return new Response(JSON.stringify({ source: "model", items: [...byId.values()] }), { headers });
  } catch {
    return new Response(JSON.stringify({ source: "rules", items: [] }), { status: 200, headers });
  }
});
