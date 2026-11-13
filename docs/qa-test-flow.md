# `/qa-test` — Test Flow

One ticket, one strategy-driven path, six stages. The approved test strategy
(`/vc-test:qa-test-strategy`) decides which steps run; every step either runs or is recorded as
`SKIP — <reason>`. Canonical spec: [`.claude/commands/qa-test.md`](../.claude/commands/qa-test.md); method:
[`.claude/skills/qa-test/`](../.claude/skills/qa-test/SKILL.md); job routing:
[`.claude/knowledge/execution/ticket-routing.md`](../.claude/knowledge/execution/ticket-routing.md) §4.

```
/qa-test <TICKET> [<env>] [--yes] [--dry-run]
 0 ROUTE     ticket-routing.md FLOW → job · preflight · prior runs · round count (≤3) · vc-test version check
 1 CONTEXT   /vc-test:ticket-context → bundle   ‖  /qa-domain-map when ABSENT — both joined before step 2
 2 STRATEGY  /vc-test:qa-test-strategy → test-strategy.md → gate → [strategy-verifier if Critical] → ONE approval
             ── --dry-run stops here
 3 PREPARE   only the rows marked RUN: contract refresh · test model · mind map · staleness check of
             cases at risk → checklist (every item names its R-n)
 4 EXECUTE   ≤3 browser lanes: checklist runners ‖ exploratory (first or alongside, D3) ‖ visual ‖ regression
             of the selected, non-stale cases
 5 CLOSE     reconcile → triage → investigate → qa-bug → verdict → summary.json + verdict.md
             → qa-report (page + ONE comment, after a yes) → status (confirmed) → docs → kb → candidate cases
```

## What runs when

| Brick | Runs when |
|---|---|
| Job routing (`verify-fix` / `hotfix-check` / `test`) | always; a non-`test` job STOPs and names the command |
| Env, build, MCP, duplicate run (`/preflight`) | always |
| Ticket, materials, PRs, deployment, known ground (`/vc-test:ticket-context`) | always |
| Domain map (`/qa-domain-map`) | the map is `ABSENT`/`unresolved` |
| Strategy, floors, gate, approval, Critical-risk verifier (`/vc-test:qa-test-strategy`) | always |
| Contract refresh | strategy row `Contract refresh: RUN` |
| Test model (`/qa-test-model --strategy`) | strategy row `Test model: RUN` |
| Mind map (`/qa-test-mind-map`, update, no stamps) | strategy row `Mind map: RUN` |
| Checklist (`/qa-checklist --from-strategy`) | always |
| Checklist runners (`qa-frontend-expert` chrome · `qa-backend-expert` edge) | always, one per lane section |
| Exploratory (`/qa-exploratory ticket` → `qa-testing-expert` firefox) | strategy row `Exploratory: RUN` |
| Visual lane (`vc-test:ui-ux-expert` + Skill `vc-test:qa-design`) | strategy row `Visual lane: RUN` |
| Staleness check + regression of cases at risk (`tc:scope` / `regression:select` + `/qa-regression <ids>`) | strategy row `Coverage triage + regression: RUN`; stale cases go to `/qa-test-lifecycle`, never into the run |
| Reconcile plan vs fact (`reconcile.md`) | always |
| Triage (Skill `vc-test:qa-triage-results ticket --verify`) | always |
| Investigation (`vc-fix:qa-investigate`) | each Medium+ real-bug candidate |
| Bug filing (`/vc-fix:qa-bug --evidence <package>`) | each confirmed bug; a separate ticket only on a yes to the one list question |
| Verdict rules (`close-out.md`) | always |
| Page + the one tracker comment (`/vc-fix:qa-report`) | always; the post only after a yes |
| Status transition (`reporting.md` §5-status) | always asked; never past `TESTED` |
| Documentation (`/qa-docs`) | ticket ends in Tested or Done |
| Domain-map write-back (`reporting.md` §5-docs-map) | a map exists and the run established something; non-blocking |
| kb confirm / dispute / capture | each platform behaviour the verdict states |
| Candidate and stale cases → `/qa-test-lifecycle` (ONE question) | either list non-empty |

**Deliverables:** `{RUN_DIR}/test-strategy.md` (the round, approved and reconciled) · `testing-checklist.md`
with results · `summary.json` (`npm run summary:validate`) · `verdict.md` (≤60 lines, verdict first) · the
HTML page and the one tracker comment · bug tickets only through `/vc-fix:qa-bug` · `candidate_cases` and
`stale_cases` · the run cost (`plugins/vc-test/lib/run-cost.mjs`). No suite CSV and no seeder are written.
