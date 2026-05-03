#!/usr/bin/env node
// Apply a SQL migration against the Marine Tech Supabase project via pg.
// Reads SUPABASE_DB_URL from .env.local (or process env).
//
// Usage: node scripts/apply-migration.mjs <path-to.sql>

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const [, , sqlPath] = process.argv;
if (!sqlPath || !existsSync(sqlPath)) {
  console.error("usage: node scripts/apply-migration.mjs <path-to.sql>");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const dbUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "Set SUPABASE_DB_URL in .env.local — get URI from\n" +
      "  Supabase Studio → Project Settings → Database → Connection string\n" +
      "  Use the 'session pooler' or 'direct connection' URI."
  );
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

console.log(`Applying ${sqlPath}…`);
await client.connect();
try {
  await client.query(sql);
  console.log("\n✓ migration applied");
} catch (err) {
  console.error("\nmigration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
