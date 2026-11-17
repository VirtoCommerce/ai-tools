# "Merge NN Release to Next" checklists → test cases

**Sources:** Jira tickets VCST-6841 (release 62, vc-frontend-next#23), VCST-6626 (release 61, #19),
VCST-6398 (release 60, #11); each one's dev checklist comment. VCST-6194 (release 59) has no
checklist. **Synced:** 2026-11-17.

**What each status means:**
- **NXR-***: suite 122, Next Release-Merge Regression, new.
- **NXT-***: suite 121, Next P0 Smoke.
- **vc-frontend case**: an existing case written for vc-frontend. It covers the upstream behaviour
  that was merged into Next, so it stands as functional evidence for Next. It is never edited to
  match Next's look.
- **Visual lane**: the checklist line is "looks as on `dev`". A case cannot assert that without a
  reference image, so `/qa-visual-regression` checks it (Next head vs `dev`).
- **Not covered**: no case anywhere.

## Release 62 (VCST-6841)

| Checklist item | Covered by |
|---|---|
| Fonts (Inter body, Geologica headings), plate radius and colours, light and dark | NXR-001 · plates: visual lane |
| Widget titles sentence case, weight 600 | NXR-002 |
| Configurable product section spacing as on `dev` | Visual lane |
| Print (cart, order details): chrome hidden | NXR-003 |
| Compare count "2" from the icon centre, read as "Compare: 2" | NXR-004 |
| Cart 150+ → "99+", exact count in the tooltip and the accessible name | NXR-005 |
| Empty cart → no badge; mobile link "Cart" | NXR-006 |
| Mobile menu Compare row pill, read as "Compare: N" | NXR-007 |
| Dark mode badges use the primary fill | NXR-008 |
| Pinned header keeps badges on their icons | NXR-009 |
| Dashboard heading at every width | NXR-010 |
| Dashboard cards, recent orders with status chips, "All orders" | NXR-011 · NXT-025 |
| Dashboard edit: hide, show, reorder (drag, keyboard), rows, Save, Cancel, Reset, persists | NXR-012, NXR-013 · row-count change: not covered |
| User with no orders sees "Continue browsing" | NXR-014 |
| Cards and widgets match the theme, light and dark | Visual lane |
| Widget plates, paddings, header heights, title sizes as on `dev` | Visual lane |
| Widget with a marked head: one row, no rule under it | Visual lane |
| Loading skeletons match the loaded widget | NXR-015 |
| Mobile sticky Place order keeps 8 px top spacing | NXR-016 |
| Cart line images contained, on the image background | NXR-017 |
| Product images contained; fallback scaled down | NXR-017 |
| Form labels caption style; asterisk not part of the name | NXR-018 |
| Card number and CVV labels show; clicking them throws nothing | NXR-019 |
| Long coupon code wraps in its button | NXR-020 |
| Dark mode header and account rail as on `dev` | Visual lane · badges: NXR-008 |
| Footer as on `dev`, hidden in print | Visual lane · print: NXR-003 |
| Two-factor managed on Security and Company info (#2622) | vc-frontend case: 110a MFA-050, 111 |
| Passkey focus kept; key buttons named after the key (#2640, #2637) | vc-frontend case: 114 PKS-023, PKS-024 (Draft, Next-gated) |
| Members table fits its card (#2638) | NXR-021 (open bug VCST-6873 under Failure signals) |
| Company info does not throw when the organization becomes empty (#2647, #2612) | Not covered (needs an org emptied mid-session) |
| Removing the search scope chip returns focus to the input (#2634) | vc-frontend case: 004 (keyboard focus rows) |
| A late category load keeps the URL of the page on screen (#2633) | NXR-022 |
| Compare does not freeze at the compact-header width (#2613) | NXR-023 |
| Longer address Line 1 and Line 2 (#2642) | NXR-024 |
| Edit-quote address modal pages and searches (#2424) | Not covered |
| Cart and checkout checkbox and method-selector names (#2587, #2632) | NXR-025 · vc-frontend case: 028 CART-126 |
| Narrow line items respect "show placed price" (#2588) | Not covered |
| VcCheckbox and VcTextarea announce their error state (#2629) | Not covered: the cart's Order comment has maxlength=1000 and never errors (REG-2026-11-17-1257); NXR-026 now checks only the 1000 limit |
| Opening a popover does not scroll the page (#2608) | NXR-027 |
| Mission progress bars and the completed check (#2591, #2590) | vc-frontend case: 083c (sprint 26-22 GAP-30) |

## Release 61 (VCST-6626)

These rows were written or repaired by the VCST-6626 run on 2026-11-02. They live in vc-frontend
suites, carry a Next build gate and are still Draft.

| Checklist item | Covered by |
|---|---|
| Language switch: prefix added and removed; a one-language page never 404s; mobile selector | 046 L10N-001..006 |
| Mobile menu highlight (My customers' activity, Compare) | 033 AUTH-078, AUTH-079 |
| Cart sections; an all-digital cart hides Shipping | 028 CART-119, CART-120, CART-121 |
| Punch-out session hides sections, shows the order message | 107 PNCF-* (punch-out suites) |
| Multi-step checkout: no sections in the cart | 028 CART-122 (local build only: the flag is compiled in) |
| GA4 lists, select_item index, view_item once | 043 GA-061..067 |
| Profile and address field errors, no toast | 033 AUTH-080..082 |
| MFA code step | 111 MFASF-014 and 111 |
| Security page link in both menus; rename and delete a key | 114 PKS-023, PKS-024 |
| Sales Rep Hub from the plugin, no built-in routes | NXR-033 · 093b SR-HD-100 |

## Release 60 (VCST-6398)

| Checklist item | Covered by |
|---|---|
| Compare: All / Differences tabs, "Differ: N of M rows", sticky header, aligned scroll | NXR-028 · 098 CMP-* |
| Compare on a phone: tabs and "Clear category" in one bar | NXR-029 |
| Configurable product: checklist states, "Review" scrolls, SKU readable in dark | 072f (configuration checklist) · dark SKU: visual lane |
| Quantity above the allowed range explained under the line (cart) | NXR-030 · quotes do not explain it, same as upstream vc-frontend#2533 |
| "Punchout mode" label placement, 1024 px fit, gone on sign-out | 107 PNCF-006, PNCF-008 (needs the Punchout module) |
| Sales Rep Hub opens; looks like the upstream hub | NXR-033 · 093b |
| Missions: skeletons, rewards banner to the loyalty catalog | NXR-031 |
| Organization returns read-only | NXR-032 |
| File attach limits and messages | Not covered |
| view_item_list and select_item carry the list id and name | 043 |

## Not covered (5) and next steps

The 5 uncovered items are: Company info with an emptied organization, the quote address modal,
"show placed price" on narrow lines, the dashboard row-count change, and the file attach limits.

- **Visual lane:** run `/qa-visual-regression` for the 9 "as on `dev`" lines on each merge PR.
- **Status:** suite 122 cases are `{SPEC}` (taken from the checklists and Next source) and stay
  Draft until they are run on virtostart.
