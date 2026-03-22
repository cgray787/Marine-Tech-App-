// Supabase Edge Function: send-invite
// Sends technician invite emails with a deep link for the mobile app.
//
// Expected request body:
// {
//   "email": "tech@example.com",
//   "invited_by": "admin-profile-uuid"
// }
//
// Returns: { success: true, token: "uuid" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  invited_by: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, invited_by } = (await req.json()) as RequestBody;

    if (!email || !invited_by) {
      return new Response(
        JSON.stringify({ error: "email and invited_by are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate invite token
    const token = crypto.randomUUID();

    // Calculate expiration: 7 days from now
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Insert invite record
    const { error: inviteError } = await supabase.from("invites").insert({
      email,
      token,
      invited_by,
      expires_at: expiresAt,
    });

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build deep link for the mobile app
    const inviteLink = `marine-tech://register?token=${token}`;

    // Send invite email via Supabase Auth admin API
    // This uses inviteUserByEmail which sends a magic link email.
    // We include the invite link in the metadata so it can be customized.
    // As a fallback, the admin can share the link manually.
    try {
      await supabase.auth.admin.inviteUserByEmail(email, {
        data: {
          invite_token: token,
          role: "tech",
          invite_link: inviteLink,
        },
        redirectTo: inviteLink,
      });
    } catch (_emailErr) {
      // Email sending is best-effort. The admin can share the link manually.
      // The invite record is already created, so registration will still work.
      console.warn("Email sending failed, invite link available for manual sharing:", inviteLink);
    }

    return new Response(
      JSON.stringify({ success: true, token, invite_link: inviteLink }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
