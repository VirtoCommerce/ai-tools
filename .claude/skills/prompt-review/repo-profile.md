# QA profile — the repo-specific criteria for the QA toolset

The generic dimensions in [`review-dimensions.md`](review-dimensions.md) apply to every prompt. This
file adds the rules this repository holds its **QA toolset** to, keyed to the same `G` ids. A
section here sharpens the generic one and never replaces it.

## Scope

**In scope:**
- every skill and command whose name starts with `qa-`, under `.claude/skills/`,
  `.claude/commands/`, `plugins/vc-fix/skills/` and `plugins/vc-fix/commands/`, with their
  supporting files;
- every **QA agent**: the agents in the QA Team table of `.claude/rules/agents.md` (read the
  roster there, never from a copy), plus their copies under `plugins/vc-fix/agents/`.

A unit counts as in scope if any of its files is: a `qa-*` command reviewed with its skill is one
QA unit.

**Out of scope:** every other prompt: BA and Developers team agents, the `vc-fix` monitor and
self-check agents, `vc-perf`, `ba-*`, `vc-*`, `prompt-review`, `review-pr-*`. These get the generic
dimensions only. State the scope in the close-out ("QA profile applied" / "generic only").

**The per-component checklist is owned by** `.claude/knowledge/agents/authoring-standard.md`
(§2 placement and frontmatter, §4 mandatory citations, §5 the `kb` step, §6 review checklist).
This file adds severities to it and must not contradict it.

**§Tooling runs for every target** in this repository: it is the mechanical half of generic checks
(G3 references, G7 size). §QA greps and the criteria sections apply in scope only.

The rules are **cited, not restated**. Where a cited owner and this file disagree, the owner wins,
and the disagreement is a finding against this skill.

## Tooling

Run both blocks in one batch with the generic §Candidates. `T` is the space-separated list of the
unit's files. Nothing is written to disk.

**Facts** — BUDGET-004 status, the cap itself (never transcribe it), baseline entry, DOC findings:
```bash
npm run -s context:report | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);
console.log("cap",r.BUDGET.promptBodyChars,"| linter scans CLAUDE.md + .claude/** only");
for(const f of process.argv.slice(1)){const o=r.prompts.over.find(x=>x.file===f);
 console.log(f,o?`OVER: ${o.chars} (allowed ${o.allowed})`:"not over (or not scanned: plugins/*)",
  r.promptBaseline[f]?"| in baseline":"",
  r.findings.filter(x=>x.file===f).map(x=>`| ${x.code}:${x.line} ${x.detail}`).join(" "))}})' $T
wc -c $T
```

