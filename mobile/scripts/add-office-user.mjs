#!/usr/bin/env node
// Create a Marine Tech office user (auth + promoted profile) in one step.
// Usage: node mobile/scripts/add-office-user.mjs <email> <password> <office> <role>
//   office = Seattle | Sausalito | "San Diego" | Newport  (or a location UUID)
//   role   = manager | tech | viewer | admin   (admin => no office)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [, , email, password, officeArg, roleArg = "tech"] = process.argv;
if (!email || !password || !officeArg) {
  console.error('usage: node mobile/scripts/add-office-user.mjs <email> <password> <office> <role>');
  process.exit(1);
}
const JBY_ORG_ID = "e22d5492-3ec1-4d5c-9118-b2eba8880586";
const OFFICES = {
  seattle: "665e7a6b-968b-46a3-87a3-ec6050ab8ffc",
  sausalito: "aca07f4b-2c93-471b-b2ef-a9e4428fab24",
  "san diego": "af0eb6a2-0866-4919-959e-940baea9205d",
  newport: "3a2c83ac-2195-41c3-909a-e7495103c49b",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!["manager", "tech", "viewer", "admin"].includes(roleArg)) {
  console.error(`role must be manager|tech|viewer|admin (got '${roleArg}')`);
  process.exit(1);
}
const locationId =
  roleArg === "admin" ? null
  : UUID_RE.test(officeArg) ? officeArg
  : OFFICES[officeArg.toLowerCase()];
if (roleArg !== "admin" && !locationId) {
  console.error(`unknown office '${officeArg}' (use Seattle|Sausalito|"San Diego"|Newport or a UUID)`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8")
    .split("\n").filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const fullName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
let authId;
if (existing) {
  await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  authId = existing.id;
  console.log(`✓ auth user exists (password reset): ${authId}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.error("ERROR:", error.message); process.exit(1); }
  authId = data.user.id;
  console.log(`✓ auth user created: ${authId}`);
}
const { error: pErr } = await admin.from("profiles").update({
  full_name: fullName, role: roleArg, tier: "shop", status: "active",
  org_id: JBY_ORG_ID, location_id: locationId,
}).eq("auth_id", authId);
if (pErr) { console.error("ERROR:", pErr.message); process.exit(1); }
console.log(`✓ profile: role=${roleArg} office=${officeArg}`);
console.log(`\n  Email: ${email}\n  Password: ${password}\n  Role: ${roleArg}\n`);
