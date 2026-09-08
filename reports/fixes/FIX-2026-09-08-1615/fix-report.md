# FIX-2026-09-08-1615 — VCST-5916 — Gate 0 BAIL (out of auto-fix scope)

**Ticket:** VCST-5916 (Bug · To do · Medium) — *Points history: "Operation" column is blank for every mission-granted points row*
**Local report:** `reports/bugs/open/medium/BUG-points-history-operation-blank-for-mission-grants-VCST-5916.md`
**Outcome:** **BAIL at Gate 0** — no clone, no branch, no PR. Ticket left at **To do** for a human.

## Phase 0 — Pre-flight: PASS

| Check | Result |
|---|---|
| Tracker resolve (`jira` / VCST) | PASS — Bug, `To do`, Medium |
| Local `/qa-bug` report | PASS — present, carries a complete Fix Routing block |
| Build verify (`buildVerify.source: vc-deploy-dev`) | Satisfied from the live deployment read earlier this session: `VirtoCommerce.Loyalty 3.1006.0`, `VirtoCommerce.Xapi 3.1020.0`, storefront theme `2.57.0` |
| Run dir | `reports/fixes/FIX-2026-09-08-1615/` |

## Gate 1 — route (resolved, recorded, not acted on)

Resolved for the record even though Gate 0 bails first, because the human handoff needs it:

- **Repo:** `VirtoCommerce/vc-module-loyalty` — allowlisted in `profile.repos.platform` (`kind: "module"`)
- **repoKind:** `module` → developer agent would be `fullstack-backend`
- **Sub-app override:** none — `moduleFrontendSubApps` declares only `vc-module-pagebuilder`
- **Gate 1b (frontend provenance):** N/A — `projectType: platform`, `repos.client` empty
- **RCA anchor (confirmed by read, not guessed):** `src/VirtoCommerce.Loyalty.ExperienceApi/Extensions/DataLoaderContextAccessorExtensions.cs` → `LoadLoyaltyObject()`

Routing is **not** the problem. The route is unambiguous and confidence is HIGH.

## Gate 0 — BAIL: the fix is ambiguous in a way that matters

There are **two different fixes** behind this one ticket, and nothing in the ticket, the docs, or the
code says which one is wanted. They are not variants of each other — one forecloses the other.

**(a) Stop the blank.** Add a `"LoyaltyMissionProgress"` arm returning a friendly `Type`, mirroring the
existing `nameof(ApplicationUser) => … Type = "Registration"` precedent, then map that constant to an
i18n key in the storefront. Small, and the in-repo precedent makes the *shape* unambiguous.

**(b) Close the invariant.** Expose *which mission* granted the points. `LoyaltyOperationLogObject`
(Core) carries **only** `Type` / `OrderId` / `OrderNumber` — verified by reading it — so this needs a new
Core property **plus** a field on the published `LoyaltyOperationLogObjectType` GraphQL type **plus** a
mission-progress → mission loader, then the storefront to render the name.

### Why picking (a) unilaterally would be the wrong call

- **(a) does not satisfy BL-LOY-015** (`[P0-revenue]`, re-audited earlier this session). That invariant
  demands per-entity attribution — *which* mission — and a `"Mission reward"` label supplies none. So (a)
  removes the visible symptom while leaving a P0 invariant open, **and makes the ticket look resolved**.
  That is a worse end state than the blank cell, which at least advertises the gap.
- **The label text is an unmade product decision.** "Mission", "Mission reward", or the mission's name?
  The bug report itself had to hedge ("the mission's name, or at minimum a localized label"). VirtoOZ is
  order-centric and silent on missions, so no doc settles it.
- **(a) is genuinely two repos.** The precedent it copies is a two-repo pattern: the resolver returns the
  constant, `vc-frontend` maps it to `loyalty.points-history.<key>`. Module-only would leave an
  **unlocalized English literal** in a customer-facing column on a storefront that ships DE/RU locales —
  a new, smaller defect traded for the old one. Gate 1's one-repo rule is not satisfiable without
  choosing to ship that.
- **(b) is a schema-surface change**, which is outside "smallest correct change to production code".

Gate 0's BAIL criteria this trips: **ambiguous** (primary) and, for variant (b), **breaking-ish scope /
needs design**. Per `quality-gates.md` the BAIL happens **before any clone** — none was made.

## Gates not reached

Gate 2 (reproduce) · Gate 3 (fix) · Gate 4 (review) · Gate 5 (CI) · Gate 6 (E2E) · Gate 7 (stop) — all
**NOT RUN**. No workspace, no branch, no PR, no CI. Nothing to revert.

## Handoff — what a human needs to decide

One question: **should the Operation column name the mission, or just say it was a mission?**

- *"just say it was a mission"* → variant (a), 2 small PRs (`vc-module-loyalty` resolver arm +
  `vc-frontend` constant/i18n/branch). File a separate ticket to keep BL-LOY-015 open, or this ticket
  closes over a live P0 invariant.
- *"name the mission"* → variant (b); needs a design note on the Core/xAPI field before code. This is the
  variant that actually closes BL-LOY-015.

Both are single-repo-per-PR and would be re-eligible for `/qa-fix` **once the label decision is
recorded on the ticket** — the blocker is the decision, not the difficulty.
