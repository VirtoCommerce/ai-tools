// Unit tests for the WRITE-capability probes in the SHIPPED plugin copy
// (plugins/vc-fix/skills/project-init/probe-lib.mjs). These distinguish a READ-only token
// from a WRITE-capable one at /project-init readiness time, so a read-only PAT no longer
// passes as READY only to 401 mid-fix (the LEO gap: get-workitem 200, transition 401).
//
// Pure/injected — no env, no real network (fetch is stubbed). Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWriteProbe,
  githubCanWrite,
  permFromGithubPermissions,
  probeAdoWorkItemsWrite,
  probeAdoCodeWrite,
  discoverAdoWorkItemId,
} from "../../plugins/vc-fix/skills/project-init/probe-lib.mjs";

// A stub `fetch` that records the call and returns a canned status/json — no network.
function fakeFetch({ status = 200, json = {}, ok } = {}) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, opts });
    return {
      status,
      ok: ok === undefined ? status >= 200 && status < 300 : ok,
      json: async () => json,
    };
  };
  impl.calls = calls;
  return impl;
}

// ── classifyWriteProbe — the 401-vs-400 signal (pure) ────────────────────────────────
test("classifyWriteProbe: 401/403 → absent (authorized, but no write scope)", () => {
  assert.equal(classifyWriteProbe(401).scope, "absent");
  assert.equal(classifyWriteProbe(403).scope, "absent");
});

test("classifyWriteProbe: 400/409/422 → present (scope OK, invalid body rejected at validation)", () => {
  assert.equal(classifyWriteProbe(400).scope, "present");
  assert.equal(classifyWriteProbe(409).scope, "present");
  assert.equal(classifyWriteProbe(422).scope, "present");
});

test("classifyWriteProbe: 2xx / 404 / redirect / network error → unverified (inconclusive)", () => {
  assert.equal(classifyWriteProbe(200).scope, "unverified");
  assert.equal(classifyWriteProbe(404).scope, "unverified");
  assert.equal(classifyWriteProbe(302).scope, "unverified");
  assert.equal(classifyWriteProbe(-1).scope, "unverified");
});

// ── GitHub permission mapping (pure) ─────────────────────────────────────────────────
test("permFromGithubPermissions: maps the permissions object to a coarse label", () => {
  assert.equal(permFromGithubPermissions({ push: true }), "push");
  assert.equal(permFromGithubPermissions({ admin: true, push: true }), "admin");
  assert.equal(permFromGithubPermissions({ maintain: true }), "maintain");
  assert.equal(permFromGithubPermissions({ pull: true }), "pull(read-only)");
  assert.equal(permFromGithubPermissions({}), "none");
  assert.equal(permFromGithubPermissions(undefined), "none");
});

test("githubCanWrite: push/maintain/admin grant write; pull/none/unknown do not", () => {
  assert.equal(githubCanWrite("push"), true);
  assert.equal(githubCanWrite("maintain"), true);
  assert.equal(githubCanWrite("admin"), true);
  assert.equal(githubCanWrite("pull(read-only)"), false);
  assert.equal(githubCanWrite("none"), false);
  assert.equal(githubCanWrite("unknown"), false);
});

// permissions.push true vs false → the readiness verdict for a GitHub client repo.
test("GitHub write signal: permissions.push true ⇒ writable, false ⇒ not", () => {
  assert.equal(githubCanWrite(permFromGithubPermissions({ push: true })), true);
  assert.equal(githubCanWrite(permFromGithubPermissions({ push: false, pull: true })), false);
});

// ── ADO Work-Items write probe (injected fetch) ──────────────────────────────────────
test("probeAdoWorkItemsWrite: 401 ⇒ absent (no Work-Items-write scope)", async () => {
  const f = fakeFetch({ status: 401 });
  const r = await probeAdoWorkItemsWrite({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", workItemId: 967, fetchImpl: f });
  assert.equal(r.scope, "absent");
  assert.equal(r.status, 401);
  // non-mutating: an invalid PATCH body, sent as a JSON-Patch document
  assert.equal(f.calls[0].opts.method, "PATCH");
  assert.equal(f.calls[0].opts.body, "{}");
  assert.match(f.calls[0].url, /_apis\/wit\/workitems\/967/);
});

test("probeAdoWorkItemsWrite: 400 ⇒ present (scope OK, body rejected at validation)", async () => {
  const f = fakeFetch({ status: 400 });
  const r = await probeAdoWorkItemsWrite({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", workItemId: 967, fetchImpl: f });
  assert.equal(r.scope, "present");
  assert.equal(r.status, 400);
});

test("probeAdoWorkItemsWrite: missing args ⇒ unverified, no network call", async () => {
  const f = fakeFetch({ status: 400 });
  const r = await probeAdoWorkItemsWrite({ apiBase: "", authHeader: "", workItemId: 0, fetchImpl: f });
  assert.equal(r.scope, "unverified");
  assert.equal(f.calls.length, 0);
});

// ── ADO Code (Git) write probe (injected fetch) ──────────────────────────────────────
test("probeAdoCodeWrite: 403 ⇒ absent; 422 ⇒ present; targets the /pushes endpoint", async () => {
  const absent = await probeAdoCodeWrite({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", repo: "leo-main", fetchImpl: fakeFetch({ status: 403 }) });
  assert.equal(absent.scope, "absent");

  const f = fakeFetch({ status: 422 });
  const present = await probeAdoCodeWrite({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", repo: "leo-main", fetchImpl: f });
  assert.equal(present.scope, "present");
  assert.equal(f.calls[0].opts.method, "POST");
  assert.equal(f.calls[0].opts.body, "{}");
  assert.match(f.calls[0].url, /_apis\/git\/repositories\/leo-main\/pushes/);
});

// ── discoverAdoWorkItemId (injected fetch) ───────────────────────────────────────────
test("discoverAdoWorkItemId: returns the first WIQL id; null when the query is denied", async () => {
  const ok = await discoverAdoWorkItemId({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", fetchImpl: fakeFetch({ status: 200, json: { workItems: [{ id: 4242 }] } }) });
  assert.equal(ok, 4242);

  const denied = await discoverAdoWorkItemId({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", fetchImpl: fakeFetch({ status: 401, ok: false }) });
  assert.equal(denied, null);

  const empty = await discoverAdoWorkItemId({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", fetchImpl: fakeFetch({ status: 200, json: { workItems: [] } }) });
  assert.equal(empty, null);
});
