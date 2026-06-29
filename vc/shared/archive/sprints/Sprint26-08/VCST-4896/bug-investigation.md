# VCST-4896 — Bug Investigation Report

**Date:** 2026-04-28
**Investigator:** Claude (synthesizing 3 agent reports + PR source analysis)
**Method:** (1) Read PR head source files. (2) Trace each finding through the code. (3) Classify each finding as `CONFIRMED-BUG`, `NEEDS-LIVE-REPRO`, `FALSE-POSITIVE`, or `OUT-OF-SCOPE`.

## PR head source files reviewed
| File | SHA | Purpose |
|---|---|---|
| `client-app/shared/cart/components/coupons-section.vue` | `54d69021` | Container + `getView` / `getError` / `watchEffect` |
| `client-app/shared/cart/components/coupon-card.vue` | `cbb420ee` | Card component with view-state styling, `handleClick` |
| `client-app/shared/cart/composables/useCoupon.ts` | `47918080` | `applyCoupon` / `removeCoupon`, error-type discriminator |

---

## Master finding catalogue

| # | Source | Severity stated | Title | Code-level verdict |
|---|---|---|---|---|
| **B1** | Exploratory #1 | High | failed_coupon error attaches to wrong card | **CONFIRMED-BUG (revised)** — collision: when custom-typed code matches a preset code, both cards flip to error |
| **B2** | Exploratory #2 | Medium | Triple-click sends 3 `addCartCoupon` mutations | **CONFIRMED-BUG** — no early-return guard in `applyCoupon` |
| **B3** | Exploratory Risk #5 | Medium | HTTP 5xx with `errors[]` treated as `invalid` | **FALSE-POSITIVE** — validate-first ordering means this scenario doesn't arise |
| **B4** | Exploratory #7 | Medium | Cart not persisting across sign-out/sign-in (slot 3) | **OUT-OF-SCOPE** — live cross-check on slot 1 confirms cart + coupon persist. Slot-3 BuildRight specific |
| **B5** | Frontend FE-02 | P2-ux | Missing `rel="noopener"` on `target="_blank"` | **CONFIRMED-BUG** (minor — modern browsers implicit) |
| **B6** | Frontend FE-03 | P2-ux | Missing `aria-label` on trash-icon button | **CONFIRMED-BUG** (a11y, all card buttons) |
| **Q1** | Exploratory #3 + Frontend OBS-01 | Question | Custom code input retains text after apply | **NOT-A-BUG** — live repro: watchEffect clears correctly in both Q1a and Q1b |
| **OBS-FE-01-revised** | Frontend FE-01 | — | "View all" link `/account/coupons` vs spec `/account/promotion-coupons` | **CHECKLIST FIX** — `/account/coupons` is the actual existing route; not a PR bug |

---

## Detailed analysis

### B1 — `failed_coupon` mis-attribution to wrong card

**Stated repro (exploratory):**
> 1) Apply preset E2E-COUPON. 2) Trash to remove. 3) Install thrown-fetch interceptor on `addCartCoupon`. 4) Type `TESTCODE` in custom card. 5) Click custom-card apply.
> Observed: THRESH50 preset card flips to error state with "Something went wrong…"; custom card stays default.

