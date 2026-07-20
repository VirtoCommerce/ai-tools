# Tracker & Code-Host Operations — profile-driven, NOT hardcoded

Single reference for the interactive bug-lifecycle commands (`/qa-bug`, `/qa-fix`,
`/qa-verify-fix`) so none of them hardcode **Jira + GitHub + VirtoCommerce**. The
deployment's `project-profile.json` (written by `/project-init`) decides which bug tracker
and which code host every operation talks to. **With no profile ⇒ Jira / GitHub /
VirtoCommerce — the original VC-internal behaviour, unchanged.** The headless twins
(`ci/lib/trackers/*`, `ci/lib/vcs/*`) already do this in code; interactive commands must
apply the same matrix by reading the profile.

> Read the profile once at the start of a run: `node -e "console.log(JSON.stringify(require('./scripts/lib/project-profile.mjs')))"`
> is not exported that way — instead read `project-profile.json` directly (it's gitignored,
> present only on a configured deployment) or infer the defaults when absent.

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
> `node "$pluginRoot/skills/qa-fix-routing/ado.mjs" <get-workitem|create-workitem|comment|transition|upload-attachment|list-states|list-types|create-pr|list-policies|get-file|list-refs>`
> (org/project/apiBase default from the profile; Basic-PAT/az-login auth, UTF-8, and 302-sign-in detection
> are built in). This is the fix for last run's repeated Windows grabli — `/tmp` path mismatch between Bash
> and Windows Python, `cp1252` `UnicodeDecodeError` on ADO JSON, emoji/`&quot;` entity breakage, `$top`
> escaping, and ADO REST 400s from inline `-d` JSON. Hand-rolled `curl` is the fallback for a native
> agentic checkout only. `comment --text-file` (never inline prose with em-dashes); `create-pr`/policy
> endpoints already use the right `-preview`/`7.1` api-versions.

| Op | Jira (`tracker.kind = jira`) | Azure Boards (`tracker.kind = azure`) — via `ado.mjs` |
|---|---|---|
| **Create** a ticket | Atlassian MCP `createJiraIssue` (project = `tracker.projectKey`) | `ado.mjs create-workitem --type Bug --title … --description-file …` (environment/metadata → dedicated fields: `--system-info-file <html>` for the System Info block + repeatable `--field "Custom.Environment=QA"` / `"Custom.Reportedby=QA team"` / `"Custom.Typeofbug=Functional"`; `--assign-self` (owner via `whoami`) + `--iteration current` (active sprint via `current-iteration`) + `--parent <id>` (ask the operator which work item to link under); plus `--severity`/`--priority`/`--tags`/`--attachments`. Leave `ReproSteps` empty — put the whole abstract report in `--description-file` per [`azure-html-format.md`](azure-html-format.md). Returns `{ id, type, title, state, url }`) |
| **Upload** a screenshot / file | (Jira: MCP attachment) | `ado.mjs upload-attachment --file <path>` → `{ url }`; embed inline as `<img src="{url}">` and/or pass to `create-workitem --attachments "<url1>,<url2>"` |
| **Resolve** a ticket | Atlassian MCP `getJiraIssue` | `ado.mjs get-workitem --id <n>` (cleaned fields; wraps `GET {base}/_apis/wit/workitems/<n>?$expand=all`) |
| **Search** by label | Atlassian MCP `searchJiraIssuesUsingJql` (`labels = qa-autofix`) | ADO WIQL `POST {base}/_apis/wit/wiql` — `… WHERE [System.Tags] CONTAINS 'qa-autofix' AND [System.WorkItemType]='Bug'` |
| **Comment** | Atlassian MCP `addCommentToJiraIssue` | `ado.mjs comment --id <n> --text-file <path>` |
| **Transition / set state** | Atlassian MCP `transitionJiraIssue` — **discover the transition id live**, never hardcode a name | `ado.mjs transition --id <n> --state <roleStates[role]>` — map ROLE→state via `tracker.azure.roleStates` (scanned per type), never a hardcoded name |

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
> through either way). This is Azure-only — Jira keeps its own markup.
Auth (never passwords): Jira via the Atlassian MCP OAuth (or `JIRA_API_TOKEN`+`JIRA_EMAIL`);
Azure via `ADO_PAT` (Basic, empty user) or an `az login` session (`ADO_AUTH=az-login`) — same
helpers as `ci/lib/ado-rest.ts`.

