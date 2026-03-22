// Supabase Edge Function: job-notification-webhook
// Database webhook handler — triggered on INSERT or UPDATE to the `jobs` table.
//
// On INSERT:
//   Notifies the assigned technician: "New Job Assigned — [Boat Name] for [Customer Name]"
//
// On UPDATE (status change):
//   status → 'completed':  Notifies admin(s): "Job Completed — [Boat Name]"
//   status → 'in_progress': Notifies admin(s): "Job In Progress — [Boat Name]"
//
// Sends push notifications via the Expo Push API and logs each to the `notifications` table.
//
// Expected webhook payload (Supabase Database Webhook format):
// {
//   "type": "INSERT" | "UPDATE",
//   "table": "jobs",
//   "schema": "public",
//   "record": { ... },
//   "old_record": { ... }    // only on UPDATE
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface JobRecord {
  id: string;
  assigned_to: string | null;
  customer_id: string | null;
  boat_id: string | null;
  status: string;
  notes: string | null;
  scheduled_date: string | null;
  service_types: string[] | null;
  created_by: string | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: JobRecord;
  old_record: JobRecord | null;
}

/**
 * Send a push notification via the Expo Push API.
 * Returns the Expo response or null if the token is missing.
 */
async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  const pushPayload = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
  };

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pushPayload),
  });

  return response.json();
}

/**
 * Log a notification record in the `notifications` table (best-effort).
 */
async function logNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  type: string,
  data: Record<string, unknown> = {}
) {
  await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      title,
      body,
      type,
      data_json: data,
    })
    .then(() => {});
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
    const payload = (await req.json()) as WebhookPayload;

    // Validate this is a jobs table webhook
    if (payload.table !== "jobs") {
      return new Response(
        JSON.stringify({ error: "Webhook is not for jobs table" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const job = payload.record;

    // Look up boat name
    let boatName = "Unknown Boat";
    if (job.boat_id) {
      const { data: boat } = await supabase
        .from("boats")
        .select("name")
        .eq("id", job.boat_id)
        .single();
      if (boat?.name) boatName = boat.name;
    }

    // Look up customer name
    let customerName = "Unknown Customer";
    if (job.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name")
        .eq("id", job.customer_id)
        .single();
      if (customer?.name) customerName = customer.name;
    }

    const results: Record<string, unknown>[] = [];

    // ── INSERT: New job created — notify the assigned technician ──
    if (payload.type === "INSERT") {
      if (!job.assigned_to) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "No technician assigned — skipping notification",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Look up the technician's push token
      const { data: techProfile, error: profileError } = await supabase
        .from("profiles")
        .select("push_token, full_name")
        .eq("id", job.assigned_to)
        .single();

      if (profileError || !techProfile) {
        return new Response(
          JSON.stringify({ error: "Assigned technician profile not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const title = "New Job Assigned";
      const body = `${boatName} for ${customerName}`;
      const notifData = { job_id: job.id, type: "job_assigned" };

      // Send push notification if the tech has a push token
      if (techProfile.push_token) {
        const pushResult = await sendPushNotification(
          techProfile.push_token,
          title,
          body,
          notifData
        );
        results.push({ tech_push: pushResult });
      }

      // Log to notifications table
      await logNotification(
        supabase,
        job.assigned_to,
        title,
        body,
        "job_assigned",
        notifData
      );

      results.push({ logged: true, user: job.assigned_to });
    }

    // ── UPDATE: Job status changed — notify admin(s) ──
    if (payload.type === "UPDATE" && payload.old_record) {
      const oldStatus = payload.old_record.status;
      const newStatus = job.status;

      // Only act if the status actually changed
      if (oldStatus !== newStatus) {
        // Fetch all admin profiles
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, push_token, full_name")
          .eq("role", "admin");

        if (newStatus === "completed") {
          const title = "Job Completed";
          const body = `${boatName} — service completed`;
          const notifData = {
            job_id: job.id,
            type: "job_completed",
            boat_name: boatName,
            customer_name: customerName,
          };

          for (const admin of admins ?? []) {
            if (admin.push_token) {
              const pushResult = await sendPushNotification(
                admin.push_token,
                title,
                body,
                notifData
              );
              results.push({ admin_push: admin.id, result: pushResult });
            }

            await logNotification(
              supabase,
              admin.id,
              title,
              body,
              "job_completed",
              notifData
            );
          }
        }

        if (newStatus === "in_progress") {
          const title = "Job In Progress";
          const body = `${boatName} — work started`;
          const notifData = {
            job_id: job.id,
            type: "job_in_progress",
            boat_name: boatName,
            customer_name: customerName,
          };

          for (const admin of admins ?? []) {
            if (admin.push_token) {
              const pushResult = await sendPushNotification(
                admin.push_token,
                title,
                body,
                notifData
              );
              results.push({ admin_push: admin.id, result: pushResult });
            }

            await logNotification(
              supabase,
              admin.id,
              title,
              body,
              "job_in_progress",
              notifData
            );
          }
        }
      } else {
        results.push({ message: "Status unchanged — no notification sent" });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("job-notification-webhook error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
