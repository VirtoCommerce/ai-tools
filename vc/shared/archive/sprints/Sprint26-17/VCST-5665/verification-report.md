# VCST-5665 — Fix Verification

**Ticket:** VCST-5665 · Bug · Medium · labels `framework` `security` `vc-shell`
`vc-shell: confirmation and error popups render the message as HTML, so interpolated entity names are treated as markup`
**Fix task:** VM-1746 (Done) · **Fix:** vc-shell PR [#299](https://github.com/VirtoCommerce/vc-shell/pull/299) (`2e928761f`), merged to `main` 2026-08-13
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

**`@vc-shell/framework`** (vc-shell — separate product, not the storefront). Affected 2.4.0, fixed **2.5.0**.
Verified against `main @ 324cd9b09` (= v2.5.0), the published npm package, and the deployed Vendor Portal on
vcmp-dev. No fix PR was linked on the ticket — located from `main`'s history (`Closes VCST-5665 (VM-1746)`).

## Summary

`showConfirmation` / `showError` / `showInfo` now route the message through a render function, so Vue escapes
it; HTML is opt-in per call via `{ html: true }`, and explicit slots are deliberately unchanged. Proven
RED→GREEN at unit level and present in both the published package and the deployed build. **The live axis
could not be exercised** — see Coverage limits; it is reported BLOCKED, not passed.

## RED → GREEN (unit)

`vitest run core/composables/usePopup shell/_internal/popup`, run from `framework/` (the CI cwd):

| Phase | Source | Result |
|---|---|---|
| **RED** | PR #299's hunks in `usePopup/index.ts` reverse-applied onto `main`; test files unchanged | **3 failed / 69 passed (72)** |
| **GREEN** | `main @ 324cd9b09` | **72 passed (72)** — 3 consecutive runs |

The three RED failures are `showConfirmation` / `showError` / `showInfo` "keeps the message off the v-html
path by default", each `AssertionError: expected 'string' not to be 'string'` — the message stays a string,
i.e. the `v-html` branch, exactly as the PR description predicted.

**How the RED was isolated (this matters).** A later commit — #306, `fix(a11y): reset the popup close
lifecycle on reopen` — also touches `usePopup/index.ts`. A blanket `git checkout 2e928761f^ -- <file>` would
have reverted that fix too and polluted the RED with unrelated failures. Instead only PR #299's own hunks
were reverse-applied (`git apply --reverse --3way`), leaving #306 intact; verified by asserting the fix
markers were gone (`PopupMessageOptions`/`toMessageSlot` = 0) while a pre-existing constant survived, and
that exactly one file was modified.

Evidence: `evidence/red-prefix.txt`, `evidence/green-fixed.txt`.

## Deploy gate (`evidence/deploy-gate.txt`)

| Check | Result |
|---|---|
| `2e928761f` ancestor of `v2.5.0`, not of `v2.4.0` | PASS |
| Published npm **type declarations** — `PopupMessageOptions` | **0 hits in 2.4.0 → 13 in 2.5.0**; `options?:` on all three helpers; reachable from the package root |
| Deployed Vendor Portal (vcmp-dev, built 2026-08-24) on framework ≥ 2.5.0 | PASS — proven transitively |

The fix's runtime markers are minifiable (a TS type, a module-local function), so the published `.d.ts` is
the reliable marker. The deployed version was proven via three markers that exist only in 2.5.0, found in
`vc-shell-vendors22260.js` (0.8 MB, the real implementation) and absent from `vc-shell-framework22260.js`
(0.1 MB, a re-export facade) — grepping the facade alone reads as "fix absent".

**Near-miss worth recording:** the first grep of `dist/*.d.ts` (top level only) returned the OLD signature
and no `PopupMessageOptions`, which reads as "the opt-in never shipped in the types". That hit was
`dist/test-mock-factories.d.ts` — an internal mock declaring its own local copy of `IUsePopup`. The real
declaration is one directory down. Acting on the shallow grep would have produced a false finding.

## Acceptance criteria (VM-1746)

| AC | Verdict | Evidence |
|---|---|---|
| By default, markup in a popup message is displayed literally | **PASS** | render function → Vue escapes; RED proves the tests detect its removal |
| Existing call sites that intentionally pass HTML keep working | **PASS** | `{ html: true }` passes the raw string (test at `usePopup.test.ts:124`); explicit slots untouched |
| Sanitization still applies on the HTML path | **PASS** | container still routes `typeof slot === 'string'` through `sanitizeHtml`, DOMPurify `FORBID_TAGS`/`FORBID_ATTR` intact |
| Docs state the default and how to interpolate safely | **PASS** *(with a defect — see Notes 1)* | `usePopup.docs.md`: `html` default `false`, rationale, worked example, explicit-slot carve-out |
| Unit test: `<h1>` **and `<a href>`** render as text by default | **PARTIAL** | `<h1>` pinned twice — helper tests assert the slot is not a string, and `vc-popup-container.test.ts:118-131` asserts the rendered text contains `Delete <h1>Big</h1>?` **and** `find("h1").exists() === false`. **No test anywhere asserts the `<a href>` case** the AC names |

AC5's anchor half rides the same generic escaping branch as `<h1>`, so independent regression risk is
negligible — but the AC named it explicitly, and the anchor is the more security-relevant of the two (a
working link in a dialog the user is meant to trust, versus a restyled heading).

## Notes

**1. The docs contradict their own rule.** `usePopup.docs.md` states *"Opt in only for markup you author
yourself, never for interpolated data"* — and the immediately following example is:

```ts
showError(t("TEAM.ERRORS.USER_EXIST", { email }), { html: true });
```

which interpolates a **user-entered email** into an HTML-opted message. That is precisely the defect this
ticket fixed, presented as the recommended pattern; a consumer copying it reintroduces the bug. P3,
docs-only, but it propagates by being copied.

**2. The fix's own known follow-up is untracked.** VM-1746's closing comment records that vendor-portal's
`showEmailExistsError` is the single caller in the codebase that intentionally passes markup
(`"An e-mail address <b>{email}</b> already registered in the system."`), that the email is user-entered so
the call site is itself an instance of this bug, and that it "needs a follow-up" because it lives under a
gitignored `/apps/` path. **No such ticket exists** (searched). The live agent confirmed the string and its
call path are present in the deployed bundle — exactly one markup-bearing interpolated message across all
79 chunks — so the condition is live and untracked.

**3. Shipped test-mock has drifted from the API.** `dist/test-mock-factories.d.ts` still declares
`showConfirmation(message)` etc. without `options`, by design a local copy ("Declared locally to avoid
importing from the composable file"). It is **not** in the package `exports` map, so consumers cannot import
it via a documented subpath and impact is internal — but an in-repo test typing a `{ html: true }` call
through that mock would fail. P3.

## Coverage limits — the live axis is BLOCKED, not passed

A live GREEN could not be obtained from this deployment, and is **not** being recorded as a pass.

- **No qualifying surface.** All 79 JS chunks the deployed Vendor Portal serves were downloaded and
  searched: every delete confirmation is either static text or interpolates only `{count}` (a number).
  Verified at the call sites too — every `showConfirmation(...)` passes a bare `t("…")` with no data
  argument. So no dialog in the app can be made to show markup from an entity name; creating an entity named
  `<h1>…</h1>` would have proven nothing, and none was created.
- **The one qualifying path was unreachable.** `showEmailExistsError` (Note 2) is gated behind
  `POST /api/vcmp/security/seller/users/validate` returning an already-registered email. Two candidate
  emails returned `200 []` (not registered), and email discovery through the UI failed — the People list
  returns a 500 and the Platform Admin SPA renders blank. Registering a user to collide with was declined:
  the Team module can neither list nor delete users on this env, so it would have left an undeletable
  entity behind.
- **Corroborating but non-discriminating:** a real `usePopup` confirmation *was* exercised live (the
  unsaved-changes guard). Its message node contains no child elements, consistent with the escaping path —
  but the message carries no markup, so it cannot distinguish escaped text from `v-html`.
  `screenshots/usePopup-confirmation-dialog-live.png`.

Nothing observed contradicts the fix. **To close the live axis, supply a known-registered vcmp-dev email
address** — Check 2 then completes in minutes.

## Incidental findings — different product, nothing filed

Two pre-existing **backend** defects in `vc-module-marketplace-vendor` (not vc-shell, unrelated to this
fix), which together block the Vendor Portal Team module for this seller:

1. **People list 500** — `POST /api/vcmp/security/seller/users/search` → `NullReferenceException` at
   `SellerUserCrudService.GetByIdsAsync` (`SellerUserCrudService.cs:59`). List renders "There are no people
   yet" behind a stack-trace banner. `screenshots/INCIDENTAL-people-list-backend-500.png`.
2. **Create user 500** — `POST /api/vcmp/security/seller/users/create` → `SqlException 547`, FK violation
   `FK_MemberRelation_Member_AncestorId` via `MemberService.SaveChangesAsync` (`MemberService.cs:183`) —
   suggests the seller's own `Member` ancestor row is missing.

Also pre-existing and unrelated: SignalR reconnect loop, `negotiation … Status code '401'`, ~every 5s.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123
regression suites cover the storefront only — none cover vc-shell or the Vendor Portal. Substituted: the
framework's own vitest suites, the published `.d.ts`, and deployed-bundle marker greps.

**Data changes:** none. No entity was created or renamed; both create attempts were rejected by the backend
(SQL rollback, no 2xx), draft blades were discarded through the UI, and a temporary network dump was removed.
