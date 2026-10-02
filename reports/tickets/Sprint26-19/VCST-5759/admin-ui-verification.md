# VCST-5759 — Admin SPA (VC-Shell) UI verification

- **Env:** https://vcptcore-qa.govirto.com (admin / Administrator)
- **Module:** VirtoCommerce.SalesRep `3.1011.0-pr-17-47fb` · `@vc-shell/framework v2.6.0` (build stamp `2026-09-22T14:58:22.491Z`, `1919c06af`)
- **Surface:** `/apps/vc-sales-rep/#/sales-reps/sales-rep-details`
- **Browser:** `playwright-edge` · **Date:** 2026-09-28
- **Verdict:** **PASS (7/7)** — no defects found in the UI half of the fix.

## Access note (not a defect in scope)
The classic AngularJS manager (`/#!/`) is **unreachable** for `admin` on this stand: login succeeds but
immediately redirects to `#!/changepassword` — *"Your password has expired. You must change the password to
continue using the manager"*; every other `#!/` route bounces back. I did **not** change the shared password.
The VC-Shell module app at `/apps/vc-sales-rep/` is **not** gated by that redirect and loaded normally as
`admin / Administrator`, so the whole verification ran there.

## Results

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| U1 | Required markers on New blade | **PASS** | `First name *` and `Last name *` render a red asterisk; `Middle name` has none. `evidence/U1-new-blade-required-markers.png` |
| U2 | Save blocked with empty names | **PASS** | Email `agent-test-sr5759-u2@example.com` + Store `B2B-store` + Role `AGENT-TEST-salesrep-role-2` filled, both names empty → `button "Save" [disabled]`. `evidence/U2-save-disabled-empty-names.png` |
| U3 | Touch-then-clear → inline error | **PASS** | Field border turns red, label turns red, message **"The firstName field is required"**. `evidence/U3-firstname-inline-error.png` |
| U4 | Both names filled → Save enabled | **PASS** | `Green` / `Verified` → `button "Save"` (no `disabled`). Nothing was saved; **no cleanup owed**. `evidence/U4-save-enabled-both-names.png` |
| U5 | Existing rep, clear last name | **PASS** | Rep `agent-test-sr5759-ok-1790578955@example.com` ("Green Verified"), id `a42a16b5-fa0a-4fe0-9bca-b6b668cd229b`. Cleared Last name → `Save [disabled]` + **"The lastName field is required"**. Restored via **Reset**; blade re-read `Green` / `Verified`, no unsaved-changes banner, **never saved**. `evidence/U5-existing-rep-lastname-cleared.png` |
| U6 | `max-length` → `maxlength` rename still caps | **PASS** | **First name: typed 220 chars sequentially → field accepted exactly 128.** **Salutation: typed 300 chars sequentially → accepted exactly 256.** Both measured from the accessibility-tree value of the input, character-counted. `evidence/U6a-firstname-128-cap.png`, `evidence/U6b-salutation-256-cap.png` |
| U7 | No new console / network errors | **PASS** | 0 console errors on the blade. Only a framework banner (`@vc-shell/framework v2.6.0`), SignalR info lines, and a Chromium `autocomplete` DOM hint. All XHRs 200/204 (`/api/sales-rep/search`, `/roles`, `/dictionaries`, `/api/sales-rep/{id}`, `/api/stores/search`). |

### U6 detail — the regression that mattered
The concern was that `maxLength` → `maxlength` could fall through as a raw HTML attribute rather than a
component prop. Measured with real keystrokes (`pressSequentially`, not a programmatic `fill`, which bypasses
native `maxlength`):

- First name — input `0123456789…` × 22 (**220 chars**) → value length **128**, ends `…0123456789012345678`.
- Salutation — input `0123456789…` × 30 (**300 chars**) → value length **256**.

Both caps are live and match the values in the diff (128 / 256). No unlimited-entry regression.

## Incidental observation (not filed)
The validation copy uses the **raw camelCase model key**, not the visible label: *"The **firstName** field is
required"* / *"The **lastName** field is required"*, next to labels reading "First name" / "Last name".
Cosmetic; does not affect the fix.

## Knowledge banked
- `KB-C60BA776` — Sales Rep details blade: required first/last name + the 128 / 256 caps.
- `KB-686E788D` — vcptcore-qa admin password expired: platform SPA locked, VC-Shell apps not.

(Both queued locally; they ship on the next `kb push` sweep.)

## Teardown
No entity created, modified or deleted. The New-rep blade was discarded via the unsaved-changes confirmation;
"Green Verified" was restored with **Reset** and never saved.
