# Demo 2 — AI-Driven Value-Added Promotions & Contextual Merchandising

**Audience:** Midmarket prospect — $300M global manufacturer
**Persona narrative:** John Mitchell, procurement lead at TechFlow (continuity with Demo 1) — now browsing a manufacturer's portal. The manufacturer wants to grow AOV with **value-added offers** instead of blanket discounts, and proactively defend churn-risk accounts.
**Backed by:** virtostart staging, B2B-store, the existing 20 seeded orders for John (Demo 1 sibling).
**Env:** **virtostart** (Demo 2/4 routing — see [project_demo_env_routing](../../.claude/projects/...) memory). vcst-qa is dev/iterate only.

> **Brief's framing:** *"Move beyond blanket discounts. AI-driven 'Digital Merchandiser' acts as a proactive sales partner to increase AOV by: (a) generating contextual one-liners and banners in real-time, (b) suggesting technically-compatible solution bundles, (c) triggering high-value retention offers on behavior shift."*

---

## Environment

| Field | Value |
|-------|-------|
| Storefront URL | https://virtostart-demo-store.govirto.com |
| Admin URL | https://virtostart-demo-admin.govirto.com |
| Store | `B2B-store` |
| Admin login | `virto-admin` / *(see `.env.local` → `ADMIN_VIRTO_PASSWORD`)* |
| Storefront login | `test-john.mitchell-20260508@test-agent.com` / `TestPass123!` |
| Persona | John Mitchell (existing user, AcmeCorp org) |
| Currency | USD |

---

## Star product — the "high-performance motor" stand-in

The brief uses *"high-performance motor"* as the running example. virtostart's catalog doesn't carry motors, so pick a high-value technical SKU as the stand-in. **Recommended: `AYB-04369900` TOUGHBOOK 40 mk2** ($2,259, ruggedized laptop — closest fit for "industrial high-performance equipment"). Backup: `SYU-76371555` MacBook Pro ($1,200) or `SP600463` 4K panoramic camera ($2,555 — continuity with Demo 1c).

| Field | Value (TOUGHBOOK 40 mk2) |
|-------|-------------------------|
| SKU | `AYB-04369900` |
| Price | $2,259 |
| Stock | 7,998 |
| PDP | https://virtostart-demo-store.govirto.com/product/AYB-04369900 (resolve actual slug via search) |
| Narrative role | "the motor" in the brief — high-value, requires installation/maintenance/warranty |

---

## Sub-scenario 2a — Generative Promotional Personalization

**Goal:** When the buyer lands on a PDP, an AI engine generates a **contextual, value-add offer** in real time (not a generic "-10%" coupon). The offer is *tied to the specific product/use-case*, e.g. *"Ensure optimal performance — join our certified installation webinar"* or *"Add 2-year reliability coverage tailored for this motor series"*.

**Brief's "must be visible" checks:**
- Promotion clearly tied to **product type + use case**
- **Not a static rule** ("if motor → show X") — copy must vary by context
- Generated copy varies per context (multi-product walkthrough proves this)

### Demo flow

| Step | What demo audience must see |
|------|------------------------------|
| 1. PDP entry | John navigates to `AYB-04369900` TOUGHBOOK PDP |
| 2. AI-generated promo (in-place, **not a banner**) | Below the price block, a contextual offer card: *"Field-ready in 24h — book our certified TOUGHBOOK provisioning webinar (free for orders over $2k) — covers OS hardening, MDM enrollment, accessory pairing."* CTA: **Register for webinar** |
| 3. Show context variation | Navigate to a different PDP (e.g., `SP600463` panoramic camera) — different offer appears: *"Get installation-ready: pre-configured PoE switch + cabling kit for this 4K series — adds <$300, saves 2 hours on-site."* CTA: **Add installation kit** |
| 4. Show variation by buyer | (Mention) "If you logged in as a different org with no past TOUGHBOOK orders, the offer would emphasize *training* over *fast provisioning* — the model conditions on customer history" |
| 5. Actionable CTA | Click "Register for webinar" → confirmation modal / cart line for the service SKU |

