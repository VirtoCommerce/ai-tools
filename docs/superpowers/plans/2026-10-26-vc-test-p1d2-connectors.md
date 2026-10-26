# vc-test P1d-2 — the connectors: `/ticket-context` reads through `$VC_RUN` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/vc-test:ticket-context` reads the tracker and the code host only through `$VC_RUN`, with no token in its
own process. It reads Jira and GitHub exactly as today, and reads Azure Boards and Azure Repos for the first time.
Released as `vc-test` 0.3.0 with `vc-fix` 0.15.0.

**Architecture:** `prepare` keeps its logic and calls the same client methods it calls today. What changes is the
client behind them. Four connector clients replace `jiraClient` and `ghClient`; each method is one bridge launch
(`node "$VC_RUN" jira|gh|ado …`) that prints the tracker's or host's raw response. The connector is picked by the
profile: `tracker.kind` for the tracker, `vcs.clientHost` for the code host. The Azure clients normalise a work item
to the issue shape `buildInventory` and `ticketFields` already read, and a pull request to the GitHub shapes
`collectPr` already reads, so nothing downstream of `prepare` changes and the bundle schema does not change (§7).

**One deviation from §7, stated here and recorded in the spec in Task 9.** §7 draws the tracker fetch and the host
fetch as two whole steps that write raw files before a token-free bundle step. Here the fetch stays interleaved with
the analysis, one bridge launch per call, because what to read next depends on what was read: linked issues,
attachments, the PR ladder, named companions. The property §7 is after holds: the process that analyses holds no
token, and each launch holds one group's secret (U20). How the host-governed fetch agent fills the same calls is
P1d-3's.

**Tech Stack:** Node 18+ ES modules; `node:child_process` `spawn`; `git diff --no-index` (plain local git, no token)
for the Azure diff; `node:test` for temporary tests.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U19, U20, U23 (exit 78 only), B8, §7 (Connectors), §9, §10 P1. P1d split: [`2026-10-26-vc-test-p1d1-move.md`](2026-10-26-vc-test-p1d1-move.md) §P1d is three plans. The CLI commands this plan calls: [`2026-10-26-vc-test-p1b-vc-fix-reads.md`](2026-10-26-vc-test-p1b-vc-fix-reads.md) and the pinned GraphQL read of [`2026-10-26-vc-test-p1a-vc-init.md`](2026-10-26-vc-test-p1a-vc-init.md).

## Status (2026-10-26)

**Done.** Task 1 merged in #532 (vc-fix 0.15.0, tagged); Tasks 2–9 are vc-test 0.3.0. Built differently from the
tasks below — the code is normative, the tasks are kept as planned:
- A missing profile exits **3** (`no-profile`), the CLI's "could not run", not 2, which there means a failed gate.
- The old credential helpers and the `VC_RUN`-unset stop went with their last callers (Tasks 4–5), so every commit ran.
- `assertKey(key)` with no format accepts a Jira key or an Azure work-item id (cache paths need both); `prepare`
  checks the profile's format strictly.
- `TEST_ENV` with no binding falls back to the profile's one declared test env, then still to `vcst`: the profile
  has no field for a default env, so dropping `vcst` needs a vc-init field first.
- Azure Boards siblings are one `wiql --fields` launch, not a `get-workitem` per id; issue links carry Azure's own
  link names, so "Dependency" ranks as "other", never guessed as "blocks".
