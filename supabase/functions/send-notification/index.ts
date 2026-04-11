// Supabase Edge Function: send-notification
// Sends push notifications to technicians via the Expo Push API.
//
// Trigger this function via a Supabase database webhook when jobs are
// inserted or updated (assigned_to changes).
//
// Expected request body:
// {
//   "user_id": "uuid",       — profile.id of the technician
//   "title": "string",       — notification title
//   "body": "string",        — notification body text
//   "data": { ... }          — optional data payload (e.g. { job_id: "uuid" })
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RequestBody {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, body, data } = (await req.json()) as RequestBody;

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create Supabase admin client to read the profile
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the user's push token from the profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("push_token")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!profile.push_token) {
      return new Response(
        JSON.stringify({ error: "User has no push token registered" }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send notification via Expo Push API
    const pushPayload = {
      to: profile.push_token,
      sound: "default",
      title,
      body,
      data: data ?? {},
    };

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pushPayload),
    });

    const pushResult = await pushResponse.json();

    // Log the notification in the notifications table (best-effort)
    await supabase.from("notifications").insert({
      user_id,
      title,
      body,
      type: "push",
      data_json: data ?? {},
    }).then(() => {});

    return new Response(
      JSON.stringify({ success: true, expo_response: pushResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
