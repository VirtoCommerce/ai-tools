# `/qa-docs` sprint mode — release notes, slides, film — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/qa-docs <sprint>` lets anyone in the team produce, by one multi-select question, the sprint's release notes, a Slides deck (PowerPoint-exportable) and/or a ≤90 s Motion film of the approved key stories, in the configured corporate style.

**Architecture:** Prompt-only change to the `qa-docs` skill: one new supporting file `sprint.md` carries the whole sprint flow; `SKILL.md` only routes to it; every agreed knob lives in a tracked `config/qa-docs.json`. Capture walks are dispatched to lane specialists; artifacts are built in the main session.

**Tech Stack:** Claude Code skill Markdown; JSON + JSON Schema (draft 2020-12, as `config/test-suites.schema.json`); claude-artifacts Slides / Motion / Design System types; Playwright MCP lanes; Jira (Atlassian connector).

**Spec:** `docs/superpowers/specs/2026-11-20-qa-docs-sprint-slides-film-design.md` — read it whole before Task 1; section numbers below (§3.0 …) are the spec's.

## Global Constraints

- English for every slide, note, caption and file the mode writes (spec §2; `config/qa-docs.json` `language: "en"`).
- No status badge and no "Captured on <stand> · <date>" on screen; stand, capture date, QA state go to speaker notes / the film artifact's description (spec §2 anti-goals).
- Versions printed exactly as probed, prerelease suffix kept (`rules.md` §Shipped in).
- Film ≤ 90 s and ≤ 10 stories (`film.maxSeconds: 90`, `film.maxStories: 10`).
- No hex value, font name or brand asset written into any prompt file — only config keys (GOLDEN RULE, `.claude/rules/test-data.md`).
- No script ⇒ no unit test (`.claude/knowledge/execution/when-to-write-a-test.md`). Gates: `npm run context:check` and a one-off schema check of the config.
- `SKILL.md` stays under BUDGET-004 (19,000 chars). Supporting files are exempt but are read whole by the step that needs them — keep `sprint.md` to the flow, no rationale (rationale stays in the spec).
- Old invocations unchanged: `/qa-docs <TICKET>`, `--video`, `release --sprint <S>` / `release --version <V>` with no new flag (spec §3, backward compatibility).
- Product-context rule: `kb_ask` before walks, `kb_confirm`/`kb_dispute`/`kb_capture` after; VirtoOZ before any behaviour sentence not copied from a ticket document (`CLAUDE.md` §Essential Rules).
- Work on a new branch from `main` (`feat/qa-docs-sprint-mode`); the current branch `test/VCST-6571-Side-Builder` carries unrelated changes. Commit only after the operator has said to.

## Review Focus

1. **The sprint argument in another spelling, or one Jira does not know** (`sprint26-22`, `Sprint26-22`, `26-22`, a typo) — expect: tried as `Sprint NN-NN`, then the literal; none found ⇒ list the project's sprints whose name contains the digits and ask, never "no tickets". Pinned in Task 2 (§Resolve).
2. **A sprint with more than 100 tickets** (Sprint 26-22 had 195) — expect: every page fetched (`nextPageToken` until `isLast`), the count stated. Pinned in Task 2 (§Resolve).
3. **No candidate survives the approval, or the person cuts every story** — expect: no empty deck or film is created; release notes (if chosen) still written; the run says why. Pinned in Task 2 (§Approval).
4. **A stand that does not answer the probe** (down, VPN, 401) — expect: that stand marked unreachable in the table, the run goes on; never a crash and never "not deployed". Pinned in Task 2 (§Stands).
5. **The documentation comment's attachments include GIFs or other files** — expect: PNG/JPEG stills only for slides and film; GIFs and others skipped and counted, never converted into frames. Pinned in Task 2 (§Material).

---

### Task 0: Branch and spec

**Files:**
- Commit: `docs/superpowers/specs/2026-11-20-qa-docs-sprint-slides-film-design.md`, this plan

