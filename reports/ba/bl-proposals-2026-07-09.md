# Business Logic Proposals — BA-2026-07-09

> **These are drafts. They are NOT applied to `knowledge/oracles/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze flows VCST-5239` run `2026-07-09` — see `reports/ba/ba-report-2026-07-09.md`.

**Dedup note:** the analyzer proposed 4 new invariants; **2 were dropped** as substantively
identical to entries `business-logic.md` already carries (it was updated with VCST-5239 language):
- ~~Org-level role inheritance~~ → already in **BL-B2B-005** ("an org can carry org-level roles (`Organization.Roles`) inherited by all its members… deduped union").
- ~~Permission union + override-removal safety~~ → already in **BL-B2B-005** ("removing a member's own membership-role override MUST preserve the org-inherited perms") + **BL-B2B-007** (union stays org-scoped).

The 2 below survive dedup; both are sourced.

---

## New Invariants Proposed

### PROPOSED-BL-AUTH-014: Permissions are re-derived only at token issuance (relogin-gated), never live-pushed `[P2-ux]`

- **Rule:** A user's effective permissions are recomputed **only** when a token is issued (`/connect/token` at sign-in / org-switch). A role change made server-side (global, org-level, or membership) is real immediately but MUST NOT be pushed to an already-open storefront session; the affected user sees it only after a fresh token (relogin). Conversely, a relogin MUST pick up the change (no stale JWT).
- **Verify:**
  - Change a member's role server-side while their storefront session stays open → the open session's `pageContext.user.permissions` is unchanged until relogin.
  - Relogin (or org-switch re-issuing a token) → decoded JWT `permission[]` and `pageContext.user.permissions` reflect the new role.
- **Violation signal:** an open session silently gains/loses permissions with no new token (unexpected live push); OR a relogin fails to pick up a committed role change (stale JWT).
- **Agents:** qa-frontend-expert (session/relogin timing), qa-backend-expert (token minting).
- **Source:** `tests/Sprint-current/VCST-5239/ac-analysis.md` AC3 notes + `test-execution-report-frontend.md` AC3 (relogin-gating verified PASS).
- **Triggered by:** VCST-5239 AC3 (relogin-gated propagation).

---

### PROPOSED-BL-CROSS-013: Org-scoped xAPI fields resolve org context from the JWT claim only, never a client argument `[P0-revenue]`

*(Tentative ID — confirm next-available `BL-CROSS-*` at promotion; CROSS runs to 012 today. Domain could also be argued as B2B; promoter decides.)*

- **Rule:** Org-scoped GraphQL fields (e.g. `rolesInOrganization`, `isLockedInOrganization`) MUST resolve the organization context **exclusively** from the caller's JWT `organizationId` claim (and `userId`), never from a client-supplied `organizationId` argument. VCST-5239 dropped that argument from these fields; the invariant guards against re-introducing an argument that would let a caller read another org's data by spoofing the id.
- **Verify:**
  - A multi-org actor with a JWT scoped to org A calls `rolesInOrganization` / `isLockedInOrganization` with no arg → resolves org A only.
  - Schema introspection → these fields expose **no** `organizationId` argument.
- **Violation signal:** the field accepts a client-supplied `organizationId` that differs from the token claim and returns that other org's data (cross-org data-isolation break).
- **Agents:** qa-backend-expert (xAPI schema + org-scoped resolution), qa-frontend-expert (`/company/members` consumer).
- **Source:** `tests/Sprint-current/VCST-5239/ac-analysis.md` AC11 (contract diff — arg dropped) + `test-execution-report-backend.md` AC11 (multi-org actor, no leak, PASS).
- **Triggered by:** VCST-5239 AC11 (GraphQL contract change / drift-risk cleared).

---

## Stale BL-* Flagged

### BL-B2B-005: Member role determines feature visibility
- **Current Rule (violation-signal line):** the violation-signal list includes *"role change not reflected until re-login."*
- **Observed behavior:** VCST-5239 AC3 verified that permission re-derivation **is** relogin-gated by design (permissions are recomputed at token issuance; an open session does not update live). So "not reflected until re-login" is the **intended** model for a role change, not a violation.
- **Source:** `ac-analysis.md` AC3 + `test-execution-report-frontend.md` AC3 (relogin-gating PASS); proposed **BL-AUTH-014** above.
- **Suggested action:** **narrow scope** — remove/reword the "role change not reflected until re-login" clause in BL-B2B-005's violation signal so it doesn't contradict the relogin-gated model. (The original clause was aimed at the VCST-5028 org-switch bug where `pageContext` returned `[]` after an org-switch *within a fresh token* — that stale-within-a-valid-token case is the real violation, distinct from "requires a new token".) If retained, it must be qualified to "…within the same issued token / after org-switch," not "requires relogin."

---

## Application Notes

1. Assign final IDs by reading `knowledge/oracles/business-logic.md` for the next available `BL-AUTH-NNN` / `BL-CROSS-NNN` sequence (AUTH → 014; CROSS → 013 today — reconfirm at promotion).
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste each approved entry into the correct domain section of `business-logic.md`.
4. **BL-AUTH-014 depends on nothing.** **BL-CROSS-013** and the **BL-B2B-005 stale narrowing** are independent — approve/edit each separately.
5. If EPIC-5239-03 (server-side whitelist enforcement) is accepted as a product decision, **BL-AUTH-005 must also be updated** — its current text explicitly says the whitelist is NOT server-enforced ("Do NOT treat a non-whitelisted-role assignment as a 403/security case unless a server boundary is later added"). Shipping story 03 IS that "later added" boundary; the BL clause would flip. (Not proposed here — it is contingent on the product decision, not current behavior.)
6. After entries land, re-run any related `/qa-review-tests suite <ID> --verify` so cases gain their `Business_Rule` mapping.
