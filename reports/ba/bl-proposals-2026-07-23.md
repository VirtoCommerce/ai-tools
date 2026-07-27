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

---

## Sales Rep Customer Communication (VCST-5310)

> Source: `/ba-analyze docs sales developer` run `2026-07-23` — see `reports/ba/ba-report-2026-07-23.md`.
> Consolidates the earlier named `PROPOSED-BL-SR-COMM-*` drafts (CHANNEL / AUDIENCE / NOOP / SCOPE /
> VALIDATION / UI / RESILIENCE) surfaced during VCST-5310 testing into five numbered invariants.
> There are **no** existing `BL-SR*` (Sales Rep) invariants in `knowledge/oracles/business-logic.md` today; all five below are net-new.

### PROPOSED-BL-SR-COMM-01: Membership-scoped send `[P0-revenue]`
- **Rule:** `sendCustomerCommunication` must return `false` and dispatch nothing when the caller does not hold an active, unlocked, sales-rep-granting membership in the target `organizationId`. Anonymous callers receive an authorization error. A rep can only message organizations they actually serve.
- **Verify:**
  - As a rep serving org A but not org B, call the mutation for org B → `false`, no PushMessage / email created.
  - Anonymous call → `errors[]` non-empty (authorization).
- **Violation signal:** a rep messages an org they don't serve; recipients receive a broadcast from an unauthorized rep.
- **Agents:** qa-backend-expert
- **Source:** vc-module-sales-rep PR #3 `SendCustomerCommunicationCommandHandler.Handle` (`ServesOrganizationAsync` gate, inherited from `SalesRepQueryHandlerBase`); live-verified vcst-qa 2026-07-23 (050m SR-GQL-046).
- **Triggered by:** `/ba-analyze docs` — VCST-5310 developer doc.

### PROPOSED-BL-SR-COMM-02: Single resolved audience for both channels `[P1-data]`
- **Rule:** Within one call, push and email must be fed from the **same** recipient set, resolved exactly once via `ISalesRepRecipientResolver`. No channel-specific audience drift.
- **Verify:** both-channels send → the PushMessage `memberIds` set and the set of `SalesRepMessageEmailNotification` recipients (those with an email) derive from the same resolved members.
- **Violation signal:** push reaches a different population than email for the same call.
- **Agents:** qa-backend-expert
- **Source:** PR #3 handler (recipients resolved once, then fed to both channels); backend component test `SendCommunication_BothChannels_DeliverToSameRecipients`; live vcst-qa 2026-07-23.
- **Triggered by:** VCST-5310.

### PROPOSED-BL-SR-COMM-03: Initiator (sending rep) excluded from recipients `[P1-data]`
- **Rule:** The calling rep must never appear in their own broadcast's recipients, even when they are a member of the target org. If exclusion empties the recipient set (rep is the only member), the mutation returns `false` and dispatches nothing.
- **Verify:**
  - Multi-member org → created PushMessage `memberIds` excludes the rep's own Contact; all other members included.
  - Rep-only served org → `false`, no dispatch.
- **Violation signal:** a rep receives their own message; a rep-only org returns `true` / dispatches a self-message.
- **Agents:** qa-backend-expert
- **Source:** PR #3 commit `6d918d82` "Initiator exclusion from recipients list" (`ExcludeInitiatorAsync`); live-verified vcst-qa 2026-07-23 (ACME memberIds 11 of 12, rep absent; ORG_REP_ONLY → false) — 050m SR-GQL-054 / SR-GQL-052.
- **Triggered by:** VCST-5310 (fixes the earlier self-broadcast question).

### PROPOSED-BL-SR-COMM-04: Channel isolation & independent fan-out `[P1-data]`
- **Rule:** Selecting one channel must not produce the other (push-only creates no email; email-only creates no push), and a delivery failure in one channel must not abort or roll back the other. Email fans out one notification per member that has an email address; push creates one PushMessage addressed to the resolved members.
- **Verify:** push-only → ≥1 PushMessage + 0 `SalesRepMessageEmailNotification`; email-only → 0 PushMessage + one email per email-eligible member.
- **Violation signal:** a cross-channel leak (email created on a push-only send, or vice-versa); one channel's failure suppresses the other.
- **Agents:** qa-backend-expert
- **Source:** PR #3 handler (`TryDispatchAsync`, `dispatched |= …`, per-channel try/catch); backend tests `SendCommunication_PushOnly_DoesNotSendEmail` / `_EmailOnly_DoesNotCreatePush`; live cross-check vcst-qa 2026-07-23 (050m SR-GQL-043/044).
- **Triggered by:** VCST-5310.

### PROPOSED-BL-SR-COMM-05: Message validation & zero-channel no-op `[P1-data]`
- **Rule:** `message` is required (empty/whitespace rejected with "Message is required.") and capped at 1000 characters (">1000 → "Message must not exceed 1000 characters."). Requesting neither channel (`sendPush=false, sendEmail=false`) is a valid **no-op** returning `false` — not an error. URLs in the message are preserved.
- **Verify:** empty message → validation error; 1001 chars → validation error; neither channel → `false`, no dispatch; URL in message → accepted, dispatched.
- **Violation signal:** an empty or over-length message is dispatched; a zero-channel call surfaces as an error instead of a clean no-op.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** PR #3 handler guards (`IsNullOrWhiteSpace`, `MaxMessageLength=1000`, neither-channel early return); vc-frontend PR #2392 modal (`string().trim().required().max(1000)`, ≥1-channel rule); live vcst-qa 2026-07-23 (050m SR-GQL-045/048/049/050).
- **Triggered by:** VCST-5310 (includes the PR #2392 whitespace-message review fix).

**Application notes (SR-COMM):**
1. Assign final IDs by reading `knowledge/oracles/business-logic.md` for the next available `BL-SR-NNN` (or a chosen Sales-Rep domain prefix) — the repo has no Sales-Rep domain block yet, so this may open a new section.
2. Replace the `PROPOSED-BL-SR-COMM-` prefix with the final ID and paste into the correct domain section.
3. After the entry lands, re-run `/qa-review-tests suite 050m --verify` so the messaging cases (SR-GQL-042…054) gain their `Business_Rule` mapping — several already reference `PROPOSED-BL-SR-COMM-*` and should be updated to the final IDs.
