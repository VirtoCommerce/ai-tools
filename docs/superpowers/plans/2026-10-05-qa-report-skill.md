# `/qa-report` — one home for every result comment and report page: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `qa-report` skill that turns any finished run (`/qa-test`, `/qa-test-fast`, `/qa-verify-fix`, `/qa-regression`, `/qa-smoke`) into **one** brief, char-budgeted tracker comment and **one** human-readable HTML page. Every template lives in one folder, and the five pipelines stop carrying their own copies.

**Architecture:**
- **One deterministic renderer.** `render.mjs` reads the run's **machine record** (`summary.json`, `verification-summary.json`, or the run folder's `suite-*-results.json`). It normalises the record into one `ReportModel` and fills a **template**: a Markdown file whose front-matter declares its char budget. If a template is over budget, the renderer collapses the template's lists (`+N more`). If it is still over, the renderer fails loudly. It never cuts text mid-line. The same model fills the HTML page shell.
- **A thin skill.** `SKILL.md` covers the parts that need judgement or a person: resolving the source, the publish gate, the single yes/no, posting or amending through the existing `tracker:comment` / MCP / `ado.mjs` path, and recording the link.
- **Callers hand off; there is no hook.** Each pipeline's close-out step makes a single call to `/vc-fix:qa-report` with its machine record and passes no other content. The skill can also be run on its own on a ticket key or a `RUN_ID`.

**Tech Stack:**
- Plain Node ESM `.mjs` with zero dependencies. It runs from the plugin install, like `skills/vc-self-check/deliver.mjs`.
- Tests: `node:test`, **temporary only**.
- HTML page shell: built from the existing `qa-test-fast/report-template.html`, which already follows `artifact-design`.

**Spec:** Jira **VCST-5675** "[Agentic QA] Implement skill /qa-report" (parent epic VCST-5204). The description, verbatim:

> 1. We need to create a template for comments after testing. Brief, with chars budget
>    a) Template for results after testing
>    b) Template for bug-fix: Before and after fix
> 2. One place where all templates live. One source of truth
> 3. Human-readable reports after testing, regression, smoke which attach to ticket
> 4. For html report use buil-in artefact-design

---

## Decisions (and the one alternative each replaced)

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| D1 | **The skill lives in `plugins/vc-fix/skills/qa-report/` only.** It is invoked as `/vc-fix:qa-report` from `.claude/` pipelines, and as `qa-report` inside the plugin. | `/qa-verify-fix` (template b, before/after) ships **only** in the plugin. The `.claude/` pipelines already depend on plugin skills (`/qa-test-fast` → `/vc-fix:qa-bug`, `vc-fix:qa-investigate`). The plugin is the only location both surfaces can reach, so it is the only way to get *one source of truth* (spec 2). | `.claude/skills/qa-report/` plus a plugin copy. That is two copies, and the mirror gate was removed on 2026-09-19, so nothing would catch drift. |
| D2 | **Each caller's close-out step calls the skill with its machine record.** The skill can also run standalone: `/vc-fix:qa-report VCST-1234`, `/vc-fix:qa-report REG-2026-10-05-1200 --verdict GO`. | A comment is an outward write that needs a person's yes, and a hook cannot ask. Rendering from the machine record means the comment is *derived*, never re-typed. | A `Stop`/`SubagentStop` hook that auto-posts when a `summary.json` appears. Rejected: it cannot ask, would fire on partial runs, and goes against the repo's "capture never decides" design. |
| D3 | **The char budget lives only in each template's front-matter** (`budget: 1500`). When over budget, the renderer collapses lists, never prose. If it is still over, exit 3. | Spec 1 asks for a budget. Keeping it in the template means no second place states the number (GOLDEN RULE). | Truncating the text at N chars. That cuts a verdict mid-line, and it fails silently. |
| D4 | **One Markdown source, three wire dialects:** `markdown` (Jira v3, the default), `wiki` (Jira v2, required to embed before/after **screenshots** inline, `tracker-ops.md` §5c) and `html` (Azure Boards, `azure-html-format.md`). | Each tracker accepts a different dialect, and a fourth copy of each template would undo spec 2. | One template per dialect (12 files). |
| D5 | **The HTML page is one shell (`templates/page.html`) for all four kinds.** It is published with the Artifact tool after loading `artifact-design` (spec 4). It is gated by `profile.projectType`: a client project keeps the page local. | Gives one look everywhere. The shell already passes the artifact-design contract: tokens on `:root`, dark mode under both selectors, IBM Plex. | A page template per pipeline. Rejected: that is the drift spec 2 removes. |
| D6 | **"Attach to ticket" = the page link inside the ONE comment.** On a native project that link is the Artifact. On a client project the page goes on the same post as `tracker:comment --attach-file`, so it stays in the client's own tracker, plus inline screenshots. | `tracker-ops.md` §5d says a pointer is legitimate when the target is reachable, and an attachment on the same ticket is reachable. | Attaching `page.html` on a native project (a Jira HTML attachment downloads but does not render; the Artifact renders). |

## Global Constraints

- **Unit tests are TEMPORARY.** This follows the repo rule in `.claude/knowledge/execution/when-to-write-a-test.md` RULE 2, which overrides writing-plans' default of committing tests (see *Conflict* below):
  - Write each test as `scripts/unit/_tmp-qa-report-<name>.test.mjs`.
  - Run it red → green, then **delete it before the commit**.
  - No new `scripts/unit/` file is ever committed.
- **Branch:** create `claude/qa-tooling/qa-report` from `origin/main` in a fresh worktree. The current branch (`claude/qa-tooling/qa-env-upgrade`) has unrelated uncommitted work.
- **The plugin is self-contained** (`plugins/CLAUDE.md`):
  - Nothing under `plugins/vc-fix/skills/qa-report/` imports from the repo root.
  - Paths resolve through `import.meta.url`.
  - The skill calls the renderer as `node "$pluginRoot/skills/qa-report/render.mjs"` (`plugins/vc-fix/knowledge/execution/plugin-root.md`).
  - In this repo, `npm run report:render --` is the same file.
