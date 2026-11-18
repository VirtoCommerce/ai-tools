// Risk questions pre-selected per file, and the repository's path-scoped rule files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export function pathScopedRules() {
  const dir = ".claude/rules";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .map((n) => {
      const text = readFileSync(path.join(dir, n), "utf8");
      const fm = text.match(/^---\n([\s\S]*?)\n---/);
      const globs = fm ? [...fm[1].matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1]) : [];
      return { file: path.join(dir, n), globs: globs.length ? globs : ["**"] };
    });
}
