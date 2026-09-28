# UCP Agentic Commerce (MCP) — Developer Guide

UCP (Universal Commerce Protocol) exposes this store to AI shopping agents over MCP: an agent
discovers the store, shops the catalog, optionally links a real buyer identity via OAuth, checks
out, and hands the buyer off to the storefront to finish payment. This guide covers connecting to
the MCP endpoint, the tool surface, the handoff/restore contract, and the OAuth client setup that
lets an agent act as a signed-in B2B buyer. Platform-side setup lives in the companion
[UCP Agentic Commerce — Admin Setup Guide](vcst-5378-ucp-agentic-commerce-admin-guide.md).

!!! warning "This build is still moving"
    The environment this guide was verified against runs three **open, unmerged PR heads**
    (`feat/VCST-5378-unified-buyer-flow`) — not a released build. Tool-argument requirements have
    already changed twice during this ticket's own testing. Re-verify against `tools/list` before
    shipping an integration.

## Prerequisites

- An MCP-capable client (e.g. Claude Desktop with `mcp-remote`), or any HTTP client that can speak
  MCP's JSON-RPC `tools/call` envelope.
- The store's `store_id` (e.g. `{{STORE_ID}}`) — **now mandatory on every MCP `tools/call`**. Omitting it
  returns `400 missing_store_id` (`"store_id or context.store_id is required when
  UCP:DefaultStoreId is not configured"`).
- If you need an authenticated buyer session (B2B org pricing, org-scoped assortment, the buyer's
  saved cart): an OAuth client registered on the Platform — see **OAuth Client Registration** below.

## Quick Start

### Step 1: Discover the store
```
GET {{FRONT_URL}}/.well-known/ucp
```
Returns the MCP service endpoint. On this build it agrees with `get_store_capabilities` read from
**either** host (Platform or storefront) — `storefront_origin`, `auth.authorization_server` and
`endpoints.handoff_url_template` all name the storefront origin.

### Step 2: List the tools
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
```
Returns **18** tools on this build (the domain map recorded 17 — `logout_buyer` is the addition).

### Step 3: Shop anonymously
```json
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": {
    "name": "search_products",
    "arguments": { "store_id": "{{STORE_ID}}", "query": "<live-discovered term>" }
  }
}
```
No `Authorization` header required; returns real catalog SKUs.

```json
{
  "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": { "name": "create_cart", "arguments": { "store_id": "{{STORE_ID}}" } }
}
```
Mints an anonymous `buyer_id` matching `ucp-anonymous-<32 hex>`, reusable to resume the same cart
on a later call.

### Step 4: Link a buyer (optional)
```json
{
  "jsonrpc": "2.0", "id": 4, "method": "tools/call",
  "params": { "name": "link_buyer_identity", "arguments": { "store_id": "{{STORE_ID}}" } }
}
```
Requires a bearer token minted against `{{FRONT_URL}}/ucp/mcp` (see OAuth section). `buyer_id`
resolves to the Platform user id and `organization_id` comes **only from the token** — a forged
`organization_id` argument in the call is silently ignored, never trusted.

### Step 5: Checkout and hand off
```json
{
  "jsonrpc": "2.0", "id": 5, "method": "tools/call",
  "params": {
    "name": "checkout_and_handoff",
    "arguments": {
      "store_id": "{{STORE_ID}}",
      "buyer_id": "<required for anonymous continuation>",
      "shipping_address": { "line1": "...", "city": "...", "region": "..." }
    }
  }
}
```
`shipping_address` and, for an anonymous cart, `buyer_id` are **now required whenever the cart
carries no address**. The response carries `continue_url` (see envelope table below), host-matched to
`endpoints.handoff_url_template`, `expires_at` = mint time + the store's TTL (15 min on this
build).

### Step 6: Redeem the handoff
Open `continue_url`. A **fresh** link succeeds on the first attempt; an authenticated restore is attempted anonymously first and retried on
`401` only, so budget for **two** round trips on the authenticated path.

## OAuth Client Registration (one-time, Platform admin)

An MCP client that needs a real buyer identity (B2B pricing, org-scoped assortment) authenticates
through the same OAuth server the discovery manifest advertises. This setup is admin-side; the
full procedure is in the
[Admin Setup Guide](vcst-5378-ucp-agentic-commerce-admin-guide.md). In short:

1. The Platform's authorization config must include the MCP resource and the storefront's OAuth
   entry point:
   ```json
   { "Authorization": { "Resources": ["{{FRONT_URL}}/ucp/mcp"], "OAuthLoginPath": "/oauth/authorize" } }
   ```
   Confirmed live: `auth.authorization_server` and `/oauth/authorize` both resolve to the
   storefront origin. Restarting the Platform after the change is
   *configuration reference — not verified by the VCST-5378 run*.
2. An admin registers a **public** OAuth client (no `client_secret`) with permission
   `rsrc:{{FRONT_URL}}/ucp/mcp` and a redirect URI your client controls (e.g.
   `http://localhost:8766/oauth/callback` for `mcp-remote`).
