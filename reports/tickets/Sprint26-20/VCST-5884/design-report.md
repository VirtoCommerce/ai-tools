# VCST-5884 design / a11y report — ROUND 3 (lane V re-run, Chromium via playwright-chrome)

**Build:** Return 3.1005.0-pr-28-fb4f, theme 2.60.0-pr-2523-4263-4263715a, platform 3.1078.0, env vcst_qa. Round 3 of 3.
**Theme served:** `coffee` (B2B-store white-labeling switched Mercury to coffee by the orchestrator for this lane, restored by the orchestrator). Step-0 proof: `:root` `--color-primary-500` = #996c5a, `--color-neutral-600` = #525252, `--color-neutral-400` = #a3a3a3 = the values in vc-frontend `client-app/assets/presets/coffee.json` @ 4263715 (not Mercury #f99e24); light scheme (`html` has no `dark` class).
**Source of expectations:** BL-UI-001..007 and BL-A11Y-001..004 verbatim from `bl:extract`; measurements are live (`getBoundingClientRect` / `getComputedStyle` / axe-core 4.10.2), never from the spec. Fixtures: holder GLOBAL (colleague RET261012-00018 Requested), LONG_NAME buyer (own org, one return), admin. One return created: RET261012-00025 (long-name buyer, spare1 order, submitted then cancelled).

## Verdict per axis
| Axis | Verdict |
|---|---|
| Invariant (BL-UI-004 content boundary, touch/cards) | **PASS** — no horizontal scroll, no overlap, no clipping without ellipsis at 375/768/1023/1024/1279/1280/1920 |
| Design-system / a11y (BL-A11Y-003, Coffee) | **PASS** — every text pair >= 4.5:1, "Requested by" 7.81:1 (was 2.52:1); axe 0 violations |
| vs DESIGN (V6) | **SKIPPED** — the ticket names no Claude Design project; never a pass |

## Rows
| # | Verdict | Measured |
|---|---|---|
| V1 | PASS | cards at 1023 (10/10), table at 1024; Date 112 / Buyer 128 (1024-1279) / 160 (1280+) / Status 144; 32-char unbroken name wraps (3 lines) inside its cell, text right edge <= status left at every width (e.g. 723 < 740 at 1024), cell scrollWidth = clientWidth |
| V2 | PASS | no mid-word break in Date or Status at any width; cards at 768 and 375 whole except the buyer name (contained); docScrollWidth = viewport - 15 (scrollbar) |
| V3 | PASS | "Requested by" rgb(82,82,82) on white = 7.81:1 at 1920 and 375; Status / Date / Order number labels same token 7.81:1; values #0a0a0a 19.8:1; org table text 19.0-19.8:1 incl. Status, Date, Buyer name; inactive tab label 4.74:1; Filters label and active page number 4.52:1 (margin 0.02 over 4.5); icons >= 4.52:1 (1.4.11); axe color-contrast 0 violations |
| V4 | PASS | Admin Return list 1920, fresh context, 0 `gridState` keys: 7 columns (Return number, Order number, Customer, Organization, Return status, Create date, Item count), labels whole, sort arrow on the sorted column, Item count text ends 1133 px, menu button starts 1138 px |
| V5 | PASS | console after create, submit and cancel: 0 errors, 0 warnings, no Apollo refetchQueries message (caveat: hosted build is a production bundle) |

## Findings (none new in the returns feature)
| ID | Sev | What | Cite |
|---|---|---|---|
| F1 | Low | Shared account sidebar breaks "Missions & challenges" / "Coupons & promotions" mid-word at 768-1279 px (also on /account/orders, so not returns); stays inside the card | BL-UI-004 spirit, caught by visual review, kb KB-3320D7D3 |
| F2 | Low / advisory | Buyer name wraps mid-word in the 128 px column (1024-1279) and in cards at 375 (contained, no overlap); the 60-char org tab label is cut with an ellipsis at 375 and at 1024 for the LONG_NAME org | BL-UI-004 PASS, advisory |
| F3 | Advisory | Tab toggle border #ebebeb on white (1.2:1); the selected state is carried by label colour (19.8 vs 4.74:1), weight and aria-pressed, so 1.4.11 is met by the other cues | WCAG 1.4.11 |
| F4 | Advisory | Admin grid: Create date / Customer cells end in an ellipsis (platform behaviour, not the returns change) | BL-UI-004 PASS |

Round-2 Low drafts (V2 date mid-word, V4 clipped headers, V5 Apollo warning) did not reproduce. One transient reading, document scrollWidth 1169 at 1024 immediately after a 1279 -> 1024 resize (the decorative `vc-container__bg` svg), was not reproducible in 3 re-measures (1009) — not a finding.
Known, not filed: VCST-6263..6267. Axe `incomplete` (manual): color-contrast 1-4 nodes (decorative bg / footer link, values measured above), VcWidget `aria-prohibited-attr`. Screen-reader output not verified (no tool).
Evidence: `screenshots/r3-4v-coffee-*.png`.
