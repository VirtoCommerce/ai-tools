# Demo 1 — AI-Native Conversational Buying & Autonomous Reordering (vcst-qa)

---

## Environment

| Field | Value |
|-------|-------|
| Storefront URL | https://vcst-qa-storefront.govirto.com |
| Admin URL | https://vcst-qa.govirto.com |
| Store | `B2B-store` |
| Admin login | `admin` / *(see `.env.local` → `ADMIN_PASSWORD`)* |
| Storefront login | `test-john.mitchell-20260310@test-agent.com` / `TestPass123!` |
| Customer | **John Mitchell** (org: Org-TechFlow-20260310) |
| Currency | USD |
| Address on file | 1200 Commerce Blvd, Suite 400, New York NY 10001 USA |

---

## Customer profile

| Field | Value |
|-------|-------|
| Email | `test-john.mitchell-20260310@test-agent.com` |
| Password | `TestPass123!` |
| User ID | `143bc845-7ba3-4982-ae9a-a9446a399705` |
| Contact ID | `d0f765ba-3d2d-4f4e-a4b4-e3306e153178` |
| Organization | `AGENT-TEST-Org-TechFlow-20260310` (`6fb516c1-07f3-4af4-be5e-35961e3f7993`) |
| Role | Organization maintainer (admin) |
| Storefront entry | `/account/orders` shows all 27 orders below |
| Order detail URL pattern | `/account/orders/{orderId}` — orderId is the **GUID**, not the order number. Example: `CO26050800121` → `https://vcst-qa-storefront.govirto.com/account/orders/7a8ee7fd-c6ca-4e91-bf1d-a16c763aa19a` |

---

## Catalog — 21-SKU pool from John Mitchell's order history

Aggregated from **all 27 of John's orders on vcst-qa** (3 pre-existing 2026-04-21 + 20 seeded 2026-05-08 + 1 carriage-bolt order 2026-05-11 + 3 backdated historical carriage-bolt orders Apr 13 / Apr 27 / May 04). **Bold** rows are recommended star products for each sub-scenario.

> **Source:** [test-data/b2b/john-mitchell-skus-vcst.json](../../test-data/b2b/john-mitchell-skus-vcst.json) — re-generate with `node scripts/extract-john-skus-vcst.js`.

| # | SKU | Product | Price | In orders | Total units | Demo role |
|---|-----|---------|------:|---------:|------------:|-----------|
| 1 | ALCOE1423 | JIANWU Mini 3-ring Loose-leaf Notebook (Kawaii) | $99.99 | 5 | 35 | Notebook family |
| 2 | **ALCOE8887** | 24/12PCS Color Gel Pen Refill Set, 0.5mm | $99.99 | 5 | 35 | **★ 1b — gel pens, recurring consumable** |
| 3 | ALCOE2839 | Teclast F7 Plus 2 14.1" Laptop, Windows 11 | $99.99 | 5 | 33 | (Test pricing — odd at $99.99 for a laptop) |
| 4 | ALCOE3672 | iPad Air / iPad Pro 9.7" Case | $99.99 | 4 | 19 | |
| 5 | ALCOE0637 | Yoofun 94pc Vintage Material Paper Pack | $99.99 | 3 | 16 | |
| 6 | ALCOE2465 | A4/A5/A6 Coil Notebook (Lined/Dot/Grid) | $99.99 | 3 | 14 | Notebook family |
| 7 | 8010073 | SHOT | **$0.00** | 3 | 3 | ⚠ price anomaly — skip for demo |
| 8 | ALCOE2047 | Bestoss Nvme M.2 SSD 1Tb / 256Gb (DIY Gaming) | $100.00 | 3 | 3 | Alt SSD brand |
| 9 | ALCOE8132 | 50-sheet Ins Style Sticker Book (Washi) | $99.99 | 2 | 20 | Sticker family |
| 10 | ALCOE0482 | Bview Art Watercolor Tins Palette Paint Case | $99.99 | 2 | 15 | |
| 11 | ALCOE8282 | 10pc Paper Card Flower Mirror Hollow Frame Stickers | $99.99 | 2 | 14 | Sticker family |
| 12 | ALCOE7716 | ERYING DIY Gaming PC Motherboard Kit (i9 12900HK) | $99.99 | 2 | 12 | (Test pricing — odd at $99.99 for an i9 kit) |
| 13 | ALCOE6923 | Mr.paper Vintage Butterfly Sticker Box | $99.99 | 2 | 11 | Sticker family |
| 14 | ALCOE3675 | JIANQI 100pc Vintage Material Paper | $99.99 | 2 | 7 | |
| 15 | ALCOE2124 | 10/50pc Cartoon Country Stickers (waterproof) | $99.99 | 1 | 7 | Sticker family |
| 16 | ZQY-49234025 | Kingston KC3000 PCIe 4.0 NVMe M.2 SSD — 1Tb | $111.39 | 1 | 5 | SSD alt — capacity swap |
| 17 | ALCOE5866 | A5 PU Leather Business Notebook | $99.99 | 1 | 4 | Notebook family |
| 18 | LIU-65067964 | Kingston KC3000 PCIe 4.0 NVMe M.2 SSD — 512Gb | $80.27 | 1 | 2 | SSD alt — capacity swap |
| 19 | **`164W33`** | **Carriage Bolt 1" Steel, 1/4"-20, 1300 PK** | **$17.00** | **4** | **120** | **★ 1a + ★ 1b — primary hex-bolt variant; real weekly consumption pattern (30/40/25/25)** |
| 20 | **`164W34`** | **1-1/4" Steel Carriage Bolt, 5/16"-18, 700 PK** | **$43.44** | 2 | 20 | **★ 1a "swap to" — larger size variant; also appears in Apr 27 historical** |
| 21 | **`164W48`** | **1/2" Steel Carriage Bolt, 1/4"-20, 1800 PK** | **$102.88** | 1 | 10 | **★ 1a 3rd variant — bulk pack** |

