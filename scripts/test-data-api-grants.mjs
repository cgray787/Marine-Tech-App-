import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const directory = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
const source = name => readFileSync(new URL(name, directory), 'utf8');
const clean = sql => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const tables = sql => [...clean(sql).matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi)].map(m => m[1]);
const dataGrants = sql => clean(sql).match(/\bgrant\s+(?:select|insert|update|delete|usage)[^;]*\bon\s+(?:table|sequence)\s+[^;]+;/gi) || [];
const privateTables = new Set(['qb_connections', 'quo_sweep_runs']);

test('every table creation makes its Data API exposure explicit in the same file', () => {
  for (const name of files) {
    const sql = source(name);
    const declarations = clean(sql).match(/\bcreate\s+(?:(?:global|local)\s+)?(?:(?:temporary|temp|unlogged)\s+)?table\b/gi) || [];
    assert.equal(tables(sql).length, declarations.length, `${name}: unsupported CREATE TABLE syntax; extend the grant guard before adding it`);
    for (const table of tables(sql)) {
      const grants = dataGrants(sql).filter(g => new RegExp(`\\bon\\s+table\\s+public\\.${table}\\s+to\\b`, 'i').test(g));
      assert.ok(grants.some(g => /\bservice_role\b/i.test(g)), `${name}: ${table} needs explicit service access`);
      assert.ok(!grants.some(g => /\bto\s+[^;]*\banon\b/i.test(g)), `${name}: anonymous access requires an explicit security review`);
      if (privateTables.has(table)) {
        assert.ok(!grants.some(g => /\bto\s+[^;]*\bauthenticated\b/i.test(g)), `${name}: ${table} is service-only`);
      } else {
        assert.ok(grants.some(g => /\bauthenticated\b/i.test(g)), `${name}: ${table} needs authenticated access`);
      }
    }
  }
});

// This is a grants/DDL replay, not a claim that all legacy migrations can be
// replayed: their platform extensions, seeds and duplicate numbers need a
// separate Supabase baseline. Use actual CREATE TABLE and GRANT statements.
async function freshDatabase(alternateBaseline = false, includeGrants = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create function public.gen_random_bytes(integer) returns bytea language sql as $$ select decode('123456789abc', 'hex') $$;
  `);
  for (const name of files) {
    if (name === (alternateBaseline ? '001_create_tables.sql' : 'new_project_migration.sql')) continue;
    // The alternate baseline sorts last but must precede dependent tables.
    if (alternateBaseline && name === 'new_project_migration.sql') continue;
    const sql = alternateBaseline && name === '002_add_push_token.sql'
      ? source('new_project_migration.sql') + '\n' + source(name) : source(name);
    for (const statement of clean(sql).match(/\bcreate\s+(?:table(?:\s+if\s+not\s+exists)?\s+[\w.]+\s*\([\s\S]*?\n\)|sequence\s+[^;]+);/gi) || []) {
      await db.exec(statement);
    }
    if (includeGrants) for (const grant of dataGrants(sql)) await db.exec(grant);
  }
  return db;
}

test('fresh schemas without automatic grants have intended table/sequence access', async () => {
  for (const alternate of [false, true]) {
    const db = await freshDatabase(alternate);
    try {
      const { rows } = await db.query(`select relname as name,
        has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
        has_table_privilege('authenticated', c.oid, 'SELECT') as user_read,
        (has_table_privilege('service_role', c.oid, 'SELECT') and has_table_privilege('service_role', c.oid, 'INSERT') and has_table_privilege('service_role', c.oid, 'UPDATE') and has_table_privilege('service_role', c.oid, 'DELETE')) as service_access
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' order by relname`);
      const expected = [...new Set(files.flatMap(name => tables(source(name))))].sort();
      assert.deepEqual(rows.map(row => row.name), expected, 'DDL replay must create every declared table');
      for (const row of rows) {
        assert.equal(row.anon_read, false, row.name);
        assert.equal(row.user_read, !privateTables.has(row.name), row.name);
        assert.equal(row.service_access, true, row.name);
      }
      await db.exec('set role authenticated');
      await assert.rejects(db.query('select * from public.qb_connections'), /permission denied/);
      await assert.rejects(db.query('select * from public.quo_sweep_runs'), /permission denied/);
      assert.equal((await db.query("select nextval('public.work_order_number_seq') as value")).rows[0].value, 1001);
      await db.exec('reset role; set role service_role');
      assert.equal((await db.query("insert into public.quo_sweep_runs(run_date) values ('2026-10-26') returning id")).rows[0].id, 1);
    } finally { await db.close(); }
  }
});

test('real notification ownership policy still hides another user after explicit grants', async () => {
  const db = await freshDatabase();
  try {
    const own = '00000000-0000-4000-8000-000000000001';
    const other = '00000000-0000-4000-8000-000000000002';
    await db.exec(`insert into profiles(id,auth_id,email,full_name) values
      ('${own}','${own}','one@example.invalid','One'),('${other}','${other}','two@example.invalid','Two');
      insert into notifications(user_id,title,type) values ('${own}','mine','test'),('${other}','theirs','test');
      alter table notifications enable row level security;`);
    const policy = source('001_create_tables.sql').match(/CREATE POLICY "auth_read_notifications"[^;]+;/)[0];
    await db.exec(policy);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [own]);
    await db.exec('set role authenticated');
    assert.deepEqual((await db.query('select title from notifications')).rows, [{ title: 'mine' }]);
    await assert.rejects(db.query("insert into notifications(title,type) values ('forbidden','test')"), /row-level security/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from notifications'), /permission denied/);
  } finally { await db.close(); }
});

test('regression control: new tables are inaccessible when grants are omitted', async () => {
  const db = await freshDatabase(false, false);
  try {
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.jobs'), /permission denied/);
  } finally { await db.close(); }
});
