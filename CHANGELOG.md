# Changelog

All notable changes to the VC QA plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver per [`docs/versioning.md`](docs/versioning.md). **Breaking changes are flagged `**BREAKING:**`** and paired with a migration note.

> **Tier-A changes are flagged `**Tier A:**`** so reviewers know to read carefully — those affect the standardization contract.

---

## [Unreleased]

Ships as **plugin `0.8.1`** (marketplace `0.9.3`). Pin to a tagged release for stability; this branch tip is unstable.

### Fixed — PR #143 review round 2 (Findings 1–5): shared secret-redaction module + hardening

- **F1 (HIGH, security):** `skills/vc-self-check/deliver.mjs` — the scrubber that transmits to the **PUBLIC** VirtoCommerce upstream — carried its OWN pre-#143 `\b(keyword)\b` redaction array and still leaked the exact shapes the collector was just hardened against: compound keys (`access_token` / `refresh_token` / `client_secret` / `aws_secret_access_key`), a JSON-quoted `"password":"…"`, `Authorization: Basic <b64>` (the base64 PAT blob), and `AccountKey=…` / SAS. Extracted ONE shared module **`hooks/redact.mjs`** (the hardened rules) imported by BOTH `session-telemetry.mjs` and `deliver.mjs`, so the persist path and the upstream scrubber can never drift again; `deliver` keeps its additional client-shape scrubbing (paths / URLs / emails / tickets / client terms) layered AFTER the shared secret pass. Regression test in `scripts/unit/deliver-feedback.test.mjs`.
- **F2 (MEDIUM):** added Azure SAS `sig=…`, GitLab `glpat-…`, and Slack `xox[baprs]-…` token rules to the shared redaction (covered by the collector redaction test).
- **F3 (LOW):** `verify-access.mjs`'s "Deployment profile" check could never FAIL (`loadProjectProfile()` always returns `PROFILE_DEFAULTS`) — it now detects the file explicitly and FAILs when `project-profile.json` is absent, so a silently-failed profile write no longer reads green with default platform/jira values.
- **F4 (LOW):** the `complete` marker now carries its resolved target `sid`; `cmdFinalize` ignores a marker whose `sid` ≠ the finalizing session, so an mtime-race stray marker can't become the SOLE plugin-activity signal of an unrelated plain-dev session.
- **F5 (docs):** corrected the checkpoint/orphan-agent comments — the (absent-`background_tasks`) fallback defers until the next main-transcript event advances the session clock past `STALL_MS`, then drains (edge-only, since current CC always sends `background_tasks`); not "defers forever".
- `plugins/vc-fix` + `scripts/unit/` only — the `.claude/` mirror stays on the pre-5509 model.

### Fixed — PR #143 review: compound-key secret redaction + orphan-agent backstop + guarded verify-access

- **Security (BLOCKER):** the redaction rule for key/value secrets was anchored with `\b(keyword)\b`, which requires a word boundary on **both** sides of the keyword — so a keyword preceded by a word char (`access_token`, `refresh_token`, `client_secret`, `id_token`, `sessionToken`) or followed by one (`aws_secret_access_key`) had no boundary there and the value **leaked** into `<sid>.jsonl` → the public upstream via `deliver`. These are the most common OAuth2 / cloud-credential shapes, and opaque (non-JWT) tokens don't fall back to the `eyJ…` JWT rule. The rule now allows a bounded, length-capped word-char prefix/suffix around the keyword. New regression test `redaction: compound OAuth / cloud secret key names …` covers all six shapes. **NB (round-2 F1, above):** this hardened the COLLECTOR's rule, but `deliver.mjs`'s parallel scrubber still carried the weak pattern — the actual transmit-to-upstream path — so both are now the SINGLE shared `hooks/redact.mjs`.
- **Robustness (LOW):** `cmdFinalize`'s checkpoint fallback (used only when the harness omits `background_tasks`) deferred on **any** open agent op, so an orphaned/crashed sub-agent op could defer the terminal verdict **forever**. It now counts only agent ops fresher than `STALL_MS` on the **session clock** (newest transcript event ts, not wall-clock); stale ops fall through to the drain safety-net. Regression test `checkpoint (fallback): a STALE open agent op … drains`.
- **Robustness (LOW):** `skills/project-init/verify-access.mjs` invoked `main()` unguarded — an unexpected throw before the normal exit became an unhandled rejection and skipped the completion marker. Wrapped in `.catch` (crash ⇒ exit 1, clean line stays withheld — the safe direction).
- `plugins/vc-fix` + `scripts/unit/` only — the `.claude/` mirror stays on the pre-5509 model.

### Changed — self-diagnostics capture is OPT-IN, with consent asked as `/project-init`'s FIRST step

The passive session-telemetry collector captures **only** when `project-profile.json` explicitly sets `selfDiagnostics: true` (the env kill-switch `VC_FIX_DIAG_CAPTURE=off` still forces off regardless). No profile / no flag / any non-`true` value ⇒ a **full no-op** — no `.vc-fix/` is created. The `/project-init` onboarding blind spot — its profile is written only at the *end* of onboarding, so its own run would otherwise never be captured — is closed by **consent first + immediate flag write.**

- `captureEnabled()` now returns `readProfile(root)?.selfDiagnostics === true` (absent/unreadable ⇒ off). `plugins/vc-fix/hooks/session-telemetry.mjs` only.
- **`/project-init` asks the capture consent as its FIRST step** (new §0b — before installing tooling and before the interview) and, on Yes, writes `selfDiagnostics: true` **immediately** via `gen-profile --self-diagnostics true`, so its OWN remaining run is captured from that point on. The duplicate mid-interview `selfDiagnostics` prompt (old "step 2e") is removed — step 2e now asks **only** the `feedback.mode` upstream-delivery consent (and is skipped entirely when §0b was answered No). The `session_start` record still misses this run (SessionStart fired before the flag existed) — accepted; spans + the finalize verdict are captured from the flag write onward.
- **Residual opt-in blind spot fixed (found on the LEO deployment):** because `/project-init`'s `/project-init` prompt fires *before* §0b writes the flag, its own command span never opens, so `pluginActivity` was `false` → its clean line was withheld (`suppressReason: "no-plugin-activity"`) even though the run captured 31 spans. `cmdFinalize` now also treats an explicit `complete --skill "<name>"` signal (which only a plugin skill emits) as proof of plugin activity, so a healthy `/project-init` run surfaces its clean line. Locked in by a mid-run-enable regression test.
- **Completion signal made deterministic (2nd LEO miss):** the clean line depends on that `complete` signal, but the model **skipped** the trailing "best-effort silent" Step-9 command in auto mode (grep of the run's transcript: 0 invocations) → `completeSignalled:false` → still no line. Fixed by having **`verify-access.mjs`** (the last script every `/project-init` path runs — fresh §9, `--check` §C, `--add-env` §D) emit the terminal-step marker itself (best-effort, no-throw, gated on `captureEnabled`). The clean line no longer relies on the model remembering a trailing command; the standalone `complete` command is now only a fallback for a run that bailed before verify-access.
- Docs re-aligned to opt-in (`plugins/vc-fix/README.md`, `commands/vc-feedback.md`, `/vc-self-check` SKILL, `knowledge/diagnostics/skill-expectations.md`, `scripts/lib/project-profile.mjs` JSDoc). Tests flipped in `scripts/unit/session-telemetry.test.mjs`: an absent profile / a profile without the flag is now a full no-op; `selfDiagnostics: true` captures. Added a `gen-profile` §0b stub-write test.
- `plugins/vc-fix` only — the `.claude/` mirror stays on the pre-5509 model.

### Changed — self-diagnostics UX polish: terse surfaced line + a 3-option end-of-session cleanup

- **Surfaced block reason is now one short line, not a paragraph.** Claude Code renders a Stop-hook
  `decision:block` reason verbatim (as "Stop hook error: …"), so the old multi-sentence clean/findings
  text read as a scary error. The reason is now a single terse instruction; the operator sees
  essentially just the status line (`vc-fix self-check: no plugin issues detected`).
- **Cleanup offer is a 3-option AskUserQuestion at the session's end** — *Delete all sessions (incl.
  this one)* / *Delete all except this session* / *Keep (auto-deleted after 24h)* — backed by
  `purge-inactive --all [--keep <sid>]`. It **no longer interrupts a running skill**: during a
  multi-turn skill's intermediate pause (the `awaiting-completion` state) it is withheld and instead
  rides the terminal clean line at the skill's end (a `SessionStart` hook cannot open an interactive
  prompt — only a Stop-hook resume can, confirmed against the hooks docs).
- **Cleanup offer never surfaces standalone** (operator feedback 2026-07-22). It now rides a
  DIAGNOSTIC surface only — the clean line ("no problems"), or after the findings→`/vc-self-check`
  flow — never on its own on a plain dev turn with no plugin verdict (the old `|| !pluginActivity`
  path is removed; >24h leftovers still auto-reclaim via the age-cap, and the next real plugin
  session offers cleanup after its verdict). Ordering is always: verdict FIRST, cleanup offer AFTER.

### Changed — the clean self-check line now fires on an EXPLICIT completion signal, not per-turn

The clean status line (`vc-fix self-check: no plugin issues detected`) was gated on per-turn plugin activity. But the `Stop` hook fires at the **end of every turn** — including every pause where a multi-turn skill (`/project-init`'s interview, `/qa-fix`'s sub-agent hand-off) waits for the operator — so the line **repeated after every pause**. A per-turn guard structurally cannot express "once, at the end".

