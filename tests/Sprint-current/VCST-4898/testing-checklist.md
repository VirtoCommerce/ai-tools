# VCST-4898 — [Lists] Redesign the list-item · Testing Checklist

**Scope:** Frontend-only (Vue component + locale files). No API, no business-logic changes.
**Env:** `{{FRONT_URL}}` | **Suite context:** `regression/suites/Frontend/b2c/007-b2c-lists-shared.csv`
**Evidence budget:** single passing check = 0–1 screenshot (final state only); failing check = 1–3 screenshots.

---

## AC #1 — Update Chips

- [ ] **Private chip icon color.** On a private list card, the `lock-closed` icon carries the CSS class `text-info-700`. Confirm class `fill-secondary` is absent from that icon element.
- [ ] **Shared chip icon color.** On a shared list card, the `users` icon carries the CSS class `fill-primary`. Confirm class `fill-accent` is absent from that icon element.
- [ ] **Both chip states visible in one session.** Toggle a list Private → Shared (reuse **B2C-LIST-011**) and inspect both chip renders without page reload to rule out stale-class hydration.

## AC #2 — Remove "Saved" → icon

- [ ] **"Saved:" text is gone.** Inspect the rendered list card DOM on `/account/lists`. No element contains the substring `Saved:` in EN locale.
- [ ] **`save-v2` icon is present.** The list card contains a `VcIcon` rendering the `save-v2` glyph with `size="16"` and class `text-info-400`.
- [ ] **Modified-date format is `short`.** The date immediately after the icon renders in short locale format (e.g., `4/27/26` or `5/6/26`) — not the verbose long format previously produced by `$d(list.modifiedDate)` without a format argument.
- [ ] **Icon + date wrapper layout.** The wrapper element has classes `flex items-center gap-1.5` — verify icon and date are on the same baseline with correct spacing.

---

## Visual / Token Verification

- [ ] **No missing-translation placeholder.** The string `shared.wishlists.list_card.saved` does not appear literally anywhere on the card (would appear as `[ shared.wishlists.list_card.saved ]` if the key were referenced but not removed).
- [ ] **EN locale confirmed clean** (primary check).
- [ ] **Second locale confirmed clean.** Switch storefront locale to DE or FR; confirm no `Saved:` text and no raw translation key appears on the list card.
- [ ] **Desktop layout intact.** At 1920 × 1080 the `flex items-center gap-1.5` wrapper does not overflow the card boundaries and the icon + date sit inline.
- [ ] **Mobile layout intact.** At 375 × 812 (or equivalent mobile viewport) the `md:contents` class transformation does not collapse or hide the icon+date row.

---

## i18n & a11y

- [ ] **`save-v2` icon accessibility.** Inspect the rendered `VcIcon` element. If it is decorative (no semantic meaning beyond visual reinforcement of the adjacent date), it must have `aria-hidden="true"`. If it is treated as meaningful, it must have an `aria-label` or be wrapped in a `<title>` / `role="img"` pattern.
- [ ] **Date label context for screen readers.** The previous `"Saved:"` text provided labeling context for the following date. With only an icon, a screen reader may announce a bare date string (e.g., `"5/6/26"`) with no label. Review whether the date element is wrapped in or preceded by a visually-hidden label (e.g., `<span class="sr-only">Modified</span>`). If absent, raise as a review finding — file a bug only if the `VcIcon` is confirmed reachable to assistive technology without `aria-hidden`.

---

## Regression Smoke (existing cases — do not replicate, just re-run)

| Case | Title | Why needed |
|------|-------|------------|
| **B2C-LIST-001** | Create Wishlist/List | Confirms list-card render path is unbroken after component change |
| **B2C-LIST-002** | Add Product to List from Product Page | Confirms add-to-list flow still works |
| **B2C-LIST-004** | View List Contents | Confirms list detail page loads; verifies card-level DOM unchanged on detail view |
| **B2C-LIST-011** | Mark List as Private/Shared | Exercises both chip states (Private chip + Shared chip) — primary path for AC #1 token checks |

Run these four cases only. Do not run the full 007 suite for this ticket.

---

## Out of Scope

- No backend, API, or GraphQL testing required — no server-side code changed.
- No Admin SPA testing required.
- No payment, checkout, or cart flows.
- No full suite regression (007) — four smoke cases above are sufficient for a component-level visual change.
- No new BL invariants to verify (BL-B2C-002 is exercised indirectly by B2C-LIST-001).
