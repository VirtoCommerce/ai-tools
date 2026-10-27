# vc-test P1b — the `vc-fix` change (the tracker CLIs' read commands) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release `vc-fix` 0.13.0 → 0.14.0 (tag `vc-fix--v0.14.0`) with the read commands the P1d connectors call
through `$VC_RUN`. The commands go in `jira.mjs` and `ado.mjs`, so that one bridge launch fetches what
`/ticket-context` reads today with its own tokens. That covers comments paged in one call, attachments saved to a
file, the Jira dev-status PR links, and Azure Repos pull requests with their iterations, changes, threads and
file contents at a commit.

**Architecture:** Additions to `plugins/vc-fix/skills/qa-fix-routing/jira.mjs` and `ado.mjs` only, plus one shared
module, `raw-out.mjs`, for the two things both CLIs need: an output path held inside `.vc-fix/`, and a streamed,
capped download. The bridge needs no change (spec §7): it admits any `jira` or `ado` command name and keeps the
host pinned to the profile.

Every JSON command prints the tracker's **raw** response objects. P1d's bundle step owns the shaping, so these
commands do none. Paging loops are pure functions with an injected page fetcher, so they can be tested without a
network. The CLI wiring around them is thin.

**Tech Stack:** Node 18+ ES modules, the built-in `fetch`; no new dependency; temporary tests with `tsx --test`.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U4, U20, §4 (the `vc-fix` row), §7 (Connectors), §10 P1. The P1 split is in [`2026-10-26-vc-test-p1a-vc-init.md`](2026-10-26-vc-test-p1a-vc-init.md) §P1 is four plans.

## What the connectors need, and what already exists

