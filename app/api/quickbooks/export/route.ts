/**
 * POST /api/quickbooks/export
 * Body: { workOrderId: string }
 *
 * Exports a work order as a QBO Invoice.
 * - Role-gated (admin | manager via requireQbRole)
 * - Find-or-creates QBO Customer by DisplayName
 * - Find-or-creates 3 QBO Items (Labor, Parts & Materials, Service Fees)
 * - POSTs Invoice, persists invoiceId/syncedAt to work_orders
 * - Returns { invoiceId, qboUrl }
 */

import { NextResponse } from "next/server";
import {
  adminDb,
  getConnection,
  qbFetch,
  requireQbRole,
  qbApiBase,
} from "@/lib/quickbooks/server";
import { WO_FULL_SELECT, toTotalsInput } from "@/lib/work-orders/queries";
import { computeTotals } from "@/lib/work-orders/totals";
import { buildInvoicePayload, type QbItemRefs } from "@/lib/quickbooks/invoice";
import type { WorkOrderFull } from "@/lib/work-orders/types";

// ── QBO URL helpers ───────────────────────────────────────────────────────

function qboAppBase(): string {
  return process.env.QB_ENV === "production"
    ? "https://qbo.intuit.com"
    : "https://sandbox.qbo.intuit.com";
}

// ── Intuit error extraction ───────────────────────────────────────────────

function extractIntuitError(body: unknown): string {
  try {
    const b = body as Record<string, unknown>;
    const fault = b?.Fault as Record<string, unknown> | undefined;
    const errors = fault?.Error as Record<string, unknown>[] | undefined;
    if (errors && errors.length > 0) {
      const first = errors[0];
      const msg = first.Message ?? "Unknown error";
      const detail = first.Detail ? ` — ${first.Detail}` : "";
      return `${msg}${detail}`;
    }
  } catch {
    // fall through
  }
  return "QuickBooks returned an unexpected error";
}

// ── QBO query helper ─────────────────────────────────────────────────────