### Product families available

- **Carriage Bolts** ⭐ — 3 variants in one order (`CO26050800121`, May 11 2026, $2,115 total): `164W33` 1" 1300 PK ($17) · `164W34` 1-1/4" 700 PK ($43.44) · `164W48` 1/2" 1800 PK ($102.88). **Best fit for 1a** — matches the original brief's hex-bolt narrative (size + thread + pack-size swap dimensions, real industrial pricing spread $17→$103).
- **Kingston KC3000 SSDs** — 2 capacity variants: `ZQY-49234025` 1Tb ($111.39) · `LIU-65067964` 512Gb ($80.27). Backup family for 1a — real-world capacity-swap.
- **Notebooks** — 3 variants: `ALCOE1423` Mini Loose-leaf · `ALCOE2465` Coil · `ALCOE5866` PU Leather (all $99.99). Tertiary backup.
- **Stickers** — 4 variants: `ALCOE2124` Cartoon · `ALCOE6923` Butterfly · `ALCOE8282` Flower · `ALCOE8132` Washi (all $99.99).

> **Note on `8010073` SHOT** — appears in the 3 pre-existing April orders at $0.00, likely a sample/promo SKU. Don't use in demo prompts.

---

## Order history — 27 orders for John Mitchell (vcst-qa)

3 pre-existing orders dated 2026-04-21 + 20 orders dated 2026-05-08 (seed batch) + 1 carriage-bolt order dated 2026-05-11 + 3 historical bolt orders **targeting** Apr 13 / Apr 27 / May 04 (see caveat below). Currency USD.

> **Full per-order detail with line items:** [john-mitchell-orders-vcst-2026-05-11.md](john-mitchell-orders-vcst-2026-05-11.md)

> **`createdDate` caveat for the 3 historical bolt orders.** VC's order-creation API treats `createdDate` as a system-managed audit field; the 3 backdated orders (`CO260413-00091`, `CO260427-00091`, `CO260504-00091`) carry the target date in the **order number** but `createdDate` defaulted to 2026-05-11 when POSTed. Narrate the dates from the order number prefix during the demo — the consumption *pattern* (4 orders, 30/40/25/25 units of `164W33`) is what 1b's predictive math relies on, and that's intact.

| # | Order | Date | Status | Payment | Total | Lines |
|---|-------|------|--------|---------|------:|-------|
| – | CO260421-00005 | 2026-04-21 | New | DefaultManual | $299.99 | 8010073×1, ALCOE2047×1 |
| – | CO260421-00007 | 2026-04-21 | New | DefaultManual | $419.99 | 8010073×1, ALCOE2047×1 |
| – | CO260421-00010 | 2026-04-21 | New | DefaultManual | $1,280.98 | **ZQY-49234025×5**, 8010073×1, ALCOE2047×1, **LIU-65067964×2** |
| 1 | CO26050800101 | 2026-05-08 | Completed | CyberSource | $709.93 | ALCOE2124×7 |
| 2 | CO26050800102 | 2026-05-08 | Completed | AuthorizeNet | $1,009.90 | ALCOE6923×7, ALCOE3675×2, ALCOE3672×1 |
| 3 | CO26050800103 | 2026-05-08 | Completed | Skyflow | $2,009.80 | ALCOE0637×5, ALCOE2839×10, ALCOE3672×5 |
| 4 | CO26050800104 | 2026-05-08 | Completed | DefaultManual | $709.93 | ALCOE0482×7 |
| 5 | CO26050800105 | 2026-05-08 | Completed | CyberSource | $809.92 | ALCOE0482×8 |
| 6 | CO26050800106 | 2026-05-08 | Completed | AuthorizeNet | $909.91 | ALCOE1423×9 |
| 7 | CO26050800107 | 2026-05-08 | **Processing** | Skyflow | $1,609.84 | ALCOE3672×8, ALCOE7716×3, ALCOE8282×5 |
| 8 | CO26050800108 | 2026-05-08 | Completed | DefaultManual | $2,309.77 | ALCOE3675×5, ALCOE8887×9, ALCOE7716×9 |
| 9 | CO26050800109 | 2026-05-08 | Pending | CyberSource | $409.96 | ALCOE6923×4 |
| 10 | CO26050800110 | 2026-05-08 | Pending | AuthorizeNet | $1,109.89 | ALCOE1423×9, ALCOE8887×2 |
| 11 | CO26050800111 | 2026-05-08 | **Processing** | Skyflow | $2,409.76 | ALCOE8132×10, ALCOE2465×9, ALCOE3672×5 |
| 12 | CO26050800112 | 2026-05-08 | Pending | DefaultManual | $609.94 | ALCOE2839×6 |
| 13 | CO26050800113 | 2026-05-08 | New | CyberSource | $709.93 | ALCOE2839×7 |
| 14 | CO26050800114 | 2026-05-08 | New | AuthorizeNet | $1,909.81 | ALCOE2465×4, ALCOE1423×7, ALCOE8887×8 |
| 15 | CO26050800115 | 2026-05-08 | **Payment required** | Skyflow | $1,909.81 | ALCOE2839×5, ALCOE1423×5, ALCOE8887×9 |
| 16 | CO26050800116 | 2026-05-08 | New | DefaultManual | $1,509.85 | ALCOE8132×10, ALCOE1423×5 |
| 17 | CO26050800117 | 2026-05-08 | New | CyberSource | $1,409.86 | ALCOE2465×1, ALCOE8282×9, ALCOE5866×4 |
| 18 | CO26050800118 | 2026-05-08 | New | AuthorizeNet | $409.96 | ALCOE0637×4 |
| 19 | CO26050800119 | 2026-05-08 | **Payment required** | Skyflow | $1,209.88 | ALCOE0637×7, ALCOE2839×5 |
| 20 | CO26050800120 | 2026-05-08 | New | DefaultManual | $709.93 | ALCOE8887×7 |
| 21 | **CO26050800121** | **2026-05-11** | **Completed** | **CyberSource** | **$2,115.40** | **164W33×25, 164W34×15, 164W48×10** |
| – | **CO260413-00091** | (target: 2026-04-13) | Completed | CyberSource | $520.00 | **164W33×30** |
| – | **CO260427-00091** | (target: 2026-04-27) | Completed | CyberSource | $907.20 | **164W33×40, 164W34×5** |
| – | **CO260504-00091** | (target: 2026-05-04) | Completed | CyberSource | $435.00 | **164W33×25** |

