# Demo 4 — Intelligent Enterprise CPQ & Proposal Management — Scoping Outline

> **Status:** Scoping only — not yet a full fixture. Decisions needed below before we can write the demo flow + seed test data. Demo 4 is **virtostart** (per [project_demo_env_routing](../../.claude/projects/...) memory).

**Audience (per brief):** Enterprise — $10B global distributor
**Theme:** Streamline quoting for complex, multi-layered product configurations. Every quote should be technically accurate + margin-optimized **without** constant manual oversight.

**Three sub-scenarios in the brief:**
1. **4a — Field-to-Quote Visual Discovery** — field rep uploads photo/video of equipment → AI identifies components → draft BOM generated → editable cart
2. **4b — Global Margin & Pricing Optimization** — pricing assistant suggests optimal discount based on inventory + shipping + customer history; guardrails block sub-margin discounts
3. **4c — Frictionless Quote Approval & Integration** — finalized quote routes through internal approval (manager/finance), delivered to buyer as digital quote (not PDF), procurement-system integration (punchout / API / "AI-to-AI handshake"), instant quote→order conversion

---

## Catalog candidates for the demo (virtostart)

Need: **a configurable product** with realistic option dimensions + technical compatibility rules, so a BOM is non-trivial.

| Candidate | Why it fits | Why it might not |
|-----------|-------------|------------------|
| **Panoramic Camera family** (`SP600463` + alternatives) | Continuity with Demo 1c. Real B2B security/access-control category. Could model: resolution × lens × mounting × cabling × PoE switch × storage × warranty. | Cameras don't usually need a 20-line BOM — too small for the "$10B distributor" feel. |
| **Carriage Bolts** (164W33 family — only on vcst-qa today, not virtostart) | Strong industrial story. Variants: length × diameter × thread × material × finish × pack. Real BOM use-case (job-site procurement). | Would need to mirror the bolts catalog from vcst-qa to virtostart. ~1 hour of setup. |
| **"Products with options"** category (virtostart has it) | Already configurable. Likely has option dependencies wired. | Need to inspect what's actually in there — possibly toy/simple products, not enterprise-grade. |
| **Custom-build PC kit** (use the existing `ALCOE7716` ERYING DIY Gaming PC Motherboard Kit as anchor; seed compatibility rules with case/PSU/CPU/RAM/storage) | Compatibility rules feel native to PC builds. Engineering buyer audience would resonate. | Persona doesn't match "$10B global distributor" as cleanly. |
| **Industrial pump/motor configurator** (would need fresh seed) | Closest to the brief's running narrative. | Heavy seeding lift. ~3–4 hours to model + seed. |

**Recommendation:** Investigate the **"Products with options"** category on virtostart first (lowest effort, may already cover the demo). Fall back to mirroring **Carriage Bolts** to virtostart if "Products with options" turns out to be too simple. Use Industrial pump only if a high-fidelity engineering buyer demo is on the calendar.

---

## Sub-scenario scoping

### 4a — Field-to-Quote Visual Discovery

**Brief's "must be visible":**
- Transition: image → identified components → real SKUs
- BOM is structured (not text output)
- Connected to: catalog + compatibility rules

**Tech reality check:**
- VC has `vc-module-ai-document-processing` (already proven in Demo 1d for *document* upload) — likely the same pipeline can handle **images of equipment** as a source type
- The OCR+AI extraction step would need a different prompt template (object detection, not text extraction) — partner-supplied
- Output → quote, exactly like 1d → quote

**What to build:**
- Reuse 1d infrastructure (PurchaseRequest module on virtostart) — extend with image-input flow
- Seed 1–2 demo images (a field-site photo of an equipment installation with visible components)
- The AI partner is responsible for object recognition; VC handles catalog matching + quote build
- Sample image to prepare: a job-site photo with 5+ identifiable items mapping to seeded SKUs

**Risk:** the PR module is experimental — image input may not be supported yet. Verify via the module README before committing.

---

