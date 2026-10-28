# /qa-design — the component explorer flow (Step 3, Phase B)

A supporting file of [`SKILL.md`](SKILL.md): Step 3 Phase B for a **component** target, moved here verbatim. A page or flow target skips it — the page is the context (`SKILL.md` Step 3, *Page or flow target*).

**Component explorer flow (Phase B for components):**

1. **Find where the component is used across the storefront** — produce a confirmed candidate list, then pick up to 3 contexts.

   **Step 1.1 — Source-code grep (authoritative)** via GitHub MCP `search_code` against `VirtoCommerce/vc-frontend`:

   ```
   search_code(query="<{Component} repo:VirtoCommerce/vc-frontend", per_page=30)
   search_code(query="{Component} repo:VirtoCommerce/vc-frontend extension:vue", per_page=30)
   ```

   The first query catches `<VcTable …>` PascalCase usage. The second catches kebab-case usage `<vc-table …>` and dynamic mounts. Combine results, dedupe by file path.

   **Step 1.2 — Map file path → storefront URL** for each match:

 | File-path pattern | Storefront URL |
 |---|---|
   | `client-app/pages/{page}.vue` or `pages/{page}/*.vue` | `/{page}` (top-level route) |
   | `client-app/pages/account/{view}.vue` | `/account/{view}` |
   | `client-app/pages/company/{view}.vue` | `/company/{view}` |
   | `client-app/shared/cart/*.vue` | rendered on `/cart` (and possibly in mini-cart dropdown — note: needs probe) |
   | `client-app/shared/checkout/*.vue` | rendered on `/cart` (single-page checkout) |
   | `client-app/shared/catalog/*.vue` | rendered on `/catalog`, PDP, and category pages |
   | `client-app/shared/layout/header*.vue` | rendered on **every** page (header / nav slot) |
   | `client-app/shared/layout/footer*.vue` | rendered on **every** page (footer slot) |
   | `client-app/shared/modal/*.vue` | conditional — triggered by an action (e.g., select-address, ship-to popover) — needs probe |

   When a match is in a shared partial, also read the partial via GitHub MCP `get_file_contents` and trace which page imports/embeds it (`search_code` for the partial's filename in `.vue` files) to find the final mount point.

   **Step 1.3 — Cross-check against the curated map** — read [critical-ui-scope.md](../../knowledge/critical-ui-scope.md) Render-Location Map. For in-matrix components, the curated locations are high-confidence; treat them as candidates first, then add any GitHub-discovered locations the curated map missed (and surface the gap in the report).

   **Step 1.4 — Live probe to confirm rendering** — for each candidate URL, before audit:
   - Navigate via ui-ux-expert (real-user click-through — NOT direct deep-linking unless that IS the natural entry).
   - Run `document.querySelectorAll('{selector}').length > 0` (selector from [storefront-selectors.md](../../knowledge/storefront-selectors.md) or matrix row).
   - Keep candidates where the component actually mounts; drop candidates where it doesn't (some usages are conditional on auth state, cart contents, feature flags, B2B vs B2C store, etc.).
   - For conditional mounts, capture the precondition in the report (e.g., "VcLineItem renders on /cart only when cart has ≥ 1 item — precondition: `[PRE:RESET_CART]` + add SKU before audit").

   **Step 1.5 — Pick the 3 contexts** for audit, ordered by priority:
   1. **Primary context** — the matrix-row path for in-matrix components (always first), or the discovered path for off-matrix components.
   2. **Adjacent context** — a confirmed-rendering URL from Steps 1.1–1.4 that's distinct from the primary (different page type if possible: e.g., for `VcButton`, primary `/cart` (CTA), adjacent `/catalog` (filter/sort buttons)).
   3. **Contrast context** (optional, 3rd slot) — a context that pressures a *different* invariant:
      - Component on a page with long content → stresses BL-UI-004 overflow.
      - Component on a page with sticky parent → stresses BL-UI-003 state-shift.
      - Component inside a modal → stresses BL-UI-006 touch targets at 375 px.
      - Skip if no such context exists or if the first two already cover all in-scope invariants.

2. **Bound the enumeration** — audit **at most 3 contexts**. If the candidate list is longer:
   - Prefer contexts that exercise different invariants (don't pick three pages that all exercise the same one).
   - Prefer high-traffic / revenue-critical pages (`/cart`, `/catalog`, PDP) over edge pages.
   - Log skipped candidates in the report under "Not audited — out of budget" so the user can re-run for them later.

3. **Audit each context** — for each enumerated URL:
   - Navigate via real-user interaction (click nav, follow links — NOT direct deep-link unless that IS the natural entry path).
   - Wait for the component to mount + paint (no skeletons, no FOUC).
   - Run the resolved invariant audits at 375 / 768 / 1280.
   - Capture rect snapshot + computed-style sample per invariant; screenshot only on FAIL.

4. **Cross-context analysis** — after all contexts are audited, compute per-invariant outcome across contexts:
   - **Stable PASS** — invariant passes in every context. No issue.
   - **Stable FAIL** — invariant fails in every context. Component-level bug; fix at the component.
   - **Context-specific FAIL** — invariant fails in only some contexts. Integration bug; the *failing context* is where to fix (parent layout, page-level CSS, real data overflow).

- Output: `reports/tickets/{SPRINT}/qa-design/{target-slug}-{YYYY-MM-DD}/storefront/{context-slug}/` per context — screenshots only for FAIL.
