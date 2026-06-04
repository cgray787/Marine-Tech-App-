// Pure helpers for the salesforce-sync edge function. No I/O — unit-tested.

export interface CustomerRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  org_id: string | null;
  salesforce_account_id: string | null;
}

export interface SalesforceConfig {
  recordTypeId: string;
  ownerId: string;
}

export function splitName(fullName: string): { firstName?: string; lastName: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { lastName: "Unknown" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { lastName: trimmed };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildDedupQuery(phone: string | null, email: string | null): string | null {
  const clauses: string[] = [];
  if (phone && phone.trim()) clauses.push(`Phone = '${escapeSoql(phone.trim())}'`);
  if (email && email.trim()) clauses.push(`PersonEmail = '${escapeSoql(email.trim())}'`);
  if (clauses.length === 0) return null;
  return `SELECT Id FROM Account WHERE IsPersonAccount = true AND (${clauses.join(" OR ")}) LIMIT 1`;
}

export function buildPersonAccountBody(
  c: CustomerRecord,
  cfg: SalesforceConfig,
): Record<string, unknown> {
  const { firstName, lastName } = splitName(c.name);
  const body: Record<string, unknown> = {
    RecordTypeId: cfg.recordTypeId,
    LastName: lastName,
    OwnerId: cfg.ownerId,
    Type: "Customer",
    PersonLeadSource: "Marine Tech App",
  };
  if (firstName) body.FirstName = firstName;
  if (c.phone && c.phone.trim()) body.Phone = c.phone.trim();
  if (c.email && c.email.trim()) body.PersonEmail = c.email.trim();
  if (c.address && c.address.trim()) body.PersonMailingStreet = c.address.trim();
  return body;
}

export function buildSalesforceUrl(instanceUrl: string, accountId: string): string {
  return `${instanceUrl.replace(/\/$/, "")}/lightning/r/Account/${accountId}/view`;
}