### 4b — Global Margin & Pricing Optimization

**Brief's "must be visible":**
- Pricing is **multi-layered** (region + customer contract + base list price)
- Assistant explains reasoning (even briefly — e.g., *"Based on excess inventory in region, shipping cost optimization, customer purchase history"*)
- Guardrails enforced automatically (block sub-margin discounts)

**Tech reality check:**
- VC has native **Price Lists** (per-currency, per-store, per-segment) — multi-layered pricing is supported out of the box
- VC has native **Promotion rules** — could be used to model "minimum margin floor" as a hard constraint
- **The "pricing assistant"** with reasoning is the partner piece — need an AI advisor that calls VC's pricing API + a margin-calculation service

**What to build:**
- Seed at least 3 price lists: List, Customer Contract, Regional Adjustment
- Seed margin metadata on each SKU (`cost` field; could use dynamic property)
- Build a quote-editing UI (storefront or admin) that shows the pricing assistant inline — partner-driven
- The "Recommended 7% discount because of …" copy is partner-generated (similar to Demo 2a)

**Risk:** virtostart's existing pricing setup might not have margin metadata on SKUs. Probe `cost` field availability on a sample product before committing.

---

### 4c — Frictionless Quote Approval & Integration

**Brief's "must be visible":**
- Workflow: approval triggered by rules (margin threshold, deal size)
- Integration is **not** manual upload/email (punchout, API, or AI-to-AI handshake)
- Conversion: no re-entry of data on the buyer side

**Tech reality check:**
- VC has native **Quote Requests** module (we already used `/account/quotes` in Demo 1c "Submit for approval" CTA) — handles buyer→seller quote submission + acceptance + conversion to order
- VC has native **approval workflows** in the Quote module — can wire margin threshold rules
- **Punchout / OCI / cXML integration** = partner OR custom (`vc-module-punchout` exists for OCI/cXML; for newer AI-to-AI handshakes, partner)
- Quote-to-order conversion is native (Quote Accept → Order Place flow)
- ✅ Quote Requests module **confirmed installed on virtostart** — `POST /api/quote/requests` swagger surface present (`/docs/VirtoCommerce.Quote/swagger.json`), 555+ existing quote records, `vc-frontend` storefront renders `/account/quotes`

**Seed status — 5 quote requests live on virtostart (2026-05-11):**

| Quote # | Source order | Original | Discount | Subtotal (excl. tax) | Status |
|---------|--------------|---------:|---------:|---------------------:|--------|
| `RFQ260511-00101` | CO26050800103 | $15,555.00 | 15% | $13,223.25 | Processing |
| `RFQ260511-00102` | CO26050800111 | $14,701.00 | 15% | $12,497.35 | Processing |
| `RFQ260511-00103` | CO26050800116 | $10,045.00 | 15% | $8,539.75 | Processing |
| `RFQ260511-00104` | CO26050800117 | $9,378.91 | 10% | $8,442.01 | Processing |
| `RFQ260511-00105` | CO26050800113 | $8,410.00 | 10% | $7,570.00 | Processing |

- Customer: John Mitchell-20260508 (`f2f838d8-2195-4a36-8d8d-01de34ae66c3`) on AGENT-TEST-Org-AcmeCorp-20260508
- Status `Processing` = buyer-submitted, awaiting manager proposal (4c "approval inbox" state)
- Negotiated tier discount applied per line via `salePrice` + `proposalPrices[]` — supports 4b "AI-suggested margin-aware pricing" narrative without further wiring
- Seeder: [scripts/seed-quotes-virtostart.js](../../scripts/seed-quotes-virtostart.js) · Results: [_seed-results-quotes-virtostart.json](../../test-data/b2b/_seed-results-quotes-virtostart.json) · Report: [seed-report-quotes-virtostart-20260511.md](../../test-data/b2b/seed-report-quotes-virtostart-20260511.md)
- Storefront view: `https://virtostart-demo-store.govirto.com/account/quotes` (sign in as John Mitchell)
- Admin view: `https://virtostart-demo-admin.govirto.com/#/quotes/{quoteId}`

