// Parts-order email alerts. Pinged by a pg_cron job (every ~2 min). Emails one
// message per service-report submission listing the parts that need ordering,
// then stamps notified_at so each part is emailed once.
//
// Secrets (Resend key + cron secret) live in Vault, read via the service-role
// RPC `parts_email_secrets`. Auth: `x-cron-secret` header vs the Vault value.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_TO = Deno.env.get("PARTS_EMAIL_TO") ?? "connorgray@jeffbrownyachts.com";
const EMAIL_FROM = Deno.env.get("PARTS_EMAIL_FROM") ?? "Marine Tech <onboarding@resend.dev>";

interface PartRow {
  id: string;
  name: string;
  part_number: string | null;
  quantity: number;
  description: string | null;
  supplier: string | null;
  url: string | null;
  service_report_id: string | null;
  customers: { name: string } | null;
  boats: { name: string } | null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildEmail(parts: PartRow[]): { subject: string; html: string } {
  const customer = parts[0].customers?.name ?? "Unassigned";
  const boat = parts[0].boats?.name ?? "No boat";
  const rows = parts
    .map((p) => {
      const bits = [
        `<strong>${esc(p.name)}</strong>`,
        p.part_number ? `#${esc(p.part_number)}` : "",
        p.quantity > 1 ? `qty ${p.quantity}` : "",
      ].filter(Boolean).join(" &middot; ");
      const desc = p.description ? `<div style="color:#555;font-size:13px">${esc(p.description)}</div>` : "";
      const sup = p.supplier
        ? `<div style="color:#777;font-size:12px">${p.url ? `<a href="${esc(p.url)}">${esc(p.supplier)}</a>` : esc(p.supplier)}</div>`
        : "";
      return `<li style="margin-bottom:10px">${bits}${desc}${sup}</li>`;
    })
    .join("");
  return {
    subject: `Parts to order — ${customer} · ${boat} (${parts.length})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px">Parts to order</h2>
        <p style="margin:0 0 16px;color:#555"><strong>${esc(customer)}</strong> &middot; ${esc(boat)}</p>
        <ul style="padding-left:18px">${rows}</ul>
        <p style="margin-top:20px"><a href="https://marinetech.grayyachts.com/dashboard">Open the dashboard →</a></p>
      </div>`,
  };
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: secrets, error: secretsError } = await supabase.rpc("parts_email_secrets");
  if (secretsError || !secrets) {
    console.error("parts-order-email: failed to load secrets:", secretsError?.message);
    return new Response("misconfigured", { status: 500 });
  }
  const { resend_key: resendKey, cron_secret: cronSecret } = secrets as {
    resend_key: string; cron_secret: string;
  };

  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  // Un-notified parts still needing ordering.
  const { data: parts, error } = await supabase
    .from("parts")
    .select("id, name, part_number, quantity, description, supplier, url, service_report_id, customers:customer_id(name), boats:boat_id(name)")
    .is("notified_at", null)
    .eq("status", "need_to_order");
  if (error) {
    console.error("parts-order-email: query failed:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200 });
  }
  if (!parts || parts.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Group by service_report_id (one email per submission).
  const groups = new Map<string, PartRow[]>();
  for (const p of parts as unknown as PartRow[]) {
    const key = p.service_report_id ?? "__none__";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }

  let sent = 0;
  for (const group of groups.values()) {
    const { subject, html } = buildEmail(group);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: EMAIL_TO, subject, html }),
    });
    if (!res.ok) {
      console.error("parts-order-email: Resend send failed:", res.status, await res.text());
      continue; // leave notified_at null so it retries next tick
    }
    const ids = group.map((p) => p.id);
    const { error: updErr } = await supabase
      .from("parts")
      .update({ notified_at: new Date().toISOString() })
      .in("id", ids);
    if (updErr) {
      console.error("parts-order-email: notified_at update failed:", updErr.message);
    } else {
      sent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