- **Never transcribe a budget, a count or a verdict list** into prose. Budgets live in template front-matter, verdict vocabularies in `lib/model.mjs` `VERDICTS`. Docs point at those, never restate them.
- **Case notes never reach the comment or the page.** Regression `notes` carry account emails and fixture details. The model keeps only `id`, `title` and `status`.
- **The renderer posts nothing.** Posting goes through the existing paths:
  - `npm run tracker:comment` (this repo);
  - the Atlassian MCP with `commentId` to amend (plugin-only installs; the plugin's `enforce-one-tracker-comment` hooks guard it);
  - `ado.mjs comment` (Azure).
  
  ONE comment per ticket per round, amended afterwards (`tracker-ops.md` §0).
- **No raw Jira REST from this repo, uploads included.** An image embedded inline goes through `--attach`. Any other file (the report page on a client project) goes through `--attach-file`, which links the file from the one comment (`tracker-ops.md` §0a, §5d). **Prerequisite:** `--attach-file` was added to `scripts/tracker/comment.mjs` on 2026-10-05, outside this plan, and must be on `main` before Task 5 starts.
- **Prompt budget:**
  - `SKILL.md` must be born under 19,000 chars (BUDGET-004).
  - `qa-regression.md` is in `.prompt-size-baseline.json`, so it may only shrink: the edit in Task 7 must be net-negative.
  - `npm run context:check` must be green after every task that touches `.claude/` or `CLAUDE.md`-cited paths.
- **The `kb` step does not apply:** `qa-report` is a *Mechanic* (report rendering, `authoring-standard.md` §5.2), so it is exempt.
- **Plugin completion marker:** the skill's last action is `node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "qa-report"` (`skill-expectations.md` §Signal completion).

**Conflict (surfaced, not silently resolved):** writing-plans says "TDD, frequent commits" with the tests committed. This repo's `CLAUDE.md` says NO CODE ⇒ NO TEST and that code tests are temporary. This plan follows the repo rule, which is what you chose for the `/qa-env-upgrade` plan earlier today. Confirm, or say which wins.

## Review Focus

1. **Hostile text in a value.** Covers `|` or a newline in a case title or a before/after value, `<script>` in a title, `$&` / `$1` in any value, and a value containing `{{TICKET}}`.
   - Expected: the Markdown table stays rectangular (`|` → `/`, newline → space), the page shows the text escaped, `String.replace` patterns are never interpreted, and a value can never fill a slot.
   - Tests: Task 1 (`cell`, slot injection), Task 3 (escape, `$&`).
2. **Over budget with long lists.**
   - Expected: the longest trimmable list shrinks first and **never below one item**. A `+N more in the full report` line appears. The `{{^LIST}}` "None" line never shows for a list that was trimmed.
   - If the text is still over budget, exit 3. Nothing is cut mid-line.
   - Test: Task 1.
3. **A regression run folder that is not consolidated.** Covers an empty `completedAt`, both `suite-X-results.json` and `suite-X-results.browser.json` present, and no results at all.
   - Expected: dedupe by `suiteId` keeps the record with the most cases (newest on a tie). An unconsolidated chosen record means exit 2 with "finish the run first", never a partial count. No results also means exit 2.
   - Test: Task 2.
4. **Verdict spelling drift.** Covers `conditional go`, `Conditional-Go`, `PASS WITH NOTES`, an unknown word, and regression/smoke without `--verdict`.
   - Expected: normalised to `CONDITIONAL_GO` / `PASS_WITH_NOTES`. Unknown words, or a missing run verdict, give exit 2 listing the allowed values.
   - Test: Task 2 (vocabulary), Task 4 (CLI).
5. **Dialect leaks.** The Markdown output must pass `wikiMarkupRefusal` (otherwise `tracker:comment` refuses the post), and the `wiki` output must keep `!shot.png|width=700!` lines intact.
   - Expected: all four kinds render Markdown that `wikiMarkupRefusal` accepts, and the wiki fix comment contains one `!name|width=700!` line per screenshot.
   - Test: Task 4.

---

## How it is called (the answer to "after testing, regression, smoke")

```
pipeline close-out step                     machine record                         qa-report
──────────────────────────────────────────  ─────────────────────────────────────  ───────────────────────────────
/qa-test        5-report (after .3 writes)  reports/tickets/<S>/<T>/summary.json   kind test   --confirmed
/qa-test-fast   §HTML page + §Tracker cmt   reports/tickets/<S>/<T>/summary.json   kind test   (+ --extra from verdict.md)
/qa-verify-fix  Step 6 → 6A (after Step 7)  …/<T>/verification-summary.json        kind fix    (before/after table)
/qa-regression  Step 8                      reports/regression/<REG-…>/            kind regression --verdict <gate>
/qa-smoke       Step 5                      reports/regression/<SMOKE-…>/          kind smoke  --verdict <GO|…>
standalone      /vc-fix:qa-report <TICKET | RUN_ID> [--ticket KEY] [--verdict …]
                                                    │
                       render.mjs ──► comment.{md|wiki|html} (≤ template budget) + page.html
                                                    │
     page: Artifact (native project, embed images) │ local evidence.html (client / fix kind)
     comment: ask once (skip when caller passes --confirmed) → tracker:comment post | amend
```

The skill always produces the comment and the page **together, from the same model**, so the two can never disagree.

---

## File Structure

```
plugins/vc-fix/skills/qa-report/
  SKILL.md                    NEW  procedure: resolve → render → page gate → ask → post/amend → record → complete
  reference.md                NEW  kinds × sources, verdict vocab pointer, dialect table, publish gate, extras schema, why no hook
  render.mjs                  NEW  CLI: parseArgs, load, render, main (exit 0 / 2 / 3)
  lib/template.mjs            NEW  parseTemplate, fill, fitBudget, toWiki, toHtml, BudgetError
  lib/model.mjs               NEW  VERDICTS, SourceError, readJson, buildLine, fromQaTest, fromVerifyFix,
                                   readRunSuites, fromRun, applyExtras, templateData
  lib/page.mjs                NEW  esc, renderPage
  templates/comment-test.md        NEW  (a) results after testing
  templates/comment-fix.md         NEW  (b) bug fix — before / after
  templates/comment-regression.md  NEW
  templates/comment-smoke.md       NEW
  templates/page.html              NEW  shell (head + style from qa-test-fast/report-template.html) + {{TITLE}} {{TONE}} {{BODY}}

plugins/vc-fix/commands/qa-verify-fix.md                  MODIFY Step 6 comment blocks, 6A, Step 7 (before_after[])
plugins/vc-fix/knowledge/diagnostics/skill-expectations.md MODIFY §3 add /qa-report
plugins/vc-fix/skills/qa-defect/defect-lifecycle-workflow.md MODIFY §3.2/§3.3 → pointer
plugins/vc-fix/skills/qa-evidence/sign-off-templates.md   MODIFY heading note (Teams/qa-lead only)
plugins/vc-fix/README.md, plugins/vc-fix/.claude-plugin/plugin.json  MODIFY skill count, version 0.9.6 → 0.10.0
package.json                                               MODIFY "report:render"
.claude/skills/qa-test/reporting.md                        MODIFY §5-report.2
.claude/skills/qa-test-fast/{verdict.md,SKILL.md}, .claude/commands/qa-test-fast.md  MODIFY
.claude/skills/qa-test-fast/report-template.html           DELETE (moved → page.html)
.claude/commands/qa-regression.md (net shrink), .claude/commands/qa-smoke.md          MODIFY
.claude/skills/qa-defect/defect-lifecycle-workflow.md, .claude/skills/qa-evidence/sign-off-templates.md  MODIFY
.claude/knowledge/execution/reports-policy.md              MODIFY §2 row, §1a evidence.html line
.claude/templates/qa-test-summary.schema.json              MODIFY report.$comment (FULL may set page_url)
docs/qa-test-flow.md:297                                   MODIFY wording
```

---

### Task 1: Template engine

**Files:**
- Create: `plugins/vc-fix/skills/qa-report/lib/template.mjs`
- Test (temporary): `scripts/unit/_tmp-qa-report-template.test.mjs`

**Interfaces:**
- Produces:
  - `parseTemplate(text: string) → { meta: { kind: string, budget: number, trim?: string[], dialect?: string }, body: string }`.
  - `fill(body: string, data: object) → string`. Supports `{{KEY}}`, `{{#L}}…{{/L}}` (each item: `{{field}}`, or `{{.}}` for a string item), `{{^L}}…{{/L}}` (when empty) and `{{?L}}…{{/L}}` (once, when non-empty). It throws on a slot that has no key.
  - `fitBudget(tpl, data, transform?: (s) => string) → { text, chars, budget, dropped: Record<string, number> }`. It throws `BudgetError`.
  - `toWiki(md: string) → string`.
  - `toHtml(md: string) → string`.
  - `class BudgetError extends Error { length; budget }`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/unit/_tmp-qa-report-template.test.mjs — TEMPORARY, delete before commit
import test from "node:test";
import assert from "node:assert/strict";
import { parseTemplate, fill, fitBudget, toWiki, toHtml, BudgetError } from "../../plugins/vc-fix/skills/qa-report/lib/template.mjs";

const T = (body, meta = "kind: t\nbudget: 400\ntrim: [L]") => parseTemplate(`---\n${meta}\n---\n${body}`);

test("front-matter: budget is a number, trim is a list, missing budget throws", () => {
  const t = T("x");
  assert.equal(t.meta.budget, 400);
  assert.deepEqual(t.meta.trim, ["L"]);
  assert.throws(() => parseTemplate("---\nkind: t\n---\nx"), /budget/);
  assert.throws(() => parseTemplate("no front matter"), /front-matter/);
});

test("fill: scalars, each, empty, any; a missing slot throws", () => {
  const body = "A {{X}}\n{{?L}}\nhead\n{{/L}}\n{{#L}}\n- {{n}}\n{{/L}}\n{{^L}}\nNone\n{{/L}}\n";
  assert.equal(fill(body, { X: 1, L: [{ n: "a" }, { n: "b" }] }), "A 1\nhead\n- a\n- b\n");
  assert.equal(fill(body, { X: 1, L: [] }), "A 1\nNone\n");
  assert.throws(() => fill("{{Y}}", {}), /\{\{Y\}\}/);
  assert.throws(() => fill("{{#Z}}x{{/Z}}", {}), /Z/);
});

test("an INLINE section keeps the line break after it; a BLOCK section swallows its own", () => {
  assert.equal(fill("a {{#L}}{{.}} {{/L}}{{^L}}None{{/L}}\nb\n", { L: ["x"] }), "a x \nb\n");
  assert.equal(fill("a {{#L}}{{.}} {{/L}}{{^L}}None{{/L}}\nb\n", { L: [] }), "a None\nb\n");
});

test("cell sanitising: pipes, newlines, slot injection and $-patterns", () => {
  const v = fill("{{#L}}| {{t}} |\n{{/L}}{{X}}", { L: [{ t: "a|b\nc {{X}} $& $1" }], X: "ok" });
  assert.equal(v, "| a/b c { {X} } $& $1 |\nok");
});

test("fitBudget: trims the longest list, never below one item, never shows None for a trimmed list", () => {
  const t = T("{{#L}}\n- {{.}}\n{{/L}}\n{{#L_MORE}}\n- {{.}}\n{{/L_MORE}}\n{{^L}}\nNone\n{{/L}}\n", "kind: t\nbudget: 60\ntrim: [L]");
  const r = fitBudget(t, { L: ["x".repeat(20), "y".repeat(20), "z".repeat(20), "w".repeat(20)] });
  assert.ok(r.chars <= 60, `${r.chars}`);
  assert.equal(r.dropped.L, 3);
  assert.match(r.text, /\+3 more in the full report/);
  assert.doesNotMatch(r.text, /None/);
});

test("fitBudget: still over with one item left → BudgetError, no mid-line cut", () => {
  const t = T("{{X}}\n", "kind: t\nbudget: 10");
  assert.throws(() => fitBudget(t, { X: "x".repeat(50) }), BudgetError);
});

test("toWiki: heading, bold, code, link, bullets, table header; image lines untouched", () => {
  const md = "## ✅ PASS\n**Build** `1.2` [page](https://x)\n- item\n| A | B |\n|---|---|\n| 1 | 2 |\n!a.png|width=700!";
  assert.equal(toWiki(md), "h2. ✅ PASS\n*Build* {{1.2}} [page|https://x]\n* item\n||A||B||\n|1|2|\n!a.png|width=700!");
});

test("toHtml: escapes, bold, list, table with th", () => {
  const html = toHtml("## T <x>\n- **a**\n| A | B |\n|---|---|\n| 1 | 2 |");
  assert.match(html, /<b>T &lt;x&gt;<\/b><br\/>/);
  assert.match(html, /<ul>\n<li><b>a<\/b><\/li>\n<\/ul>/);
  assert.match(html, /<table>\n<tr><th>A<\/th><th>B<\/th><\/tr>\n<tr><td>1<\/td><td>2<\/td><\/tr>\n<\/table>/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test scripts/unit/_tmp-qa-report-template.test.mjs`
Expected: FAIL — `Cannot find module …/lib/template.mjs`.

- [ ] **Step 3: Implement**

```js
// plugins/vc-fix/skills/qa-report/lib/template.mjs
// The qa-report template engine — the ONE place a result comment's shape and budget are applied.
// A template is Markdown with a front-matter block; its `budget` (chars) is declared there and
// nowhere else. Over budget, the lists named in `trim` collapse to "+N more"; if that is not
// enough the render FAILS (BudgetError) rather than cutting a verdict mid-line.
// Rule source: ../reference.md §Templates.

export class BudgetError extends Error {
  constructor(kind, length, budget) {
    super(`${kind} comment is ${length} chars, budget ${budget}, with every trimmable list already at one item`);
    this.length = length;
    this.budget = budget;
  }
}

export function parseTemplate(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("template has no front-matter block");
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1]] = v.startsWith("[") ? v.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean)
      : /^\d+$/.test(v) ? Number(v) : v;
  }
  if (!Number.isInteger(meta.budget) || meta.budget <= 0) throw new Error("template front-matter needs a positive integer `budget`");
  return { meta, body: m[2].replace(/\r\n/g, "\n") };
}

// A value can never break a table row, start a new line, or fill another slot.
const cell = v => String(v ?? "")
  .replace(/\s*\r?\n\s*/g, " ")
  .replace(/\|/g, "/")
  .replace(/\{\{|\}\}/g, s => `${s[0]} ${s[1]}`);

// A BLOCK section (`{{#L}}` ends its line) swallows its own closing newline; an INLINE one
// (`**Bugs** {{#L}}…{{/L}}`) keeps it, or the next line would be glued onto this one.
const SECTION = /\{\{([#^?])(\w+)\}\}(\n?)([\s\S]*?)\{\{\/\2\}\}(\n?)/g;

export function fill(body, data) {
  const withSections = body.replace(SECTION, (_, op, key, openNl, inner, closeNl) => {
    if (!(key in data)) throw new Error(`template section {{${op}${key}}} has no value`);
    const tail = openNl ? "" : closeNl;
    const v = data[key];
    const list = Array.isArray(v) ? v : v ? [v] : [];
    if (op === "^") return (list.length ? "" : inner) + tail;
    if (op === "?") return (list.length ? inner : "") + tail;
    return list.map(item => inner.replace(/\{\{(\.|\w+)\}\}/g, (__, f) => {
      if (f === ".") return cell(item);
      if (item === null || typeof item !== "object" || !(f in item)) throw new Error(`list ${key} item has no field "${f}"`);
      return cell(item[f]);
    })).join("") + tail;
  });
  return withSections.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in data)) throw new Error(`template slot {{${k}}} has no value`);
    return cell(data[k]);
  });
}

export function fitBudget(tpl, data, transform = s => s) {
  const d = { ...data };
  const keys = tpl.meta.trim ?? [];
  for (const k of keys) {
    if (!Array.isArray(d[k])) throw new Error(`trim key ${k} is not a list slot`);
    d[k] = [...d[k]];
    d[`${k}_MORE`] = null;
  }
  const dropped = Object.fromEntries(keys.map(k => [k, 0]));
  const render = () => transform(fill(tpl.body, d)).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  let text = render();
  while (text.length > tpl.meta.budget) {
    const k = keys.filter(x => d[x].length > 1).sort((a, b) => d[b].length - d[a].length)[0];
    if (!k) throw new BudgetError(tpl.meta.kind, text.length, tpl.meta.budget);
    d[k].pop();
    dropped[k]++;
    d[`${k}_MORE`] = `+${dropped[k]} more in the full report`;
    text = render();
  }
  return { text, chars: text.length, budget: tpl.meta.budget, dropped };
}

const cells = row => row.trim().replace(/^\||\|$/g, "").split("|").map(s => s.trim());
const DIVIDER = /^\|[\s:|-]+\|\s*$/;
const ROW = /^\|.*\|\s*$/;

/** Markdown subset → Jira wiki (v2 API) — the only dialect that embeds an attached image inline (tracker-ops.md §5c). */
export function toWiki(md) {
  const inline = s => s
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/`([^`]+)`/g, "{{$1}}")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$1|$2]");
  const lines = md.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    const b = /^(\s*)[-*]\s+(.*)$/.exec(l);
    if (h) out.push(`h${h[1].length}. ${inline(h[2])}`);
    else if (ROW.test(l) && DIVIDER.test(lines[i + 1] ?? "")) { out.push(`||${cells(l).map(inline).join("||")}||`); i++; }
    else if (ROW.test(l)) out.push(`|${cells(l).map(inline).join("|")}|`);
    else if (b) out.push(`${"*".repeat(1 + Math.floor(b[1].length / 2))} ${inline(b[2])}`);
    else out.push(inline(l));
  }
  return out.join("\n");
}

/** Markdown subset → the HTML an Azure Boards comment field renders (azure-html-format.md). */
export function toHtml(md) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.split("\n");
  const out = [];
  let list = false, table = false;
  const close = () => {
    if (list) { out.push("</ul>"); list = false; }
    if (table) { out.push("</table>"); table = false; }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    const b = /^\s*[-*]\s+(.*)$/.exec(l);
    if (h) { close(); out.push(`<b>${inline(h[2])}</b><br/>`); continue; }
    if (ROW.test(l)) {
      if (DIVIDER.test(l)) continue;
      if (list) close();
      if (!table) { out.push("<table>"); table = true; }
      const tag = DIVIDER.test(lines[i + 1] ?? "") ? "th" : "td";
      out.push(`<tr>${cells(l).map(c => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`);
      continue;
    }
    if (b) {
      if (table) close();
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(b[1])}</li>`);
      continue;
    }
    close();
    if (l.trim()) out.push(`${inline(l)}<br/>`);
  }
  close();
  return out.join("\n");
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test scripts/unit/_tmp-qa-report-template.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Delete the temporary test, then commit**

