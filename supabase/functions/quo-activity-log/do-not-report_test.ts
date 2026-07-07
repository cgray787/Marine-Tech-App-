import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDoNotReport,
  type DoNotReportRow,
  isExcludedByName,
  isExcludedByPhone,
  normalizeName,
} from "./do-not-report.ts";

// ---- normalizeName ----

Deno.test("normalizeName: lowercases, trims, collapses whitespace", () => {
  assertEquals(normalizeName("  John   Smith "), "john smith");
  assertEquals(normalizeName("MARK HAYES"), "mark hayes");
  assertEquals(normalizeName(null), "");
  assertEquals(normalizeName(undefined), "");
  assertEquals(normalizeName(""), "");
});

// ---- buildDoNotReport ----

Deno.test("buildDoNotReport: indexes phones by last-10 and names normalized", () => {
  const rows: DoNotReportRow[] = [
    { name: "John Smith", phone_last10: "4256718474" },
    { name: "Mark Hayes", phone_last10: "(760) 969-3009" }, // normalized to last-10
    { name: "  No Phone Person ", phone_last10: null }, // name-only entry
  ];
  const list = buildDoNotReport(rows);
  assertEquals(list.phones.has("4256718474"), true);
  assertEquals(list.phones.has("7609693009"), true);
  assertEquals(list.phones.size, 2);
  assertEquals(list.names.has("john smith"), true);
  assertEquals(list.names.has("mark hayes"), true);
  assertEquals(list.names.has("no phone person"), true);
});

Deno.test("buildDoNotReport: drops rows with no usable phone AND no name", () => {
  const list = buildDoNotReport([{ phone_last10: "123", name: "" }]); // too few digits, blank name
  assertEquals(list.phones.size, 0);
  assertEquals(list.names.size, 0);
});

// ---- isExcludedByPhone ----

Deno.test("isExcludedByPhone: matches regardless of caller phone format", () => {
  const list = buildDoNotReport([{ name: "John Smith", phone_last10: "4256718474" }]);
  assertEquals(isExcludedByPhone(list, "+14256718474"), true);
  assertEquals(isExcludedByPhone(list, "(425) 671-8474"), true);
  assertEquals(isExcludedByPhone(list, "425.671.8474"), true);
  assertEquals(isExcludedByPhone(list, "+15551234567"), false);
});

Deno.test("isExcludedByPhone: never excludes on empty/unusable phone", () => {
  const list = buildDoNotReport([{ name: "John Smith", phone_last10: "4256718474" }]);
  assertEquals(isExcludedByPhone(list, ""), false);
  assertEquals(isExcludedByPhone(list, null), false);
  assertEquals(isExcludedByPhone(list, "123"), false);
});

Deno.test("isExcludedByPhone: empty list excludes nobody", () => {
  const list = buildDoNotReport([]);
  assertEquals(isExcludedByPhone(list, "+14256718474"), false);
});

// ---- isExcludedByName ----

Deno.test("isExcludedByName: matches case/whitespace-insensitively", () => {
  const list = buildDoNotReport([{ name: "Mark Hayes", phone_last10: null }]);
  assertEquals(isExcludedByName(list, "mark hayes"), true);
  assertEquals(isExcludedByName(list, "  MARK   HAYES "), true);
  assertEquals(isExcludedByName(list, "Marcus Hayes"), false);
});

Deno.test("isExcludedByName: never excludes on empty name", () => {
  const list = buildDoNotReport([{ name: "Mark Hayes", phone_last10: null }]);
  assertEquals(isExcludedByName(list, ""), false);
  assertEquals(isExcludedByName(list, null), false);
});