- [ ] **Step 1:** `git worktree add ../ai-tools-qa-docs-sprint -b feat/qa-docs-sprint-mode main`, then copy the two docs into the same paths there; all later tasks run in that worktree (the current checkout's uncommitted changes stay untouched). Expected: `git -C ../ai-tools-qa-docs-sprint status --short` lists only the two docs.
- [ ] **Step 2: Commit** (operator's go) — `docs(qa-docs): sprint mode design and plan`.

### Task 1: Customization points — `config/qa-docs.json`

**Files:**
- Create: `config/qa-docs.json`, `config/qa-docs.schema.json`
- Modify: `.gitignore` (add `.superpowers/`)

**Interfaces:**
- Produces: config keys read by `sprint.md` — `language` (string), `style.designSystem` (string URL or `""`), `film.maxSeconds` (integer), `film.maxStories` (integer), `candidates.include` (array of rule objects), `candidates.exclude` (array of rule objects), `slides.layout` (string id), `slides.layouts` (object id → description of the layout's regions).
- Rule object: `{ "types": [string], "statuses"?: [string], "priorities"?: [string], "importantUpdate"?: true, "internalTask"?: true, "label": string }` — `label` is the human reason shown in the approval table.

- [ ] **Step 1: Write the schema** — draft 2020-12, `additionalProperties: false` at every level, all keys above required except `statuses`/`priorities`/`importantUpdate`/`internalTask`; `film.maxSeconds` `minimum: 10`, `film.maxStories` `minimum: 1`; `style.designSystem` `anyOf` empty string or `format: uri`.
- [ ] **Step 2: Write the config** with spec §5a defaults: `language: "en"`, `style.designSystem: ""`, `film: {maxSeconds: 90, maxStories: 10}`, include = `[Story in Tested/Done]`, `[Bug,Task priority High/Highest]`, `[Bug,Task importantUpdate]`; exclude = `[TechDebt]`, `[Spike]`, `[Review task]`, `[Task internalTask]`, `[any type status Cancelled]`; `slides.layout: "story-a-why-who"` with its regions: eyebrow, title, why, changes (3–4), who, screenshot, versions, notes.
- [ ] **Step 3: Verify** — `node -e "const A=require('ajv/dist/2020').default,f=require('ajv-formats');const a=new A({allErrors:true});try{f(a)}catch{};const v=a.compile(require('./config/qa-docs.schema.json'));console.log(v(require('./config/qa-docs.json'))||v.errors)"` → `true`. If `ajv-formats` is absent, drop the `format` keyword rather than add a dependency. Then a broken copy (`maxStories: 0`) → prints an error. Nothing is committed from this check.
- [ ] **Step 4: Commit** — `feat(qa-docs): config/qa-docs.json customization points`.

### Task 2: `sprint.md` — the sprint flow

**Files:**
- Create: `.claude/skills/qa-docs/sprint.md`

**Interfaces:**
- Consumes: Task 1 keys; `release.md` §Aggregate; `media.md` §Capture steps 2–6 and §Film; `rules.md` §Shipped in, §Truth guardrail, §Payload hygiene; `vc-test:ticket-context`; `npm run creds:check -- <env>`; Slides type (`3e9dc3d6-8a10-4143-ac0b-5af4f2b03a61` is the catalog slug — look it up with `list_types`, never hard-code it); Motion type.
- Produces: the sprint record `reports/ba/release-notes/release-<label>.json` with keys `sprint`, `jira_sprint`, `chosen` (`notes`/`slides`/`film` booleans), `preflight` (capability → `ok` | reason), `stories[]` (`key`, `title`, `stand`, `versions`, `material` = `disk` | `jira` | `walk`, `outcome` = `shown` | `not-included: <reason>`, `qa_state`), `slides` (`slug`, `url`, `owner`), `film` (`slug`, `url`, `owner`, `exported`), `runs[]` (`date`, `runner`: `same` | `other` relative to the artifacts' owner — no person's name is stored).

Sections, in this order, each a short numbered procedure (spec section in brackets):

- [ ] **Step 1: §Resolve** [§3 step 1] — argument parsing (Review Focus 1), JQL with sub-tasks excluded, pagination (Review Focus 2), `JIRA_PROJECT_KEY` from env.
- [ ] **Step 2: §Preflight** [§3.0] — the six-row capability table verbatim from the spec, and the one-block "this run can produce …" message.
- [ ] **Step 3: §Ask** [§3 step 2] — one multi-select question (Release notes · Slides · Film); flags `--notes --slides --film` pre-answer it; none ⇒ stop, write nothing.
- [ ] **Step 4: §Candidates** [§3.1] — apply `candidates.include` / `exclude` from config; "internal Task" = no PR in a product repo (via `ticket-context`); "important update" = the three tests of spec §3.1.
- [ ] **Step 5: §Stands** [§3.2 + stands-and-writes paragraph] — build per story, probe each known stand, unreachable ⇒ marked, run continues (Review Focus 4); client stands never candidates; writes only on writable stands.
- [ ] **Step 6: §Approval** [§3 step 6] — table columns: story · why it is a candidate (rule `label`) · build needed · stands found · stand chosen · material source; one question; re-probe the chosen stand; zero approved ⇒ no artifact (Review Focus 3); > `film.maxStories` ⇒ ask which for the film.
- [ ] **Step 7: §Material** [§3.3] — the three-source order disk → Jira attachments → walk; the attachment download asked once per run with tickets and file count; stills only (Review Focus 5); the walk brief to lane specialists (fields from spec §3 "Where it runs") and what they return; `kb` and VirtoOZ steps; "Why" line rule.
- [ ] **Step 8: §Release notes** [§4.1] — call `release.md` §Aggregate, add the *Shown on slides / film, no ticket document* group and the link line.
- [ ] **Step 9: §Slides** [§4.2] — design system from `style.designSystem` (unreadable ⇒ ask neutral or stop); cover, Breaking, one slide per story in `slides.layout`, Not included; speaker-notes content; tell the person: *Share › Export › PowerPoint*, not "slides as pictures".
- [ ] **Step 10: §Film** [§4.3] — Motion artifact via `media.md` §Film with the sprint structure and caps from config; style from the design system tokens (installed if the Motion type allows, else read at run time — never re-typed).
- [ ] **Step 11: §Records and re-run** [§4.4] — the sprint record above; same owner ⇒ republish, other runner ⇒ new artifacts, record keeps both; resume after approval from the record.
- [ ] **Step 12: Verify** — `npm run context:check` → no new error for `sprint.md` (dangling paths, missing `§` headings). Then `grep -nE "#[0-9A-Fa-f]{6}|Montserrat|Inter\b|Lato" .claude/skills/qa-docs/sprint.md` → no match (no brand value in the prompt). And each Review Focus line is findable: `grep -n "nextPageToken\|unreachable\|GIF\|no artifact\|Sprint NN-NN" .claude/skills/qa-docs/sprint.md` → 5 hits.
- [ ] **Step 13: Commit** — `feat(qa-docs): sprint mode flow (sprint.md)`.

### Task 3: Route to the sprint mode from `SKILL.md`

**Files:**
- Modify: `.claude/skills/qa-docs/SKILL.md` (frontmatter `description`, `argument-hint`; line 15 "dispatches no subagent"; §Invocations table)

**Interfaces:**
- Consumes: `sprint.md` (Task 2).

- [ ] **Step 1:** `argument-hint` gains `| <sprint> [--notes] [--slides] [--film]`; `description` gains one clause: "`/qa-docs <sprint>` makes the sprint's release notes, a Slides deck and/or a film of its key stories". Keep the "Not for …" clause.
- [ ] **Step 2:** Line 15 — append: "except the sprint mode, which dispatches its capture walks to lane specialists ([`sprint.md`](sprint.md))".
- [ ] **Step 3:** §Invocations — new row `/qa-docs <sprint>` · `--notes` `--slides` `--film` → "the sprint mode: [`sprint.md`](sprint.md)"; one sentence under the table: an argument that is not a ticket key and names a sprint (`sprint26-22`, `Sprint 26-22`) is the sprint mode; `release --sprint <S>` alone keeps today's behaviour.
- [ ] **Step 4: Verify** — `npm run context:check` → passes; `wc -c .claude/skills/qa-docs/SKILL.md` < 19000.
- [ ] **Step 5: Commit** — `feat(qa-docs): route a sprint argument to sprint.md`.

### Task 4: Supporting files point at the sprint mode

**Files:**
- Modify: `.claude/skills/qa-docs/release.md` (§Aggregate), `.claude/skills/qa-docs/media.md` (§Film), `.claude/skills/qa-docs/rules.md` (§Evidence bar)

- [ ] **Step 1:** `release.md` — one paragraph: in the sprint mode the aggregate also carries the *Shown on slides / film, no ticket document* group (between *What's new* and *Not included*) and a Slides / Film link line; the plain `release` invocation does not.
- [ ] **Step 2:** `media.md` §Film — one line: "A sprint film: [`sprint.md`](sprint.md) §Film." §Capture unchanged.
- [ ] **Step 3:** `rules.md` §Evidence bar — one paragraph, verbatim intent of spec §6: in the sprint mode a story without a document is shown only as observed on a stand by the capture walk, its QA state in the notes; a step that differs on the stand is not shown.
- [ ] **Step 4: Verify** — `npm run context:check` → passes.
- [ ] **Step 5: Commit** — `docs(qa-docs): release, media and rules point at the sprint mode`.

### Task 5: The Virto design system (first value of `style.designSystem`)

**Files:**
- Modify: `config/qa-docs.json` (`style.designSystem`)

- [ ] **Step 1:** Ask the operator before downloading `https://virtocommerce.com/images/logo-bold.svg` (filename, source, size). On yes, save it to the scratchpad.
- [ ] **Step 2:** `list_types` "Design System" → `create_from_type` titled `Virto`; fill it as its type's instructions say: colours from the logo's fills (read from the SVG, not typed from this plan), the logo as an asset, provisional typefaces with Cyrillic coverage, a README line "provisional — replace from the brand book".
- [ ] **Step 3:** Put its link in `config/qa-docs.json` `style.designSystem`; re-run Task 1 Step 3's check → `true`.
- [ ] **Step 4:** Tell the operator it is private to its creator and that sharing it org-wide is theirs to do (spec §5, deferred decision).
- [ ] **Step 5: Commit** — `feat(qa-docs): Virto design system as the default style`.

### Task 6: End-to-end check on Sprint 26-22

- [ ] **Step 1:** Run `/qa-docs sprint26-22` in this checkout. Expected: sprint resolved to `Sprint 26-22`, 195 tickets, preflight block, the multi-select question.
- [ ] **Step 2:** Choose *Release notes* + *Slides*; approve a table cut to the three documented stories (VCST-6157, VCST-6158, VCST-6597). Expected: material source `jira` for each (their frames are not on disk); one download question.
- [ ] **Step 3:** Expected outputs: `reports/ba/release-notes/release-Sprint26-22.md` regenerated with the new group and link line; `release-Sprint26-22.json` record; a Slides deck of 5 slides (cover, 3 stories, Not included) in the Virto style, English, no badges. Open it and export to PowerPoint: text editable.
- [ ] **Step 4:** Re-run with the same choices. Expected: the same deck republished, not a second one (record `runs[]` has two entries).
- [ ] **Step 5:** Delete the 2026-11-20 spike deck (`https://claude.ai/artifact/12bXjPGTrVjiRuPQdKZZ5r`) only on the operator's yes.
