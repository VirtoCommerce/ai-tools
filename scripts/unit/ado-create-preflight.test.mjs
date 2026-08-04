// Tests for the create-workitem PRE-FLIGHT and the contract-derived HTML decision
// (plugins/vc-fix/skills/qa-fix-routing/ado.mjs + ado-html.mjs — VCST-5582 E-a / E-d).
//
// E-d: the old code checked failure causes SEQUENTIALLY — three `readFileSync(resolve(…))`
// (cwd-relative, no existence check → a raw Node ENOENT stack, not a fail()), then whoami for
// --assign-self, then current-iteration for --iteration. Each crashed separately and cost a
// full agent turn, and nothing verified the result. The pre-flight must now report EVERY
// problem in ONE message, with each missing path shown ABSOLUTE, and create NOTHING.
//
// The CLI is driven as a child process (no network is ever reached: the run must die in the
// pre-flight, before the first request). Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { buildBugFields } from "../../plugins/vc-fix/skills/qa-fix-routing/ado-html.mjs";
import { parseFieldContract, isHtmlByContract } from "../../plugins/vc-fix/skills/qa-fix-routing/bug-contract.mjs";
import { FIELD_TYPES, LEO_OPUS_BUG_FIELDS, AGILE_BUG_FIELDS } from "./fixtures/ado-bug-metadata.mjs";

const ADO = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/skills/qa-fix-routing/ado.mjs");

/** Run ado.mjs in `dir` with a profile that names an org/project but NO usable credential. */
function runAdo(dir, args, { profile } = {}) {
  writeFileSync(join(dir, "project-profile.json"), JSON.stringify(profile ?? {
    tracker: { kind: "azure", azure: { organization: "acme", project: "Web", apiBase: "https://dev.azure.com/acme/Web" } },
  }));
  try {
    const stdout = execFileSync(process.execPath, [ADO, ...args], {
      cwd: dir, encoding: "utf8",
      env: {
        ...process.env, VC_FIX_HOME: dir, PROJECT_PROFILE_PATH: join(dir, "project-profile.json"),
        // A syntactically-valid PAT so auth resolution never prompts; every request would 401,
        // but the pre-flight must fail BEFORE any request is made.
        ADO_PAT: "dummy-pat-for-preflight", ADO_AUTH: "pat",
      },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
  }
}

// ─── E-d — ONE message, every problem, nothing created ────────────────────────────
test("pre-flight: EVERY missing file input is reported in ONE message, not one crash at a time", () => withTempDir((dir) => {
  const r = runAdo(dir, [
    "create-workitem", "--type", "Bug", "--title", "t",
    "--description-file", "desc.html",
    "--system-info-file", "sysinfo.html",
    "--repro-file", "repro.html",
    "--no-preflight", // skip only the network write-probe; the file checks still run
  ]);
  assert.equal(r.code, 2, "a pre-flight failure exits 2 (a refusal, not a crash)");
  assert.match(r.stderr, /pre-flight failed/);
  assert.match(r.stderr, /NOTHING was created/);
  // All three, together — the whole point.
  assert.match(r.stderr, /--description-file "desc\.html" not found/);
  assert.match(r.stderr, /--system-info-file "sysinfo\.html" not found/);
  assert.match(r.stderr, /--repro-file "repro\.html" not found/);
  assert.match(r.stderr, /3 problem\(s\)/);
}));

test("pre-flight: a missing path is shown as the RESOLVED ABSOLUTE path (no ENOENT stack)", () => withTempDir((dir) => {
  const r = runAdo(dir, ["create-workitem", "--type", "Bug", "--title", "t", "--description-file", "desc.html", "--no-preflight"]);
  assert.match(r.stderr, new RegExp(`resolved to ${resolve(dir, "desc.html").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}`));
  assert.doesNotMatch(r.stderr, /readFileUtf8|node:fs:/, "never a raw Node stack");
}));

test("pre-flight: file inputs resolve against VC_FIX_HOME, not bare cwd (plugin-symmetric)", () => withTempDir((home) => withTempDir((elsewhere) => {
  mkdirSync(join(home, "reports"), { recursive: true });
  writeFileSync(join(home, "reports", "desc.html"), "<p>body</p>");
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ tracker: { kind: "azure", azure: { organization: "acme", project: "Web" } } }));
  // cwd is a DIFFERENT directory — the OPUS failure mode.
  let out;
  try {
    execFileSync(process.execPath, [ADO, "create-workitem", "--type", "Bug", "--title", "t", "--description-file", "reports/desc.html", "--no-preflight"], {
      cwd: elsewhere, encoding: "utf8",
      env: { ...process.env, VC_FIX_HOME: home, PROJECT_PROFILE_PATH: join(home, "project-profile.json"), ADO_PAT: "dummy", ADO_AUTH: "pat" },
    });
    out = "";
  } catch (e) { out = String(e.stderr ?? ""); }
  assert.doesNotMatch(out, /reports\/desc\.html" not found/, "the file WAS found via VC_FIX_HOME despite the foreign cwd");
})));

