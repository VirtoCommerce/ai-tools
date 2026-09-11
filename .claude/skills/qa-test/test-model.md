# Step 1e — the Test Model is a FAULT model

Methodology for `/qa-test` Step 1e. The command states *that* the model is required on FULL and *what
gate* it must clear; this file is *why*, and the judgment rules the gate cannot mechanise. Fill-in shape:
[`.claude/templates/test-model.md`](../../templates/test-model.md).

## What it is for

Distil `1c` context + `1d` story analysis + `1a` scope/domains into one structured model — the fault model
Step 3 authors cases from. It answers *"how can this feature be wrong, and what would catch each way?"*,
**not** *"is every acceptance criterion represented?"* Coverage is necessary but it is not the goal, and a
model that only traces ACs produces a suite that confirms the feature instead of attacking it.

**Required for every Epic and substantial feature, and for every Story except one narrow case; not built on
the FAST path at all.** The model is what makes the ticket's context understandable and its documentation
adequate — a job a P2 config tweak does not have. A FAST run states in one line that no model was built
and proceeds to the Artifact B checklist.

**The one narrow case, and the guard on it.** A Story narrow on all six of
[`ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5b's tokens routes FAST and therefore
builds no model — **unless this surface's purpose is `UNDECLARED`, which sends it back to FULL whatever
the six say.** That guard exists because of reason 2 below: Part 0 is the only place a surface's purpose
and reverse edges are ever declared, and a Story is the only thing that writes one. A narrow story on an
undeclared surface is exactly the run that would have declared it, so letting that one take FAST defers
the declaration indefinitely while looking like a saving. Where Part 0 already exists, the story is
refining a known mechanism and FAST is honest.

## Part 0 comes first, and the chain is drawn

A fault model needs something to hang faults on, and what a feature can most expensively be wrong about is
the end-to-end mechanism it exists to deliver — not the screens it renders on the way. So Part 0 (chain ·
diagrams · variants · the variants × links matrix) is derived FIRST, via
[`/qa-test-design`](../qa-test-design/test-design-techniques.md) §1a (`FLOW`), and the condition space is
built **per link** on top of it.

The order is not a style preference. It is the difference between a suite that proves the feature works and
a suite of individually well-formed per-screen checks that all pass while it does not — see the Loyalty
Missions measurement in [`SKILL.md`](SKILL.md) §The two things.

Diagram selection is not decorative either:

| Draw | When |
|---|---|
| `flowchart` | **always** — the journey: primary path + alternate/error branches |
| `sequenceDiagram` | the chain crosses layers, or any part is async (job / queue / webhook / settlement) |
| `stateDiagram-v2` | the entity has a lifecycle, or an effect is expected to **reverse** (cancel / refund / expire / revoke) |

### The matrix is only a check if its ROWS and COLUMNS are derived independently of the scenario list

*"No blank cells"* is the gate because a blank is a hole someone can see. That property survives only while
the axes come from the **mechanism**. Populate the matrix by reading your own scenario table and it can
confirm nothing the table does not already say: every cell fills, nothing is blank, and a mechanism with no
scenario has **no row to be uncovered in**. The check silently degrades into a restatement of the thing it
was meant to check.

So derive the matrix from Part 0 — chain links as columns, variants as rows — and *then* map scenarios into
it. A cell you cannot fill is the finding; a row you cannot name is a bigger one.

**Variants are partitioned by the branch under test, not by entity identity.** Ask which layer *branches*
on the thing being tested, and when several layers branch differently the variant set is their **union** —
not whichever layer you happened to read first.

**A rewrite of the scenario table is a lossy operation.** Renumbering, re-prioritising or re-deriving the
table after new context lands drops rows silently, because nothing reconciles the new list against the old.
Diff them, or re-derive the matrix from the chain afterwards and see which cells went empty.

> Worked example — VCST-5735 (compare v2), both failures in one model, both showing a full matrix.
> **(1)** Variants were taken from the storage composable, which branches two ways on *entry identity*
> (configurable vs plain), while the render component branched **three** ways (configurable → customize
> link · `hasVariations` → variations link · else → add-to-cart). The whole `hasVariations` branch — its
> control, its `minVariationPrice` display, and its effect on the price row's `differs` signature — had no
> row. **(2)** A scenario covering *the headline capability* (one configurable parent added twice with two
> different configurations, which is the sole reason the entry↔product re-pairing exists) was present in
> the first draft, lost in a rewrite after late context arrived, and never noticed — because the matrix
> row for that variant was then filled from the rewritten table, with the surviving *edge* scenarios.
> Both gaps were found by a human reading the model, not by any gate.

## Why it is a durable file

Written to `reports/ba/test-models/<TICKET>-<date>.md` — `.claude/rules/reports.md` **category 3**. Three
reasons it cannot be a terminal dump:

1. A model nobody can re-open cannot be **argued with**, which is the whole point of having one.
2. The parameter model for a surface (cart, checkout, org roles) does not change per ticket, so as a file
   it is **reused**; as terminal output it dies with the session.

   **Part 0 is the only place a surface's PURPOSE and reverse edges are declared.** Operations, data,
   variants and constraints can be derived from the schema doc, the suites and the oracles; what the
   surface is FOR cannot — it comes from a Part 0 value chain and nowhere else, so a domain with no model
   has an undeclared purpose. Writing this model is what changes that, which is the same incentive shape
   as the `Audited:` stamp being the rotation state.

   **Reason 2 had no reader until 2026-09-03, and it shows.** Nothing in the pipeline ever opened an
   existing model, so "reused" was an aspiration: `reports/ba/test-models/` already carries
   `VCST-5346-2026-08-28.md` **and** `VCST-5346-2026-09-02.md` — one ticket, one surface, two fault
   models, which is the fork the section below forbids arriving by a different door. **Find the prior
   model in `reports/ba/test-models/`** (`1b` item 2-map lists it and the `1c` brief carries the path), then
   apply whichever of the **two** rules fits. They are not one rule, and the ticket-keyed filename is what
   makes conflating them easy:

   - **The same ticket, a later `--iterate` round** → **amend that file in place**, never a second dated
     sibling (§One ticket, one model file).
   - **A different ticket on the same surface** → its own **new** `<TICKET>-<date>.md`, which names the
     predecessor in its `Prior model:` header and **carries Part 0 forward**: chain, diagrams, variants and
     reverse edges copied across, and any correction recorded as **drift against the predecessor** rather
     than silently re-derived. Parts 1–5 are this ticket's own fault model. Another ticket's run never
     edits a predecessor — a model is the record of the reasoning of the run that wrote it, and the
     80–160-line band is per model — and never re-derives Part 0 from scratch, which is what produces two
     independent models of one surface. So *"amended, never forked"* governs the **round**; *"carried
     forward, never re-derived"* governs the **next ticket**.
3. A file is **lintable in principle** — Part 0, the five fault-model parts and the resolved sweeps could
   be checked rather than asserted. **`npm run model:lint` is not implemented**, so today this third reason <!-- doclint:may-not-exist -->
   is an intention, not a gate: do not cite it as though a script were enforcing it. The live deterministic
   gates are `tc:scaffold` over the authoring plan (1e-plan) and the appender at Step 3.

### One ticket, one model file — even across `--iterate` rounds

`<date>` is **round 1’s** date (the run’s `date` field), and a later round **amends that same file**.
A same-day round 2 would otherwise collide on the exact path, and a `-r2` sibling is worse than a
collision: reason 2 above is that the next ticket on this surface carries this model's Part 0 forward, and
two files for one fault model means that carry-forward picks one at random.

An amendment is a `## Round N` section of 5–15 lines (the 80–160-line band is per model, not per round)
and may do exactly three things:

1. mark a hypothesis **CONFIRMED**, with the bug key 5d filed for it;
2. mark one **CLEARED-by-fix**, with the round it went green and the prerelease it went green on;
3. **add rows for mechanisms the FIX’s diff introduces** — a fix is a change, and it earns the same
   fault-model treatment the original change got. This is the loop’s one genuinely new coverage
   obligation, and skipping it is how a fix ships untested.

It may **not** rewrite Part 0. The value chain does not change because a bug was fixed; if it would,
the fix changed the mechanism, and that is a new ticket rather than a round. The `1e` gate (§The gate)
re-fires **only on the amendment’s new rows** — inline, no verifier, exactly like the original
`Model complete | 1e | inline` gate. Round bookkeeping lives in
`summary.json.iterations.per_round[].artifacts.model_amendment`; the loop contract is
[`modes.md`](modes.md) §5k §Artifact refresh between rounds.

The AC table and DoD checklist stay terminal-only; the Artifact B checklist goes to the ticket folder.

## The eight rules that make the scenario table a fault model

`Value chain` + `Chain diagrams` + `Mechanism coverage matrix` + `Test scenarios` are the artifact
`test-management-specialist` authors from. The scenario table is not a list of things to try — each row
names a way this feature can be *wrong*, and the case authored from it is the thing that would catch that.

1. **The journey row comes first, and there is exactly one.** The table opens with a `Technique:FLOW` row
   traversing the WHOLE chain in one run, on the surface a customer actually uses, with data that makes
   every link's outcome decidable. Step 3 authors it as the suite's first case, titled `[JOURNEY]`. Every
   other row refines a link that row already crosses. A state-changing feature with no journey row fails
   the gate — that row answers *"does this feature work at all?"*, and it is the one everybody assumes
   someone else wrote.
2. **A link is crossed only by an observation on the far side of it.** Reading a value out of the API and
   reading the same value off the page are two observations of ONE link; the link between them is crossed
   only by a row that causes the effect and then observes it on the other surface. This is what stops "the
   API moves the number" plus "the page renders a number" from counting as coverage of the join between
   them — which is exactly where integration defects live.
3. **No row may certify a defect.** Where the correct expectation is currently unmet, the row keeps the
   SPEC-derived expectation and names the bug; the case authored from it is held (`Draft`, never promoted)
   or marked `Manual`, or the finding stays in the bug report and no case is written. Flipping the
   expectation to match the broken build makes the case green today, unfalsifiable forever, and RED on the
   day the bug is fixed — the worst of the three outcomes.
4. **A row without a defect hypothesis is not written.** The bar is
   [`qa-test-cases-generator`](../qa-test-cases-generator/SKILL.md) §Step 3 — *"what real bug would this
   catch and why would it occur?"* — plus its §6 cull rule (drop a row that duplicates another row's
   hypothesis, tests infrastructure, or would only fail if the framework itself were broken). **Cite it; do
   not restate it.** This is the gap the table exists to close: the generator has always demanded a bug
   hypothesis, and the model used to hand it a flat scenario list with nowhere to put one.
