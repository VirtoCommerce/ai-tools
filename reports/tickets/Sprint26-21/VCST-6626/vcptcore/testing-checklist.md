# Testing checklist — VCST-6626 Merge 61 Release to Next

Build: vc-frontend-next PR #19 @ 4507f3ae · footer `3.2.0-pr-19-4507-4507f3ae` · vcptcore-qa (B2B-store) · Model: test-model.md (S1–S50) · Round 1, 2026-11-02
Source of conditions: dev checklist comment 2026-10-30 (8 areas) → AC-1…AC-27 (1d) + gap-ACs + 3x amendments. Status column is filled at 5-report.

Accounts (type the login as text, the password as its bare NAME):
- buyer: USER_EMAIL / `USER_PASSWORD`
- profile buyer (disposable, safe to edit): @td(VCST6626_PROFILE_BUYER) agent-test-mfa-vcst6626-customer-confirmed@example.com / `TEST_USER_PASSWORD`
- MFA buyer (per-user 2FA): @td(VCST6626_MFA_PER_USER_2FA) agent-test-mfa-vcst6626-per-user-2fa@example.com / `TEST_USER_PASSWORD`; code: `TEST_ENV=vcptcore node <scratchpad>/mfa-code.mjs <email> --wait`
- sales rep: SALES_REP_EMAIL / `TEST_USER_PASSWORD` (7 customers; org for activity: 105c2c4e-23be-4258-8691-568a0ff190be)
B2B-store sign-in is code-first (OTP on): use "Sign in with a password instead" for password sign-in.
Data: per-culture-slug product Affligem Dubbel 24x30cl Bottle (en `alcoholic-drinks/beer/affligem-dubbel-24x30cl-bottle`, de `…-bottle-de`) · category `alcoholic-drinks/beer` · single-language page `/new-page` (en-US) · two-language page `/qa-return-policy` (en-US + de-DE) · physical `books/notebook-red-panda-a5-45-sheets` · digital `snacks/sauces/snack-game`.

## A1 Language switch (#2576, #2604) — lane chrome
| # | Condition | Model | Status |
|---|---|---|---|
| B1 | PDP Affligem en → Deutsch: URL `/de/<de slug>`, SAME product renders (3x saw a different product — reproduce first) | S50, AC-1 | FAIL — de switch shows "30L Keg": same product id localized so in de-DE; catalog data, PRE-EXISTING (control) |
| B2 | PDP + category de → English: same page, no prefix | S2, AC-2 | PASS |
| B3 | `/new-page` (en-US only) → Deutsch: fallback page shows, no 404 | S3, AC-3 | PASS (/bkp-test01; /new-page rewrites its URL via Custom Category block) |
| B4 | same page, third hop (→ fr-FR, then en-GB → en-US): still the page, not 404 | S4, AC-4 | PASS |
| B5 | B1–B4 via the mobile menu language selector at 375 px | S5, AC-5 | PASS (375, /agent-test-single-language-en) |
| B6 | Browser Back after switching back to default: previous page, not 404 | S6 ({HYPOTHESIS} KB-912B0774) | FAIL — 404, PRE-EXISTING → VCST-6656 |
| B7 | `/qa-return-policy`: `<link rel=alternate hreflang>` for en-US + de-DE + x-default, using the store host; absent on `/new-page` | S7 | NOT VERIFIED — hreflang tags client-rendered; real-user hook blocks reading <link> |

## A2 Mobile menu highlight (#2458) — lane edge
| B8 | Sales rep at 375 px on `/company/activities?organizationId=…`: the mobile menu lights "My customers' activity" (text + icon), not "My activity" | S8, AC-6 | PASS — premise corrected: plugin has no "My customers' activity"; customer activity lights "My customers" |
| B9 | `/compare` at 375 px: only Compare is lit, icon and text agree | S9, AC-7 | PASS |

## A3 Cart sections (#2564) — lane chrome; SINGLE-PAGE FIRST, then MULTI-STEP
| B10 | Physical cart, single-page: Shipping, Payment, Order comment shown, theme spacing | S10, AC-8 | PASS |
| B11 | Digital-only cart (Snack game): Shipping hidden, Payment shown | S11, AC-8 | PASS |
| B12 | Incomplete payment: the warning names only visible sections | S12 | PASS (generic warning, names no section) |
| B13 | Regular user: "Place order" present, no "Create requisition" (punch-out positive BLOCKED — module absent) | S13, AC-9/10 | PASS — negative on vcptcore-qa; positive on a local build of 4507f3ae against vcptcore-qa1 (setup 200 → "Punchout mode" → "Create requisition", no quote → PunchOutOrderMessage posted with the cart: SKU 6022122 ×1 $233.00, BuyerCookie echoed) |
| B14 | MULTI-STEP, local build http://localhost:3626 (same tree, `checkout_multistep_enabled=true`, backend vcptcore-qa): cart shows no checkout sections; the button opens the checkout steps; a step page renders. Result labelled "local build" | S14, AC-11 | PASS — local build of 4507f3ae, multi-step on |

