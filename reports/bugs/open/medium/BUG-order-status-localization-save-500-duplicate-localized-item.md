# BUG — Order status localization cannot be saved: 500 "An item with the same key has already been added. Key: en-US"

**Severity:** Medium · **Priority:** Medium · **Type:** Bug · **Layer:** Platform REST + data
**Env:** `vcptcore` — https://vcptcore-qa-storefront.govirto.com / https://vcptcore-qa.govirto.com @ Platform 3.1072.0, Orders 3.1016.0 (ENV_RISK=test)
**Found by:** agent (`found-by-agent`, `found-in-testing`) — while applying order-status translations, 2026-10-02
**Evidence package:** `reports/tickets/Sprint26-19/ORDER-STATUS-L10N-500/evidence-2026-10-02-1212/` (gate `bundle-evidence --check` = PASS)
**kb:** `KB-74D9B9B0` (captured) · **Jira:** [VCST-6148](https://virtocommerce.atlassian.net/browse/VCST-6148) (comment 111115 carries the inline screenshot)

## Summary
On vcptcore, saving any change to the **Customer order statuses** dictionary localization (Admin › Settings › Orders › General ›
Customer order statuses › *Edit dictionary value* › Save) fails with **500**. The same happens when posting the **unchanged** current set
to `POST /api/platform/localizable-settings/Order.Status/dictionary-items`. Nothing is written, so the order statuses
cannot be localized on this environment at all, and nothing in the Admin UI shows why.

## Steps to reproduce
1. Sign in to the vcptcore Admin as a user with `platform:setting:update` (here: `admin`).
2. Settings › Orders › General › **Customer order statuses** (pencil) → click **Payment required**.
3. Enter `de-DE` = `Zahlung erforderlich` → **Save**.

**Expected:** 204; the translation is saved and returned by `GET /api/platform/localizable-settings`.
**Actual:** red banner **"500: Internal server error"**; response body
`{"message":"An item with the same key has already been added. Key: en-US","stackTrace":null}`; the translation is not saved.

![Admin save → 500](../../../tickets/Sprint26-19/ORDER-STATUS-L10N-500/evidence-2026-10-02-1212/screenshots/admin-order-status-save-500.png)

API-only repro (no UI): GET `/api/platform/localizable-settings`, take the `Order.Status` items **verbatim**, POST them to
`/api/platform/localizable-settings/Order.Status/dictionary-items` → **500**, same message.

| Attempt | Result |
|---|---|
| vcptcore — REST, unchanged set ×3 (12:13:34–35Z) | 500 ×3 |
| vcptcore — REST, merged 6×12 translations | 500 |
| vcptcore — Admin UI save (12:23:14Z) | 500 |
| vcptcore — REST, unchanged `Shipment.Status` (control) | **204** |
| vcst (Platform 3.1075.0) — REST, unchanged `Order.Status` | **204** |
| virtostart (Platform 3.1074.0) — REST, unchanged `Order.Status` | **204** |

## Root cause (confidence MEDIUM)
vc-platform `LocalizableSettingService` reads and writes the `PlatformLocalizedItem` rows with **different case rules**:

- **Write path** — `src/VirtoCommerce.Platform.Data/Settings/LocalizableSettingService.cs:146-150` (tag `3.1072.0`):
  stored rows are grouped by `Alias` **case-insensitively**, then `g.ToDictionary(x => x.LanguageCode)` runs per group. Two stored
  `en-US` rows whose aliases differ only in case (e.g. `new` / `New`) land in one group → `ArgumentException` → 500. It runs after the
  alias list is re-saved and before any translation is deleted or saved, so a failed save changes nothing (verified by re-reading).
- **Read path** — same file `:261` (`GetItems`): rows are grouped **case-sensitively** and matched to allowed values exactly, so the
  offending row is never returned by `GET /api/platform/localizable-settings` or shown in the Admin editor. No REST route lists raw rows.
  The dictionary is therefore permanently un-editable from the product.
- **Schema** — `src/VirtoCommerce.Platform.Data/Repositories/PlatformDbContext.cs:53-57`: the only index is
  `IX_PlatformLocalizedItem_Name_Alias`, **non-unique, without `LanguageCode`**. Nothing prevents the duplicate.

The posted payload is ruled out: the reproducing payload is the GET output posted back verbatim, with one `en-US` per alias.

**The unproven part:** which exact rows are duplicated, and when they were written. `PlatformLocalizedItem` is auditable, so `CreatedDate`/`CreatedBy` will
answer both:
```sql
SELECT Id, Name, Alias, LanguageCode, Value, CreatedDate, CreatedBy
FROM PlatformLocalizedItem WHERE Name = N'Order.Status' ORDER BY Alias, LanguageCode, CreatedDate;
```

## Alternatives ruled out
| Hypothesis | Ruled out by |
|---|---|
| By design / config | `Order.Status` is `isLocalizable=true`; identical save returns 204 on vcst + virtostart |
| Bad client payload | Unchanged GET output reproduces; the Admin UI posts the same shape (console `postedItems`) |
| Version skew | `compare 3.1072.0...3.1075.0` = 8 commits, none under `Settings/` or `Localizations/`; Orders 3.1016.0 on both vcptcore (fails) and vcst (works) |
| Another module writing the table | Only vc-platform uses `ILocalizedItemService` (org-wide code search); vcptcore-only modules (`AI` 3.1001.0 manifest aggregator, PR builds of BackgroundJobs/FileExperienceApi/GoogleEcommerceAnalytics/PageBuilder) do not |
| Flaky | 5/5 on vcptcore, two payload shapes, two clients |
| Recent regression | Grouping block unchanged since the 2023 localization feature (pre-VCST-786); last file change `d2bb428d3` is inside 3.1072.0 |

## Server-side
App Insights `vcptcore-qa` (appId matches `request-context`), operation **`3b78ff3c9a089e40a9094332b8102e20`**:
`POST LocalizableSettings/SaveDictionaryItems [name]` → 500, user `admin`, SQL reads of `PlatformSetting`/`PlatformSettingValue` for
`Order.Status`. **No exception item is tracked**: the error middleware returns the message without logging it. That is a secondary
observability gap.

## Fix routing
- **Env unblock (vcptcore data):** a DBA runs the query above and deletes the stray case-variant row(s). Then re-apply the prepared
  6 statuses × 12 languages and verify.
- **Product hardening:** `repoKind: platform` · repo **`vc-platform`** · `LocalizableSettingService.cs:146-150` (tolerate stored duplicates,
  e.g. keep the first row per language and delete the rest, instead of throwing) + `:261` (align alias case handling between read and
  write) + `PlatformDbContext.cs:53-57` (consider a unique `(Name, Alias, LanguageCode)` index, which needs a dedupe migration). Fix-forward.
- Not tagged `vc-fix`/`qa-autofix`: the trigger is environment data (a `/qa-fix` Gate-0 bail), and the fix shape is a design choice.

## Workaround
None in the product. Only a DB cleanup of the stray row.
