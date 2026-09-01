---
name: qa-test-design
description: "[QA Method] Test design techniques: value-chain flow coverage (FLOW — run first), equivalence partitioning, BVA, decision tables, state transitions, pairwise, error guessing."
argument-hint: "feature name | technique name | VCST-XXXX"

---

# /qa-test-design — Systematic Test Case Derivation

Apply formal test design techniques to systematically derive test cases with maximum defect detection and minimum redundancy. Use when writing new test cases, reviewing existing coverage, or designing regression suites.

## Usage
```
/qa-test-design Checkout flow
/qa-test-design BVA for cart quantity limits
/qa-test-design VCST-5678 — configurable product selection
/qa-test-design decision-table for shipping + payment combinations
```

## Execution

1. **Read the techniques reference:** Load `test-design-techniques.md` from this skill folder for full technique descriptions, selection guide, and generic VC examples. Then load relevant files from `examples/` subfolder for applied examples with real QA product mappings (9 files: `ep-configurable-sections.md`, `bva-configurable-boundaries.md`, `pairwise-product-toggles.md`, `pairwise-store-settings.md`, `decision-table-promo-configurable.md`, `decision-table-b2b-visibility.md`, `state-transition-mid-session.md`, `classification-tree-products.md`, `error-guessing-configurable.md`).

2. **Model the VALUE CHAIN before anything else — `test-design-techniques.md` §1a (FLOW).**
   - If a JIRA ticket is provided, fetch details via Atlassian MCP; if a feature name, identify the
     relevant domain (catalog, cart, checkout, B2B, admin, etc.)
   - **Write the chain**: `trigger -> effect -> persisted state -> user-visible surface -> what it unlocks`.
     One line per link, in the user's words. Being unable to write it IS the finding — go back to
     context/story analysis rather than compensating with more UI cases.
   - **Draw it** — a `flowchart` always; a `sequenceDiagram` when the chain crosses layers or any
     part is async; a `stateDiagram-v2` when the entity has a lifecycle or an effect is expected to
     reverse. §1a says which diagram exposes what.
   - **Enumerate the VARIANTS** (goal types, processors, product kinds, role kinds) — they take
     different code paths through the same link, so they are matrix rows, not input partitions.
   - **Publish the variants × links matrix**, every cell holding a scenario # or `GAP`/`WAIVED + reason`.
     A blank cell is an invisible hole; a `GAP` is a decision someone can argue with.
   - Only then list inputs, outputs, business rules and state transitions — **per link**, as the
     refinement of a named crossing rather than as a free-floating field inventory.

3. **Select technique(s)** using the selection guide — **FLOW first, then the rest**:
   - **Any feature that changes state** → **FLOW** (§1a); its `[JOURNEY]` case is authored FIRST,
     before any per-screen case, because it is the one that answers "does this feature work at all?"
   - **Many input values, few rules** → Equivalence Partitioning + BVA
   - **Complex business rules with conditions** → Decision Table
   - **Feature has lifecycle states** → State Transition Testing
   - **Many parameters, too many combos** → Pairwise / Combinatorial
   - **Mature feature, looking for edge cases** → Error Guessing
   - **New or unknown feature** → Start with EP + BVA, then Error Guessing

4. **Apply the technique(s):**
   - Derive partitions, boundaries, decision rules, states, or pairs
   - Map each derived test condition to a concrete VC scenario
   - Assign priority (P0-P3) based on risk (see `/qa-risk` for risk framework)

5. **Output structured test cases:**
   - **Authoring contract is `.claude/skills/qa-test-cases-generator/test-case-template.md`** (the
     15-column enriched CSV) — do not invent a column set here. The technique travels as a
     `Technique:<TOKEN>` stamp in the free-text `References` column, tokens per
     `test-design-techniques.md` §0.
   - Group by technique applied
   - Flag any gaps discovered (untested partitions, missing transitions, uncovered pairs)

6. **Coverage assessment:**
   - List which partitions / boundaries / states / pairs are covered
   - Identify remaining gaps and recommend additional test cases if needed

## Integration with Other Skills
- Use `/qa-risk` to prioritize which features need formal test design first
- Use `/qa-evidence` for output formatting and artifact paths
- Feeds into `/qa-plan` for test suite composition

## Rules
- **FLOW before parameters, always** (`test-design-techniques.md` §1a). EP/BVA/DT/ST/PW/CT/EG are all
  parameter-space techniques: they refine a link that has already been named, and none of them can
  name the chain. Run against an unnamed chain they produce per-screen field checks that pass while
  the feature is broken — measured on Loyalty Missions, where 71 storefront cases placed zero orders,
  54 of them never left one page, the chain end-to-end got 11% of the cases, and the final link
  (spending what the feature grants) got exactly one, written on the last day
- **Every feature that changes state ships at least one `[JOURNEY]` case**, authored first, running
  the whole chain through the surface a customer actually uses, with data that makes each link's
  outcome decidable
- **A case that never leaves one screen must name the link it defends** — otherwise it is decoration,
  and `/qa-test-cases-generator` §6 culls it
- **The reverse edge is part of the design.** Whatever moves money, points, stock or entitlement
  forward gets asked, on the lifecycle diagram, what moves it back. Its absence in the product is a
  finding to report, never a cell to leave blank
- Always apply at least EP + BVA as baseline. Not because of any headline percentage — a boundary
  is simply *where a decision changes*, and the decision table is what tells you where the
  boundaries are, so the two techniques compound
- Pick the technique from the **fault hypothesis**, not from house style: which technique wins is
  fault-type dependent (Basili & Selby, IEEE TSE 1987, and its replications), so a suite where
  every case came from one technique is blind to whatever that technique does not detect
- Cover **pairs, not single values**; `t=2` default, `t=3` ceiling, `t=4` revenue-critical only
  (`test-design-techniques.md` §6 — the interaction rule)
- Decision tables are mandatory for features with 3+ business rule conditions
- State transition testing is mandatory for any feature with a lifecycle (orders, quotes, returns)
- Document which technique was applied to each test case for traceability
- Never skip negative test cases — invalid inputs and transitions are where bugs hide
