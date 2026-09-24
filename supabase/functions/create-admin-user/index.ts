import { requireGlobalAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This endpoint mints global administrators, so the caller must already be one.
    const gate = await requireGlobalAdmin(req, corsHeaders);
    if (!gate.ok) return gate.response;
    const supabaseAdmin = gate.admin;

    const { email, password, name, department } = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Admin creation requested", { by: gate.callerEmail, target: normalizedEmail });

    // Create the auth user
    const { data: userData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Find employee record
    const { data: empData } = await supabaseAdmin
      .from("employees")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    // Create profile
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: normalizedEmail,
      name: name || email.split("@")[0],
      department: department || null,
      employee_id: empData?.id || null,
    });

    // Assign admin role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
