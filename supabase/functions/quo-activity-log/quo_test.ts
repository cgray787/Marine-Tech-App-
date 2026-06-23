import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ActivityItem,
  buildDigest,
  dayWindowUtc,
  formatDuration,
  formatTime,
  idempotencySubject,
  isoDateInTz,
  last10,
  phonesMatch,
  priorDayInTz,
  serviceThreadGuard,
  taskSubtype,
} from "./quo.ts";

const LA = "America/Los_Angeles";

// ---- last10 / phonesMatch ----

Deno.test("last10: strips formatting + country code", () => {
  assertEquals(last10("+14256718474"), "4256718474");
  assertEquals(last10("(425) 671-8474"), "4256718474");
  assertEquals(last10("1-425-671-8474"), "4256718474");
  assertEquals(last10("425.671.8474"), "4256718474");
});

Deno.test("last10: too few digits -> empty", () => {
  assertEquals(last10("671-8474"), "");
  assertEquals(last10(""), "");
  assertEquals(last10(null), "");
  assertEquals(last10(undefined), "");
});

Deno.test("last10: 11+ digits keeps final 10", () => {
  assertEquals(last10("+14256718474"), "4256718474");
  assertEquals(last10("011 1 425 671 8474"), "4256718474");
});

Deno.test("phonesMatch: same number different formats", () => {
  assertEquals(phonesMatch("+14256718474", "(425) 671-8474"), true);
  assertEquals(phonesMatch("4256718474", "1-425-671-8474"), true);
});

Deno.test("phonesMatch: different numbers + empties", () => {
  assertEquals(phonesMatch("+14256718474", "+12064663105"), false);
  assertEquals(phonesMatch(null, "+14256718474"), false);
  assertEquals(phonesMatch("123", "456"), false);
});

// ---- serviceThreadGuard ----

function text(t: string, dir: "incoming" | "outgoing" = "incoming"): ActivityItem {
  return { kind: "text", at: "2026-06-22T17:00:00Z", direction: dir, counterpart: "+1", text: t };
}
function call(): ActivityItem {
  return { kind: "call", at: "2026-06-22T17:00:00Z", direction: "outgoing", counterpart: "+1", durationSec: 60 };
}

Deno.test("guard: empty -> skip", () => {
  assertEquals(serviceThreadGuard([]).skip, true);
});

Deno.test("guard: any call keeps the day", () => {
  assertEquals(serviceThreadGuard([call()]).skip, false);
  assertEquals(serviceThreadGuard([text("need an oil change"), call()]).skip, false);
});

Deno.test("guard: pure service/parts text -> skip", () => {
  const items = [text("need to order a part for the warranty repair"), text("invoice please")];
  const r = serviceThreadGuard(items);
  assertEquals(r.skip, true);
  assertEquals(r.reason, "service/parts-only thread");
});

Deno.test("guard: any sales term keeps the day", () => {
  const items = [text("need a part"), text("also interested in buying a new boat")];
  assertEquals(serviceThreadGuard(items).skip, false);
});

Deno.test("guard: a non-service non-sales text keeps the day (conservative)", () => {
  // "running late" matches neither list => not clearly service-only => log it.
  assertEquals(serviceThreadGuard([text("running late, see you at 3")]).skip, false);
});

Deno.test("guard: empty/photo-only texts do not suppress", () => {
  assertEquals(serviceThreadGuard([text("")]).skip, false);
});

Deno.test("guard: word-boundary — 'apartment' is not 'part'", () => {
  // No service term actually matches, so this is a normal (logged) thread.
  assertEquals(serviceThreadGuard([text("looking at the apartment by the marina")]).skip, false);
});

// ---- formatTime / formatDuration ----

Deno.test("formatTime: UTC instant rendered in LA", () => {
  // 2026-06-22T16:14:00Z = 9:14 AM PDT
  assertEquals(formatTime("2026-06-22T16:14:00Z", LA), "9:14a");
  // 2026-06-22T21:05:00Z = 2:05 PM PDT
  assertEquals(formatTime("2026-06-22T21:05:00Z", LA), "2:05p");
});

Deno.test("formatDuration", () => {
  assertEquals(formatDuration(252), "4m12s");
  assertEquals(formatDuration(45), "0m45s");
  assertEquals(formatDuration(0), "0m00s");
  assertEquals(formatDuration(undefined), "");
});

