// tests/self-check-containment.test.mjs
// Containment regression for skills/vc-self-check/deliver.mjs (PR #112, B1 + M1 + B2 + whitelist-mask gap).
// No test framework: `node tests/self-check-containment.test.mjs` → exit 0 = pass.
// Each scenario runs in its own child process because clientTerms() memoizes the
// profile per-process; the parent controls VC_FIX_HOME + a temp project-profile.json.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const TREES = [
  "plugins/vc-fix/skills/vc-self-check/deliver.mjs",
  ".claude/skills/vc-self-check/deliver.mjs",
].filter((p) => existsSync(resolve(p)));

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("    ok   " + name); }
  catch (e) { failures++; console.log("    FAIL " + name + " :: " + e.message); }
};
const rowsOf = (d) => d.body.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|---") && !/^\|\s*Skill\s*\|/.test(l));

// ─── child: run one scenario against one deliver.mjs with a fixed profile state ───
if (process.env.SC_MODE) {
  const mod = await import(pathToFileURL(process.env.SC_DELIVER).href);
  const { isClientSpecific, scrubText, buildDraft } = mod;
  const draft = (skill, signal = "x", fix = "y", rootcause = "") =>
    buildDraft({ route: "issue", pluginVersion: "1", fp: "t", findings: [{ skill, verdict: "BROKEN", sev: "S1", signal, rootcause, fix }] });

  if (process.env.SC_MODE === "noprofile") {
    // B1 — client-shaped skill cell must NOT reach title or row (no profile).
    check("B1 title excludes client-shaped skill", () => {
      const d = draft("ContosoCheckoutSkill");
      assert.ok(!/Contoso/.test(d.title), "title leaked: " + d.title);
      assert.ok(!/Contoso/.test(d.body), "body leaked client skill");
      assert.ok(/\(plugin skill\)/.test(d.title), "expected (plugin skill) in title");
    });
    // M1 (Fix-1) — gate IDs / severity codes must survive as legit findings.
    for (const s of ["green G2 repro then bailed", "S1 blocker: no PR", "S2 degraded, not S3", "gate ladder G0->G7", "clean BAIL at Gate 0"])
      check("M1 gate/sev survives: " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), false));
    // M1 (Fix-2) — common domain tool names must survive (SAFE_TERMS).
    for (const s of ["Swagger validation red on PR", "Storybook CI is push-only", "Vitest run failed", "Sonar QG red on new code"])
      check("M1 tool-name survives (Fix-2): " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), false));
    // Regression guard — the fix must NOT re-open the gate.
    for (const s of ["Contoso checkout fails", "at AcmeCorp.Web.Controllers.CartController.Checkout()", "edit client-modules/AcmeCorp.Custom/Handler.cs", "timeout hitting D:/repos/acme/svc.cs"])
      check("still flags client-shaped: " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), true));
    for (const s of ["check gh auth status", "trim per reports.md §4", "extend hooks/session-telemetry.mjs"])
      check("generic advice survives: " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), false));
    // M2 — benign word/word slashes must survive (the bare slash rule was removed)
    for (const s of ["STR passed 2/3", "1/3 attempts", "3/3 green", "GET/POST /graphql",
                     "browser fallback chrome/firefox/edge", "pass/fail", "read/write", "input/output"])
      check("M2 benign slash survives: " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), false));
    // guard: real source paths must STILL be flagged after the deletion
    check("M2 real source path still flagged", () =>
      assert.equal(isClientSpecific("edit client-modules/AcmeCorp.Custom/Handler.cs"), true));
    // WL (whitelist-mask false-negative) — a client identifier embedded in a filename
    // UNDER a whitelisted dir prefix (hooks|skills|commands|knowledge/) with a NON-source
    // extension must NOT be swallowed by the whitelist mask. Proper-noun / camelCase
    // client ids are shape-detectable even with no profile.
    for (const s of ["knowledge/AcmeCorp-pricing-notes.md is out of date",
                     "commands/AcmeCorpCheckoutFlow.md needs a rewrite",
                     "commands/AcmeCorpPlaceOrderCommand.json misconfigured",
                     "skills/ContosoSecretConfig.yaml"])
      check("WL client id in whitelisted-dir file flagged: " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), true));
    // WL guard: genuine plugin file refs (lowercase-kebab) must STILL survive.
    for (const s of ["extend hooks/session-telemetry.mjs", "fix repo-router.ts logic",
                     "commands/qa-verify-fix.md Step 3 fired early",
                     "see knowledge/diagnostics/skill-expectations.md", "fix-repos.json route"])
      check("WL legit plugin ref survives: " + JSON.stringify(s), () => assert.equal(isClientSpecific(s), false));
    // buildDraft still withholds a genuinely client-specific finding's row.
    check("client-specific row is withheld + scrubbed", () => {
      const d = draft("/qa-fix", "at AcmeCorp.Web.Controllers.CartController.Checkout()", "edit client-modules/AcmeCorp.Custom/Handler.cs");
      const row = rowsOf(d)[0];
      assert.ok(/withheld/.test(row), "expected withheld row");
      assert.ok(!/AcmeCorp/.test(d.body), "client identifier survived into body");
    });
  }

  if (process.env.SC_MODE === "withprofile") {
    // Layer-1 catches the configured org in any case / inside hyphenated tokens.
    check("configured org flagged (hyphenated)", () => assert.equal(isClientSpecific("acme-cart-service failed"), true));
    check("configured org scrubbed to «client»", () => assert.match(scrubText("at acme.core.cart"), /«client»/));
    // B1 — camelCase client identifier in skill cell must NOT reach title (profile present).
    check("B1 title excludes camelCase client skill (with profile)", () => {
      const d = draft("AcmeCheckoutSkill");
      assert.ok(!/Acme/.test(d.title), "title leaked with profile: " + d.title);
      assert.ok(!/Acme/.test(d.body), "body leaked client skill with profile");
      assert.ok(/\(plugin skill\)/.test(d.title));
    });
    check("generic advice survives with profile", () => assert.equal(isClientSpecific("check gh auth status"), false));
    // B2 — derived underscore identifier from the configured org must be withheld
    check("B2 underscore-joined org id is client-specific", () =>
      assert.equal(isClientSpecific("timeout in acme_cart_service during reindex"), true));
    check("B2 underscore id does not reach the body", () => {
      const d = draft("/qa-fix", "timeout in acme_cart_service during reindex", "add retry to acme_cart_service call");
      assert.ok(!/acme_cart_service/.test(d.body), "underscore client id leaked into body");
      assert.ok(/withheld/.test(rowsOf(d)[0]), "expected withheld row");
    });
    check("B2 ACME_API_KEY / acme.core caught", () => {
      assert.equal(isClientSpecific("ACME_API_KEY was null"), true);
      assert.equal(isClientSpecific("at acme.core.checkout"), true);
    });
    // WL — a lowercase client org in a filename under a whitelisted dir is caught by
    // layer-1 (alnum boundary) once the profile is present.
    check("WL lowercase org in whitelisted-dir file caught (with profile)", () => {
      assert.equal(isClientSpecific("hooks/acme_payment_webhook.json failing"), true);
      assert.equal(isClientSpecific("knowledge/acme-notes.md"), true);
    });
  }
  process.exit(failures ? 1 : 0);
}

