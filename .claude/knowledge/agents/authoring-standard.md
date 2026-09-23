# Authoring standard — agents, skills and commands

**Read this before you create or restructure a component under `.claude/agents/`, `.claude/skills/`
or `.claude/commands/`.** It is the checklist a new component is reviewed against. Every rule here
that already has a home is **cited, not restated**. The one rule this file owns is §5: the
observed-behaviour base.

Scope: the project-scoped `.claude/` surface. The distributed plugins under `plugins/` ship
their own copies and are out of scope for now.

## 1. Pick the component type

| You are building… | It is a… | Lives at |
|---|---|---|
| A workflow somebody starts by typing `/name` | command | `.claude/commands/<name>.md` |
| A methodology or reference Claude pulls in, optionally doing work | skill | `.claude/skills/<name>/SKILL.md` + supporting files |
| A specialist another component delegates multi-step work to | agent | `.claude/agents/<name>.md` |
| A fact, contract or table several components read | knowledge file | `.claude/knowledge/<folder>/` ([README](../README.md) §Folders) |

The mental model, in more detail: [`docs/using-commands-and-skills.md`](../../../docs/using-commands-and-skills.md).
**Decide the component's tier first:** [`../../architecture/TIER.md`](../../architecture/TIER.md) §How to use this file.

## 2. Placement and frontmatter

- **Discovery is flat and one level deep.** Agents go in `.claude/agents/*.md`, with no team
  subfolders. Skills go in `.claude/skills/<name>/`, with no category folders
  ([`README.md`](README.md) §Customizing Agents,
  [`../../skills/README.md`](../../skills/README.md)).
- **Agent frontmatter:** `name`, `description`, `model`, `color`, `applicability` +
  `applicability_rationale`. Use an existing agent as the shape.
- **Skill and command frontmatter:** [`../../skills/README.md`](../../skills/README.md)
  §Frontmatter Reference. The `[Category]` tag goes in `description`.
- **Team framework:** an agent's first lines point at its team's `shared-instructions.md`
  (`qa/`, `ba/` or `developers/`) instead of copying from it.

## 3. Size, tiers and the "cite, don't restate" rule

- A command, an agent and a `SKILL.md` are each **loaded whole** when they are reached. An agent is
  re-paid on every dispatch. Each has a **19,000-char body budget (BUDGET-004)**.
- **A new file is born under budget.** A file already in
  [`.prompt-size-baseline.json`](../../../scripts/maintenance/.prompt-size-baseline.json) may only
  shrink. Adding a line to it means cutting at least as many bytes in the same change.
- Detail goes into a supporting file that the step reads only when it needs it
  ([`CLAUDE.md`](../../../CLAUDE.md) §Where the rules live).
- **Never transcribe a count, a roster or a constant.** Run the script that prints it
  ([`../../rules/test-data.md`](../../rules/test-data.md) GOLDEN RULE).
- Enforced by `npm run context:check`.

## 4. Mandatory content — cite each rule the component touches

| If the component… | It must carry (as a citation) |
|---|---|
| relies on how the platform is **supposed** to behave | VirtoOZ first: [`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context* |
| relies on what the platform **does** | the observed-behaviour step, **§5 below** |
| drives a browser | the real-user rule, the browser lane and the `--secrets` rule ([`../../rules/agents.md`](../../rules/agents.md)) |
| produces evidence or reports | [`../../skills/qa-evidence/evidence-capture-policy.md`](../../skills/qa-evidence/evidence-capture-policy.md), [`../../rules/reports.md`](../../rules/reports.md) |
| authors test cases or data | [`../../rules/test-data.md`](../../rules/test-data.md) (all four rules) |
| ships code | [`../execution/when-to-write-a-test.md`](../execution/when-to-write-a-test.md) |
| dispatches a subagent | [`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md), including its observed-behaviour line |

## 5. The observed-behaviour base (`kb`) — REQUIRED