### Required test data (to seed on virtostart)

| Item | Purpose |
|------|---------|
| Service SKU: `WEBINAR-TOUGHBOOK-PROV` (or similar) — $0 or small fee | "Register for webinar" CTA target |
| Service SKU: `WARRANTY-TOUGHBOOK-2YR` — $189 (10% of unit price) | "Add warranty" alternative offer |
| Service SKU: `INSTALL-KIT-CAMERA` — $279 | Camera alt PDP offer target |
| Category: `Services` | Hold the above SKUs |

Service SKUs can be `productType: Physical` with `weight: 0` and `dimensions: 0` (or `productType: Service` if the storefront supports the distinction).

### What the partner provides

- **Static rule engine** = Virto native (price lists, promotions module — *if* a fixed rule "TOUGHBOOK → show webinar SKU" is acceptable as a fallback)
- **Generated copy** = **partner** (OpenAI / Anthropic / VC Pages module + GenAI plugin)
- **Real-time conditioning on buyer history** = partner (RAG over order history)

### Evidence to capture

- TOUGHBOOK PDP screenshot with the contextual offer card
- Camera PDP screenshot showing *different* offer copy (proves context-dependence)
- Cart after clicking the CTA — service SKU added with bundle pricing
- (Optional) Console showing the prompt sent to the GenAI service, for the technical-buyer credibility moment

---

## Sub-scenario 2b — AI-Powered "Solution Bundling" Bots

**Goal:** When a buyer adds a core component to cart, the system **instantly** offers a value-add bundle — *"The Complete Maintenance Kit"* — containing all technically-compatible accessories (gaskets, lubricants, tools) at a **bundled value price**.

**Brief's "must be visible":**
- Bundle is **technically compatible** (not generic cross-sell)
- Pricing is bundled value (not separate SKUs only)
- Immediate cart update on accept
- UI hint with reasoning: *"Based on: motor specs, compatibility rules, historical purchases"*

### Demo flow

| Step | What demo audience must see |
|------|------------------------------|
| 1. Add core product | John adds TOUGHBOOK `AYB-04369900` × 1 to cart |
| 2. Bundle suggestion appears in-cart | Within ~1 sec, a card slides in: **"Complete TOUGHBOOK Field Kit — $389 (save $116 vs. individual)"** — lists: rugged carry case, vehicle dock, extended battery, 2-yr warranty |
| 3. Compatibility reasoning | Tooltip / hint: *"Based on: TOUGHBOOK 40 mk2 specs (12.4" screen, slim chassis), our compatibility rules + 4 similar past purchases by buyers in your industry"* |
| 4. One-click add | "Add bundle" — all 4 SKUs added; cart line shows bundle pricing $389 not $505 list sum |
| 5. Cart re-renders | Total updated; bundle line is collapsible (audience sees the 4 SKUs underneath) |

### Required test data (to seed)

| SKU | Product | Price | Bundle membership |
|-----|---------|------:|-------------------|
| `AYB-04369900` (exists) | TOUGHBOOK 40 mk2 | $2,259 | Anchor |
| `TB-CASE-01` (seed) | TOUGHBOOK Rugged Carry Case | $129 | Bundle item |
| `TB-DOCK-VEH` (seed) | TOUGHBOOK Vehicle Dock | $199 | Bundle item |
| `TB-BAT-EXT` (seed) | TOUGHBOOK Extended Battery | $89 | Bundle item |
| `WARRANTY-TOUGHBOOK-2YR` (also used in 2a) | 2-Year Warranty | $89 | Bundle item |
| **Bundle: `BUNDLE-TB-FIELD-KIT`** | Complete TOUGHBOOK Field Kit | **$389** (bundled price; $506 if bought separately = $117 saved) | Master bundle SKU |

