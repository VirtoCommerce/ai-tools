FAIL r2 (High, IN-SCOPE) — PUT ML root: (a) permalink → a live standalone page's permalink: 200, en+de stay Published on it, usages Certain, slugInfo serves the ML version, standalone shadowed; (b) root org A → null: same | 4a-be (14a/14b) |FAIL r2 (High, IN-SCOPE) — PUT /grouped on a PUBLISHED page: (a) permalink → a live Certain-equal page's permalink: 200, both Published, usages Certain, slugInfo switches to the moved page, the other page is never served; (b) audience org A → everyone: same. Reproduced independently by the orchestrator (2 groups Published, usages Certain). Reachable from the landing-page form Save | 4a-be (13a/13b) + orchestrator repro |PASS r2 — en-US everyone + de-DE overridden to org A: others get alternates [en-US] only, de-DE falls back to en-US, no hreflang; org A gets de-DE + hreflang de-DE/en-US/x-default | 4a-be + 4a-fe-r2-12-*.png |PASS r2 — org-A ML page: anonymous / TechFlow / Watermelon / BuildRight get slugInfo null, pageDocument null, no errors[]; storefront 404 (signed-in) / sign-in redirect (anonymous, store has anonymousUsersAllowed=false), no hreflang; org A gets both versions + alternates [de-DE,en-US] | 4a-be + 4a-fe-r2-11-*.png |PASS r2 — ML root Save confirms "… is already used by: … This is fine for other visitors or dates; publishing checks for conflicts. Save anyway?"; old sentence gone. Note: first save of a new root (no versions) does not confirm; the confirm moves to Create version | 4a-ui-r2-R2-10-*.png |PASS r2 — warning under the field "Other pages use this permalink: … This is fine for other visitors or dates; publishing checks for conflicts."; Save without a dialog | 4a-ui-r2-R2-09-*.png |PASS r2 — 5 rounds publish-all ‖ single publish: always exactly 1 live en-US page, both outcomes seen, no hang/5xx | 4a-be |PASS r2 — single publish 409 conflicts[Certain, canUnpublish]; dialog "Already published at this permalink for the same visitors: …. Unpublish them and publish this page?"; Cancel no request; Confirm → version Published, standalone Draft | 4a-be + 4a-ui-r2-R2-07-*.png |PASS r2 — Possible ({gold} over {vip,gold}; dated over evergreen) publishes; evergreen over dated = Certain → skipped (consistent with the classifier) | 4a-be |PASS r2 — publish-all 200 {processedCultureNames:[de-DE], skipped:[{en-US, PermalinkConflict}]}; UI toast "Not published: en-US. Another page is published at this permalink for the same visitors. Publish these languages one by one to replace it."; standalone stays Published | 4a-be + 4a-ui-r2-R2-05-*.png |FAIL r2 (Low) — swagger.json: grouped/publishing has no summary/description; none of the module's 67 operations has XML docs (source has the /// summary) | 4a-be swagger.json |PASS r2 — 6/6 rounds: one 200 + one 409 (both sides won), loser Draft; next publish 409 in ~270 ms, unpublishConflicting 200 | 4a-be |PASS r2 — POST /grouped (status+pages Published) → 200, group Draft; also without pages[] and on a free permalink; live page stays the only Published | 4a-be (run ks8j2) |# Testing checklist — VCST-6442 (permalink conflicts) · vcptcore-qa · 2026-10-28

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

---

# Round 2 — 2026-10-29 · vcptcore-qa

Build: PageBuilderModule 3.1041.0-pr-179-5e6c · Pages 3.1013.0-alpha.93-vcst-6442 (commit 57823a4 = pr-24-5782) · XCMS 3.1010.0-pr-28-35cb · Platform 3.1091.0-pr-3144-e637 · theme 2.61.0-pr-2608-86ad
Oracle: comments 112508, 112509 (+ 112409 rule). Model: `test-model.md` §Round 2 (#27–#39). Round-1 rows above are kept as they were.

## Fixes re-tested

| # | Condition | Result | Evidence |
|---|---|---|---|
| R2-01 | POST /grouped with status Published (+ pages[] Published) next to a live Certain-equal page → created as Draft, live page untouched, never two Published (VCST-6601) | | C1 CMS-PC-026 + 4a |
| R2-02 | Two concurrent publishes of Certain-equal drafts, 5 attempts → exactly one 200 + one 409 each time; loser stays Draft; next publish after a 409 is not stuck (VCST-6602) | | C1 CMS-PC-027 + 4a |
| R2-03 | permalink-usages without a page (no body / null) → 400, no stack trace | PASS r2 (1r probe: 400 "The page is required." for both) | 1r probe, C1 CMS-PC-028 |
| R2-04 | Swagger description of grouped/publishing names Certain (409) and Possible (200) | | 4a |

## New in this build (112508/112509)

| # | Condition | Result | Evidence |
|---|---|---|---|
| R2-05 | ML page en-US + de-DE drafts; standalone live en-US everyone page on the same permalink → Publish all: en-US "Not published", de-DE published, standalone still Published (UI message + API result) | | PENDING-A + 4a |
| R2-06 | Same, standalone conflict only Possible → Publish all publishes it | | PENDING-A + 4a |
| R2-07 | Skipped version published alone from its language → unpublish offer; confirm → version Published, standalone Draft | | PENDING-A + 4a |
| R2-08 | Publish all and a single publish of the competing page at the same moment → never two live | | 4a |
| R2-09 | Landing-page form: duplicate permalink → warning under the field, Save without a confirmation | | 4a (Admin UI) |
| R2-10 | Multilanguage Page form: Save with a used permalink still confirms; text no longer says the storefront shows only one page per permalink | | 4a (Admin UI) |
| R2-11 | xAPI alternates of an org-A ML page: anonymous / org B get none of the org-A versions; org A gets them (pageDocument + slugInfo) | | PENDING-A + 4a |
| R2-12 | ML page: en-US everyone, de-DE overridden to org A → alternates of en-US exclude de-DE for anonymous / org B, include it for org A; storefront `<link rel="alternate">` matches | | PENDING-A + 4a (storefront) |

## Bypass probes (model #30, #31 — {HYPOTHESIS})

| # | Condition | Result | Evidence |
|---|---|---|---|
| R2-13 | PUT /grouped on a PUBLISHED page: permalink → one a Certain-equal live page serves; and audience org A → everyone over a live everyone page → is a second live page created without the check? | | PENDING-A + 4a |
| R2-14 | ML page with published versions: PUT root permalink (and audience) to collide with a live standalone page → does propagation make two live pages? | | PENDING-A + 4a |

## Carried from round 1
- VCST-6603 → VCST-6614 (vc-frontend, To do): not part of this ticket; not re-run.
- Round-1 C1 BLOCKED rows (CMS-ML-019, CMS-GQL-133/134 — 4935 builds were missing): the builds are deployed now → in C1.
- Round-1 Lows: usages null/"" fixed (R2-03); userGroups-as-array 500 = by design (112508); UI follow-ups (warning not refreshed, focus) deferred by dev.