**What's still to build:**
- Wire 1 approval rule in admin: e.g., "Quote total > $10K requires Finance approval" (would trigger on the top 3 of the 5 seeded quotes)
- Status transitions to script for the demo: `Processing → Proposal sent → Ordered` (use `PUT /api/quote/requests/{id}/status` + `POST /api/quote/requests/{id}/order`)
- For punchout: identify the demo buyer's procurement system (Coupa? Ariba? generic OCI?). If partner: agree on a sandbox endpoint.
- For "AI-to-AI handshake": narrate as a future-state for now (no live partner) OR have a recorded demo segment

**Risk:** The "AI-to-AI handshake" is the most aspirational part of the brief. Realistically demo as an automated system-to-system exchange (which IS just punchout with a different label).

---

## Persona

**Brief's audience: $10B global distributor.** Three roles in the demo flow:

| Role | Who | What they do |
|------|-----|--------------|
| **Field rep** | New persona — *"Marcus Lee, Field Sales at AcmeManufacturing"* | Uploads image (4a), assembles quote |
| **Pricing/Finance approver** | New persona — *"Priya Shah, Finance Manager"* | Reviews quote, applies guardrails (4b/4c) |
| **Buyer** | John Mitchell (continuity) — playing the customer side | Receives the quote, accepts via procurement system (4c) |

Seeding plan: create Marcus + Priya on virtostart admin side (or use existing admin users if available). John already exists.

---

## Pre-build checklist (decisions needed before drafting full fixture)

- [ ] **Product family decision:** "Products with options" or Carriage Bolts mirror or PC build? (recommend probing "Products with options" first — 1 hour to inspect)
- [ ] **CSV/JSON of the BOM template:** if going with Carriage Bolts or PC build, define the 6–10 SKUs that make up a realistic BOM
- [ ] **Sample field-site image for 4a:** mock-up needed (or use a stock photo of an industrial site that maps to seeded SKUs)
- [ ] **Pricing layers seeding:** decide which 3 layers to model (suggested: List, AcmeCorp contract, Regional EU adjustment)
- [ ] **Approval-rule design:** which threshold (deal size $X, margin %Y, or both) — the 5 seeded quotes span $7.5K–$13K so a $10K threshold would naturally bucket them 3-vs-2
- [ ] **Punchout partner:** identify the demo target — or commit to narrating-only for AI-to-AI handshakes
- [ ] **Personas:** seed Marcus + Priya on virtostart (1 admin user + 1 finance role)
- [x] **Quote Requests module on virtostart:** confirmed installed + 5 quotes seeded for John Mitchell (see "Seed status" table under 4c above)

---

## Effort estimate

Once decisions above are made:

| Phase | Effort | What |
|------|-------|------|
| Catalog + BOM seeding | 2–4 h | Depends on chosen product family |
| Pricing layers + margin metadata | 1–2 h | Native VC, mostly admin config |
| Approval rules + Quote module config | 1 h | Native VC config |
| Personas (Marcus + Priya) | 0.5 h | One-off seed |
| Sample field image + AI prompt fixture | 1 h | Partner-side prep |
| Punchout sandbox setup (optional) | 2–4 h | Only if going beyond narrated |
| Full fixture write-up (mirrors Demo 1 length) | 1–2 h | Document the flow + run-of-show |
| **Total** | **8–14 h** | Spread over 2–3 sessions |

---

## What this scoping does NOT do

- ~~Does **not** seed any test data yet~~ — *Update 2026-05-11: 5 quote requests seeded for John Mitchell on virtostart (see 4c "Seed status" table). All other catalog/BOM/persona seeding still pending.*
- Does **not** write the demo run-of-show in full
- Does **not** wire any approval rules in admin
- Does **not** confirm whether the experimental PR module supports image input

These all happen in the next round — once the decisions above are made.