5. **The oracle comes from the specification, never from the implementation or the running system.**
   `{BL-…}` / `{SPEC}` / `{DOC}` are oracles; **`{OBSERVED}` is a baseline, not an oracle** — writing down
   what the live app currently does turns a bug into the expected result, and it also suppresses the
   bug-exposing case that would have caught it. Same provenance grammar `lint-test-cases.ts` GRD-001
   already enforces on `Assertions`, so the row pre-grounds the case.
6. **Technique follows the hypothesis, not house style.** Which technique wins is fault-type dependent, so
   a table produced entirely by one technique is blind to whatever that technique cannot detect. Tokens and
   selection rules: `/qa-test-design` (`SKILL.md` §3 + `test-design-techniques.md` §0 tokens / §6
   interaction rule — cite it, never restate it); **`t=2` by default, `t=3` ceiling, `t=4` revenue-critical
   only.**
7. **Archetype is one token** from the Defect archetypes table in
   [`knowledge/oracles/vc-bug-catalog.md`](../../knowledge/oracles/vc-bug-catalog.md). It is what makes a
   blind spot visible *at design time* rather than in a later audit.
8. **`Reduction` is the anti-vanity field.** Without it, "M scenarios" is unfalsifiable; with it a reader
   can attack the reduction ("do status and lock actually not interact?"), which is where real coverage
   arguments live. Name the dropped factor and what subsumes it — not just the arithmetic.