```bash
rm scripts/unit/_tmp-qa-report-template.test.mjs
git add plugins/vc-fix/skills/qa-report/lib/template.mjs
git commit -m "feat(vc-fix): qa-report template engine — budgeted fill, md→wiki/html"
```

---

### Task 2: Report model, one adapter per machine record

**Files:**
- Create: `plugins/vc-fix/skills/qa-report/lib/model.mjs`
- Test (temporary): `scripts/unit/_tmp-qa-report-model.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `VERDICTS: Record<"test"|"fix"|"regression"|"smoke", string[]>`, `class SourceError`, `readJson(path)`, `buildLine(build) → string`.
  - `fromQaTest(path) → ReportModel`, `fromVerifyFix(path) → ReportModel`.
  - `readRunSuites(runDir) → { id, name, env, startedAt, cases }[]`.
  - `fromRun(runDir, kind, verdict, ticket?) → ReportModel`.
  - `applyExtras(model, extra, sets) → ReportModel`.
  - `templateData(model, dialect) → object` (every slot the four templates use).
  - `ReportModel = { kind, verdict, verdictLabel, tone: "pass"|"notes"|"fail"|"blocked", icon, ticket, title, runLabel, env, build, date, counts: { total, passed, failed, blocked, notRun }, lines: Record<string,string>, bugs: { key, severity, relation }[], notFiled: { severity, title, path }[], beforeAfter: { check, before, after }[], issues: string[], failures: { id, title, result, suite }[] | null, rows: { id, text, result, evidence }[], notTested: { item, reason }[], context: { label, value }[], shots: string[], lede: string, evidence: string, imageRoot: string, pageUrl: string | null }`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/unit/_tmp-qa-report-model.test.mjs — TEMPORARY, delete before commit
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromQaTest, fromVerifyFix, fromRun, applyExtras, templateData, buildLine, SourceError } from "../../plugins/vc-fix/skills/qa-report/lib/model.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "qa-report-"));
const put = (d, f, o) => { const p = join(d, f); writeFileSync(p, JSON.stringify(o)); return p; };

test("fromQaTest: counts, bugs, not-filed, mandatory lines with honest defaults", () => {
  const p = put(dir(), "summary.json", {
    ticket: "VCST-1", verdict: "pass with notes", date: "2026-10-05", environment: "https://qa", path: "FULL",
    build: { platform: "3.900.0", theme: "2.59.0", deployed: { platform: "3.901.0" } },
    total_cases: 10, passed: 9, failed: 1, blocked: 0,
    ac_analysis: { ac_dod_estimate: { ac_coverage_pct: 90, dod_total: 0, dod_met: 0 } },
    regression: { c1: { suites: ["042"], run_id: "REG-1", pass_rate: "98%" } },
    release: { fragment: null, refusal: "not-user-visible" },
    bugs_filed: [{ key: "VCST-2", severity: "High", relationship: "sub-task" }],
    bugs_not_filed: [{ severity: "Low", summary: "typo", report: "reports/bugs/open/low/x.md" }],
    screenshots: "reports/tickets/S/VCST-1/screenshots/",
  });
  const m = fromQaTest(p);
  assert.equal(m.verdict, "PASS_WITH_NOTES");
  assert.equal(m.tone, "notes");
  assert.equal(m.build, "platform 3.901.0 · theme 2.59.0");
  assert.equal(m.lines.DOD, "none stated");
  assert.equal(m.lines.REGRESSION, "042 — 98% (REG-1)");
  assert.equal(m.lines.RELEASE_NOTE, "none — not-user-visible");
  assert.equal(m.lines.RELEASE_GATE, "not assessed");
  assert.deepEqual(m.bugs, [{ key: "VCST-2", severity: "High", relation: "sub-task" }]);
  assert.equal(m.notFiled[0].path, "reports/bugs/open/low/x.md");
});

test("verdict vocabulary: unknown word → SourceError listing the allowed values", () => {
  const p = put(dir(), "summary.json", { ticket: "VCST-1", verdict: "GREEN" });
  assert.throws(() => fromQaTest(p), e => e instanceof SourceError && /PASS \| PASS_WITH_NOTES/.test(e.message));
});

test("fromVerifyFix: before/after required for VERIFIED, optional for FIX_INCOMPLETE; shots collected", () => {
  const d = dir();
  const ok = put(d, "a.json", { ticket: "VCST-3", verdict: "VERIFIED", str_result: "3/3", checklist_total: 4, checklist_passed: 4,
    before_after: [{ check: "Cart total", before: "$10 (stale)", after: "$12", before_shot: "screenshots/b.png", after_shot: "screenshots/a.png" }],
    regression_issues: [], side_effects: [], bugs_filed: ["VCST-9"] });
  const m = fromVerifyFix(ok);
  assert.equal(m.beforeAfter.length, 1);
  assert.deepEqual(m.shots, ["screenshots/b.png", "screenshots/a.png"]);
  assert.deepEqual(m.bugs, [{ key: "VCST-9", severity: "", relation: "" }]);
  assert.throws(() => fromVerifyFix(put(d, "b.json", { ticket: "VCST-3", verdict: "VERIFIED", before_after: [] })), /before_after/);
  assert.equal(fromVerifyFix(put(d, "c.json", { ticket: "VCST-3", verdict: "FIX_INCOMPLETE" })).verdict, "FIX_INCOMPLETE");
});

test("fromRun: dedupe keeps most cases, counts from case statuses, notes never carried", () => {
  const d = dir();
  const done = "2026-10-05T10:00:00Z";
  put(d, "suite-042-results.browser.json", { suiteId: "042", suiteName: "Smoke", completedAt: done, environment: "https://qa", testCases: [{ id: "A", status: "PASS" }] });
  put(d, "suite-042-results.json", { suiteId: "042", suiteName: "Smoke", completedAt: done, environment: "https://qa",
    testCases: [{ id: "A", status: "PASS" }, { id: "B", status: "FAILED", title: "t", notes: "user@example.com" }, { id: "C", status: "SKIPPED" }] });
  const m = fromRun(d, "regression", "conditional go");
  assert.equal(m.verdict, "CONDITIONAL_GO");
  assert.deepEqual(m.counts, { total: 3, passed: 1, failed: 1, blocked: 0, notRun: 1 });
  assert.deepEqual(m.failures, [{ id: "B", title: "t", result: "FAIL", suite: "042" }]);
  assert.equal(m.lines.PASS_RATE, "50%");
  assert.doesNotMatch(JSON.stringify(m), /example\.com/);
});

test("fromRun: unconsolidated or empty run → SourceError", () => {
  const d = dir();
  put(d, "suite-1-results.json", { suiteId: "1", completedAt: "", testCases: [{ id: "A", status: "PASS" }] });
  assert.throws(() => fromRun(d, "regression", "GO"), /completedAt/);
  assert.throws(() => fromRun(dir(), "smoke", "GO"), /no suite-\*-results\.json/);
  assert.throws(() => fromRun(d, "smoke", undefined), SourceError);
});

test("applyExtras: closed keys, --set only on known lines", () => {
  const p = put(dir(), "summary.json", { ticket: "VCST-1", verdict: "PASS" });
  const m = fromQaTest(p);
  const x = applyExtras(m, { lede: "One sentence.", rows: [{ id: "AC-1", text: "t", result: "PASS", evidence: "s.png" }] }, { RELEASE_GATE: "GO" });
  assert.equal(x.lines.RELEASE_GATE, "GO");
  assert.equal(x.rows.length, 1);
  assert.throws(() => applyExtras(m, { surprise: 1 }, {}), /surprise/);
  assert.throws(() => applyExtras(m, {}, { NOPE: "x" }), /NOPE/);
});

test("templateData: SHOTS only in wiki dialect; buildLine tolerates strings and gaps", () => {
  const m = { ...fromQaTest(put(dir(), "s.json", { ticket: "VCST-1", verdict: "PASS" })), shots: ["screenshots/x.png"] };
  assert.deepEqual(templateData(m, "markdown").SHOTS, []);
  assert.deepEqual(templateData(m, "wiki").SHOTS, ["x.png"]);
  assert.equal(buildLine(undefined), "unknown");
  assert.equal(buildLine("2.59.0"), "2.59.0");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test scripts/unit/_tmp-qa-report-model.test.mjs`
Expected: FAIL — `Cannot find module …/lib/model.mjs`.

- [ ] **Step 3: Implement**

