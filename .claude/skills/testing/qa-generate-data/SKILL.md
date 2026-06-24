---
description: "[Testing] Prepare test data BEFORE a run by designing the cross-entity combinations a feature needs (products × loyalty × promotions × pricing × inventory × B2B), reusing existing fixtures where they cover a case and authoring only the gaps as ready-to-seed fixtures + @td() aliases. Hands off to /qa-seed-data to provision."
argument-hint: "<feature | flow | VCST-XXXX> — e.g. loyalty mixed-cart | promotion stacking | tiered-pricing checkout"
disable-model-invocation: true
---

# /qa-generate-data — Design & Prepare Test-Data Combinations

Prepare the test data a feature needs **before** a test run. The deliverable is a **combination
design**: the deliberate cross-entity combinations (a product in some state × a loyalty program/balance
× a promotion × a pricing rule × an inventory level × a B2B context) that together cover the scenarios
under test. The skill **reuses** existing fixtures wherever one already covers a combination and
**authors only the gaps** as ready-to-seed fixtures + `@td()` aliases, each tagged by combination.
It then hands off to [`/qa-seed-data`](../qa-seed-data/SKILL.md) to provision.

```
/qa-generate-data <feature>                                          (design, this skill)
  1. learn live   → scripts/discover-variants.mjs <feature>          (real per-axis variant counts)
  2. matrix       → scripts/lib/combinatorial-generator.ts           (minimal all-pairs covering set)
  3. reuse/gap    → live-discover + aliases.json                     (reuse-first; author only gaps)
  4. author       → scripts/author-fixtures.ts --plan plan.json      (gap rows + @td() aliases + validate)
/qa-seed-data <domain>       ─►  provisions the fixtures on the platform, writes IDs back   (live)
test cases / suites          ─►  reference each combination via @td(COMBO_ALIAS.field)
```

> **Output (decided):** the durable deliverable is the **gap fixtures (`test-data/<domain>/*.csv`) +
> combination `@td()` aliases (`aliases.json`)**, ready for `/qa-seed-data`. The **variant inventory and
> combination matrix are returned inline to the caller** (test-management) — never written as stray files
> (honors `.claude/rules/reports.md`).

> **Combination design first, row authoring second.** The value here is combinatorial / boundary
> COVERAGE, not plausible-looking individual rows. A single product row is not "prepared test data";
> the *combination* that exercises a scenario is. See `feedback_test_data_prep_is_combination_design`.

---

## Input

A **feature, flow, or JIRA ticket** — e.g. `loyalty mixed-cart`, `promotion stacking`,
`tiered-pricing checkout`, `B2B order approval`, `VCST-5104`. The skill derives the entity axes and
the combinations from the scenarios that feature requires; you do **not** hand it a domain+count.

---

## Procedure

### 1. Scope the scenarios (test-design-first)
Establish what must be covered before touching any data. Lead with feature/journey scope + adversarial
intent (`feedback_test_design_mental_model`), then apply the `/qa-test-design` techniques to derive
cases: equivalence partitions, **boundary values** (the balance one cent short, the cart one cent over
a threshold), **decision tables** (promo applies? loyalty earns? stacks?), state transitions, and
**pairwise** to bound the combination count. Consult `business-logic.md` (BL-* invariants the data must
let you observe) and `vc-bug-catalog.md` (historical combinations that broke). Output: a scenario list.

### 2. Learn the feature live (variant-space discovery)
Before designing combinations, find out **how many variants genuinely exist per axis** in the running
env — the real cardinality / option space, not assumptions. Run the discovery script:

```bash
node scripts/discover-variants.mjs <feature>          # readable inventory: per-axis values + counts
node scripts/discover-variants.mjs <feature> --json   # clean factor spec on stdout (pipe-safe)
```

