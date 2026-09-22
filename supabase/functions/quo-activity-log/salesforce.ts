// Pure Salesforce helpers for the quo-activity-log edge function. No I/O — unit
// tested in salesforce_test.ts. Mirrors the SOQL-build + REST-body style of the
// salesforce-sync function.

export interface PersonAccountMatch {
  Id: string;
  Name: string | null;
  PersonContactId: string | null;
  Phone: string | null;
  PersonMobilePhone: string | null;
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * SOQL to fetch candidate Person Accounts whose Phone OR PersonMobilePhone ends
 * with the given 10-digit key. SF SOQL LIKE matches against the full stored value,
 * so we anchor on the last 10 digits with a leading wildcard. The caller still
 * re-verifies with a strict digits-only last-10 compare (formatting in SF is
 * inconsistent), so this query is intentionally broad and the JS does the exact
 * matching + the "exactly one" guard.
 */
export function buildAccountByPhoneQuery(last10: string): string | null {
  if (!/^\d{10}$/.test(last10)) return null;
  const like = `%${escapeSoql(last10)}`;
  // We can't reliably LIKE on digits-only because SF stores formatted numbers
  // ("(425) 671-8474"), so we pull a small candidate set by matching the final
  // 4 digits (always contiguous and unformatted at the end) then filter in JS.
  const tail4 = last10.slice(-4);
  const likeTail = `%${escapeSoql(tail4)}`;
  return (
    "SELECT Id, Name, PersonContactId, Phone, PersonMobilePhone " +
    "FROM Account WHERE IsPersonAccount = true AND " +
    `(Phone LIKE '${likeTail}' OR PersonMobilePhone LIKE '${likeTail}') LIMIT 50`
  );
}

/**
 * From a candidate set, pick the unique Person Account whose Phone or
 * PersonMobilePhone matches the full 10-digit key. Returns:
 *  - { account } when exactly one matches
 *  - { skip: reason } when zero or more-than-one match
 */
export function pickUniqueAccount(
  candidates: PersonAccountMatch[],
  last10Key: string,
): { account?: PersonAccountMatch; skip?: string } {
  const matches = candidates.filter((c) => {
    return digitsLast10(c.Phone) === last10Key || digitsLast10(c.PersonMobilePhone) === last10Key;
  });
  if (matches.length === 0) return { skip: "no SF Person Account matched this phone" };
  // De-dup by Id (a single account can match on both phone fields).
  const uniqueIds = new Set(matches.map((m) => m.Id));
  if (uniqueIds.size > 1) {
    return { skip: `ambiguous: ${uniqueIds.size} SF accounts matched this phone` };
  }
  const account = matches[0];
  if (!account.PersonContactId) {
    return { skip: "matched account has no PersonContactId" };
  }
  return { account };
}

function digitsLast10(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  return d.length < 10 ? "" : d.slice(-10);
}

/**
 * SOQL to find an existing Task on a contact (WhoId) with the idempotency Subject.
 */
export function buildExistingTaskQuery(whoId: string, subject: string): string {
  return (
    "SELECT Id FROM Task WHERE " +
    `WhoId = '${escapeSoql(whoId)}' AND Subject = '${escapeSoql(subject)}' LIMIT 1`
  );
}

export interface TaskFields {
  whoId: string;
  subject: string;
  description: string;
  activityDate: string; // YYYY-MM-DD
  ownerId: string;
  taskSubtype: "Call" | "Task";
}

/** Build the Task sObject body for POST/PATCH. */
export function buildTaskBody(f: TaskFields): Record<string, unknown> {
  return {
    WhoId: f.whoId,
    Subject: f.subject,
    Description: f.description,
    ActivityDate: f.activityDate,
    Status: "Completed",
    OwnerId: f.ownerId,
    TaskSubtype: f.taskSubtype,
  };
}
