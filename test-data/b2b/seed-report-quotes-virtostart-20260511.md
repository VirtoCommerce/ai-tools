# Quote Requests Seed — VirtoStart — 20260511

**Platform:** https://virtostart-demo-admin.govirto.com
**Store:** B2B-store
**Customer:** John Mitchell-20260508 (`f2f838d8-2195-4a36-8d8d-01de34ae66c3`)
**Org:** AGENT-TEST-Org-AcmeCorp-20260508 (`8a64d782-d3f5-4f3f-835a-525b8b41b496`)
**Date:** 2026-05-11T13:27:51.795Z
**Method:** Admin REST (`POST /api/quote/requests`)
**Source orders:** Top 5 by value from `_seed-results-orders-virtostart.json`
**Status on create:** `Processing` (buyer-submitted, awaiting manager proposal)

## Discount tiers (per-line `salePrice` + `proposalPrices`)

| Order total | Discount applied |
|-------------|------------------|
| ≥ $10,000   | 15%              |
| ≥ $5,000    | 10%              |
| ≥ $1,000    | 5%               |
| < $1,000    | 0%               |

## Quotes Created

### Quote 1 — RFQ260511-00101

- **Quote ID:** `7605622d-68b8-459d-9bbb-8bd4f67eca32`
- **Quote #:** `RFQ260511-00101`
- **Status:** Processing
- **Source order:** `CO26050800103` ($15555.00)
- **Discount applied:** 15% (saves $2331.75)
- **Quote subtotal:** $13213.25 + shipping $10.00 = **$13223.25**

| SKU | Qty | List | Sale | Extended |
|-----|-----|------|------|----------|
| `TAWYFWRES226` | 5 | $109.00 | $92.65 | $463.25 |
| `SYU-76371555` | 10 | $1200.00 | $1020.00 | $10200.00 |
| `553390824` | 5 | $600.00 | $510.00 | $2550.00 |

### Quote 2 — RFQ260511-00102

- **Quote ID:** `c81396be-8760-492b-adf7-9fc955a3f01d`
- **Quote #:** `RFQ260511-00102`
- **Status:** Processing
- **Source order:** `CO26050800111` ($14701.00)
- **Discount applied:** 15% (saves $2203.65)
- **Quote subtotal:** $12487.35 + shipping $10.00 = **$12497.35**

| SKU | Qty | List | Sale | Extended |
|-----|-----|------|------|----------|
| `JPJ-30487565` | 10 | $999.00 | $849.15 | $8491.50 |
| `566903892` | 9 | $189.00 | $160.65 | $1445.85 |
| `553390824` | 5 | $600.00 | $510.00 | $2550.00 |

### Quote 3 — RFQ260511-00103

- **Quote ID:** `5d24c6e7-a573-4425-97c6-92211c186552`
- **Quote #:** `RFQ260511-00103`
- **Status:** Processing
- **Source order:** `CO26050800116` ($10045.00)
- **Discount applied:** 15% (saves $1505.25)
- **Quote subtotal:** $8529.75 + shipping $10.00 = **$8539.75**

| SKU | Qty | List | Sale | Extended |
|-----|-----|------|------|----------|
| `JPJ-30487565` | 10 | $999.00 | $849.15 | $8491.50 |
| `261082` | 5 | $9.00 | $7.65 | $38.25 |

### Quote 4 — RFQ260511-00104

- **Quote ID:** `bf0d0b5b-3f1b-462b-9510-493a4933f191`
- **Quote #:** `RFQ260511-00104`
- **Status:** Processing
- **Source order:** `CO26050800117` ($9378.91)
- **Discount applied:** 10% (saves $936.90)
- **Quote subtotal:** $8432.01 + shipping $10.00 = **$8442.01**

| SKU | Qty | List | Sale | Extended |
|-----|-----|------|------|----------|
| `566903892` | 1 | $189.00 | $170.10 | $170.10 |
| `UIO-53885304` | 9 | $15.99 | $14.39 | $129.51 |
| `AYB-04369900` | 4 | $2259.00 | $2033.10 | $8132.40 |

### Quote 5 — RFQ260511-00105

- **Quote ID:** `4545e693-0efc-4b90-a775-b5eb65807a11`
- **Quote #:** `RFQ260511-00105`
- **Status:** Processing
- **Source order:** `CO26050800113` ($8410.00)
- **Discount applied:** 10% (saves $840.00)
- **Quote subtotal:** $7560.00 + shipping $10.00 = **$7570.00**

| SKU | Qty | List | Sale | Extended |
|-----|-----|------|------|----------|
| `SYU-76371555` | 7 | $1200.00 | $1080.00 | $7560.00 |

## Demo 1c angle — Procurement Compliance / Submit for approval

These five "in-flight" quotes back **Demo 1c**:

- John has 20 historical orders + 5 active quote requests pending manager proposal
- Volume discount tiers visible on each item — supports the "AI-aware pricing assistant suggests negotiated discount" narrative (Demo 4b crossover)
- All quotes live at `/account/quotes` on storefront — buyer-visible list

## Demo 4a angle — Field-to-Quote Visual Discovery (bulk order from images)

