# Tracker & Code-Host Operations — profile-driven, NOT hardcoded

Single reference for the interactive bug-lifecycle commands (`/qa-bug`, `/qa-fix`,
`/qa-verify-fix`) so none of them hardcode **Jira + GitHub + VirtoCommerce**. The
deployment's `project-profile.json` (written by `/project-init`, which lives in the `vc-init`
plugin) decides which bug tracker and which code host every operation talks to. **A missing
profile is a STOP — run `/project-init`; there is no Jira / GitHub / VirtoCommerce default
fallback any more.** Commands apply the matrix by reading the profile.

> Read the profile once at the start of a run: `node -e "console.log(JSON.stringify(require('./scripts/lib/project-profile.mjs')))"`
> is not exported that way — instead read `project-profile.json` directly (it's gitignored,
> present only on a configured deployment); absent ⇒ STOP and ask the operator to run `/project-init`.
>
> **Tokens never come from a file.** GitHub / Azure DevOps / Jira tokens live in vc-secrets and reach a
> process only through the bridge: `node "$VC_RUN" gh|git-gh|git-ado|ado|jira …`. `$VC_RUN` is set by
> `/project-init` (vc-init) in `.claude/settings.local.json` `env`; it is the stable path of the bridge
> shim. If it is unset, the project was onboarded before VCST-6402 — run `/project-init --check`.
>
> **Host-governed project** (`governance.host` set): use the host's MCP servers from `governance.servers.*`, never `$VC_RUN` — [`knowledge/execution/host-governance.md`](host-governance.md).

## 0. GOLDEN RULE — ONE comment per ticket per run. Amend it; never append to it.

**A tracker ticket is a shared inbox, not a work log.** Every comment notifies the assignee, the
reporter and every watcher. A run that posts five times has interrupted those people five times to
deliver one conclusion — and left them to reconcile which version is current.

**The rule, and it is absolute:**

1. **One comment per ticket per run.** Compose it locally, post it once, at close-out.
2. **A correction EDITS that comment — it never becomes a second one.** `node "$VC_RUN" jira edit-comment …`
   (a `PUT /rest/api/3/issue/{key}/comment/{id}`, §0a). New evidence, a retraction, a severity change, a formatting fix: all are edits.
3. **Nothing is posted mid-run** "so they know sooner". Findings live in chat and in the local
   report until close-out. If the operator explicitly says *post now*, that post becomes **the**
   comment for the run and everything later amends it.
4. **A second comment *in the same round* requires the operator to ask for one**, for a reason they
   state. Learning something new about the same build is an amend — a run always learns something new.
5. **A retest on an UPDATED artifact is a new round, and a new round is a NEW comment.** The developer
   shipped new builds, so the people waiting on them must be notified, and an edit notifies nobody. The
   earlier comment stays as that round's record — post the new round as a new comment, never an edit
   (`commentId`) of the old one. The plugin's hooks enforce this by age and session: editing a ledger
   comment older than 12 h (`TRACKER_ROUND_HOURS`), or one another session posted, is blocked as a
   probable new round. **Exception:** an autonomous `/qa-test --iterate` loop is one round by design and amends with
   `--same-round "<reason>"` — **but only its own round deltas.** A comment that already holds a
   **published verdict** (a full `QA Complete` report — e.g. an earlier run without `--iterate`) is that
   round's record and is never edited with a later build's result: post the new round as a new comment.
   The plugin's hooks check age and session only, not whether a comment is a verdict — this one is on
   the caller (measured 2026-10-08, VCST-6077: a round-1 FAIL report with inline screenshots was
   overwritten by round 2's PASS).

**Why this is mechanical and not a judgment call.** The failure mode is that every individual
comment is defensible while the aggregate is spam, so judgment-in-the-moment cannot catch it — the
judgment is what failed. The comment id is therefore recorded in `summary.json.tracker.comment_id`
at first post, and its presence is what makes every later write an edit. **No id recorded ⇒ you have
not posted yet. Id recorded ⇒ you may not POST, only PUT.** The hooks' ledger (`.tracker-comments.json`) keys
each entry by ticket **and env** (`<KEY>@<env>`): one ticket tested on two envs is two runs, each with its own comment.

**Measured 2026-09-17, VCST-5378:** one run posted **five** comments in about one hour — a root-cause
comment, a results comment correcting it, a delta measurement, a malformed wiki-markup comment, and a
consolidated report superseding the first three. The fifth contained the other four. Teammates had
already acted on the superseded ones.

**Measured 2026-09-30, VCST-5883 — the opposite failure, which is why rule 5 exists:** a round-2 retest
of NEW builds was amended into round 1's comment 110693, and the developer and PO never learned it
happened. Three mechanisms let it through: the helper's run id was always `local` (it read a session
variable Claude Code does not export), so a checkout was one run forever; `--amend` had no guard at all;
and the MCP hooks matched one server name, so a claude.ai Atlassian connector bypassed them. Fixed in
issue #360 — the round is now keyed on the build under test.

