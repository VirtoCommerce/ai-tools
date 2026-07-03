# VCST-5126 — UCP MVP · Demo Script (copy-paste prompts)

A conversational walkthrough of the Universal Commerce Protocol on **vcst-qa**. Just type each **You say** line to Claude (with the `vc-ucp` MCP server connected) — Claude does the rest. The only browser click is the checkout link at the end.

**Before you start (presenter notes):**
- Store: **`B2B-store`** (printers, in stock). If Claude asks which store, say *"Use the B2B-store"*.
- This catalog is electronics/printers. Prices are real.
- Demo runs entirely in chat; one link-click at the end opens the real storefront.
- ~5 minutes. Each step builds on the last — run them in order.

---

## Scene 1 — "What can this store do?"
> **You say:** *"I'd like to shop at this store. What can you help me do here?"*

**Expect:** Claude discovers the store's capabilities — search, cart, checkout, order tracking — and that you can pay via hosted checkout. Sets the stage that Claude is now your shopping assistant.

## Scene 2 — Find a product (natural language, with a budget)
> **You say:** *"I need a printer for the office, but keep it under $150."*

**Expect:** A short list of real printers under $150 (e.g. **Epson WorkForce WF-2750 – $99.99**, **Xerox WorkCentre 3335DNI – $99.99**, **Epson WF-3620 – $106.28**). Claude shows names + prices, not raw data.

## Scene 3 — Ask about one
> **You say:** *"Tell me more about the Xerox WorkCentre 6515 — is it in stock?"*

**Expect:** Claude pulls product detail — price **$549.00**, in stock, key specs (color laser, Printer, 10.2" panel). Good "it really knows the catalog" moment.

## Scene 4 — Build the cart
> **You say:** *"Great — add one Xerox WorkCentre 6515 to my cart."*

**Expect:** Cart created with the Xerox at $549.00; Claude shows subtotal **$549.00** and tax. (Behind the scenes it remembers your cart for the rest of the chat.)

> **You say:** *"Actually, make it three of them."*

**Expect:** Quantity updates to 3 → line total **$1,647.00**, order total around **$1,976.40** with tax. Claude confirms the new total.

### Optional "wow" — show the guardrails (skip if short on time)
> **You say:** *"Also add one Epson WF-2750."*

**Expect:** Claude reports the store's **minimum-order rule** — "you can order from 2 to 4 of that item" — and offers to add 2 instead. (Shows real business rules flow through to the agent.)

> **You say:** *"Okay, add two of those."*

**Expect:** Second line added, totals recalculated correctly.

## Scene 5 — Check out (give the address in plain English)
> **You say:** *"Let's check out. Ship it to Jane Doe, 400 Broad St, Seattle, WA 98109, USA — her email is jane.doe@example.com."*

**Expect:** Claude resolves the country/state, applies the address, and prepares checkout. *(Note: it may also ask you to confirm the ZIP — that's a known cosmetic quirk; just confirm "98109".)*

## Scene 6 — Payment options
> **You say:** *"What can I pay with?"*

**Expect:** Claude offers **hosted checkout** (you'll finish payment securely in the store). Card/Google Pay are shown as not-yet-available in this MVP.

## Scene 7 — The handoff (the key moment)
> **You say:** *"Perfect — take me to checkout to pay."*

**Expect:** Claude returns a secure **checkout link** (`…/checkout?ucp_session=…`). **Click it.** The real Virto storefront opens with your exact cart already loaded — 3× Xerox, $1,976.40, your Seattle address filled in. You finish payment in the normal store UI. This is the whole point: the AI assembled everything; the store handles money.

## Scene 8 — Track the order (after paying)
> **You say:** *"I've paid — where's my order?"*

**Expect:** Claude tracks your order by the cart it created — no need to dig up an order number — and reports status, items, totals, and shipping.

> Or, if you have a number handy: *"Track order CO260625-00018."*

---

## If something goes sideways (live-demo safety net)
- **Claude asks which store** → "Use the B2B-store."
- **Claude asks for the ZIP again** → just repeat "98109" (cosmetic; the store already has it).
- **A product looks out of stock** → that's the `Electronics` store's phones; stay on `B2B-store` printers.
- **Coupon** → don't demo a discount code on this environment (none is seeded).
- **B2B contract pricing / purchase-order payment** → not in this MVP build; stick to the B2C flow above.

## Real data this script relies on (vcst-qa, verified 2026-06-25)
| Used in | Product / value | Price |
|---|---|---|
| Scene 2 | Epson WF-2750, Xerox 3335DNI | $99.99 |
| Scene 3–4 | Xerox WorkCentre 6515/DN | $549.00 |
| Scene 4 optional | Epson WF-2750 (min order 2) | $99.99 |
| Scene 8 | sample order number `CO260625-00018` | — |

> Catalog drifts — if a product name changes, just let Claude re-search ("find me a printer…"); the demo doesn't depend on fixed IDs.
