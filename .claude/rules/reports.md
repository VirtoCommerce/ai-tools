# Reports — Single Source of Truth

**This file is the only place the report policy lives.** All other files (`shared-instructions.md`, `evidence-capture-policy.md`, skill SKILLs, agent definitions) point here. Reports are read by humans on a deadline — long reports get skimmed and bugs get missed. Long-form reasoning, investigation logs, and progress updates belong in SendMessage to the orchestrator, never on disk.

## 1. Only Ten Report Categories Allowed

| # | Category | Path | When |
|---|----------|------|------|
| 1 | Bug report | `reports/bugs/open/<severity>/` or `reports/bugs/fixed/` — **exactly one, never both** | A confirmed defect with reproducible STR. **`open/` is foldered by severity — `critical-high/` (Critical/P0 + High/P1) · `medium/` (Medium/P2) · `low/` (Low/P3)** — because at 90+ open reports a flat directory could not answer *what must ship first*, which is the only question the open backlog is read for; see §1a. `/qa-verify-fix` **moves** `open/<severity>/` → `fixed/` on a VERIFIED verdict (adding a `## Resolution` block) — it is a move, not a copy, and `fixed/` stays FLAT (severity is a triage axis on work still to do; once fixed it is history). A file present in both trees is a defect: the stale `open/` copy makes a fixed bug look outstanding and gets counted twice by any open-bug scan, including the Feature Release Gate's "0 open P0" criterion. When you find one, delete the `open/` copy |
| 2 | Test cases | `regression/suites/` (CSV) | Adding/updating test coverage. `/qa-test`-authored cases land here directly as `Automation_Status = Draft` (Step 3) and are flipped in-run to `Automated`/`Reviewed` at 5g (last, non-blocking) after execution — never a run-scoped ticket CSV |
| 3 | BA report | `reports/ba/` — optionally in a **domain subfolder** (the established convention: `Configurable products/`, `Organization roles/`, `Page Builder (CMS)/`, `Sales-rep/`…; spaces are fine, quote the path in shell) | `/ba-analyze` deliverables, `bl-proposals-<date>.md`, and **test-design models** — `reports/ba/test-models/<TICKET>-<date>.md`, the artifact `/qa-test` Step 1e now writes (target 80–160 lines, cap 220). Written on the **FULL path only** — required for every Story, Epic and substantial feature, and not built at all on FAST. It is a durable BA deliverable and is deliberately **exempt** from the `/qa-test` terminal-only rule below: a model that cannot be re-opened cannot be argued with, and the parameter model for a surface is reused across tickets. (Being a file also makes it *lintable in principle* — but `npm run model:lint` is **not implemented**, so that is an intention, not a gate; don't cite it as one.) Hand-authored standalone models may also live directly under `reports/ba/<domain>/` (the pre-existing convention). **And release notes** — `reports/ba/release-notes/`, a second named sub-path alongside `test-models/`: a per-ticket **fragment** `<ticket>-<layer>-release-note.md` (15–40 lines, cap 60) written by `ba-doc-writer` `doc_scope: release` when `/qa-test` 5f points at it, plus a per-release **aggregate** `release-<label>.md` (40–80, cap 150) that links the fragments. One fragment per ticket **per layer** — the layer picks the audience (`.claude/knowledge/ba/virto-doc-style.md` §9.1), and it is the one place audience *is* the document, because a release note is read as a single *what shipped* record and splitting it four ways yields files nobody can reconcile. `/qa-test` writes only the machine half (`summary.json.layer` + its `release` block); all prose is `ba-doc-writer`'s, and a refused fragment (`verdict-not-pass` · `layer-unresolved` · `not-deployed` · `not-user-visible` · `no-version`) writes no file at all. **And per-ticket documentation** — the ordinary `reports/ba/<ticket>-<slug>-<audience>-guide.md` guides written by `ba-doc-writer` `doc_scope: ticket-doc` when `/qa-test` **5h** points at it, one file per audience, which are then **published as ONE tracker comment with a section per audience** (`.claude/knowledge/ba/virto-doc-style.md` §10). Not a release note and not in `release-notes/`: it answers *how do I use this*, prints **no version literals**, and may serve more than one audience — the ordinary §1 rule, not §9's one-note-per-layer inversion. An existing guide for the same surface is **amended, never forked**. Same refusals minus `no-version` **and minus `verdict-not-pass`** — a non-`PASS` run *scopes* the guide to its passing paths and names the omitted ones in a mandatory `Not documented` line rather than refusing the whole document; the per-instruction `PASS`-row rule is what keeps an unverified step out, and 5h runs only after a human has transitioned the ticket to TESTED |
| 4 | Regression summary | `reports/regression/REG-*/` | One consolidated report per run |
| 5 | Monitoring summary | `reports/monitoring/MONITOR-*/` | One consolidated report per `/qa-monitoring` (App Insights) run |
| 6 | Per-ticket QA report | `reports/tickets/<Sprint>/<TICKET>/` (or `reports/tickets/<TICKET>/`) | A ticket-scoped audit that has its own standalone value beyond the run that produced it — `/qa-verify-fix`, or a ticket-scoped `/qa-design`/`/qa-accessibility`/`/qa-storybook` run. **Includes `/qa-test`'s own `design-report.md`** when its Step-4 visual lane ran (`visual_surface: true`) — it lands in the ticket folder beside `summary.json`, not in the `qa-design/<slug>-<date>/` tree a standalone `/qa-design` invocation uses, because dispatched from a run it is that ticket's evidence. **Plus `/qa-test`'s `testing-checklist.md`** (Artifact B): on the FAST path `/qa-test` authors no cases and writes no Test Model, so the executed checklist is the run's **only** durable record of what was checked. `/qa-test`'s *other* step artifacts stay terminal-only — see the carve-out below |
| 7 | BL audit report | `reports/knowledge/BL-AUDIT-<date>.md` | One audit-trail report per `/qa-review-bl` triangulation run |
| 8 | Exploratory session report | `reports/exploratory/SBTM-*.md` | One report per `/qa-sbtm` / `/qa-exploratory` charter — read back by later sessions for the 24h duplicate-charter check |
| 9 | Coverage generation report | `reports/coverage/COV-*/` | One consolidated `coverage-generation-report.md` per `/qa-coverage-generation` / `/qa-coverage-gap` run (the run's own intermediate `gap-inventory.json`/`batch-*-results.json` are pipeline working data, not narrative report bloat — §2's cap applies to the markdown digest, not those) |
| 10 | Performance investigation report | `reports/performance/{topic}-investigation-<date>.md` | A standalone performance investigation with findings worth keeping past the session that produced them. Written by **`/qa-perf-measure`** (deployed-env dependency-count / N+1 measurement); ticket-scoped runs may land as a category-6 per-ticket report instead |

## 1a. `reports/bugs/open/` is foldered by severity — and the folder is a VIEW, never the source of truth

```
reports/bugs/
  open/
    critical-high/   Critical · Blocker · P0 · High · P1
    medium/          Medium · Moderate · P2
    low/             Low · P3
    QUESTION-*.md    open design questions — not bugs, not severity-sorted (stay at open/ root)
  fixed/  closed/  rejected/            FLAT — severity is a triage axis on work still to do
  screenshots/                          evidence, never a lifecycle dir
```

Sorted 2026-09-03 across 91 open reports (34 / 33 / 24). The flat directory listed alphabetically, so a P0 revenue leak and a P3 aria-hidden nit sat adjacent and the only question the open backlog is ever read for — *what must ship first* — cost a full read of every file. `Critical`↔`P0`, `High`↔`P1`, `Medium`↔`P2`, `Low`↔`P3` are the repo's existing spellings (`append-test-cases-to-suite.ts` `PRIORITIES`), not a second vocabulary.

Four rules, each of which was a live fork:

- **The severity DECLARED IN THE REPORT is the source of truth; the folder mirrors it.** Every report already states its severity in its title tag (`` `[Medium]` ``, `— P1`) or a `**Severity:**` line, and §3 requires it. So a disagreement between the two is read as a **misfiled folder**, never as a re-grading — and re-grading a bug means editing the report, then moving the file. Nothing derives severity from the path, deliberately: a path-derived grade would make a `mv` a silent severity change.
- **A straddling grade files at the LOWER bucket and says so in the report.** `Low–Medium` → `low/`. The bucket is for scheduling, and over-filing a cosmetic finding into `critical-high/` is what trains everyone to stop reading it — the same reason a `vs. DESIGN` DRIFT advises rather than blocks (`.claude/skills/qa-test/visual-axis.md`).
- **`fixed/` / `closed/` / `rejected/` stay FLAT.** They are history, read by lifecycle and by date, never by "what do we do first"; foldering them would add a hop to every `/qa-verify-fix` move for no reader.
- **Any reader of the bugs tree must walk it RECURSIVELY.** `collectAttributions` (`scripts/lib/defect-attribution.ts`) scanned one level, so nesting alone would have read **zero** `.md` in `open/` and dropped every open bug out of `npm run tc:yield`, `tc:rank`'s proven-catcher guard and `compute-metrics`' `defectDensity` — **silently**, because `open` *is* a known lifecycle dir, so its unknown-directory warning never fires. Fixed with the sort (unit tests `scripts/unit/defect-attribution.test.ts` pin both the recursion and that a severity folder does not become a lifecycle). A new consumer that globs `reports/bugs/open/*.md` has the same bug; use `open/**/*.md`.

**Per-ticket folders may hold more than one file** (e.g. a storybook/a11y/bundle-size audit alongside `/qa-verify-fix`'s own report) because each covers a distinct check run against the same ticket — that is not the same failure as splitting one report across files. Each individual file still obeys its own cap below; don't open a new file for a check that fits inside an existing one in the same folder.

**Two structured per-ticket artifacts are allowed alongside the narrative report, and are NOT counted against its line cap** — both are written by `/qa-verify-fix` (`.claude/commands/qa-verify-fix.md`), which is their contract; this rule exists so the policy and that command agree:

| Artifact | What it is | Rules |
|---|---|---|
| `verification-summary.json` | Small structured verdict record (ticket, verdict, build, deployment, evidence paths) — the `/qa-verify-fix` analogue of `/qa-test`'s `summary.json` | Structured only, no narrative prose. It does not replace the `verification-report.md` narrative (category 6) — write both |
| `evidence.html` | The RED→GREEN evidence page linked from the tracker comment | **Reference the sibling screenshots (`<img src="screenshots/NAME.png">`) — never inline them as `data:` base64 in the committed copy.** A single inlined PNG cost 124 KB on one 124 000-char line, duplicating a PNG already tracked in the same folder byte-for-byte and making the diff unreviewable. Keep the committed page **under ~40 KB**. Base64 self-containment is required only for the *published* Artifact variant, which is never committed |

Line caps in §2 apply to **narrative** files. A generated evidence page is exempt from the line cap but bound by the size + no-inlined-image rules above.

**Do NOT create files for:** per-suite intermediate JSON, coverage working files, standalone screenshot dumps, progress/status markdown, debug logs, investigation notes, per-step screenshots, side-by-side comparisons against prior runs, or anything labeled "draft"/"WIP"/"context". Return those via SendMessage. Evidence screenshots go **inline** in the bug report (not as separate `.md`).

**Not a report category — self-diagnostics artifacts.** The `vc-fix` self-diagnostics subsystem writes to `<outputRoot>/.vc-fix/diagnostics/` — the passive collector's `<session_id>.jsonl` (+ `.state.json`), the `/vc-self-check` `DIAG-*.md`, and the `deliver` `DELIVERY-*.md`. These are **gitignored diagnostic artifacts**, NOT one of the ten report categories above; the `DIAG-*.md`/`DELIVERY-*.md` still obey the monitoring-summary size discipline (§2, target 15–40, cap ~100). They are **ephemeral, not archived**: the lifecycle is log → analyze (`/vc-self-check`) → contribute (`deliver` PR/issue) → **delete**. Once a finding is contributed upstream the PR/issue is the source of truth, so `deliver` removes the processed session's own artifacts (only that session — never others); nothing is deleted when nothing was delivered. So they don't accumulate and need no manual cleanup.

**BL audit report — the receipt, not the source of truth.** `/qa-review-bl` writes `reports/knowledge/BL-AUDIT-<date>.md` — the audit trail of a BL triangulation run (per-BL verdict, 3-axis evidence refs, what was auto-applied to `business-logic.md`, what was routed to `reports/ba/bl-proposals-<date>.md`). The confirmed edits themselves land in the git-tracked `business-logic.md`; the unconfirmed drafts live in the shared `bl-proposals-<date>.md` (a BA-report artifact, category 3) — BL-AUDIT itself is just the log of that run (verdict table + Applied + Not-applied + coverage reconciliation; reference the `git diff` for the oracle change rather than inlining it).

**Terminal-only — `/qa-test-lifecycle` run summary.** The phase summary, changes inventory, coverage delta, quality-gate verdicts, and next steps are presented **directly in the chat response** — never written to `reports/test-lifecycle/` as a `lifecycle-report.md`/`lifecycle-summary.json` file. Nothing downstream reads those files today (CI's `run-full-cycle.ts` already consumes the agent's returned text, not a file on disk), so persisting them only adds tokens with no reader. Any Phase-5 environment-verification screenshots may still land under the gitignored `reports/test-lifecycle/TLC-*/` path, referenced inline from the chat summary by filename — but no narrative `.md`/`.json` is committed. This is the one pipeline output that is display-only; every other category above still writes to disk because a human or a later run needs to re-open it.

**Terminal-only — `/qa-test`'s own step artifacts.** `/qa-test` runs five steps (Context·Story·Test Model → Plan → Write·Review·Provision → Execute → Report — there is **no** separate exploratory step) that used to each write their own file into `reports/tickets/{SPRINT}/VCST-XXXX/` — `ac-analysis.md`, `testing-checklist.md`, `test-execution-report.md`. **Two of the three have since come off this list, each for a reason that stopped being true.**

- **The Step 1e Test Model** is a category-3 artifact at `reports/ba/test-models/<TICKET>-<date>.md`. "Nothing downstream reads it" stopped holding once the model became reusable across tickets and a required deliverable for every Story and large feature. (It is *intended* to be lintable; `npm run model:lint` is not implemented yet, so do not cite it as a live gate.)
- **The Artifact B `testing-checklist.md`** is a category-6 per-ticket file. "Consumed by the Step 4 agent prompts in the same turn" was true when a run also produced a Test Model and new suite rows. It is not true on the **FAST path**, which authors no cases and writes no model: the checklist is then the *entire* record of what the run checked, and terminal-only makes a FAST run unauditable the moment the session ends. It is written at Step 3 and **updated in place at 5e with each item's verdict**, so what is committed is the checklist that ran, not the one that was planned.

`ac-analysis.md` and `test-execution-report.md` stay terminal-only and still have no reader beyond their own run — the AC table is built at Step 1d and reconciled from the orchestrator's own working context at Step 5b, **not** re-read from a file. They are carried in-context and folded into **one** final Step 5 chat report. So what persists to `reports/tickets/{SPRINT}/VCST-XXXX/` is: **`summary.json`** (small/structured — this is what the Step 1b "same ticket tested in the last 2 hours" duplicate-check scans **across all sprints**, so it has to survive the run; it is also the only durable record of the change-scoped regression result the Feature Release Gate reads, and it carries the `timing` block that makes the 40-minute regression window checkable; schema at `.claude/templates/qa-test-summary.schema.json`), **`testing-checklist.md`**, **`design-report.md`** (only when the Step-4 visual lane ran — its narrative half; the machine half is `summary.json.visual`), and **evidence screenshots**. **New test cases are NOT a `/qa-test` narrative artifact and do not land in the ticket folder** — Step 3 appends them straight into `regression/suites/<layer>/<module>/*.csv` as `Automation_Status = Draft` (category 2, Test cases), and 5g flips the promotable ones to `Automated`/`Reviewed` in place after execution (FULL path only, last, non-blocking; reverting non-promotable rows); no run-scoped `reports/tickets/**/test-cases.csv` is written. A ticket-scoped run of a *different* skill against the same ticket (`/qa-design`, `/qa-storybook`, `/qa-verify-fix`) still writes its own category-6 report into the same folder.

**`/qa-checklist` is already terminal-only** — it has never written to `reports/checklists/`; it outputs the unified checklist directly in chat. `reports/checklists/` is a reserved path (documented for a future durable checklist artifact) but has no active writer today.

## 2. Hard Size Caps (lines)

| Report type | Target | Hard cap |
|-------------|--------|----------|
| Clean regression (no failures) | **5–15** | 30 |
| Regression with failures | 40 + 15/failure | 200 |
| Simple UI/copy bug | **30–50** | 80 |
| Functional bug | 50–80 | 120 |
| Cross-layer bug | 80–120 | 150 |
| BA report | 80–150 | 250 (exec summary ≤5 sentences; diagram OR prose, not both) |
| Release note — per-ticket fragment (`reports/ba/release-notes/`) | **15–40** | 60 (one evidence item, never two and never zero; the version/derivation footer is mandatory and counts toward the cap) |
| Ticket documentation — the tracker **comment** (`/qa-test` 5h) | **30–80** | 120 — a **target for a well-written guide, never a licence to truncate one.** `.claude/knowledge/execution/tracker-ops.md` §5d: publishing a deliverable means the deliverable *in full*, and a summary plus a repo path is not a delivery. A body that genuinely will not fit is **split one comment per audience**, never abridged and never replaced by a `reports/ba/` path. Screenshots follow §5c (attach, then a wiki-markup reference — which makes the whole Jira body wiki), not a bare repo path |
| Release note — aggregate (`reports/ba/release-notes/release-*.md`) | 40–80 | 150 (link fragments, never inline them; the `Not included` section is mandatory even when empty) |
| Monitoring summary | **15–40** | 100 (confirmed / needs-review / dismissed tables; reference telemetry by portal link; a truncated top-frames stack — ≤6 lines — is OK for confirmed/needs-review items, but never full multi-frame dumps) |
| Per-ticket QA report (each file in the folder) | 30–60 | 120 (one file per check type; a bug found during the check still files separately to `reports/bugs/`, referenced by link, not inlined) |
| BL audit report | **15–40** | 100 (verdict table + Applied + Not-applied + coverage reconciliation; link the oracle diff, don't inline it) |
| Exploratory session report | **20–40** | 80 (net-new scenarios + bugs found by link + risk areas; skip a scenario list that just restates the suite CSV) |
| Coverage generation report (markdown digest only) | 40–80 | 150 (top gaps + totals by priority/domain/category; link `gap-inventory.json`/batch results, don't inline them) |
| Performance investigation report | 40–80 | 120 |
| Test-design model (`reports/ba/test-models/`) | **80–160** | 220 (Part 0 — value chain + Mermaid diagrams + the variants × links matrix — then the five fault-model parts + the two sweeps; reference an oracle by ID, never inline it. The band is 20 lines wider than the pre-2026-08-28 one because the diagrams are now mandatory and they are the part a reader actually reads; it is not licence for more prose) |
| Testing checklist (`/qa-test` Artifact B, in the ticket folder) | **20–60** | 120 (condition → case → verdict table; on FAST this is the run's only durable record, so an uncovered condition is listed, never omitted) |
| *`/qa-test-lifecycle` / `/qa-test` step artifacts (Test Model **and** testing checklist excepted)* | — | *terminal output only, no file — see §1* |

Over the hard cap is a review failure — trim before merge. If content genuinely doesn't fit, split it: keep the bug at <150 lines and link a separate investigation file.

## 3. Required Sections (everything else is optional)

**Bug report:** Title + severity tag · Env (1 line: env name + build) · Summary (≤3 sentences) · STR (numbered, start from nearest relevant state) · Expected vs Actual · 1–2 inline screenshots · optional BL/ECL refs, root cause.

**Regression summary:** Run ID/date/env/browser/selection · Counts table · Failures section (TC-ID, expected, actual, evidence ref, bug link) · Passes as one comma-separated line · Bugs Found (links only) · Quality Gate verdict.

**Monitoring summary:** Run ID/date/env/window/layers · Signature counts (seen/new/spiking/triaged/deferred) · Confirmed bugs table (severity, layer, signature, repo, draft link, telemetry link) · Needs-review table · Dismissed table (class, signature, oracle) · "no JIRA filed, no fix attempted" footer.

**BA report:** Title + scope + env · Executive summary (≤5 sentences) · One of: architecture diagram OR prose · Findings table (issue, severity, recommendation) · Open questions/follow-ups.

**Release note (fragment):** Title (what changed, ≤12 words) · the `Layer · Audience · Shipped in · Breaking` strip · **What changed** (1–2 sentences in the derived audience's voice) · **What you can now do** (that audience's own skeleton) · **exactly one** evidence item · an optional `!!! note` (**mandatory** on a PASS WITH NOTES verdict) · the footer re-printing every version literal with its probe source, the verdict, the evidence folder, and the layer derivation. Full skeleton: `.claude/knowledge/ba/virto-doc-style.md` §9.2.

**Ticket documentation (the 5h tracker comment):** `## Documentation — {TICKET}` · a 1–2 sentence what-you-can-now-do opener in the reader's words · one section per earned audience, headings fixed and in this order — **For shoppers** (§3 shape) · **For administrators** (§4 shape) · **For developers** (§5 shape) · a footer line carrying the verdict **verbatim** (never laundered), a mandatory `Not documented` line naming every condition omitted because it did not pass (`none` when there are none), the env, the evidence folder and the layer the audiences were derived from — **not** a `reports/ba/` guide path offered as somewhere to go read the rest (`.claude/knowledge/execution/tracker-ops.md` §5d: the comment carries the guides in full). An audience the ticket did not earn is an **absent heading, never an empty one**. Full skeleton: `.claude/knowledge/ba/virto-doc-style.md` §10.2.

**Release note (aggregate):** Label + window · **⚠ Breaking changes first** whenever any fragment carries one · per-audience sections (one line + a link per fragment) · **`Not included`** — every ticket in the window whose fragment was refused, with its reason (mandatory; an omitted section is indistinguishable from a clean window) · one `Upstream cross-check` line against the release ledger, which may note a ledger row with no fragment but may **never** say "missed" or quote a coverage percentage.

**Per-ticket QA report:** Ticket ID + title + check type (execution / AC-analysis / a11y / storybook / bundle-size / …) · Env (1 line) · Summary (≤3 sentences) · Findings/checks table · Verdict (PASS/FAIL/PARTIAL) · Bugs filed (links only, not inlined).

**Testing checklist (`/qa-test` Artifact B):** Ticket ID + **path (fast/full)** + Env (1 line) · the condition → covering case → verdict table (PASS / FAIL / BLOCKED / NOT-RUN, with an evidence ref) · **the visual conditions when `visual_surface: true`** — one row per applicable `BL-A11Y-*`/`BL-UI-*` invariant plus the design-system and `vs. DESIGN` axes, a `SKIPPED` one carrying its reason (`.claude/skills/qa-test/visual-axis.md`) · **uncovered conditions, listed explicitly** · **any finding held below the 5d severity floor (`Low`/P3, not filed to the tracker), with its `reports/bugs/open/low/` draft path** · evidence folder path. A condition with no covering case is the finding — dropping the row instead of marking it uncovered is what makes a checklist look complete when it is not. The same reasoning covers the below-floor findings: on FAST this file is the run's only durable record, so a `Low` that appears in neither the checklist nor a bug draft has been deleted rather than deprioritized.

**BL audit report:** Run ID/date/scope (all / domain / BL-ID / diff) · Per-BL verdict table (CONFIRMED / DRIFT / MISSING / CONTRADICTORY / RETIRE, with the 3-axis evidence ref) · Applied section (what changed in `business-logic.md`, link the diff) · Not-applied section (link `bl-proposals-<date>.md`) · Test-case coverage reconciliation.

**Exploratory session report:** Charter + duration · Discovery technique/heuristic used (SFDPOT/CRISP) · Net-new scenarios discovered (mandatory) · Bugs found (links only) · Risk areas identified.

**Coverage generation report:** Run ID/date/scope · Gaps found (count by priority/domain/category) · Cases generated (count + suite links, not case bodies) · Validation pass results (if run) · Quality-gate verdict.

**Performance investigation report:** Title + scope + env (1 line) · Metric summary (threshold vs actual, or before/after) · Root cause · Recommendation.

**`/qa-test-lifecycle` / `/qa-test` terminal summary (chat response, not a file):** Run/ticket label · date/scope (for `/qa-test`, the fast/full path) · Phase or step summary (one line each; skipped steps marked skipped, not omitted) · Findings folded in from every step (AC coverage, checklist gaps, execution + change-scoped regression results) · Verdict · Next steps. Same content shape as the other summaries — it's just delivered in chat instead of committed to disk.

## 4. Cut These Bloat Patterns

Real examples from recent reports (BUG-IMP-049 at 315 lines vs 150 target; BA-VCST-4642 at 237):

| Pattern | Fix |
|---------|-----|
| Build/env table with 6+ rows | One line: `Env: vcst-qa @ Platform 3.1026.0, Theme 2.49.0-pr-2280` |
| Mermaid diagram + paragraph saying the same thing | Pick one |
| Executive summary > 5 sentences | ≤5 sentences, lead with the finding |
| Full API JSON response (50+ lines) | Quote the 2–3 fields that matter |
| 5+ screenshots for one bug | 1 bug state + 1 context max |
| STR starting from "Open homepage" for a checkout bug | Start from `/cart` with seeded data |
| Investigation log inside the bug report | Drop it; root cause in 2 sentences |
| "Comparison vs previous run" table | One sentence: "Same blocker as REG-X, different root cause." |
| Layer-validation table that restates the Summary | Delete the table |
| Glossary / "context" / "background" sections | Delete |
| Duplicate operator/credentials table | Reference the alias: "Operator: `@td(SUPPORT_AGENT)`" |

## 5. Screenshot Rules

**Always capture:** test FAILs, confirmed bugs (annotated), visual regressions (before/after), final state of critical flows (checkout confirmation, order created), Figma deviations, error states (console error, 500 toast).

**Skip:** every navigation step in a passing test, loading spinners, login page (unless testing auth), successful form fills mid-flow, same page across browsers when all pass, redundant confirmations of the same bug.

**Per-scope budget:**

| Scope | Target | Max |
|-------|--------|-----|
| Test case (pass) | 0–1 (final state if critical) | 2 |
| Test case (fail) | 1–3 | 4 |
| Bug report | 1–3 | 5 |
| Regression suite (20+ tests) | failures + 1 summary per area | 15–20 |
| Exploratory session | anomalies only | 10 |

**On a `/qa-test --iterate` run every round stamps `-r{N}`, round 1 included.** Round N+1 re-runs the
**same** case IDs into the **same** folder, so an unstamped name means the round-2 PASS overwrites the
round-1 FAIL — and the checklist's `Round 1: FAIL → Round 2: PASS` row then points at an image showing
green, which is worse than a missing file because it silently contradicts the record. Stamping *every*
round rather than only round ≥2 avoids the "did round 1 stamp or not" ambiguity when a reader resolves
an evidence ref. This is the append-only checklist rule applied one layer down, and for the same
reason: the RED→GREEN transition is what the loop is for, so the RED must survive it.

**Retention:** Regression/test-lifecycle/coverage screenshots under `reports/regression/REG-*/`, `reports/test-lifecycle/TLC-*/`, `reports/coverage/COV-*/` are gitignored — disposable artifacts referenced from the permanent markdown. Bug evidence (`reports/bugs/screenshots/`) and per-ticket evidence (`reports/tickets/SprintXX-XX/VCST-XXXX/screenshots/`, `reports/tickets/VCST-XXXX/screenshots/`) stay tracked.

## 6. Console & Network Evidence

**Console — capture:** specific error messages tied to the test/bug. **Skip:** full console dumps, benign Vue warnings, favicon 404s, analytics events.
Example good: `Console Error: "Unhandled promise rejection: TypeError: Cannot read property 'price' of undefined at ProductCard.vue:47"`

**Network — capture:** 4xx/5xx, requests with `errors[]` in response, requests >2s. **Skip:** every successful 200, full HAR contents.
Format: `Failed: POST /graphql (SearchProducts) → 500 Internal Server Error`

**HAR files:** captured automatically by browser config, stored as **named `*.har` files inside** `test-results/{browser}/har/` (gitignored) — e.g. `test-results/firefox/har/session.har`. Reference by filename — never inline the data. Note: the HAR is **per-browser-lane, not per-run** — every suite on a browser writes to the same lane archive, so it is not a reliable per-failure record. The per-FAIL trace below is what isolates a single failure.

> **The `recordHar.path` must end in `.har`.** Playwright treats `recordHar.path` as a *file* path, not a directory. All three `config/mcp-playwright-*.config.json` files pointed it at `./test-results/{lane}/har` (no extension), so Playwright wrote each archive to a file literally **named `har`** — real data (1.2–1.4 MB per lane), but invisible to every `*.har` glob, so tooling and reviewers concluded HAR capture was disabled. Fixed 2026-07-30 to `./test-results/{lane}/har/session.har`; the strays were preserved as `session-legacy.har`. `scripts/lib/regression-triage.ts` `harPathForBrowser()` now resolves to the newest concrete `*.har` file and falls back to the lane directory, so a triage issue references something openable. **MCP config changes need a server restart before they take effect.**

**Failure trace (real FAIL only):** on a real `FAIL` — never `BLOCKED`/`SKIPPED`/`AMBIGUOUS` — the runner writes `reports/regression/{RUN_ID}/traces/{TC-ID}-FAIL-trace.json` (kept **with** the run report, linked from the HTML dashboard, gitignored). It carries the isolated `networkFailures[]` (4xx/5xx + GraphQL `errors[]`, with request/response body snippets) and `consoleErrors[]` **with full stack traces parsed into frames**. Secrets (Authorization/token/password/PAN) are redacted before writing — the repo is public. Schema + capture rules: `.claude/agents/test-runner-agent.md` §Failure trace file. Don't duplicate the trace contents into the markdown — reference the file.

## 7. Naming Conventions

```
Screenshots:
  {TC-ID}-FAIL-{description}.png      → TC-004-FAIL-cart-total-wrong.png
  {TC-ID}-FAIL-r{N}-{description}.png → TC-004-FAIL-r1-cart-total-wrong.png   (--iterate runs ONLY, every round incl. r1)
  {TC-ID}-{description}.png           → TC-001-checkout-confirmation.png
  BUG-{short-name}-{detail}.png       → BUG-price-display-configurable.png
  {component}-{state}-{viewport}.png  → product-card-hover-mobile.png

Failure traces (real FAIL only):
  {TC-ID}-FAIL-trace.json            → SMK-008-FAIL-trace.json  (in traces/)

Reports:
  Bug:           BUG-{Short-Description}.md   (in reports/bugs/open/{critical-high|medium|low}/ — §1a)
  Ticket check:  {check-type}-report.md  (inside reports/tickets/<Sprint>/<TICKET>/ — /qa-verify-fix, /qa-design, /qa-storybook, etc.; /qa-test writes only the checklist + summary.json, see below)
  Verify-fix:    verification-report.md + verification-summary.json + evidence.html  (the /qa-verify-fix triple, same folder)
  BL audit:      BL-AUDIT-YYYY-MM-DD.md  (inside reports/knowledge/)
  Exploratory:   SBTM-{charter}-YYYY-MM-DD.md  (inside reports/exploratory/)
  Coverage:      coverage-generation-report.md  (inside reports/coverage/COV-YYYY-MM-DD-HHMM/)
  Regression:    {suite-name}-report.md  or  regression-YYYY-MM-DD.md
  Investigation: {topic}-investigation-YYYY-MM-DD.md  (reports/performance/ for perf topics, else standalone — separate from bug)

  Testing checklist: testing-checklist.md  (inside reports/tickets/<Sprint>/<TICKET>/ — /qa-test Artifact B)
  Test model:    <TICKET>-YYYY-MM-DD.md  (inside reports/ba/test-models/ — /qa-test Step 1e, FULL path)
  Ticket docs:   <ticket-lowercase>-<slug>-<audience>-guide.md  (inside reports/ba/ — the /qa-test 5h guides; the comment itself is not a file)
  Release note:  <ticket-lowercase>-<layer>-release-note.md  (inside reports/ba/release-notes/ — the per-ticket fragment)
  Release aggregate: release-<slugified-label>.md             (same folder — e.g. release-Sprint-42.md, release-platform-3.1054.0.md)

Terminal-only, no file: `/qa-test-lifecycle` (labeled TLC-YYYY-MM-DD-HHMM in chat) and `/qa-test`'s
ac-analysis + test-execution-report (both fold into one chat report). Persisting from `/qa-test`:
summary.json + testing-checklist.md + screenshots to reports/tickets/<Sprint>/<TICKET>/; the Test Model
to reports/ba/test-models/; new test cases to regression/suites/ as category 2, not the ticket folder.
```

## 8. Reference, Don't Inline

| Artifact | Lives at | Cite as |
|----------|----------|---------|
| HAR files | `test-results/{browser}/har/` | "HAR: `checkout-2026-05-21.har`" |
| Failure trace (real FAIL) | `reports/regression/{RUN_ID}/traces/{TC-ID}-FAIL-trace.json` | Link from the case row; don't inline the JSON |
| Full screenshot set | `reports/bugs/screenshots/` | Link 1–2 inline; reference the folder |
| Test data | `test-data/aliases.json` | `@td(ALIAS.field)` — don't paste rows |
| BL/ECL invariants | `knowledge/oracles/business-logic.md` | Cite the ID (`BL-AUTH-005`), not the body |
| Prior runs | `reports/regression/REG-*` | Link by run ID, don't recap |
| Coverage gap inventory / batch results | `reports/coverage/COV-*/gap-inventory.json`, `batch-*-results.json` | Reference by `GAP-*` ID or batch letter, don't inline the JSON |

## 9. Retention

Report categories don't accumulate forever — each has a lifecycle:

- **Ephemeral run folders** (`reports/regression/{REG-*,SMOKE-*}`, `reports/test-lifecycle/TLC-*`,
  `reports/coverage/COV-*`, `reports/monitoring/MONITOR-*`) are **already gitignored** (`.gitignore:111`
  + the evidence-extension rules) — they only ever exist as local disk usage on whoever ran them, never
  in git history. They age out locally via `npm run reports:prune -- --apply` (default 30 days; the run
  date is parsed from the `RUN-YYYY-MM-DD-HHMM` folder name).
- **Git-tracked report folders** (`reports/tickets/<Sprint>/<TICKET>/`) age out the same way via
  `npm run reports:prune -- --target=tracked --apply` — `git rm` + one commit, gated by the last commit
  date on that path (not filesystem mtime). The current sprint is always skipped regardless of age.
- **`vc/shared/archive/sprints/`** (VC-internal, not one of the ten categories above, but the single
  largest tracked report-like tree in the repo) is pruned by the same `--target=tracked` run.
- **Durable categories never prune**: `reports/bugs/`, `reports/ba/` (**including `release-notes/`** —
  a release note is the record of what shipped, so it outlives every run that produced it; do not add
  a prune rule for it), `reports/knowledge/`,
  `regression/suites/` (Test cases), and `reports/exploratory/` (kept for its own 24h duplicate-charter
  check — revisit only if it grows unbounded).

Tool: `scripts/maintenance/prune-old-artifacts.mjs` (dry-run by default; `--apply` to act; `--target=local`
is the default, `--target=tracked` must be named explicitly before anything git-tracked is touched).