```js
// plugins/vc-fix/skills/qa-report/lib/model.mjs
// One adapter per pipeline's MACHINE record → one ReportModel, so a template never reads a
// pipeline's own file shape and a comment is derived, never re-typed. Case `notes` are dropped
// here on purpose: they carry account emails and fixture detail (reference.md §Sources).
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";

export class SourceError extends Error {}

export const VERDICTS = {
  test: ["PASS", "PASS_WITH_NOTES", "FAIL", "BLOCKED"],
  fix: ["VERIFIED", "VERIFIED_WITH_NOTES", "FIX_INCOMPLETE", "NEW_REGRESSION", "INTERMITTENT", "BLOCKED"],
  regression: ["GO", "CONDITIONAL_GO", "NO_GO"],
  smoke: ["GO", "CONDITIONAL_GO", "NO_GO"],
};
const TONE = {
  PASS: "pass", VERIFIED: "pass", GO: "pass",
  PASS_WITH_NOTES: "notes", VERIFIED_WITH_NOTES: "notes", CONDITIONAL_GO: "notes", NEW_REGRESSION: "notes",
  FAIL: "fail", FIX_INCOMPLETE: "fail", INTERMITTENT: "fail", NO_GO: "fail",
  BLOCKED: "blocked",
};
const ICON = { pass: "✅", notes: "⚠️", fail: "❌", blocked: "⛔" };
const EXTRA_KEYS = ["title", "lede", "rows", "notTested", "context", "shots"];

export function readJson(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { throw new SourceError(`cannot read ${p}: ${e.message}`); }
}

function verdictOf(kind, raw) {
  const v = String(raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!VERDICTS[kind].includes(v)) {
    throw new SourceError(`${kind}: verdict "${raw ?? ""}" is not one of ${VERDICTS[kind].join(" | ")}`);
  }
  const tone = TONE[v];
  return { kind, verdict: v, verdictLabel: v.replace(/_/g, " "), tone, icon: ICON[tone] };
}

/** Deployed facts win over declared ones — the build a reader cares about is the one that ran. */
export function buildLine(build) {
  if (!build) return "unknown";
  if (typeof build === "string") return build;
  const parts = [];
  const live = build.deployed?.platform && build.deployed.platform !== "UNKNOWN" ? build.deployed.platform : null;
  const platform = live ?? build.platform;
  if (platform) parts.push(`platform ${platform}`);
  if (build.theme) parts.push(`theme ${build.theme}`);
  const mods = { ...(build.relevant_modules ?? {}), ...(build.deployed?.relevant_modules ?? {}) };
  for (const [name, v] of Object.entries(mods)) parts.push(`${name} ${v}`);
  if (build.pr_build) parts.push(`PR build ${build.pr_build}`);
  return parts.join(" · ") || "unknown";
}

const empty = () => ({ rows: [], notTested: [], context: [], shots: [], lede: "", issues: [], failures: null, beforeAfter: [], notFiled: [] });

export function fromQaTest(path) {
  const s = readJson(path);
  const est = s.ac_analysis?.ac_dod_estimate ?? {};
  const c1 = s.regression?.c1;
  return {
    ...empty(), ...verdictOf("test", s.verdict),
    ticket: s.ticket ?? null, title: s.ticket ?? "", runLabel: s.path ? `path ${s.path}` : "",
    env: s.environment ?? "", build: buildLine(s.build), date: s.date ?? "",
    counts: { total: s.total_cases ?? 0, passed: s.passed ?? 0, failed: s.failed ?? 0, blocked: s.blocked ?? 0, notRun: 0 },
    lines: {
      AC_COVERAGE: est.ac_coverage_pct == null ? "n/a" : `${est.ac_coverage_pct}%`,
      DOD: est.dod_total ? `${est.dod_met ?? 0}/${est.dod_total}` : "none stated",
      REGRESSION: c1?.run_id ? `${(c1.suites ?? []).join(", ")} — ${c1.pass_rate ?? "?"} (${c1.run_id})`
        : `not run${c1?.skipped_reason ? ` — ${c1.skipped_reason}` : ""}`,
      BL: (s.business_rules_verified ?? []).join(", ") || "none",
      RELEASE_GATE: "not assessed",
      RELEASE_NOTE: s.release?.fragment ? `${(s.release.layers ?? []).join("/")} — ${s.release.fragment}`
        : `none — ${s.release?.refusal ?? "not resolved"}`,
    },
    bugs: (s.bugs_filed ?? []).map(b => ({ key: b.key, severity: b.severity ?? "", relation: b.relationship ?? "" })),
    notFiled: (s.bugs_not_filed ?? []).map(b => ({ severity: b.severity ?? "Low", title: b.summary ?? "", path: b.report ?? "" })),
    evidence: s.screenshots ?? "", imageRoot: dirname(path), pageUrl: s.report?.page_url ?? null,
  };
}

const NEEDS_PAIR = ["VERIFIED", "VERIFIED_WITH_NOTES", "NEW_REGRESSION"];

export function fromVerifyFix(path) {
  const s = readJson(path);
  const v = verdictOf("fix", s.verdict);
  const pairs = (s.before_after ?? []).map(p => ({ check: p.check ?? "", before: p.before ?? "", after: p.after ?? "" }));
  if (!pairs.length && NEEDS_PAIR.includes(v.verdict)) {
    throw new SourceError(`fix: ${v.verdict} needs before_after[] — a fix is proven by a RED→GREEN pair (qa-verify-fix Step 2A)`);
  }
  const shots = (s.before_after ?? []).flatMap(p => [p.before_shot, p.after_shot]).filter(Boolean);
  return {
    ...empty(), ...v,
    ticket: s.ticket ?? null, title: s.ticket ?? "", runLabel: "",
    env: s.environment ?? "", build: buildLine(s.build), date: s.date ?? "",
    counts: { total: s.checklist_total ?? 0, passed: s.checklist_passed ?? 0, failed: s.checklist_failed ?? 0, blocked: 0, notRun: 0 },
    lines: {
      STR: s.str_result ?? "n/a",
      BASELINE: s.baseline_reproduction ?? "n/a",
      BL: (s.business_rules_verified ?? []).join(", ") || "none",
    },
    beforeAfter: pairs, shots,
    issues: [...(s.regression_issues ?? []), ...(s.side_effects ?? [])].map(x => typeof x === "string" ? x : JSON.stringify(x)),
    bugs: (s.bugs_filed ?? []).map(b => typeof b === "string" ? { key: b, severity: "", relation: "" }
      : { key: b.key ?? "", severity: b.severity ?? "", relation: b.relationship ?? "" }),
    evidence: s.artifacts ?? "", imageRoot: dirname(path), pageUrl: s.evidence_artifact ?? null,
  };
}

export function readRunSuites(runDir) {
  if (!existsSync(runDir)) throw new SourceError(`run folder not found: ${runDir}`);
  const files = readdirSync(runDir).filter(f => /^suite-.*results.*\.json$/.test(f));
  if (!files.length) throw new SourceError(`no suite-*-results.json in ${runDir}`);
  const bySuite = new Map();
  for (const f of files) {
    const full = join(runDir, f);
    const raw = readJson(full);
    const id = String(raw.suiteId ?? f.replace(/^suite-|-results.*$/g, ""));
    const cases = Array.isArray(raw.testCases) ? raw.testCases : [];
    const mtime = statSync(full).mtimeMs;
    const prev = bySuite.get(id);
    if (!prev || cases.length > prev.cases.length || (cases.length === prev.cases.length && mtime > prev.mtime)) {
      bySuite.set(id, { id, name: raw.suiteName ?? id, env: raw.environment ?? "", startedAt: raw.startedAt ?? "",
        completedAt: String(raw.completedAt ?? "").trim(), cases, mtime });
    }
  }
  const suites = [...bySuite.values()].sort((a, b) => a.id.localeCompare(b.id));
  const open = suites.filter(s => !s.completedAt).map(s => s.id);
  if (open.length) {
    throw new SourceError(`suite ${open.join(", ")} has no completedAt — the run is not consolidated; finish it (qa-regression Step 6) before reporting`);
  }
  return suites;
}

const statusOf = s => {
  const v = String(s ?? "").toUpperCase();
  if (v.startsWith("PASS")) return "passed";
  if (v.startsWith("FAIL")) return "failed";
  if (v.startsWith("BLOCK")) return "blocked";
  return "notRun";
};

export function fromRun(runDir, kind, verdict, ticket = null) {
  const v = verdictOf(kind, verdict);
  const suites = readRunSuites(runDir);
  const counts = { total: 0, passed: 0, failed: 0, blocked: 0, notRun: 0 };
  const failures = [];
  const rows = suites.map(s => {
    const c = { passed: 0, failed: 0, blocked: 0, notRun: 0 };
    for (const tc of s.cases) {
      const st = statusOf(tc.status);
      c[st]++;
      if (st === "failed" || st === "blocked") {
        failures.push({ id: String(tc.id ?? ""), title: String(tc.title ?? ""), result: st === "failed" ? "FAIL" : "BLOCKED", suite: s.id });
      }
    }
    for (const k of Object.keys(c)) counts[k] += c[k];
    counts.total += s.cases.length;
    return { id: s.id, text: s.name, result: c.failed ? "FAIL" : c.blocked ? "BLOCKED" : "PASS", evidence: `${c.passed}/${s.cases.length}` };
  });
  const evaluated = counts.total - counts.notRun;
  const runLabel = basename(runDir.replace(/[\\/]+$/, ""));
  return {
    ...empty(), ...v,
    ticket, title: runLabel, runLabel,
    env: suites[0]?.env ?? "", build: "", date: (suites[0]?.startedAt ?? "").slice(0, 10),
    counts,
    lines: {
      SUITES: suites.map(s => s.id).join(", "),
      PASS_RATE: evaluated ? `${Math.round((counts.passed / evaluated) * 100)}%` : "n/a",
      GATES: "see the report page",
    },
    rows, failures, bugs: [],
    evidence: runDir, imageRoot: runDir, pageUrl: null,
  };
}

export function applyExtras(m, extra = {}, sets = {}) {
  const unknown = Object.keys(extra).filter(k => !EXTRA_KEYS.includes(k));
  if (unknown.length) throw new SourceError(`--extra: unknown key(s) ${unknown.join(", ")} — allowed: ${EXTRA_KEYS.join(", ")}`);
  const list = k => {
    if (extra[k] == null) return m[k];
    if (!Array.isArray(extra[k])) throw new SourceError(`--extra: "${k}" must be an array`);
    return extra[k];
  };
  const out = { ...m, rows: list("rows"), notTested: list("notTested"), context: list("context"),
    shots: [...m.shots, ...(extra.shots ?? [])], lines: { ...m.lines } };
  if (extra.title) out.title = String(extra.title);
  if (extra.lede) out.lede = String(extra.lede);
  for (const [k, v] of Object.entries(sets)) {
    if (!(k in m.lines)) throw new SourceError(`--set ${k}: not a line of a ${m.kind} report (${Object.keys(m.lines).join(", ")})`);
    out.lines[k] = v;
  }
  return out;
}

export function templateData(m, dialect = "markdown") {
  return {
    ICON: m.icon, VERDICT_LABEL: m.verdictLabel, TICKET: m.ticket ?? "", RUN_ID: m.runLabel ?? "",
    ENV: m.env ?? "", BUILD: m.build ?? "", DATE: m.date ?? "",
    TOTAL: m.counts.total, PASSED: m.counts.passed, FAILED: m.counts.failed, BLOCKED: m.counts.blocked, NOT_RUN: m.counts.notRun,
    ...m.lines,
    BUGS: m.bugs, NOT_FILED: m.notFiled, BEFORE_AFTER: m.beforeAfter, ISSUES: m.issues, FAILURES: m.failures ?? [],
    SHOTS: dialect === "wiki" ? m.shots.map(s => basename(s)) : [],
    PAGE_URL: m.pageUrl ?? null,
  };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test scripts/unit/_tmp-qa-report-model.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Delete the temporary test, then commit**

```bash
rm scripts/unit/_tmp-qa-report-model.test.mjs
git add plugins/vc-fix/skills/qa-report/lib/model.mjs
git commit -m "feat(vc-fix): qa-report model — one adapter per machine record, notes never carried"
```

---

### Task 3: HTML page shell and renderer

**Files:**
- Create: `plugins/vc-fix/skills/qa-report/templates/page.html`
- Create: `plugins/vc-fix/skills/qa-report/lib/page.mjs`
- Test (temporary): `scripts/unit/_tmp-qa-report-page.test.mjs`

**Interfaces:**
- Consumes: the `ReportModel` from Task 2.
- Produces:
  - `esc(s) → string`.
  - `renderPage(shell: string, m: ReportModel, opts?: { images?: "ref"|"embed" }) → string`. With `"embed"`, images become data URIs read from `m.imageRoot`: at most 4, each ≤ 1 MB, or it throws.

- [ ] **Step 1: Load the `artifact-design` skill** (spec 4). Read its page contract so the shell edits below keep the following: tokens on `:root`, dark mode under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`, an explicit `body` background, a 16 px gutter, and no horizontal scroll at phone width.

- [ ] **Step 2: Build the shell from the existing, already-designed template**

```bash
mkdir -p plugins/vc-fix/skills/qa-report/templates
{ sed -n '11,95p' .claude/skills/qa-test-fast/report-template.html \
    | sed 's#<title>{{TICKET}} Verdict</title>#<title>{{TITLE}}</title>#'
  cat <<'EOF'
  .ba-before { color: var(--fail); }
  .ba-after  { color: var(--pass); font-weight: 600; }
  footer.foot { margin-top: 28px; font-size: 12.5px; }
</style>

<main class="report" data-verdict="{{TONE}}">
{{BODY}}
</main>
EOF
} > plugins/vc-fix/skills/qa-report/templates/page.html
```
Check the result: `grep -c "{{" plugins/vc-fix/skills/qa-report/templates/page.html` must print `3` (TITLE, TONE, BODY), and line 1 must be `<title>{{TITLE}}</title>`. If the source file's `</style>` is not on line 96, change `95` so the shell's `<style>` block closes exactly once.

- [ ] **Step 3: Write the failing test**