3. Wire the client (e.g. Claude Desktop via `mcp-remote`) with the issued `client_id`, the
   redirect URI, and `--resource {{FRONT_URL}}/ucp/mcp` — the `mcpServers` block is in the Admin
   Setup Guide.

!!! note "Interactive sign-in not verified"
    Verification used a token obtained with the OAuth2 **password grant** directly against
    `POST {{FRONT_URL}}/connect/token`, and confirmed that token satisfies the same
    `rsrc:{{FRONT_URL}}/ucp/mcp` permission chain and authorization-server host. The interactive
    authorization-code flow through an actual `mcp-remote`/Claude Desktop client was not
    exercised — treat steps 2–3 above as configuration reference, not as verified behavior.

## Checkout envelope shapes — do not read one path uniformly

Three tools return `continue_url` at three different response paths; a client that reads one path
against all three silently gets `undefined` from the other two.

| Tool | Envelope | `continue_url` path |
|---|---|---|
| `create_checkout` | `{ ucp, checkout, messages }` | **absent** — no `continue_url` anywhere |
| `handoff_checkout` | `{ result, last_checkout, next_step_after_payment }` | `result.checkout.continue_url` |
| `checkout_and_handoff` | `{ ok, cart_id, buyer_id, checkout, handoff, continue_url, next_step_after_payment }` | `continue_url` (top level) **and** `handoff.checkout.continue_url` (both present, equal) |

`checkout.id == cart_id`; `create_checkout`'s snapshot total lives at
`checkout.cart.totals.total.amount` — the checkout object carries no top-level `total`/`totals`
field.

## Handoff restore — status matrix

| Condition | Response |
|---|---|
| Fresh, valid `continue_url`, correct buyer/anonymous | `200`, lands on `/cart/{cartId}?ucp_handoff=1` |
| Same link replayed | `400 invalid_request` — `"ucp_session is invalid or expired."` |
| Past TTL | `400 invalid_request` — **same message text** as an expired/replayed/forged token; the three are not distinguishable from the response alone |
| Unknown / forged token | `400 invalid_request` — same message; payload carries no cart id, buyer id or line data to tamper with |
| Different buyer, same org | `403 buyer_context_mismatch` — `"Buyer context does not match the authenticated Platform identity."` |

`logout_buyer` revokes the OAuth session but does **not** invalidate a
handoff minted before the call — a link stays fully redeemable after logout, and no tool currently
revokes one (`DELETE .../internal/handoff/<token>` → `404`).

## Error contract

A missing or invalid argument — including a nested one — returns `invalid_request` naming the
field, never a bare trace id:
```
create_cart {"line_items":[{}]}             → "line_items[].product_id is required."
search_products {"store_id":"NO-SUCH-STORE"} → "store_id does not identify an existing store."
```

## B2B pricing and assortment

For an authenticated org buyer: org-scoped contract products are invisible to an anonymous
`search_products` call and visible (with the negotiated price) once linked — verified against a
same-priced control product to isolate the effect. Replaying a saved
anonymous `buyer_id` under an authenticated token merges the cart via `mergeCart` at the same
total, consumes the source cart, and a second identical replay is an idempotent no-op. An authenticated `create_cart` call **upserts into the buyer's existing cart and
is not idempotent** — calling it twice with the same line raises the quantity rather than
returning a fresh cart or a no-op.

## Known limitations

- **An agent-supplied `shipping_address` overwrites the buyer's existing saved cart address**,
  rather than being scoped to the checkout snapshot — awaiting a product decision. Do not rely on
  the buyer's stored address surviving a `checkout_and_handoff` call that also passes an address.
- **Order-side attribution is not implemented** — no tool or order field currently records that a
  given order originated from an agent/UCP session.
- **A raw `ucp_session` handoff token has been observed leaving the browser in cleartext to a
  third-party analytics collector** and retained in platform telemetry — filed as VCST-6053
  (High), open. Do not log or forward the token value from client code pending a fix.
- An authenticated buyer restoring a handoff minted for an **anonymous** cart is refused with
  `403`, and `create_cart` on an unavailable product returns a `CART_PRODUCT_UNAVAILABLE`
  message rather than succeeding silently.
- Concurrent redemption of the same handoff token (two simultaneous restores) has not been
  verified.

## Conclusion

You now have enough to discover the store, shop and check out anonymously or as a linked B2B
buyer, mint and redeem a storefront handoff, and read the three checkout tools' differing response
shapes correctly. For the Platform-side setup in full, see the
[Admin Setup Guide](vcst-5378-ucp-agentic-commerce-admin-guide.md). For the domain's full surface
map and open gaps, see `.claude/knowledge/domain/ucp.md`.

---
*Sources: VCST-5378 verification on the QA environment. VirtoOZ carries no UCP page — every claim above is observed live or taken from the module's own tool descriptions.*