## Part 0r — role scenarios, when the feature is scoped by permissions

**Roles are already a Part 0 concept.** The template's `Variants` line names *"role kinds"* as a matrix
ROW type, and clause 11b binds every variant to a surface the domain map enumerates. A role scenario is
therefore not a new axis — it is the **row-traversal of the matrix that already exists**: one role, walked
across the chain links. This section makes those rows concrete instead of leaving `role kinds` as a label
nobody expands.

**Why it earns a section of its own.** `SCOPE` — cross-org / permission-scope leak — is the widest
bug-to-coverage gap the corpus has, and it is the one shape ordinary case design cannot reach: it *passes
every positive-path test by construction*. Asserting "org A's user sees org A's order" tests nothing; only
the refusal discriminates. The b2b map reaches the same conclusion from the other direction — its `D9` row
calls the three divergent role-assignment surfaces the largest untested privilege surface on the product.
Re-derive both figures rather than quoting them:
[`reports/ba/test-model-effectiveness-2026-08-27.md`](../../../reports/ba/test-model-effectiveness-2026-08-27.md) §1 and §7.

**The trigger is derived, not asked: the section is REQUIRED when the `Mechanism coverage matrix` carries
more than one ROLE variant.** That falls straight out of Part 0, which is already derived, so it costs no
new pre-flight axis and no new step — and it is contradictable, which "this feature feels permission-ish"
is not. One role variant ⇒ the section is absent and clause 12 passes silently.

