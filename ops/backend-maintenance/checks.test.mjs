import test from "node:test";
import assert from "node:assert/strict";
import { assess, nextState } from "./checks.mjs";

const healthy = () => ({
  auth: { ok: true }, rest: { ok: true }, dashboard: { ok: true },
  database: { ok: true, data: { resources: { observedAt: '2026-09-09T00:00:00Z', availableBytes: 900000000, sizeBytes: 1000000000, disks: [] }, wal_bytes: 1024 ** 3, database_bytes: 52_000_000, read_only: false } },
});

test("detects the WAL accumulation from this incident before a 16 GB disk fills", () => {
  const probes = healthy();
  probes.database.data.wal_bytes = 8_120_172_950;
  assert.match(assess(probes).join("\n"), /Transaction logs/);
  assert.deepEqual(assess(healthy()), []);
});

test("treats missing metrics, read-only mode, and HTTP errors as failures", () => {
  const probes = healthy();
  probes.database.data = {};
  assert.match(assess(probes).join("\n"), /invalid capacity/);
  probes.database.data = healthy().database.data;
  probes.database.data.read_only = true;
  probes.auth = { ok: false, status: 521 };
  assert.equal(assess(probes).length, 2);
});

test("debounces transient errors and sends one recovery only after an alert", () => {
  const first = nextState(null, ["down"], 1000);
  assert.equal(first.kind, null);
  assert.equal(nextState(first.state, [], 2000).kind, null);
  const second = nextState(first.state, ["down"], 2000);
  assert.equal(second.kind, "outage");
  const sent = { ...second.state, alerted: true, lastEmailAt: 2000 };
  assert.equal(nextState(sent, ["down"], 3000).kind, null);
  assert.equal(nextState(sent, ["down"], 3_602_000).kind, "outage");
  assert.equal(nextState(sent, [], 4000).kind, "recovery");
  assert.equal(nextState({ ...sent, alerted: false }, [], 5000).kind, null);
});

test("retries notification when delivery was not accepted", () => {
  const previous = { consecutiveFailures: 2, alerted: false };
  assert.equal(nextState(previous, ["down"], 1000).kind, "outage");
});


test("adapts WAL warnings to a smaller Free instance and warns before its database quota", () => {
  const probes = healthy();
  probes.database.data.min_wal_bytes = 80 * 1024 ** 2;
  probes.database.data.wal_bytes = 300 * 1024 ** 2;
  assert.match(assess(probes).join("\n"), /Transaction logs/);
  probes.database.data.wal_bytes = 80 * 1024 ** 2;
  probes.database.data.database_bytes = 450 * 1024 ** 2;
  assert.match(assess(probes).join("\n"), /Free plan/);
});
