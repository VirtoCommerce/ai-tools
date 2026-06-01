# Adversarial Heuristics — Heuristics for Breaking the App

CRISP/SFDPOT ask *"does it work well?"*. The heuristics here ask *"how do I make it fail?"*. Use them when your charter is **Risk** or **Edge-Case**, or when CRISP/SFDPOT exploration has gone clean and you suspect there are still bugs lurking.

These supplement — they do not replace — CRISP and SFDPOT. Pick one or two per session; don't try to run all of them.

---

## 1. Whittaker's Tours (James Whittaker, *Exploratory Software Testing*)

Tours model how different kinds of testers think. Each forces a specific lens on the same feature, often surfacing bugs the obvious flow misses.

| Tour | Mindset | What to do | What it finds |
|------|---------|------------|---------------|
| **Garbage Collector** | Inventory-keeper | Visit every menu item, every link, every footer entry, every settings tab. Don't go deep — touch each surface once. | Dead links, 404s, broken navigation, orphaned pages, unauthorized routes that should be gated |
| **Bad Neighborhood** | Detective at a crime scene | Go to the modules with the worst bug history (check `MEMORY.md` + recent JIRA bugs). Poke around there. | Regressions in chronically fragile areas (in VC: Apollo cache, virtual-catalog link, Configurable Products, promotion engine) |
| **Couch Potato** | The laziest possible user | Pass through every screen doing the minimum — click Next/OK with nothing filled in, accept all defaults, never type. | Missing required-field validation, empty-state crashes, broken defaults, unsafe "Continue" buttons |
| **Antagonistic** | The contrarian | Do the *opposite* of what the app expects. Cancel everything. Type negative numbers. Pick the wrong option. Click No when asked Yes. | Brittle happy-path assumptions, missing cancel handlers, state corruption on rejection |
| **Saboteur** | Someone trying to break it on purpose | Deliberately trigger every error path. Invalid input, network drop mid-request, force 4xx/5xx via DevTools, kill the tab and reopen. | Error recovery gaps, partial-state writes, unhandled exceptions, ugly error pages |
| **Obsessive-Compulsive** | Someone with infinite patience | Do the same action 50 times. Submit the same form. Add the same item. Refresh repeatedly. | Memory leaks, rate-limit gaps, race conditions, duplicate detection failures, idempotency bugs |
| **Supermodel** | A pure visual reviewer | Look at every visual element. Resize from 1920 → 320. Zoom 50% → 400%. Rotate to portrait. Toggle dark mode. Print-preview the page. | Layout breaks, overflow, focus rings cut off, contrast failures, print-stylesheet gaps |
| **Lonely Businessman** | The user nobody designs for | Use the corners of the app — Help, Terms, FAQ, About, account settings nobody touches, deprecated routes, admin tools you've never opened. | Stale content, broken settings, orphaned features, security holes in low-traffic admin paths |
| **All-Nighter** | The user who never logs out | Stay on one page for 6+ hours. Come back to a half-filled form the next morning. | Token expiry handling, idle-timeout UX, stale CSRF, draft persistence |
| **Tourist** | A first-time user who's confused | Open the app for the first time. Try to find a specific thing without using your knowledge of where it is. Read every label. | Discoverability gaps, hidden navigation, jargon, poor IA, missing onboarding |

### Selection guide

- **Recent code change in a high-risk module** → Bad Neighborhood + Saboteur
- **Pre-release smoke for a feature** → Garbage Collector + Couch Potato
- **Stress test for stability** → Obsessive-Compulsive + All-Nighter
- **Visual/UX-focused session** → Supermodel + Tourist
- **Security-flavored exploration** → Antagonistic + Lonely Businessman

---

## 2. FAILURE Mnemonic (James Bach)

A 7-letter checklist of attack categories. Easy to remember mid-session; covers most "did I miss a class of bug?" gaps. Use as a final pass before debrief.