**Where the content comes from.** Roles: the domain map's `### Actors` table (`Actor | Can do | Verdict`).
Permission strings: [`test-data/b2b/roles.csv`](../../../test-data/b2b/roles.csv). Fixture identities:
[`test-data/aliases.json`](../../../test-data/aliases.json) (the `@td()` registry `[PRE:SIGNIN_AS:]`
resolves against) and [`scripts/lib/user-roles.mjs`](../../../scripts/lib/user-roles.mjs). An actor whose
map verdict is `UNVERIFIED` yields a scenario whose expectations are `{HYPOTHESIS}` — inherit the verdict,
never launder it.

**Name the PERMISSION, not only the role — and take it from the PRODUCT, never from a fixture file.** A
role is a label; the permission string is what the product checks. But
[`test-data/b2b/roles.csv`](../../../test-data/b2b/roles.csv) is a **seeding contract**, not an oracle:
`ensureRoles()` *creates* those roles via `PUT /api/platform/security/roles` with exactly those strings, so
asserting against it tests our own fixture and cannot fail. The domain map says as much — b2b `G15`: *"No
doc states which permissions `Organization maintainer` / `Purchasing agent` / `Organization employee` carry
on any env."*

**The product's permission surface, established from source 2026-09-11 — cite this, do not re-derive:**

| Consumer | What it reads |
|---|---|
| `vc-frontend` (the Vue SPA) | **Four strings, total** — `xapi:my_organization:edit`, `xapi:my_organization:user:invite`, `xapi:my_organization:order:view` (`client-app/core/enums/permissions.enum.ts`) and `platform:security:loginOnBehalf`. **No `storefront:*` namespace exists in it.** |
| `vc-storefront` (the LEGACY ASP.NET storefront) | the `storefront:*` namespace — `VirtoCommerce.Storefront.Model/Security/SecurityConstants.cs`. Real, but a different product; inert in the SPA |
| the server | the SAME xapi string, via `CheckAuthAsync` in `vc-module-profile-experience-api` `ProfileSchema.cs` (`InviteUserCommand` → `MyOrganizationUserInvite`, `UpdateOrganizationCommand` → `MyOrganizationEdit`) |

**And separate the two halves, because only one is a product invariant:**