Bundle wiring: native Virto promotions module can create a "Buy A → discount on B,C,D" rule, but a **proper bundle SKU** (productType=Bundle or with bundleParts) is cleaner. Either works visually for the demo.

### What the partner provides

- **Bundle pricing rules** = Virto native (catalog bundles + promotion engine)
- **Compatibility rules / RAG** = **partner** (vector store over product specs + past-purchase data → "what fits with what")
- **Real-time in-cart trigger** = Virto storefront xAPI + storefront cart-event hook

### Evidence to capture

- Cart screenshot immediately after adding TOUGHBOOK — bundle card visible
- Tooltip / hint screenshot showing the "Based on: …" reasoning
- Cart after clicking "Add bundle" — all SKUs listed, bundle total $389
- Admin view of the bundle definition (proves it's a real bundle, not a hallucination)

---

## Sub-scenario 2c — Predictive "At-Risk" Retention Offers

**Goal:** AI agent identifies a behavioral shift (decreased login frequency, searches for alternative specs, cart abandonment) on a previously-loyal buyer, and **proactively triggers a high-value Concierge Promotion** — free technical audit, temporary upgrade to Priority Fulfillment, dedicated CSM. Goal: prevent churn before it happens.

**Brief's "must be visible":**
- Trigger based on **behavioral signal**, not random campaign
- Offer is **high-value** (service / operational benefit, not "-10% off")
- System action **modifies account/order conditions** (entitlement applied, fulfillment flag set)

### Demo flow

| Step | What demo audience must see |
|------|------------------------------|
| 1. Set the behavioral shift (narrated) | "John was logging in 5×/week and placing 4 orders/month. Over the last 14 days: 1 login, 0 orders, 3 product searches for *alternative SKUs* (Lenovo ThinkPad rugged, Dell Latitude rugged) — competitive-substitution searches." |
| 2. AI detects pattern (admin or AI dashboard) | (Show admin or CSM dashboard) "At-risk accounts" widget lists John with a confidence score — *"82% churn risk in next 30 days"* |
| 3. AI triggers concierge promotion | (Choose 1 channel — depends on what's wired) **(a) email preview:** subject *"Your TechFlow account — free technical audit on us"*; **(b) portal banner** at top of John's storefront on next login; **(c) sales-rep dashboard** notification *"John Mitchell — high-value retention offer ready to send"* |
| 4. Offer content | Two options visible: *"Schedule a free 1-hour technical audit with our certified team"* (service entitlement) OR *"Upgrade to Priority Fulfillment for the next 30 days, free"* (fulfillment flag) |
| 5. Action path | Click "Accept offer" → backend applies the entitlement (audit task created in admin / fulfillment-priority flag toggled on John's account / etc.) |

### Required test data

| Item | Purpose |
|------|---------|
| Behavioral signal data | **Narrated** for the demo (real signal pipeline = partner). Reference John's existing 20 orders as "established baseline cadence" |
| Service SKU: `SERVICE-TECH-AUDIT-1H` — $0 (concierge offer, no charge) | "Accept offer → free audit" path |
| Customer attribute: `priorityFulfillment: boolean` (dynamic property on org) | Demonstrates the entitlement change in admin after accepting |

### What the partner provides

- **Behavioral analytics pipeline** = **partner** (e.g., Mixpanel/Amplitude/custom — login frequency, search-pattern analysis, cart-abandonment tracking)
- **Churn-risk scoring model** = **partner** (ML model)
- **Notification delivery** = Virto native via `vc-module-push-messages` (we already proved this works in Demo 1b)
- **Entitlement application** = Virto native (dynamic properties + promotion rules)

### Evidence to capture

- Admin or AI dashboard showing John flagged as at-risk with confidence score
- The triggered notification (push bell + body content) — same mechanism as Demo 1b
- After accepting: the modified account state (priorityFulfillment=true, or audit task created)

---

## Demo run-of-show (suggested ~10-min flow)

| Min | Step | What happens |
|----:|------|--------------|
| 0–1 | Stage | Log in as John on virtostart, show /account/orders (continuity with Demo 1) |
| 1–4 | 2a — Personalization | TOUGHBOOK PDP → contextual offer; switch to camera PDP → different offer; show variation |
| 4–7 | 2b — Bundling | Add TOUGHBOOK to cart → bundle suggestion appears with compatibility tooltip → one-click add |
| 7–9 | 2c — Retention | Switch to admin/CSM view → at-risk dashboard → trigger concierge offer → show entitlement applied |
| 9–10 | Wrap | Three new mechanics shown: contextual copy, intelligent bundling, churn prevention. AOV impact narrated. |

---

## Pre-demo prep checklist

- [ ] Seed service SKUs (Section 2a + 2c) and bundle parts (Section 2b)
- [ ] Wire the bundle SKU + bundled price in admin Catalog → Bundles (or as a promotion rule with bundle discount)
- [ ] For 2a: prepare GenAI-prompt fixtures OR rule-based offer rules tied to product category (TOUGHBOOK → webinar; camera → install kit). Whichever is wired, narrate the gap during demo.
- [ ] For 2c: pre-populate an "At-risk dashboard" view OR a sales-rep notification — even a mocked admin page is fine for the demo
- [ ] Run through end-to-end once 24h before the prospect call — bundle add can have race conditions on cart event hooks; verify reload behaviour
- [ ] (Optional) Record a video fallback for any flow that depends on partner integrations (GenAI copy generation, behavioral analytics)

---

## What Virto provides natively vs. partner

| Capability | Virto native | Partner |
|------------|:-----------:|---------|
| Product catalog, PDP, cart, checkout | ✅ | — |
| Bundle / kit catalog modeling | ✅ | — |
| Promotion rules (incl. tier pricing, "Buy A → discount on B") | ✅ via promotion module | — |
| Service SKUs (registered as catalog items) | ✅ | — |
| Push notifications (used in 2c) | ✅ via `vc-module-push-messages` (proven in Demo 1b) | — |
| Dynamic properties on accounts (entitlement flags) | ✅ | — |
| **Generative copy** for promotional one-liners (2a) | — | OpenAI / Anthropic / VC Pages + GenAI plugin |
| **RAG / compatibility-rule engine** (2b) | — | Vector store + LLM (custom or via partner) |
| **Behavioral analytics & churn-scoring** (2c) | — | Mixpanel / Amplitude / custom ML pipeline |

---

## Files & references

- Sibling demos: [demo1-conversational-buying-fixtures.md](demo1-conversational-buying-fixtures.md) (Demo 1 — uses same John on virtostart)
- Demo brief source: pasted in chat 2026-05-11 (Andy Hoar — *"You can use partners to meet the demo requirements if you lack the functionality natively"*)
- Existing seed scripts (model after these for 2a/2b service SKU seeding): [scripts/seed-orders-virtostart.js](../../scripts/seed-orders-virtostart.js)
- Push message scripting (re-usable for 2c retention offer): [scripts/send-restock-push-vcst.js](../../scripts/send-restock-push-vcst.js) — adapt for virtostart by changing env loader

---

## Open items / pre-demo gaps

| Item | Owner | Notes |
|------|-------|-------|
| Seed service SKUs (`WEBINAR-*`, `WARRANTY-*`, `INSTALL-KIT-*`, `SERVICE-TECH-AUDIT-*`) | unowned | Needed for 2a CTAs to land somewhere real |
| Seed bundle parts (`TB-CASE-01`, `TB-DOCK-VEH`, `TB-BAT-EXT`) + master bundle | unowned | Needed for 2b |
| Wire bundle pricing (admin Catalog → Bundles or promotion-rule) | unowned | Visual fidelity |
| Wire (or mock) at-risk dashboard for 2c | unowned | Could be a single page in admin; narrate the AI/analytics pipeline |
| Decide GenAI copy approach for 2a — partner-live vs. pre-recorded | unowned | Affects demo risk; default to partner-live with recorded fallback |
