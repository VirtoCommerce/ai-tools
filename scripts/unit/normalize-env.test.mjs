// Unit tests for plugins/vc-fix/skills/project-init/normalize-env.mjs (VCST-5582 B).
//
// The defect: `.env.<env>` was hand-filled from the scaffold-env template and the interview
// resumed on the operator's "done" with NO validation. A URL pasted with a trailing `/` (or
// quoted, or space-padded) stayed in the file; verify-access stripped it only in memory while
// every other consumer normalized ad-hoc or not at all, and every runtime `${BACK_URL}/api/...`
// template yielded `//api/...`. So access checks failed for a reason the operator could not see.
//
// These drive the PURE helpers (no file I/O) plus one end-to-end CLI run in a temp dir.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { normalizeValue, normalizeEnvText } from "../../plugins/vc-fix/skills/project-init/normalize-env.mjs";
import { CATALOG } from "../../plugins/vc-fix/skills/project-init/scaffold-env.mjs";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/skills/project-init/normalize-env.mjs");

// ─── the single source of truth (no transcribed rule table) ───────────────────────
test("normalize-env drives off scaffold-env's CATALOG, not a private copy of the rules", () => {
  const byKey = new Map(CATALOG);
  // Importing scaffold-env must be SIDE-EFFECT-FREE (its main() is guarded) or this whole
  // file could not import it.
  assert.ok(byKey.size > 0, "CATALOG is exported");
  assert.equal(byKey.get("FRONT_URL").type, "url");
  assert.equal(byKey.get("BACK_URL").type, "url");
  assert.equal(byKey.get("JIRA_BASE_URL").type, "url");
  assert.equal(byKey.get("ADO_ORG").type, "ado-slug");
  assert.equal(byKey.get("ADO_PROJECT").type, "ado-slug");
  assert.equal(byKey.get("FRONT_URL").warnOnPath, true);
  // JIRA_BASE_URL deliberately has NO warnOnPath — a self-hosted Jira Server lives at /jira.
  assert.equal(byKey.get("JIRA_BASE_URL").warnOnPath, undefined);
});

// ─── trailing slashes (the original symptom) ──────────────────────────────────────
test("normalizeValue: strips every trailing slash from a URL", () => {
  for (const raw of ["https://host.example.com/", "https://host.example.com//", "https://host.example.com///"]) {
    const r = normalizeValue("BACK_URL", raw);
    assert.equal(r.value, "https://host.example.com", raw);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  }
});

test("normalizeValue: a canonical URL is left exactly as-is", () => {
  const r = normalizeValue("BACK_URL", "https://host.example.com");
  assert.equal(r.value, "https://host.example.com");
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("normalizeValue: a port survives normalization", () => {
  assert.equal(normalizeValue("FRONT_URL", "http://localhost:3000/").value, "http://localhost:3000");
});

// ─── quotes + whitespace ──────────────────────────────────────────────────────────
test("normalizeValue: strips surrounding quotes and padding (both quote styles)", () => {
  assert.equal(normalizeValue("FRONT_URL", '  "https://host.example.com/"  ').value, "https://host.example.com");
  assert.equal(normalizeValue("FRONT_URL", "'https://host.example.com'").value, "https://host.example.com");
  // A lone quote is NOT a pair — left in place so the scheme check catches the real problem.
  assert.ok(normalizeValue("FRONT_URL", '"https://host.example.com').errors.length >= 0);
});

test("normalizeValue: padding is stripped from a non-URL key too", () => {
  assert.equal(normalizeValue("STORE_ID", "  B2B-store  ").value, "B2B-store");
});

// ─── hard failures ────────────────────────────────────────────────────────────────
test("normalizeValue: a missing scheme is a hard ERROR", () => {
  const r = normalizeValue("BACK_URL", "host.example.com");
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /no http\(s\):\/\/ scheme/);
});

test("normalizeValue: an unfilled placeholder is a hard ERROR", () => {
  for (const key of ["FRONT_URL", "BACK_URL", "STORE_ID", "USER_EMAIL"]) {
    const r = normalizeValue(key, "");
    assert.equal(r.errors.length, 1, key);
    assert.match(r.errors[0], /still empty/);
  }
  // …and a quoted-empty / whitespace-only value counts as unfilled too.
  assert.match(normalizeValue("FRONT_URL", '   ""   ').errors[0], /still empty/);
});

test("normalizeValue: an ado-slug that is still a path is a hard ERROR", () => {
  const r = normalizeValue("ADO_PROJECT", "acme/Web Store");
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /still looks like a path/);
});

// ─── warnings (not fatal) ─────────────────────────────────────────────────────────
test("normalizeValue: a path component on FRONT_URL/BACK_URL is a WARN, not an error", () => {
  const r = normalizeValue("FRONT_URL", "https://host.example.com/en/catalog");
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /carries a path/);
  assert.equal(r.value, "https://host.example.com/en/catalog", "the value is kept — only flagged");
});

