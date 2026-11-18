// Risk questions pre-selected per file, and the repository's path-scoped rule files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { git, gitShow } from "./git.mjs";

const SKILL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Questions and their `Signals:` regex, from this skill's risk-questions.md and, when the repository
// has one, its own .claude/review/risk-questions.md (same format). A signal only pre-selects a question.
export function loadQuestions(warnings) {
  const sources = [path.join(SKILL_DIR, "risk-questions.md"), ".claude/review/risk-questions.md"];
  const out = [];
  for (const src of sources) {
    if (!existsSync(src)) continue;
    out.push(...parseQuestions(readFileSync(src, "utf8"), src, warnings));
  }
  if (!out.length) warnings.push("no risk questions found: answer risk-questions.md in full");
  return out;
}

export function parseQuestions(text, src, warnings) {
  const out = [];
  for (const m of text.matchAll(/\*\*([A-Z0-9]+-\d+) \(([^)]+)\)\.\*\*[\s\S]*?\nSignals: (always|`([^`\n]+)`)/g)) {
    try {
      out.push({ id: m[1], floor: m[2], always: m[3] === "always", re: m[3] === "always" ? null : new RegExp(m[4]) });
    } catch {
      warnings.push(`bad Signals regex for ${m[1]} in ${src}`);
    }
  }
  return out;
}

// R0 files get none; any other file gets the questions its path or a changed line matches.
export function matchQuestions(questions, f) {
  if (f.tier === 0) return [];
  const lines = [f.path, ...f.addedText, ...f.deletedText];
  return questions.filter((q) => q.always || lines.some((l) => q.re.test(l))).map((q) => q.id);
}

// The path-scoped rule files and their globs, as they are at the merge-base when one is given: a change
// that deletes a rule file or narrows its globs must not drop it from its own review. Without a
// merge-base (tests, a fresh repository) the working tree.
export function pathScopedRules(mergeBase = null) {
  const dir = ".claude/rules";
  const list = mergeBase ? listAt(mergeBase, dir) : existsSync(dir) ? readdirSync(dir).map((n) => path.posix.join(dir, n)) : [];
  return list
    .filter((p) => p.endsWith(".md"))
    .map((p) => ruleGlobs(p, mergeBase ? gitShow(`${mergeBase}:${p}`) : readFileSync(p, "utf8")));
}

export function ruleGlobs(file, text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const globs = fm ? [...fm[1].matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1]) : [];
  return { file, globs: globs.length ? globs : ["**"] };
}

function listAt(rev, dir) {
  try {
    return git(["ls-tree", "--name-only", `${rev}:${dir}`]).split("\n").filter(Boolean).map((n) => path.posix.join(dir, n));
  } catch {
    return [];
  }
}
