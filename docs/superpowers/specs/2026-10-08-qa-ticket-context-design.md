# `/qa-ticket-context` — one ticket-context skill for every agent that reads a ticket

> **Status: DRAFT — for review.** Nothing here is built yet. §11 records proposed decisions (D1–D7) on the
> questions the first draft left open plus where the skill lives first; each can be overturned in review. Comment on the PR; do not edit
> this file in parallel.

## 1. Problem

Agents misread tickets in the same few ways. They treat an empty description as "no ACs" when the ACs
sit in a custom field. They skip comments. They note that an attachment exists without opening it. They
ignore links. They read a PR diff without asking whether that PR is deployed on the stand under test.

The fetch-and-analyse rules that prevent this already exist, but only in one pipeline and only as prose:

| Where | What it does today |
|---|---|
| `.claude/skills/qa-test/preflight.md` §1a | fetch rules: comments always, attachments opened, an unreadable one is a noted gap |
| `.claude/skills/qa-test/context-wave.md` §1c, §1c-map, §1d | FULL-path context gathering + story review |
| `.claude/skills/qa-test-fast/context-wave.md` Wave 1 + Join 1 | three parallel dispatches (ticket · PRs · domain map) joined into a "context bundle" |
| `.claude/skills/qa-test/technical-change.md` §2.1 | the measured four-rung ladder for finding a ticket's PRs |
| `.claude/skills/qa-test-model/SKILL.md` §Inputs | already accepts `--context <file>` |

Every other consumer fetches the ticket its own way and inherits none of those rules: `ba-analyze`,
`qa-test-plan`, `qa-test-lifecycle`, `qa-hotfix`, and in the plugin `qa-bug`, `qa-fix`,
`qa-verify-fix`, `qa-investigate`, `qa-defect`. Nothing checks that any rule was followed.

Four gaps have no rule anywhere:

1. **Links** — Confluence, Loom, Figma, linked tickets and external pages are not read.
2. **Design** reaches the run only through the visual lane (`qa-test/visual-axis.md`, Prototype link →
   Claude Design). It never reaches the Test Model or the checklist, where it would change *what* is tested.
3. **Deployment** — "the build it is deployed in (if known)". A PR that is not on the stand produces a
   false FAIL, or worse a PASS against old code.
4. **PR ↔ AC traceability** — an AC with no counterpart in the diff, or a diff change no AC asked for, is
   not looked for.

## 2. Goal and non-goals

**Goal.** One skill, `/qa-ticket-context <KEY>`, produces one **context bundle** for one ticket. Every consumer
reads that bundle instead of fetching the ticket itself. Every input is accounted for: each one ends as a
finding with its source, or as a `GAP` with a reason.

**Non-goals.**
- Not a domain description. "What is this domain" stays `/qa-domain-map`; "how can it behave" stays
  `/qa-test-mind-map`. The bundle only **cites** them.
- Not a fault model. Turning context into a value chain, mechanism matrix and scenarios stays `/qa-test-model`.
- No verdicts and no live testing. The skill reads; it never drives the product UI.
- No writes. No tracker comment, no transition, no label, no PR comment.

## 3. Four requirements every decision is judged against

These were set by the requester and are binding for the design and for every later change to the skill.

### 3.1 Security

