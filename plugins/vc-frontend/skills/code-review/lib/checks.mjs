// Literal rule checks on added lines: the rules a pattern can decide, so no model has to hold them in
// mind (models drop rules when given many at once) and no model spends a turn finding them. Each check
// names its rule file and fires only when that file, as it is at the merge-base, still says what the
// check enforces (`anchor`) and its paths cover the changed file. A hit is a finding candidate: the
// rules agent or the refuter confirms or drops it, with the code around it in view.

import { globMatch } from "./globs.mjs";

const TEST = /\.(test|spec)\.[cm]?[jt]sx?$|\.test-d\.ts$/;
const CODE = /\.(vue|ts|tsx)$/;
const APP_TS = /^client-app\/.*\.ts$/;
const NOT_APP_MODULE = /\.(d|stories|config)\.ts$|(^|\/)(vite|vitest|tailwind|postcss)\.|\.test(-d)?\.ts$/;

export const CHECKS = [
  { id: "focused-test", rule: "tests.md", anchor: "it.only", files: TEST, re: /\b(it|describe|test)\.(only|skip)\(/, says: "`it.only` / `describe.only` / `it.skip` left in" },
  { id: "class-selector", rule: "tests.md", anchor: "data-test-id", files: TEST, re: /\b(find|findAll|get|querySelector|querySelectorAll)\(\s*["'`]\s*[^"'`]*\.[A-Za-z_-]/, says: "new selectors use `data-test-id` or `findComponent(VcX)`, never Tailwind/BEM classes" },
  { id: "test-placement", rule: "tests.md", anchor: "__tests__", files: /\.spec\.[jt]s$|\/__tests__\//, added: true, says: "unit tests are `*.test.ts` next to the source file (no `.spec.ts`, no new `__tests__/` folders)" },
  { id: "any", rule: "vue-typescript.md", anchor: "No `any`", files: CODE, skip: TEST, re: /:\s*any\b|<any>|\bas any\b|\bany\[\]/, says: "no `any`; use `unknown` + a type guard" },
  { id: "lodash", rule: "vue-typescript.md", anchor: "lodash-es", files: CODE, re: /from\s+["']lodash["']/, says: "`lodash-es` with named imports only (never `lodash`)" },
  { id: "then-chain", rule: "vue-typescript.md", anchor: "async/await", files: CODE, skip: TEST, re: /\.then\(/, says: "`async/await`, not `.then` chains" },
  { id: "default-export", rule: "vue-typescript.md", anchor: "No default exports", files: APP_TS, skip: NOT_APP_MODULE, re: /^\s*export default\b/, says: "no default exports in `.ts` app code" },
  { id: "props-destructure", rule: "vue-typescript.md", anchor: "Never destructure props", files: /\.vue$/, re: /\bconst\s*\{[^}]*\}\s*=\s*(withDefaults\(\s*)?defineProps\b/, says: "never destructure props, use `props.x`" },
  { id: "curly", rule: "vue-typescript.md", anchor: "Braces always", files: CODE, re: /^\s*(}\s*else\s+)?if\s*\(.*\)\s*(return|break|continue|throw)\b/, says: "braces always: no single-line `if (x) return;`" },
  { id: "v-slot", rule: "markup.md", anchor: "v-slot:name", files: /\.vue$/, re: /\bv-slot:/, says: "slots use `<template #name>`, not `v-slot:name`" },
  { id: "test-id-spelling", rule: "markup.md", anchor: "data-testid", files: /\.vue$/, re: /\bdata-(testid|qa)\b/, says: "`data-test-id`, never `data-testid` / `data-qa`" },
  { id: "v-if-with-v-for", rule: "markup.md", anchor: "`v-if` and `v-for`", files: /\.vue$/, re: /\bv-for=.*\sv-if=|\bv-if=.*\sv-for=/, says: "never `v-if` and `v-for` on the same element" },
  { id: "static-style", rule: "markup.md", anchor: "inline `style=", files: /\.vue$/, re: /\sstyle="/, says: "no static inline `style=\"...\"`" },
  { id: "scoped-or-deep", rule: "styles.md", anchor: "scoped", files: /\.vue$/, re: /<style\b[^>]*\bscoped\b|:deep\(|::v-deep/, says: "`<style lang=\"scss\">` without `scoped`, no `:deep()` / `::v-deep`" },
];

// files: classified files (added lines with numbers); rules: [{ file, globs }] at the merge-base;
// readRule(path): its text at the merge-base. Returns [{ check, path, line, text, rule, says }].
export function ruleChecks(files, rules, readRule) {
  const byName = new Map(rules.map((r) => [r.file.split("/").pop(), r]));
  const texts = new Map();
  const active = CHECKS.filter((c) => {
    const r = byName.get(c.rule);
    if (!r) return false;
    if (!texts.has(r.file)) texts.set(r.file, readRule(r.file) ?? "");
    return texts.get(r.file).includes(c.anchor);
  });
  const out = [];
  for (const f of files) {
    if (f.mechanical || f.status === "D") continue;
    for (const c of active) {
      const r = byName.get(c.rule);
      if (!c.files.test(f.path) || c.skip?.test(f.path) || !r.globs.some((g) => globMatch(g, f.path))) continue;
      const hit = (line, text) => out.push({ check: c.id, path: f.path, line, text: text.trim().slice(0, 160), rule: r.file, says: c.says });
      if (c.added) {
        if (f.status === "A") hit(1, f.path);
        continue;
      }
      f.addedText.forEach((t, i) => c.re.test(t) && hit(f.addedLines[i] ?? null, t));
    }
  }
  return out;
}