| Claim | Status |
|---|---|
| *"the Invite button requires `xapi:my_organization:user:invite`"* | **PRODUCT** — asserted by `members.vue` and enforced by `CheckAuthAsync`. Safe to assert. |
| *"`org-employee` lacks that permission"* | **ENVIRONMENT** — no platform module seeds these roles at all. `org-maintainer`/`purchasing-agent`/`org-employee` come from deployment seed data, and the **two first-party seeds already disagree**: `vc-sample-data/Setup/adminOnlySample/PlatformEntries.json` grants `org-employee` only `storefront:organization:view`, while `vc-storefront`'s `SecurityConstants.cs` grants it that **plus** `storefront:user:view`. There is no canonical mapping to assert. |

So a role scenario **asserts the permission→gate binding and VERIFIES the role→permission binding as a
precondition**, read from `me.permissions` at run time. Writing the second as an assertion tests our own
seed. (`Customer.MembershipRolesWhitelist` ships the three role *names* as an allow-list of selectable
strings — `vc-module-customer` `ModuleConstants.cs` — but names are not grants.)

**Invariants that ARE product and are worth a scenario**, all source-verified: effective roles are the
**union of three sources** — `Organization.Roles` ∪ `OrganizationMembership.Roles` (`MergeRoles`,
`DistinctBy(RoleId)`) ∪ the account's global roles (`GlobalRolesResolver`) — folded into the token by
`OrganizationIdClaimProvider` **additively** (`existingPermissions.Add`, so an org switch never drops a
global grant); permissions ride as repeated **`permission`** claims scoped by **`organization_id`**; they
are recalculated **only at sign-in**; and a blocking membership status or lockout **zeroes the org-scoped
terms** while leaving global ones intact.

Three consequences a role scenario must respect:

1. **Two controls on one page can have different gates.** On `/company/members`, *Invite members* needs
   `…user:invite`, while the per-row Actions menu needs `canManageMembers` = `…my_organization:edit` **OR**
   `platform:security:loginOnBehalf`. Treating "can manage members" as one boolean mis-predicts any role
   holding one and not the other.
2. **`isAdministrator` short-circuits every gate.** `useUser.checkPermissions()` returns true immediately
   for an admin, before looking at any permission. A role-boundary case must assert neither actor is an
   administrator, or it can pass for the wrong reason.
3. **Equal-by-absence is not equal-by-grant.** `org-employee` and `purchasing-agent` are indistinguishable
   to the SPA — not because they share a permission, but because **neither holds any string it reads**. A
   scenario expecting a storefront difference between them cannot pass; one asserting the non-difference
   must say *why*, or it documents a fixture artifact rather than a product rule (SECOND RULE,
   [`.claude/rules/test-data.md`](../../rules/test-data.md)).

### The four rules

1. **Every scenario carries a `Not allowed` line.** A scenario listing only what the role *can* do is a
   happy path in costume. The refusals are the discriminating half, and they are where the `SCOPE` cases
   come from.
2. **A refusal is asserted at the server, not only in the UI.** A hidden button is not a refusing API.
   Assert the mutation or endpoint with **that role's own token**, and assert that nothing persisted — a
   `200` that quietly no-ops is the `SILENT` archetype wearing a `SCOPE` coat.
3. **Every role named resolves to a real fixture alias, or is marked `FIXTURE-GAP`.** Demand routes to
   `3a` (`/qa-generate-data` → `test-data-engineer`); a role is never invented into existence by an
   `@td()` that does not resolve. Expect this to fire: the b2b map's `G1` records that there is no
   org-employee fixture at all (`ORG_USER_EMAIL` is a second maintainer). That is the section working.
4. **No scenario for a capability the product does not have.** Pre-purchase approval is the standing
   example — `BL-B2B-004` states there is no native order-approval flow, and five buyer→approver cases are
   already `Deprecated` with *"do not re-author"*. Record `ABSENT — re-scope trigger` instead. This is
   clause 11b applied to a journey rather than a surface.

### Which stamps a role case may honestly carry