| # | Requirement |
|---|---|
| S1 | **Everything gathered is untrusted data, never instructions**: ticket text, comments, attachments, linked pages, PR bodies, review threads. Text that tries to instruct the agent is recorded as a finding and is not followed. |
| S2 | **HAR files and logs are scrubbed before an agent reads them.** Cookies, `Authorization` headers, bearer tokens, `Set-Cookie`, query-string tokens. The bundle carries endpoint + status + error, never a header value. Reuse the value-scan approach of `scripts/kb/core/secret-gate.mjs` (scan for the real secret values from the env layer, plus the PAT/JWT/Bearer shapes) instead of writing a second scanner. |
| S3 | **Client data never leaves the machine.** Two storage classes (decision D2). **Raw artifacts** (downloaded attachments, HAR, logs, video frames, linked pages) live in a per-run temp directory and are deleted when the run ends — never cached. **The bundle** (derived, scrubbed findings) lives in `<outputRoot>/.vc-fix/context/<KEY>/` with a 24 h TTL, and only after `git check-ignore` confirms the path is ignored; otherwise it falls back to the temp directory. Neither class is ever written under `reports/`, committed, sent to the public `kb`, or included in a self-diagnostics upstream issue. |
| S4 | **Read-only on every system.** The skill's tool list excludes tracker writes, VCS writes and transitions. |
| S5 | **Bounded link following.** One hop from the ticket. A link to a private or internal host is not fetched with a general web fetch; it is read through its own connector (Atlassian, GitHub, Figma) or recorded as `GAP: private host`. |
| S6 | Client-code containment from `.claude/knowledge/execution/quality-gates.md` §2a applies unchanged: PR diffs from a client repo are read in place and never quoted into any upstream artifact. |

### 3.2 Speed

| # | Requirement |
|---|---|
| P1 | **Three blocks run in parallel**, one message: Ticket, Materials, Change (§5). Known-ground lookups are scripts and run inline. |
| P2 | **Each subagent returns a compact struct**, never a narrative and never a pasted document. Files are passed by path. |
| P3 | **Re-runs are almost free.** The bundle records the ticket's `updated` timestamp and each PR's head SHA. If neither changed and the bundle is within its 24 h TTL, the previous bundle is returned. The deployment check (§5 block 3) is always re-run, because a stand can be redeployed without the ticket or PR changing. |
| P4 | **Fetch only the fields used.** An all-fields Jira fetch returned ~76,000 characters on VCST-4717 (`technical-change.md` §2.1). Request the named fields plus `development`; never the whole issue. |
| P5 | **Hard caps on heavy inputs**: attachment size, frames per video, pages per document, PRs per ticket. Above a cap ⇒ `GAP: over cap`, never a wait. |
| P6 | Target: a typical ticket (≤3 attachments, ≤2 PRs) closes in under 5 minutes wall clock. Measured, not assumed — see §10. |

### 3.3 Quality

| # | Requirement |
|---|---|
| Q1 | **Every input has an outcome.** Each attachment, inline image, link, PR and AC ends as `finding` (with source + date) or `GAP` (with reason). A row with neither fails the gate. |
| Q2 | **Provenance on every fact**: field name, or comment id + date, or file + line, or URL. |
| Q3 | **Conflicts are surfaced, never resolved.** AC vs design, AC vs diff, comment vs description. The bundle lists them as open questions. |
| Q4 | **The diff is a hypothesis about what the code does, not an oracle for what the product should do.** AC and VirtoOZ docs decide expected behaviour; a disagreement with the diff is a finding. |
| Q5 | **The bundle's shape is checked by a script** against a JSON schema, not by the prompt alone. It is code, so it gets a gate (`CLAUDE.md` §Essential Rules → NO CODE ⇒ NO UNIT TEST; the gate is the schema check, not a committed unit test). |
| Q6 | Before release, the skill is replayed on past tickets and compared with what QA found by hand (§10). |

### 3.4 Production-ready for clients