- New **`session-telemetry.mjs complete --skill "<name>"`** subcommand sets a one-shot `state.skillCompletePending` marker; `cmdFinalize` gates the clean line on it (consumed on surfacing) so it prints **at most once per skill run, only after its terminal step**. Bash-invoked (no hook stdin) → targets the newest `.state.json` (or `--session`); never throws/blocks; a no-op when capture is off (NOT gated on consent — consent gates *surfacing*, not the marker write).
- All **6 terminal commands** emit it as their LAST action (incl. early-BAIL paths): `/project-init` (×3 paths — §9 Done, `--add-env` Step D, `--check` Step C), `/qa-fix`, `/qa-bug`, `/qa-monitoring`, `/qa-verify-fix`, `/qa-env-check`. Authoring contract + checklist in `knowledge/diagnostics/skill-expectations.md` §Signal completion; MUST-note in `agent-dispatch.md` (top-level orchestrator only — a dispatched sub-agent must NOT emit).
- Opt-in **`VC_FIX_DIAG_LINE_FALLBACK=on`** gives a once-per-session line for an un-migrated skill; new `awaiting-completion` audit `suppressReason` marks the normal intermediate-pause state.

### Fixed — PR-review audit (4 independent reviewers): secret leak, misclassification, write-probe false NOT-READY