---

## Sub-scenario 1a — Process Natural Language Multi-Line Orders

**Goal:** Buyer types a vague reference; AI resolves to a specific past order, identifies the product family, swaps the requested variant, applies pricing, pre-populates the cart.

**Star data (best fit — industrial fastener family, matches the demo brief's "hex bolts" example word-for-word):**
- Reference order in history: **`CO26050800121`** (May 11, 2026) — contains all 3 Carriage Bolt variants:
  - `164W33` × 25 @ $17.00 — **1" Steel, 1/4"-20 thread, 1300 PK**
  - `164W34` × 15 @ $43.44 — **1-1/4" Steel, 5/16"-18 thread, 700 PK**
  - `164W48` × 10 @ $102.88 — **1/2" Steel, 1/4"-20 thread, 1800 PK**
  - Total: **$2,115.40** (Completed, CyberSource)
- Product family: **Carriage Bolts** — 3 real industrial variants
- Variant dimensions: **length** (1" / 1-1/4" / 1/2") · **thread/diameter** (1/4"-20 / 5/16"-18) · **pack size** (700 / 1300 / 1800 PK)

### Demo prompt to type into the AI assistant
> *"I need 50 of those 1-inch carriage bolts we ordered last week, but get me the 1-1/4-inch version instead."*

This phrasing matches the original demo brief almost exactly: *"I need 50 of those hex bolts we ordered last April, but in the 3-inch stainless steel version instead of zinc."*

### Expected AI behaviour (what must be visible on screen)

| Step | What demo audience must see |
|------|------------------------------|
| 1. Past-order resolution | "Found in your order **CO26050800121** (May 11, 2026): 25 × Carriage Bolt 1" `164W33` — $425.00" |
| 2. Family detection | "Product family: **Carriage Bolts**" — list shows 3 variants: 1" `164W33` (current), **1-1/4" `164W34`**, 1/2" `164W48` |
| 3. Variant substitution | "Swapping `164W33` 1" → `164W34` 1-1/4 inch (Grade A, Plain Finish, 5/16"-18 thread, 700 PK)" |
| 4. Cart pre-fill | One line: `164W34` × 50 @ $43.44 = **$2,172.00 subtotal** |
| 5. Editable confirmation | Cart shows quantity stepper, variant dropdown lists all 3 carriage-bolt sizes, "Matched based on your May 11 order" pill, applied contract price |

### Alternative prompt (Kingston SSD family — backup if industrial story doesn't land)
> *"I need 5 more of those Kingston SSDs we ordered last month, but the 512Gb ones instead of 1Tb."*

Resolves `CO260421-00010` (5 × `ZQY-49234025` 1Tb) → swap to `LIU-65067964` 512Gb, qty 5 = $401.35 subtotal.

### Tertiary alternative (notebook family)
> *"I need 9 of those JIANWU mini notebooks we ordered last week, but get me the leather business ones this time."*

Resolves to `CO26050800106` (9 × `ALCOE1423`) → swap to `ALCOE5866` PU Leather Business Notebook ($899.91 subtotal).

---

### A. Multi-line prompts (one sentence → multi-line cart)

The "**Multi-Line**" in the scenario title means a single conversational input can populate **several cart lines at once**. These show that capability.

| # | Prompt | Expected cart |
|---|--------|---------------|
| A1 | *"Same carriage bolts as last week, but swap the 1-inch for the 1-1/4 inch and add 20 more of the 1/2 inch."* | Resolves `CO26050800121`. Swaps `164W33×25` → `164W34×25` ($1,086) + scales `164W48` 10→30 ($3,086.40) + keeps `164W34×15` (merged to ×40). Net: `164W34×40` ($1,737.60) + `164W48×30` ($3,086.40). Total **$4,824.00** |
| A2 | *"Same as my Apr 21 order — but bump the SSDs to 10 each."* | Resolves `CO260421-00010` (4 lines). Scales `ZQY-49234025` 1Tb 5→10 ($1,113.90) + `LIU-65067964` 512Gb 2→10 ($802.70). Keeps `8010073` SHOT × 1 + `ALCOE2047` Bestoss × 1. Total ≈ **$2,016.60** |
| A3 | *"Build my standard monthly office order: 8 boxes of gel pens, 5 of those Kawaii notebooks, and a sticker book."* | 3 lines, no order reference required (uses repeat-purchase frequency to pick variants): `ALCOE8887` × 8 ($799.92) + `ALCOE1423` × 5 ($499.95) + `ALCOE8132` × 1 ($99.99). Total **$1,399.86** |
| A4 | *"All three carriage bolt sizes, 30 of each."* | No order reference — uses family lookup. 3 lines: `164W33×30` ($510) + `164W34×30` ($1,303.20) + `164W48×30` ($3,086.40). Total **$4,899.60** |
| A5 | *"Repeat my last Skyflow order, but double the laptops and drop the SSDs."* | Resolves `CO26050800119` (`ALCOE0637×7`, `ALCOE2839×5`). Doubles `ALCOE2839` to 10. No "SSDs" in that order so AI explains nothing dropped. Result: `ALCOE0637×7` ($699.93) + `ALCOE2839×10` ($999.90). Total **$1,699.83** |
| A6 | *"Reorder everything I bought from 2026-05-08, but only the Pending ones."* | Filters by date + status. Resolves to `CO26050800109`, `CO26050800110`, `CO26050800112`. Aggregates lines: `ALCOE6923×4` + `ALCOE1423×9` + `ALCOE8887×2` + `ALCOE2839×6`. Total **$2,099.79** |

---

### B. Reference resolution — vary how the buyer points to the past order

The AI must understand many ways of referring to a past order. Each row below shows a different reference style that resolves to a specific order in John's history.

| Reference style | Example phrase | Resolves to |
|-----------------|---------------|-------------|
| **By relative date** | "we ordered last week" | Any 2026-05-08 order |
| **By absolute date** | "back on April 21" | `CO260421-00005`, `-00007`, or `-00010` |
| **By month** | "in April" | All 3 April orders |
| **By status** | "the order that's still pending" | `CO26050800109`, `CO26050800110`, `CO26050800112` |
| **By status** | "the Skyflow one that's still processing" | `CO26050800107` or `CO26050800111` |
| **By status** | "what's awaiting payment" | `CO26050800115` or `CO26050800119` (Payment required) |
| **By order number** | "redo CO26050800103" | exact match |
| **By payment method** | "the orders I paid via CyberSource last week" | 5 CyberSource orders from 2026-05-08 |
| **By size** | "my biggest order this month" | `CO26050800111` ($2,409.76 May seed) or `CO26050800121` ($2,115.40 carriage bolts) |
| **By size** | "my biggest order ever" | `CO26050800111` ($2,409.76) |
| **By price floor** | "anything I spent more than $2,000 on" | `CO26050800103`, `CO26050800108`, `CO26050800111`, `CO26050800121` |
| **By content** | "the order with the laptop" | Any order containing `ALCOE2839` (5 orders) |
| **By content** | "the bolts I ordered" | `CO26050800121` (only carriage-bolt order) |
| **By content** | "the one with both Kingston SSDs" | `CO260421-00010` (only multi-Kingston order) |
| **By product family** | "my industrial fasteners order" | `CO26050800121` (all 3 carriage-bolt variants) |
| **By implicit context** | "what I usually buy" | Aggregates top-3 by-frequency: `ALCOE1423`, `ALCOE8887`, `ALCOE2839` |

---

### C. Variant operations — full matrix

Show the AI handling different kinds of variant manipulation, not just simple swaps.

| Op | Prompt | Example outcome |
|----|--------|-----------------|
| **Size swap** (length) | *"Get me the 1-1/4 inch ones instead of the 1-inch"* | `164W33` → `164W34` |
| **Thread/diameter swap** | *"Same bolts, but 5/16-18 thread"* | `164W33` (1/4-20) → `164W34` (5/16-18) |
| **Pack-size swap** | *"Make those the 1800-pack instead of the 1300-pack"* | `164W33` (1300 PK) → `164W48` (1800 PK) |
| **Capacity swap** (storage) | *"Get me the 512Gb instead of the 1Tb"* | `ZQY-49234025` → `LIU-65067964` |
| **Reverse swap** | *"Upgrade my last SSD order to the 1Tb model"* | `LIU-65067964` → `ZQY-49234025` |
| **Type swap** (within family) | *"Make those leather notebooks instead of Kawaii"* | `ALCOE1423` → `ALCOE5866` |
| **All variants in one line** | *"All three carriage bolt sizes, 30 of each"* | 3 lines: `164W33×30` + `164W34×30` + `164W48×30` |
| **Mixed variants** | *"Give me 5 Kingston 1Tb and 5 of the 512Gb"* | 2 lines: `ZQY-49234025×5` + `LIU-65067964×5` |
| **Brand-within-category** | *"Swap the Kingston SSDs for the Bestoss ones"* | `ZQY-49234025` → `ALCOE2047` |
| **Quantity scaling** | *"Double my last gel pen order"* | `ALCOE8887×7` → `ALCOE8887×14` |
| **Round up** | *"Round my last sticker book up to 25"* | `ALCOE8132×10` → `ALCOE8132×25` |
| **Aggregate from family** | *"All four sticker variants, 3 each"* | 4 lines: `ALCOE2124×3` + `ALCOE6923×3` + `ALCOE8282×3` + `ALCOE8132×3` |

---

### D. Multi-turn conversation script (~90 sec)

Demonstrates iterative refinement — buyer doesn't need a perfect prompt up-front.

```
Buyer:  Same carriage bolts as last week, just the 1-inch ones.
AI:     Found CO26050800121. Filtering to 1" Carriage Bolt only:
        • 164W33 (1" Steel, 1/4"-20, 1300 PK) × 25 ($425.00)
        Subtotal: $425.00

Buyer:  Make it 50 instead.
AI:     Updated:
        • 164W33 × 50 ($850.00)
        Subtotal: $850.00

Buyer:  Actually swap to the 1-1/4 inch version.
AI:     Swapped 164W33 → 164W34 (1-1/4" Steel, 5/16"-18, 700 PK):
        • 164W34 × 50 ($2,172.00)
        Subtotal: $2,172.00

Buyer:  Add 8 boxes of those gel pens we always order.
AI:     Added ALCOE8887 × 8 ($799.92).
        New total: $2,971.92.

Buyer:  Looks good. Check out.
AI:     [transitions to checkout with cart pre-filled]
```

This shows: filter → scale → swap variant → add → checkout — all natural language, all mapped to real cart mutations.

---

### E. Edge cases & graceful failures (good demo material — shows AI knows its limits)

| Case | Prompt | Expected AI response |
|------|--------|----------------------|
| **No matching history** | *"Reorder what I bought in March"* | "I don't see any orders from March 2026. Your earliest order is April 21." |
| **Ambiguity** | *"The notebooks I always buy"* | "You've ordered 3 different notebooks: Mini Loose-leaf (5×), Coil (3×), PU Leather (1×). Which one — or all three?" |
| **Ambiguity (bolts)** | *"The carriage bolts I ordered"* | "Your `CO26050800121` order had 3 sizes: 1" (`164W33`), 1-1/4" (`164W34`), 1/2" (`164W48`). Which one — or all three?" |
| **Variant not in catalog** | *"3-inch carriage bolt"* (no such variant) | "We carry 1/2", 1", and 1-1/4" Carriage Bolts. 3" isn't in our catalog — closest available is the 1-1/4 inch `164W34`." |
| **Variant not in catalog** | *"512Mb Kingston SSD"* (no such variant) | "Kingston KC3000 only comes in 512Gb and 1Tb in our catalog. Did you mean 512Gb?" |
| **Catalog product with no order history** | *"Add an iPad case to my cart"* | Falls through to **catalog search** rather than order-history match. Shows ALCOE3672 from product catalog. |
| **Wrong intent** | *"Cancel my last order"* | AI hands off to a different flow (cancellation), does NOT pre-fill a cart. |
| **Wrong intent** | *"What's my favorite product?"* | AI responds with analytics ("most-ordered SKU is ALCOE1423/ALCOE8887, 5 orders each"), does NOT pre-fill a cart. |

---

### F. What should NOT trigger a cart pre-fill

Useful to mention briefly to demonstrate scope discipline:
- Questions about past orders ("How much did I spend last week?") → analytics, not order
- Status checks ("Is my Skyflow order shipped?") → tracking, not order
- Returns / cancellations → separate workflows
- General product Q&A ("Is the iPhone 16 Pro waterproof?") → catalog search

---

### Evidence to capture

For each prompt the demo actually runs:
- Storefront cart page after AI fills it — screenshot
- Order history page showing the resolved reference order (e.g. `CO26050800121` for the bolt swap, `CO260421-00010` for the Kingston SSD alt)
- For multi-turn flow (D): screenshot after each turn so the audience sees state evolving
- For edge cases (E): the AI's clarifying question or graceful refusal — screenshot of that moment

---

## Sub-scenario 1b — Predictive Autonomous Restocking

**Goal:** AI analyses repeat-purchase consumption, predicts a stock-out, proactively surfaces a notification + pre-built reorder cart with one-click action.

**Maps to original brief:**
1. **Trigger** — push notification / email / dashboard widget: *"You're likely to run out of X in 5 days"*
2. **Context** — "Based on past consumption / order frequency / (optional) IoT or stock feed"
3. **Suggested reorder** — pre-built cart with products, quantities, delivery timing
4. **One-click action** — "Review & reorder" → cart opens

> **Demo caveat — `createdDate` doesn't stick.** The 3 historical bolt orders carry their target weekly dates in the **order number** (CO**260413**, CO**260427**, CO**260504**) but `createdDate` defaults to today (see Order History caveat). The 4-order **consumption pattern is real** — narrate dates from order numbers, not the "Date" column.

---

### Star data — primary candidate (★ promoted 2026-05-11)

**SKU: `164W33`** — Carriage Bolt 1" Steel, Grade A, Plain Finish, 1/4"-20 Thread, 1300 PK — **$17.00**

Best fit for the demo brief's *$150M industrial parts distributor* persona — a real consumable in industrial procurement (fasteners go fast on a production line).

| Order | Date (target) | Qty | Status | Cumulative |
|-------|---------------|----:|--------|----------:|
| CO260413-00091 | 2026-04-13 (4w ago) | 30 | Completed | 30 |
| CO260427-00091 | 2026-04-27 (2w ago) | 40 | Completed | 70 |
| CO260504-00091 | 2026-05-04 (1w ago) | 25 | Completed | 95 |
| CO26050800121  | 2026-05-11 (today) | 25 | Completed | 120 |

**Pattern:** 4 orders, **120 units total**, avg **30 boxes/week**, σ ≈ 6.5 (modest noise — believable, not too tidy). Projected runout: ~5 days at current velocity.

**Scripted demo flow (everything below is automated end-to-end):**

| Step | What it does | Script / artifact |
|------|--------------|-------------------|
| **0. Seed historical pattern** *(run once)* | Creates the 3 backdated orders above | [`scripts/seed-historical-bolt-orders-vcst.js`](../../scripts/seed-historical-bolt-orders-vcst.js) |
| **1. Send the push notification** | Creates a push message targeting John's `contactId`, transitions to `Scheduled`, Hangfire dispatches it. Topic: *📦 Time to restock — 1" Carriage Bolts running low* | [`scripts/send-restock-push-vcst.js`](../../scripts/send-restock-push-vcst.js) (`--now` immediate / `--schedule-in 5m` / `--draft`) |
| **2. Pre-fill John's cart** | Idempotent: restocks 164W33 inventory if oversold/disabled (`PATCH /api/inventory/{id}` JsonPatch) → clears John's cart → adds `164W33 × 30` via xAPI `addItem` | [`scripts/seed-restock-cart-vcst.js`](../../scripts/seed-restock-cart-vcst.js) (default qty 30, override with `--qty N`) |
| **3. John clicks the push** | Push body uses real GUID URL: `[Review & reorder →](https://vcst-qa-storefront.govirto.com/account/orders/7a8ee7fd-c6ca-4e91-bf1d-a16c763aa19a)` → lands on `CO26050800121` (the 3-variant bolt order, $2,115.40) | Push payload, hardcoded in script |
| **4. From there → /cart** | Cart already populated with the AI's suggested reorder (164W33 × 30 = $510) | The pre-fill from step 2 |

### Backup candidate — gel pens

**SKU: `ALCOE8887`** — 24/12PCS Color Gel Pen Refill Set 0.5mm — **$99.99**

If the industrial-parts narrative doesn't resonate (e.g. prospect is in office-supplies / B2C retail), pivot to the office-consumable angle.

| Order | Date | Qty | Status | Cumulative |
|-------|------|----:|--------|----------:|
| CO26050800108 | 2026-05-08 | 9 | Completed | 9 |
| CO26050800110 | 2026-05-08 | 2 | Pending | 11 |
| CO26050800114 | 2026-05-08 | 8 | New | 19 |
| CO26050800115 | 2026-05-08 | 9 | Payment required | 28 |
| CO26050800120 | 2026-05-08 | 7 | New | 35 |

**Pattern:** 5 orders, **35 boxes total**, avg **7 boxes/cycle**, σ ≈ 2.8. Same script (`send-restock-push-vcst.js`) can be adapted by swapping the SKU constants.

> **Weak signal caveat for gel pens:** all 5 orders are dated 2026-05-08 (single seed batch). Narrate "5 weeks" — or use the bolts (4 orders with target dates spanning ~4 weeks via order-number prefix, even though `createdDate` doesn't stick).

### Demo prompt entry points

There's no "type a prompt" here — the AI **surfaces unprompted** because it's monitoring consumption. The buyer simply logs in or opens the bell icon.

| Trigger channel | What buyer sees | Status |
|----------------|-----------------|--------|
| **Storefront bell-icon push** ⭐ | Bell badge in the nav; clicking the bell shows: *📦 Time to restock — 1" Carriage Bolts running low. Avg 30 boxes/week · projected runout in 5 days. **[Review & reorder →]** [Adjust quantity] [Skip this cycle]* | ✅ **Live and scripted** via [`scripts/send-restock-push-vcst.js`](../../scripts/send-restock-push-vcst.js) + VC PushMessages module + Hangfire dispatch |
| **Storefront dashboard widget** | Banner at top of `/account` or `/account/orders`: 🔔 *"You're projected to run out of 1" Carriage Bolts in 5 days — review reorder?"* | 🎨 narrate / mock for demo |
| **Email preview** | Subject: *"Time to restock — 1" Carriage Bolts running low"* · Body: consumption summary + Review button | 🎨 narrate / mock for demo |
| **Sales rep / CSM dashboard** | Alert in the rep's queue: *"John Mitchell (TechFlow) — carriage bolt reorder due. One-click send reorder offer."* — outbound trigger | 🎨 narrate / mock for demo |

### Expected AI behaviour (what must be visible on screen)

| Step | What demo audience must see | Live? |
|------|------------------------------|:-----:|
| 1. **Trigger** | Bell-icon notification appears with the projected stockout date and confidence ("5 days, 92% confidence") | ✅ |
| 2. **Context — consumption visualization** | Notification body shows a markdown table of the 4 historical orders × qty (CO260413-00091 / -00427 / -00504 / CO26050800121), OR a "4 orders · 120 units · avg 30/week" stat block. Optional IoT pill: *"+ N units consumed at warehouse (sensor feed)"* | ✅ table; 🎨 chart |
| 3. **Why this SKU** | Reasoning bullets: cadence (4 orders), velocity (30/week), variance (low — σ≈6.5), last order recency (today), buffer policy (5-day lead time) | 🎨 narrate |
| 4. **Pre-built cart** | One line: `164W33` × **30 boxes** (1 cycle) @ $17.00 = **$510.00**. Delivery date estimate visible (e.g. "Arrives Wed, May 14"). Contract-price pill visible. | ✅ pre-filled via [`seed-restock-cart-vcst.js`](../../scripts/seed-restock-cart-vcst.js) |
| 5. **Availability check** | Live stock badge → green "In stock — ships today" | ✅ inventory restocked to 200 units / status `Enabled` |
| 6. **One-click action** | Primary CTA: **"Review & reorder"** → opens order detail page for `CO26050800121` (showing what John bought today). Secondary: "Adjust", "Skip this cycle". From there, the cart icon shows the AI's pre-filled suggestion. | ✅ URL hardcoded in push body |

---

### Additional backup candidates

| SKU | Product | Orders | Total units | Avg/cycle | Why it works for 1b |
|-----|---------|------:|-----------:|---------:|---------------------|
| `ALCOE1423` | JIANWU Mini Loose-leaf Notebook | 5 | 35 | 7 | Paper consumable; same single-day seed-batch weakness as gel pens |
| `ALCOE0637` | Yoofun 94pc Vintage Material Paper Pack | 3 | 16 | ~5 | Lower-frequency consumable; AI flags as "due soon" not "urgent" |
| `ALCOE2465` | A4/A5/A6 Coil Notebook | 3 | 14 | ~5 | Backup paper consumable |

---

### A. Multi-line predictive — top-N consumables at once

The AI can surface **multiple SKUs in one alert** when several are due in the same window.

**Example trigger:**
> 🔔 *"3 items due for reorder in the next 7 days. Review combined reorder cart?"*

**Pre-built cart:**

| SKU | Product | Suggested qty | Subtotal | Cycle days |
|-----|---------|------:|---------:|-----------:|
| `164W33` | Carriage Bolt 1" (1300 PK) | 30 | $510.00 | 5 |
| `ALCOE8887` | Gel Pen Refills | 8 | $799.92 | 5 |
| `ALCOE1423` | Mini Loose-leaf Notebook | 7 | $699.93 | 6 |
| | | **Total** | **$2,009.85** | |

**Buyer sees:** "Reorder all 3 now (save 1 shipment + admin time)" vs "Stagger across the week" vs "Pick and choose".

---

### B. Signal mix — what factored into the prediction

A concise visible explanation panel that demystifies the AI:

```
Predicted stockout for 164W33 — 5 days

Signals considered:
  ✓ Historical orders (last 4, weekly)   weight: 60%
  ✓ Order frequency (avg 7 days)         weight: 20%
  ◯ Stock feed from warehouse 3          weight: 10%   [optional, partner]
  ✓ Seasonal multiplier (Q2 normal)      weight: 5%
  ◯ Open-cart signal (none)              weight: 5%
```

> Use this panel to handle prospect skepticism ("how does it know?"). For the demo, only the ✓ rows need real data; the ◯ IoT/stock-feed rows are partner-supplied.

---

### C. Multi-turn refinement script (~60 sec)

After the AI surfaces the offer, the buyer can refine without going to checkout.

```
AI:    🔔 1" Carriage Bolts (164W33) running low — reorder 30 boxes?
Buyer: Make it 50.
AI:    Updated: 164W33 × 50 = $850.00.
       💡 Heads up — at qty 50+ you cross the bulk-pricing tier
       (-10%). Adjusted price: $765.00.

Buyer: Actually skip this cycle.
AI:    Postponed. I'll check again on May 18.

Buyer: Set up auto-reorder going forward.
AI:    Auto-reorder enabled for 164W33:
        • Cadence: every 7 days
        • Qty: 30 boxes per cycle
        • Auto-place if confidence > 85%
        • Sends 24h confirmation before charge
       You can manage at /account/subscriptions.

Buyer: Looks good.
AI:    [confirms subscription]
```

Shows: scale → tier-pricing notification → skip → auto-pilot setup. Three meaningful capabilities in 60 seconds.

---

### D. Pricing tier hook

When the AI's suggested qty crosses a volume threshold, surface it explicitly — turns a passive reorder into a margin-positive upsell.

For `164W33` Carriage Bolts:

| Cycle qty | Unit price | Total | Note |
|----------:|----------:|------:|------|
| 25 (last order) | $17.00 | $425.00 | List price |
| 30 (suggested) | $17.00 | $510.00 | Suggested baseline (matches avg/week) |
| **50 (tier 1)** | **$15.30** | **$765.00** | 🏷 "Buy 50+ → -10% per unit" — saves $85.00 vs qty 50 @ list |
| 100 (tier 2) | $13.60 | $1,360.00 | "Buy 100+ → -20% per unit" — bulk reorder |

This is a **Virto-native** mechanic (price lists with tier ranges), the AI just surfaces it contextually. No partner needed.

---

### E. Edge cases & don't-trigger list (shows AI knows when NOT to predict)

| Case | Trigger? | Why |
|------|:--------:|-----|
| `ALCOE2839` Teclast Laptop — 5 orders, 33 units | ❌ | Durables, not consumables. AI suppresses restocking suggestions for capital equipment. |
| `ZQY-49234025` Kingston 1Tb SSD — 1 order | ❌ | Single purchase, no pattern. AI says "not enough history to predict". |
| `ALCOE7716` ERYING Gaming PC Kit — 2 orders, 12 units | ❌ | High-cost capital item, not auto-reorderable. |
| `8010073` SHOT — 3 orders at $0 | ❌ | Promo/sample SKU with $0 price → AI excludes. |
| Brand new SKU (just appeared on storefront) | ❌ | "Need 2+ orders to establish a baseline" |
| Sporadic buyer (orders this once a year) | 🟡 | AI shows "due in ~340 days" — confidence too low to push proactively, but available in dashboard |
| Pattern broken (qty dropped sharply) | 🟡 | "Your usage of X has decreased. Want to lower the auto-reorder qty?" |
| Supplier stockout (live availability check fails) | 🟡 | "Reorder of X would normally be due, but it's out of stock. Suggested alternative: Y" — combines 1b + 1a |

---

### Evidence to capture

For each prompt the demo actually runs:
- The bell-icon push as it appears (badge + dropdown panel + full notification body with the markdown consumption table) — screenshot
- Consumption visualization (4 reference orders containing 164W33) — already in the push body; screenshot of the bell-icon panel covers this
- The "Review & reorder" CTA click → landing on `CO26050800121` order detail — screenshot
- The pre-filled cart at `/cart` with `164W33 × 30 = $510` — screenshot
- Tier-pricing pop-in (if section D used) — screenshot
- Auto-reorder confirmation modal (if section C used) — screenshot
- Admin order list filtered by `customerId=John Mitchell` + SKU `164W33` — proves the 4 reference orders exist live (URL: `https://vcst-qa.govirto.com/#/orders` filter by customer)

---

## Sub-scenario 1c — Procurement Policy Compliance (virtostart)

**Goal:** Buyer adds an item that violates the org's procurement rules; AI flags real-time before checkout, suggests a compliant alternative, and routes to approval workflow.

---

### Alternate path — single-item budget threshold (★ adopted 2026-05-11)

ALCOE6016 virtostart

https://virtostart-demo-store.govirto.com/product/99bc1aa4-74a3-4603-8b38-a96a0c57e5d7


**Star scenario:**
- Product: `ALCOE6016` — Home/Catalog/Computer,Office, Education/Desktops (category)
- Titile: 22 Inch All-in-one Desktop A8 -7410 AMD All In One Computer Full Set Gaming PC DDR3 512GB SSD PC All In One 
- Org cap: **$2,000.00** per line — set in the **Procurement Policy Compliance** property of the product (or globally per-org)
- Trigger: adding **qty 1** to the cart is already non-compliant — no qty math needed, the *unit price itself* exceeds the cap
- PDP URL: https://virtostart-demo-store.govirto.com/product/99bc1aa4-74a3-4603-8b38-a96a0c57e5d7


```html
<div role="alert" aria-live="polite" style="
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    margin: 12px 0;
    border: 1px solid #d97706;
    border-left: 4px solid #d97706;
    background: #fffbeb;
    color: #78350f;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    box-sizing: border-box;
  ">
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"
       style="flex-shrink:0; margin-top:2px;">
    <path d="M10 1.667a8.333 8.333 0 1 0 0 16.666 8.333 8.333 0 0 0 0-16.666Zm.833 12.5H9.167v-1.667h1.666v1.667Zm0-3.334H9.167V5.833h1.666v5Z" fill="#d97706"/>
  </svg>
  <div style="flex: 1; min-width: 0;">
    <strong style="display:block; font-size:14px; color:#78350f; margin-bottom:4px;">
      This item exceeds your budget threshold
    </strong>
    <span style="color:#92400e; display:block;">
      <code style="background:#fef3c7; padding:1px 6px; border-radius:3px; font-size:12px;">ALCOE6016</code>
      unit price <strong>$2,555.00</strong> exceeds your single-line cap of
      <strong>$2,000.00</strong>. Manager approval required.
    </span>
    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">
      <a href="/account/quotes" style="
          flex-shrink:0; white-space:nowrap; display:inline-block;
          background:#d97706; color:#fff; text-decoration:none;
          padding:6px 12px; border-radius:4px; font-size:12px;
          font-weight:500;
        ">Submit for approval</a>
      <a href="/product/2c1d8351-ca59-4637-ab5a-3d94d9c357d2" style="
          flex-shrink:0; white-space:nowrap; display:inline-block;
          background:#fff; color:#78350f; text-decoration:none;
          border:1px solid #d97706;
          padding:6px 12px; border-radius:4px; font-size:12px;
          font-weight:500;
        ">View compliant alternative</a>
      <a href="#" onclick="this.closest('[role=alert]').style.display='none'; return false;" style="
          flex-shrink:0; white-space:nowrap; display:inline-block;
          background:transparent; color:#78350f; text-decoration:none;
          padding:6px 10px; font-size:12px;
        ">Dismiss</a>
    </div>
  </div>
</div>

```

**Design notes — how it differs from the budget banner:**

| Aspect | Budget banner | Sustainability banner |
|---|---|---|
| Left border accent | amber `#d97706` (financial warning) | **green `#16a34a`** (eco accent) on the inside-stripe, amber outer border |
| Icon | warning ⚠ (filled amber circle) | **leaf** in green |
| Headline | "This item exceeds your budget threshold" | "This material is not compliant with sustainability policy" |
| Body framing | unit price vs. cap (numeric) | material/packaging composition vs. mandate (compositional) |
| Secondary CTA | "View compliant alternative" (outlined amber) | "View eco-rated alternative" (outlined green) |

**CTA destinations:**

| Button | href | What happens |
|--------|------|--------------|
| **Submit for approval** | `/account/quotes` | Same approval channel as budget rule — VC Quote Requests workflow |
| **View eco-rated alternative** | `/product/2c1d8351-ca59-4637-ab5a-3d94d9c357d2` | (Same alt for now — swap for a real eco-rated SKU when seeded. Could be the same panoramic camera with eco packaging variant.) |


**Demo narrative — both rules stacked:**

> *"John lands on the high-end camera PDP and sees the AI catch **two policy violations at once**: the price is over budget AND the packaging fails the sustainability rule. He has the same options on both — submit for approval or pick the compliant alternative — and the system shows him what's wrong WITHOUT him having to read the procurement handbook."*

**Comparison of the three 1c paths:**

| | Qty rule (original) | Budget threshold | Sustainability |
|---|---|---|---|
| Rule basis | line qty ≥ 10 | unit price > $2,000 | material composition fails mandate |
| Trigger surface | Cart (after add) | PDP (before add) | PDP (before add) |
| Fixable by buyer alone? | Yes — drop qty | No — alternative or approval | No — alternative or approval |
| Stacks with budget? | No (cart only) | — | ✅ **Yes** — both can fire on the same PDP |
| Matches brief verbatim? | partial (re-cast) | direct match #1 | direct match #2 (closes gap) |

**Where to set the rule (admin):**
- Same property as budget banner: `Procurement Policy Compliance` on `ALCOE6016`
- Both banners can render in the same property cell, stacked
- For a real / programmatic rule, the sustainability check would query the product's `sustainabilityRating` / `recycledContentPct` dynamic property — out of scope for the visual demo

---
