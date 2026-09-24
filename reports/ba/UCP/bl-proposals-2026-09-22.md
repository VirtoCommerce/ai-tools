# BL proposals — UCP (Agentic Commerce), 2026-09-22

Axis `bl`, scope `domain ucp` → `BL-UCP` (business-logic.md **Domain 25**). Run from `/qa-review-oracles ucp`.

**Nothing was applied to the oracle.** All four candidates below are **UNGROUNDED** — the Docs axis produced
no evidence and does **not** qualify for the §1a `N/A` allowance (reasoning in the audit report). Per the
evidence bar, UNGROUNDED ⇒ not confirmed ⇒ this file. They are recorded here so the evidence is not lost.

**The value gate is NOT what is holding these.** Read the gate verbatim: business value `high`
(`P0-security`) **promotes at any demand** — *"uncited means untested, not unimportant."* All four are
`P0-security` with zero citing cases, and the gate would say APPLY. `oracles:rank --explain=BL-UCP-001`
refuses to score them (*"neither an entry nor a cited id — nothing to score"*), which is the ranker
reporting zero demand, not a HOLD. **The blocker is the evidence bar, not value.**

| Value (business · product → label) | All four |
|---|---|
| business `high` (P0-security) · product `none` (0 citing cases, 0 dangling `BL-UCP-*` refs corpus-wide) | **`high`** → gate says APPLY, evidence bar says wait |

---

## Candidates

### PROPOSED-BL-UCP-001 — A handoff session is single-use, and only SUCCESS consumes it `[P0-security]`
- **Rule (draft):** A minted `ucp_session` may be restored exactly once. A **successful** restore removes
  the cache entry; a **failed** restore (400 / 401 / 403) does **not** consume it — which is what makes a
  client's anonymous-first-then-authenticated-retry strategy legal rather than a token burn.
- **Source:** `UcpCheckoutService.RestoreHandoffCore` — `RemoveHandoffSession` runs only after the cart
  fetch succeeds. Read at vc-module-ucp#7 @`612c78b`.
- **Live {OBSERVED} 2026-09-22:** replay after a successful restore → `400 invalid_request
  "ucp_session is invalid or expired."`; and a cross-buyer 403 did **not** consume the token — the owner
  then restored the same token → 200.
- **Docs:** absent. See the audit report for why this is UNGROUNDED rather than `N/A`.

### PROPOSED-BL-UCP-002 — Buyer and organization identity derive ONLY from the validated Platform token `[P0-security]`
- **Rule (draft):** For every UCP operation, `buyer_id` and `organization_id` are resolved from the
  validated Platform `ClaimsPrincipal` alone. No tool argument, payload field or request header may
  override either; an attempt is refused `403 buyer_context_mismatch`.
- **Source:** `UcpBuyerContextAccessor.cs` (new, 239 lines) — `RejectLegacyBuyerHeaders`, plus the
  authenticated buyer/org match check; `UcpCartService.EnsureCartOwnership` applies the same test per read.
- **Live {OBSERVED}:** spoofed anonymous `buyer_id`, a foreign real `buyer_id`, and legacy
  `X-Buyer-User-Id` / `X-Buyer-Organization-Id` headers each rejected `403 buyer_context_mismatch`
  (2026-09-17, re-confirmed 2026-09-22).
- **Docs:** absent.

### PROPOSED-BL-UCP-003 — A handoff is bound to the minting BUYER, not merely to the organization `[P0-security]`
- **Rule (draft):** A `ucp_session` may be restored only by the buyer who minted it. Membership of the
  same organization is **not** sufficient; a different buyer inside the same org is refused `403`.
- **Source:** `UcpCheckoutService.RestoreHandoffCore` — `buyerContext.PublicBuyerId != payload.BuyerId`
  throws `BuyerContextMismatch` / 403.
- **Live {OBSERVED} 2026-09-22:** minted as `ACME_ADMIN`, restored as `ACME_BUYER` — **the same
  organization**, `link_buyer_identity` returns an identical `organization_id` — refused
  `403 buyer_context_mismatch`. This is the stronger of the two readings and was measured explicitly
  rather than inferred. **Historically violated:** the same probe returned `200` on 2026-09-17.
- **Docs:** absent.

### PROPOSED-BL-UCP-004 — An anonymous restore carrying an organization is refused `[P0-security]`
- **Rule (draft):** A restore performed anonymously whose payload carries a non-null `organization_id`
  is refused `403` — an unauthenticated caller can never assert organization context.
- **Source:** `UcpBuyerContextAccessor.cs` — throws `BuyerContextMismatch`/403 on an anonymous request
  carrying an `organization_id`, and on a non-anonymous-shaped buyer id in anonymous mode.
- **Live:** source-anchored this run; **not independently re-observed live on the current build** — the
  weakest of the four on the Live axis. Do not promote this one without a fresh `{OBSERVED}` result.
- **Docs:** absent.

---

## Excluded — not new invariants (name the redirect, per the command's Excluded section)

| Candidate | Why excluded | Redirect |
|---|---|---|
| "A UCP tool called with a missing required argument returns a structured error naming the field, never an unhandled error" | **DUPLICATE in substance.** `BL-AUTH-017` already states that an endpoint accepting a body must validate required fields *before* touching any downstream lookup and return 400, never an unhandled 500, with no stack trace leaked. The UCP observation (incl. the nested `line_items[].product_id is required.` case and unknown-`store_id`-returns-a-store-error) is that invariant holding on a new transport — evidence **for** `BL-AUTH-017`, not a new rule | Cite `BL-AUTH-017`; if the MCP transport needs calling out, that is an `Amended:` note on BL-AUTH-017, not `BL-UCP-00n` |
| "A minted handoff is restorable by its owner on the first attempt" | **Non-invariant class.** This is an availability/deployment property (it requires a shared `IDistributedCache` across replicas), not a business rule about correct outcomes. It cannot be stated env-agnostically, which the oracle requires | Deployment guidance + the `094` observability suite; the domain map's D3/G3 rows already carry it |

---

## Promotion trigger — what has to change before these are applied

1. **vc-module-ucp#7 merges** (with vc-platform#3108 and vc-frontend#2467). Until then the surface is
   unmerged and **observably moving**: this environment's build changed twice on 2026-09-22 alone, and
   `PROPOSED-BL-UCP-003`'s own behaviour flipped `200 → 403` between builds. IDs are a permanent citation
   contract and a retired id may never be reused, so promoting off a moving surface burns ids on
   behaviour that may still change. Domain 25's preamble already records this as the standing reason.
2. **A Docs axis exists, or the `N/A` judgment is made deliberately by a human.** Once UCP ships, VirtoOZ
   should carry it; a released behaviour VirtoOZ does not document is itself a finding (CLAUDE.md
   §Essential Rules). Until then §1a's *"when in doubt, UNGROUNDED, not N/A"* governs.
3. **`PROPOSED-BL-UCP-004` additionally needs a fresh live observation** on the build being promoted from.

No ECL section is proposed: no existing section covers agentic commerce as a surface, and the candidates
above are invariants (what correct looks like), not boundary/failure *patterns*. An `ECL` chapter for
agent-driven commerce is a separate proposal and should follow the invariants, not precede them.