**Code trace** ([useCoupon.ts:27-43](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/composables/useCoupon.ts#L27-L43)):

```ts
async function applyCoupon(code: string) {
  clearError();
  const trimmed = code.trim();           // <-- "TESTCODE"
  if (!trimmed) return;
  try {
    loadingCouponCode.value = trimmed;
    if (appliedCouponCode.value && appliedCouponCode.value !== trimmed) {
      await removeCartCoupon(appliedCouponCode.value);   // skipped — no coupon applied after step 2
    }
    const isValid = await validateCartCoupon(trimmed);    // throws if interceptor catches all fetches
    if (!isValid) { couponError.value = { code: trimmed, type: "invalid" }; return; }
    await addCartCoupon(trimmed);                          // throws if interceptor catches add
  } catch {
    couponError.value = { code: trimmed, type: "failed" };  // <-- code = "TESTCODE"
  }
}
```

`couponError.code` will always be `trimmed` ("TESTCODE") in the catch path. The view determination ([coupons-section.vue:64-75](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupons-section.vue#L64-L75)):

```ts
function getView(code) {
  if (code === appliedCouponCode.value) return "applied";
  if (code === couponError.value?.code) return "error";    // <-- only matches if code === "TESTCODE"
  return "default";
}
```

For `THRESH50` to render in `error` view, `couponError.code` must equal `"THRESH50"`. The catch block has no path that produces `couponError = { code: "THRESH50", … }` when the user clicked the *custom* card with `"TESTCODE"`.

**Hypothesis 1 (most likely):** The agent's click in step 5 actually hit THRESH50's apply button, not the custom card's. Browser DOM coordinates / button targeting may have been off — both buttons are in the same widget and look identical when in `default` view.

**Hypothesis 2:** State carry-over — THRESH50 was applied earlier and not cleared; subsequent custom-card click triggered the `removeCartCoupon(THRESH50)` branch, but even then the catch sets `couponError.code = trimmed` (TESTCODE), not the removed code. So this hypothesis is *also* refuted by the source.

**Hypothesis 3 (untested):** Some upstream code path in `removeCartCoupon` or `validateCartCoupon` reactively writes to `couponError` with `code = appliedCouponCode`. Would need to read `useFullCart.removeCartCoupon` / `validateCartCoupon` source to rule out — these are in `composables/useCart.ts` (not in PR scope, pre-existing).

**Verdict (after live re-verification): CONFIRMED-BUG, but with a different root cause than originally reported.**

The original exploratory STR used `TESTCODE` (a non-preset code). With that code, the bug **does not manifest** — only the custom card flips to error, validate short-circuits to `invalid`, and `couponError.code = "TESTCODE"` matches no preset.

The real bug surfaces when the **custom-typed code happens to also exist in the preset list**. Live repro:
1. Type `E2E-COUPON` (a code that IS in the preset list) into the custom card.
2. Throw `addCartCoupon` via interceptor.
3. catch path → `couponError = { code: "E2E-COUPON", type: "failed" }`.
4. **`getView()` matches by code-equality only, with no origin discrimination:**
   - Preset `E2E-COUPON` card: `getView("E2E-COUPON")` → matches `couponError.code` → returns `"error"`.
   - Custom card: `getView(customCode = "E2E-COUPON")` → same match → returns `"error"`.
5. **Both cards visually flip to error simultaneously** with the same error message.

**Evidence:** `tests/Sprint-current/VCST-4896/evidence/reverify/b1-real-bug-both-cards-error.png`.

**Severity:** Medium (data-integrity / UX confusion). The user gets two error indicators for one failed action; one appears on a card they never clicked.

**Fix recommendations:**
- Track origin in `couponError`: `{ code, type, origin: "preset" | "custom" }`. `getView` checks both code AND origin.
- Or auto-clear `couponError` when the user starts typing again or navigates away.

**Why my source-code analysis missed this:** I traced the documented STR using `TESTCODE` (the literal string from the report). I did not consider the case where the typed custom code collides with a preset code. The exploratory agent's framing ("THRESH50 flips, custom card stays default") was wrong on details (which preset, what state of custom card), but the direction — "the error leaks" — was correct.

---

### B2 — `loadingCouponCode` guard does not prevent rapid duplicate `addCartCoupon` calls

**Stated repro (exploratory):**
> Triple-click apply on a preset within ~1ms. Captured: 3 `addCartCoupon` mutations at timestamps t=29694, 29695, 29695.

**Code trace** ([useCoupon.ts:21-46](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/composables/useCoupon.ts#L21-L46)):

```ts
async function applyCoupon(code: string) {
  clearError();                                // <-- no early-return guard
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    loadingCouponCode.value = trimmed;          // <-- set AFTER entering try
    // ...mutations
  } finally {
    loadingCouponCode.value = undefined;
  }
}
```

The guard is **only visual** (via `:loading="loading"` on `<VcButton>`). There is **no explicit early-return** in `applyCoupon` for the case where `loadingCouponCode.value` is already set. Rapid clicks during Vue's reactive batching window can all reach `handleClick → emit("apply")`. The button's `:loading` prop updates asynchronously after the next render tick, leaving a 1-frame window where multiple clicks can fire.

**Verdict: CONFIRMED-BUG.** Real defect introduced by this PR. Severity: **Medium** (medium impact — duplicate mutations against backend, unnecessary load; eventual cart state is correct because `addCoupon` is idempotent on the same code).

**Fix recommendation:** Add a guard at the top of `applyCoupon` and `removeCoupon`:
```ts
if (loadingCouponCode.value) return;
```
Or disable the button at the DOM level via `disabled` attribute when `loading` is true (currently `disabled` is hard-coded `false` for `default`/`applied` views in `viewConfigs`).

---

### B3 — Risk #5: HTTP 5xx with `errors[]` treated as `invalid` not `failed`

**Stated risk (exploratory):**
> A real backend that returns HTTP 500 with a GraphQL `{errors:[]}` payload will surface as "This code is not valid", masking the actual server issue. The `failed` path only fires for genuine network exceptions.

**Code trace:**

The discriminator in `applyCoupon`:
```ts
const isValid = await validateCartCoupon(trimmed);
if (!isValid) { couponError.value = { code: trimmed, type: "invalid" }; return; }
await addCartCoupon(trimmed);
```

**Scenario walk-through:**
- If `validateCartCoupon` returns `false` (server's verdict on the coupon's validity given the cart/user) → `invalid`. **Correct** — this is the validate API's contract.
- If `validateCartCoupon` returns `true` and `addCartCoupon` throws → catch fires → `failed`. **Correct.**
- If `validateCartCoupon` resolves with HTTP 5xx errors[] but Apollo `errorPolicy: "all"` swallows the throw and returns `data.validateCoupon = false` → treated as `invalid`. This isn't a misclassification — Apollo's wrapper hides the 5xx; the discriminator only sees the boolean.

The exploratory agent's variant A test (HTTP 500 + errors[] for `addCartCoupon` only) ended up showing "invalid" because **`validateCartCoupon` ran first and returned `false`** for `TESTCODE` (server has no such coupon). The 5xx on `addCartCoupon` was never reached in that path. The discriminator never had a chance to misclassify because validate already short-circuited.

**Verdict: FALSE-POSITIVE.** The discriminator is consistent with how the upstream APIs report failures. Apollo `errorPolicy` is a separate cross-cutting concern outside this PR.

**Caveat:** If a future scenario has `validate` return `true` but `add` returns 5xx-with-errors[] *without throwing* (depends on `errorPolicy`), the user would see no error feedback. Worth a separate PM design decision — but not a regression in PR #2269.

---

### B4 — Cart not persisting across sign-out/sign-in (slot 3 BuildRight)

**Stated repro (exploratory):**
> 1) Apply coupon on /cart with 1 item. 2) Sign out. 3) Sign back in. 4) Navigate to /cart. Observed: cart is empty.

**PR scope check:** Files changed by PR #2269 — none of them touch cart hydration/restoration logic (`useCart`, sign-in cart-merge, `getCart` query). This behavior is the responsibility of upstream cart-management code, not the new sidebar.

**Verdict: OUT-OF-SCOPE for VCST-4896.** The exploratory agent already flagged this as "likely pre-existing". Two follow-ups required:
1. Cross-check on slot 1 (TechFlow) — if reproducible, file as separate **non-VCST-4896** cart-persistence bug (BL-CART-008 violation).
2. If reproducible only on slot 3 (BuildRight), check if BuildRight org has anonymous-cart-merge disabled or a different store setting.

---

### B5 — Missing `rel="noopener"` on `target="_blank"` link

**Code** ([coupons-section.vue:25-28](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupons-section.vue#L25-L28)):
```vue
<router-link class="coupons-section__link" :to="{ name: ROUTES.PROMOTION_COUPONS.NAME }" target="_blank">
  {{ $t("shared.cart.coupons_section.all_coupons") }}
  <VcIcon class="coupons-section__arrow" name="arrow-right" :size="14" />
</router-link>
```

No `rel` attribute. Modern browsers (Chrome 88+, Firefox 79+, Safari 12.1+) implement implicit `rel="noopener"` for `target="_blank"` since 2021, but explicit is still considered best practice — required for older browsers, security audits, and lint rules.

**Verdict: CONFIRMED-BUG (minor).** Severity: **P2-ux** (security hygiene; modern browsers protect this automatically).

**Fix recommendation:** Add `rel="noopener noreferrer"` to the `<router-link>` component (Vue Router supports forwarding the attribute to the underlying anchor).

---

### B6 — Missing `aria-label` on trash-icon button

**Code** ([coupon-card.vue:18-21](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L18-L21)):
```vue
<VcButton v-bind="viewConfig.button" :loading="loading" @click="handleClick" />
```

`viewConfig.applied.button` (line 84):
```ts
applied: {
  iconName: "round-check",
  button: { icon: "outline-trash", variant: "no-background", color: "neutral", disabled: false },
},
```

No `aria-label`, no visible text. Screen-reader users encounter an unannotated button. The `default` view's button has the same issue (icon-only "→" apply button) — affects two view states, not just `applied`.

**Verdict: CONFIRMED-BUG.** Severity: **P2-ux** (a11y; WCAG 2.1 AA 4.1.2 *Name, Role, Value*).

**Fix recommendation:** Add `aria-label` to the `viewConfigs` button definitions:
```ts
default: { ..., button: { icon: "arrow-right", "aria-label": t("...apply"), ... } },
applied: { ..., button: { icon: "outline-trash", "aria-label": t("...remove"), ... } },
error:   { ..., button: { ..., disabled: true, "aria-label": t("...apply") } },
```
Add corresponding i18n keys.

---

### Q1 — Custom code input retains text after apply (or pre-populates with applied code)

**Two slightly different observations:**
- **Exploratory #3:** Type `E2E-COUPON` in custom card → click custom-card apply → preset `E2E-COUPON` flips to `applied`; custom card stays in `default` with the typed text still visible (`customInputValue: "  E2E-COUPON  "` per Finding #6).
- **Frontend OBS-01:** Apply `$5/E2E-COUPON` via its **preset** card (no custom typing) → custom card's input shows `E2E-COUPON`.

**Code trace** ([coupons-section.vue:36-50](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupons-section.vue#L36-L50)):
```ts
const customCode = ref("");

watchEffect(() => {
  const applied = appliedCouponCode.value;
  if (!applied) return;
  const isInList = coupons.value.some((coupon) => coupon.couponCode === applied);
  if (!isInList && customCode.value !== applied) {
    customCode.value = applied;          // populate custom field for off-list applied codes
  } else if (isInList && customCode.value === applied) {
    customCode.value = "";               // clear custom field if applied code IS in preset list
  }
});
```

**Trace for Exploratory #3:**
1. Initial: `customCode = ""`, `appliedCouponCode = undefined`. watchEffect: `applied` is undefined → early return.
2. User types "E2E-COUPON" in custom card → `customCode = "E2E-COUPON"`. watchEffect re-fires: `applied` still undefined → early return.
3. User clicks custom card apply → `applyCoupon("E2E-COUPON")` → mutation succeeds → cart cache updates → `appliedCouponCode = "E2E-COUPON"`.
4. watchEffect re-fires: `applied = "E2E-COUPON"`, `isInList = true` (E2E-COUPON IS in preset list), `customCode === applied` → second branch fires → `customCode = ""`.
5. **Expected:** custom field becomes empty.

**Trace for Frontend OBS-01:**
1. Initial: `customCode = ""`, `appliedCouponCode = undefined`.
2. User clicks PRESET E2E-COUPON apply → `applyCoupon("E2E-COUPON")` → success → `appliedCouponCode = "E2E-COUPON"`.
3. watchEffect re-fires: `applied = "E2E-COUPON"`, `isInList = true`, `customCode === applied`? `"" !== "E2E-COUPON"` → second branch DOES NOT fire. **Neither branch fires.** customCode stays `""`.
4. **Expected:** custom field stays empty.

**Both agent observations contradict the code's expected behavior.** Either:
- The watchEffect's reactive deps aren't tracking properly (unlikely — Vue's reactivity is well-tested)
- Some other code path writes to `customCode` (none in this file)
- The agents observed the **preset** E2E-COUPON card's readonly input (which correctly displays "E2E-COUPON" when in default state) and confused it with the custom card's input

**Most likely cause:** Visual misidentification — preset cards have a `readonly` input that shows `coupon.couponCode` ([coupon-card.vue:64-67](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L64-L67)):
```vue
<VcInput v-model="code" size="xs" :readonly="!custom || view === 'applied' || loading" ...>
```
where `code = props.coupon?.couponCode ?? ""` for non-custom cards. So the preset E2E-COUPON card always shows "E2E-COUPON" in its input — that's by design. If an agent looked at this and thought it was the custom card's input, they'd report a phantom bug.

**Verdict (after live re-verification): NOT-A-BUG.**

Live repro on slot 1 (TechFlow / John Mitchell, Edge browser, with explicit DOM `ref` capture for the custom card's input vs. preset cards' readonly inputs):

- **Q1a** (type E2E-COUPON in custom card, click custom apply): preset E2E-COUPON flips to `applied`; custom card returns to `default` with `inputValue = ""`. **watchEffect cleared customCode correctly.** Evidence: `evidence/reverify/q1a-after-custom-apply.png`.
- **Q1b** (click preset E2E-COUPON apply, never touch custom): preset flips to `applied`; custom card stays `default` with `inputValue = ""`. **watchEffect's neither-branch correctly does nothing.** Evidence: `evidence/reverify/q1b-after-preset-apply.png`.

The previous agents' observation likely confused the **preset card's readonly input** (which always shows the preset's `couponCode` per the `code` computed in [coupon-card.vue:64-71](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L64-L71)) with the **custom card's editable input**. The preset E2E-COUPON card always displays "E2E-COUPON" in its readonly input regardless of any state — that's by design.

---

### OBS-FE-01-revised — "View all" link `/account/coupons`

**Frontend report claimed:** href `/account/coupons` deviates from spec's `/account/promotion-coupons`.

**Resolution:** `/account/coupons` is the **actual existing route**:
- Confirmed by suite `077-coupons-promotions-storefront.csv:CPN-001`: `[NAV] URL is {{FRONT_URL}}/account/coupons`
- Confirmed by exploratory Finding #4: `/account/promotion-coupons` returns 404 in this env
- The PR uses `ROUTES.PROMOTION_COUPONS.NAME` route name, which resolves to `/account/coupons` per the existing router config

**Verdict: CHECKLIST FIX, not a PR bug.** My `scope.md` AC-3 and `testing-checklist.md` VCST4896-CL-012 use the wrong path. Fix:
- `scope.md` AC-3: change "/account/promotion-coupons" → "/account/coupons"
- `testing-checklist.md` CL-012 step 4: same change

---

## Final confirmed PR bugs (8)

| ID | Title | Severity | Source location | Fix complexity |
|---|---|---|---|---|
| **VCST-4896-bug-1** | `getView()` collision: error leaks to preset card matching custom-typed code | Medium (data-integrity / UX) | [coupons-section.vue:64-83](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupons-section.vue#L64-L83) | Small — track `origin` in `couponError`, or auto-clear on next interaction |
| **VCST-4896-bug-2** | `loadingCouponCode` guard absent — rapid clicks fire duplicate `addCartCoupon` mutations | Medium (data integrity / load) | [useCoupon.ts:21-46](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/composables/useCoupon.ts#L21-L46) | Trivial — add `if (loadingCouponCode.value) return;` |
| **VCST-4896-bug-3** | Missing `rel="noopener"` on `target="_blank"` "View all" link | P2-ux (security hygiene) | [coupons-section.vue:25](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupons-section.vue#L25) | Trivial — add `rel="noopener noreferrer"` |
| **VCST-4896-bug-4** | All apply/trash buttons missing `aria-label` (a11y) | P2-ux (WCAG 2.1 AA 4.1.2) | [coupon-card.vue:80-92](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L80-L92) | Trivial — add `aria-label` to viewConfigs + i18n keys |
| **VCST-4896-bug-5** | Error message silent for screen readers — `coupon-card__error <p>` has no `role="alert"` and no `aria-live` | Serious (a11y, WCAG 3.3.1 / 4.1.3) | [coupon-card.vue:25](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L25) | Trivial — add `role="alert"` (or `aria-live="assertive"`) to error `<p>` |
| **VCST-4896-bug-6** | 26x26px button touch targets — below WCAG 2.5.5's 44x44px minimum | Serious (a11y mobile) | `coupon-card.vue` button styling (size from VcButton) | Small — pass a larger `size` to VcButton in viewConfigs, or wrap in 44px hit-area |
| **VCST-4896-bug-7** | 4 readonly preset inputs have `tabIndex=0` — unnecessary tab stops with no keyboard utility | Minor (a11y, WCAG 2.4.3) | [coupon-card.vue:13-19](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L13-L19) | Trivial — add `tabindex="-1"` when `readonly` |
| **VCST-4896-bug-8** | Custom card empty input submit silently ignored — no toast/inline warning | Minor (UX, error prevention) | [coupon-card.vue:79-82](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4896-coupons-sidebar/client-app/shared/cart/components/coupon-card.vue#L79-L82) | Small — show inline hint or disable apply when input empty |

## Re-classified — not bugs

| Original | New verdict | Reason |
|---|---|---|
| Risk #5 (HTTP 5xx mis-discriminator) | **FALSE-POSITIVE** | Discriminator is consistent with validate-first ordering |
| Q1a / Q1b (custom code retention) | **NOT-A-BUG** | Live repro confirms `watchEffect` clears `customCode` correctly in both scenarios |
| B4 (cart persistence on slot 3) | **OUT-OF-SCOPE** | Cross-check on slot 1 (TechFlow) confirms cart + coupon persist. Slot 3 / BuildRight specific — separate ticket |
| FE-01 (View all link path) | **CHECKLIST FIX** | `/account/coupons` is the actual existing route; not a PR bug |
| OBS-02 (server intermittency) | **NOT A PR BUG** | Server-side promotion engine; no FE impact in PR |
| OBS-06 (trim cosmetic) | **NOT A BUG** | Trim is applied to mutation argument; UI display is the user's typed value (intentional) |
