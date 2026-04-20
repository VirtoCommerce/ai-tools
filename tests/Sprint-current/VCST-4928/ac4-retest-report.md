# VCST-4928 — AC4 Retest Report (bed-with-additional-options)

**Date:** 2026-04-20
**Tester:** qa-frontend-expert (Chrome)
**Environment:** QA — `https://vcst-qa-storefront.govirto.com`
**Product under test:** Bed with Additional Options — `MHI-55960404`
**Product URL:** `/products-with-options/configurations/bed-with-additional-options`
**Login:** mutykovaelena@gmail.com (Agent Chrome) — already-authenticated session
**Browser:** playwright-chrome (Chromium)
**Build:** Ver. 2.47.0-pr-2263-2bf2-2bf2be51

---

## Mission Recap — AC Scenario 4 (from ticket)

> GIVEN the section.maxLength is null (admin field left blank)
>  WHEN the configuration widget renders
>  THEN the counter is either (a) hidden entirely, OR (b) shows "0 / 255" using the default fallback
>   AND the chosen behavior is consistent across all such products
>   AND no console errors occur for the null case

---

## Section Inventory (all sections expanded)

Per-section inspection via `browser_evaluate` on input elements inside the configurator panel:

| # | Section name | Section type (inferred) | Radio options | Text input? | `maxLength` (DOM `input.maxLength`) | `maxlength` attribute | Counter displayed | Notes |
|---|--------------|--------------------------|---------------|-------------|-------------------------------------|------------------------|-------------------|-------|
| 1 | Cover * (required) | Mixed — radio + custom text | 2 (`Custom option: empty` + `Angel`) | YES — inline under "Custom option" radio | **255** (explicit) | `255` | `0 / 255` (matches input) | Option-level text input; maxLength = 255 is an **explicit** configured value, not a fallback. |
| 2 | Mattres (optional) | Product-radio only | 4 (3 products + None) | No | — | — | — | Not a Text section — no counter target. |
| 3 | Fabric and materials (optional) | Mixed — radio + custom text | 4 (incl. `Custom option: empty`) | YES — inline | **10** (explicit) | `10` | `0 / 10` (matches input) | Option-level text input; maxLength = 10 is explicit. |
| 4 | Pillows * (required) | Product-radio only | 1 (`Pillow 50X60`) | No | — | — | — | Not a Text section — no counter target. |

**Raw DOM inspection output (trimmed):**

```json
[
  { "sectionName": "Cover …",                  "radioCount": 2, "textInputCount": 1,
    "inputs": [{ "maxLength": 255, "maxLengthAttr": "255", "ariaDescribedBy": "input-517-details", "visible": true, "counter": "0 / 255" }] },
  { "sectionName": "Mattres …",                "radioCount": 4, "textInputCount": 0, "inputs": [] },
  { "sectionName": "Fabric and materials …",   "radioCount": 4, "textInputCount": 1,
    "inputs": [{ "maxLength": 10, "maxLengthAttr": "10", "ariaDescribedBy": "input-593-details", "visible": true, "counter": "0 / 10" }] },
  { "sectionName": "Pillows …",                "radioCount": 1, "textInputCount": 0, "inputs": [] }
]
```

Both text inputs render with an explicit numeric `maxlength` attribute that matches the displayed counter denominator. **Neither input has a null / missing / default-fallback `maxLength`.**

---

## Live Behaviour Verification on the 255-char (Cover) input

Although Cover's `maxLength=255` is explicit (not a null → 255 fallback), it still provides the clearest evidence for the **255-cap behaviour** the AC describes for the default-fallback path.

| Step | Action | Observed counter | Input length | Console |
|------|--------|------------------|--------------|---------|
| 1 | Empty state, radio `Custom option: empty` selected | `0 / 255` | 0 | clean |
| 2 | Typed "Hello world" via `browser_type` | `11 / 255` (live update) | 11 | clean |
| 3 | Re-filled with a 269-char string ending in `"…AAAA260END"` | `255 / 255` — value capped; trailing `260END` suffix truncated (last chars = `AAAAAAAAAAAAAAAAAAAA`) | 255 | clean — no Vue warn, no TypeError, no null-ref |

