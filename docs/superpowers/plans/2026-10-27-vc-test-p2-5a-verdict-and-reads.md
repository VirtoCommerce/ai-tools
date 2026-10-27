# vc-test P2-5a — the verdict rules in the plugin, and the strategy reads only plugin files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a vc-test run on a client install, with no `.claude/` from this repository, finds every rule its
strategy, briefs and agents cite. The verdict rules (B6) move into the plugin, and this repository's
`close-out.md` points at them. Each `.claude/` document the strategy and briefs cite is copied in (whole or the
section used), replaced by the plugin's own mechanism, or marked as this repository's `/qa-test-fast` only. A
`context:check` ratchet keeps the plugin from linking into `.claude/` again. Released as `vc-test` 0.10.0.

**Architecture:**
- **Knowledge files.** New plugin files go in `plugins/vc-test/knowledge/`, the vc-fix pattern (`plugins/CLAUDE.md`:
  duplicate, not reference).
- **The verdict rules** become `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md`, since the strategy skill
  already owns §Reconcile. `close-out.md` §5-verdict keeps its heading and its two sub-headings, so the 20 files
  citing it stay valid, and each sub-section body becomes a one-line pointer. That is the user's choice: rules to the
  plugin, a pointer stays.
- **The ratchet** is a new `context:check` rule, DOC-009: a `plugins/vc-test/` file links or cites a `.claude/` path.
  Its baseline may only go down. Code comments and human docs under `docs/` are not counted.