| # | Requirement |
|---|---|
| C1 | **Plugin-ready from day one; plugin-resident later (decision D7).** The skill is built in this repo's `.claude/` first, because its first consumers (`/qa-test-fast`, `/qa-test`) live here and the design still has to prove itself (§10). Clients install `vc-fix`, not `.claude/`, so it is written to the portability contract (§4a): moving it into the plugin must be a copy plus a version bump, not a rewrite. |
| C2 | **Tracker and code host come from `project-profile.json`** (`tracker.kind`, the code host, the org). No hardcoded `VirtoCommerce` org, no Jira-only path. Today's PR ladder hardcodes `gh search prs --owner VirtoCommerce`; the skill reads the owner from the profile and falls back to it only when no profile exists (the documented "absent profile ⇒ native-platform defaults" behaviour). |
| C3 | **Every tool has a fallback and a named failure.** No `gh` (cloud sessions) ⇒ GitHub MCP. No Figma or Atlassian connector ⇒ `GAP: connector unavailable` with the remedy. Never a silent skip. |
| C4 | **Path resolution follows `plugins/CLAUDE.md` already in `.claude/`**: state under an `outputRoot()` equivalent (`VC_FIX_HOME || process.cwd()`), the skill's own assets resolved from `import.meta.url`, never from the working directory. In this repo both resolve to the repo root; after the move they keep working unchanged. |
| C5 | **`SKILL.md` ≤ 19,000 characters** (BUDGET-004). Method detail lives in supporting files read on demand. |

## 4. Placement

**Now (Phases 1–3): this repo, project-scoped.**

```
.claude/skills/qa-ticket-context/
  SKILL.md            # contract, the five blocks, the gate, the four requirements (≤19k, BUDGET-004)
  ticket.md           # block 1 — fields, ACs, comments, epic/siblings
  materials.md        # block 2 — attachments, inline images, links, per-type handling
  design.md           # block 2b — design sources and what to extract
  change.md           # block 3 — PR ladder, deployment, PR↔AC, hidden-behaviour checklist
  known-ground.md     # block 4 — domain map, mind map, BL/ECL, kb, prior runs
  bundle.schema.json  # the output contract
  lib/
    check-bundle.mjs  # schema + Q1 completeness gate
    scrub.mjs         # S2 — wraps the value-scan approach for HAR/logs
    cache.mjs         # P3 — freshness key (ticket updated + PR head SHAs), TTL, check-ignore guard
    paths.mjs         # C4 — outputRoot / own-asset resolution
.claude/agents/ticket-context-analyst.md   # D6 — the one read-only agent for blocks 1–3
```

**Later (Phase 5): the same tree under `plugins/vc-fix/skills/qa-ticket-context/` and
`plugins/vc-fix/agents/`**, and the `.claude/` copies are deleted in the same commit — one home at a
time, never two (the `.claude/` developer-agent duplicates forked once and were removed on 2026-09-25,
`.claude/rules/agents.md` §Developers Team).

### 4a. Portability contract — what keeps the move a copy

Every rule here is checked in review of the Phase 1 PR, because nothing after that will check it.

| # | Rule | Why it matters for the move |
|---|---|---|
| M1 | **The skill directory is self-contained.** Its prompts and `lib/` may reference only files inside `qa-ticket-context/` and the agent file. A knowledge file it needs is copied into the skill directory, not cited from `.claude/knowledge/`. | The plugin cannot reach `.claude/` (`plugins/CLAUDE.md`). A citation into `.claude/` is a dangling path after the move. |
| M2 | **Repo tooling is called through a capability check, never assumed.** `npm run domain:check`, `bl:extract`, `regression:select`, `tc:scope`, `kb` exist in this repo, not in a client's project. Block 4 runs each only if present and otherwise records `GAP: not available in this install`. | Block 4 is the part that differs most between this repo and a client install. A hard call would fail the gate on every client run. |
| M3 | **Consumers outside `.claude/` do not call it yet.** `vc-fix` commands (`qa-bug`, `qa-fix`, `qa-verify-fix`, `qa-investigate`) keep their own fetch until Phase 5. | A plugin command referencing a `.claude/` skill breaks the plugin's self-containment for every client. |
| M4 | **Only `lib/*.mjs` with `node:` built-ins and the deps `plugins/vc-fix/package.json` already ships.** | A new dependency is a plugin release item, not something found during the move. |
| M5 | **Name stays `qa-ticket-context`.** Consumers here call it as `/qa-ticket-context`; after the move they call `vc-fix:qa-ticket-context` — a one-line change per consumer, listed in §8. | — |
| M6 | **Tracker, host and org come from `project-profile.json`** (C2) even in this repo, where the defaults apply. | A Jira-only or `VirtoCommerce`-only shortcut taken "for now" is exactly what breaks on a client. |

