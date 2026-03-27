# VCST-4704 Reproduction Report
## [BOPIS][A11y] WCAG 2.4.3 — Focus management failures in pickup location modal

**Date:** 2026-03-26
**Environment:** QA — https://vcst-qa-storefront.govirto.com
**Build:** Ver. 2.45.0-pr-2224-4613-4613b6ec
**Theme:** Coffee (light mode active during session)
**WCAG Criterion:** 2.4.3 Focus Order (Level AA)
**Severity:** P0 — A11y Critical (keyboard users lose orientation in a checkout-path modal)
**Status:** REPRODUCED — all 3 failure modes confirmed

---

## Summary

The pickup location modal (`role="dialog"`, title "Pick points") has three distinct focus management failures that violate WCAG 2.4.3. The modal contains two regions: a **list panel** (locations, filters, map) and a **detail/info card panel** that opens when a location is selected. All failures stem from the same root cause: when the detail card is pre-rendered on modal open (because a location was previously selected), a programmatic `focus()` call inside the detail card fires and overrides correct modal focus management.

---

## Failure 1 — Wrong initial focus on first open

### Expected behaviour (WCAG 2.4.3)
On modal open, focus must move to the first focusable element in the dialog — `BUTTON[aria-label="Close"]` (index 0 in DOM order).

### Actual behaviour
Focus lands on `BUTTON[data-test-id="pickup-location-card-cancel"]` ("Cancel") at **focusable element index 123 out of 125** — skipping the entire list panel.

### Evidence

**DOM order of first 3 focusable elements inside dialog:**
| Index | Element | Expected focus? |
|-------|---------|----------------|
| 0 | `BUTTON.vc-dialog-header__close` aria-label="Close" | YES — correct per WCAG |
| 1 | `BUTTON "Country"` aria-haspopup="dialog" | No |
| 2 | `INPUT.vc-input__input` (search) | No |

**Actual activeElement at modal open:**
```
tagName:     BUTTON
className:   vc-button group vc-button--size--sm vc-button--color--secondary vc-button--outline--secondary vc-button--truncate
dataTestId:  pickup-location-card-cancel
textContent: Cancel
focusIndex:  123 / 125
```

**Detail card structure (the source of the wrong focus):**
| Index | Element | Description |
|-------|---------|-------------|
| 122 | `BUTTON.vc-dialog-header__close` aria-label="Close" | Second Close button (detail card header) |
| 123 | `BUTTON[data-test-id="pickup-location-card-cancel"]` | **Cancel** — receives focus |
| 124 | `BUTTON[data-test-id="pickup-location-card-select"]` | "Pick up here" |

**Screenshot:** `reports/bugs/VCST-4704/03-failure1-modal-open-focus.png`
**Screenshot (annotated index):** `reports/bugs/VCST-4704/04-failure1-focus-at-cancel-index123.png`

---

## Failure 2 — Focus returns to wrong element on close

### Expected behaviour (WCAG 2.4.3)
When the modal is dismissed (Escape key or Close button), focus must return to the element that triggered the modal — `BUTTON[data-test-id="select-address-button"]` (.vc-address-selection__button).

### Actual behaviour
After pressing Escape, `document.activeElement` becomes `BODY`. The trigger button receives no focus. (The ticket additionally describes `INPUT.vc-checkbox__input` as an alternate outcome — consistent with the non-deterministic focus restoration indicating the component performs no explicit `triggerElement.focus()` call on close.)

**Trigger button identity:**
```
tagName:     BUTTON
className:   vc-button group vc-button--size--xs vc-button--color--primary vc-button--outline--primary vc-button--icon vc-address-selection__button
dataTestId:  select-address-button
ariaLabel:   null  ← additional a11y issue: trigger has no accessible name
ariaHasPopup: null ← additional a11y issue: no aria-haspopup declared
```

**activeElement after Escape (800ms settle wait):**
```
tagName:  BODY
className: (empty)
```

**Screenshot:** `reports/bugs/VCST-4704/05-failure2-after-escape-focus-body.png`

---

## Failure 3 — Async focus theft on reopen (with pre-selected location having tel: link)

### Setup
Selected "Brooklyn Academy of Music" (USA, New York, 30 Lafayette Ave) as the pickup location. This location's detail card contains a `<a href="tel:+10000000061">` phone link. Closed modal. Reopened.