**Tech Stack:** Markdown; one rule in `scripts/maintenance/lint-claude-docs.mjs` (Node ESM), with a temporary test.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U2 (canonical
copies in the plugin), U56, B6 (the verdict table moves with today's meaning), §10 P2. Survey of what the plugin
reads from this checkout: P2-5 survey §6–§7, summarised in the table below. P2 index: [`2026-10-26-vc-test-p2-1-scripts.md`](2026-10-26-vc-test-p2-1-scripts.md).

## P2-5 is five plans (owner, 2026-10-27)

| Plan | Delivers |
|---|---|
| **P2-5a (this)** | the verdict rules in the plugin; every `.claude/` document the strategy, briefs and agents cite resolved; the DOC-009 ratchet |
| P2-5b | `qa-triage-results` skill in the plugin; its ticket-mode collector as a plugin `.mjs`. The regression half stays in `scripts/lib/regression-triage.ts` |
| P2-5c | `qa-design` skill + `ui-ux-expert` agent in the plugin; `visual-axis.md` with them |
| P2-5d | `qa-test-automation` skill + a self-contained `.spec` runner in the plugin. The repository's harness (`regression/lib/`) stays. `checklist-writer` gains the `.spec` half (P2-3 Q1) |
| P2-5e | `qa-test-cases-generator` skill + `test-management-specialist` agent in the plugin. vc-test switches to `--from-strategy` and requires `vc-fix >=0.17.0` (P2-4 D10) |

The owner's answers, binding on P2-5b–e:
- **Skills move, commands stay** in `.claude/` as thin shims that invoke the plugin skill. The bare `/qa-*` names
  keep working here, and the skills' `.claude/` copies are deleted.
- **Code consumers keep the repository's half.** The plugin gets its own self-contained piece; this repository's
  CI is not repointed at plugin code.

## Decisions this plan makes (confirm at review)

| # | Document the plugin cites today (citing file) | Decision |
|---|---|---|
| A1 | `.claude/skills/qa-test/close-out.md` §5-verdict.1–.2 (strategy `SKILL.md:210`, `agents/verdict-writer.md:41`) | **Move** into `skills/qa-test-strategy/verdict-rules.md`, with today's meaning (B6). `close-out.md` keeps the headings and points at the plugin file |
| A2 | `.claude/skills/qa-test-fast/verdict.md` (`verdict-writer.md:44`, the `verdict.md` shape) | **Copy the shape block** (the `verdict.md` skeleton) into `verdict-rules.md` §Shape. `qa-test-fast/verdict.md` points at it |
| A3 | `.claude/rules/test-data.md` (strategy `SKILL.md:128`, `checklist-writer.md:49`, `briefs/bug-rerun.md:44`, `briefs/scenario-run.md:36`) | **Copy whole** to `knowledge/test-data.md`. The repository copy stays canonical for the repository, and a header line names the pair (the vc-fix pattern) |
| A4 | `.claude/rules/reports.md` (`SKILL.md:176`, `rounds.md:7`, `harness/playwright.config.mjs:6`) | **Copy whole** (4.5 KB) to `knowledge/reports.md` |
| A5 | `.claude/knowledge/execution/live-discovery.md` (`briefs/ac-checks.md:24`) | **Copy whole** to `knowledge/live-discovery.md` |
| A6 | `.claude/knowledge/agents/qa/shared-instructions.md` §5 / the authority tags (`SKILL.md:105`) | **Copy the section the citation names** to `knowledge/oracle-authority.md` |
| A7 | `.claude/skills/qa-test-design/test-design-techniques.md` §0, §1 (`SKILL.md:100`) | **Copy §0 (the token vocabulary) and §1 (the selection guide)** to `knowledge/test-design-techniques.md`. §1a and later stay with `/qa-test-design` |
| A8 | `.claude/skills/qa-test/exploratory-lane.md` §5 (`SKILL.md:119`) | **Copy §5 (the box)** to `knowledge/exploratory-box.md` |
| A9 | `.claude/skills/qa-test/ui-kit-class.md` (`floors.md:25`) | **Copy whole** to `knowledge/ui-kit-class.md` (F3's signal) |
| A10 | `.claude/knowledge/domain/domain-map.md` (`floors.md:19`, the map's shape) | **Copy whole** to `knowledge/domain-map.md` |
| A11 | `.claude/skills/qa-risk/risk-prioritization-framework.md` (`SKILL.md:83`) | **Cite vc-fix's skill by name** (`vc-fix:qa-risk`, `risk-prioritization-framework.md`, byte-identical). vc-test depends on vc-fix, and an agent loads it with the Skill tool. No copy |
| A12 | `.claude/knowledge/execution/ticket-routing.md` (`floors.md:7,98`) | **Replace** with the plugin's own `lib/route.mjs` + `test.routing` (P2-1) |
| A13 | `.claude/knowledge/execution/run-output.md` (`SKILL.md:38`) | **Replace** with the plugin's own `scripts/lib/run-dir.mjs` |
| A14 | `.claude/rules/agents.md` (`SKILL.md:108`, lanes and the cap) | **Replace** with `lib/plan-run.mjs` (≤ 3 browser lanes) and one sentence |
| A15 | `CLAUDE.md` §Product context (`SKILL.md:75`) | **Replace** with `skills/ticket-context/known-ground.md` (the kb step the plugin already owns) |
| A16 | `.claude/knowledge/execution/regression-suites.md`, `regression-selection.md`, `.claude/skills/qa-test/coverage-triage.md`, `.claude/commands/qa-test-fast.md`, `.claude/templates/qa-test-summary.schema.json` (`SKILL.md:27,31,45,212`, `floors.md:22,117`) | **Mark as this repository's only.** They serve `/qa-test-fast`'s regression and summary, which vc-test never runs (U7, 6h). Each citation becomes plain text, not a link: "(in this repository: `/qa-test-fast` …)" |
| A17 | `.claude/skills/qa-test/visual-axis.md` (`floors.md:20,100`, `commands/qa-ticket.md:115`) | **Deferred to P2-5c**, which moves the visual lane. Counted in DOC-009's baseline until then |
| A18 | `docs/…` human documents (specs, `docs/decisions/qa-test-evolution.md`) | **Keep**: human rationale, as P1d-1 allowed. DOC-009 does not count `docs/` |
| A19 | `npm run …` scripts the plugin names (`kb`, `run:use`, `bl:extract`, `store:caps`, `tc:scope`, `schema:refresh`, `deploy:pr`, `env:*`, `secrets:sync`) | **Not this plan.** They are commands of a project that has them (capabilities already probes `package.json`, `capabilities.mjs:51`). P2b and P2-6 own the missing ones |

## Global Constraints

- **NO CODE ⇒ NO UNIT TEST.** The prose moves get no test. The DOC-009 rule is code, so its test is temporary:
  `scripts/unit/tmp-doc009.test.mjs`, red then green, deleted before commit.
- **A copy is a copy.** Copy the text verbatim (the section only, where the decision says so). The one change
  allowed is to rewrite its own outbound links so they resolve inside the plugin, or turn them into plain text. The
  first line names its source: `<!-- copy of .claude/… — keep in step; the repository copy is canonical here -->`.
- **The verdict's meaning does not change (B6).** `verdict-rules.md` is §5-verdict.1–.2's text with its links
  rewritten. Nothing is added to it and nothing is dropped.
- **Every file that cites `close-out.md` §5-verdict keeps resolving.** The heading and its two sub-headings stay in
  `close-out.md`, so DOC-004 stays at 0.
- **Paths in prompts resolve through `<PLUGIN>` / `<plugin>`.** That is the agents' input and the command's
  `<plugin>`. Relative links inside `skills/` stay relative.
- **BUDGET-004.**
  - `SKILL.md` (strategy) is 18,980 chars and must not grow: each A-row edit replaces a link, so pay for any growth
    in the same file.
  - `commands/qa-ticket.md` stays ≤ 14,076 chars.
- **Release:** `plugin.json` 0.10.0 (description: drop "Triage and investigation … until P2" only when P2-5b has
  landed, so keep it); README rows; spec §10 P2 row ("P2-5a done"); the P2-5 split recorded in §10. After merge,
  `claude plugin tag --push` from `plugins/vc-test/`.
- `npm run context:check`, `npm run docs:index:check`, `npm test` and `claude plugin validate plugins/vc-test` green.
- Never stage `.gitignore`, `.claude/settings.json`, `.claude/rules/vc-browser.md` or `reports/tickets/…` (the
  user's own working-tree changes).

## Review Focus

1. **A citation that moved but still says "§5-verdict.2" of `close-out.md`.** After this plan, `verdict-writer.md` and
   the strategy name `verdict-rules.md`, and the old section names only a pointer. A reader that follows either
   lands on the same rules. Checked in Task 1.
2. **A copied file whose own links dangle in the plugin.** For example `test-data.md` links
   `knowledge/execution/test-data-authoring.md`, which has no plugin copy. Each outbound link in a copied file
   either resolves under `plugins/vc-test/` or becomes plain text. DOC-008 over `plugins/vc-test/**` is 0. Checked in
   Task 2.
3. **The ratchet counting the wrong thing.** A code comment in `lib/deployed.mjs` ("a port of
   `scripts/deploy/lib/live.ts`") is history, not a read. A `docs/…` link is human rationale. Neither is DOC-009.
   A Markdown link or a backticked `.claude/…` path in a prompt or a brief is. Tested in Task 3.
4. **This repository's `/qa-test` and `/qa-test-fast` keep working.** `close-out.md` keeps everything outside
   §5-verdict, and its pointer is one hop. `npm run qa-test:doclint` (it reads `.claude/skills/qa-test/`) stays green.
   Checked in Task 1.

---

### Task 1: the verdict rules move into the plugin

**Files:**
- Create: `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md`
- Modify: `.claude/skills/qa-test/close-out.md` (§5-verdict.1 and .2 bodies → a pointer each; headings kept)
- Modify: `.claude/skills/qa-test-fast/verdict.md` (the `verdict.md` shape block → a pointer to `verdict-rules.md` §Shape)
- Modify: `plugins/vc-test/agents/verdict-writer.md` (lines citing `close-out.md` / `qa-test-fast/verdict.md` → `<PLUGIN>/skills/qa-test-strategy/verdict-rules.md`)
- Modify: `plugins/vc-test/skills/qa-test-strategy/SKILL.md` (§Reconcile's `close-out.md` link → `verdict-rules.md`)

**Interfaces:**
- Produces: `verdict-rules.md` with `## Reconcile — AC & DoD vs implementation` (= 5-verdict.1), `## Decide the
  verdict` (= 5-verdict.2: the decision table and the carve-outs) and `## Shape` (the `verdict.md` skeleton from
  `qa-test-fast/verdict.md`). Each section's outbound links resolve in the plugin, or are plain text for a
  repository-only file such as `docs/decisions/…`.
- Produces: `close-out.md` `### 5-verdict.1 …` and `### 5-verdict.2 Decide verdict` each keep their heading, followed
  by one line: *The rules live in the vc-test plugin: `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md`
  §<the section>* — a repository path, valid in this repository.

- [ ] **Step 1:** Create `verdict-rules.md` from §5-verdict.1–.2 verbatim, plus the shape block. Rewrite only links.
- [ ] **Step 2:** Replace the bodies in `close-out.md` and `qa-test-fast/verdict.md` with the pointers. Repoint
  `verdict-writer.md` and the strategy `SKILL.md`, which must not grow.
- [ ] **Step 3: Checks.**
  - `diff` of the moved text (old body vs new section, links aside) shows only link lines.
  - `npm run --silent context:check` is green (DOC-004 at 0).
  - `npm run qa-test:doclint` is green.
  - `git grep -n "close-out.md" plugins/vc-test` prints nothing.
- [ ] **Step 4: Commit:** `feat(vc-test): the verdict rules live in the plugin; close-out.md points at them (B6, P2-5a)`.

### Task 2: the documents the strategy, briefs and agents read

**Files:**
- Create in `plugins/vc-test/knowledge/`: `test-data.md` (A3), `reports.md` (A4), `live-discovery.md` (A5),
  `oracle-authority.md` (A6), `test-design-techniques.md` (A7), `exploratory-box.md` (A8), `ui-kit-class.md` (A9),
  `domain-map.md` (A10)
- Modify: the citing lines in `skills/qa-test-strategy/{SKILL.md,floors.md,rounds.md}`, `agents/checklist-writer.md`,
  `briefs/{bug-rerun,scenario-run,ac-checks}.md`, `harness/playwright.config.mjs` (its comment), per A3–A16

**Interfaces:**
- Produces: each copy opens with the source line (Global Constraints), and its outbound links resolve in the plugin
  or are plain text.
- Produces: in the strategy and floors files:
  - A11: links to `vc-fix:qa-risk`'s `risk-prioritization-framework.md`;
  - A12–A15: the plugin mechanism named in the decision;
  - A16: plain text "(in this repository: …)".
- Prompts outside `skills/` (agents, briefs) cite `<PLUGIN>/knowledge/<file>`. Files inside `skills/` link
  `../../knowledge/<file>`.

- [ ] **Step 1:** Create the eight copies (A3–A10), sections only where the decision says so. Rewrite each copy's own
  outbound links.
- [ ] **Step 2:** Repoint every citing line (A3–A16). Leave `visual-axis.md` (A17) and `docs/` (A18) alone.
- [ ] **Step 3: Checks.**
  - `git grep -nE "\.claude/" plugins/vc-test -- '*.md'` prints only the A17 lines, the copies' source-header lines,
    and the A16 plain-text mentions.
  - `npm run --silent context:check` is green, with DOC-008 over the plugin at 0.
  - The strategy `SKILL.md` is ≤ 18,980 chars.
  - `claude plugin validate plugins/vc-test` passes.
- [ ] **Step 4: Commit:** `feat(vc-test): the strategy, briefs and agents read plugin files — copies, plugin mechanisms, repo-only marks (P2-5a)`.

### Task 3: the DOC-009 ratchet

**Files:**
- Modify: `scripts/maintenance/lint-claude-docs.mjs` (DOC-009, its baseline handling as the other ratchets)
- Modify: the lint's baseline file (as DOC-002/003/004 keep theirs; check where the lint stores ratchet baselines)
- Test (temporary): `scripts/unit/tmp-doc009.test.mjs`

**Interfaces:**
- Produces: DOC-009 is a ratchet that counts, in `plugins/vc-test/**/*.{md,json}` and in the comments of
  `plugins/vc-test/harness/*.mjs`:
  - **counted:** a Markdown link whose target resolves to a `.claude/` path, and a backticked token that starts
    `.claude/` (or `../…/.claude/`);
  - **not counted:**
    - a line carrying the copy-source header (`<!-- copy of .claude/`);
    - text inside `(in this repository: …)`;
    - anything under `docs/`;
    - a `.mjs`/`.js` code comment outside `harness/`.

  The baseline after Task 2 is the A17 count. It may only go down.

- [ ] **Step 1: Write the failing test.**
  - A fixture `plugins/vc-test`-shaped tree with one link to `../../../../.claude/rules/agents.md` ⇒ 1 finding.
  - The copy header line ⇒ 0 findings.
  - `(in this repository: \`.claude/commands/qa-test-fast.md\`)` ⇒ 0 findings.
  - A `docs/…` link ⇒ 0 findings.
  - A `// a port of scripts/…` comment in `lib/*.mjs` ⇒ 0 findings.
- [ ] **Step 2:** Run it: `node --test scripts/unit/tmp-doc009.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement DOC-009 beside DOC-008, the same shape (scan, then compare to the baseline). Record the
  baseline.
- [ ] **Step 4:** Run it. Expected: PASS. `npm run --silent context:check` is green, and its summary line prints
  DOC-009 at the A17 count.
- [ ] **Step 5:** Delete the temporary test and commit:
  `feat(maintenance): DOC-009 — a vc-test file may not read a .claude/ path (ratchet, P2-5a)`.

### Task 4: release `vc-test` 0.10.0

**Files:**
- Modify: `plugins/vc-test/.claude-plugin/plugin.json`, `plugins/vc-test/README.md`, `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §10 P2 row

- [ ] **Step 1:** `plugin.json` → 0.10.0; keep the description's "until P2" phrase.
- [ ] **Step 2:** README: a `knowledge/` row naming the eight copies and where each came from, and the
  `verdict-rules.md` row.
- [ ] **Step 3:** CHANGELOG entry (the vc-test entries' shape).
- [ ] **Step 4:** Spec §10 P2 row: "P2-5 is five plans, P2-5a…e (`docs/superpowers/plans/2026-10-27-vc-test-p2-5a-verdict-and-reads.md`
  §P2-5 is five plans); **P2-5a done** (vc-test 0.10.0: the verdict rules in the plugin, the strategy reads only
  plugin files but the visual axis, DOC-009)".
- [ ] **Step 5: Gates.** `npm run --silent context:check`, `npm run docs:index:check`, `npm test` and
  `claude plugin validate plugins/vc-test` are green.
- [ ] **Step 6: Commit:** `release(vc-test): 0.10.0 — the verdict rules and the strategy's reads in the plugin (vc-test P2-5a)`.
