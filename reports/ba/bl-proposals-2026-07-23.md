# Business Logic Proposals — 2026-07-23

These are drafts. They are NOT applied to `knowledge/oracles/business-logic.md`.
Review, edit as needed, assign the final `BL-*` ID, and commit manually.

## New Invariants Proposed

### PROPOSED-BL-CROSS-011: XCart read-cache invalidates on any CartChangedEvent, not only xAPI-originated writes `[P1-data]`
- **Rule:** The XCart `CartAggregate` read-cache MUST be invalidated whenever a cart is changed by **any** writer (xAPI mutation, the platform REST Cart API `/api/carts`, or any future writer that raises `CartChangedEvent`) — not only via xAPI's own `SaveAsync`/`RemoveCartAsync` path.
- **Verify:** Prime the xAPI `cart` cache → mutate the same cart via REST `/api/carts` → a subsequent xAPI `cart` query reflects the change (bounded by BL-CROSS-009's ≤120s window; event-driven, so effectively immediate).
- **Violation signal:** an xAPI `cart` query returns stale data after an external (non-xAPI) cart write.
- **Agents:** qa-backend-expert (xAPI + REST), test-management-specialist (regression case `CRX-GQL-101`)
- **Source:** VCST-5505; vc-module-x-cart PR #135 (`CartChangedEventHandler`); live reproduction 2026-07-23 (the environment, XCart 3.1026.0 — the *violation* was confirmed; the *fixed* behaviour is not yet live-verifiable).
- **Triggered by case(s):** `CRX-GQL-101` (050b4)
- **Refines:** BL-CROSS-009 (bounded eventual consistency) — this is the specific cross-writer cache seam.

**Why drafted, not auto-applied (Phase 4c evidence bar):** the 3-source bar (docs + live + source) requires unanimity. **Source** is CONFIRMED (PR #135 diff). **Live** confirms only the *violation* on the deployed build (XCart 3.1026.0) — the invariant *holding* cannot be verified live until PR #135 deploys. **Docs** do not state cache-invalidation at this granularity. So it is not unanimously CONFIRMED → drafted here. **Re-run `/qa-review-bl BL-CROSS-011` (or the lifecycle) once PR #135 is live** — the fixed-state can then be observed and the invariant auto-applied.
