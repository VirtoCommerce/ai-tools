# VCST-5680 — Fix Verification

**Ticket:** VCST-5680 · Bug · Low · `[vc-shell] Vendor Portal: Ctrl/Cmd+\ always expands the topmost blade, ignoring which blade has focus`
**Fix:** vc-shell PR [#298](https://github.com/VirtoCommerce/vc-shell/pull/298) (`bd938a138`), merged 2026-08-13
**Same-chord follow-up:** PR [#310](https://github.com/VirtoCommerce/vc-shell/pull/310) (`06cb54b4d`) — AI panel claims `mod+\` only while focused
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

**`@vc-shell/framework`** / Marketplace Vendor Portal (separate product — not the storefront, not the Platform Admin SPA).
Affected 2.4.0, fixed **2.5.0**. Verified against `main @ 324cd9b09` (= v2.5.0) and live on
`vcmp-dev.govirto.com/apps/vendor-portal/`, whose console banner independently reported
`@vc-shell/framework v2.5.0 · 2026-08-19T10:23:58Z · 2964ccbe3`.

## Summary

Blade keyboard shortcuts now act on the blade holding focus rather than the topmost visible blade. All six live
checks PASS on the deployed build, including the core STR the fix author could not run for lack of credentials.
The fix is correct — but **its own test suite cannot detect it regressing** (see Note 1), which is why the live
evidence, not the unit suite, is what carries this verdict.

## The ticket's premise was wrong, and the dev corrected it

The description asserts `Ctrl/Cmd+S` "correctly targets the active/topmost-with-focus blade … unlike
`Ctrl/Cmd+\`". In fact **neither** was focus-aware: `createShortcutDispatcher` resolved a single blade id from
`useBladeStack.activeBlade`, which walks the stack backwards and returns the last *visible* blade — no notion of
focus anywhere in the layer. The gap surfaced on expand and not on save only because expanding a middle blade is
something users want while saving one is rare. Consequence: the fix could not copy Save's behaviour; focus
targeting had to be built from scratch for **all** blade shortcuts. Verified against source — the dev's
correction is accurate.

## RED → GREEN (unit) — and what it does NOT cover

Scope: `shell/_internal/blade-navigation` + `core/blade-navigation`, run from `framework/` (the CI cwd).

| Probe | What was reverted | Result |
|---|---|---|
| **GREEN** | nothing (`main @ 324cd9b09`) | **179 passed (179)**, 3 consecutive runs |
| **RED-a** | only the `data-blade-id` marker (`vc-blade-slot.vue`) | **1 failed / 178 passed** — the marker *is* guarded |
| **RED-b** | only the `getActiveBlade` seam (`vc-blade-navigation-new.vue`) | **179 passed (179)** — see Note 1 |
| RED-c | the full PR (source + new test files) | 173 passed / 16 files — i.e. the PR added 6 tests |

Each probe reverse-applied only that hunk (`git apply --reverse --3way`), leaving everything else in place.
Evidence: `evidence/green-fixed.txt`, `evidence/red-a-marker.txt`, `evidence/red-b-wiring-UNGUARDED.txt`.

## Deploy gate (`evidence/deploy-gate.txt`)

`bd938a138` and `06cb54b4d` are both ancestors of `v2.5.0` and of neither `v2.4.0`. vcmp-dev's vendor-portal was
rebuilt 2026-08-24 and runs framework ≥ 2.5.0 — proven transitively via three markers that exist only in 2.5.0,
found in `vc-shell-vendors22260.js` (the real implementation) and absent from `vc-shell-framework22260.js` (a
re-export facade). The live console banner corroborated it independently.

## Live verification — all six PASS

Oracle discipline that mattered: **`vc-blade--maximized` is the shortcut's effect; `vc-blade--expanded` is not**
— the latter means "last blade fills remaining space" and is present at baseline on the topmost blade. Asserting
on the wrong class would have manufactured a false PASS.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | **Core STR** — focus in the middle blade, `Ctrl+\` | **PASS** | Chain My Offers → Blue Hat details → Price tags. Focus confirmed *before* the press: `INPUT.vc-input__input`, closest `[data-blade-id]` = `blade_2_f9txl6` (middle). After: `blade_2` gained `--maximized`, 837 → 1674 px; topmost `blade_3` untouched. Second press toggled back cleanly |
| 2 | **`data-blade-id` present on every blade root** (the author's flagged residual risk) | **PASS** | 17 distinct blade pages verified live, **zero missing**. Corroborated by the absence of any Vue "extraneous non-props attribute" warning — the exact console signature of a dropped fallthrough attribute |
| 3 | **`Ctrl+S` saves the focused blade** (the SC-04 re-run the author asked for) | **PASS** | Middle blade dirty + Save enabled; topmost (Price tags) has **no Save button at all**. `Ctrl+S` → `POST /seller/offers/validate` 200 → `POST /seller/offers` 200 → dirty indicator cleared on the middle blade |
| 4 | **Workspace-blade focus → `Ctrl+\` is a no-op** | **PASS** | `.vc-blade--maximized` empty afterwards, both blades byte-identical geometry (837/837), focus unchanged. Corroborated by `[BladeMessaging] Blade … has no parent — callParent() ignored` |
| 5 | **Fallback → topmost** | **PASS** | Focus outside every blade (`closest('[data-blade-id]')` = null) → topmost `blade_3` maximized. That maximize itself dropped focus to `BODY`, giving the literal `<body>` precondition free; pressing again with `activeElement === document.body` asserted true again acted on the topmost |
| 6 | **AI-panel chord conflict** | **PASS** | Panel open but **not** focused → the focused middle blade maximized (656 → 1312 px). Panel focused → no blade acted on, geometry unchanged |

**Check 3's control experiment makes it airtight:** on a first offer, `Ctrl+S` produced `POST /seller/offers` → 500,
and clicking that blade's own **Save button** produced the *identical* request and the *identical* 500. Same
endpoint, same failure ⇒ the shortcut dispatches exactly the focused blade's own save action, and the 500 is
unrelated to the shortcut. The check was then re-run on a different offer that saves cleanly.

## Notes

**1. The fix's user-visible behaviour has no test guarding it.** The fix is three parts; two are covered and the
one that matters is not:

| Part | File | Guarded |
|---|---|---|
| `resolveShortcutTargetBlade` (pure resolver) | `focus-target.ts` | Yes — 5 tests, all three fallback branches |
| `data-blade-id` marker on the blade root | `vc-blade-slot.vue` | Yes — 1 test |
| The `getActiveBlade` seam wiring them into the dispatcher | `vc-blade-navigation-new.vue` | **No test** |

Reverting only that seam — one call — reintroduces the reported defect while the suite stays **179/179 green**
(`evidence/red-b-wiring-UNGUARDED.txt`). The resolver being well-tested is not the same as the fix being
protected: the next refactor of that component can silently restore topmost-only targeting with no failing test
and no reviewer signal. Worth a test that asserts the dispatcher resolves through focus, not just that the
resolver would if called.

**2. Record inaccuracy (minor).** The dev comment states "8 tests written first and observed failing". PR #298
added **6** — 5 in `focus-target.test.ts`, 1 in `vc-blade-slot.test.ts`; confirmed by the full-PR reverse
(173/16 vs 179/17).

**3. Intel for VCST-5670** (currently also Ready for test). That ticket claims focus lands on `<body>` after
"sign-in, blade open, Maximize and Save". Live, the header **Maximize button** left focus on the header button —
it was the **shortcut-driven** maximize that dropped focus to `BODY`. The hot path is real, but reached by a
different route than VCST-5670 states; worth folding into that ticket's own verification.

## Coverage limits — stated, not assumed

- **Check 2 covered 17 blade pages live, not all of them.** Not covered: quote details, marketplace-product
  details, import-profile details, review details, fulfillment-centre details, team-member details, "add new
  entity" blades, and any modal/dialog blades. The author reviewed 23 pages in source; a page outside both sets
  could still be multi-root and would silently fall back to topmost-only behaviour with no error.
- **Check 6's mechanism is unproven.** With focus inside the AI panel's `<iframe>` — a separate browsing context
  — "the panel consumed the chord" cannot be distinguished from "the keydown never reached the parent document's
  handler". The observable outcome matches expectation either way.
- **Home/dashboard renders no blade at all** (`div.vc-blade` count 0), so it is not a blade page missing its
  marker. `Ctrl+\` there is a harmless no-op. Side effect: `[ai-agent-context] Cannot set context data: no blade
  id available` fires twice on Home, i.e. AI context cannot bind on the dashboard.

## Incidental findings — nothing filed

The first two are worth a look; 3–6 are environment noise recorded for completeness.

1. **Pre-existing backend 500 on offer save** (`vc-module-marketplace-vendor`, unrelated to this fix):
   `POST /api/vcmp/seller/offers` → `ArgumentNullException: Value cannot be null. (Parameter 'source')` at
   `OfferDetails.FindTheSameProperty` (`OfferDetails.cs:197`) ← `OfferDetails.Update` (`:133`) ←
   `UpdateOfferCommandHandler.Handle` (`:50`). Offer-specific — a null properties collection; one offer fails
   every time via both save paths, another saves fine.
2. **An offer's `name` edit is silently discarded.** Payload sent `"name": "… QA"`, response **200**, dirty
   indicator cleared — but a fresh GET after reopening the blade returns the original name. The server appears to
   derive an offer's name from its product, yet the UI presents Name as an editable **required** field. The user's
   edit vanishes behind a success signal. May be by design; the silent discard is the part worth reviewing.
3. Other environment 500s: `/api/vcmp/message/unreadcount`, `/api/vcmp/conversation/search`,
   `/api/vcmp/security/seller/users/search` (People blade renders empty).
4. Product-image 404s on `…/apps/vendor-portal/catalog/<file>.jpg` with `[vc-image] Invalid URL: catalog/…` — a
   relative asset path not being resolved.
5. Collapsed submenu items stay in the a11y tree and resolve, but clicks are intercepted by a sibling menu item
   until the parent group is expanded.

## Data changes — net zero

Two offer Name fields were edited to exercise Check 3. Neither persisted: one was rejected server-side (500) via
both the shortcut *and* the Save button, and was reverted in the UI; the other returned 200 but a fresh GET showed
the original value (finding 2 above). No entities created or deleted; blades and the AI panel were opened and
closed; a search filter was transient.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123
regression suites cover the storefront only — none cover vc-shell or the Vendor Portal. Substituted: the
framework's own vitest suites, live focus/geometry measurement, and deployed-bundle version proof.
