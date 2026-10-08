# /kb-judge — the investigation protocol

Read by `/kb-judge` Step 4. A dispute is settled by a **fresh, full investigation**, never from the
papers: the dossier says what each side claimed, not what is true. Both sides were agents on a live
stand, so the most common reason they disagree is that they did not look at the same thing — a
different build, a different setting, a different role, an entity whose state an earlier run had
already changed. The investigation exists to find that difference, or to prove there is none.

## 1. Break the entry into clauses

Before anything is checked, write each entry of the cluster as a list of **atomic clauses** — one
observable statement each ("inviteUser creates a security account immediately", "that account holds
the role chosen in the dialog", "the roster shows 'Invite sent'"). Then mark, per evidence item,
which clause it supports, contradicts, or does not touch. Most disputes contradict ONE clause of an
entry whose other clauses still hold; a verdict on the whole entry is then wrong in both directions.

## 2. Establish the conditions of every stand involved

For every stand named in the evidence, plus at least one stand nobody used yet, record the
conditions the clause could depend on — as `key=value` pairs, the shape `--conditions` takes
(contract: `.claude/knowledge/execution/kb-capture-contract.md` §Conditions):

| Key | Where it comes from |
|---|---|
| `platform`, `module:<Id>` | **deployed**, never declared: `GET {{BACK_URL}}/api/platform/modules` — `.claude/templates/agent-dispatch.md` §Build Verification. If the probe fails the value is `UNKNOWN`, never the git-declared one |
| `theme` | the storefront bundle the stand serves (same section, `theme/artifact.json` is only the declared value) |
| `setting:<Name>` | store and platform settings the clause touches — `npm run store:caps -- --settings` for what the storefront sees; `.claude/knowledge/domain/store-settings.md` |
| `store`, `role`, `org` | which store, which role, which kind of organization the observation was made with (never a name or an email — the base is public) |
| `state:<what>` | the entity's own prior history when it matters (`state:invite=fresh` vs `state:invite=after-block-unblock`) |

**Old evidence carries no conditions** (measured 2026-10-08: 12% of items carry a structured build,
none carry settings). Its notes often name a build in prose — the dossier's *builds in note* column
lists them — but a setting is almost never recorded. So the investigation re-establishes conditions
by **reproducing on the stands the evidence names**, now, and treats a stand whose build has moved
since the dispute as a different condition, not the same stand.

## 3. Re-observe every disputed clause — five sources

For each disputed clause, all five. A source that cannot be reached is recorded as such; it is
never substituted by inference.

| Source | Who | What it answers |
|---|---|---|
| Live storefront | `qa-frontend-expert`, `playwright-chrome` | what a buyer sees and which GraphQL operation the page sends |
| Live Admin SPA + REST | `qa-backend-expert`, `playwright-edge` (or Chrome DevTools MCP) | what the back office shows and stores; the REST payload, not only the screen |
| Docs | `/vc-docs` (VirtoOZ) | the documented MECHANISM. A doc never decides a UI string, a count or a layout — those are observed (`.claude/knowledge/agents/qa/shared-instructions.md` §What VirtoOZ is authoritative FOR) |
| Source code | GitHub, at the **deployed** version of each stand, not `main` | the mechanism, and — through the history of the file — WHEN it changed and in which PR. A behaviour change between two stands' builds is proven here |
| The base | `mcp__kb__kb_ask` on the clause's coordinates | other entries at the same coordinates — a sibling that already states the other half, or an entry this one duplicates |

Rules for the live part:

- **A fresh fixture for each reproduction.** Never re-use the entity an earlier observation was made
  on: its state may be the very difference (KB-972CF223 — the member re-observed on 2026-09-15 had
  been through Block and Unblock in between). Create it through the mechanism under test, in the case,
  and remove it after (`.claude/rules/test-data.md` FIFTH RULE; `AGENT-TEST-` prefix).
- **Vary one condition at a time** when the clause differs between stands: same build with the
  setting flipped, or same setting on the other build. That is what turns "differs between stands"
  into a named condition an entry can be scoped by.
- **Specialists report; they do not write to the base.** Their brief tells them to ask the base
  read-only and to return every observation with its conditions. The judge then records what was
  seen of a **disputed** entry with `npm run kb:disputes -- observe` on the judge's branch, so the
  observation and the decision it supports are reviewed in one PR — through the normal door a confirm
  would land on the OLD body before the PR corrects it (pilot 2026-10-08). An observation of any
  OTHER entry goes through the normal door with `conditions`.
- **When the operator holds publication**, every kb command of the run — the judge's and each
  specialist's — goes through the **CLI** with `KB_QUEUE_DIR=<a run-private dir>` and
  `KB_PUSH_CONFIRM=1` (`npm run kb -- ask "<q>"`, not `mcp__kb__kb_ask`), and the specialists' briefs say
  so. The MCP server's env is fixed when the session starts, so an MCP call writes to the shared queue,
  which the MCP server and the `Stop` hook flush with their own env.
- **A stand that cannot be written to is a gap, not a workaround.** If a write the experiment needs is
  refused (permissions, a store setting that blocks the flow), record what was observed read-only and
  name the missing write for the operator.
- Browser lanes and the three-concurrent cap: `.claude/rules/agents.md`. A dispatch brief follows
  `.claude/templates/agent-dispatch.md` §Agent Prompt Structure, including its *Observed behaviour*
  line, and names the clause, the stands, the conditions to record and the fixture to create.
- Evidence (screenshots, HAR) stays in the specialist's message; the PR quotes what was seen, not files
  (`.claude/rules/reports.md` §1). Nothing client-specific, credentialed or customer-named — the base
  and its PRs are public.

## 4. From what was found to a verdict

Per dispute (per contradicting evidence item), one of:

| Found | Verdict | What changes in the entry |
|---|---|---|
| The clause is wrong on every stand and build checked, and the source shows why | `claim-amended` | the clause is corrected in the body; the subject too if it states the clause |
| Each side is right on its own build; the source history shows the change | `version-scoped` | the body names the build range on each side (`from x-cart 3.1037.0` …) |
| Each side is right under its own setting / role / store / entity state | `conditions-scoped` | the body names the condition; a closed-vocabulary axis goes in `appliesTo` |
| The entry holds two facts and the dispute is about the other one | `split` | split the entry (below); the dispute is resolved on the child it does not concern |
| The entry holds on the conditions the dispute named; the dispute misread its observation | `dispute-wrong` | nothing in the claim; the resolution says what the dispute misread |
| Not established — a source unreachable, or the reproduction inconclusive | **no verdict** | the dispute stays OPEN; the PR says what is missing |

**A split made by the schema-2 migration copied every evidence item of the parent to every child**,
disputes included (`splitFrom` on the item). Such a dispute is often about the sibling: resolve it on
the child it does not concern as `split`, naming the sibling in `--why`, and judge it on the child it
does concern.

To split an entry: write a `split` plan and apply it with `npm run kb:migrate-schema2 -- --stamp …`
then `--apply` on the base checkout (its header has the plan shape). Each child then carries the
parent's whole evidence; resolve each dispute on each child as above. Split **before** recording the
investigation's `observe` items, and record each on the child it concerns — an item written on the
parent first is copied to every child.
