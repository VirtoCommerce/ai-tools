# vc-test P2-5c — `qa-design`, `ui-ux-expert` and `visual-axis.md` in the plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a client install with no ai-tools checkout, the visual lane that floors F3 and F8 require has an agent,
a methodology and the measurement code it runs. The `qa-design` skill, the `ui-ux-expert` agent and
`.claude/skills/qa-test/visual-axis.md` move into `plugins/vc-test/`. This repository keeps `/qa-design` as a thin
command. vc-test reads no `.claude/` document any more: DOC-009 goes from 5 to 2, and the two that remain are
mentions, not reads. Released as vc-test 0.12.0.

**Architecture:**
- **The visual lane moves to Playwright and takes its lane from the pool.** `.claude/rules/vc-browser.md` is the
  rule `vc-init` writes into every client project, and it bans Chrome DevTools MCP. A visual lane gated on
  `mcp:chrome-devtools` therefore can never run there. `vc-init` enables only `playwright-chrome` by default
  (`gen-mcp.mjs:441`), so a lane fixed to edge would hit the same dead end. The visual lane therefore draws from the
  same pool as the browser scenarios, edge first. Sign-in uses the password NAME, which the lane resolves from
  vc-secrets. Lighthouse is dropped because it has no Playwright equivalent; axe stays. A DevTools lane behind a
  vc-secrets proxy is a separate vc-init plan; once that proxy exists, adding it back is one more pool entry.
- **The measurement code becomes a generated plugin library.** `scripts/lib/measure-layout.ts`,
  `scripts/lib/verify-design-spec.ts` and `scripts/layout/design-spec-extract.ts` are bundled with esbuild into
  `plugins/vc-test/lib/design/*.mjs`. One generator writes the bundle and a `--check` mode fails on drift
  (CLAUDE.md GOLDEN RULE: generator plus drift gate, never a hand copy). vc-fix's stale fork of `measure-layout.ts`
  is not used.
- **One skill, two entry points.** As in P2-5b B2, the command's body becomes the skill's `SKILL.md` and the old
  skill body becomes `methodology.md`. Here the agent also loads the skill, so `SKILL.md` opens with a fork:
  - dispatched as `vc-test:ui-ux-expert`: read `methodology.md` and run your brief;
  - invoked to evaluate a target: run Steps 1–5 below.
- **The prompts are split to fit the 19,000-char budget.** Sections a step reads only when it runs move into
  supporting files under `skills/qa-design/`. Supporting files are exempt from the cap, and the agent finds them
  through the skill's base directory, because it loads the skill first.

**Tech Stack:** Markdown prompts; esbuild (already installed through `tsx`) driven by one Node ESM generator; one
small hand-written Node CLI (`lib/design/snippet.mjs`); JSON (`lib/artifacts.json`); one regex in
`skills/qa-test-strategy/lib/floors.mjs`.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U56 (`ui-ux-expert` moves with
`qa-design`, or the visual lane F3/F8 require has no agent on a client), line 381 (`qa-design/` and `ui-ux-expert`
are moved canonical copies), U2 (deleted from `.claude/` in the same phase), U3 (adapters), U28 (evidence on failure
only), §10 P2. The P2-5 split and the owner's binding answers ("skills move, commands stay … as thin shims"; "code
consumers keep the repository's half"): [`2026-10-27-vc-test-p2-5a-verdict-and-reads.md`](2026-10-27-vc-test-p2-5a-verdict-and-reads.md) §P2-5 is five plans.
The survey this plan is built on (section sizes, every external read, every caller) is in the session scratchpad
and is summarized in the decisions below.

## Decisions this plan makes (confirm at review)

