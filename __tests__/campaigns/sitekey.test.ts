import { describe, it, expect } from "vitest";
import { resolveSitekey } from "@/app/login/page";

const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL = "0x4AAAAAADffjFfjREALKEY";

describe("resolveSitekey — local dev must be able to log in", () => {
  it("uses the always-passes test key on every local hostname", () => {
    for (const h of ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]) {
      expect(resolveSitekey(h, REAL)).toBe(TEST_SITEKEY);
    }
  });

  it("uses the configured key on a real domain", () => {
    expect(resolveSitekey("marinetech.grayyachts.com", REAL)).toBe(REAL);
    expect(resolveSitekey("marine-tech-dashboard.connorgray41.workers.dev", REAL)).toBe(REAL);
  });

  it("falls back to the test key when none is configured", () => {
    expect(resolveSitekey("marinetech.grayyachts.com", undefined)).toBe(TEST_SITEKEY);
    expect(resolveSitekey("marinetech.grayyachts.com", "")).toBe(TEST_SITEKEY);
  });

  it("does not treat a lookalike domain as local", () => {
    // Guard against a substring check — "localhost.evil.com" is not local.
    expect(resolveSitekey("localhost.evil.com", REAL)).toBe(REAL);
    expect(resolveSitekey("notlocalhost", REAL)).toBe(REAL);
    expect(resolveSitekey("127.0.0.1.evil.com", REAL)).toBe(REAL);
  });
});