### Expected behaviour (WCAG 2.4.3)
On reopen, focus must go to the first focusable element: `BUTTON[aria-label="Close"]` (index 0).

### Actual behaviour
Focus lands immediately on `<A href="tel:+10000000061">` at **focusable element index 123 out of 127** — at t=0ms and stays there throughout the polling window (confirmed stable at t=1200ms). There is no intermediate step to "Country" as described in the ticket; the tel: link receives focus directly from the first measurement point.

**Focus timeline (12 polling points, 0–1200ms):**
| Time | tagName | href | textContent | Index |
|------|---------|------|-------------|-------|
| t=0ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=50ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=150ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=300ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=450ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=600ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=650ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=700ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=750ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=850ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=1000ms | A | tel:+10000000061 | +10000000061 | 123 |
| t=1200ms | A | tel:+10000000061 | +10000000061 | 123 |

**DOM position of tel: link in the dialog:**
| Index | Element | isCurrent |
|-------|---------|-----------|
| 0 | BUTTON aria-label="Close" | false |
| 1 | BUTTON "Country" | false |
| ... | (120 list panel elements) | false |
| 122 | BUTTON aria-label="Close" (detail card) | false |
| **123** | **A href="tel:+10000000061"** | **true** |
| 124 | A href="mailto:pickup61@example.com" | false |
| 125 | BUTTON "Cancel" | false |
| 126 | BUTTON "Pick up here" | false |

**Screenshot:** `reports/bugs/VCST-4704/07-failure3-location-with-tel-link.png`
**Screenshot (focus on tel:):** `reports/bugs/VCST-4704/08-failure3-reopen-tel-link-focus.png`

---

## Root Cause Analysis

The modal uses a split-panel layout: a list panel and a detail card sub-dialog rendered at the same DOM level. The detail card (`class="pickup-location-card"`) is a nested `vc-dialog` rendered inside the outer dialog whenever a location is selected. The detail card's `vc-dialog` component calls `focus()` on its own first tabbable element during its `mounted`/`onOpen` lifecycle hook — **without checking whether it is the outer modal's intended initial focus target**. This overrides any `focus()` call made by the outer dialog's open handler.

The specific element receiving focus depends on what is tabbable in the detail card:
- For locations **without** a phone number: `BUTTON[data-test-id="pickup-location-card-cancel"]` (index 123)
- For locations **with** a phone number: `A[href^="tel:"]` (index 123 in that case too, because the tel: link appears before Cancel in DOM order when phone data is present)

The focus return failure (Failure 2) is a separate issue: the outer dialog's `onClose` handler does not store or restore the trigger element reference. When the modal is destroyed, `document.activeElement` reverts to `BODY` (Chrome default when focused element is removed from DOM).

---

## Additional Accessibility Issues Discovered

The following were observed during reproduction and are secondary findings:

1. **Trigger button has no accessible name** — `BUTTON.vc-address-selection__button` (`data-test-id="select-address-button"`) has `ariaLabel: null`. Keyboard users and screen readers cannot identify its purpose. Violates WCAG 4.1.2.
2. **Trigger button missing `aria-haspopup`** — The button opens a dialog but declares no `aria-haspopup` attribute. Screen readers will not announce "opens dialog" to users.
3. **Outer dialog missing `aria-label` or `aria-labelledby`** — `dialog[aria-modal="true"]` has no accessible name attribute. The heading "Pick points" exists as `h2` inside but is not associated via `aria-labelledby`. Minor gap in WCAG 4.1.2.
4. **Detail card "Close" button has `data-skip-autofocus` attribute** — This custom attribute appears to be an attempted workaround for the autofocus problem but is not functioning as expected.

---

## Steps to Reproduce (Verified)

### Failures 1 & 2 (any pre-selected location)

1. Navigate to `https://vcst-qa-storefront.govirto.com/cart` (authenticated, cart has items, Pickup delivery mode active).
2. Click the unlabelled edit button next to the pickup point address (`data-test-id="select-address-button"`).
3. Modal "Pick points" opens.
4. Evaluate `document.activeElement` — **expected:** Close button (index 0); **actual:** Cancel button in detail card (index 123).
5. Press Escape.
6. Evaluate `document.activeElement` — **expected:** trigger button; **actual:** BODY.

