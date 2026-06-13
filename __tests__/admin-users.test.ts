import { describe, it, expect } from "vitest";
import { buildOfficeUserProfile, JBY_ORG_ID } from "@/lib/admin-users";

describe("buildOfficeUserProfile", () => {
  it("office staff get shop tier + the chosen location", () => {
    const p = buildOfficeUserProfile({
      email: "a@b.com", full_name: "A B", role: "tech",
      location_id: "af0eb6a2-0866-4919-959e-940baea9205d",
    });
    expect(p).toEqual({
      email: "a@b.com", full_name: "A B", role: "tech", tier: "shop",
      status: "active", org_id: JBY_ORG_ID,
      location_id: "af0eb6a2-0866-4919-959e-940baea9205d",
    });
  });
  it("admin is org-wide: location forced to null", () => {
    const p = buildOfficeUserProfile({
      email: "c@d.com", full_name: "C D", role: "admin",
      location_id: "af0eb6a2-0866-4919-959e-940baea9205d",
    });
    expect(p.location_id).toBeNull();
  });
  it("rejects an office-staff role with no location", () => {
    expect(() =>
      buildOfficeUserProfile({ email: "e@f.com", full_name: "E F", role: "tech", location_id: null })
    ).toThrow(/office is required/i);
  });
  it("rejects an unknown role", () => {
    expect(() =>
      buildOfficeUserProfile({ email: "g@h.com", full_name: "G H", role: "owner", location_id: null })
    ).toThrow(/invalid role/i);
  });
});