Both vocabularies are closed and the appender validates against them, so a role case cannot invent a token.

- **Archetype: `SCOPE`.** Its definition covers this — *"Cross-org / tenancy / **permission-scope leak**"* —
  but note its **probe question is written cross-tenant** (*"does org A's user reach org B's object"*), so
  it reads as if org-vs-org were the only shape. A maintainer-vs-employee refusal **inside one org** is the
  permission-scope half of the same token. Use `SILENT` instead where the risk is a `200` that quietly
  no-ops rather than a refusal that leaks.
- **Technique: `FLOW` for the journey row, `DT` for the refusals.** There is no role/RBAC token in
  [`qa-test-design/test-design-techniques.md`](../qa-test-design/test-design-techniques.md) §0 and this
  does not add one — a role scenario is a journey per actor (`FLOW`), and its `Not allowed` set is a
  decision table over actor × operation (`DT`, whose own §4 names permission checks). Reach for `PW` only
  when the matrix is genuinely `role × org × owner × operation` and too large to enumerate (§6).

### The shape

Five columns, because the last three are exactly what differs per role — `Sees` and `Can do` are the
role's surface, `Expected` is the assertion. `Outcome` is the business result in one line; `Not allowed`
is the refusal set rule 1 requires. The fill-in block is in
[`templates/test-model.md`](../../templates/test-model.md).

Keep each scenario to its actions — this section describes *what a role does and is refused*, not how to
drive a browser. Steps, selectors and evidence paths belong to the authored case, never here
([`.claude/rules/test-data.md`](../../rules/test-data.md) §THIRD RULE).

**A two-role scenario is expressible in ONE case today** — a `[PRE:*]` cluster opens an actor segment
inside `Steps`, and 64 cases already use it. Worked shape, the three rules it carries, and when to prefer
`[PRE:SWITCH_ORG]` (one account whose role differs per org — no second token, so the permission-claim
change is directly assertable): [`knowledge/execution/test-execution-preflight.md`](../../knowledge/execution/test-execution-preflight.md)
§Example 4. Do not split a role boundary into two cases out of a belief that one case cannot hold two
actors.

### What Step 3 does with it

`test-management-specialist` authors the e2e suite cases from this section alongside the `Test scenarios`
table. **Each `Not allowed` item becomes its own case** — that is the coverage this section exists to buy,
and it is the row most likely to be deferred as "negative testing we can add later". Target suite is the
layer's e2e suite (`concern: e2e` in `config/test-suites.json`). Handoff contract:
[`authoring.md`](authoring.md) §Artifact A.

## The gate — thirteen clauses, every one contradictable

"Scenarios enumerated" was the old bar and it cannot be wrong. These can. **This list is the normative
one** — the command's `1e` gate line is its compact checklist, so a clause added or reworded here is
changed there in the same edit. The count is stated in exactly two places, this heading and that
checklist (plus the command's gate-table row); **every other file cites the gate without a number**,
deliberately — three of them once carried `twelve-clause` and all three were stale the moment a
clause was added (`.claude/rules/test-data.md` §GOLDEN RULE). **`11b` is a clause NAME, not a
numbering accident** — the command, the template and `domain-map.md` all cite it as `11b`, and it is
nested under 11 because the two read the same token.

1. Ticket **flow + type + path** set (flow = `feature-test` — a `verify-fix` / `hotfix-verify` route never
   reaches 1e); ACs decomposed to **atomic conditions**; **BL/ECL/domains** and **risk areas** present.
2. `Value chain` names every link from trigger to what it unlocks, in the user's words, **and the
   `flowchart` is in the file**. A chain that cannot be written is the finding — go back to `1c`/`1d` rather
   than compensating with per-screen scenarios. A cross-layer or async chain also carries the
   `sequenceDiagram`; a lifecycle or a reversible effect also carries the `stateDiagram-v2`.
3. `Mechanism coverage matrix` published with **no blank cells** — each variant × link cell holds a scenario
   # or `GAP` / `WAIVED + reason` — and `Reverse edges` resolved per forward effect (covered by #, or
   `ABSENT IN PRODUCT`, which is reported as a finding).
