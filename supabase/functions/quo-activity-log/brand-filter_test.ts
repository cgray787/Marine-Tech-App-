// Tests for brand-filter.ts — the Jeff Brown Yachts-only Salesforce filter.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anyRedacted,
  classifyBrand,
  grayYachtsSummary,
  mentionsGrayYachts,
  redactGrayYachts,
  redactItems,
} from "./brand-filter.ts";
import type { ActivityItem } from "./quo.ts";

function text(body: string, direction: "incoming" | "outgoing" = "outgoing"): ActivityItem {
  return { kind: "text", at: "2026-06-22T16:00:00Z", direction, counterpart: "+15555550000", text: body };
}
function call(): ActivityItem {
  return { kind: "call", at: "2026-06-22T17:00:00Z", direction: "outgoing", counterpart: "+15555550000", durationSec: 120 };
}

Deno.test("classifyBrand: JBY greeting => jby", () => {
  const items = [text("Hi Ed, this is Connor Gray with Jeff Brown Yachts."), text("hours?", "incoming")];
  assertEquals(classifyBrand(items), "jby");
});

Deno.test("classifyBrand: Gray Yachts greeting => gray_yachts", () => {
  const items = [text("Hey Joaquin, Connor with Gray Yachts."), text("got your inquiry")];
  assertEquals(classifyBrand(items), "gray_yachts");
});

Deno.test("classifyBrand: GrayYachts (no space) + .com variants detected", () => {
  assertEquals(classifyBrand([text("see grayyachts.com for the listing")]), "gray_yachts");
  assertEquals(classifyBrand([text("from GrayYachts Media")]), "gray_yachts");
});

Deno.test("classifyBrand: JBY wins when both brands appear", () => {
  const items = [text("this is Connor with Jeff Brown Yachts"), text("also check Gray Yachts media")];
  assertEquals(classifyBrand(items), "jby");
});

Deno.test("classifyBrand: neither brand => unknown", () => {
  assertEquals(classifyBrand([text("is the boat still available?", "incoming")]), "unknown");
});

Deno.test("classifyBrand: calls-only (no text) => unknown", () => {
  assertEquals(classifyBrand([call()]), "unknown");
});

Deno.test("mentionsGrayYachts: true/false/empty", () => {
  assertEquals(mentionsGrayYachts("Connor with Gray Yachts"), true);
  assertEquals(mentionsGrayYachts("Connor with Jeff Brown Yachts"), false);
  assertEquals(mentionsGrayYachts(""), false);
  assertEquals(mentionsGrayYachts(null), false);
  assertEquals(mentionsGrayYachts(undefined), false);
});

Deno.test("redactGrayYachts: redacts whole body on any GY mention; passes others", () => {
  assertEquals(redactGrayYachts("Hey, Connor with Gray Yachts here"), "[redacted — non-JBY]");
  assertEquals(redactGrayYachts("when can you show the boat?"), "when can you show the boat?");
  assertEquals(redactGrayYachts(undefined), undefined);
});

Deno.test("redactItems: only GY-mentioning text bodies change; calls untouched", () => {
  const items = [
    text("this is Connor with Jeff Brown Yachts"),
    text("our Gray Yachts valuation tool says $250k"),
    call(),
  ];
  const out = redactItems(items);
  assertEquals(out[0].text, "this is Connor with Jeff Brown Yachts");
  assertEquals(out[1].text, "[redacted — non-JBY]");
  assertEquals(out[2].kind, "call");
  assertEquals(out[2].durationSec, 120);
  assertEquals(anyRedacted(items, out), true);
});

Deno.test("anyRedacted: false when nothing matched", () => {
  const items = [text("plain JBY message"), call()];
  assertEquals(anyRedacted(items, redactItems(items)), false);
});

Deno.test("grayYachtsSummary: counts only, no detail, no brand", () => {
  const items = [text("a"), text("b"), call()];
  const s = grayYachtsSummary(items);
  assertEquals(s, "Client contact logged (2 texts, 1 call). Details omitted — non-JBY.");
  assertEquals(/gray\s*yachts/i.test(s), false);
});

Deno.test("grayYachtsSummary: singular + calls-only phrasing", () => {
  assertEquals(grayYachtsSummary([text("a")]), "Client contact logged (1 text). Details omitted — non-JBY.");
  assertEquals(grayYachtsSummary([call()]), "Client contact logged (1 call). Details omitted — non-JBY.");
});