**Citation sweep** — resolves markdown links and backticked file names relative to the citing
file, the repo root, `.claude/` and (for `plugins/*`) the plugin root; checks `file.md §Heading` (first two words); skips fenced code; flags a bare
`§N` with no file; prints each `BL-*` id's real title so you can check it backs the claim:
```bash
node -e '
const fs=require("fs"),path=require("path"),all=require("child_process").execSync("git ls-files",{encoding:"utf8"}).split("\n");
const bl=require("child_process").execFileSync("npx",["tsx","-e","import(\"./scripts/knowledge/bl-yaml.ts\").then(m=>process.stdout.write(m.oracleText()))"],{encoding:"utf8",maxBuffer:1e8});
const heads=f=>{try{return fs.readFileSync(f,"utf8").split("\n").filter(l=>/^#+ /.test(l)).map(l=>l.replace(/^#+\s*/,"").toLowerCase())}catch{return null}};
for(const f of process.argv.slice(1)){const plug=(f.match(/^plugins\/[^/]+\//)||[""])[0];
 const resolve=r=>[path.join(path.dirname(f),r),r,plug&&path.join(plug,r),path.join(".claude",r)].find(p=>p&&fs.existsSync(p));
 let fence=false;fs.readFileSync(f,"utf8").split("\n").forEach((l,i)=>{const at=`${f}:${i+1}`;if(/^```/.test(l)){fence=!fence;return}if(fence)return;
  const bare=l.replace(/\[[^\]]*\]\([^)]*\)/g,"");const refs=[...l.matchAll(/\]\(([^)#\s]+)/g),...bare.matchAll(/`([^`\s]+\.(?:md|mjs|ts|js|json|yml|csv))`/g)].map(m=>m[1]);
  for(const r of refs){if(/^https?:|[<*{$]|XX|\.\.\./.test(r))continue;
   if(!resolve(r)){const hit=all.filter(p=>p.endsWith("/"+path.basename(r)));console.log(`${at}  UNRESOLVED ${r}${hit.length?"  (same name at: "+hit.slice(0,2).join(", ")+")":""}`)}}
  for(const m of l.matchAll(/`([^`\s]+\.md)`\s*§\s*([A-Za-z0-9][^`,;.)*—(]{2,40})/g)){const p=resolve(m[1]);const h=p&&heads(p);const want=m[2].replace(/[^\w\s-]/g," ").trim().toLowerCase().split(/\s+/).slice(0,2).join(" ");
   if(h&&!h.some(x=>x.includes(want)))console.log(`${at}  §MISSING ${m[1]} §${m[2].trim()}`)}
  if(/(^|[^`\w])§\s*\d/.test(l)&&!/\.md/.test(l))console.log(`${at}  §-with-no-file: ${l.trim().slice(0,70)}`);
  for(const id of new Set(l.match(/\bBL-[A-Z]+-\d+\b/g)||[])){const m=bl.match(new RegExp("^#+ "+id+":?\\s*(.*)$","m"));console.log(`${at}  ${id} = ${m?m[1].slice(0,60):"NOT IN the BL oracle"}`)}
 })}' $T
```
An UNRESOLVED name with a "same name at" hint is usually a bare filename that should carry its
path; one with no hint is dangling. The sweep cannot tell whether a cited file actually **says**
what the prompt claims — for citations on a step's critical path, open the target and check.

## QA greps

In scope only. Candidates only; confirm each before it becomes a finding (a grep with no hits exits 1 — that is not an error):
```bash
grep -nE '\b(feedback|reference|project)_[a-z0-9_]{3,}' $T                        # G3 memory slugs
grep -nE '~/\.claude|settings\.local\.json|[A-Z]:\\|/Users/' $T                    # G3 per-user paths
grep -nEi '"browser": *"chrome"|--browser[ =]chrome\b|webkit' $T                   # G3 browser engine
grep -nE -- '--secrets.*\{\{|\{\{[A-Z_]*PASSWORD\}\}.*(browser_type|fill)' $T       # G5 secrets
grep -nE 'merge_pull_request|gh pr merge|auto-?merge' $T                           # G5 — a PROHIBITION is fine
grep -nEi 'transition(Jira)?Issue|transition the (ticket|issue)|move (it|the ticket) to' $T  # G5 status writes
grep -nE '~?\b[0-9]{2,}\+?[- ](suites?|test cases?|cases?|agents?|skills?|commands?|files?|dimensions?|class(es)?|groups?)\b' $T  # G6 counts
grep -nE '\bdefault(s| is| of)? [0-9]+\b|\(default [0-9]+\)' $T                    # G6 transcribed defaults
grep -nE 'https?://[A-Za-z0-9.-]+\.(azurewebsites\.net|virtocommerce\.(com|cloud)|govirto\.com)' $T  # G6 hosts
grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' $T        # G6 GUIDs
grep -nE 'reports/tickets/Sprint[0-9]' $T                                          # G6 evidence paths
grep -nE 'kb_ask|kb_capture|npm run kb' $T                                         # G8 — present where a step establishes platform behaviour?
```

---

## G1 — Interface

- `name` = directory / file name; `argument-hint` matches `## Usage` and what the steps parse.
- `.claude/skills/qa-*` descriptions lead with their `[Category]` tag (`.claude/skills/README.md`).
- **Invocation control is `disable-model-invocation`.** With it `true`, the description is not in
  the model's context; check instead that no caller needs to invoke it. QA pipelines call each
  other by name (`/qa-test` 5-triage → `/qa-triage-results`, `/qa-test-lifecycle` Phase 4c →
  `/qa-review-bl`, CI under `ci/`) — such a caller of a disabled skill → MAJOR: the Skill tool cannot run it, and reading the
  `SKILL.md` instead is an unreliable workaround, not a pass.
- **Routing:** a ticket-driven QA flow agrees with `.claude/knowledge/execution/ticket-routing.md`;
  a user-facing one has its `.claude/ROUTING.md` row, and every skill its `.claude/skills/README.md`
  row → MINOR if missing.
- **What it produces follows the policy for that artifact**, and the prompt cites the owner:
  - a report → one of the ten categories, its size cap and required sections
    (`.claude/rules/reports.md` §1, §2; `.claude/knowledge/execution/reports-policy.md`) → MAJOR if
    it writes outside them;
  - a test case → `.claude/knowledge/execution/cases-that-catch-bugs.md` (never rewrite an
    expectation to match the build; `Catches:` the bug it targets) → MAJOR if the prompt tells it
    otherwise;
  - a unit test → `.claude/knowledge/execution/when-to-write-a-test.md` (no code ⇒ no test; a
    committed new `scripts/unit/` file) → MAJOR if the prompt commits one;
  - consumed artifacts (`summary.json`, suite CSVs, fingerprint stores) keep their schema.
- **QA agents:**
  - frontmatter per the authoring standard §2 (`name`, `description`, `model`, `color`,
    `applicability` + `applicability_rationale`) → MINOR per missing key; `tools`, if declared,
    covers every tool the body uses → MAJOR if not;
  - the first lines point at `.claude/knowledge/agents/qa/shared-instructions.md` instead of copying
    from it (authoring standard §2) → MINOR if missing, and a copied block is a G6 finding;
  - the agent has its row in the QA Team table of `.claude/rules/agents.md`, and the row's purpose
    matches the body → MINOR if missing, MAJOR if the row promises a duty the body does not carry
    (e.g. the verifier mode of `qa-lead-orchestrator`).

## G3 — Executability

- **Memory slugs.** A slug that **carries** a claim rather than trailing one stated in full →
  MINOR, or MAJOR when a step acts on the claim (`CLAUDE.md` §What reaches a teammate).
- **Per-user paths** (`~/.claude/…`, `settings.local.json`, an absolute OS path) → MAJOR.
- **Environment:** URLs and credentials come from the layered loader keyed by `TEST_ENV`, resolved
  through `process.env` after importing `config.js` — never read off one `.env.*` layer or the
  curated `env` export (`.claude/rules/test-data.md` §Resolving a variable) → MAJOR if a step
  concludes "unset" that way.
- **Browsers:** `chromium`, not `chrome`; no WebKit on Windows (fall back to Edge); an MCP config
  change needs a server restart (`.claude/rules/agents.md` §Browser Automation Rules) → MAJOR if a
  step does otherwise.
- **Deferred tools** (the `kb` tools among them) are loaded by exact id before the first call
  (`CLAUDE.md` §Essential Rules) → MAJOR if a step calls one cold.
- **Plugin `qa-*` prompts:** bare relative paths are a documented limitation (`CLAUDE.md` §Project
  Overview). Flag only a **new** instance, or one without the documented mitigation (a script
  resolving off `import.meta.url` / `pluginRoot()`) → MINOR.
- **Tool-contract traps already met by QA prompts:** the REST review-comments payload does not carry
  thread resolution (only the GraphQL review threads do); `gh pr view --json files` stops at 100
  files without saying so (use the paginated `pulls/<n>/files` API); `git worktree add` fails when
  the path already exists.

## G4 — Delegation

Judge each dispatch against `.claude/rules/agents.md` §Agent Delegation and §Parallel Execution
(cite them; do not restate). In particular:

- **Agent and lane:** the agent exists in `.claude/agents/` (or is a harness type); a browser agent
  gets its assigned Playwright server; never two agents on one browser session; at most three
  browser agents at once, QA and BA combined → MAJOR.
- **Platform behaviour:** a brief that sends a specialist to establish how the platform behaves
  names the `kb` tool id and puts the coordinate (endpoint, GraphQL operation, page path) in the
  question → MAJOR if missing.
- **Doc vs artifact:** a brief never tells a subagent to prefer a doc over the artifact it edits
  (`.claude/rules/agents.md` §MCP servers) → MAJOR.
- **Verifier ≠ doer:** a verification step is a fresh instance, never the step's own doer, and a
  live re-check runs on a different browser lane → MAJOR.
- **One writer per suite CSV** for the whole change, never two in parallel
  (`.claude/rules/regression.md` §Suite inventory) → MAJOR.
- **Regression fan-out** is batched in groups of three → MINOR if unbounded.
- **A QA agent's own lane:** the browser server its body uses matches its row in
  `.claude/rules/agents.md` §Parallel Execution → MAJOR if it differs (two agents then collide on
  one session). An agent with no browser there never opens one → MAJOR.
- **A QA agent that dispatches** uses the brief line of `.claude/templates/agent-dispatch.md` and
  checks the recipient's tools and lane before dispatch (authoring standard §6) → MAJOR if not.

## G5 — Side effects and secrets

Outward writes in QA flows: tracker comment/transition/issue, GitHub comment/PR, environment
deploy, Teams, the public `kb`.

- **Tracker comment:** one per ticket per run, amended, never appended (`.claude/rules/reports.md`
  §0) → MAJOR.
- **Ticket status:** only `qa-lead-orchestrator` transitions, at most two hops per run
  (`.claude/knowledge/execution/ticket-status-transitions.md`). Any other actor transitioning →
  BLOCKER. Every other QA agent says it reports a status change up instead of making it → MINOR if
  silent.
- **Escalation:** a QA agent escalates to `qa-lead-orchestrator` on the triggers in
  `.claude/knowledge/agents/qa/shared-instructions.md` §Escalation Triggers, by citation → MINOR if
  it sets its own.
- **A filed bug** carries its found-by label (`.claude/rules/reports.md` §0b) → MAJOR if missing.
- **UI claims in a tracker comment** carry inline screenshots (`.claude/rules/reports.md` §5) →
  MAJOR if missing.
- **GitHub:** QA agents are read-only there; code fixes and PRs belong to the Developers team
  (`.claude/rules/agents.md` §Developers Team). A QA flow that does write to GitHub (hotfix
  delivery, a deploy-manifest bump) gates every write and never merges → BLOCKER if ungated; a QA
  prompt that fixes product code and opens a PR → BLOCKER.
- **The `kb` is public:** nothing client-specific, credentialed or customer-named goes into a
  capture → BLOCKER.
- **Secrets:** a Playwright `--secrets` key is typed bare, never as `{{VAR}}` (`.claude/rules/agents.md`
  §MCP servers) → BLOCKER; a password literal in committed test data → BLOCKER
  (`.claude/rules/test-data.md`).

## G6 — Single source of truth

- Owners are named in `CLAUDE.md` §Detailed References; a restatement is judged against that owner.
- **No hardcoded test data or environment values:** `.claude/rules/test-data.md` §GOLDEN RULE and
  its four data layers (`{{VAR}}`, `@td()`, `live-discover`, `random-data`). A hardcoded env URL →
  MAJOR; an entity literal with no resolver → MAJOR.
- **Evidence output paths** never sit in a case or a prompt with a sprint or ticket in them
  (`.claude/rules/test-data.md` §THIRD RULE) → MAJOR.
- **Counts are never transcribed** (suites, cases, agents, skills); the script that prints them is
  cited (`CLAUDE.md` §Where the rules live) → MINOR.
- **`.claude/` ↔ `plugins/vc-fix/` `qa-*` copies:** the duplication is deliberate; a *difference*
  is reported and asked about, not judged. Self-diagnostics containment files that are not
  byte-identical → MAJOR (SKILL.md Step 0, item 4).

## G7 — Context economy

- Loaded-whole files are capped by BUDGET-004 (`CLAUDE.md` §Where the rules live; cap from
  §Tooling). Over the cap and not in the baseline → BLOCKER under `.claude/` (the build fails); in
  the baseline → MAJOR, overage is the number to cut. **`plugins/*` is not gated** by the linter —
  over the cap there is MAJOR and must be checked with `wc -c`.
- A baseline entry for a file now under the cap, or renamed away, must be deleted → MINOR.
- **An agent definition is paid on every dispatch**, a skill only when it loads: weigh an agent's
  bytes above a command's, and a mode only some dispatches use belongs in a supporting file the
  agent reads on demand → MINOR.

## G8 — Grounding

The order and the trigger are `CLAUDE.md` §Essential Rules → *Product context*: a step that writes
a claim about platform or storefront behaviour asks the `kb` first, then VirtoOZ (`/vc-docs`), and
only then live or source.

- Product claims a step acts on are sourced (`{DOC}`, `{BL}`, `{OBSERVED}`, `{SPEC}`) or cite a
  knowledge file; unsourced → MAJOR.
- A cited `BL-*`/`ECL-*` id whose title does not match the claim → MINOR in an example, MAJOR in a
  rule.
- Exact UI strings, control types, layout and counts cited as `{DOC}` → MINOR (they are
  `{OBSERVED}`: a doc is authoritative for mechanism, not surface).
- Released vs new decides the source: for a NEW feature, the ticket AC + source + the live build
  are ground truth → MAJOR if a step treats a missing doc page as "no requirement".
- **The `kb` step by class** (authoring standard §5.2–§5.3): classify the unit as Observer,
  Dispatcher, Judge or Mechanic by what it does. An Observer without the numbered read **and** write
  steps, a Judge without the read step, a Dispatcher without the brief line → MAJOR. A Mechanic is
  exempt and says nothing about the base. The `plugins/vc-fix/` copies are exempt from §5 for now
  (authoring standard §7) — do not flag them.

## G10 — Behavioural evidence

Where to measure: `improvement-loop.md` §3 (`skill-creator` for skills, `claude plugin eval` for
plugin skills, replay for commands and agents: dispatch the agent on the failing scenario with the
old and the new definition). For a `vc-fix` plugin `qa-*` skill with self-diagnostics on,
`/vc-self-check` telemetry is run evidence.
