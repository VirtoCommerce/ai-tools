# BL Audit Criteria — the evidence bar, source map, and verdict table

Reference for `/qa-review-oracles bl` (alias `/qa-review-bl`). The skill's SKILL.md holds
the flow; this file holds the judgment rules the triangulation runs against. Direct sibling
of `ecl-audit-criteria.md` — same three axes, same bar, same waiver; that file adapts them
to the ECL library's pattern-row shape.

## 1. The evidence bar (what "confirmed" requires)

A BL is **confirmed** (CONFIRMED / DRIFT / MISSING) only when it has an evidence
tuple from **all three axes** that **agree** with each other. Each axis must yield a
concrete artifact, not an opinion:

| Axis | Concrete evidence required | Source |
|------|----------------------------|--------|
| **Docs** | A quote + a doc reference (VirtoOZ topic + section, or a docs URL) that states the behavior | `/vc-docs` (VirtoOZ MCP), Context7 fallback |
| **Source** | A `file:line` anchor in an `org:VirtoCommerce` repo whose code implements the behavior | GitHub MCP `search_code` / `get_file_contents` (read-only; QA never clones) |
| **Live** | An `{OBSERVED}` result (screenshot / captured API response) confirming the behavior on the deployed build | `qa-testing-expert` (playwright-firefox), real UI/API only |

If any axis produces **no** evidence → **UNGROUNDED**. If the axes **disagree**
(docs say X, live shows Y) → **CONTRADICTORY**. Neither is confirmed; both route to
`reports/ba/bl-proposals-<date>.md` for a human.

## 1a. `docs: N/A` allowance — invariants no documentation can cover

Two invariant classes can **never** satisfy the Docs axis, regardless of search effort:

1. **Implementation / UX mechanics** — rounding, decimal-money arithmetic, GraphQL HTTP
   status codes, coupon-slot UX, quantity-reject-vs-auto-cap, order-number reset cadence,
   facet-render mechanics — behaviors the VirtoOZ user/developer guides do not narrate.
2. **Project-specific extensions** — capability layered on the platform with no upstream
   doc surface (e.g. the Mixed-Cart Loyalty domain, a project-specific regression-fix
   invariant, QA-authored layout/a11y methodology invariants).

For such an invariant the **Docs axis may be marked `N/A` and treated as satisfied**, so
`Source + Live` alone can reach CONFIRMED/DRIFT/MISSING — but **only** when ALL hold:

- **Source AND Live are BOTH present this run and agree** — a fresh `file:line` anchor **and**
  a fresh `{OBSERVED}` result. `N/A` never substitutes for a missing Source or Live axis; it
  covers **only** Docs. (Live-unsafe P0 security invariants therefore stay UNGROUNDED, per §5.)
- the entry records an explicit **`- **Docs:** N/A — <implementation-detail | project-specific>: <reason>`**
  line, so the substitution is auditable.
- the auditor judged the behavior **genuinely undocumentable** — NOT merely "no doc found this
  session." A doc that exists but wasn't checked (rate-limit, budget) is a *missing* axis →
  **UNGROUNDED**, not `N/A`. `N/A` never applies to a user-facing behavior a guide would
  normally describe. **When in doubt, UNGROUNDED, not N/A.**

## 2. Per-domain source map (which tool per axis)

Pick the VirtoOZ tool and the likely repo by the BL's domain prefix. This is a
starting point — follow the evidence where it leads.