- **Secret redaction (security, HIGH):** `redact()` stripped only the scheme word — `Authorization: Bearer <token>` **LEAKED the token** — and did not redact JSON-shaped secrets (`{"password":"…"}`, `{"apiKey":"…"}`). These flow into `<sid>.jsonl` `details[].snippet` → the DIAG/DELIVERY contributed to the **public** upstream. Rewrote the regexes to consume the credential (not the scheme word) and to redact quoted key/value forms; added an end-to-end test asserting no secret reaches a span snippet or the block reason. **Follow-up (PR #143 review, Lenajava1):** the JSON-quoted `"Authorization":"Bearer <tok>"` shape still leaked (the value's opening quote wasn't consumed, so `\S+` stopped at `"Bearer`) — the rule now consumes it, with a matching test.
- **Misclassification:** a span with BOTH a self-corrected op-keyed error AND an **untied** `hook_failure` (the tsc-on-every-Edit pattern) was wrongly tagged `recovered` (not escalated). New `span.sawUntiedFailure` vetoes `recovered`, matching the invariant the comment already claimed.
- **`--self-diagnostics` enum-validated:** a malformed value (`yes` / `True` / `1`) silently coerced to `false` (capture OFF); now rejected like `--feedback-mode`.
- **Write-probe false NOT-READY (M2/M3):** ADO `403` (the sampled work-item/branch is ACL-restricted) is now a distinct **`restricted`** verdict → WARN, no longer conflated with `401` (missing scope) → FAIL; and GitHub direct-mode no-push on the `vc-platform` **proxy** probe is WARN (the real push target is the per-bug routed repo, gated at `/qa-fix` Gate 1) instead of blocking onboarding. Neither weakens the real gate.
- **Docs/lifecycle:** dropped the wrong `VC_FIX_DIAG_CONSENT=off` from `complete`'s no-op list (oracle + code comment); the age-cap now exempts the current session's `DELIVERY-<sid>-*` for symmetry.
- **Code-quality follow-ups (PR #143 review, Lenajava1):** extracted `cmdFinalize`'s deeply-nested `suppressReason` ternary into a pure `computeSuppressReason()` with early returns (behavior-identical, still audit-only); and lifted the write-probe→severity mapping into a pure, unit-tested `writeProbeSeverity()` in `probe-lib.mjs`, shared by every write-capability row in `verify-access.mjs`.
- **A missing WRITE scope never blocks onboarding — it is a WARN, not a FAIL** (operator decision; addresses the review's rollout-risk note). Refusing to finish `/project-init` because a token reaches the resource but lacks one write scope is too heavy: the WARN explains exactly what to grant, the operator grants it before `/qa-fix`, and `/qa-fix` Gate 1 re-checks the actual routed repo anyway. Applied consistently to **all** write-capability probes — Azure Boards transition-write and client-repo push both drop from FAIL→WARN (GitHub upstream was already WARN via the proxy-probe rule). Only **fundamentals** still FAIL → NOT READY: missing core env, unreachable `FRONT_URL`/`BACK_URL`, bad admin login, or a totally absent/rejected credential that can't even reach the resource. (Supersedes the earlier same-cycle "mode-aware `--existing` FAIL/WARN split", which is removed — WARN everywhere is simpler and matches the principle.)

**Deferred (tracked separately, not in this PR):** live ADO verification of the write-probe *auth-before-validate* premise (a read-only PAT must 401/403 before body validation, else the probe can false-PASS).

### Fixed — self-diagnostics was blind to sessions that crossed a resume/compact (found by `/vc-self-check` itself)

A resumed `/project-init` session self-diagnosed this: the collector classified a whole `/project-init` run as `clean` / `pluginActivity:false` ("the plugin never ran"). Root cause — a command span is opened in `cmdPrompt` and lives only in `state.currentCommand` until it CLOSES at `finalize`; a `resume`/`compact` `SessionStart` fires mid-command, and `cmdInit` unconditionally did `saveState(freshState())`, **wiping** the open span + the scan cursor + the `sawPluginSpan`/`anySkillSeen` aggregates. Every tool span then orphaned (`parentId:null`) and the run escaped both the clean line and findings escalation. Since `/project-init` is long and frequently compacts, this defeated capture for exactly the skill it was meant to cover.

- **Fix:** `cmdInit` now carries the persisted state over (`loadState`) when `ev.source === "resume" | "compact"` instead of resetting. `loadState` falls back to `freshState` when no state file exists, so brand-new sessions are unaffected; a plain `startup`/`clear` still fully resets.
- **Also (S3, cosmetic):** `session_start.testEnv` was null when `TEST_ENV` was passed inline per-command (`TEST_ENV=… node …`, never exported to the hook env). The scanner now recovers it from the first tool arg carrying `TEST_ENV=` and records it on the `finalize` record; `/vc-self-check` prefers `finalize.testEnv` when `session_start.testEnv` is null.

### Added — one-shot cleanup offer for leftover inactive-session diagnostics

Complements the silent 24h age-cap. At `SessionStart` the collector counts leftover artifacts from **other, now-inactive** sessions (mtime older than a 1h inactivity floor, so a live parallel session is never offered up) and surfaces the count on the `session_start` record (`staleInactiveSessions` / `staleInactiveFiles`). On the next **terminal** `Stop` it surfaces a **one-shot** `AskUserQuestion` offer — *"Detected diagnostic files from old inactive sessions. Delete them now? (Session files older than 24h are auto-deleted at the next session start anyway.)"* with **Delete now** / **Keep (I'll remove them myself)** — riding the same resume as any findings/clean line so it costs no extra turn.

- **Delete now** runs the new **`session-telemetry.mjs purge-inactive`** subcommand (`--keep <sid>` protects the current session; `--dir`; `--all` ignores the 1h floor), which removes only vc-fix's OWN diagnostic artifact shapes — never client code, never the current session.
- Asked **at most once per session** (`cleanupOffered` guard); suppressed by `VC_FIX_DIAG_CONSENT=off`. Capture is unaffected by the consent kill-switch.

### Added — `/project-init --add-env` (add another environment to an onboarded project)

A day-2 mode alongside `--check`: point an already-onboarded project at **another deployment target** (a second QA env, staging, a customer's second site) without re-running the onboarding interview. An *environment* is env-agnostic to the deployment profile — it's only a URL set + per-env access creds selected at runtime by `TEST_ENV` — so `--add-env` reuses `project-profile.json` and touches nothing project-level.

- **Flow:** precondition (`project-profile.json` must exist; else run the full `/project-init`) → **ask the new env name** (plain chat) + existing-env guard (reuse vs new name, never clobber) → `scaffold-env.mjs` writes `.env.<new>` (its URLs) + `scaffold-secrets.mjs` adds the `_<ENV>`-suffixed per-env app passwords to `.env.local` (**reusing** the profile's tracker/host; cross-env GitHub/Jira/ADO tokens are single-instance, left untouched — idempotent add-only) → `verify-access` with `TEST_ENV=<new>`.
- **Does NOT** re-interview, re-scan repos, re-derive, rewrite `project-profile.json`, or regenerate `.mcp.json` — all env-agnostic and already done.
- A different **tracker or code host** is a different *project* (a fresh `/project-init` in its own directory), not an environment.
- **No new code** — reuses the existing `scaffold-env` / `scaffold-secrets` / `verify-access` scripts as-is. Command + skill docs, README (project-init modes table), agents README, and the self-diagnostics oracle updated.

### Added — self-diagnostics age-cap backstop (undelivered artifacts can't accumulate)

The ephemeral lifecycle (`deliver.mjs` delete-after-delivery) only reclaims **delivered** sessions. Artifacts that are never delivered — `feedback.mode=off`, a PR/fork-PR hand-off the operator never `--purge`s, a clean no-finding run — would otherwise pile up in `<outputRoot>/.vc-fix/diagnostics/` forever. `session-telemetry.mjs cmdInit` (SessionStart) now age-caps its **own** artifacts as a backstop:

- Deletes `<sid>.jsonl` / `<sid>.state.json` / `DIAG-*.md` / `DELIVERY-*.md` older than **`VC_FIX_DIAG_MAX_AGE_H`** hours (default **24**; `0` disables; garbage/negative ⇒ default). Matched by our own artifact shapes only — a stray file dropped in the dir is left alone.
- **Never** the current session's files, and never a still-fresh (in-flight) session's — the mtime cutoff handles the latter. Best-effort, never throws, `exit 0`.
- Complements (does not replace) delete-after-delivery; the reclaimed count is surfaced as `prunedOldArtifacts` on the `session_start` record.

### Changed — self-diagnostics: checkpoint Stop on pending sub-agents + clean self-check line ON by default

> **Superseded in part by "the clean self-check line now fires on an EXPLICIT completion signal" (above):** the clean line is no longer per-turn-activity-gated — it now fires once, after a skill signals `complete`. The checkpoint-vs-terminal Stop distinction below is unchanged.

The `Stop` hook fires at the end of **every** turn, including a turn that only handed work to a background sub-agent and is now waiting. Since the sub-agent's work lives in a sidechain the collector skips, `cmdFinalize` would judge an **incomplete** session — and (with the line on) print a "no plugin issues detected" verdict **mid-task**. `session-telemetry.mjs cmdFinalize` now distinguishes **checkpoint** vs **terminal**:

- **Checkpoint** — if work is still pending, record a durable `{verdict:"deferred", pendingSubagents, suppressReason:"subagent-running"}` decision to the jsonl and **return** without draining/closing spans or surfacing anything. The real verdict + line wait for the **terminal** Stop after the sub-agent returns (its Task result now in the main transcript). Pending is read from `ev.background_tasks` **authoritatively when the field is present** (an empty array on a terminal Stop drains — it does NOT fall back to a lingering open agent op, so an orphaned/crashed sub-agent op can't defer forever); the open-agent-op count is the fallback only when the field is absent entirely.
- **Visible clean line ON by default** on a terminal plugin turn (was the opt-in `VC_FIX_DIAG_LINE=always`): a clean run now prints `vc-fix self-check: no plugin issues detected`. Silence it with **`VC_FIX_DIAG_LINE=off`**; the global `VC_FIX_DIAG_CONSENT=off` kill switch still gates everything.
- **`stop_hook_active` guard** added to both the findings block and the clean line — a belt-and-suspenders companion to `promptedThisTurn` so the Stop from our own resume-turn can't re-fire (no resume loop). When it suppresses, the decision record logs `suppressReason:"stop-hook-active"` (was misreported as `already-surfaced`).
- Tests: checkpoint (background_tasks + open-agent-op fallback), terminal clean/findings, `VC_FIX_DIAG_LINE=off`, `stop_hook_active`, and a full sub-agent hand-off E2E sequence.
### Fixed — `/vc-shell-fix` hardened against the real page-builder shell

Cross-checked the skill's own claims against `vc-module-pagebuilder`'s live `package.json` and its first-party `.claude/` docs (which were already drifting — they cite `@vc-shell/framework` `1.2.2`/`1.2.3` against the real `^2.1.0`). Applied the corrections directly rather than copying facts that will rot again:

- **Package-manager-agnostic fix guidance.** The skill previously hardcoded `npm install --no-save` and bare `npx`, but the real sub-app is Yarn Berry (`yarn@4.9.2`). Path 1's red/green gate and Path 2's scratch-install now read the sub-app's own `package.json` `scripts`/`packageManager` at fix time instead of assuming a package manager.
- **New "Ground yourself in the checked-out repo first" step** — read `package.json` (authoritative) and the module's own `.claude/agents|skills` docs (if present) before trusting anything hardcoded in this skill.
- **New `src/api_client/` STOP rule** — it's auto-generated (`@vc-shell/api-client-generator`); an RCA anchor there is an upstream root cause, not a shell fix.
- **Cross-frame (iframe/`BroadcastChannel`) bugs routed to Gate-6**, not invented into a new harness — neither Path 1 (Node) nor Path 2 (single-frame jsdom) can reproduce a real designer↔shell iframe boundary.
- **Fixed a real doubled-path bug** in `vc-shell-scratch-harness-patterns.md` (a repeated `.../PageBuilderModule.Web/src/VirtoCommerce.PageBuilderModule.Web/...` segment, 3 occurrences) that would have broken every scratch-harness import path.
- **Follow-up hardening after review:** reconciled the "Reality check" section's now-contradicted claim ("only ever `tsx --test`") with the new grounding step; disambiguated a "step 1" cross-reference that collided with an unrelated numbered list; added a PnP-mode check (`nodeLinker` in `.yarnrc.yml`) before the npm-based scratch-install, since Yarn Berry defaults to PnP (no `node_modules`) and the prior recipe would fail silently there.
- Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

### Fixed — code-review follow-ups (Azure tooling + reconcile + telemetry)

Addresses the findings from the PR review:

- **HTML-field over-match (correctness).** The custom-field HTML decision was a suffix regex `/(SystemInfo|Description|ReproSteps)$/i` — it would wrongly Markdown→HTML-convert a plaintext custom field like `Custom.ProblemDescription` / `Custom.EnvSystemInfo`, corrupting its value. Now an **exact** allowlist (`isHtmlField`, the three real HTML refs only).
- **De-duplicated the Azure field-building (maintainability).** New shared `skills/qa-fix-routing/ado-html.mjs` (+ `.d.mts`) owns `mdToHtml`/`ensureAzureHtml`/`isHtmlField` and a single `buildBugFields()` Bug JSON-Patch builder. `ado.mjs` and `trackers/azure-tracker.ts` now both call it instead of hand-mirroring ~11 fields (and a full second copy of `ensureAzureHtml`) across JS and TS — the drift risk the review flagged is gone.
- **Reconcile prune guard (data-loss).** `reconcile-profile.mjs --write` now refuses to remove **≥5 fields** without `--force`, returning `status:"needs-force"` — so reconciling a rich profile against a leaner schema (e.g. via the native `.claude` surface) can't silently strip live `/qa-fix` routing config.
- **Telemetry double-read (efficiency).** `session-telemetry.mjs cmdInit` read + parsed `project-profile.json` twice per session start (gate + projectType); now memoized to one read per process.

### Fixed — `/qa-bug` Azure Boards work items now match the lean gold-standard shape

Azure bugs filed by `/qa-bug` were dumping the whole markdown report (env tables, module versions, 4-layer validation, root-cause, fix routing) into `System.Description`, with no summary and environment baked into the body — nothing like the target shape. Realigned to the reference bug template.

- **`knowledge/execution/azure-html-format.md`** rewritten: `System.Description` is now an **abstract Summary → Preconditions → Steps → Actual → Expected** and nothing else; the Summary and Steps carry **no user-specific data** (no emails / IDs / order numbers / GUIDs / names — reproducible by anyone who meets the Preconditions). Everything else (RCA / layer validation / versions / fix routing) collapses into **one `🔧 Technical Details` accordion below**, trimmed to essentials.
- **Environment & metadata now go to dedicated Bug fields, never a description section:** `Custom.Environment` picklist, `Custom.Reportedby`, `Custom.Typeofbug`, and the build/theme/browser/repro-rate in the **System Info** block (`Microsoft.VSTS.TCM.SystemInfo`). `Microsoft.VSTS.TCM.ReproSteps` is left **empty** (the LEO Bug form hides it — the visible repro area is backed by `System.Description`).
- **`ado.mjs create-workitem`** gained `--system-info-file` / `--system-info` (→ System Info block) and a repeatable `--field "Ref=value"` (sets any work-item field, incl. the deployment's custom picklists) — previously there was no way to populate those fields at all. Mirrored in `trackers/azure-tracker.ts` (`CreateWorkItemInput.systemInfo` + `.fields`) per the keep-in-sync contract; `commands/qa-bug.md` Step 5 + `knowledge/execution/tracker-ops.md` updated to match. Plugin-only (Azure formatting is not in the `.claude/` surface).
- **Auto-assignee, current sprint, and asked parent link.** `create-workitem` now takes `--assign-self` (assigns to the token/session owner), `--iteration current` (stamps the team's active sprint so the bug isn't filed to the backlog), and `--parent <id>` (Hierarchy-Reverse link). Two new resolver verbs back them: `ado.mjs whoami` (owner identity via `connectionData`) and `ado.mjs current-iteration` (active sprint via team `iterations?$timeframe=current`). `/qa-bug` sets `--assign-self --iteration current` automatically and **asks the operator** which work item to link as parent. Mirrored in `azure-tracker.ts` (`CreateWorkItemInput.assignedTo` / `.iterationPath` / `.parentId`).

### Added — `/project-init --check` reconciles a stale profile to the current schema

A deployment onboarded on an older plugin keeps its `project-profile.json` across upgrades, but the schema (`PROFILE_DEFAULTS`) evolves — fields get added / removed / need re-deriving. `--check` now migrates the profile before verifying, instead of only running the readiness table.

- New `skills/project-init/reconcile-profile.mjs` (deterministic, dry-run by default) diffs the profile against `PROFILE_DEFAULTS` → JSON report: **`added`** (missing fields with a safe default, auto-filled on `--write`) · **`removed`** (obsolete fields pruned — but **open maps** `roleStates`/`stateMap`/`workItemTypes` and **arrays** `repos.*` are kept wholesale) · **`pending`** (fields that are the operator's decision — each carries its own `question` + `options`, e.g. `selfDiagnostics` — never auto-filled) · **`rescan`** (fields to re-derive from a live scan). Mirrors `gen-profile`'s discriminated `tracker.azure`/`vcs.azure` pruning, so a non-Azure profile is never re-grown an empty `azure:{}`. `--write` applies structural changes + `--set <path>=<value>` decisions; idempotent (a reconciled profile reports `current`).
- The `/project-init` skill's new **`--check`** section drives it: reconcile (dry-run) → ask each `pending` via `AskUserQuestion` / re-scan → `--write` the decisions → verify-access. Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

### Fixed — session-telemetry gated on a `selfDiagnostics` opt-in (no stray `.vc-fix/` in random folders)

- The `SessionStart` hook previously ran `session-telemetry.mjs init` unconditionally, creating `<cwd>/.vc-fix/diagnostics/` (a `session_start` record + `.state.json`) on **every** Claude launch in **any** directory — before any skill ran. Running Claude in an unrelated folder left a junk `.vc-fix/` behind.
- Now all three subcommands (`init` / `record` / `finalize`) early-return to a **full no-op** unless the output root (`VC_FIX_HOME || cwd`) has a `project-profile.json` with `selfDiagnostics: true`. Absent profile, absent field, or any non-`true` value ⇒ nothing is read from the transcript, nothing is written, and `.vc-fix/` is never created. The gate (`selfDiagnosticsEnabled(root)`) reads the profile **raw** (like `readProjectType`), so a shipped default can never silently enable it — the field must be physically present and strictly `=== true`.
- `/project-init` now writes `"selfDiagnostics": true` into `project-profile.json` by default (via `PROFILE_DEFAULTS`); the `--merge` path back-fills it into an existing profile that lacks the field without touching other fields. Documented in `project-profile.example.json`, the `ProjectProfile` JSDoc, and `project-profile.d.mts`. (A future `/project-init` will ask the operator; for now it defaults to on.)
- Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

### Added — vc-fix self-diagnostics subsystem (VCST-5475–5479)

A two-tier way for a client-installed `vc-fix` to observe whether its OWN skills ran correctly and, opt-in, report quality issues back to VirtoCommerce — without ever mutating the client install or leaking client code. `vc-fix` now ships **8 agents, 15 skills, 7 commands** (plugin `0.7.0`; marketplace `0.9.0`).

- **Tier A:** `hooks/session-telemetry.mjs` (passive) wired via `hooks/hooks.json` — `SessionStart`→init, `PostToolUse[Skill]`→record, `Stop`→finalize. Records per-skill boundaries, timings, and deterministic signals (tool errors, denied permissions, hook failures, STOP/BAIL markers, anomaly score) to gitignored `<outputRoot>/.vc-fix/diagnostics/<session_id>.jsonl`. Secrets redacted; never throws/blocks a tool.
- **Oracle:** `knowledge/diagnostics/skill-expectations.md` — per-command expected phases/gates + anti-patterns + an S0–S3 severity rubric.
- **Tier B:** `/vc-self-check` (`skills/vc-self-check/`, `disable-model-invocation`) reads the telemetry + transcript + oracle → per-skill verdict (OK/DEGRADED/BROKEN) + severity + proposed fix → LOCAL `DIAG-*.md`. A one-shot yes/no consent prompt fires from `Stop` only when the anomaly score is high (opt out `VC_FIX_DIAG_CONSENT=off`); never auto-runs.
- **Delivery:** `skills/vc-self-check/deliver.mjs` (`/vc-self-check deliver`) — scrubbed (§2a client-code containment), consent-gated (draft-and-confirm) contribution to `VirtoCommerce/vc-mcp-testing-module`, routed by GitHub-token rights (PR / fork-PR / issue / local), with issue dedup.
- Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

### Fixed — client-deployment robustness (Azure Boards / Azure Repos) + plugin-root resolution

Bundle of fixes surfaced by a client deployment on Azure Boards + Azure Repos (PR #122).

- **Plugin root is resolved at runtime, not baked.** `paths.pluginRoot` is no longer written
  to `project-profile.json`, and the earlier stable-link workaround
  (`hooks/vc-fix-latest-link.mjs` + `stableLinkPath()`) is **removed** — it went stale/dangling
  on upgrades. Commands now resolve `$pluginRoot` = the ACTIVE (enabled) install at call time
  via the documented `claude plugin list --json` (fallback: highest-semver scan of
  `~/.claude/plugins/cache/*/vc-fix/`); see `knowledge/execution/plugin-root.md`. Result: no
  version-stamped path, no stale link, **no `/project-init` re-run after an upgrade**.
  `verify-access.mjs` now probes that resolver.
- **`ado.mjs` auto-loads `.env.local` / `.env.${TEST_ENV}`** via `loadLayeredEnv` (like the
  sibling scripts), so `TEST_ENV=<env> node ado.mjs …` resolves `ADO_PAT` standalone — no more
  "Azure DevOps auth unavailable" until the shell was manually sourced.
- **`ado.mjs search` subcommand** — ADO Code Search on the `almsearch.*` host; always sends
  `filters.Project` and only pairs `filters.Repository` with it (the API rejects
  Repository-without-Project). `qa-bug` §3 documents the filter-pair requirement.
- **Azure Boards content authored as HTML** (`System.Description` / `ReproSteps` / comments are
  HTML fields) with a Markdown→HTML safety net; hardened against mixed Markdown+embed bodies
  (raw-HTML-line passthrough) and disallowed link schemes (`javascript:`/`data:` neutralized).
- **Storefront `upstreamRef`** resolves a fork line to `<major>.<minor>.0` by verifying that tag
  exists upstream (verbatim, `v`-prefix preserved), falling back to smallest-on-line /
  earlier-line — the resolvable baseline `/qa-fix` Gate 1b needs.
- **Self-diagnostics** made runnable + accurate: `/vc-self-check` is model-invocable (the `Stop`
  consent prompt uses the `AskUserQuestion` tool and, on Yes, runs the skill — the old
  `disable-model-invocation` dead-ended it); scoring/consent key off the **skill-attributed**
  anomaly (`skillTotals`/`skillAnomalyScore`), and the collector logs the agents a skill delegates
  to (`agent_calls`), so it logs/analyses only skill + skill-invoked-agent activity.

Plugin-tree changes (`plugins/vc-fix/`).

### Changed — self-diagnostics consent prompt: skill-gated, opinion-poll UI, auto-run on Yes

The end-of-session `/vc-self-check` consent prompt fired on **any** session whose raw
anomaly score was high — including plain development sessions (git/Bash/Edit, a failing
`tsc` PostToolUse hook) where **no vc-fix skill ran** — and it asked as free text, then
couldn't actually start because the command was `disable-model-invocation`.

- **`session-telemetry.mjs`** now scores the consent trigger on **skill-attributed**
  signals only (new `skillTotals`, accumulated while a skill span is open) and gates it on
  `anySkillSeen` — a session with zero skill invocations is never offered self-diagnosis.
  The finalize record carries `anySkillSeen` + `skillTotals` + `skillAnomalyScore` +
  `skillAnomalies` alongside the session-wide totals.
- The prompt text now instructs the model to ask via the **`AskUserQuestion`** tool
  (Yes/No), and on **Yes** to run the `vc-self-check` skill directly.
- **`/vc-self-check` drops `disable-model-invocation`** (command + skill) so the model can
  run it on the operator's Yes; unprompted auto-triggering is ruled out by the description +
  the existing recursion guards (`selfCheckSeen` one-shot + the collector dropping its own
  `vc-self-check` spans). Docs (`CLAUDE.md`, `.claude/rules/skills-commands.md`) updated.
- Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

### Changed — self-diagnostics artifacts are ephemeral (log → analyze → contribute → delete)

Local diagnostics under `<outputRoot>/.vc-fix/diagnostics/` are no longer meant to
accumulate. Instead of a time-based retention sweep, the lifecycle is now
**log → analyze → contribute → delete**: `deliver.mjs` cleans up the processed session's
own artifacts once its finding is upstream.

- On a successful **Issue** delivery (`--confirm`, or a dedup that is already upstream),
  `deliver` deletes that session's `<sid>.jsonl` + `<sid>.state.json` + `DIAG-<sid>-*.md` +
  this finding's `DELIVERY-*.md` — **that session only**, never other sessions. `--keep`
  retains them.
- **PR / fork-PR** (handed off — the human opens the PR) and **local** (no token, nothing
  sent) delete nothing; the run prints a ready `--purge` cleanup command to run *after* the
  PR is opened / after authenticating.
- **Nothing worthwhile** (no BROKEN/DEGRADED finding) files nothing and offers the cleanup.
- New flags: **`--purge`** (standalone terminal cleanup of the processed session, sends
  nothing) and **`--keep`** (skip the auto-delete after a delivery). New session-scoped
  `purgeSession()` + `sessionIdFromDiag()` in `deliver.mjs`.
- Docs updated: `CLAUDE.md`, `.claude/rules/reports.md`, the `/vc-self-check` command + skill.
  Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

### Fixed — `upstreamRef` is a resolvable upstream tag (frontend provenance)

`/project-init` derived a storefront fork's `upstreamRef` as the bare `MAJOR.MINOR` of the
fork's `package.json` version (`2.49.7` → `2.49`) and wrote that into
`project-profile.json`. `2.49` is a line label, not a git ref (422 on `vc-frontend`); so is
the fork's own patch `2.49.7` (the fork's `.7` has no upstream tag). `/qa-fix` Gate 1b uses
`upstreamRef` to diff the fork against unmodified upstream — a non-resolvable ref broke that
diff, over-attributing everything to "client" (safe but kills upstream routing), with no
signal that the ref was never validated.

- `discover-repos.mjs` now resolves the fork line to a **concrete, existing** upstream tag:
  `git ls-remote --tags <upstream>` → pick the smallest tag on the line (its base, e.g.
  `2.49.0` — the guaranteed common ancestor ≤ the fork), falling back to the highest earlier
  tag when the line was never tagged. It writes `upstreamRef` = that tag plus
  `upstreamRefResolved: true|false` and `forkVersion` (kept for reference). Offline / no
  token → keeps the line label, `upstreamRefResolved: false`, and asks the operator.
- `/qa-fix` Gate 1b gains a documented fallback: when `upstreamRefResolved === false` or the
  ref 422s, reconstruct `<major>.<minor>.0` → highest `<major>.<minor>.x` → nearest tag ≤
  line → ask; never silently treat everything as client.
- Reporting: `discover-repos.mjs` prints `… @ 2.49.0 (verified)` / `(UNVERIFIED — ref not
  found)` per frontend fork, and `verify-access.mjs` adds a **"Storefront upstream ref"** row
  (PASS resolves / WARN doesn't — non-blocking, Gate 1b reconstructs / SKIP no fork).
- `clientUpstream()` (`repo-router.ts`) now returns `upstreamRefResolved` + `forkVersion`.
  Existing profiles are safe to leave; a `/project-init` re-run refreshes them, or an
  operator can hand-fix `upstreamRef` to the line base (e.g. `2.49` → `2.49.0`).

---

## [0.7.0] — 2026-07-08

Headline themes since v0.6.0: the **`vc-qa` surface converts from a dormant plugin layout to a project-scoped `.claude/` layout** (auto-discovered on any clone, no manifest), the **marketplace listing swaps `vc-qa` for the self-contained `vc-fix` plugin** — now carrying `/qa-monitoring` + a monitor-only Teams card — and **`/project-init` stops writing generated state into the plugin cache**, writing it into the project instead.

**`**BREAKING:**` `vc-qa` surface converted from a (dormant) plugin layout to a project-scoped `.claude/` layout.**
The full `vc-qa` component tree — `commands/` (23), `agents/` (18), `skills/` (32), `knowledge/`, `hooks/` — was
moved with `git mv` (history preserved) from the repo root into `.claude/commands|agents|skills|knowledge|hooks/`,
so Claude Code auto-discovers it as **project-scoped components in this repo** with no plugin manifest and no
marketplace listing. The `.claude-plugin/plugin.json` (`vc-qa`) manifest was deleted. `/qa-*` and `/ba-*` commands
now load locally on any clone. Path references updated across consumers: the `settings.json` hook path, `package.json`
`local:*` scripts, `scripts/audit-agents-knowledge.ts` + `scripts/validate-critical-ui-scope.ts` (fs reads), `ci/`
agent prompts + monitor oracles, and ~120 relative markdown links inside the moved files (recomputed depth-aware).
`plugins/vc-fix/` and its marketplace listing are unaffected — `vc-fix` remains the distributable plugin.
Migration for an existing checkout: `git pull`; project components load from `.claude/` automatically (reload the
session). Re-packaging as a plugin later means moving the component dirs back to the repo root + restoring a manifest.

**`**BREAKING:**` `vc-qa` removed from the marketplace listing; added `vc-fix`.** `.claude-plugin/marketplace.json`
now lists only `vc-fix` (`plugins/vc-fix/` — the bug-lifecycle subset: `/project-init`, `/qa-bug`, `/qa-fix`
+ dev team, `/qa-verify-fix`, `/qa-monitoring`; 8 agents, 14 skills, 6 commands). `/plugin install vc-qa@vc-tools` no longer
resolves — use `/plugin install vc-fix@vc-tools`. `vc-qa`'s full agent crew (regression, BA, 110 suites)
stays on disk at the repo root, unmodified, but is not currently installable via the marketplace.
`vc-fix` is fully self-contained (its own `knowledge/`, `.claude/rules/`, `scripts/lib/`, `config.js`) —
it does not share files with the root `vc-qa` tree at runtime, since a plugin install has no documented
way to resolve its own install location for cross-file references.

**Added `/qa-monitoring` + `monitor-triage-agent` to `vc-fix`.** Online bug monitoring from
Application Insights (query → fingerprint dedup → triage → live repro → report; detect-and-report
only, never files a ticket or auto-fixes) — a self-contained extract of the full `vc-qa` plugin's
monitoring pipeline. The headless CI twin (`ci/run-monitor.ts`) and its `@azure/identity` REST
client are not shipped; `/qa-monitoring` queries via Azure MCP's `applicationinsights` tool
directly, and the dedup logic + KQL probes live in `plugins/vc-fix/skills/qa-monitoring/`
(`fingerprint-store.ts`, `queries/*.kql`). `vc-fix` now ships 8 agents, 14 skills, 6 commands.

**Added the Teams notification card to `vc-fix`'s `/qa-monitoring`.** A monitor-only extract
of `ci/notify-teams.ts` (the regression-card mode is dropped — no regression pipeline is
shipped) at `plugins/vc-fix/skills/qa-monitoring/notify-teams.ts`. Reads `TEAMS_WEBHOOK_URL`
via `config.js`/`.env.local`; no-ops with a clear message when unset, so `/qa-monitoring`
runs and reports the same with or without it.

**Fixed `/project-init` writing generated state into the plugin cache instead of the project.**
The `vc-fix` `/project-init` generators derived their output root from `import.meta.url`, so an
**installed** plugin wrote `project-profile.json` / `.env.*` / `.mcp.json` / `.claude/settings.local.json`
into the versioned marketplace cache (`~/.claude/plugins/cache/vc-tools/vc-fix/<version>/`) while the
runtime readers (`config.js`, `loadProjectProfile()`) read them from `process.cwd()` — writers and
readers pointed at different dirs, so config never took effect and cache writes were lost on the next
upgrade. New helper `plugins/vc-fix/skills/project-init/lib/paths.mjs` splits the two roots explicitly:
`outputRoot()` = `VC_FIX_HOME || process.cwd()` (all generated project state, symmetric with the readers)
vs `pluginRoot()` = `CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` (read-only plugin assets —
`templates/`, source `config/`; never a write target). All six generators (`gen-profile`, `scaffold-env`,
`scaffold-secrets`, `write-env`, `discover-repos`, `gen-mcp`) default output to `outputRoot()` and read
templates from `pluginRoot()`. `gen-mcp` also copies the three Playwright MCP configs from the plugin
into the project's `config/` (copy-if-absent), since `${CLAUDE_PLUGIN_ROOT}` does not expand inside a
project-level `.mcp.json`. This closes the "not yet fixed" onboarding-CWD question noted in `CLAUDE.md`.

---

## [0.6.0] — 2026-07-07

**Structural fix: the plugin's components now actually load.** In v0.5.0 the plugin installed but almost nothing registered — every component lived under `.claude/`, skills were nested two levels deep, and non-agent files sat inside the agents tree. Claude Code discovers plugin components at the **plugin root** (never `./.claude/`), so this release physically relocates everything to where discovery looks. No behavior of any command/agent/skill changed — only their on-disk location and the internal path references to them.

### Fixed

- **Components moved to the plugin root** — `commands/`, `agents/`, `skills/`, `hooks/` are now siblings of `.claude-plugin/` (were under `.claude/`, which the plugin loader never scans). Moved with `git mv` to preserve history. (`.claude/` still holds non-plugin material: `rules/`, `architecture/`, `ROUTING.md`, `settings*`.)
- **Skills flattened to one level** — every skill is now `skills/<name>/SKILL.md`. The four category folders (`development/`, `qa-methodology/`, `testing/`, `vc-knowledge/`) were removed and their skills promoted; plugin skill discovery is one level only, so the 30 nested skills previously never loaded. All 32 skills now register. No name collisions.
- **Agents flattened to flat top-level files** — the 18 agents are now `agents/*.md` at the plugin root. Plugin **agent discovery is non-recursive** (confirmed against the docs + upstream issue #19202, closed "not planned"), so the previous `agents/{qa,ba,developers}/` subfolders registered **0** agents. Names are unique across teams, so the flat layout is unambiguous.
- **Non-agent files removed from the agents discovery path** — `agents/knowledge/` → a plugin-root `knowledge/` reference dir (28 shared files, not a component type, so never scanned); the three per-team `shared-instructions.md` and the agents `README.md` → `knowledge/agents/`. This stops reference docs from being mis-registered as agents.
- **`SKILL.md` frontmatter** — added a kebab-case `name:` (matching the folder) to the 22 skills that were missing it; every SKILL.md now has `name:` + `description:`.
- **`plugin.json` cleanup** — removed the `category` field (belongs in the marketplace entry; emitted a validation warning) and corrected the component counts in the description (18 agents, 32 skills, 23 commands, 28 knowledge files). No component path overrides added — default root discovery covers everything (and dot-segment override paths like `./.claude/agents` fail manifest validation anyway).
- **Reference rewrite** — updated every path reference to the moved components across the live surface (agents, skills, commands, hooks, knowledge, `.claude/rules`, `.claude/architecture`, `ci/`, `scripts/`, `config/`, `docs/`, and the top-level docs). Historical report artifacts under `reports/` and `vc/` were intentionally left untouched (point-in-time records).

**Verified:** `claude plugin validate .` passes with 0 errors / 0 warnings; `claude plugin details vc-qa` reports 18 agents, 32 skills, 23 commands, 2 hooks (no `knowledge:*` / `shared-instructions` / `README` pseudo-agents).

---

## [0.5.0] — 2026-07-07

Headline themes since v0.4.0: **`/project-init` becomes a derive-driven onboarding wizard** with full client-vs-platform / Jira-vs-Azure-Boards / GitHub-vs-Azure-Repos support, **`/qa-fix` gains ownership-aware routing** (client repos, platform fork-PRs, frontend provenance) behind a hard client-code-containment invariant, and the **seeder is rebuilt** into a single-process, dedup-safe, store-scoped pipeline whose runtime GUIDs all land in per-env `aliases.{env}.json`. All changes remain additive.

### Added

#### `/project-init` — derive-driven onboarding + client/platform routing
- **Deployment-profile onboarding** — `/project-init` now asks only what genuinely shapes config (environment **name**, bug **tracker**, code **host**, per-axis **auth preference**); everything else (native-platform vs CLIENT, client org, contribution mode, fork account) is **derived** from the token + a live module/repo scan. Writes `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` and verifies access.
- **Tracker + code-host adapters** — Jira **or Azure Boards**; GitHub **or Azure Repos**. CI VCS adapters (`ci/lib/vcs/`) + ownership-routed `ci/run-fix-cycle.ts`; PR VCS selected by `contributionPlan.host`.
- **Client-repo discovery** — scans for the client theme / custom modules / storefront fork, classifies ownership, and derives the fork account. `discover-repos.mjs`.
- **Independent auth axes** — PAT recommended, else browser/CLI login per axis; `ensure-session.mjs` drives browser login (az browser SSO + device-code, ADO tenant auto-discovery) without hand-typed commands. GitHub verified via real `gh` write-scope probe (not just "logged in").
- **verify-access readiness table** — prints the full `/qa-fix` readiness table (repos, tracker, host, MCP servers) in chat; existing-env guard prunes inapplicable Azure blocks.
- **Non-interactive writers** — `write-env.mjs`, always-scaffold optional `POSTMAN`/`CONTEXT7` keys in `.env.local`.

#### `/qa-fix` — ownership routing + client-code containment
- **Ownership-routed delivery (quality-gates §1a/§1b/§2a)** — `repoOwnership` / `contributionPlan` route each fix by repo: client repos → PR on the client host (GitHub or Azure Repos); platform repos → direct or **fork-PR** to `VirtoCommerce/*`; too-complex platform bugs → upstream GitHub Issue. Frontend **provenance** (`ci/lib/provenance.ts`) refines a client-storefront-fork bug to client vs unmodified-platform code.
- **Client-code containment — hard security invariant** — client code never leaves the client's project; a platform fork-PR / issue carries only scrubbed platform-generic code. Enforced at routing, G3/G4 review, and the developers team.
- **Platform frontend bug = upstream contribution**, not a fork-patch of the client repo.

#### White-labeling
- **BL-WL two-layer master switch** promoted; suite 067 enriched, WL fixtures wired into 070/071.
- **Brand assets seeded** (Electronics, Fashion) — logo/favicon bytes + thumbnails uploaded via `seed-white-labeling`; `WL-ORG-A` branding wired; vcst + vcptcore WL asset-URL overrides in the per-env alias files.

### Changed

#### Seeding — single-process, dedup-safe, store-scoped rebuild
- **Single-process category + product seeding** eliminates the duplicate-tree corruption from the search-index-lag race; reconcile dedups categories by **CODE**, not display name.
- **Store-scoped catalog** — seed catalog linked into the store's virtual catalog; stock targets the **store main FFC** (all FFCs added to the store); reduced catalog/category fixtures.
- **Auto-enrichment** — seeded products get images + descriptions; seeded categories get a placeholder image + description; complete SEO (`pageTitle`) on all seeded products **and** categories; generic "Catalog" SEO title per catalog.
- **Configurable products** — 4 CFG seeders consolidated into one with aligned category hierarchy; CFG writeback migration completed (runtime GUIDs → `aliases.{env}.json`).
- **Standard products** — prefixed + fully seeded from one CSV source of truth; malformed `STD-001` row repaired.
- **Teardown** now fully sweeps BOPIS, pricelists, and B2B orgs; member-sweep batching + 503 retry hardening (PR #84).
- **POSIX env-prefix npm scripts** use `cross-env` for cross-platform correctness.

#### Test-data — every env owns its aliases
- **All envs (including vcst) write `aliases.{env}.json`**; **no runtime platform GUIDs in committed CSVs** — an unseeded env resolves an id to `""` (clear miss) instead of leaking another env's GUID. Credential-hygiene gate added; `td:reconcile` now checks duplicates, `AGENT-TEST-` prefix, and complete SEO.
- **Configurable-parent storefront URLs** re-pointed to `/products-with-options/cfg-parents/<slug>` after drift; `CON-001` currency corrected EUR → USD.

#### Suites
- **Suite 049** catalog API cases fixed to the real deployed contracts.

---

## [0.4.0] — 2026-07-01

Bug auto-fix + hotfix pipelines land, and the test-data layer becomes env-agnostic. Adds the `/qa-fix` interactive fix loop with its write-capable `developers/` team, the `/qa-hotfix` + `/qa-bundle-check` release pipeline, a unified env-agnostic seeder with live reconciliation gates (VCST-5406), a new `vcptcore-qa1` environment, and a Playwright bump. All changes are additive (new commands, new env vars with safe defaults, new suites) — no breaking changes.

### Added

#### Bug auto-fix pipeline (interactive + headless twins) — PR #20
- **`.claude/rules/quality-gates.md`** — single source of truth for the auto-fix gate ladder **G0–G7**: fix-eligibility triage → single-repo route → reproduce-as-failing-test (red) → minimal fix (green) → code review → build/CI → E2E verification → **human review (never auto-merge)**. Both entry points reference gates by ID and share the no-auto-merge triple guard (permission deny + orchestrator + agent).
- **`/qa-fix VCST-XXXX`** (`commands/qa-fix.md`) — interactive autonomous fix of an already-filed bug. Interactive twin of `ci/run-fix-cycle.ts` (same relationship as `/qa-regression` ↔ `ci/run-regression.ts`).
- **`developers/` agent team** — first write-capable team, isolated from read-only QA agents: `fullstack-backend` (opus; .NET 10 / C# + module Admin SPA Angular, reproduce-as-test → minimal fix → PR) and `backend-reviewer` (opus; Gate-4 diff review before the PR). Plus `shared-instructions.md`.
- **Headless CI auto-fix** — `ci/run-fix-cycle.ts` + `.github/workflows/auto-fix.yml` (JIRA bug → draft PR): `ci/agents/fix-triage-agent.md` / `fix-backend-agent.md` / `fix-frontend-agent.md`, repo allowlist `ci/config/fix-repos.json`, routing/checkout `ci/lib/repo-router.ts`, live module dependency graph `ci/lib/module-registry.ts` (Platform API, cached). npm scripts: `ci:fix`, `ci:fix:dry`.
- **Development skills** (`skills/`, used by `fullstack-backend`): `/dotnet-unit-test` (red repro as xUnit test, never edits existing tests), `/dotnet-fix` (minimal idiomatic .NET 10 fix + build/test gate), `/angular-admin` (module Admin SPA fixes; red→green via uncommitted Node scratch harness since module repos ship no JS test runner).
- **`knowledge/vc-module-architecture.md`** — VC module repo anatomy + .NET 10 / xUnit / Angular conventions for the fix agents.
- **Dedicated write token** — `GITHUB_FIX_BUGS_TOKEN` → `GH_TOKEN` for `/qa-fix` push/PR scope; QA agents stay read-only on GitHub.

#### Hotfix release pipeline — PR #70
- **`/qa-hotfix VCST-XXXX [bundles]`** (`commands/qa-hotfix.md` + skill) — release a hotfix of an already-merged-and-released fix into the bundles currently latest-stable (asks which): resolve task → linked PR → fix commit, verify MERGED + SHIPPED, then per bundle cherry-pick onto `support/<X.Y>` and trigger the repo's "Release hotfix" workflow. Deterministic core: `scripts/hotfix-precheck.ts` (read-only) + `scripts/hotfix-release.ts` (gated write). Never auto-merges; STOPs when no support branch exists. npm: `hotfix:precheck`, `hotfix:release`.
- **`/qa-bundle-check vN | <package.json-url>`** (`commands/qa-bundle-check.md` + skill) — compare a frozen stable bundle's pinned module/Platform/Theme versions against the latest same-line hotfix on GitHub; flags only newer patches on the same major.minor line, traces each to its PR + JIRA task. Upstream discovery step for `/qa-hotfix`. npm: `bundle:check`.

#### Env-agnostic seeding + test-data integrity gates (VCST-5406) — PR #76
- **Unified company-users seeder** (`scripts/seed-data/seed-company-users.mjs` + shared lib) — replaces 4 separate seeders; one entry point for personal / B2B / cross-org memberships / impersonation / loyalty users. npm: `seed:company-users`, `seed:b2b`, `seed:b2b:memberships`, `seed:users`, `seed:impersonation`, `seed:loyalty:users` (+ teardowns). Hardened against reseed id drift; B2B teardown now sweeps all `users.csv` accounts, not just the membership CSV.
- **`seed:bootstrap`** (`scripts/seed-data/seed-bootstrap.mjs`) — env-agnostic seed bootstrap so seeders self-resolve per `TEST_ENV` instead of assuming vcst-qa.
- **Live reconciliation gate** — `td:reconcile` (`scripts/seed-data/reconcile-test-data.mjs`) probes the platform (catalog root exists, `.env.{ENV}` user roles have accounts, B2B users are org-scoped with no global roles, no password literals in committed CSVs). Companion static gate `td:validate` unchanged. New `td:validate:b2b` (`validate-b2b-data.mjs`) checks the B2B relational graph.
- **Portable promotion seeding** — `seed-promotions.mjs` resolves promotion category/product by business key instead of hardcoded ids; fixture refresh for drifted ids + impersonation fixtures.

#### MCP/UCP testing — PR #74
- **UCP MVP scenarios (VCST-5126)** — live execution report + demo script; MCP/UCP testing checklist added.

### Changed

#### Test-data — password-literal migration (VCST-5406)
- **Seed-CSV password columns now carry `{{VAR}}` tokens** (`B2B_USER_PASSWORD` / `TEST_USER_PASSWORD` / `DEFAULT_TEST_PASSWORD` / per-slot `AGENT_SLOT*`), resolved at seed time from `.env.local` by `scripts/lib/user-provision.mjs` `resolvePassword()`. Real values live only in `.env.local` (gitignored) + the team secret store; safe non-prod defaults ship in `templates/.env.local.template`. `td:reconcile` secret-hygiene fails any bare password literal.
- **B2B relational graph aligned** across `test-data/b2b/`; orphaned virtostart fixtures dropped.

#### Environments
- **`vcptcore-qa1` environment added** (`TEST_ENV=vcptcore1`, `.env.vcptcore_qa1`) — PRs #71, #73. Duplicate env config consolidated onto `.env.vcptcore_qa1`; personas wired to `seed:b2b` fixture accounts.

#### Dependencies
- **Playwright bumped to 1.61.1** + `@playwright/mcp` 0.0.77 (PR #72); `npm audit fix` resolved 4 of 5 transitive advisories.

#### Tooling & suites
- **GraphQL runner tooling repaired** (PR #75) — env loading, negative-test scoring, lint defaults.
- **Strict CSV lint ratchet** for regression suites + search-suite fixes.
- **Runner-native GraphQL / configurable suite fixes** — 050b2, 050b4 (`88e098b`, PR #69), 050b5 (CVAL-GQL-007 isolation with pinned addable B2B fixtures), 050i (configurable cases; VCST-5398 cancelled), 050a, 030; 072 recovered blocked configurable-product cases (CFG-PDP-019, CFG-VAR-017/019); VCST-5391 verification; VCST-5177 configurable sorting cases (PR #66).
- **Repo housekeeping** — vcst-qa archive relocated to `vc/shared/`; sprint 26-12 plan added (PR #68).

#### Auto-fix pipeline follow-ups & earlier suite sync

- **`regression/suites/Backend/graphql/050j-graphql-xmarketing.csv`** — +7 cases (13 → 20): VCST-5022 `promotionCoupons` sort coverage — 3 regression guards (endDate/name honored, `;` multi-field separator, silently-ignored syntaxes) + lifecycle sync. Manifest `testCount` updated.
- **`regression/suites/Backend/customer/026-customer-contacts.csv`** — CUST-055 updated for the new `va-filter-panel` contacts filter UI (VCST-5148, PR #24).
- **`commands/qa-test.md`** — `/qa-test` Plan + Write steps now reuse the `/qa-plan` E2E scenario catalog (`skills/qa-plan/e2e-scenario-catalog.md`): Step 2 maps the ticket to its `E2E-*` scenario(s) and inherits their regression-suite traceability; Step 3 folds those scenarios into the scoped `testing-checklist.md`. Closes the gap where `/qa-test` never consulted the 105-scenario catalog. Stays lightweight — produces the scoped checklist, **not** a full `/qa-plan` test plan / RTM / TestRail CSV (full case authoring + peer-review promotion remains a standalone `/qa-plan` run).
- **`ci/lib/repo-router.ts`** — marketing-xAPI routing fixed (`vc-module-x-marketing` resolution); .NET build hardening in the fix cycle.
- **`.gitignore`** — auto-fix transient state ignored: `.fix-workspace/` (cloned product repos), `ci/config/.module-registry.cache.json`, heavy artifacts under `reports/fixes/FIX-*/` (png/har/jpg; fix-report.md + summary.json stay tracked).

---

## [0.3.0] — 2026-06-02

Phase 1 substrate complete. Plugin is honestly positioned, vcst-clean at Layer 1, multi-env-aware end-to-end, and ships a customer CI template. Closes 12 of 20 strategic workstreams (#1, #5, #6, #7, #8, #9, #10, #11, #19, #20, and positioning + support docs from v0.2-prep). 8 workstreams remain for Phase 2 (live pilot validation) and Phase 3 (GA).

### Changed (Tier A — positioning)

- **Plugin positioning honest-reframed** as "starting-point + authoring framework" (Option B from the 2026-06-02 strategic re-audit). The previous "same suites, your storefront" framing was overselling. vcst-qa's 99 suites test VC platform behavior plus vcst-qa-specific data; we now measure: **48.5% apply universally, 51.5% are reference-pattern that customers clone-and-adapt, 0% are pure vcst-internal at the suite level.** Customer-authored suites are the expected workflow, not the exception.
  - `docs/marketing-onepager.md` — full rewrite. Three-layer value (methodology / agents+framework / reference suites). Explicit "what plugin ships" vs "what you write" table.
  - `docs/onboarding.md` — new "What the plugin ships (and what it doesn't)" section. Day 1 / Week 1 / Week 2+ next-steps timeline centers on customer-authored suites.
  - `docs/pilot-runbook.md` § 5 — success metric updated to require customer to author at least one suite for a customer-specific feature during pilot week.

### Added

#### Multi-env safety (workstreams #7 + #8)
- **`scripts/verify-multi-env-filters.ts`** — offline verifier that replays `applyMultiEnvFilters` from `ci/run-regression.ts` against the manifest for 6 scenarios. Deterministic, exits 0 iff every expectation holds. Verified results:
  - virtostart smoke (no restrictions) → 2/2 kept
  - `MODULES_ENABLED=catalog,customer,orders` → 25/99 skipped via modules gate
  - `STOREFRONT_PROFILE=b2c` → 4 b2b/hybrid suites skipped
  - `ENV_RISK=production` (no hatch) → exactly 45 envRiskGate suites skipped (matches manifest's 45 tagged — perfect)
  - `ENV_RISK=production` + `ALLOW_ADMIN_WRITES_ON_PROD=true` → all 99 kept, `escapeHatchActive: true`
  - `PAYMENT_PROCESSORS_ENABLED=cybersource` → suite 040 (other processors) skipped via processors gate
- **`vc/shared/reports/multi-env-verification/verification-2026-06-02.md`** — VC's archived reference artifact (Layer 2). Customer runs of `npm run verify:multi-env:report` land at root `reports/multi-env-verification/`.
- **npm scripts** — `verify:multi-env` (stdout) and `verify:multi-env:report` (writes to disk).

#### Customer CI template (workstream #20)
- **`.github/workflows/customer-template.yml`** — drop-in workflow customers copy into their repo. Checks out `vc-mcp-testing-module` as a subdir, runs `verify:multi-env` + `env:check` preflights, executes `ci:regression` with `workflow_dispatch` inputs for suite selection, test_env, env_risk, storefront_profile, modules_enabled, payment_processors_enabled, allow_admin_writes_on_prod, max_budget. 22 GitHub secrets referenced (8 required, ~14 optional / feature-gated).
- **`docs/test-authoring.md` § 11** — "Running in CI" section documents the template end-to-end (secrets, multi-env inputs, schedule, cost per run).

#### Multi-env Layer 2 split (workstream #6)
- **`vc/` directory** — Layer 2 (VC-internal deployments) sub-tree:
  - `vc/vcst-qa/` — primary VC QA env. `vc/vcst-qa/tests/` now holds per-ticket evidence previously at root `tests/`.
  - `vc/vcptcore-qa/` — second QA env (placeholder until accumulated evidence).
  - `vc/virtostart/` — staging-like env (placeholder).
  - `vc/shared/` — cross-env materials; `vc/shared/workshop/` holds VC training material.
- **`vc/README.md`** — explains Layer 2 model, archive convention, customer-side sparse-checkout to exclude.

#### Per-suite + per-agent + per-knowledge applicability audits (workstreams #5, #10, #11)
- **`scripts/audit-suite-applicability.ts`** — classifies all 99 suites. Output: 48 universal / 51 reference / 0 vcst-specific.
- **`scripts/audit-agents-knowledge.ts`** — tags 39 files via YAML frontmatter. 21 universal / 18 reference.
- **`scripts/audit-aliases.ts`** — classifies 211 aliases. 7 templates / 204 vcst-data.
- **`config/test-suites.json`** — every suite now has `customerApplicability` field.

#### Failure-mode catalog (workstream #19)
- **`docs/troubleshooting.md`** — 20-entry quick-index table mapping error → anchor, categorized: install / config / runtime / MCP / platform / update / regression.

#### Aliases template backfill (workstream #9)
- **`templates/aliases.json.template`** — added `AGENT_POOL_SLOT_1/2/3` (CSV-backed), `ADMIN_ROLE_TESTER`, `ADMIN_ROLES_COMMON`, `ADMIN_USER`, `VIRTUAL_CATALOG_B2B` (inline aliases with `{{REPLACE_*}}` placeholders). Customer install starts from a complete alias set, not a stub.

#### Releases + versioning (workstream #16)
- **`docs/release-process.md`** — full mechanical release workflow: cadence, roles, trigger criteria, 7-step release process, hotfix flow, pre-release flow, anti-patterns.
- **`CHANGELOG.md`** — this file. v0.1.0-alpha + v0.3.0 entries documented.

### Changed

- **`.claude-plugin/plugin.json`** — `version: "0.2.0"` → `"0.3.0"`.
- **`.claude-plugin/marketplace.json`** — `version: "0.2.0"` → `"0.3.0"`.
- **`knowledge/storefront-selectors.md`** — paths updated from root `tests/` to `vc/vcst-qa/tests/` (Layer 2 split).

### Added (already covered above, kept for v0.2.0 work that landed in v0.3.0)

- **`docs/support-runbook.md`** — internal-to-VC playbook for supporting customers running the plugin. Three-tier support model, triage flow, per-branch playbooks, escalation paths, patch-release workflow, customer-communication templates, anti-patterns. Resolves the "TBD" in `docs/distribution.md` § Support Model.

### Deferred to Phase 2 / v0.4.0

- Workstream #3 (live smoke on non-vcst VC) — needs `ANTHROPIC_API_KEY` + ~$3-5 + ~18 min. Documented command lives in `docs/test-authoring.md` § 11.
- Workstream #12 (pilot rehearsal) — protocol shipped this release (`docs/pilot-rehearsal-protocol.md`); the actual rehearsal RUN needs a human.
- Workstream #13 / #17 (pricing + license) — user decisions.
- Workstream #14 (support staffing) — needs named owner.
- Workstream #15 (marketing assets — demo video, getting-started landing) — post-pilot.
- Workstream #18 (telemetry / opt-in usage signals) — post-pilot.
- Drop `TEST_ENV='vcst'` default in `config.js` — coordinated breaking change across npm scripts + GitHub Actions.
- Generalize payment matrix (suite 039 split per processor).
- Move `test-data/aliases.json` into Layer 2 (requires resolver path config).

### Verified

- `npm run env:check` — green on `TEST_ENV=vcst` and `TEST_ENV=virtostart`
- `npm run verify:multi-env` — all 6 scenarios pass
- `npm run suites:lint` — 99 suites, 35 selections, schema valid
- `npx tsx scripts/validate-td-refs.ts` — all suites resolve
- `npm run plugin:check` — manifest OK, env present
- `node skills/run-vc-mcp-testing-module/driver.mjs` — 7/7 checks pass
- `scripts/detect-vcst-isms.ts --suites` — 0 findings
- `scripts/detect-vcst-isms.ts --agents` — 0 findings

### How to tag this release (post-merge)

```bash
git checkout main
git pull
git tag -a v0.3.0 -m "Release v0.3.0 — Phase 1 substrate complete"
git push origin v0.3.0
```

Then announce per `docs/release-process.md` § Step 6.

---

## [0.1.0-alpha] — 2026-06-02

First customer-installable release. Merged via PR #21 into `main`, tagged `v0.1.0-alpha`. Customers should pin to this tag.

### Added

- **`manifest.json`** — plugin metadata at repo root: name (`vc-qa`), version, scope (storefront + Admin SPA), required & optional MCP servers, full envSchema (3-bucketed: plugin-supplied / customer-required / customer-secret), default quality gates.
- **`bootstrap/install.ts`** — interactive 5-step customer onboarding wizard. Scaffolds `.env.{env}`, appends per-env-suffixed secrets to `.env.local`, generates `aliases.{env}.json` stub, validates via `env:check`. Re-runnable for additional env profiles.
- **`templates/.env.local.template`** — customer-secrets template demonstrating per-env suffix promotion (`USER_PASSWORD_QA`, `USER_PASSWORD_STAGING`, etc.) so one gitignored file holds all env creds.
- **`templates/aliases.json.template`** — starter aliases.json with `{{REPLACE_*}}` placeholders, privacy-by-default header, and the core 9 aliases every customer needs.
- **`docs/onboarding.md`** — customer-facing quickstart: prerequisites, install, verify, per-env workflow, MCP setup, cost awareness, troubleshooting.
- **`docs/distribution.md`** — distribution model decision: hybrid (Claude Code plugin for `.claude/`, npm for scripts/ci). Versioning + update cadence + support model.
- **`docs/pilot-runbook.md`** — internal VC playbook for running Phase 4 customer pilots: candidate qualification, kickoff agenda, solo-run gate, wrap, feedback capture template, triage workflow.
- **`docs/versioning.md`** — **Tier A:** Tier A/B/C/D stability promises + semver rules + breaking-change definition + customer upgrade path + Tier A artifact lock list.
- **`.claude/architecture/TIER.md`** — file-by-file tier classification (A/B/C/D). Scope: storefront + Admin SPA. Multi-env first-class.
- **`commands/qa-onboarding.md`** — customer's post-install entry-point slash command. 7-step guided flow + `tour` / `smoke` / `troubleshoot` sub-modes.
- **`scripts/detect-vcst-isms.ts`** — read-only scanner that finds vcst-qa hardcoded values (catalog GUIDs, org names, internal emails, vcst URLs). Allow-listed by path. Baseline scan: suite CSVs + agent prompts both 0 findings; remaining hits are knowledge-file conventions.
- **`scripts/tag-suites-multi-env.ts`** — idempotent tagger that derives `requiresModules[]` for Backend suites from their file path. Tagged 33 Backend suites in this release.
- **`scripts/lib/test-data-resolver.ts`** — per-env aliases override support. Loads `aliases.{TEST_ENV}.json` on top of base `aliases.json` when present.
- **`ci/run-regression.ts`** — multi-env filter pass on `resolveSuites()`. Skips suites whose `requiresModules[]` not in `MODULES_ENABLED`, whose `storefrontProfile[]` excludes the active `STOREFRONT_PROFILE`, or whose `envRiskGate` is below the active `ENV_RISK`.
- **`config.js`** — new env vars: `ENV_RISK={dev|test|staging|production}`, `STOREFRONT_PROFILE={b2b|b2c|hybrid}`, `MODULES_ENABLED=<csv>`, `JIRA_PROJECT_KEY=<key>`. `TEST_ENV` now validated against `[a-z0-9_]+` with helpful error on kebab-case.
- **`config/test-suites.schema.json`** — new optional fields: `storefrontProfile[]`, `requiresModules[]`, `envRiskGate`. All optional; existing suites validate unchanged.
- **`config/test-suites.json`** — 33 Backend suites tagged with `requiresModules[]` (one entry per VC module: catalog, customer, orders, marketing, pricing, inventory, notifications, cms, store, search, shipping, returns, loyalty, seo, assets, channels, contracts, import-export, image-tools, whitelabeling, push-messages).
- **`.env.defaults`** — 30-line header documenting the 3-bucket env model + multi-env workflow + ENV_RISK safety gate.
- **`.gitignore`** — `/*.yml` + `/*.yaml` at repo root suppresses Playwright accessibility snapshots that browser MCPs dump to CWD.
- **`package.json`** — `plugin:install`, `plugin:check` scripts.

### Changed

- **`commands/qa-env-check.md`** — rewritten for dual-surface validation. Active config panel front-loaded (TEST_ENV, ENV_RISK, STOREFRONT_PROFILE, MODULES_ENABLED, JIRA_PROJECT_KEY). Storefront and Admin SPA validated independently. Platform health endpoint corrected to `/health` (not `/api/platform/healthcheck`).
- **`commands/qa-bug.md`** — `Project: VCST` instruction now reads from `env.JIRA_PROJECT_KEY` (defaults to VCST for backwards compat).
- **`commands/qa-status.md`** — JQL hardcoded `project = VCST` now uses `${JIRA_PROJECT_KEY}` substitution.
- **`commands/qa-test-plan.md`** — same: 5 JQL queries parameterized.
- **`skills/qa-defect/defect-lifecycle-workflow.md`** — same: 3 JQL queries parameterized.
- **`knowledge/sitemap.md`** — B2B virtual catalog root GUID refs refactored to `@td(VIRTUAL_CATALOG_B2B.id)` with educational qualification ("vcst-qa value is X, customer differs").

### Deprecated

- `VIRTO_START_FRONT` / `VIRTO_START_BACK` exports in `config.js` marked with `TODO(qa-agentic-standardization)` — these are vcst-internal env field names. Consumers should switch to `TEST_ENV=virtostart` + the standard `FRONT_URL` / `BACK_URL`. Removal scheduled for v0.2 once the 13 consumer files migrate.

### Not Yet Done (deliberately deferred)

- Drop the `TEST_ENV='vcst'` default in `config.js` — breaking change pending coordinated update across npm scripts + GitHub Actions workflows.
- Tag remaining Frontend suites with `storefrontProfile[]` — needs content review of ~10 obvious-B2B suites.
- Tag write-suites with `envRiskGate: "staging"` — needs read/write classification per suite.
- Generalize the payment matrix (suite 039 split per processor).
- Move admin role names to `aliases.json`.
- Refactor ~1300 vcst-ism refs in `knowledge/` (live-discovery, test-runner-tags, critical-ui-scope, shared-instructions, graphql-test-cases-runner) — case-by-case judgment between template-via-@td vs annotate-as-example.
- `docs/migrations/` directory for breaking-change migration guides (created when first such change ships).
- `CHANGELOG.md` entry-by-entry SHA links — added when first tagged release ships.

### Verified

- `npm run env:check` — green on `TEST_ENV=vcst`
- `TEST_ENV=customer-staging-eu npm run env:check` — exits with helpful underscore hint (kebab-case validation works)
- `ENV_RISK=production npm run env:check` — prints production warning at startup
- `npm run plugin:check` — manifest OK, .env.vcst present, .env.local present, env:check delegated successfully
- `npx tsx scripts/validate-td-refs.ts` — 79/79 suites resolve `@td()` references
- `npx tsx scripts/tag-suites-multi-env.ts` — idempotent (re-run = no-op after first run)
- `npx tsx scripts/detect-vcst-isms.ts --suites` — 0 findings (suite CSVs clean)
- `npx tsx scripts/detect-vcst-isms.ts --agents` — 0 findings (agent prompts clean)
- `npm run suites:lint` — 99 suites, 35 selections, schema valid

---

## How Versions Will Be Assigned (going forward)

When the first tagged release cuts:

- **v0.1.0-alpha** — current branch tip. First customer-installable build. NOT for production use.
- **v0.1.x** — bugfix patches against the alpha (no new features).
- **v0.2.0** — after Pilot 1 completes. Folds in pilot feedback's `must-fix-before-next-pilot` items.
- **v0.5.0** — after 3 pilots complete. Triage stabilizes; documentation refines.
- **v1.0.0** — Tier A formally frozen per `docs/versioning.md`. Public GA.

Each release cuts from `feature/qa-agentic-standardization` (or its successor branch). Tags follow the form `v0.1.0-alpha`, `v0.1.0`, `v0.2.0-beta`, etc.

---

## References

- Strategic plan: [`~/.claude/plans/functional-singing-cosmos.md`](file:///~/.claude/plans/functional-singing-cosmos.md)
- Tier classification: [`.claude/architecture/TIER.md`](.claude/architecture/TIER.md)
- Versioning contract: [`docs/versioning.md`](docs/versioning.md)
- Customer onboarding: [`docs/onboarding.md`](docs/onboarding.md)
- Pilot runbook: [`docs/pilot-runbook.md`](docs/pilot-runbook.md)
- Distribution model: [`docs/distribution.md`](docs/distribution.md)
