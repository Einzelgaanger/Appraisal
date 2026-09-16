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
      .select("id, locked_tenant_slug, subsidiary_id, vigipay_appraisal_active")
      .ilike("email", email)
      .maybeSingle();

    let employeeId = existingEmployee?.id as string | undefined;
    const lockedSlug = typeof existingEmployee?.locked_tenant_slug === "string"
      ? existingEmployee.locked_tenant_slug.trim().toLowerCase()
      : "";
    const lockedSubsidiaryId = lockedSlug === "vigipay"
      ? "33333333-3333-3333-3333-333333333333"
      : (existingEmployee?.subsidiary_id as string | undefined);
    const effectiveSubsidiaryId = lockedSubsidiaryId || subsidiaryId;

    if (employeeId) {
      const patch: Record<string, unknown> = {
        name,
        role,
        department,
        email,
        hierarchy_level: hierarchyLevel,
      };
      if (!lockedSlug) {
        patch.subsidiary_id = effectiveSubsidiaryId;
      }
      const { error: employeeError } = await admin
        .from("employees")
        .update(patch)
        .eq("id", employeeId);
      if (employeeError) throw employeeError;
    } else {
      const { data: newEmployee, error: employeeError } = await admin
        .from("employees")
        .insert({ name, role, department, subsidiary_id: effectiveSubsidiaryId, hierarchy_level: hierarchyLevel, email })
        .select("id")
        .single();
      if (employeeError) throw employeeError;
      employeeId = newEmployee.id;
    }

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
        hierarchy_level: hierarchyLevel,
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
