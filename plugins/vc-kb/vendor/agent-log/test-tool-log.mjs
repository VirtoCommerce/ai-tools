/* Acceptance tests for the tool-log hook. Each case names the failure mode it closes, so a
 * regression is legible rather than just red. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { fileURLToPath } from "node:url";
import { dirname, join as pjoin } from "node:path";
/* Resolve the tool next to this test, so the package works wherever it is unzipped. */
const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = pjoin(HERE, "tool-log.mjs");
const work = mkdtempSync(join(tmpdir(), "toollog-"));
const outDir = join(work, "out");
const secrets = join(work, "secrets.env");
writeFileSync(secrets, ["TEST_USER_PASSWORD={{USER_PASSWORD}}", "SHORT_PWD=ab", "GH_TOKEN=notarealtokenvalue123"].join("\n"));

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log("  PASS  " + name);
  } else {
    fail += 1;
    console.log("  FAIL  " + name + (detail ? "  ->  " + detail : ""));
  }
};

function fire(event, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, VC_MEASURE_OUT: outDir, VC_MEASURE_SECRETS: secrets, ...env },
  });
  return { stdout: r.stdout || "", status: r.status };
}

function linesFor(sid) {
  const f = join(outDir, "tool-log-" + sid + ".jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const ev = (sid, tool, input) => ({ session_id: sid, tool_name: tool, tool_input: input, cwd: work });

console.log("the output directory honours VC_MEASURE_OUT");
fire(ev("s1aaaaaa", "Read", { file_path: "C:/repo/docs/adr/adr-knowledge-base-v3.md" }));
check("wrote into VC_MEASURE_OUT", linesFor("s1aaaaaa").length === 1, "found " + linesFor("s1aaaaaa").length);

console.log("batch unpacking — an un-unpacked batch logs only keys:actions");
fire(
  ev("s2bbbbbb", "mcp__Claude_Browser__browser_batch", {
    actions: [
      { name: "navigate", input: { url: "http://localhost:3000/dashboard" } },
      { name: "computer", input: { action: "left_click", ref: "ref_12" } },
      { name: "computer", input: { action: "screenshot" } },
    ],
  }),
);
const b = linesFor("s2bbbbbb");
check("one line per inner action", b.length === 3, "got " + b.length);
check("inner tool names carried", b.map((r) => r.tool).join("|") === [
  "mcp__Claude_Browser__browser_batch/navigate",
  "mcp__Claude_Browser__browser_batch/computer",
  "mcp__Claude_Browser__browser_batch/computer",
].join("|"), b.map((r) => r.tool).join("|"));
check("part/of tagged", b[0].part === 0 && b[2].part === 2 && b[2].of === 3);
check("inner target extracted, not keys:*", b[0].target === "http://localhost:3000/dashboard", b[0].target);
check("no keys:actions line anywhere", !b.some((r) => r.target === "keys:actions"));

console.log("the cap counts TOOL CALLS, not lines");
fire(ev("s3cccccc", "Bash", { command: "npm run env:check" }), { VC_MEASURE_CAP: "4" });
const r2 = fire(
  ev("s3cccccc", "mcp__Claude_Browser__browser_batch", {
    actions: [{ name: "navigate", input: { url: "http://x/1" } }, { name: "navigate", input: { url: "http://x/2" } }],
  }),
  { VC_MEASURE_CAP: "4" },
);
const c = linesFor("s3cccccc");
check("3 lines written", c.length === 3, "got " + c.length);
check("but only 2 calls counted (no BUDGET at cap/2=2 yet... it fires AT 2)", r2.stdout.includes("2/4"), JSON.stringify(r2.stdout));

console.log("narrowed redaction — a blanket opaque-run rule eats paths, URLs and GUIDs");
const survive = [
  ["long kebab filename", "C:/repo/docs/adr/some-long-kebab-case-document-2026-01-31.md"],
  ["hyphenated GUID in a URL", "http://localhost:5000/api/customer/members/6d3f2b1a-4c5e-4a7b-8f90-1a2b3c4d5e6f"],
  ["32-hex platform id", "http://localhost:5000/api/catalog/products/9f8e7d6c5b4a39281706f5e4d3c2b1a0"],
  ["deep path", "D:/work/some-project/scripts/seed-data/domain/seed-something.mjs"],
];
for (const [name, val] of survive) {
  fire(ev("s4dddddd", "Read", { file_path: val }));
}
const s4 = linesFor("s4dddddd");
survive.forEach(([name, val], i) => {
  check(name + " survives", s4[i].target === val, s4[i].target);
});

console.log("(2b) real token shapes are still caught");
const caught = [
  ["GitHub PAT", "curl -H auth github_pat_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE"],
  ["JWT", "curl -H eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQdQw4w9WgXcQ"],
  ["sha256", "git show 9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0"],
  ["password= flag", "curl -d password=SuperSecret123"],
  ["Bearer", "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345'"],
];
for (const [, val] of caught) fire(ev("s5eeeeee", "Bash", { command: val }));
const s5 = linesFor("s5eeeeee");
caught.forEach(([name], i) => {
  check(name + " redacted", s5[i].target.includes("<redacted>"), s5[i].target);
});

console.log("a secret is redacted BY VALUE, so a bare PW= assignment cannot slip through");
const pwForms = [
  ["bare assignment with no secret-looking name", "PW='{{USER_PASSWORD}}'; curl -u user:$PW"],
  ["inline literal in a grep", "grep -o '{{USER_PASSWORD}}' MEASUREMENT/tool-log.jsonl | wc -l"],
  ["json body", "curl -d '{\"password\":\"{{USER_PASSWORD}}\"}'"],
];
for (const [, val] of pwForms) fire(ev("s6ffffff", "Bash", { command: val }));
const s6 = linesFor("s6ffffff");
pwForms.forEach(([name], i) => {
  check(name + " -> value gone", !s6[i].target.includes("{{USER_PASSWORD}}"), s6[i].target);
});
check("a 2-char secret value is NOT used for redaction (would blank ordinary words)", (() => {
  fire(ev("s7gggggg", "Bash", { command: "cat about.md" }));
  return linesFor("s7gggggg")[0].target === "cat about.md";
})());

console.log("a PATH-valued variable must not join the redaction list");
/* PWD/OLDPWD match SECRET_NAME because `pwd` abbreviates `password`. Unguarded, the project
 * path was cut out of every file_path target — found by the deep-path case above. */
fire(ev("s8hhhhhh", "Read", { file_path: "D:/work/some-project/scripts/lib/discover.ts" }), {
  PWD: "D:/work/some-project",
  OLDPWD: "D:/work/some-project",
  MY_TOKEN_PATH: "C:/some/other/place",
});
check(
  "project path survives despite PWD matching the secret-name pattern",
  linesFor("s8hhhhhh")[0].target === "D:/work/some-project/scripts/lib/discover.ts",
  linesFor("s8hhhhhh")[0].target,
);

console.log("but a password that merely CONTAINS a slash is still redacted");
const pwSlash = join(work, "slash.env");
writeFileSync(pwSlash, "TEST_USER_PASSWORD=P@ss/word1\n");
fire(ev("s9iiiiii", "Bash", { command: "curl -u shopper:P@ss/word1 http://localhost:5000/api" }), {
  VC_MEASURE_SECRETS: pwSlash,
});
check(
  "one-slash password redacted, URL intact",
  !linesFor("s9iiiiii")[0].target.includes("P@ss/word1") && linesFor("s9iiiiii")[0].target.includes("http://localhost:5000/api"),
  linesFor("s9iiiiii")[0].target,
);

console.log("(fail-open) a malformed event neither throws nor writes");
const bad = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: { ...process.env, VC_MEASURE_OUT: outDir } });
check("exit 0 on garbage input", bad.status === 0, "status " + bad.status);
check("silent on garbage input", (bad.stdout || "") === "" && (bad.stderr || "") === "", JSON.stringify(bad.stdout + bad.stderr));