| # | Question | Decision |
|---|---|---|
| C1 | **Browser lane: conflicts with a tracked rule.** `.claude/rules/agents.md:103`, `templates/agent-dispatch.md:58`, `visual-axis.md` §4 and the plugin say `ui-ux-expert` uses Chrome DevTools MCP. `.claude/rules/vc-browser.md` (tracked here, and written into every client project by `vc-init`) says all browser work goes through `mcp__playwright-<lane>__*`, and that a plugin naming another browser yields | **Playwright wins (owner, 2026-10-27, after discussion).** The lane **comes from a pool**, because `vc-init` enables only `playwright-chrome` on a client (`gen-mcp.mjs:441`). `artifacts.json` `visual`: `"lane": null`, `"lanes": ["browser:playwright-edge", "browser:playwright-chrome", "browser:playwright-firefox"]`, `"requires": ["front-url"]`. Edge comes first because a run's scenarios reach it last; their pool starts at chrome. `plan-run.mjs`: a RUN row whose entry has `lanes` gets a `pool` (the lanes whose `mcp:<name>` the install has) exactly as a browser proof does. An empty pool is an error that names the lanes it needs, and wave placement is unchanged: ≤ 3 browser entries per wave, never two on one lane. `floors.mjs` `ARTIFACT_NEEDS["Visual lane"]` is `lacks(c, /playwright/i, "a browser lane (mcp:playwright-*)")`, the same as Exploratory, with `floors.md:41-44` to match. `qa-ticket.md:45` drops `chrome-devtools` from the probe, and `:115` says "on the lane `plan-run` assigned". `agents.md` and `agent-dispatch.md` rows name `vc-test:ui-ux-expert` on "a Playwright lane (the run assigns it)". **Lighthouse is dropped**: `lighthouse_audit` exists only in DevTools. Accessibility is axe only (`wcag-accessibility-checklist.md` Recipe 1). Measurement snippets run through `browser_evaluate`, which `enforce-real-user.mjs` allows for `getComputedStyle`, `getBoundingClientRect`, `axe.run` and the rest of its allowlist (identical in vc-fix). `ui-kit-class.md:176-177` ("`browser_evaluate` is blocked on the Playwright lanes") is corrected in both copies |
| C2 | Sign-in on the lane | `ui-ux-expert` §Signing the lane in is **rewritten to `vc-browser.md` §Signing in**: type the login as plain text from the env (`USER_LOGIN`, …) and the password's bare NAME (`USER_PASSWORD`, …) into `browser_type`. The DevTools persistent profile and the "mint an account, no `--secrets`" path are deleted, and so is `visual-axis.md` §2's "the brief MUST carry a NAMED auth path (no `--secrets` on this lane)". A dispatch brief names the lane and the account role |
| C3 | The TypeScript measurement code | **A generated bundle** `plugins/vc-test/lib/design/{measure-layout,verify-design-spec,design-spec-extract}.mjs`, written by `scripts/maintenance/build-vc-test-design.mjs`: esbuild, `format: "esm"`, `platform: "node"`, `bundle: true`, no minify, sources as above. Every file opens with the banner `// GENERATED from <source> by npm run vc-test:design — do not edit; the TypeScript is canonical`. `design-spec-extract.mjs` keeps its CLI (same arguments as `npm run design:extract`). npm scripts: `vc-test:design` (writes) and `vc-test:design:check` (exits 1 and names each stale file). The check is added to `npm test` the same way `docs:index:check` runs there. The repository's TypeScript and its `npm run design:extract` are untouched (owner: code consumers keep the repository's half) |
| C4 | Getting a snippet string | **`plugins/vc-test/lib/design/snippet.mjs`**, hand-written: `node snippet.mjs <exportName> [arg…]`. It prints the string the named export returns (a function ending `Snippet`, `propertyAuditSnippet` included) or holds (`LAYOUT_SNIPPETS.<key>`, `COLOR_MATH_JS`, `EFFECTIVE_BG_JS`, `FOUC_SNIPPET`). An arg is JSON, and `@<file>` reads JSON from a file (a `DesignSpec`). An unknown name exits 2 and lists the valid names. Today no CLI prints a snippet even here: the agent has to `npx tsx -e` an import. Under this plan the plugin and this repository use the same printer |
| C5 | BL-UI without `bl:extract` | **A generated `plugins/vc-test/knowledge/bl-ui.md`** from the same generator (C3): the rules of `bl/ui.yaml`, `bl/a11y.yaml`, and the three ids the agent's Layer 1 cites (`BL-PRICE-003`, `BL-CAT-002`, `BL-CHK-001`), rendered the way `npm run bl:extract` renders them (reuse `scripts/knowledge/extract-bl.ts`'s exports, or its CLI output). Not a 441 KB copy of `business-logic.md`. Moved text that says `npm run bl:extract -- --domain ui` becomes "`<plugin>/knowledge/bl-ui.md` (in this repository: `npm run bl:extract -- --domain ui`)" |
| C6 | `SKILL.md` | **Two entry points** (Architecture). The body is the command's Steps 1–5 and `## Rules`, verbatim except the C3, C5, C9 rewrites and the moves below, at ≤ 19,000 chars. Moved verbatim into supporting files: Step 2 Cases B–D + Step 2.5 → `scope-resolution.md`; Step 3 Phase B component-explorer flow → `explorer-flow.md`; Step 4 templates → `report-template.md`. The old skill body goes, verbatim, into `methodology.md`. `SKILL.md`'s §Supporting files lists all eleven files. Frontmatter has `name: qa-design`, the skill's `description` and `argument-hint`, and no `disable-model-invocation` (the agent and the vc-test run invoke it) |
| C7 | `ui-ux-expert` | **`plugins/vc-test/agents/ui-ux-expert.md`, ≤ 19,000 chars.** Its frontmatter keeps `model: sonnet`, `color`, the description and no `tools:` line. Its first instruction: "Invoke the Skill tool with `skill: \"vc-test:qa-design\"` and open your return with `qa-design skill: loaded`; its base directory holds the files below." Moved verbatim into `skills/qa-design/`: Layout & Spacing Stability + Layout Defect Detection Protocol → `layout-defects.md`; Storybook Testing Workflow + Component Library → `storybook-workflow.md`; WCAG 2.2 criteria + Accessibility Audit Technique → `a11y-audit.md`. Dropped as duplicates, each replaced by a one-line pointer: the UX Heuristics table (`ux-heuristic-evaluation.md` has it), the Claude Design protocol steps and verdict table (`claude-design-verification.md` §3–§4), and Memory Model rows that name moved files. The body keeps Layer 1, the Coffee line, the four Claude Design rules, Bug Taxonomy, Observation/Action Space (Playwright tool names only), Signing in (C2), Judge, Escalation and Operations, plus a "files you read, and when" index |
| C8 | `visual-axis.md` | **Move whole** to `plugins/vc-test/skills/qa-design/visual-axis.md`, verbatim except C1/C2 and links. §5 and the /qa-test-only parts of §6 (`--visual`/`--no-visual`, `summary.json.visual`) stay, marked "(in this repository's `/qa-test`: …)". A vc-test run writes `design-report.md` and `scenarios/visual.rows.md` instead (`qa-ticket.md:118-122`), and §6 says so in one line. `floors.md:19,99` and `qa-ticket.md:115` point at the plugin file. `floors.md:143` (an exemption list) and `agents/change-map.md:23` (a mind-map path the project may hold) are the two mentions DOC-009 keeps: baseline **5 → 2** |
| C9 | `.claude/` documents the moved files cite | Same pattern as P2-5a/b: <br>• **copy whole** to `knowledge/`, with the copy header: `oracles/critical-ui-scope.md`, `automation/storefront-selectors.md`, `skills/qa-accessibility/wcag-accessibility-checklist.md` (this repository's copies, not vc-fix's diverged ones); <br>• **existing plugin copies**: `rules/reports.md`, `automation/storefront-config-flags.md`, `api/platform-patterns.md`, `ui-kit-class.md`, `vc-bug-catalog.md`; <br>• **plugin mechanism**: `/qa-bug` → `vc-fix:qa-bug`; `qa-evidence` → `vc-fix:qa-evidence`; `npm run kb -- ask` → `mcp__kb__kb_ask` only; `npm run visual:design` → `node <vc-frontend>/visual/design.mjs`, the engine `lib/capabilities.mjs` `pixelProbe` finds (optional: without it, `component-acceptance.md`'s check is `SKIPPED — no vc-frontend`, U3); `qa-lead-orchestrator` → "the dispatcher (in this repository: `qa-lead-orchestrator`)"; <br>• **"(in this repository: …)" plain text**: `qa-storybook/*`, `qa-visual-regression/*`, `qa-test/{axes,triage,authoring,close-out}.md`, `browser-lanes.md`, `ticket-routing.md`, `tokens:check`, `scope:validate`, `layout-runner` / suite `048c`, `config/test-suites.json`, `e-commerce-edge-cases-library.md`, `shared-instructions.md` |
| C10 | Two errors the move would otherwise carry | **Fixed in the move, nothing else:** (a) the agent's hand-listed spacing grid (L49 "4px/8px", L70 `{4,8,…,96}`, L164, L244) becomes the derived rule its own L35 and `design-system-consistency.md:40-42` state: `SPACING_GRID` from `design-tokens.generated`, never hand-listed (CLAUDE.md GOLDEN RULE; the 2026-09 phantom `BL-UI-002` incident). (b) `methodology.md`'s "PROPOSED-BL-UI-007..010" labels clash with the real `BL-UI-007` (`bl/ui.yaml:117`). They become the classifier ids the snippets already emit, e.g. `WCAG-1.4.3`, `BL-UI-008-NONTEXT`; the implementer reads the ids from `measure-layout.ts` |
| C11 | Consumers in this repository | **Repoint** to `vc-test:qa-design`, `vc-test:ui-ux-expert` and the plugin paths, valid here. The dispatches: `qa-test.md:557`, `qa-test-fast.md:120-127`, `qa-test-fast/execution.md:12,60-62,100`, `qa-test-fast/SKILL.md:25,69`, `qa-test/SKILL.md:144,153`, `qa-test/exploratory-lane.md:179`, `qa-design` shim. Section reads: `qa-test/authoring.md:47`, `qa-test-cases-generator/SKILL.md:45,233` and `qa-test.md:387` → `plugins/vc-test/skills/qa-design/methodology.md` §State-Stress Pass. Every `visual-axis.md` link in `.claude/` (survey §3.1: `qa-test-fast/*`, `qa-test/*`, `qa-visual-regression`, `qa-storybook`, `ticket-routing.md`, `CLAUDE.md`, `ROUTING.md`, `reports-policy.md`) → the plugin path. Rows: `agents.md:35,103`, `agent-dispatch.md:58`, `qa-lead-orchestrator.md:47,66,71,126,140`, `knowledge/agents/README.md`. Plus `audit-agents-knowledge.ts:52` (its hard-coded path), `plugins/vc-frontend/visual/design.mjs:3` (comment), `measure-layout.ts:409` (comment). Prose that names `/qa-design` the command stays. Generated: `business-logic.md` `Agents:` lines come from `bl/*.yaml` — change `ui-ux-expert` there only if `bl:lint` requires a known agent; else leave |
| C12 | vc-fix | **Untouched.** Its `critical-ui-scope.md:14` and `qa-verify-fix.md:253` say "ui-ux-expert (full vc-qa plugin only, not shipped here)", which stays true of vc-fix. Its stale `measure-layout.ts` fork is a parked finding, not this plan's |
| C13 | Release | vc-test **0.12.0**. `README.md:10` drops "except the visual-axis floors, which still live in a checkout of `ai-tools`". `plugin.json` and the marketplace description name `/vc-test:qa-design` and the `ui-ux-expert` agent. Also: README rows, CHANGELOG (with "Teammates: `/plugin marketplace update ai-tools` before `/qa-test`, `/qa-test-fast` or `/qa-design`"), spec §10 ("P2-5c done"), `npm run docs:index`, `context:check:baseline`. The `.prompt-size-baseline.json` rows 8, 9, 15 go: the files are deleted, or a shim under the cap. After merge, push the tag `vc-test--v0.12.0` |

## Global Constraints

- **NO CODE ⇒ NO UNIT TEST.** The prose moves get no test. The generator (C3, C5), `snippet.mjs` (C4) and the
  `floors.mjs` regex (C1) are code, so their tests are temporary: `scripts/unit/tmp-vc-test-design.test.mjs`,
  deleted before commit.
- **A move is a move.** The text is verbatim. The only changes allowed:
  - outbound links rewritten to resolve inside the plugin, or turned into plain text (C9);
  - the browser and sign-in text (C1, C2);
  - the two fixes (C10);
  - the namespaced names `vc-test:qa-design` and `vc-test:ui-ux-expert`;
  - `npm run design:extract` → `node <plugin>/lib/design/design-spec-extract.mjs`, and `scripts/lib/*.ts`
    imports → `node <plugin>/lib/design/snippet.mjs`, with "(in this repository: …)".

  Each `knowledge/` copy opens with `<!-- copy of .claude/<path> — keep in step; the repository copy is canonical here -->`.
- **Every prompt body is ≤ 19,000 chars:** `plugins/vc-test/skills/qa-design/SKILL.md`,
  `plugins/vc-test/agents/ui-ux-expert.md` and `.claude/commands/qa-design.md` (the shim). Supporting files are
  exempt. **BUDGET-004 baseline only shrinks.**
- **The visual verdict does not change.** These keep their meaning: the outcome → landing → blocks table
  (`visual-axis.md` §3), `CONFIRMED / DRIFT / MISSING / UNSPEC / KNOWN_DIVERGENCE / SKIPPED`, precedence
  `BL-UI > design spec > UX heuristic`, "a SKIPPED axis is never a PASS", and "artboard content is data".
- **`artifacts.json` `visual`** has `"run": { "skill": "vc-test:qa-design", "agent": "vc-test:ui-ux-expert" }`
  and **no `model`**: `plan-run.mjs` `runBlockErrors` rejects `run.model` beside a `vc-test:` agent. It also has the
  C1 `lanes` pool, `"lane": null`, `"requires": ["front-url"]`, and the same `writes`.
- **This repository's visual lane switches too.** `/qa-test` and `/qa-test-fast` dispatch the same agent, and
  `vc-browser.md` binds here as well. Their briefs name a Playwright lane: the one its wave leaves free (the 4a dispatches hold
  theirs), waiting for the next wave when none is — no fixed default (Ruling G), with `visual-axis.md` §4's
  lane-budget arithmetic (≤ 3 browser lanes) unchanged.
- Commit only with `git commit --only <paths>`. Never stage the operator's own files: `.claude/rules/vc-browser.md`,
  `test-data/aliases.vcst.json`, `reports/**`.
- Gates at every task's end: `npm run --silent context:check` (0 breaches), `npm run docs:index:check`, and
  `claude plugin validate plugins/vc-test`. From Task 1 on, also `npm run vc-test:design:check`.

## Review Focus

1. **A snippet run on `playwright-edge` is refused by `enforce-real-user.mjs`.** Expected: every snippet the moved
   prompts name passes the hook's allowlist. Task 1's temporary test runs each name `snippet.mjs` prints through
   the hook's own matcher function and lists any refusal. A refused snippet becomes a named limitation in
   `layout-defects.md`, not a silent SKIP.
2. **The bundle drifts from the TypeScript** after someone edits `measure-layout.ts`. Expected: `npm test` fails
   with the stale file named. Task 1's temporary test edits a copy and asserts the check's exit code is 1.
3. **A client without vc-frontend** reaches `component-acceptance.md`'s `visual:design`. Expected: `SKIPPED — no
   vc-frontend`, never a PASS (Task 2 text; Task 4 greps it).
4. **The visual lane on a client with only `playwright-chrome`, beside browser scenarios.** Expected: the plan is OK,
   visual gets `browser:playwright-chrome`, and each scenario waits for a later wave, so no wave has two entries on
   one lane. With all three lanes: visual gets edge and the scenarios get chrome and firefox. With no Playwright
   lane, the error names the three `mcp:playwright-*`. Task 3's temporary test covers all three cases on
   `planRun` directly.
5. **The agent loaded without the skill** (a dispatcher forgets the first line). Expected: the agent's own first
   instruction loads it, and `/qa-test-fast`'s join gate still checks `qa-design skill: loaded` (Task 4 keeps that
   check and its new name consistent).

---

### Task 1: The generated design library and `bl-ui.md`

**Files:**
- Create: `scripts/maintenance/build-vc-test-design.mjs`, `plugins/vc-test/lib/design/snippet.mjs`
- Generate: `plugins/vc-test/lib/design/{measure-layout,verify-design-spec,design-spec-extract}.mjs`,
  `plugins/vc-test/knowledge/bl-ui.md`
- Modify: `package.json` (`vc-test:design`, `vc-test:design:check`, the `test` chain)
- Temporary test: `scripts/unit/tmp-vc-test-design.test.mjs` (deleted before commit)

**Interfaces:**
- Produces: `node <plugin>/lib/design/snippet.mjs <exportName> [jsonArg|@file …]` → the snippet on stdout, exit 0;
  unknown name → exit 2 and the list of names. `node <plugin>/lib/design/design-spec-extract.mjs` takes the same
  arguments as `npm run design:extract`. `<plugin>/knowledge/bl-ui.md` holds every `BL-UI-*` and `BL-A11Y-*` rule,
  plus `BL-PRICE-003`, `BL-CAT-002` and `BL-CHK-001`.

- [ ] **Step 1: Temporary test**, failing first:
  - `snippet.mjs spacingAuditSnippet '".x"'` prints exactly the string `spacingAuditSnippet(".x")` returns from the TS
    (imported through tsx);
  - the same for `designTokenAuditSnippet @<fixture DesignSpec>`, and for `LAYOUT_SNIPPETS.<first key>`;
  - an unknown name exits 2;
  - `--check` on a fresh tree exits 0, and after one byte is appended to a generated file it exits 1 and names
    that file;
  - **Review Focus 1:** every name `snippet.mjs` lists, run through `enforce-real-user.mjs`'s decision function,
    is allowed, or the test prints the refused names for `layout-defects.md` (Task 3);
  - `bl-ui.md` contains `BL-UI-001` and `BL-A11Y-001`.
- [ ] **Step 2:** Write the generator (C3, C5) and `snippet.mjs` (C4). Bundle into a temporary directory and compare,
  so `--check` writes nothing. Output is deterministic: no timestamps, sorted inputs.
- [ ] **Step 3:** `npm run vc-test:design`, then `node --test scripts/unit/tmp-vc-test-design.test.mjs` green;
  `npm run vc-test:design:check` exits 0; `npm test` green.
- [ ] **Step 4:** Delete the temporary test. Commit (`--only` the generator, `snippet.mjs`, the four generated
  files, `package.json`): `feat(vc-test): lib/design — the measurement code as a generated bundle, a snippet printer, bl-ui.md (P2-5c)`.

### Task 2: `qa-design` and `visual-axis.md` in the plugin; `/qa-design` a shim

**Files:**
- Create: `plugins/vc-test/skills/qa-design/{SKILL.md, methodology.md, scope-resolution.md, explorer-flow.md, report-template.md}`
- Move (`git mv`, then edit): `.claude/skills/qa-design/{claude-design-verification,component-acceptance,design-system-consistency,ux-heuristic-evaluation}.md`
  and `.claude/skills/qa-test/visual-axis.md` → `plugins/vc-test/skills/qa-design/`
- Create (copies): `plugins/vc-test/knowledge/{critical-ui-scope,storefront-selectors,wcag-accessibility-checklist}.md`
- Modify: `.claude/commands/qa-design.md` (shim), `plugins/vc-test/knowledge/ui-kit-class.md` and
  `.claude/skills/qa-test/ui-kit-class.md` (C1's line, in step)
- Delete: `.claude/skills/qa-design/SKILL.md`

**Interfaces:**
- Consumes: Task 1's `snippet.mjs`, `design-spec-extract.mjs`, `bl-ui.md`.
- Produces: the skill `vc-test:qa-design`. Its `SKILL.md` opens with the C6 fork. `methodology.md` keeps the heading
  `### State-Stress Pass`, which Task 4 links to. `visual-axis.md` keeps §1–§6 and their numbers.

- [ ] **Step 1:** Build `SKILL.md` and the three command splits (C6), and `methodology.md` from the old skill body.
  Apply C9/C10(b) and the Global Constraints rewrites to every moved file. **In the same commit, repoint every
  Markdown link and path in `.claude/`, `CLAUDE.md` and `plugins/` that points into a moved or deleted file** (C11's
  link list, the §State-Stress reads included). If they waited for Task 4, `context:check`'s dangling-path ratchet
  would fail this commit; P2-5b had to merge two tasks for exactly this reason.
- [ ] **Step 2:** The shim: `.claude/commands/qa-design.md` keeps `description` (shortened), `argument-hint` and
  `disable-model-invocation: true`. Its body says: invoke the Skill tool with `skill: "vc-test:qa-design"` and the
  arguments unchanged; it needs vc-test ≥ 0.12.0, enabled in `.claude/settings.json`.
- [ ] **Step 3:** `grep -rn "\.claude/" plugins/vc-test/skills/qa-design plugins/vc-test/knowledge/{critical-ui-scope,storefront-selectors,wcag-accessibility-checklist}.md`
  shows only copy headers and "(in this repository: …)" marks. `wc -m` on `SKILL.md` is ≤ 19,000. Run the gates.
- [ ] **Step 4:** Commit: `feat(vc-test): qa-design and visual-axis.md move into the plugin; /qa-design here is a shim (P2-5c)`.

### Task 3: `ui-ux-expert` in the plugin, on a pooled Playwright lane

**Files:**
- Move: `.claude/agents/ui-ux-expert.md` → `plugins/vc-test/agents/ui-ux-expert.md` (then split, C7)
- Create: `plugins/vc-test/skills/qa-design/{layout-defects,storybook-workflow,a11y-audit}.md`
- Modify: `plugins/vc-test/lib/plan-run.mjs` (the row-level pool, C1), `plugins/vc-test/lib/artifacts.json` (`visual`, and the `$comment` sentence on `lanes`), `plugins/vc-test/skills/qa-test-strategy/lib/floors.mjs:60`,
  `plugins/vc-test/skills/qa-test-strategy/floors.md:19,41-44,99`, `plugins/vc-test/commands/qa-ticket.md:45,115`,
  `plugins/vc-test/skills/qa-design/{visual-axis.md §2 §4, SKILL.md}` (C1, C2)
- Temporary test: `scripts/unit/tmp-vc-test-visual-lane.test.mjs` (deleted before commit)

**Interfaces:**
- Consumes: Task 2's skill and its base directory; Task 1's refused-snippet list, if any.
- Produces: the agent `vc-test:ui-ux-expert` (`model: sonnet`); `artifacts.json` `visual` per the Global
  Constraints; `ARTIFACT_NEEDS["Visual lane"]` returns `"a browser lane (mcp:playwright-*)"` when the probe lists
  MCP servers and none matches `/playwright/i`; `planRun` gives a pooled row its lane in `waves[].lane`.

- [ ] **Step 1: Temporary test**, failing first:
  - `ARTIFACT_NEEDS["Visual lane"]({ mcp: ["chrome-devtools"] })` → `"a browser lane (mcp:playwright-*)"`;
    `({ mcp: ["playwright-chrome"] })` → `null`; `({})` → `null`;
  - **Review Focus 4**, on `planRun` with a fixture strategy (`Visual lane` RUN, three browser scenarios):
    - only `mcp:playwright-chrome`: ok, visual on chrome, every wave holds distinct lanes;
    - all three lanes: visual on `browser:playwright-edge`;
    - no Playwright lane: `ok: false`, and the error names `mcp:playwright-edge`, `mcp:playwright-chrome` and
      `mcp:playwright-firefox`;
  - `runBlockErrors` reports nothing for the new `visual` entry.
- [ ] **Step 2:** Make the code changes (C1). Split the agent (C7), rewrite Signing in (C2), apply C10(a), drop
  Lighthouse, and replace DevTools tool names with Playwright ones (`browser_snapshot`, `browser_take_screenshot`,
  `browser_evaluate`, `browser_console_messages`, `browser_network_requests`, `browser_resize`). Name any snippet
  that Task 1 found refused as a limitation in `layout-defects.md`. In the same commit, repoint every path to
  `.claude/agents/ui-ux-expert.md`: `audit-agents-knowledge.ts:52`, links in `.claude/`, and the
  `.prompt-size-baseline.json` row (through `context:check:baseline`).
- [ ] **Step 3:** The test is green. `wc -m plugins/vc-test/agents/ui-ux-expert.md` is ≤ 19,000.
  `grep -rniE "chrome.?dev.?tools|lighthouse" plugins/vc-test` finds nothing except "Lighthouse is not on the
  Playwright lanes" in `a11y-audit.md`. Run the gates.
- [ ] **Step 4:** Delete the temporary test. Commit: `feat(vc-test): ui-ux-expert moves into the plugin; the visual lane takes a Playwright lane from the pool (P2-5c)`.

### Task 4: Dispatch names and rosters in this repository; DOC-009 to 2

**Files:** the C11 dispatch strings and roster rows that Tasks 2–3 did not already repoint as links; `scripts/maintenance/lint-claude-docs.mjs:98-100` (`DOC-009: 2`, comment updated);
`scripts/maintenance/.prompt-size-baseline.json` (through `npm run context:check:baseline`).

- [ ] **Step 1:** Repoint per C11. Keep the `/qa-test-fast` join check `qa-design skill: loaded` and the agent's
  return line identical (Review Focus 5). Wherever this repository names the visual lane's browser, name a
  Playwright lane: the one its wave leaves free, else the next wave (Global Constraints).
- [ ] **Step 2:** `grep -rn "subagent_type: ui-ux-expert\|skill: \"qa-design\"\|skills/qa-design/\|qa-test/visual-axis\|agents/ui-ux-expert" .claude ci scripts CLAUDE.md plugins --include=*.md --include=*.mjs --include=*.ts --include=*.json`
  finds no old-path hit. **Review Focus 3:** `grep -n "SKIPPED — no vc-frontend" plugins/vc-test/skills/qa-design/component-acceptance.md` hits.
- [ ] **Step 3:** Set `DOC-009` to 2. `context:check` reports DOC-009 2 (`floors.md:143`, `change-map.md:23`) and
  0 breaches. Run `context:check:baseline`; it may only delete rows. `docs:index:check` and `npm test` are green.
- [ ] **Step 4:** Commit: `refactor: /qa-test, /qa-test-fast and the agent roster name vc-test:qa-design and vc-test:ui-ux-expert (P2-5c)`.

### Task 5: Release vc-test 0.12.0

- [ ] **Step 1:** Apply C13. `plugin.json` is `0.12.0`.
- [ ] **Step 2:** Spec §10 P2 row: "**P2-5c done** (vc-test 0.12.0: `qa-design`, `ui-ux-expert` and `visual-axis.md`
  in the plugin; the visual lane on a pooled Playwright lane; the measurement code as a generated `lib/design/`; DOC-009 2)".
- [ ] **Step 3:** `npm run docs:index`. Gates: `context:check`, `docs:index:check`, `vc-test:design:check`,
  `npm test`, `claude plugin validate plugins/vc-test`.
- [ ] **Step 4:** Commit: `release: vc-test 0.12.0 — the visual lane runs from the plugin (P2-5c)`.
