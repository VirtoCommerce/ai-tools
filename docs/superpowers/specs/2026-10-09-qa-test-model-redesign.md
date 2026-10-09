# `/qa-test-model` after the test-strategy step — design

> **Status: for review.** §3–§5 record the phase-A decisions taken in the 2026-10-09 brainstorm; nothing is built yet. Work is tracked in VCST-6250.
> This spec depends on the `/qa-test` redesign (#417, D1–D12) and its prototype (#416, VCST-6249). Phase A
> starts only after the strategy step lands.

## 1. Problem

The strategy step (`qa-test-strategy`, #416) now chooses the risks, the technique and oracle for each risk, the
lanes and the artifacts. It also caps a ticket at three rounds. The per-ticket test model
(`/qa-test-model` → `reports/ba/test-models/<TICKET>-<date>.md`) was designed before that step existed. Measured
against #416, it has these problems:

1. **The risks are stated twice.** The strategy's risk register (L×I) and the model's defect hypotheses and
   "risk areas" (gate clause 1) both answer *how can this break*. Nothing reconciles the two.
2. **Technique and oracle are stated twice.** The strategy sets them per risk and the model sets them per
   scenario, and neither is checked against the other.
3. **The model's main in-run consumer is gone.** By D2 no cases are authored in the run. Inside a run, the model
   now feeds only `/qa-checklist --from-model` and `/qa-exploratory ticket`.
4. **Rounds are handled twice.** The model keeps its own `## Round N` and the "amend, never fork" rule; the
   strategy has D6/D7.
5. **A dangling clause.** Gate clause 10 says the sweep rows are "filled in Step 2", and the prototype has no
   Step 2.
6. **The cost is paid on most runs.** F1 (a High/Critical risk, or P0/P1) and every exploratory run force a full
   model with the 13-clause gate. The 27 models on disk run from 150 to 277 lines.
7. **B2B org context is covered only when someone remembers it.** Part 0r is required only when the matrix
   already has more than one role row. The author draws the matrix, so if roles are forgotten nothing fires.
   **4 of 27 models carry Part 0r.** Org boundary, multi-org membership with switching, sales rep and login on
   behalf have no rule at all. They exist only in checklist #13 and the SBTM heuristics. The dry runs show the
   cost: VCST-5628 missed `scope: ORGANIZATION`, and VCST-5884 R1–R4 are all about visibility inside an org.

## 2. Direction — three phases, in order

| Phase | The model is | Built by |
|---|---|---|
| **A** | the detail of the strategy's `MODEL` risks: chain, matrix and scenarios for those risks only | the run, when the strategy says so |
| **B** | a thin per-ticket slice. Part 0 and the org-context group live in the domain map / mind map and are cited, not re-derived | the run (slice) + `/qa-domain-map` (surface) |
| **C** | input to case authoring only. In the run, the checklist and exploratory work straight from the strategy | `/qa-test-lifecycle` |

Each phase is validated on real tickets before the next one starts. B and C are recorded here as the agreed
direction; this spec specifies phase A.

## 3. Phase A — decisions

| # | Decision |
|---|---|
| M1 | **Scope (A1).** The model expands only the strategy risks whose technique is `MODEL`. The strategy gate gets a guard: a High/Critical risk on a `{HYPOTHESIS}` oracle must have `MODEL` (the same reasoning as F1). |
| M2 | **Authority (3a).** The strategy is authoritative. The model may refine a technique, e.g. ST in the strategy becomes ST + BVA on specific transitions. A wrong technique, a weaker oracle or a new risk found while modelling is written as an **amendment in strategy §9**, and changing a High/Critical risk re-asks approval. The model never silently disagrees with its strategy row. |
| M3 | **Shape** — see §4. |
| M4 | **Rounds.** The model has no round mechanism of its own. It adds a section numbered with the strategy's round, and the three-round cap (D6) covers it. |
| M5 | **Cap 160 lines**, down from 260. The model now covers some of the risks, not the whole ticket. |
| M6 | **F10 — B2B org context** — see §5. |

## 4. Phase A — model shape

| Part / gate clause | Phase A | Why |
|---|---|---|
| Header: flow, type, ACs, BL/ECL, risk areas (cl. 1) | **Replaced** by `Strategy: <path> · Round N · Risks: R-n…` | already in the strategy (Inputs, Risks) |
| Part 0: chain + diagrams (cl. 2) | **Kept**, scoped to the links the `MODEL` risks cross | the core; moves to the domain map in phase B |
| Variants × links matrix + reverse edges (cl. 3, 4) | **Kept** | the only check that catches a mechanism with no scenario |
| Journey row first (cl. 5) | **Kept** | answers *does it work at all* |
| Condition space, N → M (cl. 6, 7) | **Kept** | the anti-vanity field |
| Scenario columns (cl. 8, 9) | **Kept, plus an `R-n` column** | ties each scenario to a strategy risk |
| Archetype / UIP / probe sweep rows (cl. 10) | **Dropped** | cites a Step 2 that no longer exists; archetype is already a scenario column |
| Chain position, 11b (cl. 11, 11b) | **Kept** | moves to the domain map in phase B |
| Part 0r (cl. 12) | **Becomes row 1 of the org-context group** (§5); its four rules stay | — |
| Model's own `## Round N` | **Dropped** (M4) | — |
| **New clause** | every scenario has an `R-n`, and every `MODEL` risk has at least one scenario | closes the loop with the strategy |

The gate goes from 13 clauses to 10, plus the new one.

## 5. F10 — B2B org context

**In the strategy (a floor).** F10 fires deterministically when the change surface has any of the following:

- an `organizationId` or another org argument in GraphQL or REST;
- an `xapi:my_organization:*` permission;
- an org tab or org list on the storefront;
- an entity owned by an organization;
- the scoped `/graphql/sales-rep` schema or a `sales-rep:*` permission;
- `platform:security:loginOnBehalf`, `CanImpersonate`, or the `/account/impersonate/:userId` route.

When F10 fires, the risk register must hold an org-context risk with technique `MODEL`. That risk goes through
approval and gets an L×I score like any other.

**In the model (an org-context row group).** Six rows, all present whenever F10 fired. A row that does not apply
is `WAIVED + reason`; it is never omitted.

| # | Variant | What is checked | Caught by |
|---|---|---|---|
| 1 | Role within the org | permission gate on the UI **and** a refusal at the server with that role's own token | `Not allowed` line (Part 0r rules) |
| 2 | Org boundary | org A's data is not reachable from org B: list, by id, deep link, search | `SCOPE` |
| 3 | Multi-org + switching | after a switch: data, permissions, cart and prices change, and nothing leaks from the previous org. Permissions are recalculated only at sign-in, so the switch is a link of its own | state-diagram transition |
| 4 | Membership state | blocked / locked / no org (B2C) — pre-feature behaviour | `off` variant |
| 5 | Sales rep | the rep sees **only assigned** orgs through the scoped schema; unassigning revokes access | `SCOPE` + reverse edge |
| 6 | Login on behalf | the session carries the **target's** org context and permissions, not the operator's. Gated by `CanImpersonate` / `loginOnBehalf`. Includes the pending-invite row entry point, which no doc covers. Exit restores the operator's context; the sign-in log records "On behalf" | server refusal + state transition |

Mechanism sources (cite, do not restate):

- token claims and switching: `.claude/skills/qa-test-model/test-model.md` §Part 0r;
- sales rep: `.claude/knowledge/domain/sales-rep.md`;
- login on behalf: `.claude/knowledge/domain/auth.md` (BL-AUTH-008..011);
- the roster entry point: `.claude/knowledge/domain/b2b-organizations.md` (B9/B22).

Coverage today: suite 082 covers impersonation as a flow, but only 7 of its 48 cases check session scope, and
no case covers the pending-invite entry point.

**Phase B** moves this group into `b2b-organizations` as a shared org-context profile, which the returns,
orders and quotes models cite.

## 6. What changes where (phase A)

| File | Change |
|---|---|
| `qa-test-strategy` SKILL.md + `floors.md` (#416) | F10 row and trigger; M1 guard in the gate; `MODEL` as a technique token |
| `.claude/skills/qa-test-model/SKILL.md` | input = strategy path + `MODEL` risks; procedure step 1 follows the strategy's round; output adds the §9 amendments |
| `.claude/skills/qa-test-model/test-model.md` | gate per §4; Part 0r becomes the org-context group; round section replaced by M4 |
| `.claude/templates/test-model.md` | header, `R-n` column, org-context group; sweep rows removed |
| `.claude/knowledge/execution/reports-policy.md` + `.claude/rules/reports.md` | test model cap 260 → 160 |
| `/qa-checklist --from-model`, `/qa-exploratory ticket` | read the `R-n` column; no other change |

## 7. Validation

Re-run the phase-A model on the three dry-run tickets (VCST-5884, VCST-5883, VCST-5628) and compare each with
its existing model:

- **Coverage:** every scenario of the old model is either a scenario of the new one or traced to a strategy row that is not `MODEL`.
- **Size:** at most 160 lines per model.
- **F10:** fires on 5884 and 5628, and the org-context group would have caught `scope: ORGANIZATION` on 5628.
- **Cost:** wall time and tokens versus the old model, measured on a real run.

## 8. Open

- Phase B: the shape of the org-context profile in the domain map, and how a model cites it.
- Phase C: whether `/qa-exploratory ticket` keeps requiring a model once the run stops building one.
