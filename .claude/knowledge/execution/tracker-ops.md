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
- **One carve-out, and only one:** a comment that must **display screenshots** cannot be Markdown —
  see §5c. Prose stays Markdown everywhere else.

## 5b. Bug-filing relationship — Sub-task vs Link vs Standalone

`/qa-test` Step 5d files a confirmed bug with one of three relationships to the ticket under test, set by
that finding's **provenance** (5a). This is the contract `/qa-bug` follows when invoked with a relationship
context (`sub-task-of:<ticket-key>` / `link-only:<existing-bug-key>`); a standalone `/qa-bug` call
(no relationship context) is unaffected and keeps creating an ordinary Bug as today.

| Relationship | Jira | Azure Boards |
|---|---|---|
| **IN-SCOPE → Sub-task of `<ticket-key>`** | `createJiraIssue` with `fields.issuetype.name = "Sub-task"` + `fields.parent = {key: <ticket-key>}`. **Probe first** via `getJiraIssueTypeMetaWithFields` on the project — some projects rename or disable the Sub-task type, and a parent whose own type is an Epic may not support one. On a miss, **fall back** to a standalone Bug + a "Relates" link and say so in the filing output — never silently drop the relationship. | Create the Bug work item normally, then `PATCH` its `relations` to add a link of type `System.LinkTypes.Hierarchy-Reverse` pointing at the parent. Azure Boards has no distinct "sub-task" issue type — the hierarchy link *is* the parent-child relationship. |
| **PRE-EXISTING → link only, no new ticket** | `createIssueLink` between the existing bug's key and `<ticket-key>` — resolve the link type id via `getIssueLinkTypes` first (use "Relates"/whatever that project calls it), never hardcode a link-type id. Nothing is filed. | `PATCH` the existing work item's `relations` to add a link of type `System.LinkTypes.Related` to `<ticket-key>`. Nothing is filed. |
| **OUT-OF-SCOPE incidental → standalone + related link** *(unchanged from today)* | `createJiraIssue` (Bug) + `createIssueLink` "Relates" back to `<ticket-key>`. | Create the Bug work item + a `System.LinkTypes.Related` relation to `<ticket-key>`. |

An incidental bug is never a sub-task — it wasn't caused by this ticket's change, so a parent-child
relationship would misrepresent it; it gets its own standalone ticket with a plain "related" link, same as
the in-scope case's fallback path.

### Comment & body style — clear, brief, understandable

Format is not enough — the content must be **easy to read fast**. Every comment or field body you
push to a tracker (bug filing, `/qa-fix` status, `/qa-verify-fix` verdict, `/qa-defect` transition
note) MUST be:
- **Structured, never a wall of text.** Use Markdown headings/short bullets/a small table over one
  long paragraph. A one-line status is a single sentence, not a screenshot dump.
- **Brief — lead with the outcome.** State the verdict/result first (`✅ Verified fixed @ build X`,
  `⚠️ Still reproduces`, `Routed to vc-module-cart, PR #NN`), then only the evidence that
  matters. No investigation logs, no step-by-step narration, no restating the whole ticket.
- **Understandable to a human skimming on a deadline.** Reference evidence (PR link, screenshot,
  `@td` alias, BL-* id), don't inline it. Obey the size discipline in `.claude/rules/reports.md`.
- **Rendered, not raw markup.** Verify the comment renders (bold/lists/code actually format) — a
  literal `**` / `| … |` wall means you sent the wrong dialect (Jira wiki instead of Markdown, or
  Markdown into an Azure HTML field). Fix and re-post. The inverse holds for the §5c
  screenshot carve-out: there the body is wiki markup on purpose, and a literal `h2.` / `||` wall
  means you sent *Markdown* into the v2 endpoint. Whichever dialect you chose, read the posted
  comment back before calling it done.

## 5c. Screenshots in a Jira comment — attach first, then wiki markup (2026-08-07)

> **This section is the MECHANISM. That screenshots MUST be embedded inline is policy — `.claude/rules/reports.md` §5.0 — and it binds documentation, bug reports and fix verification alike. Posting a UI claim with no inline image, or with a Markdown/prose file reference, is a non-delivery, not a cosmetic miss. The `?expand=renderedBody` check below is part of the posting step, not an optional follow-up.**