The base holds what the platform was **observed** to do on a named deployment, each claim with a
trust count. The rule for when to use it is [`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules →
*Product context*. This section covers the **authoring** half: the rule reaches an agent only if
the agent's own procedure carries it.

### 5.1 Why this is a structural requirement, not a sentence

Three measurements drive every requirement below:

- **A disposition does not fire.** When the base was pre-loaded with every tool schema, agents still
  asked it nothing. Asking requires two things at once: the agent must suspect it does not know,
  and it must phrase the question in the base's vocabulary
  ([`../../hooks/kb-harvest.mjs`](../../hooks/kb-harvest.mjs), header).
- **A preamble that no step owns is skipped during prescribed execution.** In smoke run
  `SMOKE-2026-09-22-1745` (suite 042), the dispatched storefront agent made **0** base calls across
  395 tool uses, 34 cases and 3 live orders. Its definition did carry the rule, in a preamble. The
  brief did not carry it. The base already held a corroborated entry that the run re-derived by hand,
  and the run's two new observations were never captured.
- **A step does fire.** The re-run on 2026-09-23 (`SMOKE-2026-09-23-0733`) carried the brief line and
  the ASK / BANK steps: 12 base calls, 4 captures, 3 confirmations, entry ids in the results file.
  All 4 reads missed. One cause was a retrieval rule rather than a prompt: a one-segment route such
  as `/cart` was not accepted as a coordinate.

### 5.2 Who must carry it — classify by what the component DOES

| Class | Does | Must carry |
|---|---|---|
| **Observer** | checks the platform live: browser, REST, GraphQL, Admin SPA, a seed or teardown against the Platform API, a crawl | **read** step + **write** step (§5.3) |
| **Dispatcher** | sends an observer or a judge out | the brief line from [`agent-dispatch.md`](../../templates/agent-dispatch.md). Never pack an answer: the recipient asks for itself ([`../../skills/qa-test/dispatch-pack.md`](../../skills/qa-test/dispatch-pack.md)) |
| **Judge** | asserts or classifies platform behaviour without observing it: authors cases or AC, writes behaviour docs, triages a failure, classifies a signal, reproduces a bug in code | **read** step, before the assertion. The write step applies only to what it observed on a deployment |
| **Mechanic** | release, hotfix, bundle or deploy plumbing, code-diff review, dashboards, report rendering | nothing — **exempt**, and it says nothing about the base |

A component that belongs to two classes carries the union. When unsure between Judge and
Mechanic, ask one question: *does its output state how the platform behaves?* If yes, it is a Judge.

### 5.3 The shape — a numbered STEP, never a preamble

1. **Put it in the procedure.** The read step goes in the component's pre-flight or setup phase. The
   write step goes in its close-out phase. A blockquote at the top of the file does not count.
2. **Derive the coordinates from the input** rather than hoping the agent suspects a gap. Take the
   page paths, GraphQL operation names and endpoints in the suite CSV, the ticket or the diff, and
   ask **one question per coordinate**. This removes both hurdles from §5.1.
3. **Word the trigger so it fires during prescribed execution**: "for each coordinate this run
   touches". "Before you work out how X behaves" never fires while an agent follows a script.
   **Scripted execution is the exception to per-coordinate asking.** When a suite CSV already gives
   the steps and the expected result, the script answers the question the base would, so a question
   per case costs a call per case and mostly returns misses that teach the agent the base is empty.
   There the read fires on **deviation**: a FAIL, a BLOCKED step, an unexpected result, an incidental
   observation — and immediately before every capture, so nothing is recorded twice.
4. **Name the CLI door first:** `npm run kb -- ask "<coordinate> <question>"`. It needs no
   `ToolSearch` hop and no MCP server. The MCP form is `mcp__kb__kb_ask`; the `kb` tools are deferred,
   so they are loaded with `ToolSearch` → `select:mcp__kb__kb_ask,mcp__kb__kb_capture,mcp__kb__kb_confirm,mcp__kb__kb_dispute`.
5. **The write step covers every platform-behaviour statement the output makes.** A test verdict
   alone does not count. For each statement:
   - it matched an entry → `confirm`;
   - it contradicted an entry → `dispute`;
   - the base held nothing → `capture`, with `--deployment <env>`.
   
   Never capture a second copy of something the base already holds.
6. **Record the entry ids** that were read, confirmed, disputed or captured in the component's own
   output. That record is how a verifier or orchestrator can see the step ran.
7. **The base is public.** Nothing client-specific, credentialed or customer-named goes into a
   question or a claim.
8. **Cite, never restate.** The step is one or two lines pointing at *Product context*. In a file
   at its BUDGET-004 baseline, the bytes come out of the same file (§3).

### 5.4 Canonical wording — copy it, adapt only the nouns

Read step — unscripted work (a ticket, an investigation, an exploratory charter), in pre-flight:

```
N. **Ask the base for this run's coordinates** — for each page path / GraphQL operation / endpoint in
   scope: `npm run kb -- ask "<coordinate> <question>"` (MCP: `mcp__kb__kb_ask`). Record hit ids; a
   miss is not a blocker. Rule: `CLAUDE.md` §Essential Rules → *Product context*.
```

Read step — scripted suite execution, inside the per-case loop:

```
N. **On a deviation, ask before you classify it** — a FAIL, BLOCKED, unexpected result or incidental
   observation: `npm run kb -- ask "<coordinate> <what you saw>"` (MCP: `mcp__kb__kb_ask`). A hit
   that records this as known behaviour is cited in the result; a miss is not a blocker and does not
   stop the next deviation being asked. Rule: `CLAUDE.md` §Essential Rules → *Product context*.
```

Write step (close-out):

```
N. **Bank what the run established** — for each platform behaviour your output states: matched ⇒
   `kb confirm <id>`, contradicted ⇒ `kb dispute <id>`, base held nothing ⇒ `kb capture`
   (`--deployment {TEST_ENV}`). Public base — nothing client-specific. List the ids in your output.
```

The dispatch-brief line lives in [`agent-dispatch.md`](../../templates/agent-dispatch.md)
§Agent Prompt Structure. Reference it; do not rewrite it per command.

## 6. Review checklist — a new or restructured component

- [ ] Type (§1) and tier (`TIER.md`) decided. Placement is flat. Frontmatter is complete.
- [ ] Under 19,000 chars, or shrunk against its baseline. `npm run context:check` is green.
- [ ] Every rule in the §4 table that the component touches is **cited**, none restated.
- [ ] Classified per §5.2. Observers and Judges have the **numbered** read step, and observers
      also have the write step. Dispatchers use the template's brief line.
- [ ] No count, roster, hardcoded value or output path is transcribed.
- [ ] If it dispatches: the recipient's tool permissions and browser lane are checked before
      dispatch ([`../../rules/agents.md`](../../rules/agents.md) §Agent Delegation).

## 7. Compliance debt — §5 not yet carried (shrink-only)

§5 was introduced on 2026-09-23. The first wave added it wherever a file had budget headroom:
- the `agent-dispatch.md` brief line;
- the `qa-smoke` track briefs;
- `qa-frontend-expert` and `qa-backend-expert` (preamble converted into ASK / BANK steps);
- `test-data-engineer`, `fullstack-backend`, `fullstack-frontend`;
- the `qa-investigate`, `qa-sbtm` and `qa-postman` skills and the `qa-triage-results` command;
- the trigger in the three `shared-instructions.md`.

**The rows below still do not comply.** Delete a row in the change that fixes it. Never add a row
for a new component: a new component is born compliant (§6).

**Wave 2 — Observers and Dispatchers at their BUDGET-004 baseline.** Each needs a byte trade in the
same file (§3), so the cut is proposed and reviewed before the edit.

| File | Class | Where the step goes |
|---|---|---|
| `.claude/agents/test-runner-agent.md` | Observer | Phase 1 read step, Phase 5 write step. Highest leverage: every regression and smoke track runs this protocol |
| `.claude/agents/qa-testing-expert.md` | Observer | EXECUTE (read), close-out (write) |
| `.claude/agents/ba-system-analyzer.md` | Observer | live-exploration step (read), report step (write) |
| `.claude/agents/ui-ux-expert.md` | Observer | EXECUTE (read), close-out (write) |
| `.claude/agents/ba-api-specialist.md` | Observer | read step present; add the write step |
| `.claude/agents/regression-orchestrator.md` | Dispatcher | the runner brief (reuse the template line) |
| `.claude/commands/qa-regression.md` | Dispatcher | the runner brief |
| `.claude/agents/qa-lead-orchestrator.md` | Dispatcher + Judge | specialist briefs; Verifier Mode read step |
| `.claude/commands/qa-exploratory.md` | Dispatcher + Observer | session brief; debrief write step |

**Wave 2b — Judges and Dispatchers at baseline, lower leverage.**
`ba-doc-writer`, `ba-story-writer`, `test-management-specialist` (read step before asserting
behaviour); the `ba-analyze`, `qa-test-lifecycle`, `qa-design` and `qa-test-plan` commands (their
inline briefs).

**Headroom exists, not yet done** (Observers): the `qa-seed-data` command, the `qa-generate-data`
and `qa-perf-measure` skills. `qa-seed-data/SKILL.md` is at baseline.

**Wave 3 — enforcement, not prose.** A `SubagentStop` hook reads the subagent transcript. When it
finds at least N live-observation calls (browser, GraphQL, REST) and zero `kb` calls, it blocks
completion **once** with a reason. The precedent is `hooks/enforce-real-user.mjs`, and the cost
argument is in the `kb-harvest.mjs` header: this hook blocks only when the step was skipped, never
on every turn. It is code, so it ships with a unit test on the detection logic. Undecided — it
needs its own go-ahead.

**Classified, deliberately not changed.** `qa-sitemap` is a Mechanic: `knowledge/domain/sitemap.md`
is the store for what it crawls. The `plugins/vc-fix/` agents and skills are out of scope for now,
because that plugin is a separate distribution.