Screenshots (saved under `tests/Sprint-current/VCST-4928/evidence/chrome/`):
- `ac4-01-pdp-loaded-cover-expanded.png` — PDP loaded with Cover section auto-expanded; counter `0 / 255`
- `ac4-02-all-sections-expanded.png` — full-page shot with all 4 sections expanded, both text inputs visible
- `ac4-03-cover-255-overflow-capped.png` — Cover input at 255 chars, counter `255 / 255`, overflow typing truncated

---

## Console State

| Phase | Errors | Warnings | Relevant? |
|-------|--------|----------|-----------|
| Initial page load | 1 | 0 | **No** — external image 404 (`images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg`) from "Customers bought together" cross-sell (Off-Road Bike); unrelated to configurator. |
| After expanding all sections | 1 | 0 | Same pre-existing 404 — no new errors. |
| After typing 11 chars | 1 | 0 | No new errors. |
| After pasting 269 chars (overflow) | 1 | 0 | No new errors, no Vue warnings, no TypeError, no null-reference. |

Full console summary:
```
[ERROR] Failed to load resource: the server responded with a status of 404 ()
        @ https://images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg
```
(Same message 4× across the session — single pre-existing asset, not regressive.)

---

## AC4 Verdict

**NOT APPLICABLE on this product** — neither text section on `bed-with-additional-options` (MHI-55960404) has a null `maxLength`. Both configured values are **explicit integers** (`255` on Cover, `10` on Fabric and materials). The null-fallback path (AC4 trigger) cannot be exercised here.

### Evidence for AC4 itself (still unverified in QA)

AC4 requires a Text section whose admin-side `maxLength` field was left blank, so the storefront must **either**:
- (a) hide the counter entirely, **or**
- (b) render `0 / 255` using the documented fallback default.

On this PDP:
- No such null-`maxLength` section exists.
- Therefore the AC4 fallback behaviour is **still untested in QA** end-to-end.
- The **255 cap itself** is proven to work correctly (see "Live Behaviour Verification" — input truncates at 255, counter renders `255 / 255`, no console errors) — so *if* the product-level Option.MaxLength value becomes null, the frontend has demonstrably correct `maxlength="255"` handling, meaning the (b)-branch of AC4 is the likelier outcome once such a product exists.

### Supersession of earlier PARTIAL result

This re-verification **supersedes** the earlier PARTIAL finding that the "Fabric and materials" section on MHI-55960404 was not reachable as a text input:
- Previous finding: PARTIAL — section could not be reached as a text input.
- New finding: "Fabric and materials" **does** expose a text input (under the `Custom option: empty` radio), with an explicit `maxLength=10` / counter `0 / 10`. Earlier reach failure was likely a non-expanded accordion; this run expanded all four sections and confirmed the component mounts correctly on both text-bearing sections (Cover, Fabric).
- The AC4 null-path remains a **data gap**, not a frontend defect: QA has no configurable product where an option's `MaxLength` is left blank in admin. Recommend seeding such a product (ticket action on the ticket owner / content team) before closing AC4.

### Final classification

- **Functional behaviour observed (non-null path):** PASS — counter renders correctly for both `maxLength=255` and `maxLength=10`; live updates on type; hard-caps at maxLength on overflow; no console errors.
- **AC Scenario 4 (null-path) verdict:** **NOT APPLICABLE / NOT REACHABLE on this product.** Cannot upgrade prior PARTIAL to PASS or FAIL without a product whose section `maxLength` is null. Flag as a **data gap**, not a frontend bug.

---

## Recommendation

1. Keep AC4 in `NEEDS DATA` state rather than closing it — PARTIAL result stands, but with a clearer root cause.
2. Ask the admin / product-content team to prepare a configurable product where at least one Text section's Option.MaxLength field is left blank in admin, so AC4 can be exercised.
3. Once such a product exists, re-run this AC4 procedure (type into the input, observe whether the counter hides or shows `0 / 255`, verify console cleanliness).
4. No new bug filed — no frontend defect detected on this PDP for the AC4 scenarios that WERE reachable.

---

## Artefacts

- `tests/Sprint-current/VCST-4928/evidence/chrome/ac4-01-pdp-loaded-cover-expanded.png`
- `tests/Sprint-current/VCST-4928/evidence/chrome/ac4-02-all-sections-expanded.png`
- `tests/Sprint-current/VCST-4928/evidence/chrome/ac4-03-cover-255-overflow-capped.png`
- This report: `tests/Sprint-current/VCST-4928/ac4-retest-report.md`
