import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAccountByPhoneQuery,
  buildExistingTaskQuery,
  buildTaskBody,
  type PersonAccountMatch,
  pickUniqueAccount,
} from "./salesforce.ts";

Deno.test("buildAccountByPhoneQuery: tail-4 LIKE candidate query", () => {
  assertEquals(
    buildAccountByPhoneQuery("4256718474"),
    "SELECT Id, Name, PersonContactId, Phone, PersonMobilePhone FROM Account WHERE IsPersonAccount = true AND (Phone LIKE '%8474' OR PersonMobilePhone LIKE '%8474') LIMIT 50",
  );
});

Deno.test("buildAccountByPhoneQuery: non-10-digit -> null", () => {
  assertEquals(buildAccountByPhoneQuery("12345"), null);
  assertEquals(buildAccountByPhoneQuery("14256718474"), null); // 11 digits
  assertEquals(buildAccountByPhoneQuery(""), null);
});

function acct(over: Partial<PersonAccountMatch>): PersonAccountMatch {
  return {
    Id: "001A",
    Name: "Ed Paquette",
    PersonContactId: "003A",
    Phone: null,
    PersonMobilePhone: null,
    ...over,
  };
}

Deno.test("pickUniqueAccount: single exact match on Phone", () => {
  const r = pickUniqueAccount([acct({ Phone: "(760) 969-3009" })], "7609693009");
  assertEquals(r.account?.Id, "001A");
  assertEquals(r.skip, undefined);
});

Deno.test("pickUniqueAccount: match on PersonMobilePhone", () => {
  const r = pickUniqueAccount([acct({ PersonMobilePhone: "+1 760-969-3009" })], "7609693009");
  assertEquals(r.account?.Id, "001A");
});

Deno.test("pickUniqueAccount: no match -> skip", () => {
  const r = pickUniqueAccount([acct({ Phone: "(206) 466-3105" })], "7609693009");
  assertEquals(r.account, undefined);
  assertEquals(r.skip, "no SF Person Account matched this phone");
});

Deno.test("pickUniqueAccount: tail-4 collision filtered out by full last-10", () => {
  // Candidate shares the last 4 (8474) but not the full 10 -> not a match.
  const r = pickUniqueAccount([acct({ Phone: "+15095558474" })], "4256718474");
  assertEquals(r.account, undefined);
});

Deno.test("pickUniqueAccount: two distinct accounts -> ambiguous skip", () => {
  const r = pickUniqueAccount(
    [acct({ Id: "001A", Phone: "4256718474" }), acct({ Id: "001B", PersonMobilePhone: "425-671-8474" })],
    "4256718474",
  );
  assertEquals(r.account, undefined);
  assertEquals(r.skip, "ambiguous: 2 SF accounts matched this phone");
});

Deno.test("pickUniqueAccount: same account matching both phone fields is NOT ambiguous", () => {
  const r = pickUniqueAccount(
    [acct({ Id: "001A", Phone: "4256718474", PersonMobilePhone: "(425) 671-8474" })],
    "4256718474",
  );
  assertEquals(r.account?.Id, "001A");
});

Deno.test("pickUniqueAccount: matched but missing PersonContactId -> skip", () => {
  const r = pickUniqueAccount([acct({ Phone: "4256718474", PersonContactId: null })], "4256718474");
  assertEquals(r.account, undefined);
  assertEquals(r.skip, "matched account has no PersonContactId");
});

Deno.test("buildExistingTaskQuery: escapes the subject", () => {
  assertEquals(
    buildExistingTaskQuery("003A", "Quo activity — 2026-06-22"),
    "SELECT Id FROM Task WHERE WhoId = '003A' AND Subject = 'Quo activity — 2026-06-22' LIMIT 1",
  );
});

Deno.test("buildTaskBody: full body with Completed + Owner", () => {
  const body = buildTaskBody({
    whoId: "003A",
    subject: "Quo activity — 2026-06-22",
    description: "9:14a  You → Ed: hi",
    activityDate: "2026-06-22",
    ownerId: "005TS000008FD5BYAW",
    taskSubtype: "Call",
  });
  assertEquals(body, {
    WhoId: "003A",
    Subject: "Quo activity — 2026-06-22",
    Description: "9:14a  You → Ed: hi",
    ActivityDate: "2026-06-22",
    Status: "Completed",
    OwnerId: "005TS000008FD5BYAW",
    TaskSubtype: "Call",
  });
});
