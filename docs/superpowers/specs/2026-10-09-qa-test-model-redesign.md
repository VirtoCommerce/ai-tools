# `/qa-test-model` after the test-strategy step — design

> **Status: phase A implemented 2026-10-14; §7 validation run on VCST-5884, pending on VCST-5883 and VCST-5628.** §3–§5a record the phase-A decisions
> taken in the 2026-10-09 brainstorm, amended 2026-10-14 after review (M8–M10, the phase-A gate in §4, and
> the corrected facts in §1, §5, §7). Every row of §6 is built. Work is tracked in VCST-6250.
> This spec depends on the `/qa-test` redesign (#417, D1–D12) and its prototype (#416, VCST-6249). The strategy
> step has landed as a standalone skill, but no caller runs it yet, so phase A also wires it into
> `/qa-test-fast` (M8).

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
   model with the 13-clause gate. On 2026-10-09 the 27 models on disk ran from 92 to 277 lines, 19 of them
   at 150 or more.
7. **B2B org context is covered only when someone remembers it.** Part 0r is required only when the matrix
   already has more than one role row. The author draws the matrix, so if roles are forgotten nothing fires.
   **4 of 27 models carry Part 0r.** Org boundary, multi-org membership with switching, sales rep and login on
   behalf have no rule at all. They exist only in checklist #13 and the SBTM heuristics. The dry runs show the
   cost: VCST-5628 missed `scope: ORGANIZATION`, and VCST-5884 R1–R4 are all about visibility inside an org.
8. **Configuration is covered only when someone remembers it.** A feature's behaviour depends on settings as
   much as on code, but the model never asks which settings a change reads or what values the stand has.
   **3 of 27 models carry an on/off variant** (VCST-2945 scanner, VCST-5346 missions, VCST-5748 sign-in setting), although `test-model.md` §Part 0 already requires one for a
   feature behind a switch — nothing checks that rule. `npm run store:caps -- --settings` reads every public
   flag in one anonymous call, and neither the strategy nor the model calls it. So when a flag is off on the
   stand, the "on" branch goes untested and nobody finds out. The rule that an integration link gets the
   owning domain's variants (product type, property type) has no gate clause either.

## 2. Direction — three phases, in order

| Phase | The model is | Built by |
|---|---|---|
| **A** | the detail of the strategy's `MODEL` risks: chain, matrix and scenarios for those risks only | the run, when the strategy says so |
| **B** | a thin per-ticket slice. Part 0 and the org-context group live in the domain map / mind map and are cited, not re-derived | the run (slice) + `/qa-domain-map` (surface) |
| **C** | input to case authoring only; the run builds none. Phase A already feeds the checklist and exploratory from the strategy for every risk the model does not expand (M9) | `/qa-test-lifecycle` |

Each phase is validated on real tickets before the next one starts. B and C are recorded here as the agreed
direction; this spec specifies phase A.

## 3. Phase A — decisions

| # | Decision |
|---|---|
| M1 | **Scope (A1).** The model expands only the strategy risks whose technique is `MODEL`, and runs only when there is one (M9). The strategy gate gets a guard: a High/Critical risk on a `{HYPOTHESIS}` oracle must have `MODEL` (the same reasoning as F1). |
| M2 | **Authority (3a).** The strategy is authoritative. The model may refine a technique, e.g. ST in the strategy becomes ST + BVA on specific transitions. A wrong technique, a weaker oracle or a new risk found while modelling is written as an **amendment in the strategy round's `### Amendments` section**, and changing a High/Critical risk re-asks approval. The model never silently disagrees with its strategy row. |
| M3 | **Shape** — see §4. |
| M4 | **Rounds.** The model has no round mechanism of its own. It adds a section numbered with the strategy's round, and the three-round cap (D6) covers it. |
| M5 | **Cap 160 lines**, down from 260. The model now covers some of the risks, not the whole ticket. |
| M6 | **F10 — B2B org context** — see §5. |
| M7 | **F11 — configuration**, settings and flags (layers 1–3); catalog and product stay matrix variants under a new gate clause — see §5a. |
| M8 | **Two entry modes until the single `/qa-test` runs the strategy.** `/qa-test-model <TICKET> --strategy <path>` builds the phase-A model under the phase-A gate (§4). Without `--strategy` it builds today's model under today's 13-clause gate and 260-line cap, unchanged. That keeps `/qa-test` FULL 1e and a standalone call working, because no caller of theirs runs the strategy yet. `/qa-test-fast` Stage 1 runs `/qa-test-strategy` after the context join and before the model wave, and passes `--strategy`; in phase A it is the only caller of the new mode. The no-strategy mode is deleted in the change that makes `/qa-test` run the strategy, not before. |
| M9 | **The model runs only when the strategy has a `MODEL` risk.** The `Test model` artifact is `RUN` if and only if at least one row of Approach per risk has technique `MODEL`; otherwise it is `SKIP — no MODEL risk`. Floors that used to require the model directly now require a `MODEL` risk instead: F1 through the M1 guard, F2 as a purpose risk with technique `MODEL` whose Source carries `floor:F2` (checked like M10), F10 and F11 through their own risk. An exploratory run no longer forces a model. Because the model expands only `MODEL` risks, the checklist and the exploratory charter read the **strategy** for every other risk: `/qa-checklist` turns every in-scope risk into items and adds the model's scenarios for the `MODEL` ones; `/qa-exploratory ticket` takes its charter from the strategy's Exploratory row (its R-ids and their oracles) and adds the model's unresolved cells when a model exists. |
| M10 | **One floor, one risk.** The risk F10 requires carries the token `floor:F10` in its Source cell; the risk F11 requires carries `floor:F11` (and F2's, `floor:F2`). A fixed token, not a bare id, so a passing mention of "F10" never counts. A risk carries at most one such token, so when both fire the register holds two `MODEL` risks, not one that satisfies both. `check-strategy.mjs` checks this: for each fired floor, a risk whose Source carries its token and whose technique is `MODEL`. Today the script sees only that *some* risk is `MODEL` and leaves the risk's kind to the reviewer. The model's group rows carry the R-n of that floor's risk (clauses 12, 13), which is how the strategy and the model point at the same thing. |

## 4. Phase A — model shape

| Part / gate clause | Phase A | Why |
|---|---|---|
| Header: flow, type, ACs, BL/ECL, risk areas (cl. 1) | **Replaced** by `Strategy: <path> · Round N · Floors: <F10, F11 or none> · Risks: R-n…`; clause 1 is rewritten to check it | already in the strategy (Inputs, Risks, `Floors fired:`) |
| Part 0: chain + diagrams (cl. 2) | **Kept**, scoped to the links the `MODEL` risks cross | the core; moves to the domain map in phase B |
| Variants × links matrix + reverse edges (cl. 3, 4) | **Kept** | the only check that catches a mechanism with no scenario |
| Journey row first (cl. 5) | **Kept** | answers *does it work at all* |
| Condition space, N → M (cl. 6, 7) | **Kept** | the anti-vanity field |
| Scenario columns (cl. 8, 9) | **Kept, plus an `R-n` column** | ties each scenario to a strategy risk |
| Archetype / UIP / probe sweep rows (cl. 10) | **Dropped**; the number 10 is retired | cites a Step 2 that no longer exists; archetype is already a scenario column |
| Chain position, 11b (cl. 11, 11b) | **Kept** | moves to the domain map in phase B |
| Part 0r (cl. 12) | **Becomes row 1 of the org-context group** (§5); its four rules stay, and clause 12 is rewritten to gate the group | — |
| Model's own `## Round N` | **Dropped** (M4) | — |
| **New clauses** | the `R-n` loop (in clause 1), the configuration group (13), the integration link (14) | see the gate below |

**The phase-A gate.** It applies only to a model built with `--strategy`; a model built without one keeps
today's gate (M8). A clause that survives keeps its number, because 11 and 11b are cited by number outside
`test-model.md` (`commands/qa-test.md` §1e, `domain-map.md`). The number 10 is retired rather than reused, so a
stale citation of it fails visibly instead of pointing at a different rule. F10 and F11 are read from the
strategy's `Floors fired:` line, never re-derived by the model.

| # | Clause | vs today |
|---|---|---|
| 1 | The header names the strategy file, its round, the floors fired and the `MODEL` risks expanded. Every scenario carries an `R-n` from that list, and every listed risk has at least one scenario | rewritten (was: flow, type, ACs, BL/ECL, risk areas) |
| 2–9 | Unchanged, scoped to the links the `MODEL` risks cross | kept |
| 10 | — | retired (sweep rows) |
| 11, 11b | Unchanged | kept |
| 12 | F10 fired ⇒ the org-context group (§5) has all six rows, each a scenario # or `WAIVED + reason`, its scenarios carry the F10 risk's R-n (M10), and row 1 meets Part 0r's four rules. F10 not fired but the matrix carries more than one ROLE variant ⇒ row 1 alone, under the same rules (today's trigger, kept so nothing it caught is lost). Neither ⇒ the group is absent and the clause passes | rewritten (was: Part 0r when >1 role variant) |
| 13 | F11 fired ⇒ the configuration group (§5a) has a row set for every setting the diff reads or changes (a setting the strategy's Inputs name only as context needs none), each variant a scenario # or `WAIVED + reason`, and its scenarios carry the F11 risk's R-n (M10). F11 not fired ⇒ the group is absent and the clause passes | new |
| 14 | Every chain link owned by another domain (catalog, pricing, inventory, checkout) carries that domain's variants (product type, property type, …) or `WAIVED + reason` | new; makes the existing integration-point rule checkable (§5a) |

Fourteen clauses: 1–9, 11, 11b, 12–14. Clauses 12 and 13 are what give F10 and F11 force inside the model.
Without them, the groups would be present only when someone remembers them, which is the problem §1.7–1.8
describes.

## 5. F10 — B2B org context

**In the strategy (a floor).** F10 fires deterministically on org context in the change surface: an org
argument, an `xapi:my_organization:*` permission, an org route or list, the scoped sales-rep schema or a
`sales-rep:*` permission, or login on behalf. The normative signal list is the F10 row of
`.claude/skills/qa-test-strategy/floors.md`, computed by `lib/floors.mjs`; it is not restated here, so the two
cannot drift. An entity that an organization owns, with no org argument or route in the diff, is not a signal
the script can read. Where org context shows up only that way, the analyst adds the org-context risk to the
register by hand.

When F10 fires, the risk register must hold an org-context risk with technique `MODEL` whose Source carries `floor:F10`
(M10). That risk goes through approval and gets an L×I score like any other.

**In the model (an org-context row group).** Six rows, all present whenever F10 fired (gate clause 12). A row
that does not apply is `WAIVED + reason`; it is never omitted.

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
- login on behalf: `.claude/knowledge/domain/auth.md` (BL-AUTH-008..011). BL-AUTH-010 and -011 are `ACTIVE`;
  **BL-AUTH-008 and -009 are `SUSPECT`** in `.claude/knowledge/oracles/bl/auth.yaml`, so a row may rest on them
  only as `{HYPOTHESIS}` until `/qa-review-oracles bl` settles them;
- the roster entry point: `.claude/knowledge/domain/b2b-organizations.md` (B9/B22, and the `Invited` row actions).

Coverage today: suite 082 covers impersonation as a flow, but only 7 of its 48 cases check session scope. No
case starts login on behalf from a **pending-invite row of the roster**. IMP-049 Part B reaches an Invited
target only through the direct `/account/impersonate/:userId` route. IMP-040 asserts that the action is
*hidden* on a row with no security account, while `b2b-organizations.md` lists `Login on behalf` among the
`Invited` row's actions. That disagreement is a finding to settle live, not something to resolve in the model.

**Phase B** moves this group into `b2b-organizations` as a shared org-context profile, which the returns,
orders and quotes models cite.

## 5a. F11 — configuration

**Layers.** Phase A covers layers 1–3. Layers 4–5 are data rather than flags: they stay matrix variants under
the new integration-link clause in §4.

| # | Layer | Where it lives | How its value is read | Phase A |
|---|---|---|---|---|
| 1 | Module / platform settings | `ModuleConstants.Settings`; global, or overridden per store | the diff + `npm run store:caps -- --settings` (public ones only — anonymous); the admin REST API for the rest, e.g. `GET /api/stores/{storeId}` `settings[]` (VCST-5884's `Return.NotifyOrganizationEmail` is not public) | **F11** |
| 2 | Store settings | flags (`quotesEnabled`, `anonymousUsersAllowed`…), languages, currencies, payment / shipping / tax methods | `npm run store:caps -- --store` | **F11** |
| 3 | Theme `$cfg.*` flags | baked into the theme bundle | `.claude/knowledge/automation/storefront-config-flags.md` | **F11** |
| 4 | Catalog and product | product type (physical / digital / configurable / variations), property type, multivalue, dictionary, virtual catalog | catalog data, live-discover | gate clause (§4) |
| 5 | Pricing and inventory | price-list assignment, fulfillment centers, track inventory, backorder / preorder | data + store settings | gate clause (§4) |

**In the strategy (a floor).** F11 fires deterministically when the change adds, changes or reads a setting.
The normative signal list is the F11 row of `.claude/skills/qa-test-strategy/floors.md`, computed by
`lib/floors.mjs`. Besides the diff patterns (`ModuleConstants.Settings`, `settingsManager`, `store.settings`,
`$cfg.`), it fires on a settings entry that names its key and on a hidden-behaviour row answering `yes` for
`feature-flags` or `default-values`.

When F11 fires:

- the risk register must hold a configuration risk with technique `MODEL` whose Source carries `floor:F11` (M10);
- **Inputs → Project environment** records the stand's current value of each setting the diff reads (the
  `store:caps` output). A branch the stand cannot reach is then visible before the run, not discovered after it.

**In the model (a configuration row group).** One set of rows per setting the diff reads or changes (gate
clause 13):

| Variant | What is checked |
|---|---|
| Default value | out-of-the-box behaviour |
| Non-default / on | the branch the feature exists for |
| Off / feature off | pre-feature behaviour (the existing `off` rule) |
| Scope | the global value vs a per-store override |
| Change at runtime | the storefront caches the capability manifest in `localStorage` per session (`.claude/knowledge/domain/store-settings.md` §The storefront capability manifest): what the user sees after the value changes |

A row that does not apply is `WAIVED + reason`.

**Phase B** adds a configuration inventory to each domain map: which settings affect the domain, their
defaults, scope and layer. A model then cites the inventory instead of rediscovering the settings.

## 6. What changes where (phase A)

All rows built 2026-10-14. The phase-A gate, groups and cap now live in `qa-test-model/test-model.md`
§Strategy mode, which is normative from here on; this section records the change.

| File | Change |
|---|---|
| `qa-test-strategy` SKILL.md + `floors.md` (#416) | F10 and F11 rows and triggers; M1 guard in the gate; `MODEL` as a technique token; the stand's setting values in Inputs when F11 fires — **done 2026-10-14** (`floors.mjs`, `check-strategy.mjs`). **Reopened by M9:** the `Test model` row of step 9 Artifacts; F1 and F2 drop "test model" from their floor in `floors.md` (F2 becomes a purpose risk with technique `MODEL` + exploratory); in `check-strategy.mjs`, `ARTIFACTS_FOR` stops mapping F1/F2/F10/F11 to `Test model`, and a new check requires `Test model` to be `RUN` if and only if some risk has technique `MODEL`. **Reopened by M10:** the clause-6 check in `check-strategy.mjs` becomes per floor (a `MODEL` risk whose Source carries `floor:<id>`); the template's Risks `Source` hint gains `floor:F2` / `floor:F10` / `floor:F11`; SKILL.md §Gate drops "the script sees only that some risk is `MODEL`" from the reviewer's list |
| `commands/qa-test.md` §1e | **no change in phase A** — M8 keeps the no-strategy gate, so its 13-clause checklist and gate-table row stay correct. They change when `/qa-test` runs the strategy |
| `commands/qa-test-fast.md` Stage 1 + `skills/qa-test-fast/context-wave.md` | run `/qa-test-strategy` after the join and before Wave 2; pass `--strategy` to the model; run the model only on the strategy's `RUN`; the stage gate checks model clauses only when a model ran (M8, M9) |
| `.claude/skills/qa-test-model/SKILL.md` | input = `--strategy <path>` + its `MODEL` risks, or no strategy (today's model, M8); procedure step 1 follows the strategy's round; output adds the strategy amendments |
| `.claude/skills/qa-test-model/test-model.md` | the phase-A gate per §4, beside today's gate for the no-strategy mode (M8); Part 0r becomes the org-context group; for a phase-A model, M4 replaces §One ticket, one model file — even across `--iterate` rounds, and §What Step 3 does with it (case authoring from `Not allowed` lines) moves to `/qa-test-lifecycle`, because no cases are authored in the run (D2) |
| `.claude/templates/test-model.md` | a phase-A header beside today's; `R-n` column, org-context and configuration groups; the phase-A form drops every row marked "filled in Step 2" — the three sweep rows **and** `Business Rules` / `Edge cases`, which the strategy's Inputs already carry |
| `.claude/knowledge/execution/reports-policy.md` + `.claude/rules/reports.md` | test model cap 160 for a phase-A model; 260 stays for the no-strategy mode until M8 retires it. In `reports-policy.md`, the §1 category-3 row ("target 80–160") and the §2 row's rationale for 260 (diagrams + matrix + four sweeps) are rewritten to match |
| `/qa-checklist` | items for every in-scope strategy risk, each naming its `R-n`; `--from-model` adds the model's scenarios for the `MODEL` risks and reads their `R-n` column (M9) |
| `/qa-exploratory ticket` | charter from the strategy's Exploratory row; the model's unresolved cells added when a model exists; no STOP for a missing model when a strategy is given (M9) |

## 7. Validation

Re-run the phase-A model on the three dry-run tickets (VCST-5884, VCST-5883, VCST-5628) and compare each with
its baseline. For 5884 and 5883 the baseline is the existing model in `reports/ba/test-models/`. **5628 has no
model**, so its baseline is the coverage report it shares with 5883,
`reports/coverage/COV-VCST-5628-5883-returns/coverage.md`.

- **Coverage:** every scenario of the old model, or for 5628 every gap the coverage report names, is either a scenario of the new model or traced to a strategy row that is not `MODEL`.
- **Size:** at most 160 lines per model.
- **F10:** fires on 5884 and 5628, and the org-context group would have caught `scope: ORGANIZATION` on 5628.
- **F11:** on each ticket whose diff reads a setting, the strategy records the stand's value, and the model has the configuration rows.
- **M9:** the model runs on a ticket if and only if its strategy has a `MODEL` risk, and the checklist has items for
  every non-`MODEL` risk.
- **M10:** on a ticket where F10 and F11 both fire, the strategy gate rejects a register with a single `MODEL`
  risk and accepts one with an F10 risk and an F11 risk.
- **M8:** a `/qa-test` FULL run on one of the three tickets still produces today's model and passes today's gate.
- **Cost:** wall time and tokens versus the old model, measured on a real run.

### 7.1 Results

**VCST-5884 (2026-10-14) — desk run.** D6 refuses a new round on this ticket: four builds have already been
tested. So the strategy and the model were built from that day's context bundle and not executed.

| Check | Result |
|---|---|
| Size | 134 lines (cap 160) vs 263 in the old model; 10 scenarios vs 32 |
| Coverage | All 32 old scenarios traced: 19 to the new model, 11 to strategy risks the model does not expand, S19 waived as before. The draft missed four: three were fixed in the model, and S32 (list dated by created date) was added to the strategy as amendment R13 |
| F10 | Fires on `xapi:my_organization`. All six rows are present; sales rep is WAIVED with a reason. Login on behalf is a scenario the old model never had. FIXTURE-GAP: no operator account among the org-returns aliases |
| F11 | Fires on `Return.NotifyOrganizationEmail` (stand `false`, default `false`), so the "on" branch is visible before the run |
| M9 / M10 | The model runs because four risks are `MODEL`. On the real bundle the gate rejects a missing `floor:F11` (6), one risk carrying both tokens (6f), and `Test model` `SKIP` beside `MODEL` risks (6e) |
| Cost | About 13 min wall, dominated by `/ticket-context` (four analysts, about 690k subagent tokens); the strategy and model were inline |
| M8 | Not run (needs a `/qa-test` FULL run) |

The run found two defects, fixed in PR #448:
- `store:caps` prints public settings only, so F11 now reads the rest through the admin REST API.
- Clause 13 now binds to the settings the diff reads, not every setting Inputs mention.

**VCST-5883, VCST-5628:** pending. Their PR reads hit the GitHub API rate limit on 2026-10-14.

## 8. Open

- Phase B: the shape of the org-context profile in the domain map, and how a model cites it.
- Phase B: the shape of the per-domain configuration inventory, and whether layers 4–5 join F11 once it exists.
- Phase C: ~~whether `/qa-exploratory ticket` keeps requiring a model once the run stops building one~~ —
  settled in phase A by M9: it does not when a strategy is given.
- When the single `/qa-test` runs the strategy, which also retires M8's no-strategy mode.
