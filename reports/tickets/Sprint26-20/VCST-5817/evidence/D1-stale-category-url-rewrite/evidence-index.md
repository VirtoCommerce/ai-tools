# D1: evidence index (stale category URL rewrite)

Candidate from VCST-5817 `/qa-test` triage. Investigation only. No bug report written, nothing filed.
Date 2026-10-09 · browser `playwright-edge` (Edge, 1920x1080) · anonymous · store B2B-store · API vcst-qa.

| Build | Origin | Footer version | Verdict |
|---|---|---|---|
| TEST (with PR #2522) | `http://localhost` | `Ver. 2.60.0-pr-2522-6f90-6f902c9e` | **REPRODUCED** (natural timing + delayed) |
| CONTROL (without PR #2522) | `https://vcst-qa-storefront.govirto.com` | `Ver. 3.0.0-alpha.2685` | **REPRODUCED** (natural timing + delayed) |

Note: CONTROL is not "2.60 minus #2522". It is the current dev alpha line deployed on vcst-qa. It still answers the question that matters: the
defect appears on a build that does not carry #2522.

## Repro steps (both builds)
1. Open `/printers/multifunction-printers/laser-monochrome` and wait 2.5 s.
2. Click the breadcrumb **Laser Printers** (SPA navigation to `/printers/multifunction-printers`).
3. After `GetSlugInfo` resolves (the category component mounts and sends `GetCategory`), and **before** `GetCategory` returns,
   click the header **Cart**, or type `laser` and press Enter in the header search.
4. Wait about 3 s and read `location.href` and the page `h1`. Then reload and press Back.

The window is the `GetCategory` latency, about 0.4–0.55 s with no throttling. A click on Cart before `GetSlugInfo` returns does
NOT trigger it, because the category component has not mounted yet (TEST run 1: URL stayed `/cart`). Delay runs held `GetCategory`
for 2000 ms via `page.route` (`/* @allow-eval: D1 repro delay */`). All clicks and typing were real-user locator actions.

## Observed values (`location.href` and h1, ms from the start of the script)

### TEST: Cart, natural timing
| t | event | href | h1 |
|---|---|---|---|
| 2584 | click breadcrumb | | |
| 3166 | resp GetSlugInfo | | |
| 3206 | req GetCategory ×2 | | |
| 3291 | click Cart | | |
| 3696 | +0.4 s | `http://localhost/cart` | Cart |
| 3751 / 3759 | resp GetCategory ×2 | | |
| 7015 | +3 s | **`http://localhost/printers/multifunction-printers`** | **Cart** (title "QA & Cart") |

### TEST: Cart, GetCategory delayed 2 s
| t | event | href | h1 |
|---|---|---|---|
| 3306 | click Cart (GetCategory pending since 3223) | | |
| 4108 | before response | `http://localhost/cart` | Cart |
| 5889 | GetCategory fulfilled | | |
| 7124 | after | **`http://localhost/printers/multifunction-printers`** | **Cart** |
| reload | | `http://localhost/printers/multifunction-printers` | **Laser Printers 11 results** |
| Back | | `http://localhost/printers/multifunction-printers` | Laser Printers 11 results (`history.length` 7; the `/cart` entry was overwritten, so Back lands on an entry with the same URL) |

Screenshot: `test-pr2522-cart-delayed-final.png` (Cart page shown while the URL is the category).

### TEST: global search, GetCategory delayed 2 s
| t | event | href | h1 |
|---|---|---|---|
| 3341 | scope chips while GetCategory pending: `[]` (no category chip yet, so the search is global) | | |
| 3479 | type `laser` + Enter | | |
| 4494 | +1 s | `http://localhost/search?q=laser` | Your search for laser returned the following |
| 5847 / 5933 | GetCategory fulfilled | | |
| 7512 | after | **`http://localhost/printers/multifunction-printers?q=laser`** | Your search for laser returned the following **19 results** |
| reload | | `http://localhost/printers/multifunction-printers?q=laser` | **Search for "laser" in Laser Printers, 9 results found** (scope chip "Laser Printers") |

Screenshots: `test-pr2522-search-delayed-final.png`, `test-pr2522-search-after-reload.png`.

### CONTROL: Cart, natural timing
| t | event | href | h1 |
|---|---|---|---|
| 2805 | resp GetSlugInfo | | |
| 3000 | req GetCategory ×2 | | |
| 3014 | click Cart | | |
| 3375 / 3515 | resp GetCategory ×2 | | |
| 6438 | +3 s | **`https://vcst-qa-storefront.govirto.com/printers/multifunction-printers`** | **Shopping cart** (title "QA & Shopping cart") |

Screenshot: `control-cart-natural-final.png`.

### CONTROL: Cart, delayed 2 s, then reload and Back
| t | href | h1 |
|---|---|---|
| 3784 (before response) | `…/cart` | Shopping cart |
| 6806 (after response) | **`…/printers/multifunction-printers`** | **Shopping cart** |
| reload | `…/printers/multifunction-printers` | **Laser Printers 11 products found** |
| Back | `…/printers/multifunction-printers` | Laser Printers 11 products found |

### CONTROL: global search, delayed 2 s
| t | href | h1 |
|---|---|---|
| 4045 | `…/search?q=laser` | Your search for laser returned the following 19 products found |
| 7262 | **`…/printers/multifunction-printers?q=laser`** | same, **19** products |
| reload | `…/printers/multifunction-printers?q=laser` | **Search for "laser" in Laser Printers, 9 results found** |

Screenshots: `control-search-delayed-final.png`, `control-search-after-reload.png`.

## Console and network
- No JS exception and no Vue warning during any run. The only console errors were `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`
  on external `*.all.biz` product images (CORP noise from the catalog data, unrelated).
- All `/graphql` calls returned 200. `GetCategory` fires **twice** per category mount on both builds.
- The URL rewrite fires only on the `GetCategory` response. It happens with no network request and no router navigation (`history.replaceState`).

## Screenshots in this folder
The screenshots show no address bar, so the URLs are the `location.href` values in the tables above.
`test-pr2522-cart-delayed-final.png` · `test-pr2522-search-delayed-final.png` · `test-pr2522-search-after-reload.png` ·
`control-cart-natural-final.png` · `control-search-delayed-final.png` · `control-search-after-reload.png`
