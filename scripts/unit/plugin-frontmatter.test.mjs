// Guards the YAML frontmatter of every markdown component this repo ships — both the distributed
// plugins and the project-scoped `.claude/` surface Claude Code auto-discovers here (VCST-5807).
//
// `plugins/vc-fix/skills/project-init/SKILL.md` carried a ~1020-character UNQUOTED `description:`
// scalar containing a colon-space — "…Day-2 modes skip the interview: `--add-env` adds…". In YAML a
// `: ` inside a plain scalar IS the key/value separator, so the parser saw a malformed mapping and
// abandoned the whole block; `claude plugin validate` reported that the skill "loads with empty
// metadata (all frontmatter fields silently dropped)". It had sat there since 2026-07-21 because
// nothing checked. `.claude/skills/vc-self-check/SKILL.md` carried the identical defect, and there
// the symptom was directly visible: the skill listed by its H1 heading instead of its description.
//
// The detector lives in scripts/lib/frontmatter-lint.mjs — a source module, not this file, so a
// future lint script can import it WITHOUT executing this suite as a side effect. Its header
// documents exactly what the scan does and does not cover; read it before widening either.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ambiguousPlainScalars } from "../lib/frontmatter-lint.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** Both surfaces ship markdown components whose frontmatter a parser reads. */
const SCAN_ROOTS = ["plugins", ".claude"];
/**
 * A floor on the corpus. Without it, a `plugins/` rename or a sparse checkout leaves `offenders`
 * empty and the guard reports green having checked NOTHING — the same silent-pass failure mode this
 * repo already guards against for its test-data fixtures (`td:validate:wishlists` and friends).
 * 112 + 214 files today; the floor is deliberately slack, it only has to catch a collapse.
 */
const MIN_FILES = 200;

