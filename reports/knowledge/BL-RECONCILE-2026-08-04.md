# BL-RECONCILE-2026-08-04 — De-duplicating `business-logic.md`

**Defect:** merge commit `02ca3da2` ("Merge branch 'main' into claude/qa-sales-rep-statistics-tlc") concatenated two divergent snapshots of the oracle instead of merging them — two document headers (lines 6, 1499), every domain duplicated, 334 headings for 184 unique ids.

**Scope of divergence (measured, not assumed):** copy 1 (lines 6–1498) was a strict superset except `BL-SREP-001..003` (copy 2 only). Of 150 shared ids, **8** differed textually — `BL-CART-001`, `BL-CART-008`, `BL-UI-001..006` — not 10; `BL-PROFILE-001` and `BL-WL-006` were re-checked and are byte-identical in both copies (an earlier estimate mis-flagged them). This is a *narrower* divergence than assumed, so no stop-and-report was triggered.

## The 8 merges (all kept copy 2's version — each is a genuine improvement over copy 1, not a coin-flip)

| ID | Kept from copy 2 because |
|----|--------------------------|
| BL-CART-001 | Copy 2 is a documented DRIFT correction (BL-AUDIT-2026-07-27) that self-supersedes copy 1's 2026-07-22 amendment — copy 1's "backend rejects" claim was wrong; copy 2 distinguishes the PDP client-side block from the cart-line accept-and-flag behavior. |
| BL-CART-008 | Copy 2 adds a MISSING clause (coupon survives + re-prices on cart-merge, BL-AUDIT-2026-07-27) strictly extending copy 1's rule; nothing from copy 1 is lost. |
| BL-UI-001 | Copy 2's domain-15 intro + this entry's Suite-coverage line correctly reflect that `048b-layout-stability.csv` was removed 2026-07-25; copy 1 still cited the dead suite. |
| BL-UI-002 | Same suite-removal fix, plus copy 2's Verify step points at the `tokens:sync`/`tokens:check` drift-guard (the fix for the phantom-CLS-failure incident) instead of a hand-listed scale. |
| BL-UI-003/004/005 | Suite-removal fix only — bodies otherwise identical. |
| BL-UI-006 | Copy 2's Rule/Verify use the WCAG 2.2 24×24 AA threshold (matching the Severity-rationale bullet both copies already carried) instead of copy 1's stale flat 44×44 rule, which copy 1 self-contradicted. |

No fact was discarded silently: copy 1's superseded 2026-07-22 BL-CART-001 amendment is already narrated inside copy 2's own `Amended:` line ("Supersedes the 2026-07-22 amendment...").

## BL-SREP placement

`BL-SREP-001..003` is a **different, non-overlapping domain** from `BL-SR-*` (hub access / dashboard scope / admin RBAC vs. statistics). Kept as its own **`## Domain 20a: Sales Rep Admin & Hub Access (BL-SREP)`** section (mirroring the existing `10a` sub-domain convention), not renumbered into `BL-SR-*`. Reference scan (`grep -rn "BL-SREP-" regression/ .claude/ reports/ scripts/ ci/`) found live consumers — `reports/tickets/Sprint26-15/VCST-5589/verification-summary.json` (`business_rules_verified` array) and `scripts/seed-data/sales-rep/sales-rep-stats-specs.mjs` (test_purpose comment) — plus the full BL-AUDIT-2026-07-24 / TLC-2026-07-24-1906 audit trail. Per the task's own rule ("if anything references them, prefer keeping the prefix"), renumbering was rejected.

## Verification

- **Id conservation:** scripted diff of `### BL-` heading sets before/after — 184 unique ids before, 184 after, **0 missing, 0 added, 0 internal duplicates**.
- **Structure:** exactly one `# Business Logic Invariants` header, 22 `## Domain` headings (21 domains + the `10a`/`20a` sub-domain convention), no duplicated domain.
- **`bl:lint`** — before: `334 invariants parsed · 284 finding(s): 150 Blocker, 120 Medium, 14 Informational`. After: `184 invariants parsed · 107 finding(s): 0 Blocker, 99 Medium, 8 Informational`. The Medium/Informational drop (BLC-004 "uncovered" findings, 57→30) is expected — dedup halved the double-counted coverage checks; BLC-002 (false-traceability, 75) and BLL-005 (non-contiguous sequence, 2) are unrelated pre-existing findings, unchanged.
- **Downstream citations:** `grep -rl` for `BL-UI-00[1-6]|BL-CART-001|BL-CART-008|BL-PROFILE-001|BL-WL-006|BL-SREP-00[1-3]` across `regression/ .claude/ scripts/ ci/ reports/` → 76 files; every cited id still resolves (no id was renumbered or removed).
- **Coverage Summary table**: recomputed from the deduped invariant set, not hand-edited. Two pre-existing staleness bugs surfaced and were fixed: the Cart row was missing `BL-CART-015` (14→15 total, P1 9→10), and the old Total row (176/51/93/32) didn't match the sum of its own per-domain columns (180/51/96/33) even before this defect — both now reconcile exactly. New Total: **184 / P0 51 / P1 100 / P2 33**, including the new `BL-SREP` row (3/0/3/0). Frontmatter `applicability_rationale` count updated 145→184.

**Not touched:** `BL-SR-014..031` (added today, left intact), no suite CSV, no id renumbered.

**Files modified:** `.claude/knowledge/oracles/business-logic.md` (2776 → 1541 lines; one header, one Coverage Summary table, 184 invariants, 0 Blocker findings).
