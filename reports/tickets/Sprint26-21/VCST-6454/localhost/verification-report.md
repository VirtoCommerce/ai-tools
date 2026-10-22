# VCST-6454 — verify-fix report (storefront, localhost PR build)

**Verdict: FIX VERIFIED, 10/10 checklist items PASS.** No regression found. Two incidental issues seen, both also present on the pre-fix control (see below). Nothing filed, ticket not touched.

| | |
|---|---|
| Build under test | `http://localhost`, theme `vc-theme-b2b-vue-2.61.0-pr-2599-aadc`, header `X-VC-Local-Theme: fe-169714872a92` (checked with curl), API proxied to vcst-qa, store B2B-store |
| Control (pre-fix) | `vcst-qa-storefront`, theme `2.61.0-pr-2570-2fc9`, same backend and catalog |
| Lane / user | playwright-chrome (Chromium), 1920x1080, guest. axe-core 4.10.2 from cdnjs, read-only `axe.run` only |
| Data | Vintage Wedding cake `/product/c94d730a-…45e8` (5 sections), Bed with Additional Options `/product/c7205a92-…a70b` (2 sections) |
| Date | 2026-10-22 |

## Results

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | RED baseline on control | PASS (bug reproduced) | Cake, default state: axe `label` critical on **3** nodes. All 5 sections expanded: **18** AX radios, **18 unnamed**, axe `label` = **18**. Radiogroups are named (Top, Buttercreme style, Filing, Flowers, Message Tag). Bed (Pillow expanded): 4 radios, 4 unnamed, `label` = 4 |
| 2 | GREEN x3, cake, all expanded | PASS | Run 1 / 2 / 3: 18 radios, **0 unnamed**, axe `label` **0**, 18 radio `label` passes each run. Run 1 default state (before expanding): `label` 0 |
| 3 | GREEN x3, Bed, all expanded | PASS | Run 1 / 2 / 3: 4 radios (`Foam mattress extendable bed, 80x200 cm`, `…IKEA 160x200 cm`, `Pillow 50X60`, `None`), 0 unnamed, axe `label` 0 |
| 4 | Root cause | PASS | axe pass nodes show `aria-label` on the `<input type=radio class=vc-radio-button__input>` itself: product name (e.g. `aria-label="Flowers: Roses"`), and `aria-label="None"` on the 4 `value="none"` inputs. No visually-hidden text added. The 5 radiogroups keep their section names |
| 5 | Selecting an option | PASS | Flowers: None -> Roses. Radio becomes checked; header `Flowers Flowers: Roses`; checklist `Flowers — Flowers: Roses` (completed); price $268.00/$264.00 -> $300.00/$296.00 (+$32, the Roses price) |
| 6 | Keyboard (BL-A11Y-001) | PASS | ArrowDown on focused Roses moves selection and focus to Lily (header updates to `Flowers: Lily`). Tab leaves the radio to the row's product link, Shift+Tab returns to the checked radio. Focus ring visible (screenshot 05) |
| 7 | Add to cart (guest) | PASS | Configured cake (Flowers: Lily) added: badge `1`, button becomes `Update cart`, `in Cart 1`; `/cart` line $287.00, subtotal $287.00, total $344.40. Line removed afterwards (cart empty) |
| 8 | Console / network vs control | PASS | Console errors on both builds are only image load failures (ikea/gforces/magnific 404, starmarket/gstatic DNS, ORB). Localhost adds the known SalesRep `mf-manifest.json` 404. HAR: 0 GraphQL `errors[]` on localhost (151 calls) and control (32 calls); no 4xx/5xx on our own hosts other than the known SalesRep 404 |
| 9 | "None" translated | PASS | Switched to Deutsch: the none radio is named **`Keine`**, the section is `Parameter konfigurieren`; axe `label`/`aria-input-field-name`/`button-name` 0 (6 radio passes, Top + Flowers expanded). Screenshot 06 |
| 10 | BL-A11Y-002 rule set, cake expanded | PASS | Control: `label` 18, `image-alt` 4, `button-name` 0, `aria-input-field-name` 0, `link-name` 0. Localhost: `label` **0**, `image-alt` 4 (same nodes, unchanged), others 0. No new violations |

Note on data: the kb entry recorded 8 Bed radios earlier. Today both builds render 4 on that PDP, so the counts here are like-for-like between control and fix.

## Incidental findings (not caused by the PR, present on the control)

1. **None-row placeholder image has no `alt`.** axe `image-alt` critical, 4 nodes on the expanded cake and 1 on Bed, on both builds: `img.vc-image--fallback` inside `.option-product-none[data-test-id=none-option]`. It is decorative, so it needs `alt=""`. It breaks the zero-violation bar of BL-A11Y-002 for this page, which is why the page is not fully clean even with the fix. The same component (`option-product-none.vue`) is touched by PR 2599, so it could be fixed there. kb `KB-83C7E8A4`.
2. **Switching language on the cake PDP can land on 404.** Seen on localhost: en-US `/product/{id}` -> Deutsch (`/de/products-with-options/dreamy-cakes/vintage-wedding-cake`, OK) -> first "English" (en-GB, OK client-side) -> second "English" (en-US) -> `/products-with-options/dreamy-cakes/vintage-wedding-cake` shows "404 Page not found" (screenshot 07). A direct load of `/en-GB/products-with-options/dreamy-cakes/vintage-wedding-cake` on the control also shows 404, so the PR did not cause it. Also, the language list has two entries both named just "English" (en-GB and en-US), which neither a screen reader nor a sighted user can tell apart. Cause not isolated (per-culture slug likely). kb `KB-F19B15C1`.

Not a defect: after removing the line on `/cart`, the header badge took about 4 s to clear. Line controls are briefly disabled while the cart loads. Both settle on their own.

## Evidence

The defect itself is non-visual (accessible names). The screenshots only show that the layout is unchanged; the proof is the AX tree plus axe counts above.

- `screenshots/01-control-cake-config-expanded.png`: control, all sections expanded
- `screenshots/02-local-cake-config-expanded.png`: fix build, all sections expanded (looks the same as 01)
- `screenshots/03-local-bed-config-expanded.png`: fix build, Bed expanded
- `screenshots/04-local-flowers-keyboard-focus.png`, `05-local-lily-radio-focus-ring.png`: keyboard selection and focus ring
- `screenshots/06-local-de-flowers-keine.png`: German locale, `Keine` option
- `screenshots/07-local-engb-to-enus-404.png`: incidental 2
- AX snapshots: `test-results/chrome/control-cake-radios.txt`, `control-bed-page.yml`, `local-cake-run1-config.yml`, `local-cake-run2-page.yml`, `local-cake-run3-page.yml`, `local-bed-run{1,2,3}-page.yml`
- HAR (lane): `test-results/chrome/har/session.har`

## Knowledge base

- Asked: `kb_ask` before testing; opened `KB-FF7C9595` (pre-fix defect). `KB-F4FD0938` (source cause) was listed but not opened.
- `kb_confirm KB-FF7C9595` on vcst_qa (theme pr-2570) with defect marker `VCST-6454`.
- `kb_capture KB-ED048B71`: fixed behaviour on the PR 2599 build (deployment `localhost`).
- `kb_capture KB-83C7E8A4`: None-row image without alt (suspected defect).
- `kb_capture KB-F19B15C1`: language switch 404 on the PDP (suspected defect).
- Queued locally; they publish on the next kb push.

## Cleanup

Guest session only. The one cart line created in item 7 was removed (cart empty). The language was set back to English (United States). No accounts or orgs were created.
