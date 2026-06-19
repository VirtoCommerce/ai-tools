# VCST-5021 Fix Verification — Custom-code coupon apply button disabled on empty input

**Verdict: VERIFIED (PASS)** — Low/UX

**Env:** vcst-qa @ storefront `2.52.0-pr-2344-6158-6158f02e` (= fix commit; confirmed in footer on sign-in, search, and cart pages). Browser: playwright-chrome, 1920×1080, en-US.

## Summary
The fix is live and correct. In the cart **Discount & coupons** widget, the "Custom code" card's apply (→) button is now **reactively disabled whenever the trimmed input is empty** and **enabled when a non-empty code is present**. Clicking while empty is impossible (no coupon request fires). When enabled and clicked, the button works and gives clear feedback — no silent no-op. The previous bug (button enabled-but-no-op on empty) is resolved.

## STR — empty → disabled, ×3 (PASS 3/3)
Tested via reactive transitions on the Custom code input (signed in, B2B cart with 14 line items so the widget renders):
1. On page load, input empty → button `[disabled]`, label "Apply coupon". **PASS**
2. Type "ZZINVALIDCODE123" → button enabled (`cursor=pointer`); clear input → button returns to `[disabled]`. **PASS**
3. Whitespace-only "   " → button stays `[disabled]` (trim check); clear → `[disabled]`. **PASS**

## Checklist (8 PASS, 1 N/A)
1. Empty input → apply button disabled — **PASS** (core fix, ×3 above)
2. Click while empty → no coupon request — **PASS** (clicking the disabled empty button fired no `ValidateCoupon`/apply mutation; only page-load suggestion validations present)
3. Root cause addressed (clear visual signal, not silent no-op) — **PASS** (button greys out disabled; on enabled-invalid submit shows inline "This code is not valid")
4. Type a real/non-empty code → enabled; applying sends mutation + UI responds — **PASS** (typing enabled the button; clicking fired `ValidateCoupon(coupon: "ZZINVALIDCODE123")` → 200 → inline error "This code is not valid". Functional, with feedback.)
5. Whitespace-only "   " → stays disabled — **PASS** (trim check works)
6. Clear back to empty → returns to disabled — **PASS** (reactive both directions)
7. Applied coupon's remove (trash) button still works — **N/A** — could not reach a fresh applied-via-widget card: all valid suggested codes (winegift/zephir/agent1/One) are already active (Discount −$1,099.89), and re-applying any returns "This code is not valid"; invalid codes can't apply. Fix only touched the default Custom-code view, so the applied-card view is unaffected.
8. No NEW console errors on /cart — **PASS** — coupon interaction produced 0 errors. Pre-existing/unrelated noise only: `s1.apart.pl/*.jpg` 404s (3rd-party product images) and stale Builder.io/customComponents dynamic-chunk 404s (cache artifact from a mixed pr-2315/pr-2344 first load — see note).
9. BL-UI layout stability — **PASS** — button keeps same size/position/arrow icon across disabled↔enabled; only the disabled greying changes and an inline validation alert appears *below* the input row (additive feedback, clears when input emptied). No horizontal shift / button resize.

## Notes / side-observations (not VCST-5021 defects)
- **Stale-bundle on first load:** initial page loads showed footer `pr-2315`; after a re-render the storefront consistently served the correct `pr-2344`. Matches the known 4h asset-cache behavior. The Builder.io/`events`/`customComponents` chunk 404s in console are a symptom of that mixed first load, not the fix.
- **/cart 403 for some users:** the cart route returned `403 Access denied` for the `USER_EMAIL` org account (Coffee shop) and intermittently for the personal `USER2` account. Root cause: the `promotionCoupons` GraphQL query returns `{code: "Forbidden", "Access denied."}` for those users, which gates the cart page. Verification was completed under the restored Coffee-shop session once the cart had items and the query resolved. This is an account/permission/timing observation worth a separate look — unrelated to the button fix.

## Evidence
- `screenshots/VCST-5021-01-custom-code-empty-disabled.png` — empty input, button disabled (the previously-failing state)
- `screenshots/VCST-5021-02-custom-code-typed-enabled.png` — non-empty input, button enabled
- `screenshots/VCST-5021-03-custom-code-cleared-disabled.png` — cleared back to empty, button disabled (reactive)
- Network: `ValidateCoupon` POST /graphql → 200 fired only on enabled-button click; none on empty-button click. HAR auto-captured under `test-results/chrome/har/`.
