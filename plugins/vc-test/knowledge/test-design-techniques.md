<!-- copy of .claude/skills/qa-test-design/test-design-techniques.md §0, §1 — keep in step; the repository copy is canonical here -->
# Test Design Techniques Reference

## 0. Technique tokens — the closed vocabulary

Every technique reference in a Test Model scenario row, and every `Technique:` stamp in a suite
row's `References`, uses one of these tokens. This table is the single source of truth: the
`/qa-test` Step 1e model reads it, and `append-test-cases-to-suite.ts` validates against it at
run time (never against a hardcoded list).

| Token | Technique | Section |
|---|---|---|
| `FLOW` | Value-Chain Flow Coverage (end-to-end journey) | §1a |
| `EP` | Equivalence Partitioning | §2 |
| `BVA` | Boundary Value Analysis | §3 |
| `DT` | Decision Table | §4 |
| `ST` | State Transition | §5 |
| `PW` | Pairwise / t-way combinatorial | §6 |
| `CT` | Classification Tree | `examples/classification-tree-products.md` |
| `EG` | Error Guessing | §7 |

Adding a token means adding a section here first. 34 suite rows already carry organic
`Technique:` stamps — this formalizes that convention rather than inventing one.

---

## 1. Technique Selection Guide

Use this table to pick the right technique(s) for the feature under test. Most features benefit from combining two or more techniques.

| Situation | Recommended Technique(s) | Rationale |
|---|---|---|
| Many input values, few business rules | EP + BVA | Partitions reduce combinatorial explosion; boundaries catch off-by-one errors |
| Complex business rules with multiple conditions | Decision Table | Exhaustive rule coverage; exposes missing/contradictory rules |
| Feature has a lifecycle (status changes) | State Transition Testing | Catches invalid transitions and unreachable states |
| Many parameters, full combination infeasible | Pairwise / Combinatorial | Covers all 2-way interactions at ~15% of full combinations |
| Mature feature, looking for edge cases | Error Guessing | Leverages domain knowledge to target likely failure points |
| New or unknown feature | EP + BVA + Error Guessing | Baseline systematic coverage plus exploratory edge cases |
| **Any feature that changes state — run this FIRST** | **FLOW** (§1a) | Names the chain of value the feature delivers, so the other techniques have a link to refine. Skipping it yields per-screen field checks that pass while the feature is broken |
| Integration or E2E testing | FLOW first, then layer the rest | FLOW supplies the journey and the variants × links matrix; EP for inputs, ST for lifecycles, DT for rules refine each crossing |

**Combining techniques:** Start with EP + BVA to establish baseline coverage, then layer additional techniques based on feature characteristics. Track which technique produced each test case for traceability.