```js
// scripts/unit/_tmp-qa-report-page.test.mjs — TEMPORARY, delete before commit
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPage, esc } from "../../plugins/vc-fix/skills/qa-report/lib/page.mjs";

const shell = readFileSync("plugins/vc-fix/skills/qa-report/templates/page.html", "utf8");
const model = over => ({
  kind: "fix", verdict: "VERIFIED", verdictLabel: "VERIFIED", tone: "pass", ticket: "VCST-3", title: "<script>alert(1)</script> $& $1",
  runLabel: "", env: "https://qa", build: "theme 2.59.0", date: "2026-10-05", counts: { total: 4, passed: 4, failed: 0, blocked: 0, notRun: 0 },
  lines: {}, bugs: [], notFiled: [], beforeAfter: [{ check: "Total", before: "$10", after: "$12" }], issues: [], failures: null,
  rows: [], notTested: [], context: [], shots: [], lede: "", evidence: "reports/tickets/S/VCST-3/", imageRoot: ".", pageUrl: null, ...over,
});

test("escapes text and never interprets $-patterns", () => {
  const html = renderPage(shell, model());
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; \$&amp; \$1/);
  assert.match(html, /data-verdict="PASS"/);
  assert.doesNotMatch(html, /\{\{(TITLE|TONE|BODY)\}\}/);
});

test("before/after table and empty sections say None", () => {
  const html = renderPage(shell, model());
  assert.match(html, /<td class="ba-before">\$10<\/td><td class="ba-after">\$12<\/td>/);
  assert.match(html, /Bugs filed[\s\S]*None\./);
});

test("embed: data URI, capped at 4 images; ref keeps the relative path", () => {
  const d = mkdtempSync(join(tmpdir(), "qa-page-"));
  mkdirSync(join(d, "screenshots"));
  writeFileSync(join(d, "screenshots", "a.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const m = model({ shots: ["screenshots/a.png"], imageRoot: d });
  assert.match(renderPage(shell, m, { images: "embed" }), /src="data:image\/png;base64,/);
  assert.match(renderPage(shell, m, { images: "ref" }), /src="screenshots\/a\.png"/);
  assert.throws(() => renderPage(shell, model({ shots: Array(5).fill("screenshots/a.png"), imageRoot: d }), { images: "embed" }), /at most 4/);
  assert.equal(esc(`"'&`), "&quot;&#39;&amp;");
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `node --test scripts/unit/_tmp-qa-report-page.test.mjs`
Expected: FAIL — `Cannot find module …/lib/page.mjs`.

- [ ] **Step 5: Implement**

```js
// plugins/vc-fix/skills/qa-report/lib/page.mjs
// The human-readable page — ONE shell (../templates/page.html) for every kind, filled from the SAME
// ReportModel as the comment, so the page can state nothing the comment's source does not carry.
// "ref" images = the committed local copy (reports-policy.md §1a: never inline base64 there);
// "embed" = the published Artifact, which must stand alone.
import { readFileSync } from "node:fs";
import { resolve, basename, extname } from "node:path";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS_VERDICT = { pass: "PASS", notes: "PASS_WITH_NOTES", fail: "FAIL", blocked: "BLOCKED" };
const MAX_EMBED = 4;
const MAX_EMBED_BYTES = 1_000_000;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

const chip = r => `<span class="chip" data-s="${esc(r)}">${esc(r)}</span>`;
const none = () => `    <p class="none">None.</p>`;
const section = (id, title, inner) =>
  `  <section aria-labelledby="h-${id}">\n    <h2 id="h-${id}">${esc(title)}</h2>\n${inner}\n  </section>`;
const table = (head, rows) => rows.length
  ? `    <div class="table-wrap"><table>\n      <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>\n      <tbody>\n${rows.join("\n")}\n      </tbody></table></div>`
  : none();
const list = items => items.length ? `    <ul class="rows">\n${items.join("\n")}\n    </ul>` : none();

function imgSrc(file, mode, root) {
  if (mode === "ref") return esc(file);
  const abs = resolve(root, file);
  const mime = MIME[extname(abs).toLowerCase()];
  if (!mime) throw new Error(`cannot embed ${file}: not an image`);
  const buf = readFileSync(abs);
  if (buf.length > MAX_EMBED_BYTES) throw new Error(`cannot embed ${file}: ${buf.length} bytes > ${MAX_EMBED_BYTES}`);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function renderPage(shell, m, { images = "ref" } = {}) {
  if (images === "embed" && m.shots.length > MAX_EMBED) {
    throw new Error(`a published page embeds at most ${MAX_EMBED} screenshots, got ${m.shots.length}`);
  }
  const head = m.ticket || m.runLabel;
  const parts = [`  <header class="band">
    <div class="eyebrow"><span>${esc(head)}</span><span>${esc(m.env)}</span><span>${esc(m.date)}</span></div>
    <div class="verdict-row"><span class="verdict">${esc(m.verdictLabel)}</span><span class="title">${esc(m.title)}</span></div>
${m.lede ? `    <p class="lede">${esc(m.lede)}</p>\n` : ""}    <div class="meta"><span>Build <b>${esc(m.build || "—")}</b></span><span>Passed <b>${m.counts.passed}/${m.counts.total}</b></span><span>Bugs <b>${m.bugs.length}</b></span></div>
  </header>`];

  if (m.kind === "fix") {
    parts.push(section("ba", "Before and after the fix", table(["Check", "Before fix", "After fix"],
      m.beforeAfter.map(p => `        <tr><td>${esc(p.check)}</td><td class="ba-before">${esc(p.before)}</td><td class="ba-after">${esc(p.after)}</td></tr>`))));
  }
  if (m.rows.length) {
    parts.push(section("rows", m.failures ? "Suites" : "Conditions", table(["ID", "Name", "Result", "Evidence"],
      m.rows.map(r => `        <tr><td class="id">${esc(r.id)}</td><td>${esc(r.text)}</td><td>${chip(r.result)}</td><td class="mono">${esc(r.evidence)}</td></tr>`))));
  }
  if (m.failures) {
    parts.push(section("fail", "Failed and blocked", list(m.failures.map(f =>
      `      <li>${chip(f.result)}<span class="mono muted">${esc(f.suite)} · ${esc(f.id)}</span><span class="grow">${esc(f.title)}</span></li>`))));
  }
  parts.push(section("bugs", "Bugs filed", list(m.bugs.map(b =>
    `      <li><span class="chip" data-sev="${esc(String(b.severity).toLowerCase())}">${esc(b.severity || "—")}</span><span class="grow">${esc(b.key)}</span><span class="muted">${esc(b.relation)}</span></li>`))));
  if (m.kind === "test") {
    parts.push(section("nf", "Not filed (below the severity floor)", list(m.notFiled.map(b =>
      `      <li><span class="chip" data-sev="low">${esc(b.severity)}</span><span class="grow">${esc(b.title)}</span><span class="mono muted">${esc(b.path)}</span></li>`))));
  }
  if (m.issues.length) parts.push(section("issues", "Regressions and side effects", list(m.issues.map(i => `      <li><span class="grow">${esc(i)}</span></li>`))));
  if (m.notTested.length) {
    parts.push(section("nt", "Not tested, and why", list(m.notTested.map(n =>
      `      <li><span class="grow">${esc(n.item)}</span><span class="muted">${esc(n.reason)}</span></li>`))));
  }
  if (m.shots.length) {
    parts.push(section("shots", "Evidence", `    <div class="shots">\n${m.shots.map(s =>
      `      <figure><img src="${imgSrc(s, images, m.imageRoot)}" alt="${esc(basename(s))}"><figcaption>${esc(basename(s))}</figcaption></figure>`).join("\n")}\n    </div>`));
  }
  if (m.context.length) {
    parts.push(section("ctx", "Context used", `    <dl class="context">\n${m.context.map(c =>
      `      <dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`).join("\n")}\n    </dl>`));
  }
  parts.push(`  <footer class="foot muted">Evidence folder <code>${esc(m.evidence)}</code></footer>`);

  // Function replacers: a `$&` in any value must never be read as a replacement pattern.
  return shell
    .replace("{{TITLE}}", () => esc(`${head} ${m.verdictLabel}`))
    .replace("{{TONE}}", () => CSS_VERDICT[m.tone])
    .replace("{{BODY}}", () => parts.join("\n\n"));
}
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `node --test scripts/unit/_tmp-qa-report-page.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 7: Delete the temporary test, then commit**

```bash
rm scripts/unit/_tmp-qa-report-page.test.mjs
git add plugins/vc-fix/skills/qa-report/templates/page.html plugins/vc-fix/skills/qa-report/lib/page.mjs
git commit -m "feat(vc-fix): qa-report page shell + renderer (escaped, ref|embed images)"
```

---

### Task 4: The four comment templates and the CLI

**Files:**
- Create: `plugins/vc-fix/skills/qa-report/templates/comment-{test,fix,regression,smoke}.md`
- Create: `plugins/vc-fix/skills/qa-report/render.mjs`
- Modify: `package.json` (`scripts`). Add `"report:render": "node plugins/vc-fix/skills/qa-report/render.mjs"` next to `"report:regression"`.
- Test (temporary): `scripts/unit/_tmp-qa-report-render.test.mjs`

**Interfaces:**
- Consumes: Task 1 `parseTemplate`/`fitBudget`/`toWiki`/`toHtml`/`BudgetError`, Task 2 `fromQaTest`/`fromVerifyFix`/`fromRun`/`applyExtras`/`templateData`/`readJson`/`SourceError`, Task 3 `renderPage`.
- Produces:
  - CLI: `node render.mjs --kind <test|fix|regression|smoke> --source <path> --out <dir> [--verdict V] [--ticket KEY] [--bugs K1,K2] [--title T] [--extra file.json] [--set KEY=VALUE]... [--page-url URL] [--dialect markdown|wiki|html] [--images ref|embed] [--json]`.
  - It writes `<out>/comment.{md|wiki|html}` and `<out>/page.html`.
  - `--json` prints `{ kind, verdict, ticket, artifact, comment, chars, budget, dropped, page, shots }`.
  - Exit codes: 0 ok · 2 bad input or source · 3 over budget.
  - Exports `parseArgs(argv)` and `render(args) → { model, comment, page }` for the skill and the test.

- [ ] **Step 1: Write the templates.** No code, so no test of their own; Step 2's render test exercises them.

`templates/comment-test.md`:
```markdown
---
kind: test
budget: 1500
trim: [BUGS, NOT_FILED]
---
## {{ICON}} QA {{VERDICT_LABEL}} — {{TICKET}}
**Build** {{BUILD}} · **Env** {{ENV}} · {{DATE}} · {{RUN_ID}}

**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked · **AC coverage** {{AC_COVERAGE}} · **DoD** {{DOD}}
**Regression** {{REGRESSION}}
**Business rules** {{BL}}

**Bugs filed**
{{#BUGS}}
- {{key}} [{{severity}}] {{relation}}
{{/BUGS}}
{{#BUGS_MORE}}
- {{.}}
{{/BUGS_MORE}}
{{^BUGS}}
- None
{{/BUGS}}

**Not filed (below severity floor)**
{{#NOT_FILED}}
- [{{severity}}] {{title}} — `{{path}}`
{{/NOT_FILED}}
{{#NOT_FILED_MORE}}
- {{.}}
{{/NOT_FILED_MORE}}
{{^NOT_FILED}}
- None
{{/NOT_FILED}}

**Release gate** {{RELEASE_GATE}} · **Release note** {{RELEASE_NOTE}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
```

`templates/comment-fix.md`:
```markdown
---
kind: fix
budget: 1200
trim: [BEFORE_AFTER, ISSUES, BUGS]
---
## {{ICON}} Fix {{VERDICT_LABEL}} — {{TICKET}}
**Build** {{BUILD}} · **Env** {{ENV}} · {{DATE}}
**STR** {{STR}} · **Checklist** {{PASSED}}/{{TOTAL}} passed · **Baseline** {{BASELINE}}

{{?BEFORE_AFTER}}
| Check | Before fix | After fix |
|---|---|---|
{{/BEFORE_AFTER}}
{{#BEFORE_AFTER}}
| {{check}} | {{before}} | {{after}} |
{{/BEFORE_AFTER}}
{{#BEFORE_AFTER_MORE}}
| {{.}} | | |
{{/BEFORE_AFTER_MORE}}
{{^BEFORE_AFTER}}
No before/after pair recorded.
{{/BEFORE_AFTER}}

{{#SHOTS}}
!{{.}}|width=700!
{{/SHOTS}}

**Regressions / side effects**
{{#ISSUES}}
- {{.}}
{{/ISSUES}}
{{#ISSUES_MORE}}
- {{.}}
{{/ISSUES_MORE}}
{{^ISSUES}}
- None
{{/ISSUES}}
**Bugs filed** {{#BUGS}}{{key}} {{/BUGS}}{{#BUGS_MORE}}{{.}}{{/BUGS_MORE}}{{^BUGS}}None{{/BUGS}}
**Business rules** {{BL}}
{{#PAGE_URL}}
**Report** [open the before/after page]({{.}})
{{/PAGE_URL}}
```

