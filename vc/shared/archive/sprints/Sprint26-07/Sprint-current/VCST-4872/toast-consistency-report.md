# VCST-4872 Toast Notification & UI Consistency Audit Report

**Date:** 2026-04-16
**Environment:** https://vcst-qa.govirto.com/apps/page-builder-shell/?storeId=B2B-store
**Build:** pr-116-9387
**Browser:** Edge (Playwright)
**Tester:** qa-backend-expert (automated audit)

---

## 1. Toast Notification Inventory

### 1.1 Toast Inventory Table

| Feature | Action | Toast Text | Type/Color | Position | Duration (ms) | Icon | Dismiss | Evidence |
|---------|--------|-----------|------------|----------|---------------|------|---------|----------|
| Save content | Click "Save content" | "Content saved to file successfully" | `vc-notification--success` (green) | top-center | ~3,311 | check_circle | X button | 07-save-content-toast-top.png |
| Clone | Click "Clone" | "Page cloned successfully" | `vc-notification--success` (green) | top-center | ~3,316 | check_circle | X button | 09-clone-toast-top.png |
| Load content | Click "Load content" + select file | **NO TOAST** | N/A | N/A | N/A | N/A | N/A | 10-load-content-result.png |
| Save (metadata) | Modify name + click "Save" | **NO TOAST** | N/A | N/A | N/A | N/A | N/A | N/A |
| Publish | Click "Publish" | **NO TOAST** | N/A | N/A | N/A | N/A | N/A | N/A |
| Unpublish | Click "Unpublish" | **NO TOAST** | N/A | N/A | N/A | N/A | N/A | N/A |
| Archive | Click "Archive" + Confirm | **NO TOAST** | N/A | N/A | N/A | N/A | N/A | 11-archive-toast-top.png |

### 1.2 Toast Technical Details

Both implemented toasts (Save content, Clone) share the same component and styling:

```
Container class: notification__container
Container position: fixed, top: 14px, centered (transform translateX -50%)
Container ID pattern: notification-top-center
Data attribute: data-position="top-center"

Toast element class: vc-notification vc-notification--top-center vc-notification--success
Background: rgb(255, 255, 255) (white)
Border radius: 4px
Padding: 8px 16px
Font: 14px, weight 400
Width: ~275-329px (varies by text length)
Height: ~44.6px
Left indicator bar: green (success variant)
Icon: check_circle, color var(--notification-success)
Dismiss icon: close (X), small size

Entrance animation: slides from top (transform translateY -30px, opacity 0 -> 1)
Auto-dismiss: ~3,300ms after appearing
Exit animation: reverse of entrance
```

---

## 2. Toast Consistency Analysis

### 2.1 New Toasts (Save content vs Clone) -- CONSISTENT

| Property | Save content | Clone | Match? |
|----------|-------------|-------|--------|
| Component class | `vc-notification--success` | `vc-notification--success` | YES |
| Position | top-center | top-center | YES |
| Background color | white | white | YES |
| Left indicator | green | green | YES |
| Icon | check_circle (green) | check_circle (green) | YES |
| Font size | 14px | 14px | YES |
| Auto-dismiss | ~3,311ms | ~3,316ms | YES (~3.3s) |
| Dismiss button | X (close) | X (close) | YES |
| Animation | slide from top | slide from top | YES |
| Wording pattern | "Content saved to file successfully" | "Page cloned successfully" | SEE BELOW |

**Wording Pattern Analysis:**
- Save content: `[Subject] [verb] [modifier] [adverb]` -> "Content saved to file successfully"
- Clone: `[Subject] [verb] [adverb]` -> "Page cloned successfully"
- Both end with "successfully" -- consistent adverb pattern
- Subject differs: "Content" vs "Page" -- appropriate for each context

### 2.2 New Toasts vs Existing Page Builder Operations -- INCONSISTENT