- Azure PRs read by work-item link are renamed to project/repository names when those pass the ref check (an
  analyst reads a repository's layer from its name); `refWithNames` does it.
- The Azure recorded responses were assembled from Microsoft Learn's REST samples — no Azure DevOps project was
  reachable; live Azure is P5. Task 8's results are in the release PR.

## Global Constraints

- **No token in `prepare`'s process** (U20). After this plan nothing under `plugins/vc-test/skills/ticket-context/lib/` reads `JIRA_API_TOKEN`, `JIRA_EMAIL`, `GIT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `ADO_PAT`, a profile `authEnv`, or runs `gh auth token`. Task 8 checks it with a grep.
- **No profile ⇒ STOP** (U19): `prepare` exits 2 with "run /project-init", 3 on an unreadable or newer profile, through `plugins/vc-test/lib/profile.mjs` `loadProfile`. `DEFAULT_ORG` and the "defaults" profile go.
- **Jira and GitHub behave byte-for-byte as today** on the platform project (§7). The proof is Task 8's before/after equality on VCST-5097. Any difference is a bug in the connector, not a new behaviour.
- **Self-contained** (`plugins/CLAUDE.md`): nothing under `plugins/vc-test/` imports from the repo root, `.claude/` or another plugin. The bridge is reached only as a process through `$VC_RUN`.
- **The pinned GraphQL query string stays in `lib/github.mjs`.** `plugins/vc-init/bridge/allowlist.test.mjs` reads that file and fails when the copy there and `PINNED_GRAPHQL` differ.
- **Gap reasons stay the closed set** in `bundle.schema.json` `$defs.gapReason`. A bridge failure maps onto it (Task 2); no new reason.
- **Downloads land inside `<outputRoot>/.vc-fix/`** — the only place `jira download` and `ado download-attachment` write (P1b `raw-out.mjs`).
- **NO CODE ⇒ NO UNIT TEST, and every test here is temporary** (`scripts/unit/tmp-<name>.test.mjs`, deleted before its commit). The connectors are not on the committed-test exception list; their proof is the temporary tests, the recorded Azure responses and Task 8.
- **Budgets.** `skills/ticket-context/SKILL.md` stays under 19,000 chars (BUDGET-004). Edits there are lines, not sections.
- **Release** (`docs/release-process.md`): `vc-fix` 0.15.0 is merged and tagged (`vc-fix--v0.15.0`) before `vc-test` 0.3.0 names `>=0.15.0`; `vc-test--v0.3.0` after merge.

## Review Focus

1. **A bridge that is not there or refuses.** `VC_RUN` unset, the shim missing, exit 64 (allowlist), 69 (no `vc-fix`, no declared secret, or the plugin's own dependencies not installed — seen on 2026-10-26: the cached `vc-fix` 0.14.1 had no `dotenv`, so every `jira` launch died on `ERR_MODULE_NOT_FOUND`). Each becomes one line the operator can act on: `VC_RUN` unset STOPs like a missing tracker (exit 3, "run /project-init"); a crash of the child is a `gap` naming the tool and the first stderr line, never a stack trace in the bundle. Test in Task 2.
2. **A host-governed profile** (`governance.host` set, or the bridge's exit 78). `prepare` makes no bridge call, exits 4 with `status: "host-governed"` and the line "the host-governed route lands in P1d-3". Never a half-built bundle. Test in Task 3.
3. **A numeric Azure work item id where a Jira key was expected.** `967` is a valid key when `tracker.kind` is `azure` (`ticketKeyFormat: "numeric"`), and only then; it reaches cache paths and file names only after that check. `ABC-1` on an Azure profile and `967` on a Jira profile are refused before any call. Test in Task 3.
4. **A redacted secret or a rate limit in the child's stderr.** The bridge masks the token; the connector still classifies `HTTP 401/403` as `access-denied`, `HTTP 404` as `deleted`, `rate limit` as `unreadable` with "wait for the reset", `HTTP 406` on the GitHub diff with `status: 406` (the per-file fallback reads it). Test in Task 2.
5. **An Azure work item whose relations hold what a Jira issue holds elsewhere** — `AttachedFile`, `Hyperlink`, `System.LinkTypes.Hierarchy-Reverse` (parent), `-Forward` (children), `ArtifactLink` to a pull request — and one that holds none. Every kind lands in the same inventory item a Jira issue would give; an unknown relation type is ignored, never an error. Test in Task 6.

---

### Task 1: `vc-fix` 0.15.0 — `jira confluence-page`, and the baseline

The Confluence page read is the one `/ticket-context` read with no CLI command: `jira.mjs` admits only `/rest/…`
paths, and Confluence is `/wiki/api/v2/…` on the same host.

**Files:**
- Modify: `plugins/vc-fix/skills/qa-fix-routing/jira.mjs` (header line, `commands.confluence-page`)
- Modify: `plugins/vc-fix/.claude-plugin/plugin.json` (`0.15.0`), `CHANGELOG.md`
- Test (temporary): `scripts/unit/tmp-vc-fix-confluence.test.mjs`
- Baseline (not committed): `<scratch>/p1d2-baseline/`

**Interfaces:**
- Produces: CLI `confluence-page --id <digits>` prints the raw page object of `GET /wiki/api/v2/pages/<id>?body-format=storage` on `tracker.baseUrl`'s origin. `--id` must match `^\d{1,20}$`; anything else exits 1 before a request.

- [ ] **Step 1: Baseline, before any `vc-test` change.** On this branch's `main` base, with a working bridge (`node "$VC_RUN" jira myself` and `node "$VC_RUN" gh api user` both answer):
  - `node plugins/vc-test/skills/ticket-context/lib/cli.mjs prepare VCST-5097 --fresh`, then `abort`. Normalise `prepare.json` exactly as P1d-1 Task 1 did (drop `fetched_at`, `run_dir`, absolute paths and `*_path` values, sort keys) into `prepare.norm.json`; copy every `pr-*-{meta,files,reviews,checks}.json` and `diff.patch` beside it.
  - Record the wall clock of that prepare in `timing.txt`.
  - The same for a blind prepare: `prepare VCST-5904 --fresh --before 2026-10-22T10:17:38Z --hide VCST-6506,VCST-6504` → `blind.norm.json`.
- [ ] **Step 2: Write the failing test**: spawning `node jira.mjs confluence-page --id ../1` and `--id 12a` with a temp `PROJECT_PROFILE_PATH` exits 1 with "refusing" and makes no request (no network in the test); `safeWikiPath("/wiki/api/v2/pages/123?body-format=storage")` is true and `safeWikiPath("/wiki/../rest")` false.
- [ ] **Step 3: Run** `npx tsx --test scripts/unit/tmp-vc-fix-confluence.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement** `safeWikiPath(p: string) => boolean` (exported, pure: `/wiki/api/v2/pages/<digits>` plus an optional `?body-format=storage`, nothing else) and the command through the existing `call`, whose origin pin is unchanged. Add it to the header list.
- [ ] **Step 5: Run** the test and `npx tsx --test scripts/unit/jira-bug-labels.test.mjs`. Expected: PASS. Live: `node "$VC_RUN" jira confluence-page --id <a page a VCST ticket links>` prints a page.
- [ ] **Step 6: Delete the test; bump to 0.15.0 with a CHANGELOG entry; commit** `release(vc-fix): 0.15.0 — jira confluence-page, the Confluence read the vc-test connector makes`. This commit goes in its own PR, merged and tagged (`claude plugin tag --push` from `plugins/vc-fix/`) before Task 9.

### Task 2: `lib/bridge.mjs` — one launch, one result or one gap

**Files:**
- Create: `plugins/vc-test/skills/ticket-context/lib/bridge.mjs`
- Test (temporary): `scripts/unit/tmp-tc-bridge.test.mjs`

**Interfaces:**
- Produces:
  - `class HostGoverned extends Error` — the bridge answered 78.
  - `vcRun(env = process.env) => string | null` — `env.VC_RUN` when it names an existing file, else null.
  - `bridgeRun(tool: "jira"|"gh"|"ado", args: string[], { as = "json"|"text"|"none", ms = CAPS.fetchTimeoutMs, label, run = spawn }) => Promise<object|string|null>`. Spawns `process.execPath [vcRun(), tool, ...args]` with `shell: false`, stdin closed; kills the child at `ms + 15000` (the launch's own cost on top of the request). `as: "json"` parses stdout.
  - `bridgeGap(tool, { code, stderr }) => GapError | HostGoverned` — the one mapping, pure:

    | child | result |
    |---|---|
    | exit 78 | `HostGoverned` |
    | exit 64 | `access-denied`, "refused by the $VC_RUN allowlist: <first stderr line>" |
    | exit 69 | `no-credential`, "<first stderr line> — run /project-init, or install vc-fix's dependencies" |
    | stderr has `HTTP 401` or `HTTP 403` and no `rate limit` | `access-denied`, "<tool> <status> — the stored token was refused; never retried with another" |
    | stderr has `rate limit` (any case) | `unreadable`, "<tool> rate limit reached — wait for the reset" |
    | stderr has `HTTP 404` | `deleted` |
    | stderr has `HTTP 400` | `unreadable`, with `status: 400` and `keys`: the ticket keys the stderr names (`recencyOrder` retries without them, as today) |
    | stderr has `HTTP 406` | `unreadable`, with `status: 406` |
    | anything else, or a kill at the deadline | `unreadable`, "<tool> failed: <first stderr line, ≤200 chars>" |

  Only the first stderr line ever reaches a gap, cut to 200 chars; a Node stack trace's first line is its message.
- Consumed by Tasks 4–7.

- [ ] **Step 1: Write the failing test**, with `run` replaced by a fake that resolves `{ code, stdout, stderr }`:
  - each row of the table above gives its reason, and `status`/`keys` where the row says so;
  - `HTTP 403` with "API rate limit exceeded" is `unreadable` (rate limit wins over denied);
  - a 3-line stderr starting `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'dotenv'` with exit 1 gives `unreadable` whose detail is that one line;
  - `vcRun({})` is null; `vcRun({ VC_RUN: "<missing file>" })` is null;
  - a child that never exits is killed and gives `unreadable` mentioning the deadline (use `ms: 50`).
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-tc-bridge.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `bridge.mjs`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Delete the test, commit** `feat(vc-test): ticket-context launches the $VC_RUN bridge and maps its failures onto the gap vocabulary (§7, U20)`.

### Task 3: The profile, the ticket key and the host-governed stop

**Files:**
- Modify: `plugins/vc-test/skills/ticket-context/lib/profile.mjs` (rewritten)
- Modify: `plugins/vc-test/skills/ticket-context/lib/cli.mjs` (`prepare`'s start, `assertKey` callers)
- Modify: `plugins/vc-test/skills/ticket-context/lib/paths.mjs` (`assertKey`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/env.mjs` (`resolveTestEnv`'s last fallback)
- Test (temporary): `scripts/unit/tmp-tc-profile.test.mjs`

**Interfaces:**
- Produces, in `profile.mjs`:
  - `resolveProfile(profile: object) => { projectType, tracker: "jira"|"azure", trackerBase: string, keyFormat: "prefixed"|"numeric", crossLinkToken: string, fieldMap, fieldList: {id,name}[], azure: { organization, project, roleStates, roleStatesByType }, codeHost: "github"|"azure-repos", orgs: string[], governed: boolean }`.
    - `orgs`: `vcs.clientOrg` first when the project is a client project on GitHub and it differs from `upstream.org`, then `upstream.org`. An empty `upstream.org` is a profile error (exit 3, "run /project-init --check"), never `VirtoCommerce`.
    - `fieldList`: the union of `tracker.fields.<Type>[]` as `{ id: ref, name }`, deduplicated by `id` (Azure's field list; the Jira connector keeps asking `/rest/api/3/field`).
    - `governed`: `!!profile.governance?.host`.
  - `trackerCredential` and `codeHostCredential` are deleted, with `DEFAULT_ORG`.
- Produces, in `paths.mjs`: `assertKey(key, keyFormat = "prefixed")` — prefixed `^[A-Z][A-Z0-9]*-\d+$`, numeric `^[1-9]\d{0,9}$`.
- `prepare` start order: `loadProfile()` (exit 2/3 with its message) → `resolveProfile` → `assertKey(key, keyFormat)` → `governed` ⇒ `out({ status: "host-governed", detail: "the host-governed route lands in P1d-3; nothing was read" })`, exit 4 → `vcRun()` null ⇒ `out({ status: "no-tracker", gap: gap("ticket", "no-credential", "VC_RUN is not set — run /project-init") })`, exit 3 (the existing `no-tracker` status). Every other subcommand that takes a key uses the profile's `keyFormat` too.
- `env.mjs`: with no `TEST_ENV`, no session binding and no `.env.test-env`, `resolveTestEnv` returns the plugin's `currentEnv()` (`plugins/vc-test/lib/paths.mjs`) instead of `"vcst"`.

- [ ] **Step 1: Write the failing test**:
  - a platform profile (`upstream.org: "VirtoCommerce"`, `vcs.clientHost: "github"`) gives `orgs: ["VirtoCommerce"]`, `tracker: "jira"`, `codeHost: "github"`;
  - a client profile with `vcs.clientOrg: "acme"` on GitHub gives `orgs: ["acme", "VirtoCommerce"]`;
  - `upstream.org: ""` throws code 3;
  - an Azure profile gives `keyFormat: "numeric"`, `tracker: "azure"`, `fieldList` from `tracker.fields`, `azure.roleStates`;
  - `governance: { host: "x" }` gives `governed: true`;
  - `assertKey("967", "numeric")` passes; `assertKey("967")`, `assertKey("ABC-1", "numeric")`, `assertKey("0", "numeric")` and `assertKey("../1", "numeric")` throw;
  - spawning `cli.mjs prepare VCST-1` with `PROJECT_PROFILE_PATH` at a missing file exits 2; at a governed profile exits 4 with `"status":"host-governed"` and no child process started (the fake `VC_RUN` script it points at writes a marker file when run; the marker must not exist) (Review Focus 2, 3).
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-tc-profile.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files and the start of `prepare`. The clients are still the old ones here; Task 4 swaps them, so `prepare` past the start is untouched in this task.
- [ ] **Step 4: Run.** Expected: PASS. `npm run context:check` green.
- [ ] **Step 5: Delete the test, commit** `refactor(vc-test): ticket-context reads the profile or stops — no native-platform defaults, numeric Azure keys, a host-governed stop (U19, §7)`.

### Task 4: The Jira connector

**Files:**
- Create: `plugins/vc-test/skills/ticket-context/lib/connectors/jira.mjs`
- Modify: `plugins/vc-test/skills/ticket-context/lib/jira.mjs` (delete `jiraClient`; `recencyOrder` calls `tracker.recency`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/cli.mjs` (the two JQL call sites; `materialize`'s download)
- Test (temporary): `scripts/unit/tmp-tc-jira-connector.test.mjs`

**Interfaces:**
- Consumes: `bridgeRun`, `bridgeGap` (Task 2); `resolveProfile` (Task 3); the `vc-fix` commands `request`, `get`, `comments`, `download`, `dev-prs` (0.14.0) and `confluence-page` (Task 1).
- Produces: `jiraConnector({ base, key, run = bridgeRun }) => tracker`, the tracker surface every connector implements (`key` is the ticket being prepared; it names the `.vc-fix/context/<key>/` folder for temporary files):

  | method | Jira call (one launch each) |
  |---|---|
  | `base` | the profile's `tracker.baseUrl`, no trailing slash — `privateHosts` and `buildInventory` read it |
  | `fields()` | `request --method GET --path /rest/api/3/field` |
  | `issue(key, fieldIds, { gaps })` | `get --key K --fields … --expand renderedFields`; when `fields` holds `comment` and `total` exceeds the first page, `comments --key K --rendered --max <CAPS.comments>`, merged after the first page by id exactly as `completeComments` merges today (raw object into `fields.comment`, its `renderedBody` as `body` into `renderedFields.comment`, index-paired; an unread rest is ONE gap) |
  | `latestComments(key, n)` | `comments --key K --newest --max n` → `{ comments, total }` |
  | `remoteLinks(key)` | `request --method GET --path /rest/api/3/issue/K/remotelink` |
  | `linkedPrs(issue)` | `dev-prs --key K` → `{ urls, refs: [] }` (replaces `devPrUrls(issue.id)`; `prepare` passes `urls` to `buildInventory` as `devPrUrls`, as today, and adds `refs` to the ladder's explicit refs) |
  | `siblings(parentKey, key)` | `request --method POST --path /rest/api/3/search/jql --body-file <.vc-fix/…/q.json>` with today's JQL `parent = P AND key != K ORDER BY updated DESC`, fields `summary,status`, max 50 → raw issues |
  | `recency(keys)` | the same POST with `key in (…) ORDER BY updated DESC`, fields `updated` → ordered keys; a 400 carries `status` and `keys` from `bridgeGap` |
  | `download(item)` | the attachment id from `item.url` (`/rest/api/3/attachment/content/<id>`), `download --attachment <id> --out .vc-fix/context/<KEY>/dl-<id>.bin --max-bytes <CAPS.attachmentBytes>` → the file's bytes; the file is deleted after it is read |
  | `page(id)` | `confluence-page --id <id>` |

  The search body file is written under `<outputRoot>/.vc-fix/context/<KEY>/` and deleted after the call. `prepare` calls `tracker.siblings` and `tracker.recency` where it built JQL before; the row mapping after `siblings` is unchanged.

- [ ] **Step 1: Write the failing test** with `run` faked to return recorded Jira objects (from Task 1's baseline `ticket.json`):
  - `issue` with `total: 130` on a 100-comment first page calls `comments` once and returns 130 comments, `renderedFields.comment.comments[i].body` paired by index, no duplicate id when the second call repeats the first page's last comment;
  - `issue` with `total` equal to the first page makes one launch;
  - `siblings("VCST-1", "VCST-2")` writes a body whose `jql` is byte-equal to today's string and removes the file;
  - `recency` re-throws a 400 with `keys: ["VCST-9"]` so `recencyOrder` retries without it (call `recencyOrder` with this tracker);
  - `download({ url: "https://x.atlassian.net/rest/api/3/attachment/content/10050" })` passes `--attachment 10050` and an `--out` under `.vc-fix/`; a URL with no id there throws `unreadable` without a launch.
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-tc-jira-connector.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the connector; swap `jiraClient(tcred)` for `jiraConnector({ base: profile.trackerBase })` in `prepare` (and wherever `materialize` and the Confluence branch call the old client).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Delete the test, commit** `feat(vc-test): the Jira connector — /ticket-context reads Jira through $VC_RUN (§7, U20)`.

### Task 5: The GitHub connector

**Files:**
- Create: `plugins/vc-test/skills/ticket-context/lib/connectors/github.mjs`
- Modify: `plugins/vc-test/skills/ticket-context/lib/github.mjs` (delete `ghClient`; export `REVIEW_THREADS_QUERY`, the pinned string, unchanged)
- Modify: `plugins/vc-test/skills/ticket-context/lib/cli.mjs` (the `gh` construction; the search key)
- Test (temporary): `scripts/unit/tmp-tc-github-connector.test.mjs`

**Interfaces:**
- Consumes: `bridgeRun`, `bridgeGap`; `REVIEW_THREADS_QUERY`.
- Produces: `githubConnector({ run = bridgeRun }) => host`, with `ghClient`'s method names and return shapes, so `runLadder`, `followCompanions` and `collectPr` are untouched. Every call is `gh api <path>` (a GET; the bridge refuses anything else):
  - `searchPrs`, `searchCommits`, `prsForCommit`, `pr`, `reviewComments`, `checkRuns` — today's paths and query strings, byte-equal;
  - `files(o, r, n, cap)` — the same `per_page=100&page=N` loop, one launch per page, the same `cap + 1` return;
  - `diff(o, r, n)` — `gh api -H "Accept: application/vnd.github.diff" repos/o/r/pulls/n`, text; a 406 keeps `status: 406`;
  - `unresolvedThreads(o, r, n)` — `gh api graphql -f query=<REVIEW_THREADS_QUERY> -F o=<o> -F r=<r> -F n=<n>`; `{errors}` or no nodes stays "not read", as today.
  - `checkRepo`, `checkNumber` and `checkSha` run before any launch, as before.
- The search key: the ticket key, except on an Azure Boards tracker with a GitHub host, where it is `crossLinkToken + id` (e.g. `AB#967`), the token `/project-init` stores for GitHub's Azure Boards integration. An empty `crossLinkToken` there ⇒ the ladder's search rungs are skipped with one `not-found` gap; explicit refs from the work item still run.

- [ ] **Step 1: Write the failing test** with `run` faked:
  - `searchPrs("VCST-1", ["VirtoCommerce"])` passes the same `search/issues?q=…&per_page=50` path today's client fetched (compare to a string built by the old code, kept in the test);
  - `files` over 100 + 100 + 37 entries with cap 150 makes 2 launches and returns 151;
  - `diff` passes `-H` with the diff media type and returns the text; a fake 406 rejects with `status: 406`;
  - `unresolvedThreads` passes a `query` field byte-equal to `PINNED_GRAPHQL.reviewThreads.query` (read from `plugins/vc-init/bridge/allowlist.mjs` in the test only);
  - `pr("../x", "r", 1)` throws before a launch.
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-tc-github-connector.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement**; `prepare` builds `githubConnector()` when `codeHost === "github"`. The old `codeHostCredential` gap path goes; a host that cannot be reached shows up as the first call's gap.
- [ ] **Step 4: Run** the test and `node --test plugins/vc-init/bridge/allowlist.test.mjs` (the pin copy still matches). Expected: PASS.
- [ ] **Step 5: Delete the test, commit** `feat(vc-test): the GitHub connector — /ticket-context reads GitHub through $VC_RUN, the review threads by the pinned query (§7, B8)`.

### Task 6: The Azure Boards connector

**Files:**
- Create: `plugins/vc-test/skills/ticket-context/lib/connectors/azure-boards.mjs`
- Test (temporary): `scripts/unit/tmp-tc-azure-boards.test.mjs`, with its recorded responses in `<scratch>/azure-recorded/`

**Interfaces:**
- Consumes: `bridgeRun`; `resolveProfile`'s `fieldList`, `fieldMap`, `azure`; the `ado` commands `get-workitem --json`, `comments`, `download-attachment`, `wiql`.
- Produces: `azureBoardsConnector({ profile, key, run = bridgeRun }) => tracker` (Task 4's surface) and the pure `normalizeWorkItem(item, comments, profile) => issue`, the Jira-shaped issue `buildInventory` and `ticketFields` read:

  | issue | from the work item |
  |---|---|
  | `key`, `id` | `String(item.id)` |
  | `fields.summary` · `issuetype.name` · `status.name` | `System.Title` · `System.WorkItemType` · `System.State` |
  | `fields.status.statusCategory.key` | `"done"` when the state equals `roleStatesByType[type].done`, else `roleStates.done`; otherwise `null` — never a state name guessed |
  | `fields.priority.name` · `labels` · `updated` · `created` | `Microsoft.VSTS.Common.Priority` as a string · `System.Tags` split on `;` and trimmed · `System.ChangedDate` · `System.CreatedDate` |
  | `fields.description` / `renderedFields.description` | `htmlToText(System.Description)` / the HTML as it came |
  | each field id in `fieldIds` (the AC field) | the same pair: text in `fields`, HTML in `renderedFields` |
  | `fields.comment` / `renderedFields.comment` | `{ total, comments: [{ id, created: createdDate, updated: modifiedDate, body: htmlToText(text) }] }` / the same with `body` = the HTML, index-paired |
  | `fields.attachment[]` | each `AttachedFile` relation: `{ id: <guid from the URL>, filename: attributes.name, size: attributes.resourceSize, content: rel.url, created: attributes.resourceCreatedDate }` |
  | `fields.parent` | the `Hierarchy-Reverse` relation's id, `{ key, fields: { summary } }`; `issue()` reads the parent's title with one more `get-workitem`, which `prepare` shows as the epic's title |
  | `fields.subtasks[]` · `fields.issuelinks[]` | `Hierarchy-Forward` ids as `{ key }` · `Related`, `Duplicate*`, `Dependency*` ids as `{ outwardIssue: { key } }` |
  | `remoteLinks(key)` | `Hyperlink` relations as `[{ object: { url, title: attributes.comment } }]` |
  | `linkedPrs(issue)` | `ArtifactLink` relations whose URL is `vstfs:///Git/PullRequestId/<project>%2F<repoId>%2F<prId>` → `{ urls: [], refs: [{ ref: "<project>/<repoId>#<prId>", owner: <project>, repo: <repoId>, number }] }`; Task 7 reads them |
  | `siblings(parentKey, key)` | `wiql` `SELECT [System.Id] FROM WorkItems WHERE [System.Parent] = P AND [System.Id] <> K ORDER BY [System.ChangedDate] DESC`, then one `get-workitem` per id up to 50, normalised |
  | `recency(keys)` | `wiql` `… WHERE [System.Id] IN (…) ORDER BY [System.ChangedDate] DESC` |
  | `download(item)` | `download-attachment --guid <item.id> --out .vc-fix/context/<id>/dl-<guid>.bin` |
  | `page(id)` | throws `connector-unavailable`, "a Confluence page needs a Jira tracker" |

  An inline image in description or comment HTML whose `src` is an `_apis/wit/attachments/<guid>` URL is reported to `buildInventory` the way a rendered Jira attachment is: `normalizeWorkItem` rewrites it into the rendered form `renderedAttachmentIds` reads, keyed by that guid. A relation type not in the table is ignored.
- The Jira-only code paths `prepare` keeps (`resolveFieldsByName` over `fields()`, the `/browse/` link classifier) see an Azure `fields()` that returns `fieldList`, so the AC field resolves by name exactly as on Jira, and `fieldMap.acceptanceCriteria` still wins.

- [ ] **Step 1: Record the responses.** With an Azure DevOps project reachable through the bridge (an Azure profile in a scratch `VC_FIX_HOME`), save `ado get-workitem --id <n> --json`, `ado comments --id <n>` and one `ado wiql` for a work item that has an attachment, a hyperlink, a parent, a child and a pull-request link. With none reachable, build the same files from the response examples in Microsoft Learn's Azure DevOps REST reference (Work Items – Get Work Item with `$expand=all`, Comments – Get Comments, Wiql – Query By Wiql), and say so in the commit message. The files stay in scratch: they are client data or copied samples, never committed.
- [ ] **Step 2: Write the failing test** over the recorded files:
  - `normalizeWorkItem` gives every row of the table; `buildInventory` on the result lists one `attachment:` item per `AttachedFile`, the hyperlink as a `link:` item, the parent and child as `issue:` items, and the inline image as inline in `description`;
  - `ticketFields` gives the title, type, state, the description text and the AC text;
  - a work item with no `relations` normalises with empty lists (Review Focus 5);
  - a state equal to `roleStates.done` gives `statusCategory.key: "done"`; with an empty `roleStates`, `null`.
- [ ] **Step 3: Run** `node --test scripts/unit/tmp-tc-azure-boards.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement**; `prepare` builds `azureBoardsConnector({ profile })` when `tracker === "azure"`. The `connector-unavailable` "Azure Boards is read from Phase 5 on" path goes.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Delete the test, commit** `feat(vc-test): the Azure Boards connector — a work item read through $VC_RUN, in the issue shape the bundle step reads (§7)`.

### Task 7: The Azure Repos connector

**Files:**
- Create: `plugins/vc-test/skills/ticket-context/lib/connectors/azure-repos.mjs`
- Modify: `plugins/vc-test/skills/ticket-context/lib/cli.mjs` (PR discovery when `codeHost === "azure-repos"`)
- Test (temporary): `scripts/unit/tmp-tc-azure-repos.test.mjs`, recorded responses in `<scratch>/azure-recorded/`

**Interfaces:**
- Consumes: `bridgeRun`; the `refs` of Task 6's `linkedPrs`; the `ado` commands `get-pr`, `pr-iterations`, `pr-changes`, `pr-threads`, `get-file --commit`.
- Produces: `azureReposConnector({ key, run = bridgeRun, git = spawnSync }) => host` with the methods `collectPr` calls, each returning the GitHub shape `collectPr` reads:
  - `pr(project, repoId, n)` — `get-pr --pr n` → `{ title, state: "open"|"closed", merged_at: closedDate when status is "completed" else null, created_at: creationDate, head: { sha: lastMergeSourceCommit.commitId }, base: { ref: targetRefName without "refs/heads/" }, body: description }`;
  - `files(project, repoId, n, cap)` — the last iteration from `pr-iterations`, then `pr-changes --iteration <last> --max <cap+1>` → `[{ filename: item.path without the leading "/", status: added|modified|removed|renamed, additions: null, deletions: null }]`;
  - `diff(project, repoId, n)` — for each changed file up to `CAPS.prFiles`, `get-file --commit` at the iteration's `commonRefCommit` and at `sourceRefCommit` into `.vc-fix/context/<KEY>/az-diff/`, then `git diff --no-index --no-color --text -- a/<path> b/<path>` per file, concatenated; a binary or missing side is skipped and named, as `assembleDiff` names files with no patch;
  - `reviewComments(project, repoId, n)` — `pr-threads` → `[{ path: threadContext.filePath, line: threadContext.rightFileStart?.line ?? null, body, created_at: publishedDate }]` for every non-system comment;
  - `unresolvedThreads(…)` — the count of threads with `status` `active` or `pending`;
  - `checkRuns(…)` — throws `connector-unavailable`, "Azure Repos PR statuses are not read in v1" (one gap per PR, as on a GitHub PR with no head SHA).
- PR discovery on Azure Repos: the GitHub ladder does not run. The refs come from the tracker (`linkedPrs` on Azure Boards; on Jira, PR URLs of the form `dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<n>` in the inventory, read through `get-pr`, whose response names the repository id). `CONTEXT_ONLY_REPOS` applies by repository name. `collectPr` receives `owner = project`, `repo = repoId` (a GUID, which passes `checkRepo`), so file names stay safe.

- [ ] **Step 1: Record** `get-pr`, `pr-iterations`, `pr-changes`, `pr-threads` and two `get-file --commit` answers for the pull request Task 6's work item links, the same way as Task 6 Step 1.
- [ ] **Step 2: Write the failing test** over them:
  - each method gives the shape above; a completed PR has `merged_at`, an abandoned one is `closed` with `merged_at: null`;
  - `diff` on two small recorded file versions gives a unified diff whose hunk lines match `git diff --no-index` run in the test on the same files;
  - `collectPr` with this host writes `meta.json`, `files.json`, `diff.patch` and `reviews.json`, and `checks.json` is replaced by one `connector-unavailable` gap;
  - a ref whose repo is not a GUID or whose number is not a positive integer throws before a launch.
- [ ] **Step 3: Run** `node --test scripts/unit/tmp-tc-azure-repos.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement** the connector and the discovery branch in `prepare`; the `connector-unavailable` "pull requests are read from Phase 5 on" gap goes.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Delete the test, commit** `feat(vc-test): the Azure Repos connector — the work item's pull-request links read through $VC_RUN, diffed locally (§7)`.

### Task 8: The regression check

**Files:** none committed; results in `<scratch>/p1d2-after/`.

- [ ] **Step 1: No token in the process.** `grep -rnE 'JIRA_API_TOKEN|JIRA_EMAIL|GIT_TOKEN|GITHUB_TOKEN|GH_TOKEN|ADO_PAT|authEnv|"auth", "token"' plugins/vc-test/skills/ticket-context/lib` returns nothing.
- [ ] **Step 2: Byte-for-byte on Jira/GitHub.** Repeat Task 1 Step 1's two prepares and normalisation. `prepare.norm.json`, `blind.norm.json` and every per-PR file equal the baseline. Differences that come only from the ticket or a PR changing between the two runs (a new comment, a new commit) are re-checked by re-running the baseline at the old commit, never waived by reading.
- [ ] **Step 3: The cache.** Without `--fresh`, `prepare VCST-5097` answers `status: "cached"` on the bundle Step 2 left: the freshness key did not move.
- [ ] **Step 4: Cost.** Record the wall clock and the number of bridge launches of Step 2's prepare beside `timing.txt`. A prepare more than twice as slow as the baseline is reported in the PR with the launch count, as a P1d-3 or P2 item (batching reads into fewer launches); it does not block this plan.
- [ ] **Step 5: The gates.** `npm run context:check`, `npm run docs:index:check`, `npm test` and `node plugins/vc-test/skills/ticket-context/lib/check-bundle.mjs` on the produced bundle are green.

### Task 9: Release `vc-test` 0.3.0

**Files:**
- Modify: `plugins/vc-test/.claude-plugin/plugin.json` (`0.3.0`; `vc-fix` `>=0.15.0`; description), `.claude-plugin/marketplace.json` (the vc-test description only), `CHANGELOG.md`, `plugins/vc-test/README.md`
- Modify: `plugins/vc-test/skills/ticket-context/SKILL.md` (exit 4 `host-governed`; credentials are the bridge's; the "Phase 5" lines go)
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §7 (one paragraph: the fetch is interleaved, one launch per call, and why — the deviation in this plan's Architecture), §10 P1 (P1d-2 done)

- [ ] **Step 1: Wait for `vc-fix--v0.15.0`.** `git tag -l 'vc-fix--v0.15.0'` lists it. Without it, stop: a dependency range against a missing tag strands the plugin (`docs/release-process.md` §Step 5a).
- [ ] **Step 2: Edit** the files above. `SKILL.md` stays under 19,000 chars (`npm run context:check`).
- [ ] **Step 3: Check** `claude plugin validate plugins/vc-test`, `npm run context:check`, `npm test`.
- [ ] **Step 4: Commit, push, open the PR** `release(vc-test): 0.3.0 — /ticket-context reads Jira, GitHub, Azure Boards and Azure Repos through $VC_RUN (vc-test P1d-2)`, with Task 8's results in its body.
- [ ] **Step 5: After merge**, `claude plugin tag --push` from `plugins/vc-test/`; `git tag -l 'vc-test--v*'` lists `vc-test--v0.3.0`.