// ---- buildDigest ----

Deno.test("buildDigest: chronological mixed texts + call", () => {
  const items: ActivityItem[] = [
    { kind: "text", at: "2026-06-22T21:05:00Z", direction: "outgoing", counterpart: "+1", text: "still on for the showing?" },
    { kind: "text", at: "2026-06-22T16:14:00Z", direction: "outgoing", counterpart: "+1", text: "hey, that 34 still available?" },
    { kind: "text", at: "2026-06-22T16:20:00Z", direction: "incoming", counterpart: "+1", text: "yep, Saturday works" },
    { kind: "call", at: "2026-06-22T21:30:00Z", direction: "outgoing", counterpart: "+1", durationSec: 252, transcript: "Talked through pricing." },
  ];
  const digest = buildDigest(items, { name: "Charlie Smith", timeZone: LA });
  assertEquals(
    digest,
    [
      "9:14a  You → Charlie: hey, that 34 still available?",
      "9:20a  ← Charlie: yep, Saturday works",
      "2:05p  You → Charlie: still on for the showing?",
      "2:30p  Call (outbound, 4m12s): Talked through pricing.",
    ].join("\n"),
  );
});

Deno.test("buildDigest: no name -> 'Them'", () => {
  const items: ActivityItem[] = [
    { kind: "text", at: "2026-06-22T16:14:00Z", direction: "incoming", counterpart: "+1", text: "hello" },
  ];
  assertEquals(buildDigest(items, { name: null, timeZone: LA }), "9:14a  ← Them: hello");
});

Deno.test("buildDigest: call with no transcript", () => {
  const items: ActivityItem[] = [
    { kind: "call", at: "2026-06-22T16:14:00Z", direction: "incoming", counterpart: "+1", durationSec: 30 },
  ];
  assertEquals(buildDigest(items, { name: "Ed", timeZone: LA }), "9:14a  Call (inbound, 0m30s)");
});

// ---- idempotencySubject / taskSubtype ----

Deno.test("idempotencySubject", () => {
  assertEquals(idempotencySubject("2026-06-22"), "Quo activity — 2026-06-22");
});

Deno.test("taskSubtype: call-only -> Call, else Task", () => {
  assertEquals(taskSubtype([call()]), "Call");
  assertEquals(taskSubtype([call(), call()]), "Call");
  assertEquals(taskSubtype([text("hi")]), "Task");
  assertEquals(taskSubtype([call(), text("hi")]), "Task");
});

// ---- date windows ----

Deno.test("isoDateInTz: instant that is next-day UTC but same-day LA", () => {
  // 2026-06-23T05:00:00Z = 2026-06-22 22:00 PDT
  assertEquals(isoDateInTz(new Date("2026-06-23T05:00:00Z"), LA), "2026-06-22");
});

Deno.test("dayWindowUtc: a PDT day maps to 07:00Z..07:00Z next day", () => {
  const w = dayWindowUtc("2026-06-22", LA);
  // PDT is UTC-7 in June.
  assertEquals(w.createdAfter, "2026-06-22T07:00:00.000Z");
  assertEquals(w.createdBefore, "2026-06-23T07:00:00.000Z");
});

Deno.test("dayWindowUtc: a PST day maps to 08:00Z..08:00Z next day", () => {
  const w = dayWindowUtc("2026-01-15", LA);
  // PST is UTC-8 in January.
  assertEquals(w.createdAfter, "2026-01-15T08:00:00.000Z");
  assertEquals(w.createdBefore, "2026-01-16T08:00:00.000Z");
});

Deno.test("priorDayInTz: just-after-LA-midnight returns the day before", () => {
  // 2026-06-23T08:30:00Z = 2026-06-23 01:30 PDT -> prior day 2026-06-22
  assertEquals(priorDayInTz(new Date("2026-06-23T08:30:00Z"), LA), "2026-06-22");
});

Deno.test("priorDayInTz: late-LA-evening returns that same calendar day's prior day", () => {
  // 2026-06-23T05:00:00Z = 2026-06-22 22:00 PDT -> "today" is 6/22 -> prior day 6/21
  assertEquals(priorDayInTz(new Date("2026-06-23T05:00:00Z"), LA), "2026-06-21");
});
