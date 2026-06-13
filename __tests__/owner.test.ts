import { describe, it, expect } from "vitest";
import { isOrgWide } from "@/lib/owner";

describe("isOrgWide", () => {
  it("true for an admin profile", () => {
    expect(isOrgWide({ email: "x@y.com", role: "admin" })).toBe(true);
  });
  it("true for the owner allowlist even if role is tech", () => {
    expect(isOrgWide({ email: "connorgray41@gmail.com", role: "tech" })).toBe(true);
  });
  it("false for a single-office manager", () => {
    expect(isOrgWide({ email: "justin@jeffbrownyachts.com", role: "manager" })).toBe(false);
  });
  it("false for a tech and for null", () => {
    expect(isOrgWide({ email: "t@y.com", role: "tech" })).toBe(false);
    expect(isOrgWide(null)).toBe(false);
  });
});