async function qbQuery(
  db: ReturnType<typeof adminDb>,
  realmId: string,
  sql: string
): Promise<Record<string, unknown>[]> {
  const path = `/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=65`;
  const res = await qbFetch(db, path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`QBO query failed: ${extractIntuitError(body)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const qr = json.QueryResponse as Record<string, unknown> | undefined;
  if (!qr) return [];
  // QBO returns the entity array under the entity name key
  for (const key of Object.keys(qr)) {
    const val = qr[key];
    if (Array.isArray(val)) return val as Record<string, unknown>[];
  }
  return [];
}

// ── Find or create a QBO Customer ────────────────────────────────────────

async function findOrCreateCustomer(
  db: ReturnType<typeof adminDb>,
  realmId: string,
  wo: WorkOrderFull
): Promise<string> {
  const customerName = wo.customers?.name ?? "Unknown Customer";
  // Escape single quotes by doubling them (QBO QBQL convention)
  const safeName = customerName.replace(/'/g, "''");

  const rows = await qbQuery(
    db, realmId,
    `select * from Customer where DisplayName = '${safeName}'`
  );

  if (rows.length > 0) {
    return String(rows[0].Id);
  }

  // Create new customer
  const body: Record<string, unknown> = { DisplayName: customerName };
  if (wo.customers?.email) {
    body.PrimaryEmailAddr = { Address: wo.customers.email };
  }
  if (wo.customers?.phone) {
    body.PrimaryPhone = { FreeFormNumber: wo.customers.phone };
  }

  const createRes = await qbFetch(db, `/v3/company/${realmId}/customer?minorversion=65`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(`Failed to create QBO Customer: ${extractIntuitError(errBody)}`);
  }

  const created = (await createRes.json()) as Record<string, unknown>;
  const customer = created.Customer as Record<string, unknown>;
  return String(customer.Id);
}

// ── Find or create a QBO Item by name ────────────────────────────────────

async function findOrCreateItem(
  db: ReturnType<typeof adminDb>,
  realmId: string,
  itemName: string,
  incomeAccountRef: { value: string; name?: string }
): Promise<string> {
  const safeName = itemName.replace(/'/g, "''");
  const rows = await qbQuery(
    db, realmId,
    `select * from Item where Name = '${safeName}'`
  );

  if (rows.length > 0) {
    return String(rows[0].Id);
  }

  // Create as Service item
  const body = {
    Name: itemName,
    Type: "Service",
    IncomeAccountRef: incomeAccountRef,
  };

  const createRes = await qbFetch(db, `/v3/company/${realmId}/item?minorversion=65`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(`Failed to create QBO Item "${itemName}": ${extractIntuitError(errBody)}`);
  }

  const created = (await createRes.json()) as Record<string, unknown>;
  const item = created.Item as Record<string, unknown>;
  return String(item.Id);
}

// ── Resolve first Income account ──────────────────────────────────────────

async function resolveIncomeAccount(
  db: ReturnType<typeof adminDb>,
  realmId: string
): Promise<{ value: string; name?: string }> {
  const rows = await qbQuery(
    db, realmId,
    `select * from Account where AccountType = 'Income' maxresults 1`
  );

  if (rows.length === 0) {
    throw new Error(
      "No Income account found in QuickBooks. " +
      "Please create at least one Income account in QBO before syncing invoices."
    );
  }

  return { value: String(rows[0].Id), name: String(rows[0].Name ?? "") };
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // Auth guard — admin | manager only
  try {
    await requireQbRole();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let workOrderId: string;
  try {
    const body = (await request.json()) as { workOrderId?: string };
    if (!body.workOrderId) {
      return NextResponse.json({ error: "workOrderId is required" }, { status: 400 });
    }
    workOrderId = body.workOrderId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = adminDb();

  // Load WO with full tree (service-role bypasses RLS)
  const { data: rawWo, error: woErr } = await db
    .from("work_orders")
    .select(WO_FULL_SELECT)
    .eq("id", workOrderId)
    .single();

  if (woErr || !rawWo) {
    return NextResponse.json(
      { error: woErr?.message ?? "Work order not found" },
      { status: 404 }
    );
  }

  const wo = rawWo as unknown as WorkOrderFull;

  // Compute totals
  const totals = computeTotals(toTotalsInput(wo));

  // Guard: must be connected
  const connection = await getConnection(db).catch(() => null);
  if (!connection) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }

  const realmId = connection.realm_id;

  try {
    // ── 1. Find or create QBO Customer ─────────────────────────────────
    const customerId = await findOrCreateCustomer(db, realmId, wo);

    // ── 2. Resolve income account (needed for item creation) ───────────
    const incomeAccountRef = await resolveIncomeAccount(db, realmId);

    // ── 3. Find or create the 3 service items ──────────────────────────
    const [laborItemId, partsItemId, feesItemId] = await Promise.all([
      findOrCreateItem(db, realmId, "Labor", incomeAccountRef),
      findOrCreateItem(db, realmId, "Parts & Materials", incomeAccountRef),
      findOrCreateItem(db, realmId, "Service Fees", incomeAccountRef),
    ]);

    const items: QbItemRefs = {
      labor: laborItemId,
      parts: partsItemId,
      fees: feesItemId,
    };

    // ── 4. Build invoice payload ────────────────────────────────────────
    const invoicePayload = buildInvoicePayload(wo, totals, customerId, items);

    // ── 5. POST Invoice to QBO ──────────────────────────────────────────
    const invoiceRes = await qbFetch(
      db,
      `/v3/company/${realmId}/invoice?minorversion=65`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoicePayload),
      }
    );

    if (!invoiceRes.ok) {
      const errBody = await invoiceRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: extractIntuitError(errBody) },
        { status: 502 }
      );
    }

    const invoiceJson = (await invoiceRes.json()) as Record<string, unknown>;
    const invoice = invoiceJson.Invoice as Record<string, unknown>;
    const invoiceId = String(invoice.Id);
    const syncedAt = new Date().toISOString();

    // ── 6. Persist to work_orders ────────────────────────────────────
    await db
      .from("work_orders")
      .update({
        quickbooks_invoice_id: invoiceId,
        quickbooks_synced_at: syncedAt,
      })
      .eq("id", workOrderId);

    // ── 7. Return result ─────────────────────────────────────────────
    const qboUrl = `${qboAppBase()}/app/invoice?txnId=${invoiceId}`;

    return NextResponse.json({ invoiceId, qboUrl });
  } catch (err) {
    console.error("[qb/export]", err);
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
