# VCST-5670 — Testing Checklist

**Path:** fast · **Flow:** feature-test · **Type:** Task (P2/Medium) · **Layer:** `null` (`UNRESOLVED` — see below)
**Env:** vcmp-dev Vendor Portal — `@vc-shell/framework` **2.6.0-rc.0**, build `98032`, rebuilt 2026-09-02 11:23:24 GMT · Chrome · Light theme
**Verdict: FAIL → REOPEN** — every listed condition passes, but the ticket's unconditional AC ("never `<body>`") is violated 3/3 on an unlisted Maximize entry path.

## Deploy gate — PASSED

| Check | Result |
|---|---|
| Served framework | **2.6.0-rc.0** (version string in both served chunks) |
| App build | id `16355` → **`98032`**, rebuilt 2026-09-02 11:23:24 GMT |
| npm | `2.6.0-rc.0` under the **`rc`** dist-tag (`latest` is still 2.5.0), `gitHead` `cb6379d0f` |
| Ancestry | all five fix PRs (#343–#347) are **ancestors of the published release commit** |
| Proven-new markers | `aria-disabled` bundle 16→18 (source 0→3); `inertNavigation` bundle 5→7 (source 2→4) — deltas match |

It is a **prerelease**, not a stable release. `vc-button--disabled` was discarded as a marker (pre-existing in both).

## Conditions

| # | Condition | Verdict | Focus landed on | Reps |
|---|---|---|---|---|
| 1 | Sign-in redirect | **PASS** | `main` (authenticated shell workspace) | 3 (+1 deep-link → `region "Products"`) |
| 2 | Blade open (row click) | **PASS** | the clicked `row` (documented accepted path) | 3 |
| 3 | Maximize — header button | **PASS** | `button "Restore"` | 4 |
| 4 | Restore — header button | **PASS** | `button "Maximize"` | 3 |
| 5 | **Maximize/Restore via `Ctrl+\`, focus on expand control** | **PASS** both directions | maximize → `Restore`; restore → `Maximize` | 3 + 3 |
| 6 | Save as draft | **PASS** (see note) | `region "Product Level 4 x y z q"` | 2 |
| 7 | Target documented per transition | **PARTIAL** | 4 transitions documented; the shortcut path still is not, and the nav path below is new | — |
| 8 | Verified by live measurement, not only unit tests | **PASS** | this run | — |
| 9 | Maximize control Tab-reachable, Enter **and** Space operable | **PASS** | Enter → `Restore`; Space → `Maximize` | 1 each |
| — | Log Out (VCST-5813 / #343) | **PASS** | `main` of the unauthenticated layout | 3 |
| — | Self-disabling button keeps focus (VCST-5806 / #347) | **FAIL (partial)** | focus left the button → `main`; **never** `<body>` | 2 |

**Condition 5 — the reopening failure is genuinely fixed, 6/6.** `Ctrl+\` is the correct Windows chord; both entry points now share one handoff path.

**Condition 6 — passes for the reason the caveat predicted, not by design.** The blade region's ref changed on every save (`e10641 → e10809 → e11144`), so the blade **remounts** and `onMounted(focusIfLoose)` is what catches the loose focus. The save path itself still hands nothing off, and is untouched by these fixes — it would regress silently if the blade ever stopped remounting on save.

**Self-disabling button — measured on pagination, not Sign in.** The sign-in redirect completes before a probe can run. Pagination's First/Last page buttons use the **native** `disabled` attribute (correctly exposed as `[disabled]`), so the activated button loses focus and this ticket's repair parks it on `main`. The `<body>` AC holds; "keeps focus" does not. #347's `aria-disabled` approach is evidently not applied to these controls → **VCST-5861**.

## Uncovered conditions, stated explicitly

- **NEW IN-SCOPE FAILURE → `VCST-5859` (Medium, Sub-task).** `Ctrl+\` while focus is **in the sidebar** (Notifications button, nav Search, "Home") drops focus to `<body>`, **3/3**, and restoring does **not** recover it. Squarely inside "Maximize/Restore … never `<body>`". Likely an ordering bug in #344's `watch` guard: it sees "something holds focus" and skips the repair *before* the browser blurs the newly-inert node.
  - Measurement caveat: the **Tab-once discriminator is non-discriminating here** — the nav precedes `main` in DOM order, so a genuine continuation and a restart both land on the blade's first control. The evidence is the **absent `[active]` node**, the same signature VCST-5812 had.
- **Condition 17 on the framework's own Sign in button** — not measurable; the redirect completes before a probe runs. A wrong-password attempt would have held the page but risked the admin account, so it was declined.
- **No screen-reader (AT) pass** — `document.activeElement` being unset is structural, not a listening test.
- **No change-scoped regression** — no regression suite covers vc-shell / the Vendor Portal.
- **No App Insights correlation** — no component configured for vcmp-dev.
- **Layer is `UNRESOLVED`**, so no release-note fragment. All five sources of `1b` item 2b come up empty for vc-shell: it is absent from `fix-repos.json` routing, no suite covers it, the moved component (`@vc-shell/framework`) is not theme/module/platform, and both tickets carry no Components. The token set has no member for this product; defaulting to `storefront` is forbidden and `admin-spa` means the *Platform* Admin SPA.

## Findings held below the 5d severity floor (`Low`, not filed)

| Finding | Draft |
|---|---|
| App-switcher icons 404 (×3) | `reports/bugs/open/low/BUG-vc-shell-app-switcher-icon-404s.md` |

**Data touched:** product `PLV4` ("Product Level 4 x y z q", Draft/Inactive) — `Localized name en-US` set to `QA-TMP-5670` via *Save as draft*, then cleared and saved again (net zero); 3 further edits typed and **discarded**; delete dialog opened 6× and dismissed every time, **Confirm never pressed**. Verified clean in a fresh session afterwards: **466 products** (baseline 466), PLV4 still Draft/Inactive, localized name empty, no unsaved-changes alert.

**Evidence:** `reports/tickets/Sprint26-17/VCST-5670/screenshots/` · HAR `test-results/chrome/har/session.har`
