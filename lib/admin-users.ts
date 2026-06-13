export const JBY_ORG_ID = "e22d5492-3ec1-4d5c-9118-b2eba8880586";

export type OfficeRole = "admin" | "manager" | "tech" | "viewer";
const OFFICE_ROLES: OfficeRole[] = ["admin", "manager", "tech", "viewer"];

export interface NewOfficeUser {
  email: string;
  full_name: string;
  role: string;
  location_id: string | null;
}

export interface OfficeUserProfile {
  email: string;
  full_name: string;
  role: OfficeRole;
  tier: "shop";
  status: "active";
  org_id: string;
  location_id: string | null;
}

/**
 * Profile payload for a newly-created office user. Admin = org-wide, so its
 * location is forced null. Every other role REQUIRES an office (otherwise the
 * person would land unscoped and see nothing — the migration-013 footgun).
 */
export function buildOfficeUserProfile(input: NewOfficeUser): OfficeUserProfile {
  if (!OFFICE_ROLES.includes(input.role as OfficeRole)) {
    throw new Error(`invalid role: ${input.role}`);
  }
  const role = input.role as OfficeRole;
  const location_id = role === "admin" ? null : input.location_id;
  if (role !== "admin" && !location_id) {
    throw new Error("office is required for non-admin users");
  }
  return {
    email: input.email,
    full_name: input.full_name,
    role,
    tier: "shop",
    status: "active",
    org_id: JBY_ORG_ID,
    location_id,
  };
}