`templates/comment-regression.md`:
```markdown
---
kind: regression
budget: 1500
trim: [FAILURES, BUGS]
---
## {{ICON}} Regression {{VERDICT_LABEL}} — {{RUN_ID}}
**Env** {{ENV}} · {{DATE}} · **Suites** {{SUITES}}
**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked · {{NOT_RUN}} not run · **Pass rate** {{PASS_RATE}}

**Failed / blocked**
{{#FAILURES}}
- `{{id}}` {{result}} — {{title}}
{{/FAILURES}}
{{#FAILURES_MORE}}
- {{.}}
{{/FAILURES_MORE}}
{{^FAILURES}}
- None
{{/FAILURES}}

**Bugs** {{#BUGS}}{{key}} {{/BUGS}}{{#BUGS_MORE}}{{.}}{{/BUGS_MORE}}{{^BUGS}}None{{/BUGS}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
```

`templates/comment-smoke.md`:
```markdown
---
kind: smoke
budget: 900
trim: [FAILURES, BUGS]
---
## {{ICON}} Smoke {{VERDICT_LABEL}} — {{RUN_ID}}
**Env** {{ENV}} · {{DATE}} · **Gates** {{GATES}}
**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked

{{?FAILURES}}
**Failed / blocked**
{{/FAILURES}}
{{#FAILURES}}
- `{{id}}` {{result}} — {{title}}
{{/FAILURES}}
{{#FAILURES_MORE}}
- {{.}}
{{/FAILURES_MORE}}
**Bugs** {{#BUGS}}{{key}} {{/BUGS}}{{#BUGS_MORE}}{{.}}{{/BUGS_MORE}}{{^BUGS}}None{{/BUGS}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
```

- [ ] **Step 2: Write the failing test**

```js
// scripts/unit/_tmp-qa-report-render.test.mjs — TEMPORARY, delete before commit
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, render } from "../../plugins/vc-fix/skills/qa-report/render.mjs";
import { wikiMarkupRefusal } from "../../plugins/vc-fix/scripts/lib/jira-body-format.mjs";

const d = mkdtempSync(join(tmpdir(), "qa-render-"));
const put = (f, o) => { const p = join(d, f); writeFileSync(p, JSON.stringify(o)); return p; };
const test1 = put("summary.json", { ticket: "VCST-1", verdict: "PASS", date: "2026-10-05", environment: "https://qa", path: "FAST",
  total_cases: 3, passed: 3, failed: 0, blocked: 0, bugs_filed: [], bugs_not_filed: [] });
const fix1 = put("verification-summary.json", { ticket: "VCST-3", verdict: "VERIFIED", str_result: "3/3", checklist_total: 2, checklist_passed: 2,
  before_after: [{ check: "Total", before: "$10", after: "$12", before_shot: "b.png", after_shot: "a.png" }] });
const run = mkdtempSync(join(tmpdir(), "REG-2026-10-05-1200-"));
writeFileSync(join(run, "suite-042-results.json"), JSON.stringify({ suiteId: "042", suiteName: "Smoke", completedAt: "x", environment: "https://qa",
  startedAt: "2026-10-05T10:00:00Z", testCases: [{ id: "A", status: "PASS" }, { id: "B", status: "FAIL", title: "t" }] }));
const out = mkdtempSync(join(tmpdir(), "qa-out-"));
const args = extra => parseArgs([...extra, "--out", out]);

test("every kind renders Markdown the tracker helper accepts, within budget", () => {
  for (const a of [["--kind", "test", "--source", test1], ["--kind", "fix", "--source", fix1],
    ["--kind", "regression", "--source", run, "--verdict", "GO"], ["--kind", "smoke", "--source", run, "--verdict", "NO_GO"]]) {
    const r = render(args(a));
    assert.equal(wikiMarkupRefusal(r.comment.text), null, `${a[1]}:\n${r.comment.text}`);
    assert.ok(r.comment.chars <= r.comment.budget);
    assert.doesNotMatch(r.comment.text, /\{\{/);
    assert.match(r.page, /<main class="report"/);
  }
});

test("fix in wiki dialect embeds one image line per screenshot; markdown embeds none", () => {
  const wiki = render(args(["--kind", "fix", "--source", fix1, "--dialect", "wiki"])).comment.text;
  assert.match(wiki, /^!b\.png\|width=700!$/m);
  assert.match(wiki, /^!a\.png\|width=700!$/m);
  assert.match(wiki, /^\|\|Check\|\|Before fix\|\|After fix\|\|$/m);
  assert.doesNotMatch(render(args(["--kind", "fix", "--source", fix1])).comment.text, /width=700/);
});

test("--set, --page-url and --bugs reach the comment", () => {
  const t = render(args(["--kind", "test", "--source", test1, "--set", "RELEASE_GATE=GO", "--page-url", "https://claude.ai/x"])).comment.text;
  assert.match(t, /\*\*Release gate\*\* GO/);
  assert.match(t, /\[open the report page\]\(https:\/\/claude\.ai\/x\)/);
  const r = render(args(["--kind", "regression", "--source", run, "--verdict", "GO", "--bugs", "VCST-7,VCST-8"])).comment.text;
  assert.match(r, /\*\*Bugs\*\* VCST-7 VCST-8/);
});

test("CLI exit codes: 2 for a run without --verdict, 2 for an unknown flag, 0 + json otherwise", () => {
  const cli = a => spawnSync(process.execPath, ["plugins/vc-fix/skills/qa-report/render.mjs", ...a, "--out", out], { encoding: "utf8" });
  assert.equal(cli(["--kind", "regression", "--source", run]).status, 2);
  assert.equal(cli(["--kind", "test", "--source", test1, "--bogus"]).status, 2);
  const ok = cli(["--kind", "test", "--source", test1, "--json"]);
  assert.equal(ok.status, 0, ok.stderr);
  const j = JSON.parse(ok.stdout);
  assert.equal(j.verdict, "PASS");
  assert.ok(readFileSync(j.comment, "utf8").startsWith("## ✅ QA PASS — VCST-1"));
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --test scripts/unit/_tmp-qa-report-render.test.mjs`
Expected: FAIL — `Cannot find module …/render.mjs`.

- [ ] **Step 4: Implement the CLI**

```js
#!/usr/bin/env node
// /qa-report renderer — ONE pipeline's machine record → the tracker comment (within the template's
// char budget) + the HTML page. Posts NOTHING; posting, the publish gate and the yes/no are the
// skill's (SKILL.md). Templates and budgets: ./templates/*.md front-matter — never restated.
//
//   node render.mjs --kind test       --source reports/tickets/<S>/<T>/summary.json              --out <dir>
//   node render.mjs --kind fix        --source reports/tickets/<S>/<T>/verification-summary.json --out <dir> [--dialect wiki]
//   node render.mjs --kind regression --source reports/regression/<REG-…>   --verdict GO          --out <dir> [--ticket K] [--bugs K1,K2]
//   node render.mjs --kind smoke      --source reports/regression/<SMOKE-…> --verdict NO_GO       --out <dir>
//   common: [--title T] [--extra file.json] [--set KEY=VALUE]... [--page-url URL] [--dialect markdown|wiki|html]
//           [--images ref|embed] [--json]
// Exit: 0 ok · 2 bad input/source · 3 over the comment budget with every list already at one item.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTemplate, fitBudget, toWiki, toHtml, BudgetError } from "./lib/template.mjs";
import { fromQaTest, fromVerifyFix, fromRun, applyExtras, templateData, readJson, SourceError } from "./lib/model.mjs";
import { renderPage } from "./lib/page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KINDS = ["test", "fix", "regression", "smoke"];
const DIALECTS = { markdown: [s => s, "md"], wiki: [toWiki, "wiki"], html: [toHtml, "html"] };

export function parseArgs(argv) {
  const a = { sets: {}, bugs: [], dialect: "markdown", images: "ref" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { const x = argv[++i]; if (x === undefined) throw new SourceError(`${k} needs a value`); return x; };
    if (k === "--kind") a.kind = v();
    else if (k === "--source") a.source = v();
    else if (k === "--verdict") a.verdict = v();
    else if (k === "--ticket") a.ticket = v();
    else if (k === "--bugs") a.bugs = v().split(",").map(s => s.trim()).filter(Boolean);
    else if (k === "--title") a.title = v();
    else if (k === "--extra") a.extra = v();
    else if (k === "--set") {
      const [key, ...rest] = v().split("=");
      if (!key || !rest.length) throw new SourceError("--set expects KEY=VALUE");
      a.sets[key] = rest.join("=");
    }
    else if (k === "--page-url") a.pageUrl = v();
    else if (k === "--dialect") a.dialect = v();
    else if (k === "--images") a.images = v();
    else if (k === "--out") a.out = v();
    else if (k === "--json") a.json = true;
    else throw new SourceError(`unknown argument ${k}`);
  }
  if (!KINDS.includes(a.kind)) throw new SourceError(`--kind must be one of ${KINDS.join(" | ")}`);
  if (!a.source) throw new SourceError("--source is required");
  if (!a.out) throw new SourceError("--out <dir> is required");
  if (!(a.dialect in DIALECTS)) throw new SourceError(`--dialect must be one of ${Object.keys(DIALECTS).join(" | ")}`);
  if (!["ref", "embed"].includes(a.images)) throw new SourceError("--images must be ref | embed");
  if ((a.kind === "regression" || a.kind === "smoke") && !a.verdict) {
    throw new SourceError(`--verdict is required for ${a.kind} (GO | CONDITIONAL_GO | NO_GO): a run folder records no machine verdict`);
  }
  return a;
}

function load(a) {
  const src = resolve(a.source);
  let m = a.kind === "test" ? fromQaTest(src)
    : a.kind === "fix" ? fromVerifyFix(src)
    : fromRun(src, a.kind, a.verdict, a.ticket ?? null);
  if (a.kind === "regression" || a.kind === "smoke") m = { ...m, bugs: a.bugs.map(key => ({ key, severity: "", relation: "" })) };
  m = applyExtras(m, a.extra ? readJson(resolve(a.extra)) : {}, a.sets);
  if (a.title) m.title = a.title;
  if (a.pageUrl) m.pageUrl = a.pageUrl;
  return m;
}

export function render(a) {
  const model = load(a);
  const tpl = parseTemplate(readFileSync(join(HERE, "templates", `comment-${a.kind}.md`), "utf8"));
  const comment = fitBudget(tpl, templateData(model, a.dialect), DIALECTS[a.dialect][0]);
  const page = renderPage(readFileSync(join(HERE, "templates", "page.html"), "utf8"), model, { images: a.images });
  return { model, comment, page };
}

function main() {
  try {
    const a = parseArgs(process.argv.slice(2));
    const r = render(a);
    mkdirSync(a.out, { recursive: true });
    const commentPath = join(a.out, `comment.${DIALECTS[a.dialect][1]}`);
    const pagePath = join(a.out, "page.html");
    writeFileSync(commentPath, r.comment.text);
    writeFileSync(pagePath, r.page);
    const out = {
      kind: a.kind, verdict: r.model.verdict, ticket: r.model.ticket,
      artifact: a.kind === "test" || a.kind === "fix" ? r.model.build : r.model.runLabel,
      comment: commentPath, chars: r.comment.chars, budget: r.comment.budget, dropped: r.comment.dropped,
      page: pagePath, shots: r.model.shots,
    };
    console.log(a.json ? JSON.stringify(out, null, 2) : `comment ${commentPath} (${out.chars}/${out.budget} chars)\npage    ${pagePath}`);
  } catch (e) {
    console.error(`qa-report: ${e.message}`);
    process.exitCode = e instanceof BudgetError ? 3 : 2;
  }
}

// Windows: the drive letter's case differs between process.argv and import.meta.url.
const same = (x, y) => process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
if (same(resolve(process.argv[1] ?? ""), fileURLToPath(import.meta.url))) main();
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `node --test scripts/unit/_tmp-qa-report-render.test.mjs`
Expected: PASS, 4 tests. If a template trips `wikiMarkupRefusal`, fix the **template** (the wording that looks like wiki), never the refusal.

- [ ] **Step 6: Smoke test against a real run folder**, if one exists locally (the folder is gitignored):

Run: `npm run report:render -- --kind regression --source reports/regression/REG-2026-10-01-1243 --verdict NO_GO --out <scratchpad>/qa-report-smoke --json`
Expected: exit 0, `chars ≤ budget`, and `dropped.FAILURES > 0` (that run had 15 non-passing cases). Then run `grep -cE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}" <scratchpad>/qa-report-smoke/{page.html,comment.md}`: both must print `0`, because no case note (with its account email) is carried.

