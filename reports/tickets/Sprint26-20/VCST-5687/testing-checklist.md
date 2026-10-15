# VCST-5687 — Testing checklist PASS — 1 save, 9 blocks hidden:true; dash-empty-1920.png PASS PASS — stat-only / widget-only / rail-only PASS — 0 saves, focus → surface PASS — 0 saves PASS PASS — 1 save, registry order, aria-live; dash-restored.png PASS — orders 3→5, top_sellers 10→5 BLOCKED — route-intercept denied by enforce-real-user hook (test infra) PASS (partial) — 1 mutation on double-click; loading state too fast to observe PASS — no widget/stat queries PASS — cp-empty.png PASS — cp-empty-second-customer.png PASS (de restore) PASS — both directions PASS WITH NOTE — hint chip absent; "this page" vs "this dashboard" PASS — no overflow at 375; dash-empty-375.png PASS — de/ja switch, zh/ru cold PASS FAIL (pre-existing, theme-wide) — primary button contrast ~2:1 PASS — dash-empty-dark.png PASS — 0 console errors, no errors[] ||||||||||||||||||||||(FAST)

**Ticket:** Improve empty-state design for Dashboard and Customer pages when all blocks are hidden (Story, Medium) · Epic VCST-5142 Sales Rep Hub
**Env:** vcptcore-qa · theme `vc-theme-b2b-vue-2.59.0-pr-2539-24ab` (vc-frontend PR #2539 @ `24ab03c4`; head `0740423f` differs by a dev merge only)
**Design oracle:** VCDZ-895 / Jira attachment `Empty dashboard.png` (Figma node 507-2) — `{SPEC}`
**Actor:** `@td(SR_REP_PRIMARY.email)` on B2B-store, password key `SR_REP_PASSWORD`
**Oracles:** BL-SR-015, 016, 023, 024, 026, 028, 030, 031 · ECL ch.7 (Frontend & UI)
**Route:** feature-test · FAST (Story narrow on all six §5b tokens; surface purpose declared in `.claude/knowledge/domain/sales-rep.md` §1)

**Run verdict: PASS WITH NOTES** — round 1: 20 PASS · 1 BLOCKED (A9, test infra) · 1 FAIL (C5, pre-existing theme-wide). Round 2 (operator-requested): localization 12/12 cultures PASS; resolutions PASS at 360–2560, **FAIL at 320 (Medium, this PR)**. Executed 2026-10-07 14:06–14:43Z by qa-frontend-expert on playwright-chrome; theme 2.59.0-pr-2539-24ab-24ab03c4.

## A. Dashboard (`/company/dashboard`, scope `dashboard`)

| # | Condition | Expected | Oracle | Verdict |
|---|---|---|---|---|
| A1 | Hide every stat + every widget in edit mode, Save | Exactly one `saveSalesRepLayout`; edit mode ends; regions + foot "Edit layout" toggle are gone; the empty state renders: illustration, H2 "All blocks are hidden", text with bold **Hidden** / **Edit layout**, primary "Restore default layout" + outline "Edit layout" | SPEC, BL-SR-024 | PASS — 1 save, 9 blocks hidden:true; dash-empty-1920.png |
| A2 | Reload / fresh session after A1 | Empty state persists (not defaults, not blank) | BL-SR-024 | PASS |
| A3 | Boundary: exactly one block visible (a stat only; then a widget only; then the rail `tasks` only) | No empty state; normal surface + foot "Edit layout" toggle | SPEC (`allHidden` = every region empty) | PASS — stat-only / widget-only / rail-only |
| A4 | Empty state → "Edit layout" | Edit mode opens with every block in Hidden stats / hidden tray; **zero** save calls; focus moves to surface start | SPEC (PR) | PASS — 0 saves, focus → surface; dash-empty-edit-mode.png |
| A5 | A4 → Cancel | Empty state returns; zero save calls | BL-SR-024 | PASS — 0 saves |
| A6 | A4 → restore one widget from tray → Save | One save; empty state gone; that widget renders | BL-SR-028 | PASS |
| A7 | Empty state → "Restore default layout" | One save carrying registry defaults (all `hidden:false`, standard order); **no** edit mode; aria-live "Default layout restored."; reload keeps it | SPEC, BL-SR-016 | PASS — 1 save, registry order, aria-live; dash-restored.png |
| A8 | Restore resets block **settings** too: set a non-default Max rows on a widget, hide all, Save, Restore | Max rows back to its default | SPEC (PR) | PASS — orders 3→5, top_sellers 10→5 |
| A9 | Restore when the mutation fails (route intercept / abort) | Page lands in edit mode on defaults + the usual save-failed alert; Save in the edit bar retries and succeeds | SPEC (PR) | BLOCKED — route-intercept denied by enforce-real-user hook (test infra) |
| A10 | Double/rapid click on Restore | Exactly one mutation; button shows loading; "Edit layout" disabled while in flight | BL-SR-030 | PASS (partial) — 1 mutation on double-click; loading state too fast to observe |
| A11 | With all hidden, no widget data query fires on reload | Only layout (+ allowed page-level) operations; no widget queries | BL-SR-031 | PASS — no widget/stat queries |

## B. Customer profile (`/company/my-customers/{orgId}`, scope `customerProfile`)

| # | Condition | Expected | Oracle | Verdict |
|---|---|---|---|---|
| B1 | Hide all stats + widgets (incl. rail `actions`, `info`), Save | Empty state renders as A1 (copy says "this page") | SPEC | PASS — cp-empty.png |
| B2 | Open a different served customer | Same empty state (one document per rep) | BL-SR-023 | PASS — cp-empty-second-customer.png |
| B3 | Edit from empty → Cancel; Restore default layout | As A4/A5/A7 for this scope | SPEC | PASS (incl. de restore) |
| B4 | Scope isolation: Dashboard all-hidden while customer profile has blocks (and vice versa) | Only the all-hidden surface shows the empty state | BL-SR-015 | PASS — both directions |

## C. Cross-cutting

| # | Condition | Expected | Oracle | Verdict |
|---|---|---|---|---|
| C1 | Visual vs design attachment | Title, text, two buttons + icons, illustration match; note anything missing (e.g. the "Nothing is lost — …" hint chip) — greeting line + Ask AI are declared out of scope | SPEC | PASS WITH NOTE — hint chip absent; "this page" vs "this dashboard" |
| C2 | 375 px viewport | Buttons stack full width, no horizontal overflow, text wraps | ECL ch.7 | PASS — no overflow; dash-empty-375.png |
| C3 | Language switch (each locale the store offers, at least one non-EN) — cold load AND in-session switch | All 4 new strings translated; no raw `sales_rep.hub.layout.empty.*` keys | SPEC (13 locales in PR) | PASS — de/ja switch, zh/ru cold; dash-empty-de/ja.png |
| C4 | Keyboard + focus | Both buttons Tab-reachable; after Save-with-all-hidden focus lands on the empty-state "Edit layout" (not `<body>`); after Restore focus on surface start | SPEC (PR) | PASS |
| C5 | a11y quick pass (axe on empty state) | No serious/critical; illustration `aria-hidden`; heading is H2 | BL-A11Y | FAIL (pre-existing, theme-wide) — primary button contrast ~2:1 |
| C6 | Dark mode (if the theme exposes it) | Illustration follows theme colours | SPEC (PR) | PASS — dash-empty-dark.png |
| C7 | Console / network during all flows | No new errors; no GraphQL `errors[]` in 200 | always-on | PASS — 0 console errors, no errors[] |

## D. Round 2 — localization × resolution (operator request, 14:22–14:43Z)

| # | Condition | Expected | Verdict |
|---|---|---|---|
| D1 | All 13 module locale files (static, `24ab03c4`) | 6 keys each, `{hidden}`/`{edit}` placeholders present | PASS — 13/13 complete |
| D2 | Every culture in the switcher (zh, en-US, ja, en-GB, it, pt, pl, nl-BL, nl-NL, es, fr, de, ru) at 1920 | Strings match locale files; no raw keys; no mixed language | PASS; nl ×2 → consistent English fallback (no nl.json) |
| D3 | Bold {hidden} word ↔ edit-mode "Hidden stats/widgets" zone heading; {edit} ↔ button | Recognisable reference | PASS in all locales |
| D4 | Cold load by URL prefix + in-session switch (de, ru, ja, nl) | Translated, no raw-key flash | PASS |
| D5 | Customer profile in ru, de | Translated | PASS |
| D6 | Widths 320…2560 × en/ru/fr/de (full list), zh/ja/es/pt (320/375/768/1920), CP ru (320/768/1280/1920) | No h-scroll; block inside column; labels not truncated | **FAIL at 320** (scrollWidth 308 vs 305, block 27px outside column, all locales, both surfaces); PASS 360–2560 |
| D7 | Button stack breakpoint | Stack < 640, row ≥ 640 | PASS — switch at 640; ru/fr wrap to 2 rows in row mode |
| D8 | 2560 | Centred, max width | PASS — 576px centred |

## Data & cleanup
- `data_surface: false` — the rep's own layout docs are the only state; they are created in-case by the flows above.
- Pre-run layout snapshot taken 2026-10-07T14:05Z via `salesRepLayout` (dashboard: `active_carts` hidden; customerProfile: all visible). Cleanup restores both documents verbatim via `saveSalesRepLayout`.

## Not covered
- Layout **load failure** with all hidden (`canEdit=false` → disabled buttons) — not reachable without a backend fault; unit-tested in PR only.

## Findings (all Low — not filed, below severity floor)
1. Design hint chip "Nothing is lost — Restore default layout re-adds all blocks…" not rendered (no i18n key) — design-vs-build gap for PO to confirm. IN-SCOPE.
2. Primary button colour contrast ~2:1 (WCAG 1.4.3) — theme-wide token. PRE-EXISTING.
3. Edit-mode aria-live text persists after Save/Cancel until reload. PRE-EXISTING (likely).
4. Drop onto empty part of a non-empty Hidden stats zone does nothing (drop on a card works). PRE-EXISTING.
5. SalesRepTasks query fires twice when the Tasks widget mounts. PRE-EXISTING.

Round-2 findings:
6. **Medium (IN-SCOPE, this PR):** empty state overflows at 320px → h-scroll — filed as **VCST-6205**.
7. Low (IN-SCOPE): long ru/fr/ja Restore labels wrap inside buttons with ~2px vertical padding; ru 3 lines (63px) beside a 43px sibling below 414px.
8. Low (IN-SCOPE copy): ja body "…レイアウトを編集を開いて…" double を; ja title orphans "です" at 320–375.
9. Low (PRE-EXISTING): buttons 43.2px tall (<44px target); ru sidebar breaks words mid-word; duplicate "English"/"Nederlands" labels in the language switcher.

Cleanup: both layout documents restored verbatim from the pre-run snapshot after each round (14:20:56Z, 14:44:38Z; echo identical).