| Operation | Has Toast? | Feedback Mechanism |
|-----------|-----------|-------------------|
| **Save content** (NEW) | YES - success toast | Toast notification |
| **Clone** (NEW) | YES - success toast | Toast notification + new blade opens |
| **Load content** | NO | New page blade opens (implicit feedback) |
| **Save** (metadata) | NO | "Has unsaved changes" banner disappears, Save button disables |
| **Publish** | NO | Status changes to "Published", button changes to "Unpublish" |
| **Unpublish** | NO | Status changes to "Draft", button changes to "Publish" |
| **Archive** | NO | Confirmation dialog, then blade closes, item removed from list |

**FINDING [Medium Severity]:** Toast notifications are only present on the two NEW operations (Save content, Clone). All pre-existing operations (Save, Publish, Unpublish, Archive, Load content) provide feedback through UI state changes only (status badges, button text changes, blade closing) but NO toast notification. This creates an inconsistency where new features have more prominent feedback than established features.

---

## 3. Button Visual Consistency

### 3.1 Button Style Matrix (All Toolbar Buttons)

| Button | Icon | Font Size | Font Weight | Color | BG | Padding | Height | Border Radius | data-test-id |
|--------|------|-----------|-------------|-------|-----|---------|--------|---------------|--------------|
| Save | save | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | save |
| Archive | delete | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | delete |
| Open designer | crop | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | openPageDesigner |
| **Save content** | download | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | downloadContent |
| **Clone** | content_copy | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | clonePage |
| Publish | description | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | publishPage |
| Add (list) | add | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | add |
| Refresh (list) | refresh | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | refresh |
| **Load content** (list) | upload | 16px | 400 | black | transparent | 0px 12px | 41.94px | 0px | load |

**RESULT: ALL buttons are perfectly consistent** in styling. New buttons (Save content, Clone, Load content) match existing buttons exactly in: font size, font weight, color, background, padding, height, and border radius.

### 3.2 Icon Consistency

All buttons use Material Symbols icons (`material-symbols-outlined`). The new buttons use appropriate semantic icons:
- **Save content**: `download` -- consistent with export/save-to-file semantics
- **Clone**: `content_copy` -- standard copy/duplicate icon
- **Load content**: `upload` -- consistent with import/load-from-file semantics

The icon pairing between Save content (`download`) and Load content (`upload`) is semantically coherent and symmetrical.

### 3.3 Hover State Consistency

| Button | Hover BG | Hover Color | Hover Cursor | Hover Shadow |
|--------|----------|-------------|--------------|--------------|
| Save (disabled) | transparent | black | default | none |
| Archive | transparent | black | pointer | none |
| Open designer | transparent | black | pointer | none |
| Save content | transparent | black | pointer | none |
| Clone | transparent | black | pointer | none |
| Publish | transparent | black | pointer | none |

All enabled buttons share identical hover behavior. Disabled buttons correctly show `cursor: default`.

### 3.4 Disabled State Behavior

When a button is disabled:
- `cursor: default` (no pointer)
- Visual appearance unchanged (same color, same opacity: 1)
- No `disabled` HTML attribute -- state managed via cursor only

On the **New page** blade (after Load content), only Archive is enabled. Save, Open designer, Save content, and Clone are all disabled. Publish is absent entirely.

---

## 4. Label/Text Consistency

### 4.1 Verb Pattern Analysis

| Button | Label | Pattern | Word Count |
|--------|-------|---------|------------|
| Save | "Save" | Single verb | 1 |
| Archive | "Archive" | Single verb | 1 |
| Clone | "Clone" | Single verb | 1 |
| Publish | "Publish" | Single verb | 1 |
| Open designer | "Open designer" | Verb + noun | 2 |
| **Save content** | "Save content" | Verb + noun | 2 |
| **Load content** | "Load content" | Verb + noun | 2 |
| Add | "Add" | Single verb | 1 |
| Refresh | "Refresh" | Single verb | 1 |