| Letter | Category | Probes |
|--------|----------|--------|
| **F** | **Flow & state** | Out-of-order steps, skip a step, repeat a step, reverse a step, navigate away and return, refresh mid-flow, two browser tabs with conflicting state |
| **A** | **Authentication & authorization** | Log out mid-action, expired token, switch user, switch org/role, direct-URL to a gated page, IDOR (change an ID in the URL to one you don't own) |
| **I** | **Inputs** | Empty, max length, max length +1, special chars (`'`, `"`, `<`, `>`, `&`, `\`, null byte), Unicode (emoji, RTL, combining marks), leading/trailing whitespace, scientific notation in numbers, negative zero |
| **L** | **Language & locale** | Switch language mid-flow, switch currency mid-cart, RTL layout, long German compound words, comma-decimal locales (`1,50` vs `1.50`), date formats (`DD/MM` vs `MM/DD`), timezone with non-zero offset |
| **U** | **User scenarios** | Realistic end-to-end journeys (not feature-isolated). What would a real B2B buyer actually do over a week? Use **Soap Opera Testing** (§3) here. |
| **R** | **Returns / refunds / reverse flows** | Cancel, refund, return, undo, decline approval, abandon checkout, delete after creating. Reverse flows are typically far less tested than forward flows. |
| **E** | **Errors** | Force every error path you can. Network 500, network timeout, malformed response, validation error, expired session, server-side rejection of a client-side-accepted value. Check the message is actionable, not "Something went wrong". |

---

## 3. Soap Opera Testing (Hans Buwalda)

The premise: stack 6–10 **realistic-but-extreme** events into one story. Each event individually is plausible. Together, they form a scenario no scripted test would cover — but each event has a real-world precedent.

The test passes if the system survives the chain end-to-end without data loss, calculation errors, or workflow breakage. It fails if any step produces an inconsistency.

### Template

```
PERSONA: <who> wants to <goal>.

ACT 1: Setup
  - Step 1: <realistic event>
  - Step 2: <realistic event>

ACT 2: Complication
  - Step 3: <realistic event>
  - Step 4: <realistic event>
  - Step 5: <realistic event>

ACT 3: Resolution
  - Step 6: <realistic event>
  - Step 7: <realistic event>

ORACLE: <what should be true at the end>
```

### VC Soap Opera examples

**Soap Opera 1 — The Indecisive B2B Buyer**

> A procurement officer at TechFlow Corp wants to order parts for a remote site.

1. Browses catalog as guest, adds 3 configurable products to cart with custom text engraving
2. Signs into TechFlow Corp account — guest cart merges with saved cart that already contains 2 of those 3 products
3. Switches to a second org (consultant for another company), browses, adds a different product, switches back to TechFlow
4. Applies a coupon code from a marketing email; the coupon stacks with a tier discount the org already gets
5. Requests a quote, sends to manager for approval
6. Manager rejects; buyer modifies quantities (changes one configurable section), re-submits
7. Manager approves; buyer proceeds to checkout
8. At payment, the inventory for one variant has just dropped below the requested quantity
9. Buyer changes payment method from invoice to Skyflow card; session about to expire (29 of 30 min idle)
10. Places order

**Oracles:** Final order total matches the approved-quote total minus any item the buyer reduced; no double-counted coupons; correct line items survived the org switch; engraving text is preserved; payment receipt shows the correct org.

**Soap Opera 2 — The Multi-Tab Power User**

> A frequent buyer comparison-shops with 4 tabs open.

1. Tab A: signed in, browsing catalog
2. Tab B: same account, /account/orders, looking at a past order
3. Tab C: PDP for product X, qty stepper at 3
4. Tab D: cart with product X (qty 1) already in it
5. In Tab C, adds product X — Tab D now stale
6. In Tab D, ignoring staleness, applies a coupon, navigates to checkout
7. In Tab A, signs out
8. Returns to Tab B (orders page) and clicks an order detail
9. Returns to Tab D (mid-checkout) and clicks "Place Order"

**Oracles:** Tab D either reflects the sign-out (redirects to sign-in) or refuses the place-order; cart line-item quantity is consistent (3 + 1 or 4, not 1); no double-charge; no orphaned draft order in admin.

---

## 4. HICCUPPS-F Oracles (Michael Bolton, James Bach)

When you find something suspicious, the question is *"is this actually a bug?"*. **Oracles** are the references you compare against. HICCUPPS-F is the canonical checklist.

| Letter | Oracle | Question to ask |
|--------|--------|-----------------|
| **H** | **History** | Did this work before? Compare to the previous build/sprint/version. Check git blame on the related component. |
| **I** | **Image** | Does it match the brand/Figma/style guide? Does it match the rest of the app visually? |
| **C** | **Comparable products** | How do Shopify / Magento / WooCommerce / Amazon handle this same situation? |
| **C** | **Claims** | Does it match the JIRA AC, the README, the help docs, the marketing copy, the sales demo? |
| **U** | **User expectations** | What would a reasonable user expect? Would they be surprised? Would they file a support ticket? |
| **P** | **Product** | Is it internally consistent? Same action in two places should produce the same result. |
| **P** | **Purpose** | Does the feature actually accomplish its stated goal? Does it solve the user's real problem? |
| **S** | **Standards & statutes** | Does it comply with WCAG, GDPR, PCI-DSS, the OWASP top 10? Does it follow REST/GraphQL conventions? |
| **F** | **Familiar problems** | Is this a known bug pattern? Have you seen this exact failure mode in this app before? Check `vc-bug-catalog.md` + `e-commerce-edge-cases-library.md` + `MEMORY.md`. |

### Using oracles in practice

When you spot something odd:

1. **Note it**, but don't file yet
2. Walk down HICCUPPS-F — which oracle does this violate?
3. If two or more oracles agree it's wrong → file as a bug
4. If only one oracle disagrees → file as a Question (route to PM/dev)
5. If no oracle disagrees but it feels wrong → file as an Observation + a follow-up charter

This prevents "this looks weird to me personally" from becoming a noisy bug queue.

---

## 5. Combining heuristics in a session

A 30-minute session can run **one tour + one mnemonic pass**:

| Charter mission | Tour (primary) | Mnemonic (final pass) |
|-----------------|----------------|------------------------|
| Find regressions after a hotfix | Bad Neighborhood | FAILURE → focus on Flow + Errors |
| Validate a brand-new feature | Garbage Collector → Couch Potato | FAILURE → focus on Inputs + Authorization |
| Stress a high-risk integration | Saboteur + Obsessive-Compulsive | HICCUPPS-F → focus on Familiar problems |
| End-to-end workflow validation | Scenario Tour (from base SBTM) + 1 Soap Opera scenario | FAILURE → focus on Returns/Reverse flows |
| Pre-release UX review | Supermodel + Tourist | HICCUPPS-F → focus on Image + User expectations |

---

## See also

- [session-based-testing.md](session-based-testing.md) — Core SBTM framework, CRISP/SFDPOT
- [personas.md](personas.md) — Persona-driven exploration (different user lens)
- [modern-web-attack-surface.md](modern-web-attack-surface.md) — Browser-specific attack techniques
- [charter-library.md](charter-library.md) — Ready-to-use charters
- [../../../agents/knowledge/vc-bug-catalog.md](../../../agents/knowledge/vc-bug-catalog.md) — VC historical failure patterns (feeds Bad Neighborhood Tour + Familiar Problems oracle)
- [../../../agents/knowledge/e-commerce-edge-cases-library.md](../../../agents/knowledge/e-commerce-edge-cases-library.md) — Generic e-commerce ECL-* patterns