It enumerates LIVE axes from admin REST (e.g. loyalty: programs / program types / active states;
promotions: active promotions / exclusivity; pricing: pricelists / currencies; products: product types;
inventory: fulfillment centers) **and** suggests equivalence/boundary design axes the rules imply
(e.g. `loyalty_balance: above/exact/below`). Read-only (GET + `/search`), honors `ENV_RISK` (won't read
a production-risk env without override). Known features live in `scripts/lib/feature-variants.mjs`
(`FEATURES` registry) — add one there if your feature isn't covered. The live counts decide
**full-factorial vs pairwise**: small space → cover all; large space → pairwise (and log what's dropped).

### 3. Identify the entity axes
From the scenarios (step 1) + the discovered variant space (step 2), name the **dimensions** that vary
and the **states per dimension** that matter. Keep each axis to states that change behavior (an
equivalence class or a boundary), not every live value — e.g. collapse 10 discovered loyalty programs to
the 2–3 representative classes a scenario distinguishes. The script's `--json` factor spec is the
starting point; prune/relabel it to the axes the scenarios actually need.

### 4. Design the combination matrix (the core deliverable)
Feed the pruned factor spec (+ any constraints excluding invalid pairs) to the pairwise generator:

```bash
node scripts/discover-variants.mjs <feature> --json | npx tsx scripts/lib/combinatorial-generator.ts -
# or: npx tsx scripts/lib/combinatorial-generator.ts '<edited-factor-spec-json>'
```

It emits the **minimal all-pairs covering set** + the full-factorial count it replaced (so you can LOG
what pairwise dropped — never silently cap). Assign a **Combo ID** and the **scenario it covers** to each
row. Add explicit rows for boundaries / known bad-neighborhood combinations (`vc-bug-catalog`) even if
pairwise wouldn't pick them. *(The matrix is returned inline to the caller — not written to a file.)*

### 5. Resolve each cell — reuse first, author the gap
For every entity a combination needs, in order:
1. **Reuse** — does an existing `aliases.json` entry / `test-data/` row / live platform entity already
   satisfy this state? Use [`live-discover.ts`](../../../../scripts/lib/live-discover.ts) to find a
   real one (e.g. "any unpriced product", "a VIP user with balance ≥ X"). If yes, point the combination
   at it — author nothing.
2. **Author the gap** — only when no existing entity covers the state. Build the fixture row using the
   **safe-default → single-field override** model (§Generation model): no system GUIDs, `seeded=false`,
   `AGENT-TEST-` prefix, and **tag the row** — `author-fixtures.ts` stamps whichever provenance column
   the target CSV actually has: `test_purpose` ← scenario (loyalty / pricing / inventory / promotions
   CSVs), `used_by` ← Combo ID (promotions CSVs only), with `notes` as the fallback (e.g.
   `products/standard`) — so each prepared row is traceable back to the combination it serves.

### 6. Author the gaps + aliases + validate (one script)
Hand the resolved plan (cells marked reuse-vs-gap) to the author helper. It writes only the gap rows,
registers the `@td()` aliases (CSV-backed per gap fixture + inline per combination), bumps
`aliases.json` `_meta.version`+changelog, and runs the validator — failing if anything doesn't resolve
or a bare GUID slipped in:

```bash
npx tsx scripts/author-fixtures.ts --plan plan.json            # author + validate (green gate)
npx tsx scripts/author-fixtures.ts --plan plan.json --dry-run  # preview the diff, write nothing
```

Plan shape (the contract): `{ feature, fixtures:[{combo, scenario, file, businessKey, row, alias}],
comboAliases:[{name, combo, inline, fields, notes}] }` — see the header of
[`scripts/author-fixtures.ts`](../../../../scripts/author-fixtures.ts). It is **idempotent** (a gap row
whose business key already exists is reused, never duplicated) and enforces the guardrails (GUID columns
blanked, bare UUIDs rejected, `seeded=false`, `AGENT-TEST-` prefix checked). This is the **only on-disk
output**. (Manual fallback if you don't build a plan: edit the CSVs + `aliases.json` by hand, then run
`npx tsx scripts/validate-td-refs.ts`.)

### 7. Report & hand off
Return **inline to the caller**: the variant inventory (step 2), the combination matrix (step 4, with
Combo IDs + scenario-covered), and the reuse-vs-gap breakdown. The on-disk output is the gap fixtures +
aliases. Then state the next step: **"Gap fixtures are templates (`seeded=false`) — run
`/qa-seed-data <domains>` to provision; reused cells already exist."** This skill stops at prepared
data; it never provisions.

---

## Worked walkthrough — `loyalty mixed-cart`

1. **Scope:** does an unpriced line still earn points? does burn fail at the balance boundary? do points
   accrue on the post-discount total when a promo applies? (BL-LOY-*, vc-bug-catalog VC-LOY-*).
2. **Learn live:** `node scripts/discover-variants.mjs loyalty` → e.g. *10 programs, 2 program types
   (ProductPoints/Default), 2 active states* + suggested `loyalty_balance: above/exact/below`,
   `cart_composition: single_priced/mixed_priced_unpriced/with_oos_line`.
3. **Axes (pruned):** `program_type` {ProductPoints, Default} × `loyalty_balance` {above, exact, below}
   × `cart_composition` {single_priced, mixed_priced_unpriced} × `promotion` {none, auto} — 10 live
   programs collapsed to the 2 type-classes the scenarios distinguish.
4. **Matrix:** pipe to the generator → a handful of all-pairs combos (vs the full-factorial it reports);
   add an explicit boundary row for `balance=exact` (insufficient-balance edge). Assign `LOY-MIX-01..0n`.
5. **Reuse/gap:** `LOYALTY_VIP_USER` reused for the high-balance cell; the *unpriced product* and a
   *zero-balance loyalty user* are gaps → author `AGENT-TEST-UNPRICED-01` (price omitted) +
   `AGENT_TEST_LOY_NOBAL`. Mixed-cart = reused priced product + the unpriced gap.
6. **Author:** `npx tsx scripts/author-fixtures.ts --plan loyalty-plan.json` → writes the 2 gap rows
   (tagged `used_by=LOY-MIX-0n`), adds `LOY_MIX_*` combination aliases, validator green.
7. **Hand off:** return the matrix inline; tell the caller to `/qa-seed-data loyalty products`, then
   author cases referencing `@td(LOY_MIX_02.product)` etc.

---

## Generation model for gap fixtures — safe default + override (Test Data Builder)

When step 5 must author a new fixture, do it the way a **Test Data Builder** constructs objects (Pryce —
verified industry practice), not the way an Object Mother does. Author **one canonical valid row first**
(every field a safe, realistic default that resolves and passes base validation), then **derive each
variant by overriding only the field that combination exercises** — never re-author a full row per cell.

```
base STD row: valid SKU, brand, category, in-stock, priced  (the safe default)
 ├─ AGENT-TEST-OOS-01      = base, override stock → 0          (OOS cell)
 ├─ AGENT-TEST-LOWSTK-01   = base, override stock → 3          (low-stock cell)
 └─ AGENT-TEST-UNPRICED-01 = base, override price → (none)     (unpriced cell)
```

The variant differs from the canonical row in **exactly the field under test**, so the fixture is
self-documenting (the diff *is* the scenario), business keys stay stable, and a schema/column change is
absorbed once in the base row. Record the base→variant lineage in each alias's `notes`.

---

## The non-negotiable rules (read `.claude/rules/test-data.md` first)

| Rule | Why |
|------|-----|
| **No system-generated GUIDs** in authored rows. Leave `*_guid`/`platform_id` empty, `seeded=false`. | IDs exist only after `/qa-seed-data`; the validator (DV-013) fails on bare UUIDs. |
| **Reference data by stable business key** — `code`/`sku`/`name`/`slug`/`email`. | Business keys survive teardown+reseed; GUIDs don't. |
| **`AGENT-TEST-` prefix** on every authored unique value. | `/qa-seed-data teardown` sweeps the prefix. Use [`random-data.ts`](../../../../scripts/lib/random-data.ts). |
| **Reuse before authoring.** Live-discover / existing aliases first; author only true gaps. | Minimizes new seed load and keeps the fixture surface small (your answer: reuse-first). |
| **Realistic, domain-correct values** — believable names/brands/prices, valid state↔ZIP, alphanumeric coupon codes (`^[a-zA-Z0-9]+$`). | Fixtures are read by humans and drive real assertions. |
| **Assert shape, not volatile values** (prices, catalog-dependent titles drift). | `feedback_env_resilience`. |

---

## Alias shapes (`aliases.json`)

**Combination alias** — names a whole combination so a test references it by Combo ID:
```jsonc
"LOY_MIX_UNPRICED_EARN": {
  "_inline": true,
  "combo": "LOY-MIX-02",
  "product": "AGENT-TEST-UNPRICED-01",   // business key of the gap fixture (or a reused alias name)
  "loyalty_user": "LOYALTY_VIP_USER",     // reused existing alias
  "promotion": null,
  "fields": { "product": "product", "loyalty_user": "loyalty_user" },
  "_notes": "VCST-XXXX loyalty mixed-cart combo: does an unpriced line still earn points? product gap-authored (seeded=false), VIP user reused. Provision product via /qa-seed-data products."
}
```

**CSV-backed gap fixture alias** — the new row lives in a fixture file, keyed by business key:
```jsonc
"AGENT_TEST_UNPRICED_PRODUCT": {
  "file": "products/standard",
  "filter": { "product_code": "AGENT-TEST-UNPRICED-01" },
  "fields": { "sku": "product_code", "name": "product_name" },
  "notes": "Gap fixture for LOY-MIX-02. Base STD row with price omitted. seeded=false — provision via /qa-seed-data products."
}
```

---

## Boundaries (when to STOP)
- **Design + author fixtures only. Never provision** — that's `/qa-seed-data`.
- **Never author/edit regression suite CSVs** or `config/test-suites.json` (runner/planner boundary —
  `feedback_runner_planner_no_suite_authoring`). This skill writes `test-data/` only.
- **Reuse before you author**; don't invent GUIDs or live prices.
- **No real credentials/cards.** Passwords stay in `.env`; cards stay processor-test cards.

---

## Consumed by

This skill is invoked **while authoring test cases**, so cases reference *prepared* combinations, not
ad-hoc data:
- **`test-management-specialist`** calls `/qa-generate-data <feature>` as the data-prep step of its
  test-authoring flow, then writes each case's `Test_Data` column as `@td(COMBO_ALIAS.field)`.
- **[`/qa-test-cases-generator`](../../qa-methodology/qa-test-cases-generator/SKILL.md)** delegates
  combination design here first, then maps one case (or case group) per Combo ID.

The combination matrix returned inline (step 7) is what those callers consume to map cases → Combo IDs.

## Pipeline scripts (this skill's tooling)
- Stage 1 — live variant discovery: [`scripts/discover-variants.mjs`](../../../../scripts/discover-variants.mjs) (CLI) + [`scripts/lib/feature-variants.mjs`](../../../../scripts/lib/feature-variants.mjs) (`FEATURES` registry)
- Stage 2 — pairwise/all-pairs: [`scripts/lib/combinatorial-generator.ts`](../../../../scripts/lib/combinatorial-generator.ts)
- Stage 3 — gap fixtures + aliases + validate: [`scripts/author-fixtures.ts`](../../../../scripts/author-fixtures.ts)

## References (cite, don't duplicate)
- Combination-design intent: `feedback_test_data_prep_is_combination_design` · test-design mindset: `feedback_test_design_mental_model`
- Techniques: [`/qa-test-design`](../../qa-methodology/qa-test-design/SKILL.md) (EP, BVA, decision tables, pairwise)
- Policy + enforcement: [`.claude/rules/test-data.md`](../../../rules/test-data.md)
- Directory map + seed-gap tables: [`test-data/README.md`](../../../../test-data/README.md)
- Resolver decision tree (`{{VAR}}` vs `@td()` vs live-discover vs random-data): [`.claude/agents/knowledge/execution/live-discovery.md`](../../../agents/knowledge/execution/live-discovery.md)
- BL invariants the data must let you observe: [`.claude/agents/knowledge/oracles/business-logic.md`](../../../agents/knowledge/oracles/business-logic.md) · historical bad combinations: [`vc-bug-catalog.md`](../../../agents/knowledge/oracles/vc-bug-catalog.md)
- Generators: [`scripts/lib/random-data.ts`](../../../../scripts/lib/random-data.ts) · discovery: [`scripts/lib/live-discover.ts`](../../../../scripts/lib/live-discover.ts)
- Validators: [`scripts/validate-td-refs.ts`](../../../../scripts/validate-td-refs.ts) · [`scripts/audit-aliases.ts`](../../../../scripts/audit-aliases.ts)
- Provisioning companion: [`/qa-seed-data`](../qa-seed-data/SKILL.md)
