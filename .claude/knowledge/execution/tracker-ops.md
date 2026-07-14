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

| Op | Jira (`tracker.kind = jira`) | Azure Boards (`tracker.kind = azure`) |
|---|---|---|
| **Resolve** a ticket | Atlassian MCP `getJiraIssue` | `az boards work-item show --id <n> --org https://dev.azure.com/<org>` (needs `az extension add --name azure-devops`), or ADO REST `GET {base}/_apis/wit/workitems/<n>?$expand=all&api-version=7.0` |
| **Search** by label | Atlassian MCP `searchJiraIssuesUsingJql` (`labels = qa-autofix`) | ADO WIQL `POST {base}/_apis/wit/wiql` — `… WHERE [System.Tags] CONTAINS 'qa-autofix' AND [System.WorkItemType]='Bug'` |
| **Comment** | Atlassian MCP `addCommentToJiraIssue` | ADO REST `POST {base}/_apis/wit/workItems/<n>/comments?api-version=7.0-preview.3` |
| **Transition / set state** | Atlassian MCP `transitionJiraIssue` — **discover the transition id live**, never hardcode a name | ADO REST `PATCH {base}/_apis/wit/workitems/<n>` op `add /fields/System.State` = the mapped state (via `tracker.azure.stateMap`) |

`{base}` = `https://dev.azure.com/<tracker.azure.organization>/<tracker.azure.project>`.
Auth (never passwords): Jira via the Atlassian MCP OAuth (or `JIRA_API_TOKEN`+`JIRA_EMAIL`);
Azure via `ADO_PAT` (Basic, empty user) or an `az login` session (`ADO_AUTH=az-login`) — same
helpers as `ci/lib/ado-rest.ts`.

### Live transition discovery — the load-bearing rule
The former hardcoded Jira transition NAMES ("Take to development", "Go to review", "Ready to
test") are **VC-internal Jira workflow labels** — a client's Jira or Azure Boards won't have
them. Always resolve the *destination status* by role, then map it to the live workflow:

1. Decide the **destination** by lifecycle role, not name:
   `in-progress` (start work) · `in-review` (PR opened) · `ready-for-test` (awaiting human) · `done`.
2. **Jira:** call `getTransitionsForJiraIssue` and pick the transition whose target status best
   matches the role (case-insensitive contains: "progress" / "review" / "test" / "done"). If
   none matches, ask the user which transition to use — do NOT invent an id.
3. **Azure Boards:** map the role → a `System.State` via `tracker.azure.stateMap` (e.g.
   `{ "in-progress":"Active", "in-review":"Resolved", "ready-for-test":"Resolved", "done":"Closed" }`).
   If the map lacks the role, read the work item's allowed states (`GET …/workitems/<n>?$expand=all`
   surfaces the type) and ask the user.
4. **Ask the user before every transition** (unchanged from the Jira-only flow).

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

## 5a. Ticket field mapping + body format — per tracker

When you **create or edit** a ticket (file a bug, add a comment), map the report to the tracker's
native fields and use that tracker's native body format. **Never assume Jira field names or wiki
markup.**

### Field mapping (report → tracker field)

| Report piece | Jira (`createJiraIssue` / `editJiraIssue`) | Azure Boards (`PATCH …/workitems/<n>`) |
|---|---|---|
| Project / area | `fields.project.key` = `env.JIRA_PROJECT_KEY` (default `VCST`) | `System.AreaPath` (org/project from `tracker.azure`) |
| Work item type | `fields.issuetype.name` = `Bug` | `System.WorkItemType` = `Bug` |
| Title / summary | `fields.summary` — **plain text**, no markup | `System.Title` — plain text |
| Body / description | `fields.description` — **Markdown** (see below) | `System.Description` + repro in `Microsoft.VSTS.TCM.ReproSteps` — **HTML** |
| Severity → priority | `fields.priority.name` — Critical→Highest, High→High, Medium→Medium, Low→Low | `Microsoft.VSTS.Common.Priority` / `…Severity` (per `tracker.azure` map) |
| Labels / tags | `fields.labels` (e.g. `qa-autofix`) | `System.Tags` (semicolon-separated) |
| Environment | `fields.environment` (env name + build) if the screen has it | fold into `System.Description` |

Send only fields the ticket's create-meta actually exposes — probe with
`getJiraIssueTypeMetaWithFields` (Jira) / `GET …/workitems/<n>?$expand=all` (Azure) rather than
guessing custom-field ids.

### Body format — Markdown, NOT Jira wiki markup (VCST-5212)

- **Jira via the Atlassian MCP:** author the description/comment in **GitHub-flavored Markdown**
  (`## Heading`, `**bold**`, `` `code` ``, fenced ```` ``` ```` blocks, `-`/`1.` lists, `|` tables).
  The MCP converts Markdown → ADF for you. **Do NOT send Jira wiki markup** (`h2.`, `*bold*`,
  `{code}…{code}`, `{{mono}}`, `# numbered`) — it renders as literal text, the failure filed as
  **VCST-5212**. When in doubt, it's Markdown.
- **Azure Boards:** the description/repro-steps fields are **HTML**, not Markdown and not wiki —
  convert the Markdown report body to simple HTML (`<h2>`, `<b>`, `<pre>`, `<ul>`/`<ol>`, `<table>`)
  before the `PATCH`.
- The on-disk `reports/bugs/*.md` file stays plain Markdown regardless — this rule is only about
  what you push into a **tracker field**.

## 5. Build-version verification is platform-only

The `vc-deploy-dev` manifest (used to confirm deployed module/Platform/Theme versions) is a
**VirtoCommerce-internal** repo — a client deployment has no access. Gate this step on
`projectType`: native platform → read `vc-deploy-dev`; client → read the deployed versions from
the platform itself (`GET {BACK_URL}/api/platform/modules` after an admin token), which every
deployment exposes.
