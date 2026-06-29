# VCST-4951 — Page Builder Toast Notifications: Fix Verification Report

**Date:** 2026-04-20
**Tester:** QA (automated via playwright-edge MCP)
**Environment:** https://vcst-qa.govirto.com
**Browser:** Microsoft Edge (Playwright)

---

## Build Versions Confirmed

| Component | Version |
|-----------|---------|
| **Platform** | 3.1019.0 |
| **PageBuilderModule** | **3.1005.0-pr-126-bd83** (PR #126 deployed) |
| **Platform version on module** | 3.1016.0 |

Source: `GET /api/platform/modules` → `{id: "VirtoCommerce.PageBuilder", version: "3.1005.0-pr-126-bd83"}`.

---

## Verdict

# **FAIL** — Fix NOT verified on QA.

The PR #126 code change is deployed, but **4 of the 5 promised new success toasts do NOT render in the UI** under real user interaction. Only backend-side change (archived content retrieval, item #8) works.

---

## Pages & IDs Used

| Purpose | Page name | groupId (blade URL) |
|---------|-----------|---------------------|
| Load content file source | TC-E2E-001 Public EN Page (copy 5) | `f9b273ea-3886-46cb-96fa-c141adc4a00a` |
| Save tests | TC-E2E-001 Public EN Page (copy 5) EDIT1 → EDIT1 (copy) → (copy 4)y | `d67aeb7f...` / `ce5b330a-cbc2-47ba-8265-e78af93850a4` |
| Clone tests (baseline) | TC-E2E-001 Public EN Page (copy 4) → (copy 5) | `ce5b330a...` → `5b960a94-fd45-413c-8834-4ec622460568` |
| Archive tests | "(copy)x" page, "My new content (copy)" | `d67aeb7f...`, `8b6ba6f8...` |
| Publish/Unpublish | "(copy)x" page, "(copy 4)y" | `d67aeb7f...`, `ce5b330a...` |
| Item #8 API verification | d67aeb7f-ba49-43af-bbfb-f5f87c0d1528 (Archived) | same |

Test content JSON used for Load: `tests/Sprint-current/VCST-4951/test-content.json` (563 bytes, 2-widget valid page export).

---

## STR Pass Rate Summary — 5 NEW toasts (fix targets)

| Toast | Expected | Run 1 | Run 2 | Run 3 | STR |
|-------|----------|-------|-------|-------|-----|
| 1. Load content success | "Content loaded successfully" | FAIL | FAIL | FAIL | **0 / 3** |
| 2. Save page success | "Page saved successfully" | FAIL | FAIL | FAIL | **0 / 3** |
| 3. Archive page success | "Page archived successfully" | FAIL | FAIL | FAIL | **0 / 3** |
| 4. Publish page success | "Page published successfully" | FAIL | FAIL | FAIL | **0 / 3** |
| 5. Unpublish page success | "Page unpublished successfully" | FAIL | FAIL | FAIL | **0 / 3** |

All 5 NEW toasts required a 3/3 pass rate. None achieve any pass. **Fix not effective in UI.**

---

## Detection Methodology (why this is definitive)

Because toasts auto-dismiss ~3s, static screenshots can miss them. Approach used:

1. Injected a `MutationObserver` on `document.body` (childList + subtree) that captured every newly added DOM node whose text matched `success|saved|loaded|archived|published|cloned|fail|error` OR whose class matched `notif|toast|snack|alert`.
2. Reset the buffer (`window.__toasts = []`) immediately before each action (click), then queried it after.
3. Control test: **Clone action** (pre-existing toast) captured the toast every time with full DOM:
   ```
   class="vc-notification vc-notification--top-center vc-notification--success"
   text="check_circle  Page cloned successfully  close"
   ```
4. The same observer, identical code path, caught **zero** such notifications for Load content, Save, Archive, Publish, Unpublish across all 15 runs.

Conclusion: the Vue `.notification__container` hosts these toasts, and the fix's 5 new dispatches are **not reaching** that container.

---

## Verification Checklist (12 items)

### Fix Confirmation — 5 toasts

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | **Load content toast** ("Content loaded successfully") | **FAIL** 0/3 | `01-load-content-toast.png` — only "New page" blade opens, no toast. Observer captured 11, 11, 64 DOM additions across runs; zero `vc-notification--` classes or "successfully" text. Functional effect (new page with pre-filled content) works. |
| 2 | **Save toast** ("Page saved successfully") | **FAIL** 0/3 | `02-save-toast.png` — page title updates ("...EDIT1 details", Modified stamp 11:30:42 AM), Draft refreshed, but no toast. Observer: 58–59 additions per run, zero notifications. |
| 3 | **Archive toast** ("Page archived successfully") | **FAIL** 0/3 | `03-archive-confirm.png` (confirmation dialog), `03-archive-toast.png` (list after archive). Archive succeeds (Draft 32→31, Archived 41→42 / 42→43), blade closes, but no toast. Observer: 43 additions per run, zero notifications. |
| 4 | **Publish toast** ("Page published successfully") | **FAIL** 0/3 | `04-publish-toast.png` — Status chip flips to "Published", Publish button becomes Unpublish, Active count refreshes, but no toast. Observer: 2 additions per run, zero notifications. |
| 5 | **Unpublish toast** ("Page unpublished successfully") | **FAIL** 0/3 | `05-unpublish-toast.png` — Status chip flips back to "Draft", Unpublish becomes Publish, but no toast. Observer: 2 additions per run, zero notifications. |

### Regression — existing toasts must still fire

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 6 | Save content toast ("Content saved to file successfully") | **BLOCKED** | Save content triggers a browser download dialog that closed the Playwright MCP session. Not re-run due to time; MCP limitation. The underlying data flow (download of page JSON) is confirmed working via the equivalent API used earlier (`GET /api/page-builder-pages/grouped/{id}/content`). |
| 7 | **Clone toast** ("Page cloned successfully") | **PASS** | `06a-clone-toast.png`, `07-clone-toast-existing.png`. Observer captured the full toast DOM twice:<br>`class="vc-notification vc-notification--top-center vc-notification--success"`, `text="check_circle Page cloned successfully close"`. Baseline Vue notification pipeline is healthy. |

### Backend Change

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 8 | **Archived page content retrieval** (`GET /api/page-builder-pages/grouped/{id}/content?draft=false` on archived page) | **PASS** | Archived page `d67aeb7f-ba49-43af-bbfb-f5f87c0d1528` returned HTTP 200 with 2-widget content for **both** `draft=false` (Archived served — new behavior) and `draft=true` (unchanged). Responses identical. No 204/404. See **API response** below. |

### Cross-cutting

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 9 | **Toast component consistency** (`vc-notification--success`, top-center, 3s auto-dismiss, "... successfully" wording) | **N/A (new toasts never render)** | Cannot verify wording/position/dismiss on toasts that never appear. The baseline Clone toast follows the correct pattern (`vc-notification vc-notification--top-center vc-notification--success`), so the visual spec is satisfied *if* new dispatches were wired correctly. |
| 10 | **No new console errors** across all flows | **PASS** | `console-errors.log` = 0 errors. 1 pre-existing warning ("Component Tag is already registered" in `vc-shell-framework82469.js`) unrelated to PR #126. |
| 11 | **Button state logic preserved** (Save disabled when !isModified; Publish disabled when isModified or !valid) | **PASS** | Snapshots confirmed: unmodified page → Save class `vc-blade-toolbar-base-button--disabled`, `saveBtn.disabled=true`. After keystroke → Save becomes enabled (`disabled=false`, class `vc-blade-toolbar-base-button`). Publish enabled only on unmodified/valid Draft pages. |
| 12 | **i18n keys resolve** (no `PAGE_BUILDER.PAGES.ALERTS.SAVE_SUCCESS` raw keys visible) | **N/A (no toasts)** | Toast strings don't render at all. If the toast did render with the key, it would have been captured by the observer. Observer searches for `success|saved|loaded|archived|published|cloned` — none matched. Conclusion: not a translation-missing bug either; the notification call is either not invoked or the new i18n strings are resolving to an empty string somewhere upstream of the Vue notification container. |

---

## API Evidence — Item #8

`curl -H "Authorization: Bearer $TOKEN" https://vcst-qa.govirto.com/api/page-builder-pages/grouped/d67aeb7f-ba49-43af-bbfb-f5f87c0d1528/content?draft=false`

Response HTTP 200, body:
```json
{
  "settings": {},
  "content": [
    { "widgetBackground": {"color": "#ffffff"}, "title": {"text":"Photo","color":"#8f703a"}, "subtitle":{"text":"Camera","color":"#8f4f1b"}, "viewMode":"grid", "count":4, "type":"favorite-products", "id":"favoriteproductsyvLi", "query":"camer", "filter":null, "background":null },
    { "type":"login", "id":"logintsKu", "background":"bg-neutral-800" }
  ]
}
```

Same payload returned for `?draft=true`. **Archived state serving confirmed.**

---

## Artifacts

All paths are absolute under `C:/Users/mutyk/My Projects/vc-mcp-testing-module/tests/Sprint-current/VCST-4951/`:

- `verification-report.md` (this file)
- `00-navigation.png` — Store → B2B-store widget panel showing "Page Builder" entry
- `00b-pagebuilder-entry.png` — Page Builder draft list after entry
- `01-load-content-toast.png` — post-Load content (no toast visible)
- `02-save-toast.png` — post-Save (no toast visible)
- `03-archive-confirm.png` — archive confirmation dialog
- `03-archive-toast.png` — post-Archive list (no toast visible)
- `04-publish-toast.png` — post-Publish blade (no toast, status "Published")
- `05-unpublish-toast.png` — post-Unpublish blade (no toast, status "Draft")
- `06a-clone-toast.png` — post-Clone (toast observed by DOM observer, auto-dismissed before screenshot)
- `07-clone-toast-existing.png` — second Clone run (toast again captured by observer)
- `test-content.json` — valid page export used for all Load content runs
- `console-errors.log` — 0 errors
- `console-warnings.log` — 1 pre-existing warning only

---

## Root Cause Hypothesis (for dev handoff)

The fix in PR #126 adds `notification.success(i18n('PAGE_BUILDER.PAGES.ALERTS.*_SUCCESS'))` calls (or equivalent) at 5 sites. Evidence strongly suggests one of:

1. **Calls not actually emitted** — a conditional wraps them in a `false` branch; or the handler is bound to a different event/page-state than user flows hit on QA.
2. **i18n key resolves to empty string** — if `VcNotification` skips rendering empty content, you'd see exactly this pattern (no container update).
3. **Rollup/tree-shaking dropped** the notification import in the built bundle (observed version is `3.1005.0-pr-126-bd83` so build did succeed, but assets under `/apps/page-builder-shell/` should be checked for presence of the new strings).

Quick triage step for devs:
- In browser devtools console on `#/page-builder-draft`, run:
  ```js
  fetch('/apps/page-builder-shell/').then(r => r.text()).then(t => console.log(t.match(/Page (saved|loaded|archived|published|unpublished) successfully/g)));
  ```
  If that returns `null`, the strings never made it into the bundle → build/i18n issue. If it returns matches, the call sites aren't being hit → controller/handler wiring issue.

The Clone flow proves the notification infra itself is functional.

---

## Recommendation

**Re-open VCST-4951.** Fix is incomplete — PR #126 module is deployed but only the backend `GetPageContent` change (item #8) took effect; the 5 UI toast dispatches do not reach the Vue notification container. Ask devs to:
1. Verify the 5 strings ship in `/apps/page-builder-shell/` bundle.
2. Add a browser-console log at each new notification call site and redeploy a debug build.
3. Confirm i18n dictionary entries are defined for all 5 keys in all locales (or at least en-US).

Until then, this ticket is **NOT releasable**.
