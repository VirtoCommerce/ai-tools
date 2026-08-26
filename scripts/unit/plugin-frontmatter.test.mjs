// Guards the YAML frontmatter of every markdown component the plugins ship (VCST-5807).
//
// `plugins/vc-fix/skills/project-init/SKILL.md` carried a ~1020-character UNQUOTED `description:`
// scalar containing a colon-space — "…Day-2 modes skip the interview: `--add-env` adds…". In YAML a
// `: ` inside a plain scalar IS the key/value separator, so the parser saw a malformed mapping and
// abandoned the whole block. `claude plugin validate` reported it as
//
//     frontmatter: YAML frontmatter failed to parse … At runtime this skill loads with empty
//     metadata (all frontmatter fields silently dropped).
//
// which BLOCKED `claude plugin tag --push`, the documented way to cut the per-plugin dependency tag
// (`docs/release-process.md` §Step 5a) — so VCST-5774's security release had to be tagged by hand.
// It had sat there since 2026-07-21 because nothing checked.
//
// WHAT THIS TEST IS, AND IS NOT. It is NOT a YAML parse: no YAML library is a dependency of this
// repo, and adding one to lint six files is not worth the supply-chain surface. It is a scan for the
// specific constructs that make a PLAIN (unquoted) scalar ambiguous — which is the failure class
// that actually occurred and the one a long prose `description:` invites. A quoted scalar is exempt,
// because quoting is exactly the fix. So:
//
//   caught      — an unquoted value containing `: `, or opening with a YAML indicator character,
//                 or ending in `:`
//   NOT caught  — bad indentation, duplicate keys, tabs, a broken multi-line block scalar, an
//                 unterminated quote. `claude plugin validate` catches those; it needs the `claude`
//                 CLI, which CI does not install, so this is the cheap always-on half.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGINS_DIR = join(ROOT, "plugins");

/** Every `.md` under plugins/, minus node_modules. */
function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) markdownFiles(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

/** A leading YAML indicator makes a plain scalar mean something other than text. */
const INDICATOR = /^[[\]{}&*!|>%@`#,]/;
/**
 * `key: >` / `key: |` (with an optional chomp `+`/`-` and indent digit) is a BLOCK SCALAR
 * introducer — valid YAML, and the idiomatic way to write a long multi-line description. The first
 * cut of this guard flagged `vc-perf`'s `perf-loop` SKILL.md for it, which is a false positive: that
 * plugin passes `claude plugin validate`. Worth spelling out, because an over-matching guard on
 * green code is the same defect this PR's own review caught once already — and the fix for a noisy
 * detector is always to teach it the legitimate shape, never to delete the check.
 */
const BLOCK_SCALAR = /^[|>][+-]?\d*$/;

/**
 * Frontmatter values whose PLAIN (unquoted) form is ambiguous to a YAML parser. Pure — exported so
 * the test can prove it flags the real defect and, just as importantly, does NOT flag the fix.
 * @returns {Array<{key:string, why:string}>}
 */
export function ambiguousPlainScalars(markdown) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(markdown);
  if (!m) return []; // no frontmatter at all — nothing to judge
  const problems = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!kv) continue; // continuation, comment, or nested — out of scope, see the header note
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (!value) continue; // empty, or a block/nested value on following lines
    if (/^["']/.test(value)) continue; // quoted — the fix; contents are the parser's problem now
    if (BLOCK_SCALAR.test(value)) continue; // `key: >` / `key: |` — a block scalar, the other valid answer
    if (value.includes(": ")) problems.push({ key, why: "unquoted value contains a colon-space, which YAML reads as a key/value separator" });
    else if (value.endsWith(":")) problems.push({ key, why: "unquoted value ends in a colon, which YAML reads as an empty mapping key" });
    else if (INDICATOR.test(value)) problems.push({ key, why: `unquoted value starts with the YAML indicator '${value[0]}'` });
  }
  return problems;
}

test("every plugin markdown has frontmatter a YAML parser can read", () => {
  const offenders = [];
  for (const file of markdownFiles(PLUGINS_DIR)) {
    for (const p of ambiguousPlainScalars(readFileSync(file, "utf8"))) {
      offenders.push(`${relative(ROOT, file).replace(/\\/g, "/")} → ${p.key}: ${p.why}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    `Quote the value (\`key: "…"\`). A plain YAML scalar cannot hold these safely, and a skill whose\n`
    + `frontmatter fails to parse loads with EMPTY metadata and blocks \`claude plugin tag\`:\n  `
    + offenders.join("\n  "),
  );
});

// ─── the detector itself, so a future "fix" cannot be to weaken it ────────────────────────
test("ambiguousPlainScalars: flags the exact shape that shipped (VCST-5807)", () => {
  const bad = "---\nname: project-init\ndescription: Onboard the plugin. Day-2 modes skip the interview: `--add-env` adds an env.\n---\n# x";
  assert.deepEqual(ambiguousPlainScalars(bad).map((p) => p.key), ["description"]);
});

test("ambiguousPlainScalars: a QUOTED value containing a colon-space is fine — that is the fix", () => {
  // The guard must not degenerate into "no colons in descriptions": quoting is the correct answer,
  // and prose legitimately wants colons. Both quote styles count.
  const dq = '---\nname: x\ndescription: "Day-2 modes skip the interview: `--add-env` adds an env."\n---\n# x';
  const sq = "---\nname: x\ndescription: 'Day-2 modes skip the interview: --add-env adds an env.'\n---\n# x";
  assert.deepEqual(ambiguousPlainScalars(dq), []);
  assert.deepEqual(ambiguousPlainScalars(sq), []);
});

test("ambiguousPlainScalars: a BLOCK SCALAR (`key: >` / `key: |`) is valid YAML, not a finding", () => {
  // vc-perf's perf-loop SKILL.md writes its description this way and passes `claude plugin validate`.
  // The first cut of this guard flagged it — a false positive on green code, which is how a detector
  // becomes noise and then gets ignored.
  for (const intro of [">", "|", ">-", "|-", ">+", "|2"]) {
    const md = `---\nname: x\ndescription: ${intro}\n  A long description. It even has a colon: right here.\n  And a second line.\n---\n# x`;
    assert.deepEqual(ambiguousPlainScalars(md), [], `\`description: ${intro}\` must be accepted`);
  }
});

test("ambiguousPlainScalars: other plain-scalar traps — leading indicator, trailing colon", () => {
  const lead = "---\nname: x\ndescription: [not, a, list, we, meant]\n---\n# x";
  assert.equal(ambiguousPlainScalars(lead).length, 1);
  const trail = "---\nname: x\ndescription: see below:\n---\n# x";
  assert.equal(ambiguousPlainScalars(trail).length, 1);
  // A colon with no space is NOT a separator — `https://x` must stay legal unquoted.
  const url = "---\nname: x\ndescription: fetches https://example.com/mcp for docs\n---\n# x";
  assert.deepEqual(ambiguousPlainScalars(url), []);
});

test("ambiguousPlainScalars: files with no frontmatter are ignored, not failed", () => {
  assert.deepEqual(ambiguousPlainScalars("# Just a doc\n\nSome prose: with a colon.\n"), []);
  assert.deepEqual(ambiguousPlainScalars(""), []);
});