/** Every `.md` under a scan root, minus vendored, generated, and VCS directories. */
function markdownFiles(dir, out = []) {
  let entries;
  try {
    // withFileTypes is lstat-based: it never follows a directory symlink, so a link cycle cannot
    // send this into unbounded recursion (and it drops one syscall per entry).
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return out; // a missing root is caught by MIN_FILES, with a clearer message
    throw err;
  }
  for (const entry of entries) {
    // Dot-directories are gitignored working state (.vc-fix/, .fix-workspace/) — scanning them makes
    // a local run disagree with CI.
    if (entry.name === "node_modules" || (entry.isDirectory() && entry.name.startsWith("."))) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

test("every shipped markdown has frontmatter a YAML parser can read", () => {
  const files = SCAN_ROOTS.flatMap((root) => markdownFiles(join(ROOT, root)));
  assert.ok(
    files.length >= MIN_FILES,
    `frontmatter scan found only ${files.length} markdown files (expected at least ${MIN_FILES}). `
    + `The walker is broken or a scan root moved — a guard that checks nothing passes vacuously.`,
  );

  const offenders = [];
  for (const file of files) {
    for (const p of ambiguousPlainScalars(readFileSync(file, "utf8"))) {
      offenders.push(`${relative(ROOT, file).split("\\").join("/")} → ${p.key} [${p.code}]: ${p.why}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    `Quote the value (\`key: "…"\`) or use a block scalar (\`key: >\`). A plain YAML scalar cannot hold\n`
    + `these safely, and a component whose frontmatter fails to parse loads with EMPTY metadata:\n  `
    + offenders.join("\n  "),
  );
});

// ─── the detector itself, so a future "fix" cannot be to weaken it ────────────────────────
const fm = (value) => `---\nname: x\ndescription: ${value}\n---\n# x`;
const codes = (markdown) => ambiguousPlainScalars(markdown).map((p) => p.code);

// Findings carry a stable `code` precisely so these assertions can name the RULE that fired. An
// earlier draft asserted only on `.length`, which stays green even when the wrong rule matches.
for (const [label, value, expected] of [
  ["the exact shape that shipped (VCST-5807)", "Onboard. Day-2 modes skip the interview: `--add-env` adds an env.", ["COLON_SEPARATOR"]],
  ["a colon followed by a TAB is also a separator", "Day-2 modes:\tskip the interview", ["COLON_SEPARATOR"]],
  ["trailing colon", "see below:", ["TRAILING_COLON"]],
  ["leading flow indicator", "[not, a, list, we, meant]", ["INDICATOR"]],
  // ` #` is nastier than the bug that motivated this guard: YAML truncates at the comment and reports
  // NO error, so `claude plugin validate` is green too while the description silently ends early.
  ["space-hash silently truncates the value", "Handles PR #123 and more prose", ["COMMENT_START"]],
  ["a colon with no space is not a separator", "fetches https://example.com/mcp for docs", []],
  ["a hash with no leading space is not a comment", "uses C#/dotnet under the hood", []],
  // Quoting is the fix, so it must be accepted — otherwise the guard degenerates into "no colons in
  // prose". Both quote styles, and both escape conventions.
  ["double-quoted is the fix", '"Day-2 modes: `--add-env` adds an env."', []],
  ["single-quoted is the fix", "'Day-2 modes: --add-env adds an env.'", []],
  ["an escaped inner double quote is fine", '"Use the \\"fast\\" path here."', []],
  ["a doubled inner single quote is fine", "'Don''t run this twice.'", []],
  ["a trailing comment after a quoted value is legal", '"Some text." # a note', []],
  // …but the quoting must itself be well-formed, or the guard is blind to a regression in its own
  // remedy. 39 of this repo's frontmatter values contain an apostrophe.
  ["an unterminated quote is a parse error", '"Onboard the plugin', ["UNTERMINATED_QUOTE"]],
  ["an unescaped inner double quote closes the scalar early", '"Use the "fast" path"', ["UNESCAPED_QUOTE"]],
  ["an unescaped inner single quote closes the scalar early", "'Don't run this twice'", ["UNESCAPED_QUOTE"]],
]) {
  test(`ambiguousPlainScalars: ${label}`, () => {
    assert.deepEqual(codes(fm(value)), expected);
  });
}

test("ambiguousPlainScalars: a BLOCK SCALAR is valid YAML, not a finding", () => {
  // vc-perf's perf-loop SKILL.md writes its description this way and passes `claude plugin validate`.
  // The indent digit and the chomp indicator may appear in EITHER order — an earlier pattern
  // hardcoded chomp-then-indent and so rejected `|2-`: a false positive on valid YAML. An
  // over-matching guard on green code is how a detector becomes noise and then gets ignored.
  for (const intro of [">", "|", ">-", "|-", ">+", "|+", "|2", ">2", "|2-", ">2-", "|2+", "|-2"]) {
    const md = `---\nname: x\ndescription: ${intro}\n  A long description. It even has a colon: right here.\n  And a second line.\n---\n# x`;
    assert.deepEqual(ambiguousPlainScalars(md), [], `\`description: ${intro}\` must be accepted`);
  }
});

test("ambiguousPlainScalars: a WRAPPED plain scalar is checked on every line", () => {
  // The fatal `: ` is just as fatal one line lower, and a plain scalar legitimately wraps. vc-perf's
  // perf-loop description already spans five lines — safe only because it opens with `>`. Drop that
  // one character and this shape ships the original outage with a green suite.
  const wrapped = "---\nname: x\ndescription: A long description that wraps\n  onto a second line: and has a colon.\n---\n# x";
  assert.deepEqual(codes(wrapped), ["CONTINUATION"]);
  const safe = "---\nname: x\ndescription: A long description that wraps\n  onto a second line, harmlessly.\n---\n# x";
  assert.deepEqual(codes(safe), []);
});

test("ambiguousPlainScalars: nested mappings and lists are out of scope, not findings", () => {
  // Keys are anchored at column 0 by design. An indented line is judged only when it continues a
  // PLAIN scalar; under a key with no inline value it belongs to a structure this scan does not model.
  assert.deepEqual(codes("---\nname: x\nmetadata:\n  author: someone\n  team: qa\n---\n# x"), []);
  assert.deepEqual(codes("---\nname: x\nallowed-tools:\n  - Read\n  - Bash\n---\n# x"), []);
});

test("ambiguousPlainScalars: a BOM must not hide the frontmatter", () => {
  // `^---` fails against a BOM-prefixed `---`, which would route a genuinely broken file down the
  // "no frontmatter, nothing to judge" path — a false PASS.
  assert.deepEqual(codes("﻿" + fm("Day-2 modes skip: this")), ["COLON_SEPARATOR"]);
});

test("ambiguousPlainScalars: CRLF line endings are handled (this repo is Windows-primary)", () => {
  assert.deepEqual(codes(fm("Day-2 modes skip: this").replace(/\n/g, "\r\n")), ["COLON_SEPARATOR"]);
});

test("ambiguousPlainScalars: files with no frontmatter are ignored, not failed", () => {
  assert.deepEqual(ambiguousPlainScalars("# Just a doc\n\nSome prose: with a colon.\n"), []);
  assert.deepEqual(ambiguousPlainScalars(""), []);
});
