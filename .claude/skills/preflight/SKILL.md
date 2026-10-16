---
name: preflight
description: "Environment and build pre-flight before work against a stand: env health, deployed build, MCP availability, one output form. Use at the start of /qa-test, /qa-test-fast, /qa-exploratory, /qa-test-lifecycle, /qa-domain-map, /ba-analyze, /qa-regression, /qa-smoke. Not for the /qa-test axes 2b–2g, ticket fetching or routing, or per-case [PRE:*] tags."
argument-hint: "<ticket|ticket-fast|exploratory|lifecycle|domain-map|ba> [--ticket KEY] [--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront] [--ci]  |  <regression|smoke> <selection: name or ids> [--run-id <RUN_ID>] [--preflight-out <run-folder>/preflight.json] [--accept drift:<id>,…] [--ci]"
---

# /preflight — is this stand fit for the work, and what does it run?

The facts and the policy are **code**; this skill is only what code cannot do. Design and
rationale: [`docs/superpowers/specs/2026-10-08-preflight-skill-design.md`](../../../docs/superpowers/specs/2026-10-08-preflight-skill-design.md).
**Pre-flight is read-only.** It never fixes anything on its own — remediation (step 5) is a separate
step the user chooses.

## Step 1 — run the CLI for your scope

```bash
npm run preflight -- --for <for> [--ticket KEY] [--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront] --json
```