### Live transition discovery — the load-bearing rule
The former hardcoded Jira transition NAMES ("Take to development", "Go to review", "Ready to
test") are **VC-internal Jira workflow labels** — a client's Jira or Azure Boards won't have
them. Always resolve the *destination status* by role, then map it to the live workflow:

1. Decide the **destination** by lifecycle role, not name:
   - Fix-side (`/qa-fix`): `in-progress` (start work) · `in-review` (PR opened) · `ready-for-test` (awaiting human) · `done`.
   - QA-side (`/qa-verify-fix`): `testing` (QA in progress) · `tested` (QA passed) · `reopen` (QA rejected, back to dev).
   VC-internal Jira reference names for the QA roles: `On QA` → testing, `Finish test` → tested,
   `Need fixes` / `REOPEN` → reopen. Azure Boards maps every role via `tracker.azure.roleStates`
   (the QA roles are scanned best-effort by `/project-init`; hand-edit the profile if missing).
2. **Jira:** call `getTransitionsForJiraIssue` and pick the transition whose target status best
   matches the role (case-insensitive contains: "progress" / "review" / "test" / "done"). If
   none matches, ask the user which transition to use — do NOT invent an id.
3. **Azure Boards:** map the role → a `System.State` via `tracker.azure.roleStates` — the map
   `/project-init` SCANNED from this deployment's process (a custom process is common; e.g. LEO's Bug is
   `{ "in-progress":"On Dev", "in-review":"On Review", "ready-for-test":"Ready for QA", "done":"Closed" }`
   — NOT the generic Agile `Active/Resolved`). If the map lacks the role, read the work item's allowed
   states (`ado.mjs list-states --type <T>`) and ask the user which state fits.
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

## 3. Which git/PR mechanism? — from `contributionPlan(repo)`

After Gate 1 resolves the one repo, read `contributionPlan(routeRepo)` (`ci/lib/repo-router.ts`)
— it returns `{ ownership, host, mode, forkOwner, azure }`. That, not a hardcoded assumption,
picks how you clone/push/PR:

| `contributionPlan` result | Clone / push | Open PR |
|---|---|---|
| client repo, `host=github` | `gh repo clone` (client org) | `gh pr create` on the client repo |
| client repo, `host=azure-repos` | `git clone https://dev.azure.com/<org>/<project>/_git/<repo>` (auth: `ADO_PAT` or `az`) | ADO REST `POST {base}/_apis/git/repositories/<repo>/pullrequests?api-version=7.1` |
| platform repo, `mode=direct` | `gh repo clone VirtoCommerce/<repo>` | `gh pr create` (today's path) |
| platform repo, `mode=fork` | fork → clone the fork, branch from `upstream/<base>` | `gh pr create --head <forkOwner>:<branch>` |

`checkoutForFix(repo, key, ws)` already encodes all four — prefer calling it over doing this by
hand. For opening the PR, the headless `getVcs(plan.host)` picks GitHub vs Azure Repos; interactive
you run the matching command above.

### Write auth per host
- **GitHub, PAT host:** all remote git/gh writes as `GH_TOKEN` ← `GITHUB_FIX_BUGS_TOKEN` (`.env.local`);
  the ambient MCP token is read-only. (See `knowledge/agents/developers/shared-instructions.md` §GitHub authentication.)
- **GitHub, browser-login host** (`vcs.auth: "gh-cli"`): the ambient `gh` already has write scope —
  drop the `GH_TOKEN=` prefix (`gh auth status` confirms).
- **Azure Repos:** `ADO_PAT` embedded in the clone URL, or an `az login` session — never a password.

## 4. Preflight ordering — probe the RESOLVED host, after Gate 1

Do the write-credential preflight **after** Gate 1 (once the routed repo — hence its host — is
known), not before. Probe only the axis `contributionPlan(routeRepo).host` needs:
- `github` → `GH_TOKEN="$GITHUB_FIX_BUGS_TOKEN" gh api repos/<owner>/<repo> --jq .permissions.push` (or,
  on a `gh-cli` host, `gh auth status` shows write) — must be `true`.
- `azure-repos` → a `GET {base}/_apis/git/repositories/<repo>?api-version=7.1` returning JSON
  (not the 203+HTML sign-in page) proves the PAT/`az` session can reach it.

A native-platform run resolves `host=github`, `mode=direct` ⇒ exactly the original preflight.

## 5. Build-version verification is platform-only

The `vc-deploy-dev` manifest (used to confirm deployed module/Platform/Theme versions) is a
**VirtoCommerce-internal** repo — a client deployment has no access. Gate this step on
`projectType`: native platform → read `vc-deploy-dev`; client → read the deployed versions from
the platform itself (`GET {BACK_URL}/api/platform/modules` after an admin token), which every
deployment exposes.
