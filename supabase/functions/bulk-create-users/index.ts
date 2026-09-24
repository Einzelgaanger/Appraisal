import { requireGlobalAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Creates confirmed accounts with a caller-supplied password, so it has to be
    // an administrator asking.
    const gate = await requireGlobalAdmin(req, corsHeaders);
    if (!gate.ok) return gate.response;
    const supabaseAdmin = gate.admin;

    const { users, default_password } = await req.json();

    if (!users || !Array.isArray(users) || !default_password) {
      return new Response(
        JSON.stringify({ error: "users array and default_password required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Bulk user creation requested", { by: gate.callerEmail, count: users.length });

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const user of users) {
      const { email, name } = user;
      if (!email) continue;
      const normalizedEmail = email.trim().toLowerCase();

      try {
        // Create auth user with confirmed email
        const { data: userData, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: default_password,
            email_confirm: true,
          });

        if (createError) {
          if (createError.message.includes("already been registered")) {
            results.skipped++;
          } else {
            results.errors.push(`${email}: ${createError.message}`);
          }
          continue;
        }

        const userId = userData.user.id;

        // Find employee record
        const { data: empData } = await supabaseAdmin
          .from("employees")
          .select("id, department")
          .ilike("email", normalizedEmail)
          .maybeSingle();

        // Create profile
        await supabaseAdmin.from("profiles").upsert({
          id: userId,
          email: normalizedEmail,
          name: name || email.split("@")[0],
          department: empData?.department || null,
          employee_id: empData?.id || null,
        });

        results.created++;
      } catch (err) {
        results.errors.push(`${email}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