- [ ] **Step 7: Delete the temporary test, then commit**

```bash
rm scripts/unit/_tmp-qa-report-render.test.mjs
git add plugins/vc-fix/skills/qa-report/templates/comment-*.md plugins/vc-fix/skills/qa-report/render.mjs package.json
git commit -m "feat(vc-fix): qa-report comment templates (test, fix before/after, regression, smoke) + CLI"
```

---

### Task 5: The skill itself, plus the plugin bookkeeping

**Files:**
- Create: `plugins/vc-fix/skills/qa-report/SKILL.md`, `plugins/vc-fix/skills/qa-report/reference.md`
- Modify: `plugins/vc-fix/knowledge/diagnostics/skill-expectations.md` (§3, add an entry after `/qa-env-check`)
- Modify: `plugins/vc-fix/README.md` (the count line, plus a Quick Start line), `plugins/vc-fix/.claude-plugin/plugin.json` (`version` 0.9.6 → 0.10.0, "16 skills" → "17 skills")

**Interfaces:**
- Consumes: the Task 4 CLI and its `--json` output fields.
- Produces: the call contract for Tasks 6–7, which is `qa-report <TICKET | RUN_ID | path> [--kind K] [--verdict V] [--ticket KEY] [--bugs …] [--extra file] [--set K=V]… [--confirmed]`.

- [ ] **Step 1: Write `SKILL.md`** (target ≤ 8,000 chars). Use this content verbatim:

````markdown
---
name: qa-report
description: "[QA Method] Turn a FINISHED run into its ONE tracker comment (brief, within the template's char budget) and a human-readable HTML report page — after /qa-test, /qa-test-fast, /qa-verify-fix (before/after the fix), /qa-regression and /qa-smoke, or standalone on a ticket key or RUN_ID. The single home of every result-comment template. Renders from the run's machine record, never from memory; asks once, posts once, amends after. Not for bug reports (/qa-bug) or release notes (/ba-analyze docs release)."
argument-hint: "<TICKET | RUN_ID | path> [--kind test|fix|regression|smoke] [--verdict GO|CONDITIONAL_GO|NO_GO] [--ticket KEY] [--bugs K1,K2] [--extra file.json] [--set KEY=VALUE] [--confirmed]"
---

# /qa-report — the result comment and the report page

```
/vc-fix:qa-report VCST-1234                                  # newest summary.json / verification-summary.json
/vc-fix:qa-report REG-2026-10-05-1200 --verdict GO --ticket VCST-1300
/vc-fix:qa-report SMOKE-2026-10-05-0900 --verdict NO_GO
```

**Deterministic core: `render.mjs`** (`node "$pluginRoot/skills/qa-report/render.mjs"`; in the ai-tools
repo `npm run report:render --`; flags and exit codes in its header). It reads the run's machine record,
fills `templates/comment-<kind>.md` within that template's `budget`, and fills `templates/page.html`.
**This skill never writes a comment or a page by hand** — a renderer refusal (exit 2/3) is shown and the
step stops. Why each rule exists, the sources per kind and the dialect table: [`reference.md`](reference.md).

Class: **Mechanic** (report rendering) — exempt from the `kb` step. `$pluginRoot`:
[`../../knowledge/execution/plugin-root.md`](../../knowledge/execution/plugin-root.md).

## 1. Resolve the source

| Argument | Kind | Source |
|---|---|---|
| ticket key | `fix` if `verification-summary.json` is newer, else `test` (`--kind` overrides; both and no `--kind` ⇒ ask) | newest `reports/tickets/**/<KEY>/…` |
| `REG-*` | `regression` | `reports/regression/<RUN_ID>/` |
| `SMOKE-*` | `smoke` | `reports/regression/<RUN_ID>/` |
| a path | from the file name / folder | as given |

