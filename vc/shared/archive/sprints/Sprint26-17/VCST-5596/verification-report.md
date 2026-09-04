# VCST-5596 — Fix Verification (third attempt — the one that closes it)

**Ticket:** VCST-5596 · Bug · Medium · `[vc-shell] Icon-only breadcrumb button has no accessible name`
**Fix:** vc-shell PR [#282](https://github.com/VirtoCommerce/vc-shell/pull/282) (`f747a8d47`), merged 2026-08-05
*(superseding PR #268, which fixed the wrong component)*
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

**`@vc-shell/framework`** / Marketplace Vendor Portal (separate product — not the storefront, not the Platform
Admin SPA). Fixed in **2.5.0**. Verified against `main @ 324cd9b09` (= v2.5.0) and live on the deployed
vendor-portal, build id **22260**, last-modified 2026-08-24 09:58 GMT.

## Why this took three attempts

| Attempt | Outcome |
|---|---|
| PR #268 → QA 2026-08-04 | **REOPEN.** axe still reported critical `button-name` on every item blade. The fix was on `vc-breadcrumbs-item.vue`, but the flagged button is the breadcrumbs **overflow trigger** that `vc-blade.vue` supplies via the `#trigger` slot — and a slot override *replaces* the labelled button `VcBreadcrumbs` provides. The name was added to a component the app never renders there |
| PR #282 → QA 2026-08-06 | **BLOCKED on deploy.** #282 was not in the deployed build; the axe re-run was deliberately *not* attempted, because it would have reproduced the old failure and manufactured a second false REOPEN against a correct fix |
| PR #282 → this run | **Deploy gate green, live confirmation done** |

## Deploy gate — the same marker that blocked it, now flipped

`f747a8d47` is an ancestor of **v2.5.0** and **not** of v2.4.0 — matching the 08-06 finding that v2.4.0 sat
two commits behind #282.

The 08-06 note recorded, from the served bundle, that the `#trigger` `VcButton` "still renders with props
`{text, icon, icon-size, class, onClick}` and a patch-flag list of only `["class","onClick"]` — no
`aria-label`". Re-running that exact method on build 22260:

```
"aria-label":w.$t("COMPONENTS.MOLECULES.VC_BREADCRUMBS.SHOW_MORE"),
class:Q(["vc-blade__breadcrumbs-button",{…}]),onClick:U},null,8,
["aria-label","class","onClick"]      ← patch flags now include aria-label
```

Locale values live in `vc-shell-framework22260.js`: `Show more breadcrumbs` ×1,
`Weitere Brotkrümel anzeigen` ×1, `SHOW_MORE` ×4. And `--blade-header-button-target-size: 24px` is declared
in `assets/index22260.css` (5 hits), with `.vc-blade__breadcrumbs-button` rules present.

**Correcting my own 08-06 check:** it reported that token absent "in none of the 79 deployed chunks" — but it
was grepping **JS**, and the token is a CSS custom property, so those chunks were the wrong place. The 08-06
conclusion was still right, because the `aria-label` *is* a JS render concern and was genuinely missing; but
the target-size half of that check was not evidence.

## RED → GREEN (unit), isolating PR #282

Scope `ui/components/organisms/vc-blade` + `ui/components/molecules/vc-breadcrumbs`, from `framework/`:

| Phase | Source | Result |
|---|---|---|
| **GREEN** | `main @ 324cd9b09` | **191 passed (191)** |
| **RED** | `vc-blade.vue` @ parent of `f747a8d47`; all tests unchanged | **2 failed / 189 passed** |

The two failures are exactly the two halves of #282:
- `vc-blade.a11y.test.ts` — *"names the breadcrumbs overflow trigger it supplies **through the #trigger slot**"*
- `vc-blade.target-size.test.ts` — *"computes a minimum 24 by 24 CSS-pixel target for the overflow button"*

**Deliberate scoping:** PR #268's fix to `vc-breadcrumbs-item.vue` was left in place for the RED. Reverting
both would conflate two separate fixes; this isolates #282.

**The guard now matches the failure mode.** `vc-blade` had *no test file at all* when #268 was written, and
its stories cannot render breadcrumbs — `renderingState` is injected by `VcBladeSlot`, so standalone it is
`undefined` and the block is `v-if`-ed out, leaving the story-level axe gate structurally blind. #282's test
provides `BladeRenderingStateKey` and asserts **through the slot path**, which is precisely what would have
caught #268's miss. The target-size half was guarded slightly later by PR #308. Both halves fail on revert.

## Live verification — axe-core 4.10.2, tags `wcag2a`…`wcag22aa`

Lane note: run on **`playwright-chrome`**, not Chrome DevTools MCP. CDT MCP has no `--secrets` support, so
logging in there would have required reading the plaintext password; the playwright lanes are wired to
`--secrets`, and the secret was typed **by name** (`process.env['ADMIN_PASSWORD_VCMP-DEV']`), so the plaintext
never entered the transcript. A correct substitution, recorded because it wasn't the lane specified.

| Check | product-details | quote-details |
|---|---|---|
| 1 — accessible name | **PASS** | **PASS** |
| 2 — target size (SC 2.5.8) | **PASS** | **PASS** |
| 3 — axe `button-name` / `target-size` | **PASS** (0 / 0) | **PASS** (0 / 0) |
| 4 — both blades covered | done | done — quote list had 81 rows this run |
| 5 — titled crumbs unchanged | **PASS** (caveat below) | **PASS** (caveat below) |
| 6 — German leg | **BLOCKED** | **BLOCKED** |

**Check 1.** `aria-label="Show more breadcrumbs"`, verbatim and identical on both blades, on
`button.vc-blade__breadcrumbs-button`. The accessibility tree confirms a non-empty computed **name**, not
merely a present attribute: `navigation "Breadcrumb" → list → listitem → button "Show more breadcrumbs"`.

**Check 2.** `getBoundingClientRect()` = **24 × 36** on both blades (was 22×36); `min-width` 24px, the custom
property resolving to `24px`.

**Check 3 + the vacuous-pass guard.** Because "0 violations" can also mean the rule never examined the node,
axe was re-run with `runOnly: {type:'rule', values:['button-name','target-size']}` and `resultTypes`
including `passes`:

| Blade | Rule | Bucket | Nodes | `querySelector(target[0]) === measuredTrigger` |
|---|---|---|---|---|
| product-details | `button-name` | **passes** | 32 | **true** |
| product-details | `target-size` | **passes** | 61 | **true** |
| quote-details | `button-name` | **passes** | 7 | **true** |
| quote-details | `target-size` | **passes** | 15 | **true** |

`violations: []`, `incomplete: []`, `inapplicable: []` for both rules on both blades. So both rules ran and
the exact measured element sits in the **passes** set. This is the node-identity check that caught the
wrong-component diagnosis on 08-04, now affirmatively green.

`color-contrast` remains (7 nodes product / 5 quote) — the project's documented design exception, reported
not counted. A third item blade (offers-list, 3-deep) was audited opportunistically: `button-name` 0,
`target-size` 0.

**Check 4 — the coverage gap is closed.** The dev could verify only product-details (their quote list came
back empty) and the original REOPEN covered both blades; QA undertook in the ticket to cover both. Done —
the quote list was populated this run, no substitution needed.

## Acceptance criteria

| AC | Verdict |
|---|---|
| Icon-only breadcrumb button exposes a localized accessible name (**en + de**) | **PARTIAL** — en confirmed live on both blades; de not exercisable (Note 2) |
| axe reports no `button-name` violation on an item blade | **PASS** — 0 on both, with the node-identity guard above |
| Breadcrumbs with a title are unchanged | **PASS**, with the caveat in Note 1 |
| *(folded in from the 08-04 report)* target size ≥24px | **PASS** — 24×36 |

## Notes

**1. A structural finding: the trail collapses *entirely*, so no inline breadcrumb item renders at all.** On
every item blade, `nav[aria-label="Breadcrumb"] > ol` contains exactly **one** `<li>` — the overflow
dropdown. Clicking **Maximize** did not expand it, so the collapse is unconditional rather than
width-driven. Consequences worth recording:
- It explains why the original violation appeared on *every* item blade.
- It means the inline `vc-breadcrumbs-item` path — the component PR #268 fixed — is effectively **never
  exercised in this app**. #268 was not merely aimed at the wrong component for this symptom; its target
  does not render here at all.
- **It constrains AC3.** Titled crumbs could only be evidenced *inside the expanded overflow menu*
  (`menuitem "Products"`, `"QuotesList"`, `"ProductDetails"`). On those, `aria-label` and `title` are both
  `null`, so the accessible name comes from the crumb's own text — they did **not** acquire a generic label,
  which is what the AC asks. But an inline-rendered titled crumb could not be tested, because this build
  never produces one.

**2. The German leg is BLOCKED — an environment limit, not a defect.** Confirmed independently through the
real UI: user menu → Language renders exactly one option, `English`, marked active; a DOM sweep for
English/Deutsch/German/Français/Español/Русский/de-DE found only English. The framework ships
`Weitere Brotkrümel anzeigen` (proven in the bundle above) but the selectable-locale list is registered by
the **app**, not the framework, and vcmp-dev registers English only. No locale was forced via storage or app
state. *Same limitation independently hit on VCST-5668 today* — if no deployed environment offers a second
locale, every "en + de" AC in this product is unverifiable at runtime.

## Incidental findings — out of scope, nothing filed

1. **`label` — axe critical, 3 nodes, quote-details.** Three unlabelled `<input>`s in the quote line-item
   pricing area: no `placeholder`, only a bare `$` / `%` / `$` glyph as adjacent text; 213×34 / 207×34 /
   213×34. Ids are render-counter based (`#vc-field-v-219/220/221` this scan, `…108/109/110` on an earlier
   one). A genuine WCAG 3.3.2 / 1.3.1 **critical** on a quote-editing surface — the strongest candidate of
   the three for its own ticket.
2. **`aria-input-field-name` — serious, 1 node, quote-details.** `.vc-select__input`, visible text only
   "Click to select…".
3. **Untranslated blade identifiers leak into breadcrumbs.** Crumb titles render as raw blade names —
   `QuotesList`, `ProductDetails` — rather than localized labels. Cosmetic, but it *is* the accessible name a
   screen-reader user hears, so it interacts with this ticket's own subject matter.

## Coverage limits

Inline-rendered titled crumbs could not be tested (Note 1 — this build never renders one). The German leg
could not be exercised (Note 2). Screen-reader announcement output was not verified — no NVDA/JAWS/VoiceOver
in the toolkit; the claims rest on the accessibility tree and computed names.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md`, the storefront
P0 route list and the 123 regression suites cover the storefront only — none cover vc-shell or the Vendor
Portal. The a11y-gated-themes rule (Coffee + Red) is likewise a storefront rule. Substituted: the framework's
own vitest suites, live axe with a node-identity guard, geometry measurement, and bundle/CSS marker checks.

**Data changes: none.** No entity created, edited or deleted; the one non-read action was Maximize→Restore on
the quote blade (transient layout state, returned).