test("pre-flight: a local path passed as an attachment is caught before the POST", () => withTempDir((dir) => {
  writeFileSync(join(dir, "d.html"), "<p>x</p>");
  const r = runAdo(dir, ["create-workitem", "--type", "Bug", "--title", "t", "--description-file", "d.html", "--attachments", "C:\\shots\\a.png", "--no-preflight"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /is not a URL — upload it first/);
}));

test("pre-flight: the message forbids the retry-with-fewer-fields reflex", () => withTempDir((dir) => {
  const r = runAdo(dir, ["create-workitem", "--type", "Bug", "--title", "t", "--description-file", "nope.html", "--no-preflight"]);
  assert.match(r.stderr, /Do NOT retry with fewer fields/);
}));

// ─── E-c — contract validation happens BEFORE any network call ────────────────────
test("contract: an invalid picklist value is refused before the POST, listing the allowed values", () => withTempDir((dir) => {
  const r = runAdo(dir, [
    "create-workitem", "--type", "Bug", "--title", "t",
    "--field", "Custom.Environment=STAGE", "--field", "Custom.Reportedby=QA team", "--no-preflight",
  ], {
    profile: {
      tracker: {
        kind: "azure",
        azure: { organization: "acme", project: "Web", apiBase: "https://dev.azure.com/acme/Web" },
        fields: { Bug: parseFieldContract(LEO_OPUS_BUG_FIELDS, FIELD_TYPES) },
      },
    },
  });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /rejected by the Bug field contract/);
  assert.match(r.stderr, /"STAGE" is not an allowed value/);
  assert.match(r.stderr, /QA, UAT, PROD/);
}));

test("contract: a required field with no value blocks the POST and names what to ask", () => withTempDir((dir) => {
  const r = runAdo(dir, ["create-workitem", "--type", "Bug", "--title", "t", "--no-preflight"], {
    profile: {
      tracker: {
        kind: "azure",
        azure: { organization: "acme", project: "Web", apiBase: "https://dev.azure.com/acme/Web" },
        fields: { Bug: parseFieldContract(LEO_OPUS_BUG_FIELDS, FIELD_TYPES) },
      },
    },
  });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /REQUIRED Bug field\(s\) have no value/);
  assert.match(r.stderr, /Environment \(Custom\.Environment\)/);
  assert.match(r.stderr, /allowed: QA, UAT/, "the operator question can offer the discovered values");
  assert.match(r.stderr, /A required field is NEVER dropped/);
}));

// ─── E-a — the HTML decision is DERIVED from the contract ─────────────────────────
test("buildBugFields: an isHtmlRef resolver overrides the hardcoded HTML_FIELD_REFS set", () => {
  const agile = parseFieldContract(AGILE_BUG_FIELDS, FIELD_TYPES);
  // On the stock Agile Bug, System.Description does not exist and ReproSteps is the html body.
  const ops = buildBugFields({
    title: "t",
    reproSteps: "# Steps\n\n1. one",
    fields: { "Custom.Reportedby": "**QA team**" },
    isHtmlRef: (ref) => isHtmlByContract(agile, ref),
  });
  const repro = ops.find((o) => o.path.endsWith("Microsoft.VSTS.TCM.ReproSteps"));
  assert.match(repro.value, /<ol>|<li>|<p>/, "an html-typed field is converted");
});

test("buildBugFields: a plainText custom field is sent VERBATIM, not HTML-converted", () => {
  const leo = parseFieldContract(LEO_OPUS_BUG_FIELDS, FIELD_TYPES);
  const ops = buildBugFields({
    title: "t",
    fields: { "Custom.Reportedby": "QA team" },
    isHtmlRef: (ref) => isHtmlByContract(leo, ref),
  });
  assert.equal(ops.find((o) => o.path.endsWith("Custom.Reportedby")).value, "QA team");
});

test("buildBugFields: with NO resolver the legacy HTML_FIELD_REFS behaviour is unchanged", () => {
  const ops = buildBugFields({ title: "t", description: "# H" });
  assert.match(ops.find((o) => o.path.endsWith("System.Description")).value, /<h\d>H<\/h\d>/);
});