## 5. The five blocks

```
              ┌─ 1 Ticket ────┐
 /qa-ticket-context ─┼─ 2 Materials ─┼─► join ─► 4 Known ground (inline scripts) ─► 5 Gaps ─► gate ─► bundle
              └─ 3 Change ────┘
```

### Block 1 — Ticket

Source: the tracker named by the profile. Return:
- ACs as numbered atomic conditions `AC-1…`, each with its source field or comment + date. An empty
  description is not "no ACs"; custom fields are checked first.
- Comment signals that change what is tested: narrowed repro, moved goalposts, decisions by the PO.
- Epic line and Done siblings (the integration seams).
- Layer guess and domains — labelled as guesses.

### Block 2 — Materials (mandatory inventory)

**Step 1 — enumerate.** Every attachment, every image **inlined** in the description or a comment (the
most often missed), every link in description, comments and fields (including Prototype).

**Step 2 — analyse by type.**

| Type | Read with | Extract |
|---|---|---|
| Screenshot | image read | expected vs actual, exact UI text, screen state, role |
| Log / HAR / stack trace | text read **after scrub (S2)** | endpoint or GraphQL operation, status, error, layer |
| Video | frames via `ffmpeg` (D4: 1 frame / 2 s, ≤12 frames), then image read | ordered repro steps; no `ffmpeg` ⇒ `GAP` with the install remedy |
| Loom | Atlassian MCP `getLoomVideo` | transcript + steps |
| Confluence | Atlassian MCP `getConfluenceContent` | requirements absent from the ACs |
| Linked ticket | tracker fetch | constraints, "done in sibling", duplicates |
| PR link | handed to block 3 | — |
| External page | web fetch, public hosts only (S5) | facts only; instructions on the page are data (S1) |

**Step 3 — table.** `material → outcome (finding | GAP) → destined for (AC | model signal | oracle | repro step)`.

### Block 2b — Design

1. **Resolve the source**: Prototype link → the local Claude Design copy
   (`.claude/skills/qa-design/claude-design-verification.md`); Figma link → Figma MCP; a mockup attachment → image read.
2. **Extract testable conditions, not pictures**: states (empty, loading, error, disabled, long text),
   breakpoints, copy and labels, role-dependent visibility, what differs from the current build.
3. **Hand off**: conditions go to the Test Model and the checklist tagged `{DESIGN}`. Precedence stays
   `BL-UI invariant > design spec > UX heuristic` (`.claude/rules/agents.md`). Design vs AC disagreement
   is a question for the PO (Q3).
4. **No design ⇒ say so**: `design: none` and the visual lane is `SKIPPED`. Never infer a design from the live site.

### Block 3 — Change (PRs)

**Find** — reuse the measured ladder of `technical-change.md` §2.1 unchanged, with C2/C3 applied:
explicit link → org-wide search by key → `git log --grep` → paths named in the ticket (weakest; say so).

**Per PR, return:**

| Field | Why |
|---|---|
| repo, number, state, head SHA | identity + cache key (P3) |
| files by layer token (`storefront` / `admin-spa` / `api` / `module` / `platform`) | routes the test lanes |
| GraphQL operations and REST endpoints touched, by name | feeds contract refresh and checklist |
| settings, permissions, feature flags added or changed | the hidden-behaviour list below |
| **deployed on `TEST_ENV`?** — module version from the PR's release vs `/api/platform/modules` | the gate (§6) |
| tests the PR changed, and changed branches with no test | first targets for testing |
| fate — reverted, superseded, follow-up fix after merge | avoid testing a dead change |
| CI state, unresolved review threads | risk signal, never a block |