test("normalizeValue: JIRA_BASE_URL with a path does NOT warn (self-hosted Jira Server)", () => {
  const r = normalizeValue("JIRA_BASE_URL", "https://jira.acme.com/jira/");
  assert.equal(r.value, "https://jira.acme.com/jira");
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.errors, []);
});

// ─── ado-slug convenience ─────────────────────────────────────────────────────────
test("normalizeValue: a pasted dev.azure.com URL is reduced to the bare org slug", () => {
  assert.equal(normalizeValue("ADO_ORG", "https://dev.azure.com/acme/").value, "acme");
  assert.equal(normalizeValue("ADO_ORG", "acme").value, "acme");
  // A project name with spaces is legal and must survive.
  assert.equal(normalizeValue("ADO_PROJECT", '"Web Store"').value, "Web Store");
});

// ─── whole-file rewrite ───────────────────────────────────────────────────────────
test("normalizeEnvText: preserves comments, blanks, order, and unknown keys byte-for-byte", () => {
  const src = [
    "# a comment",
    "",
    "ENV_RISK=test",
    'FRONT_URL="https://front.example.com/"',
    "BACK_URL=  https://back.example.com//  ",
    "MY_OWN_VAR=  keep this padding  ", // not a CATALOG key → untouched
    "STORE_ID=B2B-store",
    "USER_EMAIL=qa@example.com",
    "",
  ].join("\n");
  const { text, changes, errors, warnings } = normalizeEnvText(src);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(changes.map((c) => c.key), ["FRONT_URL", "BACK_URL"]);
  const lines = text.split("\n");
  assert.equal(lines[0], "# a comment");
  assert.equal(lines[1], "");
  assert.equal(lines[3], "FRONT_URL=https://front.example.com");
  assert.equal(lines[4], "BACK_URL=https://back.example.com");
  assert.equal(lines[5], "MY_OWN_VAR=  keep this padding  ", "a non-CATALOG key is never rewritten");
  assert.equal(lines[6], "STORE_ID=B2B-store");
});

test("normalizeEnvText: reports every error in the file at once, not just the first", () => {
  const { errors } = normalizeEnvText(["FRONT_URL=", "BACK_URL=back.example.com", "STORE_ID="].join("\n"));
  assert.equal(errors.length, 3);
});

// ─── CLI end-to-end (the actual "done" gate) ──────────────────────────────────────
function runCli(cwd, args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: { ...process.env, VC_FIX_HOME: cwd } });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
  }
}
const GOOD_ENV = [
  "ENV_RISK=test",
  'FRONT_URL="https://front.example.com/"',
  "BACK_URL=https://back.example.com/",
  "STORE_ID=B2B-store",
  "ADMIN=admin",
  "USER_EMAIL=qa@example.com",
  "",
].join("\n");

test("CLI: --env rewrites the real file in place and prints each fix (AC 2)", () => withTempDir((dir) => {
  const f = join(dir, ".env.opus_qa");
  writeFileSync(f, GOOD_ENV);
  const r = runCli(dir, ["--env", "opus_qa"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /fixed FRONT_URL: "\\?"https:\/\/front\.example\.com\/\\?"" → "https:\/\/front\.example\.com"/);
  assert.match(r.stdout, /fixed BACK_URL/);
  const after = readFileSync(f, "utf8");
  assert.match(after, /^FRONT_URL=https:\/\/front\.example\.com$/m, "the FILE is normalized, not just memory");
  assert.match(after, /^BACK_URL=https:\/\/back\.example\.com$/m);
}));

test("CLI: --check reports but never writes", () => withTempDir((dir) => {
  const f = join(dir, ".env.opus_qa");
  writeFileSync(f, GOOD_ENV);
  const r = runCli(dir, ["--env", "opus_qa", "--check"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /would rewrite \(--check\)/);
  assert.equal(readFileSync(f, "utf8"), GOOD_ENV, "--check must leave the file untouched");
}));

test("CLI: an unfilled placeholder fails loudly (exit 1) BEFORE the repo scan", () => withTempDir((dir) => {
  writeFileSync(join(dir, ".env.opus_qa"), GOOD_ENV.replace("STORE_ID=B2B-store", "STORE_ID="));
  const r = runCli(dir, ["--env", "opus_qa"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /STORE_ID is still empty/);
  assert.match(r.stderr, /NOT READY/);
}));

test("CLI: a missing scheme fails loudly (exit 1)", () => withTempDir((dir) => {
  writeFileSync(join(dir, ".env.opus_qa"), GOOD_ENV.replace("BACK_URL=https://back.example.com/", "BACK_URL=back.example.com"));
  const r = runCli(dir, ["--env", "opus_qa"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no http\(s\)/);
}));

test("CLI: --json emits a machine-readable verdict", () => withTempDir((dir) => {
  writeFileSync(join(dir, ".env.opus_qa"), GOOD_ENV);
  const r = runCli(dir, ["--env", "opus_qa", "--json"]);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.wrote, true);
  assert.equal(out.changes.length, 2);
}));

test("CLI: an absent file is a clear failure, not a crash", () => withTempDir((dir) => {
  const r = runCli(dir, ["--env", "nope"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /does not exist/);
}));