## A4 GA4 lists (#2594, #2598) — lane chrome (read window.dataLayer)
| B15 | Category page 1 → scroll to page 2: page-2 `view_item_list` holds only new items, list id `_page_2` (VCST-6453 retest) | S15, AC-12 | PASS |
| B16 | `select_item` on a page-2 product: page-2 list id + its own index | S16, AC-13 | PASS |
| B17 | Sort change, then click: index from the new order | S17 | PASS |
| B18 | Signed in, cart → saved for later click: `select_item` list `saved_for_later` + index; impression fires once | S18, AC-14 | PASS |
| B19 | Compare 3 products, click column 3: `select_item` index 2 | S19, AC-15 | PASS |
| B20 | PDP opened from a category click: count `view_item` (and on a direct load). Then the same on the pre-merge build for A/B — if unavailable, record Next counts only | S20, AC-16 | PASS — 1 view_item per visit (base: GA off in dev build) |
| B21 | Sign-in: one `login` event; user_properties set | S21 | PASS |
| B22 | Search dropdown + wishlist click: `select_item` with index | S22 | PASS |
| B22a | GA-035/036/058 products_block markup, on an AGENT-TEST Page Builder page (the Next home `/` is the built-in demo-home with no products_block by design): guest vs org-scoped buyer list events, Customize → select_item, related/variations/recommended/recently-browsed payloads | GA-035, GA-036, GA-058 | PASS |

## A5 Profile and address field errors (#2597) — lane edge, profile buyer
| B23 | Profile last name "Tester2" → message under Last name, no toast; restore original | S23, AC-17 | PASS |
| B24 | Two fields, one rejected: edit it → only its message clears; a non-field error still toasts | S24 | PASS (field leg); non-field toast not provokable |
| B25 | Add-address modal with a rejected value → field message, modal stays open; nothing created | S25, AC-18 | PASS |

## A6 MFA + OTP sign-in (#2570, X6) — lane edge
| B26 | MFA buyer, password path on /sign-in → code step with its header | S26, AC-19 | PASS |
| B27 | Same on the static-page sign-in section (home login section) | S26 | PASS (on AGENT-TEST login page, window) |
| B28 | Wrong code → inline error, stays on the code step | S27, AC-20 | PASS |
| B29 | Right code (from the journal) → signed in | S28, AC-21 | PASS |
| B30 | Resend inside the cooldown / after it; Back to password keeps the email | S29 | PASS |
| B31 | Buyer without the flag: password sign-in completes in one step | S30 | PASS |
| B32 | OTP (code-first) for the buyer: request, wrong code error, right code signs in | S31 | PASS |

## A7 Security page (#2601) — lane edge (CDP virtual authenticator)
| B33 | "Security" link in the account rail and in the mobile account menu; `/account/security` opens | S32, AC-22 | PASS |
| B34 | Page lists the Passkey method (store authTypes Password, GoogleSSO, Passkey) | S33, AC-23 | PASS |
| B35 | Add a passkey → rename: new name without reload | S34, AC-24 | PASS |
| B36 | Delete: Cancel keeps it; Confirm removes it without reload | S35, AC-25 | PASS |
| B37 | Anonymous `/account/security` → sign-in with returnUrl | S36 | PASS |
| B38 | Edit/Delete icon buttons have accessible names incl. the key name; modal focus trapped | S37 | FAIL Low (names lack key name; focus PASS) — not filed |

## A8 Sales Rep Hub — lane edge
| B39 | Rep: header link → hub dashboard + My customers render; chunks served from `/modules/` | S38, AC-26/27 | PASS |
| B40 | Buyer: no hub link; `/company/dashboard` redirects to `/account/dashboard` | S39 | PASS |
| B41 | Boot: one GetStorePlugins request, no blocking | S40 | PASS |

## Merged changes the checklist never named — lane chrome unless noted
| B42 | Cart line of a product with no max quantity: +1 and typing 10 work (max===0 rule removed) | S41 | PASS |
| B43 | Bulk order paste: spaces/newlines accepted; trailing comma, 10-digit qty rejected with the message | S42 | FAIL Low, PRE-EXISTING — not filed |
| B44 | Quotes pages after a hard reload: no raw i18n keys (VCST-6452 retest) | S43 | PASS (VCST-6452 fixed) |
| B45 | Configurable "none" radio + barcode file input have accessible names (VCST-6454 retest) — edge | S44 | PASS ("None" radio named; barcode by source) |
| B46 | A GraphQL action that fails with several errors: one toast; no "Report a problem" on field errors — edge | S45 | PASS partial (no Report-a-problem; one-toast leg not provokable) |
| B47 | Contact with null first/last name (MULTI_ORG pattern) — app shell still renders (triage only; do not alter that account) — edge | S46 | TRIAGED → VCST-6658 (PRE-EXISTING) |

## Storybook — visual lane 4v
| B48 | Storybook = Next build (fork component present) — {OBSERVED} 3x | S47 | PASS (3x) |
| B49 | VcTileButton / VcStatWidget: states, light + dark, 375/768/1920, keyboard, axe | S48 | PASS layout; a11y F1 contrast Low — not filed |
| B50 | Changed kit components vs the pre-merge Storybook (quantity stepper, inputs, modals) | S49 | PASS — pixel diff 0 regressions |

Not run, by decision: MFA StoreMode window (per-user flag used instead; no shared setting written).