| Read (`/ticket-context` today) | Jira | Azure DevOps |
|---|---|---|
| issue / work item, all fields, rendered | exists: `get --key --fields --expand renderedFields`, or `request GET` | exists: `get-workitem --id --json` (`$expand=all`, so `relations[]` too) |
| field list (to find the AC field) | exists: `request GET /rest/api/3/field` | — (fields come with the item) |
| **all comments, paged, oldest first; the newest N** | **new: `comments`** (Task 2) | **new: `comments`** (Task 3) |
| remote links · JQL search | exist: `request GET …/remotelink`, `request POST /rest/api/3/search/jql` | exists: `wiql` |
| **an attachment's bytes, to a file, capped** | **new: `download`** (Task 2) | **new: `download-attachment`** (Task 3) |
| **the PRs linked from the issue** | **new: `dev-prs`** (Task 2; two dev-status calls in one launch) | the item's `ArtifactLink` relations (`get-workitem --json`; P1d parses them) |
| **a PR, its iterations, changes, threads** | — (GitHub: `gh`, P1a's B8) | **new: `get-pr`, `pr-iterations`, `pr-changes`, `pr-threads`** (Task 3) |
| **a file's content at a commit** (the Azure diff is built from it) | — | **new: `get-file --commit`** (Task 3) |

`request` already reads any `/rest/…` path, but one bridge call is one vc-secrets launch. Paging comments that way
would cost a launch per page, and `request` cannot write bytes to a file. Those two gaps are why the new commands
exist. Everything else stays on `get`, `request` and `get-workitem`.

## Global Constraints

- **No committed unit test** (`CLAUDE.md` NO CODE ⇒ NO UNIT TEST). Each task's test is `scripts/unit/tmp-<name>.test.mjs`, run red then green, and deleted before the commit. The existing committed `scripts/unit/ado-*.test.mjs` and `jira-bug-labels.test.mjs` stay green.
- **Host pinning is unchanged.** Jira requests go to `tracker.baseUrl` only, on paths under `/rest/`. Azure requests go to `base(args, axis)` / `orgUrl(args)` only. No new flag takes a URL or a host.
- **No write command.** Every new command is a GET. A download writes a local file only, and only inside `<outputRoot>/.vc-fix/` (`outputRoot()` from `plugins/vc-fix/scripts/lib/run-dir.mjs`). The token-holding process never writes anywhere else.
- **Raw output.** JSON commands print the tracker's own objects. No field is renamed, dropped or stripped, because the shaping is the bundle step's (P1d) and the raw files must be the same on the bridge route and the host-governed route (U23).
- **Caps come from the caller**, as `--max` and `--max-bytes`, with defaults equal to `/ticket-context`'s `CAPS` (`.claude/skills/ticket-context/lib/fetch.mjs`): 500 comments, page size 100, 25 MiB per attachment. A reply over a cap reports `truncated: true` or fails with `over-cap`; it never silently cuts.
- Both CLI headers list every new command, in the existing one-line style.
- **Release** (`docs/release-process.md`): `plugins/vc-fix/.claude-plugin/plugin.json` goes to `0.14.0` and `CHANGELOG.md` gets an entry. After merge, run `claude plugin tag --push` from `plugins/vc-fix/` (`vc-perf` and later `vc-test` depend on it). The marketplace listing does not change.
- `npm run context:check` and `npm test` green before the PR.

## Review Focus

1. **A paged list whose total moves while it is read**, for example a comment posted between two pages. The loop stops on an empty or short page, never loops forever, and never returns a duplicate id. Test in Tasks 2 and 3.
2. **An attachment larger than `--max-bytes`, or with no `Content-Length`.** The stream is cut at the cap, the partial file is deleted, and the command exits non-zero with `over-cap`. A file just under the cap is written whole. Test in Task 1.
3. **`--out` outside `.vc-fix/`.** `../x`, an absolute path elsewhere, and a path through a junction that leads out are all refused before any request is made, because the process holds a token. Test in Task 1.
4. **An Azure list that pages by `continuationToken`** (comments) or by `$top`/`$skip` (iteration changes). Every page is read up to `--max`, and a continuation token is never put into a URL unencoded. Test in Task 3.
5. **The Jira dev-status quirk.** `detail` answers an empty 200 for a wrong `applicationType`, so the types come from `summary`, plus `GitHub` always. The same PR URL from two types is listed once. Test in Task 2.

---

### Task 1: `raw-out.mjs` — an output path inside `.vc-fix/` and a capped download

**Files:**
- Create: `plugins/vc-fix/skills/qa-fix-routing/raw-out.mjs`
- Test (temporary): `scripts/unit/tmp-vc-fix-raw-out.test.mjs`

**Interfaces:**
- Produces:
  - `rawOutPath(out: string, root = outputRoot()) => string`. Returns the absolute path. It throws `Error("--out must be inside <root>/.vc-fix/ …")` unless the path, resolved against `root`, lies inside `realpath(<root>/.vc-fix)`. The check runs after resolving the nearest existing parent directory, so a junction cannot lead out. Missing directories under `.vc-fix/` are created.
  - `writeCapped(res: Response, file: string, maxBytes: number) => Promise<{ bytes: number, contentType: string|null }>`. Streams `res.body` to `file`. Past `maxBytes` it aborts, deletes the partial file and throws `Error("over-cap: more than <maxBytes> bytes")`. A declared `Content-Length` over the cap throws before reading.
- Consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**:
  - `rawOutPath(".vc-fix/vc-test/K/raw/a.bin", tmp)` returns the absolute path and creates `raw/`.
  - `"../x"`, `"x.bin"` (outside `.vc-fix/`) and an absolute path in another temp dir are refused.
  - A junction `<tmp>/.vc-fix/link` → `<tmp>/elsewhere` with `".vc-fix/link/a.bin"` is refused.
  - `writeCapped(new Response(bytes(10)), f, 10)` writes 10 bytes.
  - `new Response(bytes(11))` with cap 10 throws `over-cap` and leaves no file.
  - A `Response` whose headers say `content-length: 99` with cap 10 throws before reading.
- [ ] **Step 2: Run** `npx tsx --test scripts/unit/tmp-vc-fix-raw-out.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement**: `realpathSync.native` on the nearest existing ancestor; `Readable.fromWeb` piped through a byte counter into `createWriteStream`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Delete the test, commit**: `feat(vc-fix): raw-out — a token-holding CLI writes only inside .vc-fix/, and a download is capped`.

### Task 2: `jira.mjs` — `comments`, `download`, `dev-prs`

**Files:**
- Modify: `plugins/vc-fix/skills/qa-fix-routing/jira.mjs` (header, `commands`, and the exported pure helpers below)
- Test (temporary): `scripts/unit/tmp-vc-fix-jira-reads.test.mjs`

**Interfaces:**
- Produces:
  - **CLI** `comments --key ABC-1 [--rendered] [--max 500] [--newest]` prints `{ total: number, comments: object[], truncated: boolean }`. Comments are raw Jira objects, oldest first; with `--newest`, the newest `--max` are given newest first. `--rendered` adds `expand=renderedBody`.
  - **CLI** `download --attachment 10050 --out <path> [--max-bytes 26214400]` prints `{ path, bytes, contentType }`. It reads `GET /rest/api/3/attachment/content/<id>`, following the redirect to Atlassian's media host. Node's `fetch` drops `Authorization` on a cross-origin redirect, as `/ticket-context` relies on today.
  - **CLI** `dev-prs --key ABC-1` prints `{ issueId: string, urls: string[] }`.
  - **Exported, pure:**
    - `pageComments(fetchPage: (startAt, maxResults) => Promise<{ comments, total }>, { max, pageSize = 100 }) => Promise<{ total, comments, truncated }>`;
    - `devPrUrls(getJson: (path) => Promise<object>, issueId) => Promise<string[]>`, which moves `/ticket-context`'s logic here unchanged: types from `summary.pullrequest.byInstanceType` plus `"GitHub"`, URLs deduplicated.

- [ ] **Step 1: Write the failing test** for the two pure helpers:
  - `pageComments` reads 3 pages of 100 + 100 + 37 with `max` 500, giving 237 and `truncated: false`.
  - The same with `max` 150 gives 150 and `truncated: true`.
  - When a page comes back empty while `total` says more, the loop stops with what it has and `truncated: true`.
  - A comment id repeated across two pages (a comment posted mid-read shifts the window) is kept once (Review Focus 1).
  - `devPrUrls`: a summary with `byInstanceType: { "oAuth-com.github.integration.production": {} }` queries that type and `GitHub`; the same URL from both is returned once; an empty `detail` gives `[]` (Review Focus 5).
- [ ] **Step 2: Run.** Expected: FAIL (not exported).
- [ ] **Step 3: Implement** the helpers and the three commands:
  - `comments` uses `call("GET", …/comment?startAt=&maxResults=&orderBy=created|-created[&expand=renderedBody])` through `pageComments`.
  - `download` uses `rawOutPath`, then `call(…, { raw: true })`, then `writeCapped`.
  - `dev-prs` uses `get --fields id`, then `devPrUrls`.
  - All three are added to the header list.
- [ ] **Step 4: Run** the test (PASS), then `npx tsx --test scripts/unit/jira-bug-labels.test.mjs` (PASS).
- [ ] **Step 5: Delete the test, commit**: `feat(vc-fix): jira comments, download and dev-prs — the reads a connector makes in one bridge call (vc-test §7)`.

### Task 3: `ado.mjs` — `comments`, `download-attachment`, the Azure Repos PR reads, `get-file --commit`

**Files:**
- Modify: `plugins/vc-fix/skills/qa-fix-routing/ado.mjs` (header, `COMMANDS`, exported pure helpers)
- Test (temporary): `scripts/unit/tmp-vc-fix-ado-reads.test.mjs`

**Interfaces:**
- Produces, all **CLI**, printing raw Azure objects:
  - `comments --id 967 [--max 500]` gives `{ total, comments, truncated }`. It reads `GET {tracker base}/_apis/wit/workItems/{id}/comments?$top=200&api-version=7.1-preview.4`, following `continuationToken`.
  - `download-attachment --guid <GUID> --out <path> [--max-bytes 26214400]` gives `{ path, bytes, contentType }`. It reads `GET {tracker base}/_apis/wit/attachments/{guid}?download=true&api-version=7.1`. The guid must match `^[0-9a-f-]{36}$`; P1d takes it from an `AttachedFile` relation URL, never a URL from the caller.
  - `get-pr --pr 1200` reads `GET {vcs base}/_apis/git/pullrequests/{pr}` (project-scoped, so no repo is needed; it holds `repository.id`).
  - `pr-iterations --repo <name|id> --pr 1200` gives `{ value: iteration[] }`.
  - `pr-changes --repo <name|id> --pr 1200 --iteration 3 [--compare-to 0] [--max 2000]` gives `{ changeEntries, truncated }`. It pages `$top=500&$skip=` until a short page.
  - `pr-threads --repo <name|id> --pr 1200` gives `{ value: thread[] }`.
  - `get-file … --commit <sha>`: `versionDescriptor.versionType=commit`. `--commit` and `--branch` together are refused.
- **Exported, pure:**
  - `pageByToken(fetchPage: (token|null) => Promise<{ items, token: string|null, total? }>, { max }) => Promise<{ total, items, truncated }>`;
  - `pageBySkip(fetchPage: (skip, top) => Promise<object[]>, { max, top }) => Promise<{ items, truncated }>`.
  - The CLI encodes the continuation token with `encodeURIComponent` (Review Focus 4).

- [ ] **Step 1: Write the failing test**:
  - `pageByToken` follows tokens `"a"` → `"b"` → `null` and returns every item.
  - `pageByToken` stops at `max` with `truncated: true`, and stops when a token repeats, so it never loops (Review Focus 1).
  - `pageBySkip` over 500 + 500 + 120 with `max` 2000 gives 1120, `truncated: false`; with `max` 600 it gives 600, `truncated: true`.
  - An empty page stops `pageBySkip`.
  - The CLI argument checks:
    - `download-attachment --guid ../../x` is refused before any request;
    - `get-file --branch dev --commit abc` is refused;
    - `pr-changes` without `--iteration` is refused.
    
    These are exercised by spawning `node ado.mjs …` with `PROJECT_PROFILE_PATH` set to a temp profile that has `vcs.azure`, and asserting a non-zero exit and the message, with no network.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and commands: `call` for JSON; `rawOutPath` then `fetchRetry` then `writeCapped` for the download; the existing `authHeader()`. Add all of them to the header list.
- [ ] **Step 4: Run** the test (PASS), then `npx tsx --test scripts/unit/ado-create-preflight.test.mjs scripts/unit/ado-form-visibility.test.mjs scripts/unit/ado-markdown-html.test.mjs` (PASS).
- [ ] **Step 5: Delete the test, commit**: `feat(vc-fix): ado comments, attachments and Azure Repos PR reads — the connectors' reads through the bridge (vc-test §7)`.

### Task 4: Release 0.14.0

**Files:** `plugins/vc-fix/.claude-plugin/plugin.json` (`"version": "0.14.0"`), `CHANGELOG.md` (an entry: the new commands per CLI, `raw-out`, the `.vc-fix/`-only download rule)

- [ ] **Step 1: Bump and write the changelog entry.** Leave `marketplace.json` as it is: no component counts change.
- [ ] **Step 2: Check.** Run `claude plugin validate plugins/vc-fix`, `npm test` and `npm run context:check`. Expected: all green. Then, through the bridge in this repository, run `node "$VC_RUN" jira comments --key <a ticket the profile's tracker holds> --max 5`. Expected: JSON with up to 5 raw comments. This is a live read-only check that the bridge admits the new command name.
- [ ] **Step 3: Commit**, then push and open the PR: `release(vc-fix): 0.14.0 — the tracker CLIs' read commands for the vc-test connectors`.
- [ ] **Step 4: After merge**, from `plugins/vc-fix/`, run `claude plugin tag --push`. Expected: `git tag -l 'vc-fix--v*'` lists `vc-fix--v0.14.0`.
