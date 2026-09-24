import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProfilePayload = {
  name?: unknown;
  role?: unknown;
  department?: unknown;
  subsidiary_id?: unknown;
  hierarchy_level?: unknown;
};

const cleanText = (value: unknown, max = 120) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user?.id || !userData.user.email) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as ProfilePayload;
    const name = cleanText(payload.name, 140);
    const role = cleanText(payload.role, 140);
    const department = cleanText(payload.department, 140);
    const subsidiaryId = cleanText(payload.subsidiary_id, 80);
    const hierarchyLevel = Number(payload.hierarchy_level);

    if (!name || !role || !department || !subsidiaryId || !Number.isInteger(hierarchyLevel) || hierarchyLevel < 0 || hierarchyLevel > 8) {
      return new Response(JSON.stringify({ error: "Please complete every required profile field." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = userData.user.email.trim().toLowerCase();

    const { data: subsidiary } = await admin
      .from("subsidiaries")
      .select("id")
      .eq("id", subsidiaryId)
      .maybeSingle();

    if (!subsidiary) {
      return new Response(JSON.stringify({ error: "Selected subsidiary was not found." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingEmployee } = await admin
      .from("employees")
      .select("id, locked_tenant_slug, subsidiary_id, hierarchy_level")
      .ilike("email", email)
      .maybeSingle();

    // The roster is the only place company membership is decided. Without a row
    // there is nothing to confirm, and letting this create one would let anyone
    // with a login place themselves in a company at a seniority of their choosing.
    if (!existingEmployee?.id) {
      return new Response(
        JSON.stringify({
          error:
            "This account is not on the employee roster yet. Ask your administrator to add you, then sign in again.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const employeeId = existingEmployee.id as string;

    // Company and seniority are authorization-bearing: they decide which appraisal
    // pool you land in and who assesses you. They come from the roster, never from
    // the request body. Only the descriptive fields are the employee's to confirm.
    const effectiveSubsidiaryId = (existingEmployee.subsidiary_id as string | undefined) ?? subsidiaryId;
    const effectiveHierarchyLevel = existingEmployee.hierarchy_level === null
      ? hierarchyLevel
      : (existingEmployee.hierarchy_level as number);

    const { error: employeeError } = await admin
      .from("employees")
      .update({ name, role, department, email })
      .eq("id", employeeId);
    if (employeeError) throw employeeError;

    const completedAt = new Date().toISOString();
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: userData.user.id,
        email,
        name,
        role,
        department,
        subsidiary_id: effectiveSubsidiaryId,
        hierarchy_level: effectiveHierarchyLevel,
        employee_id: employeeId,
        profile_completed: true,
        profile_completed_at: completedAt,
        profile_confirmed_at: completedAt,
      });

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ success: true, employee_id: employeeId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("complete-profile error", error);
    const message = error instanceof Error ? error.message : "Unable to complete profile";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