Nothing found ⇒ STOP: "no machine record for <arg> — run the pipeline first". A run kind needs
`--verdict` (the pipeline's own quality-gate verdict; a run folder records none).

## 2. Render

```bash
node "$pluginRoot/skills/qa-report/render.mjs" --kind <kind> --source <path> --out <scratchpad>/qa-report-<id> \
  [--verdict …] [--ticket …] [--bugs …] [--extra …] [--set …] --dialect <d> --images embed --json
```

`--dialect`: Jira ⇒ `markdown`; Jira **and** the model has screenshots (fix kind with
`before_shot`/`after_shot`) ⇒ `wiki`; Azure Boards ⇒ `html` (tracker from `project-profile.json`, absent ⇒ Jira).
Exit 2 ⇒ show the message, stop. Exit 3 ⇒ the comment cannot fit even fully collapsed: show it, stop —
never shorten it by hand (the fix is the template, in a PR).

## 3. The page — publish gate

Load the `artifact-design` skill, then:
- **Native project** (`projectType` ≠ `client`, or no profile): publish `page.html` with the Artifact tool
  (icon `checklist`), then tell the user in one line to set **Share → Anyone at Virto Commerce** — a private
  page reaches no one. Re-run §2 with `--page-url <url>` so the comment carries the link.
- **Client project**: do **not** publish. Kind `fix` ⇒ re-render with `--images ref` into the ticket folder as
  `evidence.html` (reports-policy.md §1a). Other kinds ⇒ no page; the comment stands alone. The page stays
  inside the client's own tracker by going on the post as `--attach-file` (§5), which works only in the
  ai-tools repo. Publish an Artifact only on the operator's explicit request, after scrubbing every client
  host / path / identifier.
- Record the link: `summary.json.report.page_url` (test) or `verification-summary.json.evidence_artifact` (fix).

## 4. Ask once — unless the caller already holds consent

Show the comment text and `chars/budget`. Invoked with `--confirmed` (the calling pipeline's own step
already decided to post — `/qa-test` 5-report, `/qa-verify-fix` Step 6) ⇒ skip the question. Otherwise ask
once: *"Post this to <TICKET>?"* No ticket (a run with no `--ticket`) ⇒ show it and stop; nothing is posted.

## 5. Post or amend — ONE comment per ticket per round

[`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0 governs; never
post a second comment for the same round. `--artifact` = the `artifact` field of the `--json` output.
- **ai-tools repo:** `npm run tracker:comment -- --ticket <KEY> --artifact "<artifact>" --body-file <comment>`
  (+ `--attach <shot>` per screenshot when `wiki`; + `--attach-file <page.html>` for a client-project page;
  `--amend <id>` when an id is already recorded). Never upload with raw REST — both flags dedupe, which makes a retry safe.
- **Plugin-only install, Jira:** Atlassian MCP `addCommentToJiraIssue` (pass `commentId` to amend);
  screenshots per tracker-ops.md §5c. **Azure:** `ado.mjs comment --id <n> --text-file <comment.html>`.
- Read the posted comment back; a UI claim's images must render ([`../../.claude/rules/reports.md`](../../.claude/rules/reports.md) §5.0).

## 6. Finish

Print: verdict · comment id (posted / amended / not posted) · page link or local path · `chars/budget` ·
`dropped` lists. Then, as the LAST action:

```bash
node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "qa-report"
```
````

- [ ] **Step 2: Write `reference.md`.** It has these sections, each short and with no transcribed numbers:
  - `§Templates`: front-matter keys (`kind`, `budget`, `trim`); slot syntax (`{{KEY}}`, `{{#L}}`, `{{^L}}`, `{{?L}}`, `{{L_MORE}}`); "a budget is changed in the template, in a PR, never by hand in a run".
  - `§Sources`: one row per kind naming the fields read, the `before_after[]` contract (`check`, `before`, `after`, optional `before_shot`, `after_shot`), and why case `notes` are dropped.
  - `§Verdicts`: "the vocabulary is `lib/model.mjs` `VERDICTS`".
  - `§Dialects`: the Jira md / Jira wiki / Azure html table and why (§5a, §5c).
  - `§Publish gate`: moved from `qa-verify-fix` 6A, now the single source.
  - `§Extras`: the closed key list `title, lede, rows, notTested, context, shots`, with their shapes.
  - `§Why no hook`: D2.
  - `§Callers`: the table from this plan's *How it is called*.

- [ ] **Step 3: Add the oracle entry** to `plugins/vc-fix/knowledge/diagnostics/skill-expectations.md` §3, after the `/qa-env-check` block:

```markdown
### `/qa-report` — the result comment and the report page
- **Expected phases** (`skills/qa-report/SKILL.md`): resolve source → render (`render.mjs`) → page gate → ask (unless `--confirmed`) → post/amend → finish.
- **Required outputs:** a rendered comment within its template budget; a page link or the local path; one tracker comment (or none, by the operator's choice).
- **Anti-patterns:**
  - **S1** — a comment posted that `render.mjs` did not produce (hand-written or hand-shortened), or a second comment in the same round. *Signal:* a tracker post with no preceding `render.mjs` span; a second POST for one ticket.
  - **S1** — a page published to an Artifact on a `projectType: client` profile without the operator's explicit request. *Signal:* Artifact publish + client profile.
  - **S2** — exit 2/3 ignored and the step continued. *Signal:* non-zero renderer exit followed by a post.
  - **S3** — a list collapsed to `+N more` (expected under budget pressure; informational).
```

- [ ] **Step 4: Update the plugin bookkeeping**
  - `plugins/vc-fix/README.md` line 5: change `16 skills` to `17 skills`. In Quick Start, after the `/qa-verify-fix` line, add `/qa-report VCST-1234          # The run's ONE tracker comment + its report page`.
  - `plugins/vc-fix/.claude-plugin/plugin.json`: `"version": "0.10.0"`, and in the description change `16 skills` to `17 skills`.
  - Do **not** tag here. The `vc-fix--v0.10.0` tag is part of the release, per `docs/release-process.md` §Step 5a.

- [ ] **Step 5: Verify**

Run: `wc -c plugins/vc-fix/skills/qa-report/SKILL.md` → expected < 19000.
Run: `npm run context:check` → expected: no new findings.

- [ ] **Step 6: Commit**

```bash
git add plugins/vc-fix/skills/qa-report/SKILL.md plugins/vc-fix/skills/qa-report/reference.md \
  plugins/vc-fix/knowledge/diagnostics/skill-expectations.md plugins/vc-fix/README.md plugins/vc-fix/.claude-plugin/plugin.json
git commit -m "feat(vc-fix): /qa-report skill — resolve, render, publish gate, one comment; vc-fix 0.10.0"
```

---

### Task 6: Wire the plugin callers (`/qa-verify-fix` and the plugin's template copies)

**Files:**
- Modify: `plugins/vc-fix/commands/qa-verify-fix.md`: the Step 6 comment blocks, Step 6A, and the Step 7 JSON.
- Modify: `plugins/vc-fix/skills/qa-defect/defect-lifecycle-workflow.md` (around lines 161 and 173).
- Modify: `plugins/vc-fix/skills/qa-evidence/sign-off-templates.md` (the two `Quick Status Report` headings).

**Interfaces:**
- Consumes: the Task 5 call contract.
- Produces: `verification-summary.json.before_after[]`, which `fromVerifyFix` reads.

- [ ] **Step 1: Step 7 — add the pair** to the JSON block, after `"baseline_reproduction"`:

```json
  "before_after": [
    {"check": "<what was compared — a value, a status, a screen>", "before": "<Phase A RED observation>", "after": "<Phase B GREEN observation>",
     "before_shot": "screenshots/<file>.png", "after_shot": "screenshots/<file>.png"}
  ],
```

Below the block, add: `before_after[]` is required for VERIFIED / VERIFIED_WITH_NOTES / NEW_REGRESSION (one row per Step 2A RED→GREEN pair, from the captured payloads, never hand-written). The `*_shot` fields are only for UI-layer bugs.

- [ ] **Step 2: Step 6.** Replace both fenced comment blocks (`**Tracker comment for VERIFIED …**` and `**Tracker comment for REOPEN …**`, through their closing fences) with:

```markdown
**Tracker comment — every verdict:** write `verification-summary.json` first (Step 7's shape, incl.
`before_after[]`), then hand it to `/vc-fix:qa-report reports/tickets/{SPRINT}/<ticket-key>/verification-summary.json --kind fix --confirmed`.
It renders the before/after comment within its template budget, embeds the screenshots inline for a UI bug,
and posts or amends the ONE comment (`tracker-ops.md` §0). Template: `skills/qa-report/templates/comment-fix.md`.
```

- [ ] **Step 3: Step 6A.** Replace the body from `**Always include:**` through the end of the `**Where it goes …**` list with:

```markdown
The page is `qa-report`'s (`skills/qa-report/templates/page.html`, filled from the same
`verification-summary.json`), so it carries the before → after table, the build strip and the evidence. **Where it goes**
— the publish gate (native ⇒ Artifact after asking; client ⇒ local `evidence.html`, never for client-owned code) — is
`skills/qa-report/reference.md` §Publish gate. **Always** redact secrets before Step 7 writes the pair.
```

Keep the existing layer-scoped snippet table (request/response vs screenshots). It still says *what to capture* in Phase A/B, which feeds `before_after[]`.

- [ ] **Step 4: The plugin's template copies**
  - `defect-lifecycle-workflow.md` §3.2 and §3.3: replace each fenced `QA PASSED …` / `QA FAILED …` block with `**Required comment:** rendered by \`/vc-fix:qa-report --kind fix\` (\`skills/qa-report/templates/comment-fix.md\`) — never typed here.`
  - `sign-off-templates.md`: rename both headings `… Quick Status Report (for Teams/Comment)` to `… Quick Status Report (for Teams / qa-lead SendMessage — a tracker comment is \`qa-report\`'s)`.

- [ ] **Step 5: Verify**

Run: `grep -rn "QA PASSED — Fix verified\|QA FAILED — Reopening" plugins/vc-fix` → expected: no output.
Run: `npm run context:check` → expected: no new findings.

- [ ] **Step 6: Commit**

```bash
git add plugins/vc-fix/commands/qa-verify-fix.md plugins/vc-fix/skills/qa-defect/defect-lifecycle-workflow.md plugins/vc-fix/skills/qa-evidence/sign-off-templates.md
git commit -m "refactor(vc-fix): /qa-verify-fix reports through qa-report — before_after[] + one template"
```

---

### Task 7: Wire the in-repo callers (`/qa-test`, `/qa-test-fast`, `/qa-regression`, `/qa-smoke`) and the policy

**Files:**
- Modify: `.claude/skills/qa-test/reporting.md` §5-report.2
- Modify: `.claude/skills/qa-test-fast/verdict.md` (§HTML page, §Tracker comment), `.claude/skills/qa-test-fast/SKILL.md`, `.claude/commands/qa-test-fast.md` (lines 122–130)
- Delete: `.claude/skills/qa-test-fast/report-template.html`
- Modify: `.claude/commands/qa-regression.md` Step 8 (net shrink), `.claude/commands/qa-smoke.md` Step 5
- Modify: `.claude/skills/qa-defect/defect-lifecycle-workflow.md` (around lines 127 and 139), `.claude/skills/qa-evidence/sign-off-templates.md`
- Modify: `.claude/knowledge/execution/reports-policy.md` (§2 table, §1a `evidence.html` row), `.claude/templates/qa-test-summary.schema.json` (`report.$comment`), `docs/qa-test-flow.md:297`

**Interfaces:**
- Consumes: the Task 5 call contract.
- **The fallback every caller states:** if the Skill tool refuses `vc-fix:qa-report`, the install predates it. Tell the user to run `/plugin update`, and stop the report step. Nothing is posted by hand.

- [ ] **Step 1: `/qa-test` reporting.md §5-report.2.** Replace everything from the opening code fence of the `QA Complete — …` block through the `The \`Not filed\` line is **mandatory** …` paragraph with:

```markdown
**Runs after §3 has written `summary.json`** — the comment is rendered from it:
`/vc-fix:qa-report reports/tickets/{SPRINT}/<ticket-key>/summary.json --kind test --confirmed --set RELEASE_GATE="<§1 recommendation>"`.
The template (`plugins/vc-fix/skills/qa-report/templates/comment-test.md`) is the only copy; its `Not filed` and
`Release note` lines are mandatory and print `None` / `none — <refusal>` rather than disappear, because an omitted
line is indistinguishable from a clean run. Skill refused ⇒ the vc-fix install predates it: tell the user to run
`/plugin update` and stop this step — never type the comment by hand.
```

Leave the `--iterate` paragraph as is (the round delta is `modes.md`'s and is out of scope). Keep `--artifact`: qa-report passes the build it read from `summary.json`.

- [ ] **Step 2: `/qa-test-fast`**
  - `verdict.md` §HTML page: replace the paragraph `Load the \`artifact-design\` skill, then copy … publish it with the Artifact tool.` with:

    > Write the page's extras to `<scratchpad>/extra.json` from `verdict.md`: `lede` = the one sentence; `rows` = the AC table (`id`, `text`, `result`, `evidence`); `notTested`; `context` = the Data and Context-used lines as `{label, value}`; `shots` ≤ 4. Then run `/vc-fix:qa-report reports/tickets/{SPRINT}/<TICKET>/summary.json --kind test --extra <scratchpad>/extra.json`. It loads `artifact-design`, publishes the page, renders the comment with its link, and asks the one question in §Tracker comment.

    Keep the *Audience: Anyone at Virto Commerce* paragraph.
  - `verdict.md` §Tracker comment: replace its bullet list with one line: "The question, the post and the amend are `qa-report`'s §4–§5. Write the returned id into `summary.json.tracker.comment_id` (the `tracker:comment` helper mirrors it)."
  - `.claude/commands/qa-test-fast.md` lines 122–130: replace the `report-template.html` sentence with "build the page and the comment through `/vc-fix:qa-report` ([`verdict.md`](../skills/qa-test-fast/verdict.md) §HTML page)".
  - `SKILL.md` lines 26 and 47: keep the wording but name `qa-report` as the producer of the page and the comment.
  - Run `git rm .claude/skills/qa-test-fast/report-template.html`.

- [ ] **Step 3: `/qa-regression` Step 8.** This file sits in `.prompt-size-baseline.json`, so it may only shrink. Replace the whole Step 8 body (from `Output concise verdict` through `no manual \`npm run report:regression\` needed.`) with:

```markdown
Output the verdict, pass rate, bugs, **the Step-6.5 promotion line** (`N promotable, M held`, or `skipped —
delegated run`), the seed profile, whether teardown ran, and both report paths in `reports/regression/{RUN_ID}/`
(`regression-YYYY-MM-DD.md`, `regression-report.html`). Then `/vc-fix:qa-report {RUN_ID} --verdict <Step 6 Quality
Gate verdict>` (+ `--ticket <KEY> --bugs <keys>` when the run belongs to a ticket) — the brief comment + the shareable page.
```

Run `npm run context:check`. It must report no `BUDGET-004` growth. If it does, cut the sentence `It is idempotent with the watcher's output.` from Step 6 and re-run.

- [ ] **Step 4: `/qa-smoke` Step 5.** Append to `Output verdict, pass rate, bugs found, and report path to the user.`:

```markdown
Then `/vc-fix:qa-report {RUN_ID} --verdict <GO|CONDITIONAL_GO|NO_GO> --set GATES="<the Step 4 gate lines>"` (+ `--ticket <KEY>`
when the smoke gates a ticket or release) for the brief comment and the shareable page. Skill refused ⇒ `/plugin update`.
```

- [ ] **Step 5: The `.claude/` template copies.** These are the same edits as Task 6 Step 4, applied to `.claude/skills/qa-defect/defect-lifecycle-workflow.md` (lines ~127/139) and `.claude/skills/qa-evidence/sign-off-templates.md` (both headings). Use the plugin path in the pointer: `plugins/vc-fix/skills/qa-report/templates/comment-fix.md`.

- [ ] **Step 6: Policy and schema**
  - `reports-policy.md` §2 table: add a row after `Ticket documentation`: `| Result tracker comment (\`/vc-fix:qa-report\`) | — | the **char** budget in its template's front-matter (\`plugins/vc-fix/skills/qa-report/templates/comment-*.md\`) — never restated here |`.
  - In the §1a `evidence.html` row, prepend "Rendered by `qa-report` (`--images ref`); ".
  - `qa-test-summary.schema.json` `report.$comment`: change `/qa-test-fast only (path FAST_GROUNDED); null elsewhere.` to `Written by qa-report on any path when a page was published; null when none was.`
  - Then run `npm run summary:validate` and confirm there is no new finding.
  - `docs/qa-test-flow.md:297`: change `The tracker comment (QA Complete summary, …` to `The tracker comment (rendered by /vc-fix:qa-report from summary.json, …`. Keep the rest of the line.

- [ ] **Step 7: Verify that there is now one copy**

Run: `grep -rn "QA Complete —\|QA PASSED — Fix verified\|report-template.html" .claude plugins docs --include=*.md | grep -v superpowers`
Expected: no output.
Run: `npm run context:check && npm run summary:validate`
Expected: both green, with no new findings.

- [ ] **Step 8: Commit**

```bash
git add -A .claude/skills/qa-test/reporting.md .claude/skills/qa-test-fast .claude/commands/qa-test-fast.md \
  .claude/commands/qa-regression.md .claude/commands/qa-smoke.md .claude/skills/qa-defect/defect-lifecycle-workflow.md \
  .claude/skills/qa-evidence/sign-off-templates.md .claude/knowledge/execution/reports-policy.md \
  .claude/templates/qa-test-summary.schema.json docs/qa-test-flow.md
git commit -m "refactor(qa): every result comment and page comes from /vc-fix:qa-report — one template per kind"
```

---

### Task 8: End-to-end dry run and whole-branch gates

**Files:** none. This task only verifies.

- [ ] **Step 1: Dry-run each kind through the real post path.** This never touches Jira. For each of the four kinds, render into the scratchpad as in Task 4 Step 6, then run:

```bash
npm run tracker:comment -- --ticket VCST-5675 --artifact "<artifact from --json>" --body-file <scratchpad>/qa-report-<id>/comment.md --dry-run
```
Expected: the helper accepts the body (no wiki-markup refusal) and prints the payload it *would* post. For the fix kind in `wiki` with shots, add `--attach` for each shot, again with `--dry-run`. For the client branch, add `--attach-file <out>/page.html`: the dry run must print one `**Attached:**` line linking `page.html`.

- [ ] **Step 2: Look at one published page.** Publish one `page.html` from Step 1 as an Artifact (private), and open it in light and dark mode at phone width. Then delete it (`Artifact` `action: "delete"`, with the user's confirmation).

- [ ] **Step 3: Gates**

Run: `npm run context:check` → expected green.
Run: `npm test` → expected green, with the same failure set as `origin/main` and no new failures.
Run: `git status --porcelain scripts/unit` → expected empty (no temporary test survived).

- [ ] **Step 4: Hand off.** Use superpowers:finishing-a-development-branch. The PR description states the following:
  - Callers depend on `vc-fix` **0.10.0**. Until it is released and tagged (`docs/release-process.md` §Step 1, §Step 5a), `/vc-fix:qa-report` is refused on installed machines, and every caller says so and stops its report step.
  - After merge, a maintainer releases `vc-fix` 0.10.0.

---

## Out of scope (named so nobody adds them silently)

- **Bug-report file templates** (`defect-report-templates.md`). These are filed bugs, not result comments, and they belong to `/qa-bug`.
- **`/qa-test --iterate` round-delta comment** (`modes.md` §5-loop). A later change can move it into a `comment-test-round.md`.
- **`/qa-verify-fix` Step 2/Step 3 status notes** (deferred / moved to testing). These are one-line status notes, not results.
- **The live regression dashboard** (`regression-report.html`). It stays the engineering view, and the qa-report page is the shareable summary.
- **CI / Teams notifications** (`ci/notify-teams.ts`). The CLI can feed them later; this plan does not wire them.