/* browser_network_request is the one tool deliberately kept OUT of the permission allow-list:
 * run 02 asked it for `request-body` on a sign-in POST and got the password back in plaintext. Run
 * 06 used it fifteen times and reported reading response bodies only -- and the log could not
 * corroborate that, because it recorded `keys:index,part` and never which part. The dangerous
 * argument of the dangerous tool was the one thing the ground-truth record could not see. */
fire(ev("net00001", "mcp__playwright-chrome__browser_network_request", { index: 3, part: "response-body" }));
const netSafe = linesFor("net00001")[0];
check("browser_network_request records WHICH part was asked for", netSafe?.target === "response-body", JSON.stringify(netSafe));

fire(ev("net00002", "mcp__playwright-chrome__browser_network_request", { index: 1, part: "request-headers" }));
const netRisky = linesFor("net00002")[0];
check("a credential-carrying mode is nameable afterwards", netRisky?.target === "request-headers", JSON.stringify(netRisky));

/* And the rule it must not break: `part` is a MODE, so it may be logged -- but a tool that also
 * carries a real target must still log the target, not the mode. */
fire(ev("net00003", "Read", { file_path: "/tmp/x.md", part: "whatever" }));
check("an identifying key still wins over the mode", linesFor("net00003")[0]?.target === "/tmp/x.md", JSON.stringify(linesFor("net00003")[0]));

console.log("");
console.log("passed " + pass + ", failed " + fail);
rmSync(work, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