**RESULT: Labels are consistent.** Single-word buttons (Save, Archive, Clone, Publish, Add, Refresh) follow a simple verb pattern. Multi-word buttons (Open designer, Save content, Load content) follow a "verb + noun" pattern. "Clone" as a single word is consistent with other single-word action buttons like "Publish" and "Archive".

### 4.2 i18n / Translation Keys

No raw translation keys were observed during testing. All labels render properly as human-readable English text. No `{key}` or `$t(...)` artifacts were displayed.

---

## 5. Edge Cases

### 5.1 Rapid Double-Click Clone -- BUG FOUND

| Test | Result | Severity |
|------|--------|----------|
| Double-click "Clone" rapidly | **TWO pages created, TWO toasts shown sequentially** | Medium |

**Details:**
- Draft count increased by 2 (e.g., 30 -> 32)
- First toast appeared and dismissed (~3.3s), then second toast appeared and dismissed (~3.3s)
- Toasts appeared sequentially, not stacked simultaneously
- **No debounce protection on Clone operation**

**Impact:** Users who accidentally double-click will create duplicate clones. The sequential toasts provide correct feedback (one per clone), but the underlying issue is that the operation should be debounced.

### 5.2 Rapid Double-Click Save Content -- PASS

| Test | Result | Severity |
|------|--------|----------|
| Double-click "Save content" rapidly | Only ONE download triggered, ONE toast shown | N/A (pass) |

Save content correctly handles rapid clicks -- only one download and one toast notification. This is the expected behavior.

### 5.3 Clone Then Save Content -- Not Testable

Due to Clone navigating to a new page, clicking Clone immediately changes the context. Subsequent Save content would operate on the cloned page, which is valid behavior.

### 5.4 Load Content File Types

| Test | Result |
|------|--------|
| Load valid JSON file | New page blade opens, no toast |
| Load content opens file chooser | Correct -- native OS file dialog |

---

## 6. Summary of Findings

### Issues Found

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | **Clone has no debounce** -- rapid double-click creates 2 pages with 2 sequential toasts | **Medium** | Edge Case / UX |
| 2 | **Toast inconsistency across operations** -- only Save content and Clone show toasts; Save, Publish, Unpublish, Archive, Load content do not | **Low** | Consistency |
| 3 | **No error toast paths testable** -- Save content and Clone have no visible error handling path (no error toast observed for any failure scenario) | **Low** | Observability |

### What Works Well

- Save content and Clone toasts are **perfectly consistent** with each other (same component, styling, timing, position, animation)
- All toolbar buttons are **visually identical** in styling (font, padding, height, color, hover state)
- Icon choices are **semantically appropriate** (download/upload pair, content_copy for clone)
- Label wording follows **consistent patterns** (single verbs or verb+noun)
- Toast auto-dismiss timing is uniform at ~3.3 seconds
- Save content is properly debounced against rapid clicks
- No console errors during any operation
- All i18n labels render correctly

### Recommendations

1. **Add debounce to Clone** to prevent accidental duplicate page creation (match Save content behavior)
2. **Consider adding toasts to other operations** (Publish, Archive, Load content) for consistency, or document that these intentionally rely on implicit UI state feedback only
3. **Implement error toasts** for failure scenarios (e.g., `vc-notification--error` variant) on both Save content and Clone

---

## Evidence Files

| File | Description |
|------|-------------|
| `01-pagebuilder-initial-load.png` | Initial PageBuilder Draft tab view |
| `02-page-detail-toolbar.png` | Page detail blade with full toolbar |
| `07-save-content-toast-top.png` | Save content toast (cropped top bar) - clearly visible |
| `08-save-content-toast-full.png` | Save content toast (full page) |
| `09-clone-toast-top.png` | Clone toast (cropped top bar) - clearly visible |
| `10-load-content-result.png` | Load content result - New page blade opens |
| `11-archive-toast-top.png` | Archive result - no toast visible |