| Domain prefix | Docs (VirtoOZ tool) | Source (likely repo) | Live surface |
|---------------|---------------------|----------------------|--------------|
| BL-PRICE, BL-CART, BL-CHK, BL-LOY | StorefrontUserGuide / StorefrontDeveloperGuide; FrontendSourceCode | vc-module-x-cart, vc-module-pricing, vc-module-marketing, vc-frontend | Storefront cart/checkout |
| BL-ORD, BL-SHIP, BL-BOPIS | StorefrontUserGuide, PlatformUserGuide | vc-module-orders, vc-module-shipping | Storefront orders + Admin SPA |
| BL-AUTH, BL-B2B, BL-PROFILE | PlatformUserGuide, StorefrontUserGuide, B2BExperts | vc-module-customer, vc-platform, vc-frontend | Storefront auth + company; Admin |
| BL-CAT, BL-SRCH | StorefrontUserGuide, PlatformDeveloperGuide | vc-module-catalog, vc-module-search | Storefront catalog/search + Admin |
| BL-PAY | StorefrontDeveloperGuide | vc-module-payment-*, vc-frontend | Storefront checkout payment |
| BL-WL | PlatformUserGuide | vc-module-white-labeling, vc-frontend | Storefront branding + Admin |
| BL-GQL | StorefrontDeveloperGuide, FrontendSourceCode | vc-module-x-* (xAPI) | GraphiQL `/ui/graphiql` (via qa-backend-expert if API-only) |
| BL-NOTIF, BL-IMPEX, BL-SEO, BL-UI, BL-CROSS | PlatformUserGuide / mixed | matching vc-module-*, vc-frontend | Admin + storefront |

For "where is X implemented?" prefer the VirtoOZ `*SourceCode` tools or GitHub MCP
over the guide tools (per the `/vc-docs` skill).

## 3. Verdict decision table

Read `D` = docs evidence, `S` = source evidence, `L` = live evidence; `agree` means
all present axes describe the same behavior and match the BL `Rule` text.

| D | S | L | Rule text matches evidence? | Verdict |
|---|---|---|-----------------------------|---------|
| ✓ | ✓ | ✓ | yes | **CONFIRMED** |
| ✓ | ✓ | ✓ | no (evidence agrees, Rule stale) | **DRIFT** |
| ✓ | ✓ | ✓ | (no BL exists for this behavior) | **MISSING** |
| N/A (§1a) | ✓ | ✓ | yes | **CONFIRMED** |
| N/A (§1a) | ✓ | ✓ | no (evidence agrees, Rule stale) | **DRIFT** |
| N/A (§1a) | ✓ | ✓ | (no BL exists for this behavior) | **MISSING** |
| Docs missing but a doc *could* exist (not §1a), third absent | — | — | — | **UNGROUNDED** |
| any two present, third absent | — | — | — | **UNGROUNDED** |
| present but conflicting | — | — | — | **CONTRADICTORY** |
| all three say the behavior is gone | — | — | — | **STALE/RETIRE** |

## 4. Edit-safety rules (when auto-applying)

1. **Entry body only.** Edit inside a `### BL-*` block. Never touch the meta
   Severity-Tags table or a `## Domain` heading as a side effect
   (`feedback_bl_promotion_table_separately`).
2. **Minimal, per-entry diffs.** One invariant per edit so any single change is
   revertible from `git diff`.
3. **Stamp provenance on every applied entry:**
   - `- **Amended:** <date> (auto-applied, triangulated — BL-AUDIT-<date>)`
   - refresh `- **Source:**` with the `file:line` anchor (+ a docs reference).
4. **MISSING → next free ID.** Read the oracle for the current max `BL-<DOMAIN>-NNN`,
   use `+1`, zero-padded to 3 digits; place it under the matching `## Domain` heading.
5. **Env-agnostic** (`feedback_bl_oracle_env_agnostic`). No env names, URLs, store
   slugs, or route patterns anywhere in the entry — including the evidence note. Say
   "the environment".
6. **Preserve existing structure.** Keep the canonical field order
   (`Rule` → `Verify` → `Violation signal` → `Agents` → optional `Source` /
   `Suite coverage` / `Amended`). Match the surrounding prose density.
7. **Retiring is never auto-applied.** A STALE/RETIRE verdict is always a human
   proposal (destructive; could remove a still-load-bearing invariant).

## 5. What stays human-gated (routes to the proposals file)

- CONTRADICTORY — the axes disagree; a human must decide which is authoritative.
- UNGROUNDED — an axis produced no evidence (including a P0-security invariant whose
  live axis cannot be safely probed).
- STALE/RETIRE — removing an invariant.

The proposals file format is the existing `PROPOSED-BL-<DOMAIN>-<NNN>` draft shape
(see `.claude/commands/ba-analyze.md`), so `/ba-analyze` and `/qa-review-bl`
unconfirmed items land in the same place for one human pass.