4. The matrix's **AXES are derived from the mechanism, not from the scenario table** — columns from the
   chain links, rows from the variants, scenarios mapped in only afterwards. **Clause 3 does not imply this
   and cannot detect its absence**: a matrix populated by reading your own scenario list fills completely by
   construction, so a mechanism with no scenario has no row to be uncovered in (§The matrix is only a
   check). Re-derive after any rewrite of the scenario table.
5. The scenario table's **first row is the `Technique:FLOW` journey**, traversing the whole chain on the
   customer's own surface. Absent for a state-changing feature ⇒ the model is not done.
6. `Condition space` states the factors, their value classes, the constraints, and **raw cell count N**.
7. `Reduction` states `N → M` **and names the factors it dropped and what subsumes them**. An unstated
   reduction is the finding — a scenario count nobody can attack is not a coverage argument.
8. **Every** scenario row carries all five: cell · defect hypothesis · archetype · technique · oracle. No
   blanks, no "TBD", no hypothesis that merely restates the step ("check that X works").
9. Every oracle is `{BL-…}`/`{SPEC}`/`{DOC}` — or, if `{OBSERVED}`/`{HYPOTHESIS}`, the row says what would
   make it a real oracle. An expected value read off the live system is not an oracle. **A `{DOC}` oracle
   citing a GraphQL field, arg or response shape must rest on the snapshot `1b` item 2d refreshed *this
   run*** — a field name from an unrefreshed `graphql-schema.md` is an expected value of unknown age, and
   when 2d recorded `UNKNOWN` those oracles are `{HYPOTHESIS}`
   ([`contract-refresh.md`](contract-refresh.md) §3). Fixture drift 2d reported on an op the ticket's own
   diff touches belongs in the model as a chain link and a candidate reverse edge, not as a footnote.
10. The `Archetype sweep`, `UIP sweep` and `Probes carried in` rows are **PRESENT** — not yet resolved.
    Step 2 is what loads the `VC-*` catalog and the `UIP-*` probe set, so resolving them here would mean
    answering from inputs nobody has read (the template marks all four *"filled in Step 2"*). This clause
    guarantees the rows exist so Step 2's gate cannot skip a sweep silently; **that** gate is where every
    archetype and probe must be covered by a row or **WAIVED with a reason**. Silence is not a waiver — it
    is just checked one step later than this list used to claim.
11. `Chain position` states this ticket's chain as a **SLICE** of the domain chain — the links it TOUCHES
    **and**, explicitly, the links it does **not**.
    **11b.** Every matrix **VARIANT** resolves to a surface the domain map enumerates, or is reported as
    a surface the map is MISSING.
12. **Role scenarios, when the feature is permission-scoped.** Where the `Mechanism coverage matrix`
    carries **more than one ROLE variant**, `Part 0r` is present; **every** scenario in it carries a
    `Not allowed` line; and **every** role it names resolves to a fixture alias or is marked
    `FIXTURE-GAP`. One role variant ⇒ the section is absent and this clause passes silently — it is
    conditional by design, so a single-role feature never pays for it (§Part 0r). The count reads
    **thirteen** because `11b` is a clause, not a sub-point: 1–11 plus `11b` plus this one.

**Clauses 11 and 11b are the two that clauses 1–10 cannot see, because every one of clauses 1–10 passes on
a narrow chain** — a correctly-derived matrix with no blank cells never asks *is this chain a slice of a
larger mechanism?* (clause 11), and nothing else stops a case asserting that a component which does exist
does not (clause 11b). The measured runs behind both, and why naming the links you did not cover is
contradictable while "the matrix is complete" is not:
[`docs/decisions/qa-test-evolution.md`](../../../docs/decisions/qa-test-evolution.md) ·
[`knowledge/domain/domain-map.md`](../../knowledge/domain/domain-map.md).