### Failure 3 (location with phone number pre-selected)

1. Open the pickup modal and select "Brooklyn Academy of Music" (has `tel:` link in detail card).
2. Click "Pick up here" — modal closes.
3. Click the pickup trigger button to reopen.
4. Evaluate `document.activeElement` at t=0ms — **actual:** `<A href="tel:+10000000061">` (index 123).
5. Focus remains on tel: link throughout (confirmed at t=50ms through t=1200ms).

---

## WCAG Classification

| Criterion | Level | Verdict | Notes |
|-----------|-------|---------|-------|
| 2.4.3 Focus Order | AA | FAIL | Initial focus skips 123 elements; lands in detail card not modal entry |
| 2.4.3 Focus Order | AA | FAIL | No focus return to trigger on modal close |
| 2.4.3 Focus Order | AA | FAIL | Reopen: focus on tel: link deep in detail card, not first focusable |
| 4.1.2 Name, Role, Value | AA | FAIL | Trigger button has no accessible name and no aria-haspopup |

---

## Fix Recommendations

1. **Outer dialog open handler** — After the outer dialog mounts, explicitly call `focus()` on its first focusable element (`BUTTON.vc-dialog-header__close`), ensuring this runs *after* any child component lifecycle hooks. Use `nextTick()` + `setTimeout(fn, 0)` to guarantee it fires last.
2. **Detail card autofocus suppression** — The inner `vc-dialog` (detail card) must not call `focus()` when it is mounted inside another dialog that has just opened. The `data-skip-autofocus` attribute already exists but is not being honoured — the consumer of this attribute needs to be wired up.
3. **Focus return on close** — Store `document.activeElement` as `triggerRef` before opening the dialog, then call `triggerRef.focus()` in the dialog's `onClose`/`onAfterLeave` handler.
4. **Trigger button** — Add `aria-label="Change pickup location"` and `aria-haspopup="dialog"` to `BUTTON.vc-address-selection__button`.

---

## Evidence Files

| File | Description |
|------|-------------|
| `reports/bugs/VCST-4704/01-storefront-home.png` | Storefront homepage |
| `reports/bugs/VCST-4704/02-cart-page.png` | Cart page with Pickup selected |
| `reports/bugs/VCST-4704/03-failure1-modal-open-focus.png` | Modal open — first open state |
| `reports/bugs/VCST-4704/04-failure1-focus-at-cancel-index123.png` | Focus confirmed at Cancel (index 123) |
| `reports/bugs/VCST-4704/05-failure2-after-escape-focus-body.png` | After Escape — focus on BODY not trigger |
| `reports/bugs/VCST-4704/06-failure3-reopen-focus-cancel-index123.png` | Second open with original location |
| `reports/bugs/VCST-4704/07-failure3-location-with-tel-link.png` | Detail card showing tel: link |
| `reports/bugs/VCST-4704/08-failure3-reopen-tel-link-focus.png` | Reopen with tel: location — focus on phone link |

---

## Sign-off

```
@qa-lead-orchestrator: VCST-4704 Reproduction Complete

Feature: BOPIS pickup location modal  |  Ticket: VCST-4704  |  Environment: QA

| Area                          | Status | Issues |
|-------------------------------|--------|--------|
| Failure 1 — Initial focus     | fail   | 1 P0   |
| Failure 2 — Focus return      | fail   | 1 P0   |
| Failure 3 — Async tel: theft  | fail   | 1 P0   |
| Secondary a11y findings       | fail   | 2 High |

Bugs:
- [P0] WCAG 2.4.3: Initial focus skips to detail card Cancel button (index 123/125) on modal open
- [P0] WCAG 2.4.3: Focus returns to BODY (not trigger button) after Escape/close
- [P0] WCAG 2.4.3: Reopen with tel: location — focus goes to <a href="tel:"> (index 123/127), not Close button
- [High] WCAG 4.1.2: Trigger button has no accessible name and no aria-haspopup
- [High] WCAG 4.1.2: data-skip-autofocus workaround present but not functioning

Decision: BLOCKED
Blocking: All 3 WCAG 2.4.3 failures are P0 — keyboard users cannot reliably operate the pickup selection modal
Full report: reports/bugs/VCST-4704-reproduction-report.md
```