- `--components` — the ticket's components (ledger names, `vc-module-*` repos or `VirtoCommerce.*` ids).
- `--expect` — the PR artifact under test (`/qa-test`: the linked PR's module + version). A storefront (`vc-frontend`) PR is `--expect vc-frontend@<version from the theme zip name>`: it is checked against the live storefront bundle (`facts.deployedTheme`), not the modules API.
- `--storefront` — the scope touches the storefront (adds the anonymous `InitializeApplication` probe).
- `--ci` — this skill's own flag (the caller is non-interactive, step 4); never pass it to the CLI, which rejects an unknown flag with exit `1`.
- Exit `0` READY (warnings allowed) · `2` NOT READY · `1` usage error — fix the flags · `3` the script could not run: report its message and STOP, never improvise the facts by hand.
- The verdict counts BLOCKs only: `UNKNOWN` rows are listed and counted but do not by themselves make a run NOT READY. The exception is `ticket` / `ticket-fast`: an `--expect` whose deployed state is `UNKNOWN` is a BLOCK.

Keep the JSON; the consumer stores it as the `preflight` block of its `summary.json` or report header. Step 4 re-runs the CLI without `--json` for display (the CLI prints one or the other, never both); if its verdict or rows differ from this run's (a deploy landed), run this step again and store that JSON.

**Build-scoped (`regression`, `smoke`)** runs the regression planner instead:

    npm run regression:plan -- <selection> --preflight --json [--run-id <RUN_ID>] [--preflight-out reports/regression/<RUN_ID>/preflight.json] [--accept drift:<id>,…]

Its JSON carries the pre-flight under `preflight` (same `checks[]`, `verdict`, `facts`) plus the plan.
Exit `2` NOT READY · `1` the selection itself cannot run (unknown id, missing CSV, no executor) · `3`
could not run (also `1`: an `--accept` id that is not `drift:*`). `--run-id` makes that run's own `test-run-status.json` no lock. `3` — report its message and STOP, as for the change-scoped CLI. Gated suites (`preflight.gating.gated`) are already **out** of the plan: report each as
`NOT_DEPLOYED` (BLOCKED-on-deploy), never FAIL. Suites in `preflight.secrets.gated` are out too: every case
types a password nobody has — report them BLOCKED (`SECRET_UNDECLARED`), never FAIL. A `secret:*` WARN names
the cases of suites that still run: they are BLOCKED without a sign-in attempt (typing an unregistered name
sends the literal string and can lock a shared account). For step 4, run the same command without `--json`.

**What the selected cases need from the stand** (build-scoped only, `scripts/regression/requirements.ts`) comes in the
same `checks[]`, read-only:
- `persona:<ALIAS>` / `lane-account:slot<N>` — derived from the CSVs' `[PRE:SIGNIN_AS|SWITCH_ORG|VERIFY_AUTH]` and from
  `agent-user-pool.csv`: credentials resolvable, account exists, not locked out, password not expired — through the
  admin API, **never by signing in**. A persona listed under `personas` in `config/suite-requirements.json` (e.g.
  `SR_*` → `VirtoCommerce.SalesRep`) is checked for its module first: absent, the row says the cases cannot run on
  this stand, rather than sending someone to seed an account the platform cannot hold.
- `fixture:<ALIAS>` — every `@td()` the cases use, through the runners' resolver; `unseeded` names the seed to run.
- `req:<kind>:<name>` — what `config/suite-requirements.json` declares: store and platform settings, payment
  methods, vc-deploy-dev `infra/environments.yml` keys (headers, FileUpload scopes, KnownAssetHosts), and the values a
  platform setting's dictionary must offer (`allowedIncludes` — a seeder that writes `Quotes.Status = Declined` fails
  when the stand's dictionary has no `Declined`).

Each row names its cases. They are WARN unless a requirement says `"level": "block"` — the run goes, and the owner
knows which cases will BLOCK and why before spending a run on them. **Those cases are then not run:** the JSON's
`skip` map (suite → case → the most upstream row's reason) is read by `suites:lanes` from the run folder's
`preflight.json`, which plans them in the `preflight` lane; `suites:merge` records them BLOCKED with that reason, and
triage receives them as `preClassified`, not as classifier input. A `skip` row states the count. `regression:plan
--run-blocked` runs them anyway. A triage verdict `ENV_CONFIG` that no `req:` row
predicted is a missing entry in `config/suite-requirements.json`: add it with the cases it hit.

## Step 2 — MCP level 3: what is callable in THIS session

The CLI sees `.mcp.json` only (levels 1–2; it also matches a server's `mcpKeys` aliases). For every server the consumer marks `REQ` or
`REQ_FALLBACK` in [`mcp-requirements.json`](mcp-requirements.json) — and every `OPT` server, whatever its
`when` says (some conditions, like `/qa-test`'s `visual_surface`, are derived only after this skill returns; the consumer applies `when` to the recorded row) — run `ToolSearch` with the server's `toolSearch` query, then
**one cheap read** through a returned tool: a call that lists or describes and starts nothing. For a browser lane
(`"lane": true`) the ToolSearch hit is the evidence — any browser read launches a session another agent will need. Record per server
`{server, level: CONNECTED | ABSENT, via: "mcp" | "fallback:<name>"}`.

- Absent `REQ` ⇒ BLOCK. `virtooz` is `REQ` for `domain-map` / `ba`: BLOCK only when **both** VirtoOZ
  and Context7 are absent — these commands exist to ground in the published guides. Context7 is in no consumer's requirement
  list, so the CLI never reports it — probe it yourself.
- Absent `REQ_FALLBACK` ⇒ WARN naming the fallback, and the run uses it.
- Absent `OPT` ⇒ that lane is `SKIPPED` in the run's record — never PASS.
- Never edit `.mcp.json` and never restart a server: for a missing or broken one, say in one line what to add and that a restart is required (`docs/superpowers/specs/2026-10-08-preflight-skill-design.md` §7).
- A server that needs OAuth: Claude cannot start the flow — the user authorises it in `/mcp` or the claude.ai connector settings.

## Step 3 — ask the knowledge base, then the docs

**This step asks the knowledge base before anything else claims how the platform behaves.** The tool
is **`mcp__kb__kb_ask`** — it is deferred, so load it first:
`ToolSearch select:mcp__kb__kb_ask,mcp__kb__kb_show,mcp__kb__kb_none`. Put the coordinate in the
question — the page path, the GraphQL operation, the endpoint the scope names. Not connected ⇒
`npm run kb -- ask "<coordinate> <question>"`. Close every returned list by `kb_show` or `kb_none`.
A miss (exit 1: nobody has written it down) never blocks; what this run establishes is a later `kb_capture`
([`../../../CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*). Exit 3 means the base was NOT read: record it as degraded grounding, not as a miss.

Then VirtoOZ through `/vc-docs` for what the platform is MEANT to do; Context7
(`/virtocommerce/vc-docs`) only as its fallback. Record the kb hit ids and the doc tools used.
Never Context7 first: VirtoOZ is the primary docs source and Context7 only its fallback (same `CLAUDE.md` §).

## Step 4 — show the result, in the one form

Run the CLI once more without `--json` and print its output **verbatim** — the CLI renders it from
`checks[]`; you do not compose it — then append — in the same columns — only the rows the CLI cannot see: step 2's
level-3 MCP rows and step 3's misses. Do not reword a row, do not re-grade it, and never show an
`UNKNOWN` as OK. Form and rules: `docs/superpowers/specs/2026-10-08-preflight-skill-design.md` §8a.

- `READY` with no rows ⇒ one line, proceed.
- `READY` with warnings ⇒ name each in one line. If any has a fix you can make (list 1 of step 5), ask step 5's one question first; otherwise proceed. A WARN never asks anything else.
- `READY` with `UNKNOWN` rows only (no BLOCK, no WARN) ⇒ list each `UNKNOWN` row with its `Who`/`Do`, never as OK, and do not ask.
- `NOT READY` ⇒ go to step 5. **At most one question, and only for a BLOCK.**
- A level-3 BLOCK from step 2 alone also makes the run `NOT READY` and routes to step 5; the verdict returned in step 6 is the combined one (CLI verdict, downgraded by any level-3 BLOCK).
- A non-interactive caller (`--ci` passed to this skill, or this skill running inside a subagent) asks no question: it returns `NOT READY` with the rows to its caller (step 6) and performs no remediation.

## Step 5 — remediation: diagnose → fix → re-check

**Do as much as you can yourself; ask once before you do it.** After every pre-flight with rows to act on, show two
lists in the user's language, grouped (one line per fix, not per row — fixtures by the seed that writes them, settings
by store), each with the cases it unblocks:

1. **I will do** (`me`, `me, with OK`) — seeding, store and platform settings, account provisioning or reset, and every
   `req:deployConfig` / `req:uploadScope` row as **one** vc-deploy-dev PR: `npm run deploy:env-config -- --env <env>`
   (dry run shows the exact lines and the reference env each value comes from; `--apply` opens the PR).
2. **Needs you** (`you`) — only what you may not do: a secret or a credential (a password, an API key such as Google
   Maps, a payment-provider sandbox), merging the vc-deploy-dev PR (merging deploys the env), and a product decision.
   Say exactly where the value goes and where it comes from.

One question covers list 1 ("Do all of list 1?" — or name the items to skip). On a yes, do them all, re-run step 1, and
report what changed; list 2 stays with the user. Never ask per item.

The `Who` column decides which list a row goes to:

| `Who` | You may |
|---|---|
| `me` | do it now: read-only, or local and reversible |
| `me, with OK` | do it only after the user says yes: shared env, outward-facing, tracked file |
| `you` | hand over paste-ready text: which variable, which file, where the value comes from |

Never type, substitute or switch a password or token; on a failed credential, hand over the text.
Then ask the one question: **fix what you can · find the cause first · proceed as is · stop.** "Fix what you can" covers `me` rows; when there are `me, with OK` rows, that option names them (e.g. "fix what you can, including `ledger` — runs `releases:refresh` and commits"), and choosing it is the explicit yes for exactly those rows. Never a second question.

- Build-scoped: "proceed as is" on `drift:*` BLOCK rows means the consumer re-runs the plan with `--accept <those drift ids>`, which turns exactly those rows into WARN `(accepted)`; no other row can be accepted.
- No answer, or no option chosen, is **stop**: nothing is fixed or diagnosed, and step 6 returns `NOT READY` with `remediations: []`.
- "Find the cause" runs the row's `diagnose[]` recipe (read-only) and reports the cause.
- After any fix, **re-run the whole step 1**, not the one check — a fix can move another fact.
- At most **two** rounds; then hand over with what was tried.
- Record every action in `remediations[]`: `{check, found, diagnosis, action, actor, approvedBy, result}`.

## Step 6 — return one block to the consumer

Step 1's JSON with every top-level key the CLI printed (consumers read `sprint` and `facts` from it), plus
step 2's level-3 rows under `mcp`, `verdict` combined per step 4, and `kbHits`, `docs`, `remediations`. What a fact
**means** for the consumer (a `breaking:*` or `not-deployed:*` row, for instance) is the consumer's own
rule, stated in the consumer — not here. One id is defined here because it is easy to misread:
`unknown-deployed:*` = the ledger released it but no live source reports the deployed version
(the storefront theme only when its entry bundle gave no version; Platform only when the Admin page gave none). It is **not** `not-deployed:*` — confirm the version, never assume either way.

## Not this skill

The `/qa-test` axes 2b–2g and its 2-map read · ticket fetch, classification and routing · the
per-case `[PRE:*]` tags ([`test-execution-preflight.md`](../../knowledge/execution/test-execution-preflight.md)).
