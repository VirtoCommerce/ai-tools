# Testing checklist — VCST-6442 (permalink conflicts) · vcptcore-qa · 2026-10-28

Build: PageBuilderModule 3.1039.0-pr-179-5c9d · Pages 3.1011.0-pr-24-8c93 · XCMS 3.1009.0-pr-28-7ebe · Platform 3.1091.0-pr-3144-e637 · theme 2.61.0-pr-2601-8058
Oracle: comments 112272 (decision), 112407 (ACs), 112409 (conflict rule). Model: `test-model.md`. Regression: REG-2026-10-28-1917.

## Admin — page builder (112407 Admin 1–8)

| # | Condition | Result | Evidence |
|---|---|---|---|
| A1 | Create/save with a used permalink allowed; warning lists other pages (same / any language), not Archived, not itself | PASS — names are plain text, **no links** (112272 "links to them") | 4a-adm-a1-*.png, CMS-PC-002/003 |
| A1d | Warning debounce reflects the final value only | PASS | 4a-adm (edge) |
| A2 | Certain conflict → confirm unpublish; Cancel changes nothing; Confirm → other Draft, this Published, content intact | PASS | 4a-adm-a2-*.png, CMS-PC-011 (dialog part) |
| A3 | Other page has unpublished changes → refused, nothing changes (UI + API 409 even with unpublishConflicting) | PASS | 4a-adm-a3-refused.png, CMS-PC-005 |
| A4 | Possible conflict → confirm only; both stay Published. {VIP,gold} over {gold} = Certain, {gold} over {VIP,gold} = Possible (direction-dependent — AC example ambiguous) | PASS | 4a-adm-a4-*.png, CMS-PC-007/008/010 |
| A5 | No prompt: general vs specific, other org/language, non-overlapping, expired | PASS | 4a-adm-a5-*.png, CMS-PC-012/013 |
| A6 | Any language next to store default (en-US) = equally specific; vs de-DE = None | PASS | CMS-PC-009 |
| A7 | Public vs private for the same user group = equally specific | PASS | CMS-PC-006 |
| A8 | permalink-usages None/Possible/Certain; 409 {error, conflicts} lists Certain only; unpublishConflicting resolves | PASS | CMS-PC-014 |
| A8b | Restricted role (builder:read): usages 200, publish 403 | PASS | CMS-PC-015 |
| G1 | Case / leading-slash variants are one permalink; " //X " rejected 400 at create | PASS {OBSERVED} | CMS-PC-004 |
| G2 | Touching dates (end = start) = Possible; +1 s = None | PASS {OBSERVED inclusive} | CMS-PC-012 |
| G11 | Clone → change to original's permalink → Certain dialog; Load content → warning | PASS | 4a-adm-g11-*.png |
| G11b | `POST /grouped` with status Published | **FAIL — bypasses the check, two Published** → VCST-6601 (High) | CMS-PC-026 |
| G12 | Two concurrent publishes of Certain-equal drafts | **FAIL — both 200, both Published (1/4, 1/5)** → VCST-6602 | CMS-PC-027 |
| G13 | permalink-usages with null / "" body | FAIL — 500 instead of 400 (Low, not filed) | CMS-PC-028 |
| UI | Double-click Publish / Confirm → one request | PASS | 4a-adm-dblclick-*.png |

## Frontend — choice between pages (112407 Frontend 1–4)

| # | Condition | Result | Evidence |
|---|---|---|---|
| F1 | Everyone + org A: user of A gets A page; user of another org (TechFlow, BuildRight) and anonymous get everyone page | PASS (browser + xAPI) | 4a-fe-F1-*.png, CMS-PC-016 |
| F2 | Everyone + VIP: anonymous never VIP; VIP member gets VIP | PASS | 4a-fe-F2-*.png, CMS-PC-017 |
| F2b | Registered-only preferred over public for a signed-in visitor | PASS | CMS-PC-018 |
| F2c | Language: {any, en-US} → en-US page for en-US/de-DE/fr-FR; {any, de-DE} → en-US gets any | PASS | CMS-PC-019 |
| F3 | Equally specific: most recently changed wins (5/5), flips after republish; legacy duplicates (/bkp-test01, /same_landing_page) stable and = rule (page-row ModifiedDate, not group) | PASS | 4a-fe-F3-*.png, CMS-PC-020/023 |
| F4 | Right after republish the page does not render empty | **FAIL — 404 from cached slug (old page id)** → VCST-6603 | 4a-fe-F4-*.png |
| F5 | Permalink whose only page is another org's → normal 404, no content leak | PASS | 4a-fe-F5-*.png |

## xAPI (112407 Frontend xAPI 1–4)

| # | Condition | Result | Evidence |
|---|---|---|---|
| X1 | pageDocuments: anonymous / other org do not find org-A page; user of A does | PASS (real org-B users) | CMS-PC-021 |
| X2 | pageDocument(id): null for anonymous / other org; page for user of A; errors[] empty | PASS | CMS-PC-021 |
| X3 | pageDocument(id) null for Draft / Archived | PASS | CMS-PC-022 |
| X4 | Admin without org → only any-org pages | PASS | CMS-PC-021 |
| X5 | Org taken from the token, not a client argument | PASS | CMS-PC-024 |

## Visual (4v) — `design-report.md`
vs. DESIGN SKIPPED (no design link) · overflow 1920/1280 PASS · WCAG on banner + dialogs PASS · de/ru i18n PASS ·
popup "Confirm" contrast 4.01:1 → VCST-6604 (shared framework) · 1024 px not verified.

## Not covered / blocked
- #16 (403 on unpublishConflicting without rights on the other page): unreachable — builder:* has no scopes; Forbidden branch is dead code. Question to dev.
- CMS-PC-011 / CMS-130 republish-content round trip via Designer: BLOCKED — Designer Save stays disabled after adding a Text block (needs review, not this ticket).
- CMS-ML-019, CMS-GQL-133/134: BLOCKED — VCST-4935 multilanguage builds not deployed. CMS-082: no Wholesaler-group contact.
- Builder.io pages are invisible to the conflict check (by design, G3).

## Not filed (below severity floor)
Low: null/"" body on permalink-usages → 500 · `userGroups` as array on POST /grouped and create-group-page → 500 · create-group-page without content + userGroups → 500 ·
grouped/archive ignores ids in the body · warning names not links · warning stale after another page is renamed · focus not moved into the 2nd chained dialog ·
Load content silently ignores an unknown JSON shape · popup chrome English in de/ru · "Show more" untranslated in ru · destructive confirm emphasis inverted · "Unpublish them" for one page.