**Multi-repo chains.** A feature spread over several repos is only testable when **all** its PRs are on
the stand. The chain's deployment state is its weakest PR's.

**PR ↔ AC traceability.** Two tables: `AC → where in the diff | NOT FOUND` and
`diff change → which AC | UNDECLARED`. Both directions are findings.

**Hidden behaviour checklist** — always ask of every diff: default values · DB migrations · feature
flags · caching · copy and localisation · search indexing · background jobs · GraphQL schema changes
(nullable, removed, renamed fields).

### Block 4 — Known ground (inline, scripts only)

- Domain map and mind map: path and state (`PRESENT` / `STALE` / `ABSENT`) via `npm run domain:check`;
  changed files mapped to mind-map nodes where the map exists.
- `BL-*` / `ECL-*` the change touches (`npm run bl:extract`).
- Existing cases at risk: `regression:select` / `tc:scope`.
- Observed behaviour: `mcp__kb__kb_ask` with the coordinate (endpoint, operation, page path) in the
  question; `npm run kb -- ask` as fallback. **Read only** — capturing is the consumer's job, and never
  with client data (S3).
- Prior runs on the same ticket under `reports/tickets/**`, open bugs linked to it.

### Block 5 — Gaps

One list, every block's `GAP` rows plus the open questions from Q3. This is the most important output:
a consumer must see "there are no ACs" rather than invent them.

## 6. The gate

`lib/check-bundle.mjs` fails the run when:

1. The bundle does not match `bundle.schema.json`.
2. Any enumerated material, PR or AC has neither a finding nor a `GAP` (Q1).
3. Deployment of the change on `TEST_ENV` is neither proven nor recorded as `NOT DEPLOYED` / `UNKNOWN`.
   `NOT DEPLOYED` does not fail the gate; it sets `bundle.blockers[]` so the consumer can stop or mark
   the run `BLOCKED`.
4. A scrubbed-file marker is missing for any HAR or log that was read (S2).

A ticket with no attachments, links or PRs passes in seconds with empty tables marked `none` — an empty
inventory is a result.

## 7. Bundle shape (sketch)

```json
{
  "ticket": "VCST-0000",
  "fetched_at": "…", "ticket_updated": "…",
  "freshness_key": "…",
  "acs": [{ "id": "AC-1", "text": "…", "source": "customfield_X | comment:123@2026-10-01" }],
  "signals": [{ "text": "…", "source": "…" }],
  "materials": [{ "kind": "screenshot|har|log|video|loom|confluence|ticket|pr|external",
                  "ref": "…", "outcome": "finding|GAP", "finding": "…", "reason": "…",
                  "destination": "ac|model|oracle|repro", "scrubbed": true }],
  "design": { "source": "claude-design|figma|attachment|none", "conditions": [] },
  "change": { "prs": [{ "repo": "…", "number": 0, "head_sha": "…", "layers": [],
                        "operations": [], "endpoints": [], "settings": [],
                        "deployed": "YES|NO|UNKNOWN", "tests_changed": [], "untested": [],
                        "fate": "…", "ci": "…", "open_threads": 0 }],
              "chain_deployed": "YES|NO|UNKNOWN",
              "ac_to_diff": [], "diff_to_ac": [], "hidden_behaviour": [] },
  "known": { "domain_map": {}, "mind_map": {}, "bl": [], "ecl": [], "cases_at_risk": [],
             "kb": [], "prior_runs": [] },
  "gaps": [{ "where": "…", "reason": "…" }],
  "questions": [{ "conflict": "…", "sources": [] }],
  "blockers": []
}
```

The schema is the contract; the sketch is illustrative.

## 8. Consumers and migration