### 0a. How to amend (Jira)

The Atlassian MCP was long used as if `addCommentToJiraIssue` could only post, which is precisely why
corrections turned into new comments. It CAN edit: pass `commentId` (the local `atlassian` server and the
claude.ai connectors alike; `addOrEditJiraIssueComment` on some connectors). There is still no delete tool; the plugin's hooks guard
that edit path and treat a ledger comment older than 12 h as a previous round (rule 5). Otherwise go
through the bridge (the token stays in vc-secrets; the host is the profile's `tracker.baseUrl`):

```bash
# edit an existing comment — body.json = ADF; add --wiki for a wiki-markup (inline-image) body
node "$VC_RUN" jira edit-comment --key <KEY> --id <COMMENT_ID> --body-file body.json
```

**Azure Boards:** `node "$VC_RUN" ado edit-comment --id <ID> --comment-id <COMMENT_ID> --text-file body.txt`
(PATCHes the work item's `/comments/{id}`, api-version 7.1-preview.4).

**If you cannot authenticate for a PUT, you do not get to fall back to a new comment.** Say so, hand
the operator the corrected body, and let them decide.

## 1. Which tracker / host am I on?

| Profile field | Values | Drives |
|---|---|---|
| `tracker.kind` | `jira` \| `azure` | how you resolve / comment / transition a ticket |
| `tracker.baseUrl` / `tracker.projectKey` | Jira site + project key | Jira REST/MCP target |
| `tracker.azure.{organization,project}` + `stateMap` | ADO org/project + status→System.State map | Azure Boards target |
| `vcs.clientHost` | `github` \| `azure-repos` | where a **client** repo's PR is opened |
| `upstream.contributionMode` | `direct` \| `fork` | platform PR: direct vs fork-PR (`upstream.clientGithubAccount`) — a platform frontend bug found in a client fork is contributed upstream the same way (see `provenance.ts` / quality-gates §1a Gate 1b) |

**Ticket key format follows the tracker** — never assume `VCST-`:
- **Jira:** `<PROJECT>-<n>` (e.g. `VCST-5404`, a client's `ABC-123`). Auto-links from a commit/PR by the bare key.
- **Azure Boards:** a **bare numeric id** (`12345`, no letter prefix). Cross-link from a commit/PR with `AB#12345`.

## 2. The four ticket operations, per tracker

Use whichever surface is available; prefer the MCP when connected, else the CLI/REST.

> **Azure interactive: use the `ado.mjs` helper, NOT hand-rolled `curl`+`python`.**
> `node "$VC_RUN" ado <get-workitem|create-workitem|comment|edit-comment|patch-fields|wiql|transition|upload-attachment|list-states|list-types|create-pr|list-policies|get-file|list-refs>`
> (org/project/apiBase default from the profile; the bridge injects the PAT from vc-secrets or runs it on
> the `az login` session; UTF-8 and 302-sign-in detection are built in). This is the fix for last run's repeated Windows grabli — `/tmp` path mismatch between Bash
> and Windows Python, `cp1252` `UnicodeDecodeError` on ADO JSON, emoji/`&quot;` entity breakage, `$top`
> escaping, and ADO REST 400s from inline `-d` JSON. Never hand-roll an authenticated `curl` — it would
> need the token in the shell, and no file holds it any more. `comment --text-file` (never inline prose with em-dashes); `create-pr`/policy
> endpoints already use the right `-preview`/`7.1` api-versions.
>
> **NEVER pipe a plugin script through `head`/`tail` (or any pager).** `node "$VC_RUN" ado … | head`
> makes the exit code that of `head` (0), not `ado.mjs` — a `create-workitem` / `transition` that
> failed 4xx then looks like it *succeeded*, and the self-diagnostics collector, which reads the
> tool's exit status, records nothing (VCST-5582 C3). If you must shorten the output, redirect to a
> file and read the file (`node "$VC_RUN" ado … > out.json 2>&1; echo "exit=$?"`), or use the tool's own
> `--json` and read the fields — never a pipe that swallows the status.
>
> **Windows / Git-Bash: a `--path` starting with `/` gets MSYS-mangled.** On Git-Bash, MSYS rewrites
> a leading-slash argument into a Windows path (`/Web/config.js` → `C:/Program Files/Git/Web/config.js`)
> **before** `ado.mjs` sees it, so `get-file --path /some/repo/path` resolves to the wrong file. `ado.mjs
> get-file` detects the mangling and prints a hint, but you hit it first — so either prefix the command
> with `MSYS_NO_PATHCONV=1` (`MSYS_NO_PATHCONV=1 node "$VC_RUN" ado get-file --path /src/App.cs`) **or** pass
> `--path` **without** the leading slash (`--path src/App.cs`). This is a Git-Bash quirk, not an `ado.mjs`
> bug — it affects any native tool taking a POSIX-looking path argument.

| Op | Jira (`tracker.kind = jira`) | Azure Boards (`tracker.kind = azure`) — via `node "$VC_RUN" ado <cmd>` |
|---|---|---|
| **Create** a ticket | Atlassian MCP `createJiraIssue` (project = `tracker.projectKey`) | `ado create-workitem --type Bug --title … --description-file …` (environment/metadata → dedicated fields: `--system-info-file <html>` for the System Info block + repeatable `--field "Custom.Environment=QA"` / `"Custom.Reportedby=QA team"` / `"Custom.Typeofbug=Functional"`; `--assign-self` (owner via `whoami`) + `--iteration current` (active sprint via `current-iteration`) + `--parent <id>` (ask the operator which work item to link under); plus `--severity`/`--priority`/`--tags`/`--attachments`. Leave `ReproSteps` empty — put the whole abstract report in `--description-file` per [`azure-html-format.md`](azure-html-format.md). Returns `{ id, type, title, state, url }`) |
| **Upload** a screenshot / file | `node "$VC_RUN" jira attach --key <KEY> --file <path>` → `[{ id, filename }]` | `ado upload-attachment --file <path>` → `{ url }`; embed inline as `<img src="{url}">` and/or pass to `create-workitem --attachments "<url1>,<url2>"` |
| **Resolve** a ticket | Atlassian MCP `getJiraIssue` | `ado get-workitem --id <n>` (cleaned fields; wraps `GET {base}/_apis/wit/workitems/<n>?$expand=all`) |
| **Search** by label | Atlassian MCP `searchJiraIssuesUsingJql` (`labels = qa-autofix`) | `ado wiql --query "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'qa-autofix' AND [System.WorkItemType]='Bug'" [--fields System.Title,System.State]` |
| **Comment** | Atlassian MCP `addCommentToJiraIssue` | `ado comment --id <n> --text-file <path>` (amend: `ado edit-comment`, §0a) |
| **Transition / set state** | Atlassian MCP `transitionJiraIssue` — **discover the transition id live**, never hardcode a name | `ado transition --id <n> --role <role>` — the CLI maps ROLE→state for the item's own type via `tracker.azure.roleStatesByType` (scanned per type), never a hardcoded name |

**Created-ticket key follows the tracker** (as in §1): Jira returns a prefixed key (`ABC-123`);
Azure returns a **bare numeric** id (`12345`). Use that key/id verbatim for the follow-up
resolve/comment/transition ops and for commit/PR cross-links (Azure: `AB#12345`).

`{base}` = `https://dev.azure.com/<tracker.azure.organization>/<tracker.azure.project>`.

> **Azure content is HTML, not Markdown.** `System.Description`, `Microsoft.VSTS.TCM.ReproSteps`, and
> comment bodies are **HTML fields** — Markdown fed into them renders as a literal `#`/`**`/`| … |` wall
> (bug descriptions) or collapses into one unreadable paragraph (comments). Author these as HTML per
> [`azure-html-format.md`](azure-html-format.md); `ado.mjs` also auto-converts Markdown→HTML as a safety
> net (author HTML passes through). Pass `--raw` to `create-workitem`/`comment` to send the body
> verbatim and skip the safety net (rarely needed — already-HTML content is detected and passed
> through either way). This is Azure-only.
>
> **Jira content is Markdown, NOT wiki markup (VCST-5212).** Author every Jira description/comment in
> **GitHub-flavored Markdown** (`## Heading`, `**bold**`, `` `code` ``, fenced ```` ``` ```` blocks,
> `-`/`1.` lists, `|` tables) — the Atlassian MCP converts Markdown → ADF. **Never send Jira wiki
> markup** (`h2.`, `*bold*`, `{code}…{code}`, `{{mono}}`) — it renders as literal text. Summaries/titles
> are plain text, no markup.
>
> **ONE carve-out, and only one — a comment that must DISPLAY screenshots cannot be Markdown.**
> A Markdown image reference (`![alt](path)`) and a prose file path both post `200 OK` and render
> NOTHING. Such a comment is attached first, then written as **wiki markup** with
> `!filename.png|width=700!` through the **v2** comment API, and VERIFIED from
> `?expand=renderedBody` (one `<img …/attachment/content/N>` per image, zero surviving `!….png!`,
> zero `<span class="error">`) — through the bridge: `jira attach`, then `jira comment --wiki`, then
> `jira get-comment --rendered`. On Azure Boards the equivalent is `ado upload-attachment`
> then an inline `<img src="{url}">`. Embedding is MANDATORY for any UI claim, not a style choice —
> policy and the verification gate: `.claude/rules/reports.md` §5.0.
>
> **Comment & body style — clear, brief, understandable (both trackers).** Format alone isn't enough;
> the content must read fast. Every comment/field body you push (bug filing, `/qa-fix` status,
> `/qa-verify-fix` verdict, `/qa-defect` note) is: **structured** (Markdown headings / short bullets /
> a small table, never a wall of text); **brief — lead with the outcome** (`✅ Verified fixed @ build X`,
> `Routed to vc-module-cart, PR #NN`), then only the evidence that matters — no investigation logs or
> step-by-step narration; **evidence referenced, not inlined** (PR link, BL-* id) — **except a
> SCREENSHOT, which is always embedded inline per the carve-out above; a referenced image is an
> invisible one** — obeying
> the size caps in `.claude/rules/reports.md`; and **verified to render** (bold/lists/code actually
> format) — a literal `**` / `| … |` wall means the wrong dialect was sent, so fix and re-post.
Auth (never passwords, never a token in a file): Jira via the Atlassian MCP OAuth, or `node "$VC_RUN" jira …`
(the `jira-token` secret in vc-secrets); Azure via `node "$VC_RUN" ado …`, which injects the `ado-pat`
secret or runs on an `az login` session — the profile's `auth.jira` / `auth.ado` decide, and the bridge
handles both, so a command never branches on it.

### Live transition discovery — the load-bearing rule
The former hardcoded Jira transition NAMES ("Take to development", "Go to review", "Ready to
test") are **VC-internal Jira workflow labels** — a client's Jira or Azure Boards won't have
them. Always resolve the *destination status* by role, then map it to the live workflow:

1. Decide the **destination** by lifecycle role, not name:
   - Fix-side (`/qa-fix`): `in-progress` (start work) · `in-review` (PR opened) · `ready-for-test` (awaiting human) · `done`.
   - QA-side (`/qa-verify-fix`): `testing` (QA in progress) · `tested` (QA passed) · `reopen` (QA rejected, back to dev).
   VC-internal Jira reference names for the QA roles: `On QA` → testing, `Finish test` → tested,
   `Need fixes` / `REOPEN` → reopen. Azure Boards maps every role via `tracker.azure.roleStatesByType`
   (the QA roles are scanned best-effort by `/project-init`; hand-edit the profile if missing).
2. **Jira:** call `getTransitionsForJiraIssue` and pick the transition whose target status best
   matches the role (case-insensitive contains: "progress" / "review" / "test" / "done"). If
   none matches, ask the user which transition to use — do NOT invent an id.
3. **Azure Boards:** map the role → a `System.State` of the item's OWN work-item type via
   `tracker.azure.roleStatesByType[<type>]` (`ado transition --role` does it; `roleStates` is the primary
   type's map, kept for older profiles) — the maps `/project-init`
   SCANNED from this deployment's process (a custom process is common; e.g. one client process's Bug is
   `{ "in-progress":"On Dev", "in-review":"On Review", "ready-for-test":"Ready for QA", "done":"Closed" }`
   — NOT the generic Agile `Active/Resolved`). If the map lacks the role, read the work item's allowed
   states (`node "$VC_RUN" ado list-states --type <T>`) and ask the user which state fits.
4. **Honor `tracker.azure.transitionPolicy` — this OVERRIDES the old "always ask":**
   - `auto` (the default once states are scanned) ⇒ transition **silently by role and just log it — do
     NOT open an `AskUserQuestion`.** This is what keeps a client run at ~0 operator questions.
   - `confirm-once` ⇒ one upfront confirmation of the whole role→state plan, then silent.
   - `ask` ⇒ confirm before each transition (the original conservative behaviour; Jira, or an unscanned
     map, defaults here).
   - **QA-side transitions (`/qa-verify-fix`) additionally require `tracker.azure.qaRoleStatesComplete
     === true`.** `transitionPolicy` is unlocked to `"auto"` from the **fix-side** roles alone
     (`in-progress`/`in-review`/`ready-for-test`/`done`) — a deployment can be fix-side "auto" while its
     `testing`/`tested`/`reopen` states are still unconfirmed. So even when `transitionPolicy` reads
     `"auto"`/`"confirm-once"`, `/qa-verify-fix` treats each QA-side transition as `ask` until
     `qaRoleStatesComplete` is `true` — do not apply the fix-side policy to a QA-side transition without
     checking this flag first.

## 2a. Labels on bugs Claude files

Every Jira **Bug** Claude creates — and every **Sub-task** that is a bug (§5b in-scope filing) — says who found it
and, for an agent finding, during what.
In the VirtoCommerce QA repo a PreToolUse hook refuses the create call without a valid set.

| Who found it | Labels |
|---|---|
| Claude, while testing a ticket (`/qa-test`, `/qa-test-fast`, exploratory) | `found-by-agent` + `found-in-testing` |
| Claude, in a regression run (`/qa-regression`, `ci:regression`, triage of a run) | `found-by-agent` + `found-in-regression` |
| A person — the user saying "I found this, file it", a Teams/partner report | `reported-by-human` |

The labels go in the create call's `labels` parameter where the tool has one (the claude.ai connector), else
in `additional_fields.labels`; keep any labels already there.

**Found by the agent means Claude saw the failure itself in this session.** That is a verdict,
screenshot, API response or trace from its own run. If a person described the bug — even when they
ask Claude to file it, and even when Claude then reproduces it — the label is `reported-by-human`.
If the origin is unclear, it is `reported-by-human` too. Undercounting agent findings is harmless;
crediting agents with a person's finding corrupts the metric.

A label that turns out wrong is corrected in Jira by hand. **These labels are VC-internal: apply them only on
VC's own Jira, never on a client project's tracker.**

## 3. Which git/PR mechanism? — from `contributionPlan(repo)`

After Gate 1 resolves the one repo, read `contributionPlan(routeRepo)` (`skills/qa-fix-routing/repo-router.ts`)
— it returns `{ ownership, host, mode, forkOwner, azure }`. That, not a hardcoded assumption,
picks how you clone/push/PR:

| `contributionPlan` result | Clone / push | Open PR |
|---|---|---|
| client repo, `host=github` | `node "$VC_RUN" git-gh clone https://github.com/<clientOrg>/<repo>` | `node "$VC_RUN" gh pr create` on the client repo |
| client repo, `host=azure-repos` | `node "$VC_RUN" git-ado clone https://dev.azure.com/<org>/<project>/_git/<repo>` | `node "$VC_RUN" ado create-pr --repo <repo> …` (wraps `POST {base}/_apis/git/repositories/<repo>/pullrequests?api-version=7.1`) |
| platform repo, `mode=direct` | `node "$VC_RUN" git-gh clone https://github.com/VirtoCommerce/<repo>` | `node "$VC_RUN" gh pr create` (today's path) |
| platform repo, `mode=fork` | `node "$VC_RUN" gh repo fork` → `git-gh clone` the fork, branch from `upstream/<base>` | `node "$VC_RUN" gh pr create --head <forkOwner>:<branch>` |

`checkoutForFix(repo, key, ws)` already encodes all four — prefer calling it over doing this by
hand. For opening the PR, you run the matching command above.

### Write auth per host
- **Every remote write goes through the bridge** — `node "$VC_RUN" gh …` and `node "$VC_RUN" git-gh|git-ado
  [-C <dir>] clone|fetch|push|ls-remote …`. Local-only git (commit, checkout, branch, diff, log,
  status, merge, rebase, reset) stays plain `git` — to update a checkout, `git-gh fetch` through the bridge
  and then merge or rebase locally (no `pull`: its merge would run the repository's drivers with the token). The ambient MCP token is read-only. (See
  `knowledge/agents/developers/shared-instructions.md` §GitHub authentication.)
- **PAT axis or session axis — same command.** On a PAT axis (`auth.github: pat` / `auth.ado: pat`) the
  bridge injects the `github-pat` / `ado-pat` secret from vc-secrets; on a session axis (`gh auth login` /
  `az login`) it runs the tool directly. Never branch on the profile's `auth.*`, never put a token in a
  clone URL or an env prefix, never a password. `gh auth *` and `gh pr merge` are refused by the bridge.

## 4. Preflight ordering — probe the RESOLVED host, after Gate 1

Do the write-credential preflight **after** Gate 1 (once the routed repo — hence its host — is
known), not before. Probe only the axis `contributionPlan(routeRepo).host` needs:
- `github` → `node "$VC_RUN" gh api repos/<owner>/<repo> --jq .permissions.push` — must be `true` (on either axis).
- `azure-repos` → `node "$VC_RUN" ado list-refs --repo <repo>` returning JSON (not the 203+HTML sign-in
  page) proves the PAT/`az` session can reach it.

A native-platform run resolves `host=github`, `mode=direct` ⇒ exactly the original preflight.

## 5. Build-version verification is platform-only

The `vc-deploy-dev` manifest (used to confirm deployed module/Platform/Theme versions) is a
**VirtoCommerce-internal** repo — a client deployment has no access. Gate this step on
`projectType`: native platform → read `vc-deploy-dev`; client → read the deployed versions from
the platform itself (`GET {BACK_URL}/api/platform/modules` after an admin token), which every
deployment exposes.
