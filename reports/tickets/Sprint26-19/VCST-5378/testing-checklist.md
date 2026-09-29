# UCP — Agentic Commerce — Test Case Writing Checklist

> Ticket VCST-5378 · Round 1 of `--iterate --max-rounds 3` · 2026-09-22
> Build: UCP `3.1006.0-pr-7-612c` · Platform `3.1072.0-pr-3108-b6ef` · storefront `2.59.0-pr-2467-1951`
> Related suites: **none** — `094-ucp-observability` is the only UCP suite and 0 of its 23 cases touch
> the value chain. Priority: P0 (the handoff is the feature).

**Over the 6–15 band, deliberately.** This domain spans **three surfaces in one chain** — the MCP/REST
API (18 tools), the Platform OAuth leg, and the storefront restore leg — and a checklist that dropped
one of them would drop the link where the defects have actually been (F1 storefront, F2 OAuth, F5 API).
Sections are per chain link so a partial walk is still honest about what it skipped.

## ⚠ Oracle grounding — read before using this checklist

**This domain has ZERO invariants of its own.** `business-logic.md` Domain 25 (`BL-UCP`) is declared and
**deliberately empty**; no `ECL` section mentions UCP or MCP; `vc-bug-catalog` has 0 UCP entries; VirtoOZ
carries no UCP page. Every citation below is therefore either a **delegated** invariant from a
neighbouring domain (which does not know the handoff exists) or an `[OBSERVED]` ECL pattern whose shape
transfers. Items with no honest citation are marked `{SPEC}` + source, or `{OBSERVED}` + this run — per
§Oracle Grounding I do **not** invent a `BL-UCP-*` id to make an item look grounded.

Three promotion candidates for `/qa-review-oracles` (proposals, **not** citable yet): handoff single-use
+ TTL · `organization_id` derives only from the Platform token · anonymous-plus-organization ⇒ 403.

---

## L1 — Discovery (the agent finds out this store can be shopped)

- [ ] `GET /.well-known/ucp` and `get_store_capabilities` return the **same** MCP endpoint, and it is the
      host that can actually complete OAuth — check from **both** the Platform host and the storefront
      host, because they answered differently until this build {OBSERVED 2026-09-22}
- [ ] `get_store_capabilities.storefront_origin`, `endpoints.handoff_url_template` and
      `auth.authorization_server` all name one origin, and it matches the host that mints `continue_url`
- [ ] The tool count agrees across all three surfaces that publish one — `tools/list`,
      `get_store_capabilities.mcp_tools`, and `initialize.instructions` {OBSERVED: they do not, 18/17/16}
- [ ] `payment_handlers` has the same shape and contents in the discovery manifest and in
      `get_store_capabilities` {OBSERVED: `{}` vs a populated array of 3}
- [ ] Every operation in `endpoints.operations` that claims `status: available` actually answers (19 of
      them, incl. the `?cart_id=` order form), and no advertised header is inert {`X-Agent-Api-Key` is}

## L2 — Identity linking (the buyer says "use my account")

- [ ] `link_buyer_identity` with no token returns **401** plus a `WWW-Authenticate: Bearer` carrying
      `resource_metadata`, and that URL resolves to metadata naming a **grantable** resource (RFC 9728)
- [ ] The resource named in the challenge can actually mint a token — i.e. an OAuth app holds a matching
      `rsrc:` permission. A challenge pointing at an ungrantable resource is a dead end that looks correct
- [ ] After linking, `buyer_id` is the **Platform user id** and `organization_id` comes **only** from the
      token — a payload or tool argument must never override either (BL-AUTH-015)
- [ ] Legacy `X-Buyer-User-Id` / `X-Buyer-Organization-Id` headers are rejected **403**, and are no longer
      advertised in `headers.buyer_context`
- [ ] `logout_buyer` revokes the authorization **and its refresh tokens across other sessions** — confirm
      the blast radius matches the description before trusting it {SPEC: tool description}
- [ ] Anonymous requests stay anonymous: no login is demanded for ordinary public shopping (BL-CHK-001)

## L3 / L4 — Catalog and cart

- [ ] `search_products` returns real catalog content, not only `AGENT-TEST-*` fixtures — use a
      **live-discovered** term, never a hardcoded one (a prior literal returned 0 on a different catalog)
- [ ] An anonymous `create_cart` mints a buyer id matching `ucp-anonymous-<32 hex>` and that id is
      reusable for continuation
- [ ] `update_cart` takes the **complete desired line-item state, not a delta** — adding the same product
      twice raises quantity rather than creating a second line (BL-CART-007)
- [ ] `list_carts` is buyer-scoped: one buyer can never see another buyer's carts, and an org's cart never
      leaks across orgs (BL-CART-005, BL-B2B-001)
- [ ] Org-assigned price lists override the store default for members of that org (BL-B2B-002)
      — **BLOCKED on this environment:** 0 of 99 price-list assignments condition on the fixture org's
      groups, so org price == list price and this item is currently **undecidable, not passing**
- [ ] Stock that changes between assembly and resume surfaces as a conflict, not a silent sale
      (BL-CART-002, ECL-6.1)

## L4b — Anonymous → authenticated merge (**IRREVERSIBLE**)

- [ ] Replaying the saved anonymous `buyer_id` under an authenticated token merges via XCart `mergeCart`:
      items carried at the **same total**, source cart consumed, no orphan (BL-CART-008)
- [ ] Replaying **another** buyer's anonymous id is refused **403** — assert at the server with that
      buyer's own token, never by an absent button
- [ ] Running the merge twice is an idempotent no-op, not duplicated lines (ECL-5.1)

## L5 / L6 — Checkout and handoff mint

