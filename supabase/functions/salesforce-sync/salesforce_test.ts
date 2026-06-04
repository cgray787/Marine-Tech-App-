import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  splitName,
  buildDedupQuery,
  buildPersonAccountBody,
  buildSalesforceUrl,
} from "./salesforce.ts";

Deno.test("splitName: first + last", () => {
  assertEquals(splitName("Ron Wood"), { firstName: "Ron", lastName: "Wood" });
});

Deno.test("splitName: three parts -> last is remainder", () => {
  assertEquals(splitName("Mary Jane Watson"), { firstName: "Mary", lastName: "Jane Watson" });
});

Deno.test("splitName: single word -> lastName only", () => {
  assertEquals(splitName("Cher"), { lastName: "Cher" });
});

Deno.test("splitName: empty -> Unknown", () => {
  assertEquals(splitName("   "), { lastName: "Unknown" });
});

Deno.test("buildDedupQuery: phone + email", () => {
  assertEquals(
    buildDedupQuery("+15551234567", "a@b.com"),
    "SELECT Id FROM Account WHERE IsPersonAccount = true AND (Phone = '+15551234567' OR PersonEmail = 'a@b.com') LIMIT 1",
  );
});

Deno.test("buildDedupQuery: email only", () => {
  assertEquals(
    buildDedupQuery(null, "a@b.com"),
    "SELECT Id FROM Account WHERE IsPersonAccount = true AND (PersonEmail = 'a@b.com') LIMIT 1",
  );
});

Deno.test("buildDedupQuery: nothing to match -> null", () => {
  assertEquals(buildDedupQuery(null, null), null);
  assertEquals(buildDedupQuery("  ", ""), null);
});

Deno.test("buildDedupQuery: escapes single quotes", () => {
  assertEquals(
    buildDedupQuery(null, "o'neil@b.com"),
    "SELECT Id FROM Account WHERE IsPersonAccount = true AND (PersonEmail = 'o\\'neil@b.com') LIMIT 1",
  );
});

Deno.test("buildPersonAccountBody: full record", () => {
  const body = buildPersonAccountBody(
    { id: "x", name: "Ron Wood", email: "r@w.com", phone: "+1555", address: "1 Dock Rd", org_id: "o", salesforce_account_id: null },
    { recordTypeId: "RT", ownerId: "OW" },
  );
  assertEquals(body, {
    RecordTypeId: "RT",
    LastName: "Wood",
    OwnerId: "OW",
    Type: "Customer",
    PersonLeadSource: "Marine Tech App",
    FirstName: "Ron",
    Phone: "+1555",
    PersonEmail: "r@w.com",
    PersonMailingStreet: "1 Dock Rd",
  });
});

Deno.test("buildPersonAccountBody: omits empty optional fields", () => {
  const body = buildPersonAccountBody(
    { id: "x", name: "Cher", email: null, phone: "  ", address: "", org_id: "o", salesforce_account_id: null },
    { recordTypeId: "RT", ownerId: "OW" },
  );
  assertEquals(body, {
    RecordTypeId: "RT",
    LastName: "Cher",
    OwnerId: "OW",
    Type: "Customer",
    PersonLeadSource: "Marine Tech App",
  });
});

Deno.test("buildSalesforceUrl: strips trailing slash", () => {
  assertEquals(
    buildSalesforceUrl("https://x.my.salesforce.com/", "001ABC"),
    "https://x.my.salesforce.com/lightning/r/Account/001ABC/view",
  );
});