// ─── parent: orchestrate both modes × both trees in clean child processes ───
if (TREES.length === 0) { console.error("no deliver.mjs found under either tree"); process.exit(1); }
const emptyHome = mkdtempSync(join(tmpdir(), "sc-empty-"));
const profHome = mkdtempSync(join(tmpdir(), "sc-prof-"));
writeFileSync(join(profHome, "project-profile.json"), JSON.stringify({ projectType: "client", clientOrg: "acme", repos: { client: [{ name: "acme-cart-service" }] } }));

let anyFail = false;
try {
  for (const tree of TREES) {
    const deliver = resolve(tree);
    for (const [mode, home] of [["noprofile", emptyHome], ["withprofile", profHome]]) {
      console.log(`\n== ${tree}  [${mode}] ==`);
      try {
        execFileSync(process.execPath, [SELF], { stdio: "inherit", env: { ...process.env, SC_MODE: mode, SC_DELIVER: deliver, VC_FIX_HOME: home } });
      } catch { anyFail = true; }
    }
  }
} finally {
  rmSync(emptyHome, { recursive: true, force: true });
  rmSync(profHome, { recursive: true, force: true });
}
console.log(anyFail ? "\nRESULT: FAIL" : "\nRESULT: PASS");
process.exit(anyFail ? 1 : 0);
