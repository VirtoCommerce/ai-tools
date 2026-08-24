// Unit tests for the .mcp.json secret-hygiene readiness check (VCST-5774 B4) —
// plugins/vc-fix/skills/project-init/verify-access.mjs `findLiteralSecrets`.
//
// gen-mcp.mjs now emits `${VAR}` indirections instead of literal credentials, but that fix lives in
// the PRODUCER. This check audits the ARTIFACT, because the file on disk may predate the fix, have
// been hand-edited, or have been produced with `--inline-secrets` — and a literal token is
// silent-shaped: it works perfectly right up until the day someone commits it. Every non-PASS row
// of the readiness table becomes a `type:"obs"` record automatically (classForStatus), so this row
// is also what makes the regression visible to /vc-self-check.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLiteralSecrets } from "../../plugins/vc-fix/skills/project-init/verify-access.mjs";

const cfg = (servers) => JSON.stringify({ mcpServers: servers });

test("findLiteralSecrets: a ${VAR} indirection and an unresolved <PLACEHOLDER> are both clean", () => {
  const clean = cfg({
    github: { type: "http", headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
    postman: { type: "http", headers: { Authorization: "Bearer <POSTMAN_API_KEY>" } },
    context7: { type: "http", headers: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}" } },
    "server-github": { type: "stdio", env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
  });
  assert.deepEqual(findLiteralSecrets(clean), { hits: [], unparsable: false });
});

test("findLiteralSecrets: catches a literal in an http Bearer header AND in a stdio env var", () => {
  // The two shapes actually found on disk: _OPUS (http) and _LEO_TEST/_DEMO (stdio).
  const http = findLiteralSecrets(cfg({ github: { type: "http", headers: { Authorization: "Bearer ghp_abcdefghij1234567890" } } }));
  assert.deepEqual(http.hits, ["github.Authorization"]);
  const stdio = findLiteralSecrets(cfg({ github: { type: "stdio", env: { GITHUB_PERSONAL_ACCESS_TOKEN: "gho_abcdefghij1234567890" } } }));
  assert.deepEqual(stdio.hits, ["github.GITHUB_PERSONAL_ACCESS_TOKEN"]);
});

test("findLiteralSecrets: the check is STRUCTURAL — an unknown credential type is still caught", () => {
  // A prefix list (ghp_/PMAK-/…) cannot know about a credential nobody has invented yet. Keying on
  // "credential-shaped key + not an indirection" does. This is the case a regex-only guard misses.
  const r = findLiteralSecrets(cfg({ weird: { type: "http", headers: { "X-Api-Key": "zzq-2026-something-entirely-new" } } }));
  assert.deepEqual(r.hits, ["weird.X-Api-Key"]);
});

test("findLiteralSecrets: a known prefix is caught even under an innocuous key name", () => {
  const r = findLiteralSecrets(cfg({ sneaky: { type: "stdio", env: { SOME_SETTING: "ghp_parkedhere1234567890" } } }));
  assert.deepEqual(r.hits, ["sneaky.SOME_SETTING"]);
});

test("findLiteralSecrets: ordinary non-credential env is NOT flagged (no false positives)", () => {
  // Every stdio server carries these two (#220). Flagging them would make the row cry wolf on
  // every single project, which is how a real finding gets ignored.
  const r = findLiteralSecrets(cfg({
    "playwright-chrome": { type: "stdio", command: "cmd", args: ["/c", "npx", "@playwright/mcp@0.0.77"], env: { NODE_OPTIONS: "--dns-result-order=ipv4first", npm_config_prefer_offline: "true" } },
    atlassian: { type: "http", url: "https://mcp.atlassian.com/v1/mcp" },
    "figma-remote-mcp": { type: "http", url: "https://mcp.figma.com/mcp" },
  }));
  assert.deepEqual(r.hits, [], "the shipped clean template must produce zero hits");
});

test("findLiteralSecrets: reports every offending server, deduped, and never the VALUE", () => {
  const raw = cfg({
    github: { type: "http", headers: { Authorization: "Bearer ghp_leakone1234567890" } },
    postman: { type: "http", headers: { Authorization: "Bearer PMAK-leaktwo-1234567890" } },
  });
  const r = findLiteralSecrets(raw);
  assert.deepEqual(r.hits.sort(), ["github.Authorization", "postman.Authorization"]);
  const blob = JSON.stringify(r);
  assert.ok(!blob.includes("ghp_leakone1234567890") && !blob.includes("PMAK-leaktwo-1234567890"),
    "a credential value must never reach the result (it becomes observation evidence)");
});

test("findLiteralSecrets: unparsable or empty input degrades safely, never throws", () => {
  assert.deepEqual(findLiteralSecrets("{ not json"), { hits: [], unparsable: true });
  assert.deepEqual(findLiteralSecrets("{}"), { hits: [], unparsable: false });
  assert.deepEqual(findLiteralSecrets(cfg({ bare: { type: "http", url: "https://x" } })), { hits: [], unparsable: false });
  // A dropped Authorization header (the no-PAT OAuth path) leaves an empty headers bag.
  assert.deepEqual(findLiteralSecrets(cfg({ github: { type: "http", headers: {} } })), { hits: [], unparsable: false });
});