**Narrative for the demo:**

> *"A field engineer at AcmeCorp is doing a site survey. They walk through the warehouse with their phone, snapping photos of the equipment labels on each device that needs replacing. They drop the images into the Virto buyer portal. Within seconds, the AI has read the SKUs and product titles from every label, looked them up in the AcmeCorp catalog, applied their negotiated contract prices, and generated a single bulk quote — ready to submit for manager approval."*

**The "image" content:** photos of equipment labels / shipping cartons showing the **SKU number + product title** (i.e., the same data already printed on the products). The AI's job is OCR + catalog lookup — no object recognition required.

### Buyer flow (image → BOM → quote)

| Step | What the buyer sees | What the system does |
|------|---------------------|----------------------|
| 1 | Drag-and-drop 5 phone photos into the **Purchase Requests** upload area | `createPurchaseRequestFromDocuments` (xAPI mutation) attaches images as sources |
| 2 | "AI is reading your equipment labels…" progress indicator | `extractPurchaseRequestSourcesData` runs OCR — extracts text blocks per image; partner AI identifies SKU + title pairs |
| 3 | "Matching to AcmeCorp catalog…" | `postProcessPurchaseRequestSources` calls catalog search for each extracted SKU; resolves to a real `productId` |
| 4 | "Applying your contract prices…" | Catalog match returns full product including price. Because John carries the `contract-acmecorp-2026` user group, the price evaluator returns `Contract-AcmeCorp-2026` sale prices automatically |
| 5 | "Quote built — review BOM" — buyer sees a 5-line quote with sale prices and contract savings | Module emits a `quoteId` (in `PurchaseRequestType.quoteId`); buyer is routed to `/account/quotes/{id}` |
| 6 | Buyer clicks **Submit for approval** | Quote transitions `Draft → Processing` and lands in the manager inbox (same flow as the 5 seeded 1c quotes above) |

### Sample "from-image" BOM (uses the 5 contract SKUs)

This is the quote that would be generated if all 5 photos resolved cleanly. Contract prices flow through automatically because the catalog-match step uses the same pricing evaluator already proven via `Contract-AcmeCorp-2026`:

| Image content (SKU + title visible) | Qty | List | Contract sale | Extended |
|--------------------------------------|----:|------:|--------------:|---------:|
| Label: `AYB-04369900` — TOUGHBOOK 40 mk2 | 2 | $2,259.00 | $2,033.10 | $4,066.20 |
| Label: `SYU-76371555` — MacBook Pro 2023 Touchbar | 3 | $1,200.00 | $1,080.00 | $3,240.00 |
| Label: `JPJ-30487565` — iPhone 16 Pro | 5 | $999.00 | $899.10 | $4,495.50 |
| Carton: `553390824` — LG EG9600 65" 4K TV | 1 | $600.00 | $540.00 | $540.00 |
| Label: `566903892` — Canon Imageclass MF232W | 2 | $189.00 | $170.10 | $340.20 |
| **Subtotal (excl. tax)** | | | | **$12,681.90** |
| List-price equivalent | | | | $14,091.00 |
| **Contract savings** | | | | **$1,409.10** |

### Sample images to prepare (1 hour of asset prep)

Five JPG/PNG files showing the SKU + product title clearly readable. Options:
1. **Real-world shots** — print the SKU + title onto label paper, stick on placeholder boxes, photograph
2. **Mock label crops** — synthetic images generated from product images + overlaid SKU/title text (cheaper, more controllable)
3. **Hybrid** — one or two "real" photos for authenticity + three mock labels for variety

Suggested filenames (drop into `test-data/demo/4a-field-images/` when produced):
- `toughbook-label.jpg` — laptop bottom label with `AYB-04369900`
- `macbook-carton.jpg` — shipping carton SKU sticker `SYU-76371555`
- `iphone-box-label.jpg` — retail box `JPJ-30487565`
- `lg-tv-back-panel.jpg` — TV rear-panel sticker `553390824`
- `canon-printer-label.jpg` — printer underside label `566903892`

### Partner integration touchpoint

VC handles steps 1, 3, 4, 5, 6 natively via `vc-module-ai-document-processing`. **Step 2** (image → SKU+title extraction) is the partner-supplied piece — a vision/OCR API that:
- Accepts an image URL or binary
- Returns structured `{sku, title, qty?, confidence}` per detected label
- Posts results back through the existing `extractPurchaseRequestSourcesData` flow

This is the same pipeline used for **Demo 1d** (handwritten PO scan), with a different upstream prompt template — no new module needed.

### Why this works at demo time

- ✅ Contract prices already proven end-to-end on virtostart (see `Contract-AcmeCorp-2026` seeder + xAPI verification)
- ✅ Quote Requests module installed + 5 in-flight quotes already in John's inbox
- ✅ `vc-module-ai-document-processing` already installed on virtostart (Demo 1d compatible)
- ⚠️ Image-input flow not yet verified — `extractPurchaseRequestSourcesData` may need a prompt-template tweak for label OCR vs. document OCR
- ⚠️ Sample images need to be produced (see asset prep above)
- ⚠️ Partner vision API needs identifying or stubbing for the demo