| Consumer | Today | Phases 1–4 (skill in `.claude/`) | Phase 5 (skill in plugin) |
|---|---|---|---|
| `/qa-test-fast` Stage 1 Wave 1 + Join 1 | its own A/B/C dispatches | calls `/qa-ticket-context`; keeps Wave 2+ | `vc-fix:qa-ticket-context` |
| `/qa-test` FULL 1a fetch rules, 1c, 1d | prose in `preflight.md` / `context-wave.md` | 1a routing stays; fetch + 1c become the skill call; 1d reads the bundle | `vc-fix:qa-ticket-context` |
| `/qa-test-model` | `--context <file>` | unchanged — the bundle is the file | unchanged |
| `ba-analyze`, `qa-test-plan`, `qa-test-lifecycle`, `qa-hotfix` | own fetch | read the bundle where they work per ticket | `vc-fix:qa-ticket-context` |
| `vc-fix:qa-bug`, `qa-fix`, `qa-verify-fix`, `qa-investigate` | own fetch | **unchanged** (M3) | read the bundle |

Each migrated file **cites** the skill and deletes its restated rules, so the rules live once.

## 9. Rollout

1. **Phase 0 — this review.** Agree §3, §4a and the §11 decisions.
2. **Phase 1 — skill + gate + `ticket-context-analyst` agent in `.claude/`**, wired into `/qa-test-fast` only.
   No plugin release.
3. **Phase 2 — validation (§10).** Proceed only if it beats the current Stage 1.
4. **Phase 3 — `/qa-test` FULL**, then the BA/planning commands in this repo.
5. **Phase 4 — delete the restated rules** from `preflight.md` and both `context-wave.md` files.
6. **Phase 5 — move to `vc-fix`.** Trigger: Phase 2 passed **and** a client deployment needs it (the
   first `vc-fix` command that would consume it). Steps: copy the tree (§4) into the plugin, delete the
   `.claude/` copies in the same commit, switch §8 consumers to `vc-fix:qa-ticket-context`, migrate the
   plugin's own commands, add the `deployProbe` question to `/project-init` (D3), bump `vc-fix` minor and
   tag per `docs/release-process.md`. Before tagging, run it once on a client stand to settle the open
   fact in D3.

## 10. Validation

Replay the skill on 5 past tickets that already have a QA run, chosen to cover: one with inline
screenshots, one with a video or Loom, one multi-repo change, one with a design link, one with almost no
description. For each, compare:

- ACs and conditions the bundle found vs what the run's checklist ended up testing;
- bugs the run filed that a bundle finding would have pointed to (lead time);
- false facts in the bundle (a finding with wrong provenance counts as false);
- wall clock and token cost vs the current Stage 1.

Figures stay out of the repo (public); they go to the tracking ticket.

## 11. Decisions (proposed — open for review)

