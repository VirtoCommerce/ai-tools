# `/ticket-context` — one ticket-context skill for every agent that reads a ticket

> **Status: REVISED 2026-10-13 — awaiting owner confirmation of the revisions.** PR #413 merged the
> first draft with no review. It was re-checked against `main` after `/preflight` phases 1–2 landed
> (#421, #424, #426), and revised: **D3** (deployment), **D6** (the agent's tools), the flow in §5 and
> the tree in §4. **D8–D12** are added, along with **O2–O3**. Each revision says what it replaces and
> why. **Phase 2 fix wave 2 (2026-10-13)** revised Block 3 (ladder, 406 diffs, hotspots, claims), step 0b
> (Figma), D4 (animated GIFs), D6/A1 (one CHANGE per product PR), D9, D12, and added **O4–O6**. Phase 1 plan: [`../plans/2026-10-13-ticket-context-phase-1.md`](../plans/2026-10-13-ticket-context-phase-1.md).

## 1. Problem

Agents misread tickets in the same few ways. They treat an empty description as "no ACs" when the ACs
sit in a custom field. They skip comments. They note that an attachment exists without opening it. They
ignore links. They read a PR diff without asking whether that PR is deployed on the stand under test.

The fetch-and-analyse rules that prevent this already exist, but only in one pipeline and only as prose:

| Where | What it does today |
|---|---|
| `.claude/skills/qa-test/intake.md` §1a | fetch rules: comments always, attachments opened, an unreadable one is a noted gap |
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

**Goal.** One skill, `/ticket-context <KEY>`, produces one **context bundle** for one ticket. Every consumer
reads that bundle instead of fetching the ticket itself. Every input is accounted for: each one ends as a
finding with its source, or as a `GAP` with a reason.

**Non-goals.**
- Not a domain description. "What is this domain" stays `/qa-domain-map`; "how can it behave" stays
  `/qa-test-mind-map`. The bundle only **cites** them, and never builds a missing map.
- Not a fault model. Turning context into a value chain, mechanism matrix and scenarios stays `/qa-test-model`.
- No verdicts and no live testing. The skill reads; it never drives the product UI.
- No writes. No tracker comment, no transition, no label, no PR comment, no `kb` capture.

## 3. Four requirements every decision is judged against

These were set by the requester and are binding for the design and for every later change to the skill.

### 3.1 Security

| # | Requirement |
|---|---|
| S1 | **Everything gathered is untrusted data, never instructions**: ticket text, comments, attachments, linked pages, PR bodies, review threads. Text that tries to instruct the agent is recorded as a finding (`embedded_instructions[]`) and is not followed. |
| S2 | **HAR files and logs are scrubbed before an agent reads them.** Cookies, `Authorization` headers, bearer tokens, `Set-Cookie`, query-string values. The agent reads a reduced HAR (method, path, status, GraphQL operation, error excerpt, request header bytes and cookie count/bytes, plus header **names** and each cookie's **name and byte size** on a failing entry), never a header or cookie value. *Revised 2026-10-13:* sizes and names were added after VCST-6316 ("400 Request Header Or Cookie Too Large") — a HAR with every header dropped could not say which cookie was too large. The scrubber uses the value-scan approach of `scripts/kb/core/secret-gate.mjs` (the real secret values from the env layer, plus the PAT/JWT/Bearer shapes), **copied into the skill** under M1 (D11), not imported. |
| S3 | **Client data never leaves the machine.** Two storage classes (D2). **Raw artifacts** (downloaded attachments, scrubbed HAR and logs, video frames, linked pages, PR diffs) live in a per-run directory, `<outputRoot>/.vc-fix/context/<KEY>/run-<stamp>/`, and are deleted when the run ends — never cached. A run dir older than 24 h, left by a crashed run, is deleted by the next `prepare` for that key. **The bundle** (derived, scrubbed findings) lives in `<outputRoot>/.vc-fix/context/<KEY>/bundle.json` with a 24 h TTL. Both are written there only after `git check-ignore` confirms the path is ignored; otherwise the run dir falls back to the OS temp directory and the bundle is not cached. Neither class is ever written under `reports/`, committed, sent to the public `kb`, or included in a self-diagnostics upstream issue. *Revised 2026-10-13:* the run dir moved from the OS temp directory into the project, because a subagent reading outside the project triggers a permission prompt that a background dispatch cannot answer. |
| S4 | **Read-only on every system, enforced by the harness.** The agent's `tools:` allowlist is `Read, Grep, Glob` — no shell, no write tool, no network, no MCP (D6). Everything that reaches a remote system runs in the skill's `lib/` (REST with the profile's credential) or, for the sources only a connector can read, in the skill runner (D6). The agent receives **paths**. |
| S5 | **Bounded link following.** One hop from the ticket. A link to a private or internal host is never fetched as a public page; it is read through its own API (tracker, code host) or recorded as `GAP: private-host`. Public pages are fetched by `lib/`, never by the agent (D6), so no agent output can become a request URL. |
| S6 | Client-code containment from `.claude/knowledge/execution/quality-gates.md` §2a applies unchanged: PR diffs from a client repo are read in place and never quoted into any upstream artifact. |
| S7 | **One credential per system, no fallback on refusal.** `lib/` picks the credential for a system once (D9). A `401`/`403` is `GAP: access-denied` naming the variable — it never retries with another token. |

### 3.2 Speed

| # | Requirement |
|---|---|
| P1 | **The three analysis blocks run in parallel**, one message: Ticket, Materials, Change (§5). Everything deterministic runs before them in one script call (`prepare`), and after them in two (`deploy`, `known`). |
| P2 | **Each subagent returns a compact struct**, never a narrative and never a pasted document. Files are passed by path. |
| P3 | **Re-runs are almost free.** The bundle records a freshness key (D10). If the key is unchanged and the bundle is within its 24 h TTL, the previous bundle is returned. The deployment check is always re-run, because a stand can be redeployed without the ticket or PR changing. `--fresh` skips the cache. |
| P4 | **Fetch only the fields used.** An all-fields Jira fetch returned ~76,000 characters on VCST-4717 (`technical-change.md` §2.1). Request the named fields plus the AC field (D8); never the whole issue. |
| P5 | **Hard caps on heavy inputs** (D12): attachment size, frames per video, pages per document, PRs per ticket, diff size. Above a cap ⇒ `GAP: over-cap`, never a wait. |
| P6 | Target: a typical ticket (≤3 attachments, ≤2 PRs) closes in under 5 minutes wall clock. Measured, not assumed — see §10. |

### 3.3 Quality

| # | Requirement |
|---|---|
| Q1 | **Every input has an outcome.** Each attachment, inline image, link, PR and AC ends as `finding` (with source) or `GAP` (with reason). The inventory is built **by a script** from the tracker's own data, so the gate checks the bundle against a list no model wrote (§6 rule 3). |
| Q2 | **Provenance on every fact**: field name, or comment id + date, or file + line, or URL. |
| Q3 | **Conflicts are surfaced, never resolved.** AC vs design, AC vs diff, comment vs description. The bundle lists them as open questions. |
| Q4 | **The diff is a hypothesis about what the code does, not an oracle for what the product should do.** AC and VirtoOZ docs decide expected behaviour; a disagreement with the diff is a finding. |
| Q5 | **The bundle's shape is checked by a script** against a JSON schema, not by the prompt alone. It is code, so it gets a gate (`CLAUDE.md` §Essential Rules → NO CODE ⇒ NO UNIT TEST; the gate is the schema check, not a committed unit test). |
| Q6 | Before release, the skill is replayed on past tickets and compared with what QA found by hand (§10). |

### 3.4 Production-ready for clients

| # | Requirement |
|---|---|
| C1 | **Plugin-ready from day one; plugin-resident later (D7).** The skill is built in this repo's `.claude/` first, because its first consumers (`/qa-test-fast`, `/qa-test`) live here and the design still has to prove itself (§10). Clients install `vc-fix`, not `.claude/`, so it is written to the portability contract (§4a): moving it into the plugin must be a copy plus a version bump, not a rewrite. |
| C2 | **Tracker and code host come from `project-profile.json`**: `tracker.kind` (`jira` \| `azure`), `tracker.baseUrl`, `tracker.fieldMap`, `vcs.clientHost`, `vcs.clientOrg`, `vcs.authEnv`, `upstream.org`, `projectType`. The PR search covers `[upstream.org]` on a platform project and `[vcs.clientOrg, upstream.org]` on a client project. No hardcoded org; with no profile, the documented "absent profile ⇒ native-platform defaults" apply (`jira`, `github`, org `VirtoCommerce`). |
| C3 | **Every source has a named failure.** No credential ⇒ `GAP: no-credential` naming the variable and the `/project-init` remedy. No connector for a connector-only source ⇒ `GAP: connector-unavailable`. Repo tooling absent ⇒ `GAP: not-available-in-install`. Never a silent skip. Azure Boards / Azure Repos are `GAP: connector-unavailable` in Phases 1–4 by design. |
| C4 | **Path resolution follows `plugins/CLAUDE.md` already in `.claude/`**: state under `outputRoot()` (`VC_FIX_HOME || process.cwd()`), the skill's own assets resolved from `import.meta.url`, never from the working directory. In this repo both resolve to the repo root; after the move they keep working unchanged. |
| C5 | **`SKILL.md` ≤ 19,000 characters** (BUDGET-004), and so is the agent file. Method detail lives once, in the agent file (per mode) or in a supporting file read on demand. |

## 4. Placement

**Now (Phases 1–3): this repo, project-scoped.**

```
.claude/skills/ticket-context/
  SKILL.md            # contract, the flow, the gate, the four requirements (≤19k, BUDGET-004)
  design-sources.md   # block 2b — how a Prototype / Figma / mockup source is resolved (M1 copy)
  known-ground.md     # block 4 — the script calls, the kb rule, what goes in `known`
  bundle.schema.json  # the output contract, with one $def per agent mode
  lib/
    cli.mjs           # entry: prepare · attach · deploy · known · compose · check · finish · redeploy
    paths.mjs         # C4 — outputRoot / skillRoot / run dir / cache dir
    gap.mjs           # the closed GAP vocabulary, read from bundle.schema.json (declared once)
    npm.mjs           # capability check + run of repo npm scripts (M2)
    compose.mjs       # deterministic merge of prepare + agent outputs + join + deploy + known
    env.mjs           # the layered .env loader (mirrors config.js; M1 copy)
    profile.mjs       # C2 — tracker, host, orgs, credentials from project-profile.json
    schema.mjs        # a small JSON-schema subset validator (M4: no ajv in vc-fix)
    check-bundle.mjs  # §6 — the gate
    scrub.mjs         # S2 — HAR reduction + log redaction (value-scan copied from secret-gate)
    jira.mjs          # tracker REST: issue, fields, remote links, dev-status, attachment download
    inventory.mjs     # Q1 — attachments, inline images, links, linked issues, PR refs from the issue
    github.mjs        # code-host REST: PR ladder rungs 1–3, PR files/diff/reviews/checks
    fetch.mjs         # downloads + public-page fetch into the run dir, with caps (P5, S5)
    frames.mjs        # D4 — ffmpeg frame extraction with caps (videos and animated GIFs)
    figma.mjs         # 0b — a Figma frame as PNG through the images API, when FIGMA_TOKEN is set
    deploy.mjs        # D3 — PR → artifact → the pre-flight core's answer
    cache.mjs         # P3 / D10 — freshness key, TTL, check-ignore guard
    known.mjs         # block 4 — capability-checked repo tooling (M2)
.claude/agents/ticket-context-analyst.md   # D6 — the one read-only agent for blocks 1–3
                                           #      (prompt: 2026-10-08-ticket-context-analyst-prompt.md)
```

*Revised 2026-10-13.* The first draft had `ticket.md`, `materials.md` and `change.md` beside the agent.
The per-mode method is already in the agent file, which is loaded whole on every dispatch; a second
copy in the skill would be a restated rule (`CLAUDE.md` §Where the rules live). `design.md` is renamed
`design-sources.md` so it cannot be confused with this design document.

**Later (Phase 5): the same tree under `plugins/vc-fix/skills/ticket-context/` and
`plugins/vc-fix/agents/`**, and the `.claude/` copies are deleted in the same commit — one home at a
time, never two (the `.claude/` developer-agent duplicates forked once and were removed on 2026-09-25,
`.claude/rules/agents.md` §Developers Team).

### 4a. Portability contract — what keeps the move a copy

Every rule here is checked in review of the Phase 1 PR, because nothing after that will check it.

| # | Rule | Why it matters for the move |
|---|---|---|
| M1 | **The skill directory is self-contained.** Its prompts and `lib/` may reference only files inside `ticket-context/` and the agent file. A rule or helper it needs from elsewhere (`secret-gate.mjs`, `config.js`'s loader, `qa-design`'s source resolution) is copied in, with a comment naming its origin. | The plugin cannot reach `.claude/` or `scripts/` (`plugins/CLAUDE.md`). A citation or import across that line is a dangling path after the move. |
| M2 | **Repo tooling is called through a capability check, never assumed.** `domain:check`, `bl:extract`, `regression:select`, `tc:scope`, `kb`, `preflight`, `deploy:pr` exist in this repo, not in a client's project. Each is run only if `package.json` declares it, otherwise `GAP: not-available-in-install`. | The tooling is the part that differs most between this repo and a client install. A hard call would fail the gate on every client run. |
| M3 | **Consumers outside `.claude/` do not call it yet.** `vc-fix` commands (`qa-bug`, `qa-fix`, `qa-verify-fix`, `qa-investigate`) keep their own fetch until Phase 5. | A plugin command referencing a `.claude/` skill breaks the plugin's self-containment for every client. |
| M4 | **Only `lib/*.mjs` with `node:` built-ins and the deps `plugins/vc-fix/package.json` already ships** (`dotenv`). No `ajv`, no `tsx` at run time. | A new dependency is a plugin release item, not something found during the move. |
| M5 | **Name stays `ticket-context`.** Consumers here call it as `/ticket-context`; after the move they call `vc-fix:ticket-context` — a one-line change per consumer, listed in §8. | — |
| M6 | **Tracker, host and org come from `project-profile.json`** (C2) even in this repo, where the defaults apply. | A Jira-only or `VirtoCommerce`-only shortcut taken "for now" is exactly what breaks on a client. |

## 5. The flow

*Revised 2026-10-13.* The first draft showed three parallel blocks and nothing before them. In fact
MATERIALS needs the inventory and the downloaded files, and the PR ↔ AC tables need both TICKET's ACs and
CHANGE's diff. Every join is now named.

```
/ticket-context <KEY> [--fresh]
  0  prepare        script    profile · cache check · issue fetch (named fields + AC field) · inventory
                              · downloads · scrub · frames · public pages · PR ladder 1–3 · PR files/diff
  0b connectors     runner    only for inventory items no REST can read: Loom, Figma, Claude Design
  1  TICKET    ┐
  2  MATERIALS ├─ one message, ticket-context-analyst ×3, tools Read/Grep/Glob, input = paths
  3  CHANGE    ┘    (one CHANGE per product PR when there are several — merge-change; rev. 2026-10-13)
  J  join           runner    PR ↔ AC (both directions) · conflicts → questions · embedded instructions
  D  deploy         script    PR → artifact (deploy:pr) → deployed (pre-flight core) → chain
  4  known ground   script    domain/mind map state · BL/ECL · cases at risk · prior runs  (+ kb, runner)
  5  compose → gate → finish  script    merge every output, gaps unioned · schema · completeness vs
                                        inventory · scrub markers · secret scan · cache write
                                        (check-ignore) · run dir deleted
```

### Step 0 — prepare (script)

`node <skill>/lib/cli.mjs prepare <KEY>` writes `prepare.json` into a fresh run dir and prints its path.
It does everything that needs a credential or a shell, so the agent needs neither:

- **Issue.** Named fields only (P4): `summary, description, comment, status, issuetype, labels,
  components, attachment, issuelinks, parent, updated, fixVersions` plus the AC field(s) of D8, with
  `expand=renderedFields`. The raw JSON goes to `ticket.json` for TICKET mode.
- **Inventory (Q1).** Attachments; images inlined in the description or a comment (ADF `media` nodes by
  file name, and rendered `/attachment/content/<id>` references); every link in ADF marks, cards and
  text; remote links; issue links; the epic; PR refs from dev-status and from text. Each item gets a
  `ref`, a `kind`, and where it appeared. **This list is what the gate checks against** (§6 rule 3).
- **Files.** Attachments under the caps are downloaded; HAR/log/trace files are scrubbed (S2) and only the
  scrubbed copy is handed on; videos become frames (D4); public external pages become text (S5).
- **PRs.** Rungs 1–3 of the ladder (§Block 3). Per PR: metadata, files, the diff, review comments,
  unresolved thread count and check-run conclusions, each written to the run dir. *Revised 2026-10-13
  (Phase 2, fix wave 2):* a diff GitHub refuses (406, too large) is assembled from the per-file `patch`
  fields of the files API (`/pulls/{n}/files`, 100 per page, up to the 300-file cap), with `diff --git`
  headers, into the same diff file and under the same 500 KB cap. A file with no `patch` (binary or too
  large) is listed in a `pr:<ref>:patches` gap; the diff is a gap only when the files API failed too.
  *Replaces:* the whole PR's hunks unread on a 406 (VCST-4933, pagebuilder#159).
- Every item that could not be read is already a `GAP` in `prepare.json`, with its reason.

### Step 0b — connector-only sources (skill runner)

Loom has no REST path, Figma's reader is an MCP, and a Claude Design project is a local copy. For each
inventory item of those kinds, the skill runner (the session that invoked the skill, which has the
connectors) reads it once and writes the result into the run dir (`loom-<n>.md`, `figma-<n>.png`), then
adds the path to the item. No connector ⇒ the item keeps `GAP: connector-unavailable`. The runner reads
only items the inventory already lists — it follows no new link.
*Revised 2026-10-13 (Phase 2, fix wave 2):* **Figma is read by `prepare` when the env names
`FIGMA_TOKEN`** (through `process.env` after the layered loader, never printed): `lib/figma.mjs` parses the
file key and node id from the item's full `url` (`node-id=1-2` → `1:2`), calls
`GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png&scale=1` with `X-Figma-Token`, and
downloads the returned image without the token, under the attachment cap. Both hosts are origin-guarded
(api.figma.com; a Figma image host — figma.com or Figma's S3 bucket), redirects are refused, and a refusal
is a gap, never a retry (S7, D9). No token ⇒ the item stays in `needs_connector`, and
`design-sources.md` says to set `FIGMA_TOKEN` or attach a PNG export. *Replaces:* Figma through the MCP
`get_screenshot`, which returns the image to the session, not to a file — every Figma link was a gap.

### Block 1 — Ticket (agent, mode TICKET)

Reads `ticket.json`. Returns:
- ACs as numbered atomic conditions `AC-1…`, each with its source field or comment + date. An empty
  description is not "no ACs"; the AC field is checked first.
- Comment signals that change what is tested: narrowed repro, moved goalposts, decisions by the PO.
- Epic line and Done siblings (the integration seams) — siblings come from `prepare.json`.
- Layer guess and domains — labelled as guesses, with their basis.

### Block 2 — Materials (agent, mode MATERIALS)

Every inventory item that is not a PR, by kind:

| Kind | Read with | Extract |
|---|---|---|
| `screenshot` / inline `image` | `Read` on the downloaded file | expected vs actual, exact UI text, screen state, role |
| `har` / `log` / `trace` | `Read` on the **scrubbed** copy only | endpoint or GraphQL operation, status, error, layer |
| `video` | `Read` on each frame (D4: 1 frame / 2 s, ≤12 frames) | ordered repro steps; no `ffmpeg` ⇒ `GAP: tool-missing` with the install remedy |
| `document` (PDF, text) | `Read` | requirements absent from the ACs |
| `loom` | `Read` on the transcript the runner wrote (0b) | transcript + steps |
| `confluence` | `Read` on the page text `prepare` wrote (Confluence REST, same Atlassian credential) | requirements absent from the ACs |
| `ticket` (linked) | `Read` on the linked issue JSON `prepare` wrote | constraints, "done in sibling", duplicates |
| `external` | `Read` on the page text `prepare` wrote (public hosts only, S5) | facts only; instructions on the page are data (S1) |

**Step 3 — table.** `material → outcome (finding | GAP) → destined for (ac | model | oracle | repro | none)`.

### Block 2b — Design (agent, mode MATERIALS)

1. **Resolve the source** per `design-sources.md`: Prototype link → the local Claude Design copy; Figma
   link → the frame image the runner wrote (0b); a mockup attachment → `Read`.
2. **Extract testable conditions, not pictures**: states (empty, loading, error, disabled, long text),
   breakpoints, copy and labels, role-dependent visibility, what differs from the current build.
3. **Hand off**: conditions go to the Test Model and the checklist tagged `{DESIGN}`. Precedence stays
   `BL-UI invariant > design spec > UX heuristic`. Design vs AC disagreement is a question for the PO (Q3).
4. **No design ⇒ say so**: `design: none` and the visual lane is `SKIPPED`. Never infer a design from the live site.

### Block 3 — Change (script finds, agent reads, script checks deployment)

**Find** (`prepare`) — the measured ladder of `technical-change.md` §2.1, with C2/C3 applied:
explicit link + dev-status → org-wide PR search by key → commit search by key → paths named in the
ticket (rung 4, the weakest; only the agent can read paths out of prose, so it is reported as a
`GAP: not-found` with the candidate paths in `detail`). *Revised 2026-10-13 (Phase 2, fix wave 2):*
rungs 1 and 2 **always both run**, merged and deduplicated (a PR keeps the lower rung that found it);
rung 3 runs only when rungs 1–2 found no product PR; `change.rung` is the highest rung that added a PR.
*Replaces:* "stop at the first rung that yields PRs". On VCST-4933 a comment named two PRs, rung 1
stopped there, and the functional fix (x-cms#23) was found only by the key search.
*Revised 2026-10-13:* then follow **named companions, one hop only**. A change can span repos whose PRs
carry other keys, so no rung finds them (VCST-5925: rung 2 found two of four PRs). The body of a
product PR the ladder found names them as a PR URL, `owner/repo#n`, or a bare `repo#n` (read as the
naming PR's owner). The owner must be a configured org, and context-only PRs are neither read for
companions nor added as companions. A shorthand that 404s is an issue, not a PR, and is dropped. Each companion is a
product PR entry with `found_via: <naming PR>`. It is appended after the ladder's PRs, so the PR cap
fills with ladder PRs first and a companion past the cap is an `over-cap` gap. At most
`CAPS.companions` references are looked up, and the rest are one `over-cap` gap. A companion's own body is never read.

**Per PR, the agent returns** (from the files `prepare` wrote):

| Field | Why |
|---|---|
| repo, number, state, head SHA | identity + cache key (P3) |
| files by layer token (`storefront` / `admin-spa` / `api` / `module` / `platform` / `test` / `other`) | routes the test lanes |
| GraphQL operations and REST endpoints touched, by name | feeds contract refresh and checklist |
| settings, permissions, feature flags added or changed | the hidden-behaviour list below |
| tests the PR changed, and changed branches with no test | first targets for testing |
| fate — reverted, superseded, follow-up fix after merge | avoid testing a dead change |
| CI state, unresolved review threads | risk signal, never a block |
| risk hotspots: `{source: <repo>:<path>:<line>, risk}`, ≤12, most important first (*added 2026-10-13, fix wave 2*) | where to test first; a hotspot names a changed line, and its risk is a testable consequence, not a style remark. The baseline Stage 1's strongest output, which the bundle lacked |
| claims: the PR body's atomic testable statements, `source: pr:<repo>#<n>`, ≤25, always (*added 2026-10-13, fix wave 2*) | the oracle when the ticket has no ACs (VCST-5097). What the author says the change does, never ACs; Step 7 names their count when `acs` is empty |

**Deployed on `TEST_ENV`?** — `lib/deploy.mjs`, after the agents (D3). Not the agent, and not a probe of
its own.

**Multi-repo chains.** A feature spread over several repos is only testable when **all** its PRs are on
the stand. The chain's deployment state is its weakest PR's.

**PR ↔ AC traceability** (the join, by the runner). Two tables: `AC → where in the diff | NOT FOUND` and
`diff change → which AC | UNDECLARED`. Both directions are findings.

**Hidden behaviour checklist** — always ask of every diff: default values · DB migrations · feature
flags · caching · copy and localisation · search indexing · background jobs · GraphQL schema changes
(nullable, removed, renamed fields).

### Block 4 — Known ground (script + runner)

Method: `known-ground.md`. In short:
- Domain map and mind map: path and state (`PRESENT` / `STALE` / `ABSENT`) via `npm run domain:check`.
  The skill never builds a missing map (§2).
- `BL-*` / `ECL-*` for the domain (`npm run bl:extract`).
- Existing cases at risk: `regression:select` with the PRs' changed files; `tc:scope` for the domain.
- Prior runs on the same ticket under `reports/tickets/**`, open bugs linked to it.
- Observed behaviour: `kb`, read-only, under D5 and D11's question rule.

### Block 5 — Gaps

One list, every block's `GAP` rows plus the open questions from Q3. This is the most important output:
a consumer must see "there are no ACs" rather than invent them.

## 6. The gate

`lib/check-bundle.mjs` fails the run when:

1. The bundle does not match `bundle.schema.json`.
2. Any material, PR or AC in the bundle has neither a finding (with source) nor a `GAP` (with a reason
   from the closed list).
3. **Any item of `prepare.json`'s inventory, or any PR it found, is missing from the bundle.** This is
   what makes Q1 a check rather than a promise: the list comes from the tracker, not from a model.
4. Deployment is neither proven nor recorded: every PR has `deployed` ∈ `YES | NO | UNKNOWN`, and
   `chain_deployed` is set (`NONE` when no PR was found). `NO` and `UNKNOWN` do not fail the gate; each
   must have its line in `bundle.blockers[]` so the consumer can stop or mark the run `BLOCKED`.
5. A HAR, log or trace that was read has no scrubbed-file marker (S2).
6. **Any string in the bundle matches a real secret value from the env layer, or a PAT/JWT/Bearer
   shape** (S2, S3). The bundle is the one artifact that outlives the run, so it gets the same value scan
   as the public `kb` queue.

A ticket with no attachments, links or PRs passes in seconds with empty tables marked `none` — an empty
inventory is a result.

## 7. Bundle shape

The schema (`bundle.schema.json`) is the contract. In outline:

```json
{
  "schema": "ticket-context/1",
  "ticket": "VCST-0000", "tracker": "jira",
  "fetched_at": "…", "ticket_updated": "…", "freshness_key": "…",
  "acs": [{ "id": "AC-1", "text": "…", "source": "field:customfield_X | comment:123@2026-10-01" }],
  "signals": [{ "text": "…", "source": "…" }],
  "epic": { "key": "…", "title": "…" }, "siblings": [{ "key": "…", "title": "…", "shipped": "…", "source": "…" }],
  "layer_guess": { "value": "…", "basis": "…" }, "domains_guess": { "value": [], "basis": "…" },
  "materials": [{ "ref": "…", "kind": "…", "outcome": "finding|GAP", "finding": "…", "reason": "…",
                  "detail": "…", "destination": "ac|model|oracle|repro|none", "source": "…", "scrubbed": true }],
  "design": { "source": "claude-design|figma|attachment|none", "conditions": [{ "text": "…", "source": "…" }] },
  "change": { "rung": 1, "prs": [{ "repo": "…", "number": 0, "state": "…", "merged": true, "head_sha": "…",
                        "layers": {}, "operations": [], "endpoints": [], "settings": [],
                        "tests_changed": [], "untested": [], "fate": "…", "ci": "…", "open_threads": 0,
                        "hotspots": [{ "source": "<repo>:<path>:<line>", "risk": "…" }], "claims": [{ "text": "…", "source": "pr:<repo>#<n>" }],
                        "artifact": { "kind": "module", "id": "…", "version": "…" },
                        "deployed": "YES|NO|UNKNOWN", "deployed_reason": "…" }],
              "chain_deployed": "YES|NO|UNKNOWN|NONE",
              "ac_to_diff": [], "diff_to_ac": [], "hidden_behaviour": [] },
  "known": { "domain_map": {}, "mind_map": {}, "bl": [], "ecl": [], "cases_at_risk": [],
             "kb": [], "prior_runs": [] },
  "gaps": [{ "where": "…", "reason": "…", "detail": "…" }],
  "questions": [{ "conflict": "…", "sources": [] }],
  "embedded_instructions": [{ "text": "…", "source": "…" }],
  "blockers": []
}
```

**GAP reasons (closed list):** `not-found` · `unreadable` · `not-scrubbed` · `over-cap` ·
`connector-unavailable` · `private-host` · `access-denied` · `deleted` · `depth-limit` · `tool-missing` ·
`no-credential` · `not-available-in-install`.

## 8. Consumers and migration

| Consumer | Today | Phases 1–4 (skill in `.claude/`) | Phase 5 (skill in plugin) |
|---|---|---|---|
| `/qa-test-fast` Step 0 + Stage 1 Wave 1 + Join 1 | `/preflight … --expect`; own A/B dispatches; C builds a missing domain map | Step 0 keeps `/preflight` **without `--expect`** (the bundle owns the PR deployment answer, D3); A+B become the skill call; **C stays** in `/qa-test-fast` (the skill never builds a map); Join 1 reads the bundle | `vc-fix:ticket-context` |
| `/qa-test` FULL 1a fetch rules, 1c, 1d | prose in `intake.md` / `context-wave.md` | 1a routing stays; fetch + 1c become the skill call; 1d reads the bundle | `vc-fix:ticket-context` |
| `/qa-test-model` | `--context <file>` | unchanged — the bundle is the file | unchanged |
| `ba-analyze`, `qa-test-plan`, `qa-test-lifecycle`, `qa-hotfix` | own fetch | read the bundle where they work per ticket | `vc-fix:ticket-context` |
| `vc-fix:qa-bug`, `qa-fix`, `qa-verify-fix`, `qa-investigate` | own fetch | **unchanged** (M3) | read the bundle |

Each migrated file **cites** the skill and deletes its restated rules, so the rules live once.

## 9. Rollout

1. **Phase 0 — this review.** Agree §3, §4a and the §11 decisions, including the 2026-10-13 revisions.
2. **Phase 1 — skill + gate + `ticket-context-analyst` agent in `.claude/`**, wired into `/qa-test-fast`
   only. No plugin release. The pre-flight core has landed (#421), so block 3's deployment fields are
   built in Phase 1 too (D3); where a PR's state cannot be read they are `UNKNOWN` with a reason, and the
   consumer's verdict says "deployment unverified".
3. **Phase 2 — validation (§10).** Proceed only if it beats the current Stage 1.
4. **Phase 3 — `/qa-test` FULL**, then the BA/planning commands in this repo.
5. **Phase 4 — delete the restated rules** from `intake.md` and both `context-wave.md` files.
6. **Phase 5 — move to `vc-fix`.** Trigger: Phase 2 passed **and** a client deployment needs it (the
   first `vc-fix` command that would consume it). Steps: copy the tree (§4) into the plugin, delete the
   `.claude/` copies in the same commit, switch §8 consumers to `vc-fix:ticket-context`, migrate the
   plugin's own commands, bump `vc-fix` minor and tag per `docs/release-process.md`. **Blocked by O1 and
   O3.**

## 10. Validation

Replay the skill on 5 past tickets that already have a QA run, chosen to cover: one with inline
screenshots, one with a video or Loom, one multi-repo change, one with a design link, one with almost no
description. For each, compare:

- ACs and conditions the bundle found vs what the run's checklist ended up testing;
- bugs the run filed that a bundle finding would have pointed to (lead time);
- false facts in the bundle (a finding with wrong provenance counts as false);
- `GAP` rate per ticket, by reason (a high rate is box-ticking, §12);
- wall clock and token cost vs the current Stage 1. **The current Stage 1 is re-run on the same five
  tickets for the baseline** — no figure for it is recorded today.

Figures stay out of the repo (public); they go to the tracking ticket.

## 11. Decisions

The first draft left six questions open (D1–D6); D7 records where the skill lives first. D3 and D6 were
revised on 2026-10-13 and D8–D12 added; each revision says what it replaces.

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Name | **`ticket-context`** (`/ticket-context` now, `vc-fix:ticket-context` after Phase 5) | Owner's choice (2026-10-08). `ticket-context` says what the skill gathers context *for*, and avoids `qa-context`, which reads as a sibling of `npm run context:check` (prompt-size lint). No `qa-` prefix, on purpose: its consumers are not only QA (`/qa-fix`, BA and planning commands read it too), the same reason `vc-self-check` is not qa-prefixed. |
| D2 | Cache location | **Split by data class, one ignored root.** Bundle: `<outputRoot>/.vc-fix/context/<KEY>/bundle.json`, 24 h TTL (in this repo `.vc-fix/` is already gitignored). Raw artifacts: `<outputRoot>/.vc-fix/context/<KEY>/run-<stamp>/`, deleted at run end, never cached. Both only if `git check-ignore` confirms the path is ignored; else the run dir is an OS temp directory and the bundle is not cached. | Speed (P3) needs the bundle to survive between runs on the same ticket; security (S3) does not allow raw client attachments, HARs or frames to sit on disk. The bundle is derived and scrubbed, and gate rule 6 scans it. `.vc-fix/` is already the plugin's gitignored local-state root, and `project-init`'s `lib/gitignore.mjs` adds it in client projects. |
| D3 | Deployment check | **Revised 2026-10-13. No probe of its own; one asker per run.** After the agents, `lib/deploy.mjs` (a) resolves each PR to its CI artifact with the existing read-only resolver, `npm run deploy:pr -- <KEY> --pr=<ref>… --json` (dry-run: `{kind, id, version, source}` per PR), (b) turns each artifact into an `expect` — an open PR's exact pre-release build, a merged PR's base version — and (c) asks the pre-flight core through its CLI, `npm run preflight -- --for ticket-fast --ticket <KEY> --expect <id>@<version> --json`, reading the `expect` row and `facts.deployed`. `theme` (vc-frontend) and `platform` artifacts are `UNKNOWN: no-live-source` and are **never** sent as `--expect` (the core has no live source for them, and `--expect` on an id it does not list reports "not deployed", a false BLOCK). `chain_deployed` is the weakest PR's. `/qa-test-fast` Step 0 stops passing `--expect`. Both scripts are behind M2 capability checks. | *Replaces:* "Block 3 asks `getEnvFacts()` with `expect: module@version` per PR". The shipped core has no `expect` option — `expect` is a CLI flag (`scripts/preflight/cli.ts`) and its comparison is private to `policy.ts`; and nothing in the first draft mapped a PR to a module version. The resolver that does exists (`scripts/deploy/pr/pr.ts`), and calling the CLI keeps the comparison in one place. Moving `--expect` out of Step 0 fixes an ordering bug: Step 0 ran before the PRs were found. A failed probe stays `UNKNOWN`, never filled from `declared`. Known limitation: O2. |
| D4 | Video | **`ffmpeg` is a soft dependency.** Detected at run time; not added to `package.json`. Caps: 1 frame every 2 s, at most 12 frames, video only (audio is not transcribed). Absent ⇒ `GAP: tool-missing` with the install remedy. *Revised 2026-10-13 (Phase 2, fix wave 2):* an image attachment that is an **animated GIF** (more than one image descriptor, counted by walking the GIF's blocks — no dependency) takes the same path and becomes a `video` item: its frames, with the sampling interval shortened for a short GIF (never below 0.1 s, same 12-frame cap), or `GAP: tool-missing` — "install ffmpeg (winget install ffmpeg)". It is never a finding from frame 1. *Replaces:* a GIF read as a still image (VCST-4933: four GIFs, first frame only). | Bug videos are often the only place the repro order exists, so a hard `GAP` throws away the input most worth reading. A hard dependency would break installs where `ffmpeg` is unavailable (C3). Loom keeps its own path through the connector (0b). |
| D5 | `kb` writes | **Strictly read-only.** The skill asks the `kb`; it never captures, confirms or disputes. | The `kb` is a public repository, and `scripts/kb/core/secret-gate.mjs` states its acceptance rests on the consumer being this repo — "extending the base to client deployments must re-decide it first". A plugin skill runs in client deployments, so writing from it would be that unmade decision (S3). Consumers in this repo keep the capture duty they already have. See also D11 for asks. |
| D6 | Who runs blocks 1–3, with what tools | **Revised 2026-10-13. One new agent, `ticket-context-analyst`, dispatched three times in parallel with mode-specific briefs, with `tools: Read, Grep, Glob` and nothing else.** All remote reads move to `lib/` (tracker REST, Confluence REST, code-host REST, public pages) or, for Loom/Figma/Claude Design, to the skill runner (step 0b). *Revised 2026-10-13 (Phase 2, fix wave 2):* with more than one product PR, CHANGE is one dispatch per product PR in the same message (brief line `PRS: <ref>`), merged by `cli.mjs merge-change` (analyst-prompt A1). | *Replaces:* an allowlist of exact MCP tool ids. Checked against this session: the draft's ids (`mcp__Atlassian_MCP__…`) match neither Atlassian server in use (`mcp__atlassian__…` from `.mcp.json`, `mcp__claude_ai_Atlassian_MCP__…` from the connector), and the two do not even share tool names (`getConfluencePage` vs `getConfluenceContent`; only the connector has `getLoomVideo`). MCP ids are per-install, so no fixed list is portable (C1). A server-level pattern (`mcp__atlassian`) is documented, but it would admit the server's write tools and break S4. How a `tools:` allowlist treats deferred MCP tools and unknown ids is not documented. With no MCP and no network in the agent, S4 and S5 hold by construction, the prompt-injection exfiltration path through `WebFetch` is gone, and the PR ladder runs the same in cloud sessions. Cost: `lib/` needs a tracker and a code-host credential, which `/project-init` already sets up (PAT recommended); without one, the items are `GAP: no-credential`. |
| D7 | Where it lives first | **`.claude/` in this repo now, `vc-fix` plugin in Phase 5**, under the §4a portability contract. | Requested by the owner, 2026-10-08. Its first consumers are here, and Phase 2 can still reject the design; building in the plugin first would ship an unproven skill to clients and cost a plugin release per iteration. The contract is what stops "later" from becoming a rewrite. |
| D8 | Where the ACs are | **The AC field is resolved, not guessed.** `tracker.fieldMap.acceptanceCriteria` from the profile wins; else `prepare` lists the tracker's fields once (`/rest/api/3/field`) and takes every custom field whose **whole** name is the term, `/^\s*accept[ae]nce(\s+criteria)?\s*$/i`: "Acceptance" or the misspelt "Acceptence", with or without " criteria", in any case. A name that only extends the term ("Acceptance criteria improvement") is a different field and is not taken. *Revised 2026-10-13:* the first rule, `/acceptance criteria/i`, missed a site whose ticket ACs sit in a field named just "Acceptance" and took only empty look-alikes. Those ids join the named fields (P4). None found ⇒ the agent reads description and comments only, and `gaps[]` says the field was not found. | P4 forbids the all-fields fetch, and the first draft's "custom field first" named no field — today's Stage 1 fetches all fields for exactly this reason. The id differs per Jira site, so it cannot be hardcoded (GOLDEN RULE). `fieldMap` is the profile's existing operator-owned slot for this. |
| D9 | Credentials | **One per system, chosen once.** Tracker: `JIRA_BASE_URL` (else `tracker.baseUrl`) + `JIRA_EMAIL` + `JIRA_API_TOKEN`. Code host: the variable named by `vcs.authEnv`, else `GIT_TOKEN`, else the `gh` CLI session. Figma (optional, *added 2026-10-13*): `FIGMA_TOKEN`; absent, Figma stays a connector item (step 0b). Absent ⇒ `GAP: no-credential` naming the variable. A refusal is `GAP: access-denied`, never a retry with another credential (S7). | Read paths need a credential the agent no longer has (D6). The variable names are the ones `scripts/lib/jira-search.ts`, `scripts/deploy/lib/github.ts` and `/project-init` already use. Retrying a refusal with a different token hides a permission problem and acts with an identity the operator did not choose. |
| D10 | Freshness key | **Ticket `updated` + each PR's head SHA, `state` and `merged_at` + each linked issue's `updated` + `--domain` + a fingerprint of the skill's own files and the analyst prompt.** A merge or a different domain invalidates the cache (a merge leaves the head SHA unchanged), and so does any change to the skill: a scrubber or prompt fix that does not change the schema would otherwise serve bundles built by the old code for 24 h (*added 2026-10-13*). A change to a Confluence page, Figma file, Loom or external page is **not** detected; `--fresh` skips the cache. | *Replaces:* ticket `updated` + PR SHAs only. Linked issues are free (same REST call). The rest would cost a request per source on every cache check; documenting the blind spot is cheaper and honest. |
| D11 | Copies and the kb question rule | **`scrub.mjs` copies** `secretValuesFrom`, `TOKEN_SHAPES` and the env-file list from `scripts/kb/core/secret-gate.mjs`, with a header naming the origin. **kb questions are built from coordinates only** (endpoint, GraphQL operation, page path), never from ticket text; each ask is closed with `kb_show` or `kb_none`; hit ids `/preflight` step 3 already returned are reused, not re-asked. | M1 forbids the import; S2 forbids a second scanner design — a deliberate copy satisfies both, the way `vc-fix` already copies `knowledge/`. kb questions are stored verbatim in a public repo (`secret-gate.mjs` header), so ticket text in a question would publish client data; an unclosed ask breaks the base's trust loop (`CLAUDE.md` §Product context). |
| D12 | Caps | Attachment 25 MB each, 100 MB per ticket · 12 frames per video · 20 pages per document · 6 PRs per ticket (most recent first) · 500 KB diff per PR · 300 files per PR · 200 KB text per public page · 10 linked issues · 500 comments per ticket (oldest first; the rest is an `over-cap` gap). *Revised 2026-10-13 (Phase 2, fix wave 2):* over the linked-issue cap, the issues are **ranked before the cut** — subtasks and the parent first; then blocks / is blocked by / causes / is caused by; then clones / duplicates; then relates; then the rest; most recently updated first within a group (one `key in (…)` search, made only when the cap would drop something). Each dropped issue keeps its `over-cap` gap, with its key and group in the detail. *Replaces:* the first 10 in inventory order (VCST-5957 dropped VCST-6141 and VCST-6145, the two most relevant). Per PR, 12 hotspots and 25 claims (*added 2026-10-13*). Defined once, as `CAPS` in `lib/fetch.mjs`, which `lib/github.mjs` imports. | P5 named caps without values. These keep a typical ticket under P6's 5 minutes; Phase 2 measures and may move them. |

**What the decisions add to the build:** the `ticket-context-analyst` agent with a three-tool allowlist
(D6); `lib/jira.mjs`, `lib/github.mjs`, `lib/inventory.mjs` and `lib/fetch.mjs` (D6, Q1); the
`check-ignore` guard in `lib/cache.mjs` (D2); capability checks for repo tooling (M2); and `lib/deploy.mjs`
over `deploy:pr` and the pre-flight CLI (D3).

### Open before Phase 5

| # | Item | Options |
|---|---|---|
| O1 | The pre-flight core and `deploy:pr` live in the repo root's `scripts/`, which a plugin cannot reference. When `/ticket-context` moves to `vc-fix`, its deployment fields lose their source. | (a) Copy them into the plugin deliberately, as `vc-fix` already does for `knowledge/` and `config.js`, and accept a second copy to keep in step. (b) Move the core into the plugin first, and have this repo consume it from there. To be settled with VCST-6225 before Phase 5, not now. |
| O2 | **A deployed PR build can read as NOT DEPLOYED.** `deploy:pr`'s own header says pre-release artifacts are often not version-bumped in `module.manifest` (the `-pr` suffix lives only in the blob name), while the core's `expectMet` requires an exact match for a pre-release `--expect`. | Fix in the core's policy (VCST-6225), e.g. accept a pre-release when the declared pin is that blob and the live base matches. Until then `lib/deploy.mjs` reports the core's answer unchanged, and an open PR's `NO` carries `deployed_reason` "pre-release builds may not bump the live version — confirm with `npm run deploy:pr -- <KEY> --verify`". |
| O3 | `kb` asks from a client install. The base logs questions verbatim to a public repository; D11 keeps ticket text out of questions, but a client's endpoint or page path is still client-identifying. | Decide with the `kb` owners before Phase 5: no `kb` step on `projectType: client`, or a client-side base. Phase 1 runs only here. |
| O4 | *Added 2026-10-13 (Phase 2, not in fix wave 2).* **The theme version as a deployment source.** A storefront (theme) PR is `UNKNOWN: no-live-source` by design, though the stand's theme bundle carries its version. | Belongs to the pre-flight core (VCST-6225), not this skill: the core reads the theme version, and `lib/deploy.mjs` keeps asking the core (D3). |
| O5 | *Added 2026-10-13 (Phase 2, not in fix wave 2).* **"token: 400" from the environment.** On a Phase 2 replay the pre-flight core could not get a platform token, so every module PR read `UNKNOWN`. | An environment or core credential problem, not this skill's; `deploy.mjs` reports the core's answer unchanged. Re-check after VCST-6225. |
| O6 | *Added 2026-10-13 (Phase 2, not in fix wave 2).* **The join step's quality** (Step 3, PR ↔ AC). It is a runner step, and the Phase 2 replay built it with a keyword shortcut for three of the five tickets, so its `ac_to_diff` figures understate an LLM join. | Measure it on its own in the next validation round before changing it: a script join, a dedicated mode, or the runner as today. |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Another layer that drifts from the pipelines | Phase 4 deletes the restated rules; consumers cite, never restate |
| The move to the plugin never happens, or happens as a rewrite | §4a reviewed on the Phase 1 PR; Phase 5 has a named trigger; one home at a time, the `.claude/` copy is deleted in the move commit |
| The gate turns into box-ticking (`GAP` everywhere) | `GAP` needs a reason from a fixed vocabulary; the validation counts `GAP` rate per ticket |
| Scrubber misses a secret shape | value-scan of real env secrets first, shapes second; HAR is reduced, never read raw; gate rule 6 scans the bundle too |
| Slower than today's Stage 1 | P3 cache, D12 caps, and Phase 2 ships only on a measured win |
| `lib/` grows into a second tracker client | it reads only; the one write path (`scripts/tracker/comment.mjs`) is untouched, and Azure is `GAP` until Phase 5 |
