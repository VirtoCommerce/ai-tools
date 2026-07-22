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
  writeProbeSeverity,
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
test("classifyWriteProbe: 401 → absent (authorized, but the write SCOPE is missing)", () => {
  assert.equal(classifyWriteProbe(401).scope, "absent");
});

test("classifyWriteProbe: 403 → restricted (scope may be present; the object is ACL-restricted → WARN, not FAIL)", () => {
  // 403 is NOT proof the PAT lacks the write scope — the sampled work item / branch may sit in an
  // area/policy the identity can't touch. Conflating it with 401 caused false NOT-READY for a
  // correctly-scoped PAT, so it gets its own verdict that consumers treat as WARN.
  assert.equal(classifyWriteProbe(403).scope, "restricted");
});

test("classifyWriteProbe: 400/409/422 → present (scope OK, invalid body rejected at validation)", () => {
  assert.equal(classifyWriteProbe(400).scope, "present");
  assert.equal(classifyWriteProbe(409).scope, "present");
  assert.equal(classifyWriteProbe(422).scope, "present");
});

test("writeProbeSeverity: a missing write scope is always WARN, never an onboarding-blocking FAIL", () => {
  // Shared by every write-capability row (Azure Boards transition-write, client-repo push) in
  // verify-access main(). Operator decision (2026-07-22): refusing onboarding over a token that
  // reaches the resource but lacks a write scope is too heavy — WARN with an explanation is enough.
  assert.equal(writeProbeSeverity("present"), "PASS", "write confirmed ⇒ READY");
  assert.equal(writeProbeSeverity("absent"), "WARN", "no write scope ⇒ WARN (grant-before-/qa-fix), NOT a NOT-READY FAIL");
  assert.equal(writeProbeSeverity("restricted"), "WARN", "ACL 403 is not proof the token lacks write ⇒ WARN");
  assert.equal(writeProbeSeverity("unverified"), "WARN", "inconclusive probe ⇒ WARN");
  // A GitHub push boolean is coerced to present/absent by the caller — verify that contract holds.
  assert.equal(writeProbeSeverity(true ? "present" : "absent"), "PASS");
  assert.equal(writeProbeSeverity(false ? "present" : "absent"), "WARN", "no push ⇒ WARN, never blocks onboarding");
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
test("probeAdoCodeWrite: 401 ⇒ absent; 403 ⇒ restricted; 422 ⇒ present; targets the /pushes endpoint", async () => {
  const absent = await probeAdoCodeWrite({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", repo: "leo-main", fetchImpl: fakeFetch({ status: 401 }) });
  assert.equal(absent.scope, "absent");

  const restricted = await probeAdoCodeWrite({ apiBase: "https://dev.azure.com/org/proj", authHeader: "Basic x", repo: "leo-main", fetchImpl: fakeFetch({ status: 403 }) });
  assert.equal(restricted.scope, "restricted", "403 (branch/repo ACL) must NOT read as absent — it's a WARN, not a NOT-READY FAIL");

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
