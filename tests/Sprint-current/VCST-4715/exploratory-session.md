# Exploratory Session — VCST-4715 "Add default option support" (configurable products)

- **Charter:** Feature / SFDPOT (Data + Function emphasis). Stress default-option preselection at integration boundaries & data edges.
- **Env:** vcst-qa storefront @ theme `2.50.0-pr-2278-3eec`, store B2B-store, user BMW-Group / Elena Mutykova (session persisted). Browser: playwright-firefox.
- **Date:** 2026-05-27 · **Timebox:** ~20 min · HAR: `test-results/firefox/har/` (auto).
- **Products:** CFG-030 flat (`@td(CFG_WITH_DEFAULT.*)`), CFG-031 conditional (`@td(CFG_WITH_DEFAULT_COND.*)`).

## Verdict
Default-option preselection **works correctly** on PDP (flat + conditional), on mobile, in cart, and in edit-from-cart mode. Price recomputes correctly on every override. **No product bugs found.** One data-integrity issue (seed metadata vs live platform mismatch) and a couple of observations/risks below.

## Findings

| # | Class | Area | Finding |
|---|-------|------|---------|
| 1 | **Question→Resolved (no bug)** | Data | Seed-results JSON + alias `_notes` claim **Carbon ($200)** is CFG-030's default (expect $300 preselected). Live `productConfiguration` xAPI returns **Aluminum ($0)** as `isDefault=true`. Storefront correctly preselects Aluminum → Price $100. The storefront is right; the **seed metadata is stale/wrong**. Initial "default not preselected" read was a false positive — retracted after second-source xAPI check (per project policy). |
| 2 | **Observation (pass)** | Function | CFG-030 flat: default Aluminum preselected on load (radio checked, collapsed header = Aluminum, Price $100 = base $100 + $0). Selecting Carbon → header/price update to $300 live. |
| 3 | **Observation (pass)** | Function/Time | Override does **not** persist across reload: refreshing CFG-030 after selecting Carbon re-applies the platform default (Aluminum, $100). PDP is correctly stateless. |
| 4 | **Observation (pass)** | Cart boundary | Adding default Aluminum to cart → cart line unit & total = **$100.00**; Components list records "1. AGENT-TEST-CFG-030-A-Aluminum"; "Edit configuration" deep-link present (`?lineItemId=…`). Cart faithfully records the preselected default. |
| 5 | **Observation (pass)** | Edit-from-cart | "Edit configuration" reopens PDP in edit mode with CTA **"Update cart"** and the **cart's** selection restored (Aluminum, $100) — the default does **not** clobber the saved choice. |
| 6 | **Observation (pass)** | Conditional cascade (load) | CFG-031: parent Base Choice=Standard (default, $0) preselected → reveals dependent Add-on, which itself shows its own default Warranty ($25) preselected even while collapsed. Price $175 = base $150 + $0 + $25. Both-level defaults cascade correctly on load. |
| 7 | **Observation (pass)** | Conditional cascade (parent change) | Changing parent Standard→**Deluxe** ($80): dependent Add-on **retains** its Warranty default (section stays mounted — revealed by either parent option), Price recomputes to **$255** (150+80+25). No default loss, no stale price. |
| 8 | **Observation (pass)** | Optional dependent override | Add-on is optional (`isRequired=false`) and exposes a **"None"** option. Overriding Warranty→None: header switches to "Personalize your selection further (optional)" empty-state, Price drops to **$230** (150+80+0). Correct. |
| 9 | **Observation (pass)** | Platform / mobile | At 375px viewport, both CFG-031 defaults (Standard + Warranty) preselect identically; Price $175. No mobile regression. |
| 10 | **Risk** | Operations / a11y | Configuration radio `<input>` is visually hidden (label-driven); several MCP clicks on the radio/img refs hit Playwright stability/pointer-interception timeouts, while clicking the visible `.vc-product-card__media` option card works. Real users are unaffected, but this hints at a possibly fragile click target / intercepting overlay on option rows — worth a quick a11y/keyboard-navigation check (can the radiogroup be operated by keyboard?). Not filed as a bug. |
| 11 | **Risk** | Data hygiene | The CFG-030 alias `_notes` and `_seed-results-cfg-default-20260527.json` are out of sync with the live config (finding #1). Any scripted test asserting "Carbon default / $300" will false-fail. **Recommend:** reseed CFG-030 so Carbon is genuinely `isDefault=true`, OR correct the alias/seed-results to reflect Aluminum-as-default. Until then, do not author assertions against the $300 expectation. |

## Coverage of charter focus areas
- Default ↔ conditional cascade — ✅ load + parent-change + override-to-None all verified (#6,7,8).
- Default ↔ cart boundary — ✅ cart line price + components list + edit-from-cart (#4,5).
- Override + persistence — ✅ reload resets to default; edit-mode restores cart choice (#3,5).
- State edge cases — partial: None/empty state covered (#8). Out-of-stock/disabled default option **not** reached (no such seeded option; not forced).
- Admin↔storefront timing — **not exercised** (no Admin toggle performed this session; deferred).
- Platform / mobile — ✅ 375px preselection (#9).

## Evidence (screenshots/)
- `cfg030-default-NOT-preselected-aluminum.png` — initial (Aluminum default; misread vs stale seed, see #1)
- `cfg030-after-refresh-resets-to-default.png` — override not persisted (#3)
- `cfg030-edit-mode-from-cart.png` — Update-cart edit mode (#5)
- `cfg031-mobile-375-defaults-preselected.png` — mobile cascade (#9)
- `cfg031-parent-changed-deluxe-warranty-retained-255.png` — cascade on parent change (#7)

## Notes
- Second-source verification used for finding #1 (live `productConfiguration` xAPI vs UI) per `feedback_verify_payload_bugs_second_source`.
- No disabled controls forced. Test data left in cart: 1× CFG-030 Aluminum line (AGENT-TEST-* — sweepable via `/qa-seed-data teardown`).