The first draft left six questions open (D1–D6); D7 records where the skill lives first. These are the proposed answers, each judged against §3.

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Name | **`qa-ticket-context`** (`/qa-ticket-context` now, `vc-fix:qa-ticket-context` after Phase 5) | `qa-context` reads as a sibling of `npm run context:check`, which lints prompt size and has nothing to do with tickets. The longer name says what the skill gathers context *for*. |
| D2 | Cache location | **Split by data class.** Bundle: `<outputRoot>/.vc-fix/context/<KEY>/`, 24 h TTL (in this repo `.vc-fix/` is already gitignored), written only if `git check-ignore` confirms the path is ignored (else temp dir). Raw artifacts: per-run temp directory, deleted at run end, never cached. | Speed (P3) needs the bundle to survive between runs on the same ticket; security (S3) does not allow raw client attachments, HARs or frames to sit on disk. The bundle is derived and scrubbed, so it carries far less. `.vc-fix/` is already the plugin's gitignored local-state root (self-diagnostics uses it), and `project-init`'s `lib/gitignore.mjs` already adds ignore entries in client projects — reuse it rather than trusting that the client's `.gitignore` covers the path. |
| D3 | Deployment check on client stands | **Three steps, in order.** (1) Modules via `GET /api/platform/modules`, which returns installed module versions but **requires authentication** (`kb` KB-B858E12A), so it runs with the env layer's least-privileged read credential. A module whose version matches but which carries a load error is **not** deployed (KB-E4699C30: an older-minor dependency makes the platform mark it with an error). `/health` is not proof: it can keep answering 200 from the old instance during a restart (KB-B858E12A). Whether a client's own custom modules appear in this list is **unverified**; it is checked on a client stand before the Phase 5 release, and until then this step is not relied on for client modules. (2) The storefront or theme via a probe declared in `project-profile.json` as `deployProbe` (a version endpoint or build-info URL); the `/project-init` question for it ships with Phase 5, until then it is set by hand. (3) Nothing declared ⇒ `UNKNOWN`. | `UNKNOWN` does not block; it puts a blocker-lite line in `bundle.blockers[]`, and the consumer must write "deployment unverified" into its verdict. A silent `UNKNOWN` would let a PASS on old code look like a real PASS — the exact failure §1 names. Guessing a storefront endpoint that does not exist on every build would violate C3. |
| D4 | Video | **`ffmpeg` is a soft dependency.** Detected at run time with `command -v ffmpeg`; not added to `package.json`. Caps: 1 frame every 2 s, at most 12 frames, video only (audio is not transcribed). Absent ⇒ `GAP: ffmpeg not installed` with the install remedy. | Bug videos are often the only place the repro order exists, so a hard `GAP` throws away the input most worth reading. A hard dependency would break installs where `ffmpeg` is unavailable (C3). Loom keeps its own path through the Atlassian connector's transcript. |
| D5 | `kb` writes | **Strictly read-only.** The skill asks the `kb`; it never captures, confirms or disputes. | The `kb` is a public repository, and `scripts/kb/core/secret-gate.mjs` states its acceptance rests on the consumer being this repo — "extending the base to client deployments must re-decide it first". A plugin skill runs in client deployments, so writing from it would be that unmade decision (S3). Consumers in this repo keep the capture duty they already have. |
| D6 | Who runs blocks 1–3 | **One new read-only agent, `ticket-context-analyst`** (in `.claude/agents/` now, moved with the skill in Phase 5), dispatched three times in parallel with block-specific briefs. Its `tools:` frontmatter is an allowlist with no write tools. | `ba-system-analyzer` and `ba-api-specialist` live only in `.claude/agents/`; the plugin ships no BA agents, so a skill built on them could not move (C1, M1). Using them now and swapping later would change the skill's core at the move instead of copying it. One agent with three briefs is one definition to keep under the 19,000-character budget (C5), and a tool allowlist turns S4 (read-only) from a prompt rule into a harness rule. |

| D7 | Where it lives first | **`.claude/` in this repo now, `vc-fix` plugin in Phase 5**, under the §4a portability contract. | Requested by the owner, 2026-10-08. Its first consumers are here, and Phase 2 can still reject the design; building in the plugin first would ship an unproven skill to clients and cost a plugin release per iteration. The contract is what stops "later" from becoming a rewrite. |

**What the decisions add to the build:** the `ticket-context-analyst` agent (D6), a `deployProbe`
field in `project-profile.json` (D3; its `/project-init` question in Phase 5), the `check-ignore` guard
in `lib/cache.mjs` (D2), and the capability checks in block 4 (M2).

## 12. Risks

| Risk | Mitigation |
|---|---|
| Another layer that drifts from the pipelines | Phase 4 deletes the restated rules; consumers cite, never restate |
| The move to the plugin never happens, or happens as a rewrite | §4a reviewed on the Phase 1 PR; Phase 5 has a named trigger; one home at a time, the `.claude/` copy is deleted in the move commit |
| The gate turns into box-ticking (`GAP` everywhere) | `GAP` needs a reason from a fixed vocabulary; the validation counts `GAP` rate per ticket |
| Scrubber misses a secret shape | value-scan of real env secrets first, shapes second; HAR is never read raw |
| Slower than today's Stage 1 | P3 cache, P5 caps, and Phase 2 ships only on a measured win |
