import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const allowedOrigins = [
  "https://executive.vgg.app",
  "https://ghc.vgg.app",
  "https://appraisal.vgg.app",
  "https://three60appraisal.onrender.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string | null) {
  const allow =
    origin && (allowedOrigins.includes(origin) || origin.endsWith(".onrender.com"))
      ? origin
      : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, dataContext } = await req.json();
    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
    const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-5";

    if (!CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert HR analytics assistant for VGG 360° Performance Reviews (Executive Office BOOM pilot). Provide thorough, data-driven analysis from the supplied context only.

=== COMPLETE DATA CONTEXT ===
${typeof dataContext === "string" ? dataContext : JSON.stringify(dataContext ?? {})}

=== RESPONSE FORMATTING RULES (MANDATORY) ===
1. Use clear bold headers like **Top Performers:** or **Key Insights:**
2. Use numbered lists for rankings
3. Use bullet points for general points
4. Cite exact scores, percentages, and counts from the data
5. If data is insufficient, say what is available — do not invent people or scores

=== ANALYSIS GUIDELINES ===
- Analyse the complete dataset before responding
- Cross-reference competency scores with qualitative feedback when relevant
- Identify patterns across people and forms
- For EO pilot peer 360, remember scores about individuals are anonymous aggregates to reviewees`;

    const claudeMessages = (Array.isArray(messages) ? messages : [])
      .filter((m: { role?: string; content?: string }) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      }))
      .filter((m: { content: string }) => m.content.trim().length > 0);

    if (claudeMessages.length === 0) {
      throw new Error("No messages provided");
    }

    // Claude requires alternating roles starting with user — merge if needed
    const normalized: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of claudeMessages) {
      const role = m.role as "user" | "assistant";
      if (normalized.length === 0 && role !== "user") {
        normalized.push({ role: "user", content: m.content });
        continue;
      }
      const last = normalized[normalized.length - 1];
      if (last && last.role === role) {
        last.content += `\n\n${m.content}`;
      } else {
        normalized.push({ role, content: m.content });
      }
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: normalized,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI provider error: ${response.status}`);
    }

    const payload = await response.json();
    const text = (payload?.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("");

    // Emit OpenAI-compatible SSE so the existing admin chat UI can stream chunks.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunkSize = 48;
        for (let i = 0; i < text.length; i += chunkSize) {
          const piece = text.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
