// What a reviewer needs besides the diff and cannot get without a shell: each file as it was at the
// merge-base, and the earlier fix a change rewrites (fixes of fixes are about a tenth of all fixes
// here, so the reviewer should read what the earlier fix guarded against).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { git, showMany } from "./git.mjs";
import { ZONES } from "./zones.mjs";

const BINARY = ZONES.find((z) => z.id === "assets").globs[0].match(/\{(.*)\}/)[1].split(",");
const isBinary = (p) => BINARY.includes(path.extname(p).slice(1).toLowerCase());

// Paths under a folder of dir, or null for one that would escape it.
function inside(dir, sub, p) {
  const root = path.resolve(dir, sub);
  const target = path.resolve(root, p);
  return target.startsWith(root + path.sep) ? target : null;
}

// base/<path> for every changed file that existed at the merge-base and is not mechanical, read in one
// `git cat-file --batch`. Binary assets are left out: there is nothing to read in them.
export function writeBaseFiles(dir, r, mergeBase, show = showMany) {
  const paths = r.files.filter((f) => f.status !== "A" && !f.mechanical && !isBinary(f.path)).map((f) => f.path);
  const out = [];
  for (const [p, text] of show(mergeBase, paths)) {
    const target = inside(dir, "base", p);
    if (!target) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    out.push(path.relative(dir, target));
  }
  return out;
}

const FIX_NOTE = /^rewrites lines from a recent fix: ([0-9a-f]{7,40}) /;

// The earlier fix each file rewrites, from the classifier's note: path → short sha.
export function rewrittenFixes(r) {
  const out = new Map();
  for (const f of r.files) {
    const sha = f.reasons?.map((x) => x.match(FIX_NOTE)?.[1]).find(Boolean);
    if (sha && !f.mechanical) out.set(f.path, sha);
  }
  return out;
}

// fixes/<sha>.diff: that fix commit's diff for the files that rewrite it, one `git show` per commit.
export function writeFixDiffs(dir, r, show = (sha, paths) => git(["show", "--format=%h %s%n", sha, "--", ...paths])) {
  const bySha = new Map();
  for (const [p, sha] of rewrittenFixes(r)) bySha.set(sha, [...(bySha.get(sha) ?? []), p]);
  const out = [];
  for (const [sha, paths] of bySha) {
    const target = inside(dir, "fixes", `${sha}.diff`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, show(sha, paths));
    out.push(`fixes/${sha}.diff`);
  }
  return out;
}

// Review rules come from the merge-base, so a change cannot rewrite the rules it is reviewed by: the
// path-scoped rule files the script matched, and the agent files at the repository root.
export const ROOT_RULE_FILES = ["CLAUDE.md", "AGENTS.md", "REVIEW.md"];

export function ruleFiles(r) {
  return [...new Set([...(r.rules ?? []).map((x) => x.file), ...ROOT_RULE_FILES])];
}

// The warning when the change edits a file reviewers take their rules from.
export function rulesWarning(r) {
  const rules = new Set(ruleFiles(r));
  const edited = r.files.filter((f) => rules.has(f.path) || /^\.claude\/rules\//.test(f.path)).map((f) => f.path);
  return edited.length ? `this change edits review rules (${edited.join(", ")}); reviewers use the base versions` : null;
}

// rules/<path>: each rule file as it was at the merge-base; files missing there are left out.
export function writeRuleFiles(dir, r, mergeBase, show = showMany) {
  const out = [];
  for (const [p, text] of show(mergeBase, ruleFiles(r))) {
    const target = text && inside(dir, "rules", p);
    if (!target) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    out.push(path.relative(dir, target));
  }
  return out;
}
