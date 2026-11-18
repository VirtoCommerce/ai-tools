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

// A Signals line holds one or more matchers, any of which selects the question:
//   `regex`          the file's path or any changed line;
//   removed `regex`  a removed line (renames and removals, not every new use);
//   rewrite          the file both loses and gains REWRITE_MIN_LINES lines (a refactor or rewrite);
//   new-code         a new file of NEW_FILE_MIN_LINES lines, or NEW_CODE_MIN_LINES added lines;
//   always           every non-R0 file.
const REWRITE_MIN_LINES = 15;
const NEW_CODE_MIN_LINES = 80;
const NEW_FILE_MIN_LINES = 30;

export function parseQuestions(text, src, warnings) {
  const out = [];
  for (const m of text.matchAll(/\*\*([A-Z0-9]+-\d+) \(([^)]+)\)\.\*\*([\s\S]*?)\nSignals: ([^\n]+)/g)) {
    try {
      out.push({ id: m[1], floor: m[2], text: `**${m[1]} (${m[2]}).**${m[3]}`.trim(), matchers: parseSignals(m[4]) });
    } catch (e) {
      warnings.push(`bad Signals for ${m[1]} in ${src}: ${e.message}`);
    }
  }
  return out;
}

function parseSignals(line) {
  const out = [];
  for (const t of line.matchAll(/(removed )?`([^`\n]+)`|\b(always|rewrite|new-code)\b/g)) {
    if (t[3]) out.push({ kind: t[3] });
    else out.push({ kind: t[1] ? "removed" : "any", re: new RegExp(t[2]) });
  }
  if (!out.length) throw new Error("no matcher");
  return out;
}

// R0 files get none; any other file gets the questions one of whose matchers fires.
export function matchQuestions(questions, f) {
  if (f.tier === 0) return [];
  const lines = [f.path, ...f.addedText, ...f.deletedText];
  const fires = (m) =>
    m.kind === "always" ||
    (m.kind === "rewrite" && f.added >= REWRITE_MIN_LINES && f.deleted >= REWRITE_MIN_LINES) ||
    (m.kind === "new-code" && ((f.status === "A" && f.added >= NEW_FILE_MIN_LINES) || f.added >= NEW_CODE_MIN_LINES)) ||
    (m.kind === "removed" && f.deletedText.some((l) => m.re.test(l))) ||
    (m.kind === "any" && lines.some((l) => m.re.test(l)));
  return questions.filter((q) => q.matchers.some(fires)).map((q) => q.id);
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