A Markdown image reference in a Jira comment **silently renders as nothing**. `![alt](path)` pointing
at a repo path, or at a bare filename, is dropped by the Markdown→ADF conversion with no error and no
warning — the comment posts `200 OK` and simply has no image. Naming the file in prose ("Screenshot:
`foo.png`") is not a substitute: the reader still cannot see it. This cost a full round trip on
VCST-5281, where two complete guides were posted with twelve invisible screenshots.

Images live in a Jira comment only if **both** steps happen:

1. **Attach the file to the issue.** The Atlassian MCP has **no attachment tool** — use the REST
   endpoint directly with `JIRA_EMAIL` + `JIRA_API_TOKEN` from `.env.local`:
   ```bash
   curl -sk -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H "X-Atlassian-Token: no-check" \
     -F "file=@path/to/shot.png" [-F "file=@path/to/second.png" ...] \
     "https://<site>.atlassian.net/rest/api/3/issue/<KEY>/attachments"
   ```
   Multiple `-F file=@…` in one request is fine. **Check what already landed before retrying** — a
   failed output pipe does not mean the upload failed, and a blind retry duplicates every attachment
   (`GET /rest/api/3/issue/<KEY>?fields=attachment`).
2. **Reference it as wiki markup, via the v2 comment API.** `POST`/`PUT`
   `/rest/api/2/issue/<KEY>/comment[/<id>]` with a plain-string `body` containing
   `!filename.png|width=700!`. Jira resolves the filename against the issue's attachments and
   converts it to a real ADF media node. The whole comment body must then be wiki markup —
   `h2.` headings, `*bold*`, `_italic_`, `{{mono}}`, `||header||` / `|cell|` tables, `#` numbered and
   `*` bulleted lists, `[text|url]` links, `{panel:title=…}…{panel}` for admonitions.

**Do not** hand-build an ADF `media` node with the numeric attachment id — Jira rejects it with
`400 ATTACHMENT_VALIDATION_ERROR`. The `media.attrs.id` must be a media-service **UUID**, which the
attachment REST API does not expose; the wiki-markup path is what resolves it for you.

**The three ADF dead ends, measured 2026-09-02 on VCST-5319 — do not re-probe them:**

| Attempt | Result |
|---|---|
| `media.attrs` `{type:"file", id:"<attachmentId>", collection:""}` | `400 ATTACHMENT_VALIDATION_ERROR` |
| same, `collection` omitted | `400 INVALID_INPUT` — the field is required |
| same, `collection:"jira-attachments"` | `400 ATTACHMENT_VALIDATION_ERROR` |
| `media.attrs` `{type:"external", url:"…/attachment/content/<id>"}` | **`201 Created`, then renders `Can only create thumbnails for attached images`** |

The last one is the trap: it is the only variant that *posts successfully*, so a run that stops at the
status code concludes it worked. `GET /rest/api/3/issue/<KEY>/comment/<id>?expand=renderedBody` is what
distinguishes them — a rendered `<span class="error">` means the images are invisible whatever the POST
returned.

**Read the POSITIVE signal off the `<img>`, not off `file-preview-id`.** That attribute was the marker on
the 2026-09-02 VCST-5319 measurement and it does **not** appear on a working wiki render: verified
2026-09-03 on VCST-5868, where a correct `!file.png|width=700!` renders as
`<span class="image-wrap"><img src=".../rest/api/3/attachment/content/<attachmentId>" width=…>` with
**zero** `file-preview-id` occurrences. A check gated on that attribute would have called three correctly
rendered images a failure. The three signals that did hold: one `<img src=…/attachment/content/…>` per
image in `renderedBody`; via the v3 read below, one ADF `media` node per image whose `attrs.id` is a
36-char UUID with `type: "file"`; and **zero** surviving literal `!…png!` in `renderedBody`, which proves
the wiki markup was converted rather than printed.

**Probe on a throwaway comment, never on the deliverable.** Post a one-line test comment, iterate the
variants against it, then write the real comment once with the form that rendered — and delete the probe
(`DELETE /rest/api/2/issue/<KEY>/comment/<id>` → `204`). Iterating on the deliverable itself means
repeatedly overwriting a comment other people may already be reading.

**Verify, don't assume.** Re-read the comment through the **v3** API and confirm each `media` node's
`attrs.id` is a 36-char UUID:
```bash
curl -sk -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://<site>.atlassian.net/rest/api/3/issue/<KEY>/comment/<id>"
```
Zero media nodes means the images are invisible, whatever the POST returned.

Azure Boards is unaffected — its fields are HTML, so `<img src="…">` against an uploaded attachment
URL works normally.

## 5d. Publishing a deliverable to a ticket means the deliverable

When asked to push a report, guide, analysis, or test model **to a ticket**, post the **artifact
itself**, in full, in the comment body. A summary plus a repo path is not a delivery:

- **Repo paths are not readable by ticket readers.** A path is only resolvable by someone with that
  checkout, at that commit — and if the file is uncommitted, by literally no one but the author.
  Never cite a working-tree path as if it were a link.
- **Summarize only when explicitly asked to.** "Push it to the ticket" means the content. If the
  artifact is genuinely too large for one comment, split it across comments (one per logical
  document) rather than shrinking it to an abstract.
- **A pointer is legitimate only when the target is reachable** — a merged-and-pushed GitHub URL, a
  PR link, an attachment on that same ticket.

## 5. Build-version verification is platform-only

The `vc-deploy-dev` manifest (used to confirm deployed module/Platform/Theme versions) is a
**VirtoCommerce-internal** repo — a client deployment has no access. Gate this step on
`projectType`: native platform → read `vc-deploy-dev`; client → read the deployed versions from
the platform itself (`GET {BACK_URL}/api/platform/modules` after an admin token), which every
deployment exposes.