- [ ] `checkout.id == cart_id`, and checkout totals match the cart they were composed from
- [ ] `checkout_and_handoff` returns `continue_url` **at the top level**; `create_checkout` and
      `handoff_checkout` return two other envelope shapes — a client reading one path uniformly gets
      `undefined` from the other two. Walk **both** the one-step and two-step paths
- [ ] `status` wording does not tell every buyer their order needs approval. **The platform has no native
      per-order spending limit and no auto-approval status at all** — approval is quote-based
      (BL-B2B-004), so any "requires approval" reading is wrong at the platform level, not just UCP's
- [ ] `expires_at` is mint + the configured TTL, and the issued `continue_url` host matches the advertised
      `handoff_url_template`
- [ ] `get_payment_handlers` reflects what the store can actually do — on this env only `hosted_checkout`
      is `available`

## L7 — Storefront restore (where the buyer actually lands)

- [ ] **A fresh, never-opened `continue_url` succeeds on the FIRST attempt.** Measure over **≥10** fresh
      links and report `N/10` — a single success is not a measurement. Anonymous was ~49% and
      authenticated ~27% before the shared-cache fix {OBSERVED 2026-09-17}
- [ ] The authenticated path is measured **separately** from the anonymous one: restore is attempted
      anonymously first and retried on **401 only**, so the authenticated flow needs **two** successful
      lookups and fails worse when the cache is partitioned
- [ ] The buyer lands on `/cart/{cartId}?ucp_handoff=1` with the right line items, totals, addresses and
      **organization context**
- [ ] A restored link is **single-use**: replaying it returns 400. A *failed* restore does **not** consume
      it — that is what makes the anonymous-first retry legal
- [ ] 400 / 401 / 403 are distinct branches with distinct causes, and the buyer-facing banner does not
      conflate "expired", "already used" and "this pod doesn't have it" into one sentence (ECL-1.2)
- [ ] A different buyer restoring this handoff is refused **403** (it returned 200 before this build)
- [ ] An expired session (wait past TTL) is distinguishable from a cache miss — today both are 400 with
      the same message {OBSERVED, domain map G4}
- [ ] An unknown / forged token returns 400 and exposes no cart. The token is **opaque** — it carries no
      cart id, user id or signature to tamper with, so a "modify the signature" test is not runnable
- [ ] Sign-in required mid-restore preserves the original handoff as `returnUrl` and resumes after login
      (BL-AUTH-001, ECL-1.2)

## Error contract (the caller is an LLM, so this is a first-class surface)

- [ ] A missing required argument returns a structured `invalid_request` **naming the field**, never an
      unhandled error with only a trace id — including **nested** fields
      (`line_items[].product_id is required.`) (BL-AUTH-017)
- [ ] An unknown `store_id` returns a **store** error, not a misattributed currency error (BL-AUTH-017)
- [ ] An MCP tool failure returns a `tools/call` `isError` result with a usable Trace ID, not a JSON-RPC
      protocol error (ECL-14.1)

## Cross-layer verification

- [ ] Back office confirms the cart/checkout the agent built actually persisted, with the right owner
- [ ] No console errors on the handoff landing or on `/oauth/authorize`
- [ ] App Insights correlates one handoff end to end — `SetHandoffSession` → `GetHandoffSession` →
      `RemoveHandoffSession` for the same `vc.ucp.handoff.key_hash`, across pods
- [ ] No raw `ucp_session` token appears in any telemetry dimension, log or trace

---

**Oracle coverage.** Delegated `BL-*` cited: BL-AUTH-001, BL-AUTH-015, BL-AUTH-017, BL-B2B-001,
BL-B2B-002, BL-B2B-004, BL-CART-002, BL-CART-005, BL-CART-007, BL-CART-008, BL-CHK-001.
`[OBSERVED]` ECL cited: ECL-1.2, ECL-5.1, ECL-6.1, ECL-14.1.
**`BL-UCP-*` cited: NONE — the domain has none.** That is the finding, not an omission.

**Not covered, deliberately:**
- **Accessibility — EXCLUDED by operator decision (2026-09-22).** The `4v` visual lane ran and found two
  real, live-reproduced `BL-A11Y-*` defects (F1 High, F2 Medium); the operator scoped accessibility out of
  this task, so neither is filed, triaged or counted in the verdict. **This is an exclusion, not a clean
  audit** — the evidence is preserved in `design-report.md` for whoever picks a11y up on this surface.
  (Independently of the decision, `triage.md` §7a means a `BL-A11Y-*` finding never fails a functional
  ticket's verdict anyway.) The lane's UX **copy** finding on the handoff banner is not an accessibility
  finding and is retained.
- **The ChatGPT client variant (C15)** — the ticket carries a whole "QA Steps — ChatGPT" comment as a
  second de-facto AC set, and **nothing in the 10-comment thread shows it was ever executed**. It needs a
  ChatGPT Business/Enterprise workspace with developer mode, which this run does not have. Stated as
  uncovered rather than omitted: an absent section reads exactly like a passing one.
- **Order attribution** (the story's own promise) — no tool writes it and no field is identified; it is
  unwritable until Product answers. Belongs in the story, not here.
- **Payment and order placement** — UCP owns nothing past the handoff; belongs to storefront checkout.
- **Approval-rule enforcement** — BL-B2B-004 says the platform has no such gate; belongs to Quotes.
- **Assortment scoping** — blocked on the same fixture gap as org pricing; routed to `3a`.
- **Concurrency of the single-use guarantee** (domain map G7) — needs a parallel-request harness this
  run does not build; belongs to `/qa-exploratory`.
- **`[THEORETICAL]` ECL patterns** — by rule these are exploratory charter material, not checklist items.
