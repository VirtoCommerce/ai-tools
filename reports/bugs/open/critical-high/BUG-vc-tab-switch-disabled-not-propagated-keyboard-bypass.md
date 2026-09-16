# VcTabSwitch `disabled` reaches only the hidden radio — keyboard bypasses the guard and mutates the cart — P1

**Severity:** High / P1 · **Type:** Functional (guard bypass on a revenue flow) + Accessibility (WCAG 4.1.2, 2.4.3)

**Env:** vcptcore-qa @ Platform 3.1069.0, theme `2.58.0-pr-2474-62e6-62e635c6` · store `B2B-store` · chromium

## Summary
`VcTabSwitch` applies its `disabled` prop **only to the hidden `<input type="radio">`**. The visible `<button>` keeps `tabindex="0"`, gets no `aria-disabled`, and `button.disabled` stays `false`; inertness is delivered by `pointer-events: none`, which blocks the **mouse only**. On `/cart` the Pickup/Shipping switcher is bound `:disabled="cartChanging"`, so during an in-flight cart update a keyboard user can focus the control and activate it — firing a second cart mutation concurrently with the one the guard exists to prevent.

## Steps to Reproduce
1. Sign in as a B2B buyer, add an item, open `{{FRONT_URL}}/cart`.
2. Change a line quantity to start a cart update (the disabled window lasts ~1.4–2.8 s — no throttling needed).
3. While the switcher is disabled, press `Tab` until focus lands on the Pickup option.
4. Press `Enter`.

## Expected vs Actual
- **Expected:** a disabled control is not focusable (or is focusable and announced as disabled), and activation does nothing.
- **Actual:** focus lands on it with a full focus ring (`outline: rgb(59,130,246) solid 1.6px`, `:focus-visible` matches); `Enter` fires a native `click` 1 ms later; the delivery method changes and **`POST /graphql AddOrUpdateCartShipment`** (`shipmentMethodCode: "BuyOnlinePickupInStore"`) is issued **while `ChangeFullCartItemsQuantity` is still in flight**.

Measured inside one 2529 ms window (both options `vc-tab-switch--disabled`, both hidden radios `disabled=""`):

| | visible `button` |
|---|---|
| `tabindex` | `"0"` |
| `aria-disabled` | absent |
| `disabled` attr / `.disabled` | absent / `false` |
| computed `pointer-events` | `none` |

The mouse is correctly blocked — a click during the window never lands. That asymmetry is the defect.

## Root Cause
`client-app/ui-kit/components/molecules/tab-switch/vc-tab-switch.vue` binds `:disabled="disabled"` on the hidden input only. The visible `<button>` receives no `:disabled`, no `aria-disabled` and no `tabindex="-1"`, and `pointer-events: none` does not suppress keyboard activation of a `<button>`.

## WCAG
- **4.1.2 Name, Role, Value** — the disabled state is never exposed; the control is announced as an ordinary enabled toggle button.
- **2.4.3 Focus Order** — a focusable stop with a full focus ring on a control intended to be inert.

## Scope
Affects every `VcTabSwitch` consumer, but only `shared/checkout/components/shipping-details-section.vue` passes a non-constant `disabled` today (`:disabled="cartChanging"`, both instances) — so that is the one user-reachable path, and it is on cart/checkout.

**Pre-existing** — `VcTabSwitch`'s disabled handling is untouched by PR #2474 (which changed only `aria-pressed`/`aria-checked`). Found during the VCST-5890 `/qa-test` run.

## Not verified (deliberately stated)
- Only **`Enter`** was tested. **`Space` was not** — do not assume it behaves the same.
- Whether the disabled state has any distinct **visual** treatment was not measured, so no claim is made that it "looks" operable.

## Fix Routing
- **Repo:** `vc-frontend` · `client-app/ui-kit/components/molecules/tab-switch/vc-tab-switch.vue`
- **Kind:** frontend
- Propagate `disabled` to the visible `<button>` (`:disabled`, plus `aria-disabled` and removal from the tab order), rather than relying on `pointer-events`.

## Evidence
Timestamped attribute + event captures (primary evidence) in the VCST-5890 run notes; `reports/tickets/Sprint26-15/VCST-5890/screenshots/VCST-5890-A3-disabled-switcher-keyboard-focused.png` shows the focus ring but most likely landed just after the window closed — it is illustrative, not proof of the disabled state.