**Both read the `domain_map` token (2g); neither re-derives it** ([`axes.md`](axes.md)).
`PRESENT`/`STALE` ⇒ both bind against the map's inventory, and on `STALE` a variant resolving only to a
stale surface is recorded as such rather than treated as confirmed. **A map built in this run by `1c-map`
is `PRESENT` here** — it passed the same gate before it was written — and carries `built_in_run: true`.
`ABSENT`/`unresolved` ⇒ both are
satisfied by recording `Domain map: ABSENT — chain position unverified`; absence is **written down, not
blocked**. `1e` is also where 2g's provisional all-layer answer is CONFIRMED — Part 0 now exists, so set
`domain_map.all_layer_confirmed_at: "1e-confirmed"` and correct `all_layer_chain` if the chain disagrees
with the `1b` guess. That correction is the axis working, not a defect.

A missing atomic condition or `ba-system-analyzer` risk area is added before moving on. No fresh-`qa-lead`
dispatch here — this is the doer's own completeness check.

### Why clauses 11, 11b and 4 exist — the three the other nine cannot replace

`commands/qa-test.md` §1e lists the twelve as a checklist and cites this section for the argument.
Each of these three was added after a measured run in which every OTHER clause passed.

**These two catch what the other ten cannot: every one of clauses 1–10 passes on a narrow chain.** 11
makes the omission contradictable — naming the links you did *not* cover invites challenge, "the matrix is
complete" does not. 11b stops a **false-premise case**: a variant that resolves to no enumerated surface.
The measured run behind both is VCST-5317: a FULL run with three verifier gates, a 17-scenario model and
34 authored cases, all matrix cells filled, which never asked *is this chain a slice of a larger
mechanism?* — its chain covered one predicate on one control, of a feature spanning 35 suites and 585
cases across three layers. It also authored a Critical case asserting a component *does not exist* (the
mobile org switcher, reachable at `Corporate → My organizations`), because no clause then required a
variant to resolve to an enumerated surface.

**Clause 4 is new, and "no blank cells" does not imply it.** A matrix populated by reading your own
scenario list fills completely by construction, so a mechanism with no scenario has no row to be uncovered
in — the check degrades into a restatement. Derive **columns from the chain links** and **rows from the
variants**, where variants are partitioned by the layer that BRANCHES on the thing under test (the union,
when several layers branch differently — not whichever you read first), and only then map scenarios in.
Re-derive after any rewrite of the scenario table: renumbering silently drops rows. Both failure modes hit
one model on VCST-5735 and both presented as a full matrix —
[`skills/qa-test/test-model.md`](test-model.md) §The matrix is only a check.

**The sweeps are present here and RESOLVED at Step 2 — the two are different gates and the ordering is
not negotiable.** Step 2 is what loads the `VC-*` catalog entries and the `UIP-*` probe set, so a `1e` gate
demanding them resolved would demand an answer from inputs that have not been read yet (the template marks
all four rows *"filled in Step 2"* for exactly this reason). What `1e` owns is that the rows **exist**, so
Step 2 cannot quietly skip a sweep nobody wrote a line for.

## Worked references

- **Parts 1–5** (condition space → explicit reduction rationale → cells with oracle provenance):
  `reports/ba/Organization roles/test-model-VCST-5281-2026-08-03.md`. It **predates Part 0 and carries no
  diagram** — do not read it as evidence that the chain is optional.
- **A worked Part 0**, with a real chain drawn, its variants × links matrix and its reverse edges:
  `reports/ba/test-models/VCST-5346-2026-08-28.md`.
- The measured cost of not having drawn one: `/qa-test-design` `test-design-techniques.md` §1a.
- **A worked Part 0r** — role scenarios for the Organization employee across the membership lifecycle
  (invited → transacting → blocked), each with its `Not allowed` refusal set:
  `reports/ba/Organization roles/role-scenarios-org-employee.md`. Read it for the level of detail the
  section wants — actions and refusals, no selectors or steps — and for how a `FIXTURE-GAP` is recorded
  rather than worked around.
