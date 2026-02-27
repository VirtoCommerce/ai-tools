# BUG: CatalogVideo Description Column Truncation (HTTP 500)

**Date:** 2026-02-27
**Severity:** High (P1)
**Component:** VirtoCommerce.CatalogModule / VideoEntity / YouTubeVideoProvider
**Environment:** QA (vcst-qa-platform_restored database)
**Related Ticket:** VCST-4445
**Related PR:** [VirtoCommerce/vc-module-catalog#863](https://github.com/VirtoCommerce/vc-module-catalog/pull/863)
**Product:** 1592321634
**Status:** Confirmed -- Root Cause Identified

---

## Summary

When adding a YouTube video to a product in Admin SPA, if the YouTube video has a description longer than 1024 characters, saving fails with a SQL Server error:

```
String or binary data would be truncated in table 'vcst-qa-platform_restored.dbo.CatalogVideo', column 'Description'
```

This results in an HTTP 500 response. The user sees a save failure with no actionable error message.

---

## Root Cause Analysis

### The Data Flow (No Validation at Any Layer)

```
YouTube API v3 (snippet.Description)    -- up to 5,000 characters
        |
        v
YouTubeVideoProvider.GetVideoAsync()    -- NO truncation, NO length check
    video.Description = snippet.Description;
        |
        v
VideoService.CreateVideo()              -- validates VideoCreateRequest only, NOT Description length
        |
        v
VideoEntity.FromModel()                 -- direct assignment, NO truncation
    Description = video.Description;
        |
        v
Entity Framework / SQL Server           -- FAILS: column is nvarchar(1024)
```

### Column Definition

The `CatalogVideo.Description` column was created in migration `20210930081954_AddVideoSupport.cs`:

```csharp
Description = table.Column<string>(maxLength: 1024, nullable: false)
```

This produces a SQL column of type `nvarchar(1024)`.

### Entity Model Annotation

In `VideoEntity.cs`:

```csharp
[Required, StringLength(1024)]
public string Description { get; set; }
```

### YouTube API Maximum

YouTube video descriptions can be up to **5,000 characters** (YouTube Data API v3 documentation). The YouTube API returns the full description text in `snippet.Description` without truncation.

### The Gap

| Layer | Max Length | Validation? |
|-------|-----------|-------------|
| YouTube API response | 5,000 chars | N/A |
| Video domain model (Core) | Unlimited (no annotation) | None |
| YouTubeVideoProvider | Unlimited | **None -- direct pass-through** |
| VideoService.CreateVideo() | N/A | Validates request, not description length |
| VideoEntity (Data) | 1,024 chars (StringLength) | **Annotation exists but not enforced before DB save** |
| Database column (CatalogVideo) | 1,024 chars (nvarchar) | **SQL Server rejects -- HTTP 500** |

The `[StringLength(1024)]` annotation on `VideoEntity.Description` is used by EF Core for schema generation but is NOT validated at runtime before `SaveChanges()`. When EF Core attempts the INSERT/UPDATE, SQL Server throws the truncation error.

---

## Is This a Pre-Existing Bug or Introduced by PR #863?

### Verdict: PRE-EXISTING BUG -- NOT introduced by PR #863

**Evidence:**

1. **PR #863 did NOT modify `VideoEntity.cs`** -- The entity model with `StringLength(1024)` is unchanged by this PR. The file is not in the list of changed files.

2. **PR #863 did NOT add any database migrations** -- No schema changes were made.

3. **PR #863 did NOT add description validation** -- The new `YouTubeVideoProvider` assigns `video.Description = snippet.Description;` directly, which is the same behavior as the original `VideoService` code before the refactoring.

4. **The column has been `nvarchar(1024)` since September 2021** -- Migration `20210930081954_AddVideoSupport.cs` created the column with `maxLength: 1024`. This has never been changed.

5. **The original VideoService (before PR #863) also had no truncation** -- The refactoring simply moved the same code from `VideoService` into `YouTubeVideoProvider`. The lack of description length handling existed in the original implementation.

**However**, PR #863 is the right place to fix this bug because:
- The new `YouTubeVideoProvider` is the component that receives YouTube data
- Adding truncation/validation in the provider is the clean, isolated fix
- The PR is still open, making it an opportune time to include the fix

---

## Reproduction Conditions

### Videos That Trigger This Bug

Any YouTube video with a description longer than 1024 characters will trigger this error. Examples include:
- Tutorial/educational videos with detailed chapter timestamps
- Music videos with full lyrics in the description
- Conference talks with speaker bios and links
- Videos with extensive link collections or affiliate disclosures

### Videos That Do NOT Trigger This Bug

- Videos with short descriptions (under 1024 characters)
- Videos fetched via the oEmbed fallback (when no API key is configured) -- the oEmbed endpoint sets `Description = Title`, which is always short
- Videos where description is manually edited in Admin SPA to be under 1024 characters before saving

### Steps to Reproduce

1. Navigate to Admin SPA: `${BACK_URL}`
2. Open a product (e.g., product ID 1592321634)
3. Go to the Videos widget
4. Add a YouTube video URL for a video with a description > 1024 characters
5. The system auto-fetches metadata via YouTube API v3 (requires API key configured)
6. Click Save
7. **Result:** HTTP 500 error -- "String or binary data would be truncated"

---

## Recommended Fix

### Option A: Truncate Description in YouTubeVideoProvider (Quick Fix)

In `YouTubeVideoProvider.cs`, truncate the description before returning:

```csharp
// After: video.Description = snippet.Description;
// Change to:
private const int MaxDescriptionLength = 1024;

video.Description = snippet.Description?.Length > MaxDescriptionLength
    ? snippet.Description[..MaxDescriptionLength]
    : snippet.Description;
```

**Pros:** Minimal change, fixes the immediate crash, contained within PR #863 scope.
**Cons:** Silently truncates data. User may not realize description was shortened.

### Option B: Increase Database Column Size (Proper Fix)

1. Change `VideoEntity.cs`:
```csharp
[Required, StringLength(5000)]
public string Description { get; set; }
```

2. Add a new EF Core migration to alter the column:
```csharp
migrationBuilder.AlterColumn<string>(
    name: "Description",
    table: "CatalogVideo",
    maxLength: 5000,
    nullable: false);
```

**Pros:** Preserves full YouTube descriptions. Aligns DB with source data limits.
**Cons:** Requires a database migration. Must be applied to all environments.

### Option C: Both (Recommended)

1. Increase the column to `nvarchar(5000)` to align with YouTube's limit (Option B)
2. Add defensive truncation in `YouTubeVideoProvider` as a safety net (Option A)
3. Add a `FluentValidation` rule in `VideoCreateRequestValidator` or a new `VideoValidator` to validate Description length and return a user-friendly 400 error instead of a 500

This ensures:
- The database can store full YouTube descriptions
- Future providers (Vimeo, etc.) also have adequate space
- If any source returns data exceeding even 5000 chars, a clean validation error occurs instead of a 500

---

## Impact Assessment

| Factor | Assessment |
|--------|------------|
| **Frequency** | Medium -- affects any YouTube video with description > 1024 chars |
| **User Impact** | High -- HTTP 500 is an unrecoverable error with no user guidance |
| **Data Loss** | None -- the save fails, so no corrupt data is created |
| **Workaround** | User can manually shorten the description in Admin SPA before saving |
| **Scope** | Limited to CatalogVideo.Description column only |
| **Security** | No security implications |

---

## Does This Block PR #863 Merge?

### Assessment: Does NOT strictly block, but SHOULD be fixed in this PR

**Arguments for fixing before merge:**
- PR #863 introduces `YouTubeVideoProvider` as the new component responsible for fetching YouTube metadata. This is the natural place to add description length handling.
- The bug manifests through the exact code path this PR creates.
- Fixing it now avoids shipping a known defect in new code.
- The fix is small (a few lines of truncation or validation).

**Arguments that it does not block:**
- The bug is pre-existing -- the same crash occurred before this PR.
- The PR's purpose is architectural refactoring, not feature changes.
- A separate follow-up ticket could address the column size increase.

**Recommendation:** Add Option A (truncation in `YouTubeVideoProvider`) to PR #863 as a minimal fix. File a separate ticket for Option B (column size increase via migration) to be addressed in a subsequent PR.

---

## Files Investigated

| File | Branch | Finding |
|------|--------|---------|
| `src/VirtoCommerce.CatalogModule.Data.YouTube/YouTubeVideoProvider.cs` | feat/VCST-4445 | No truncation on `snippet.Description` |
| `src/VirtoCommerce.CatalogModule.Core/Services/IVideoProvider.cs` | feat/VCST-4445 | Interface defines `GetVideoAsync` contract |
| `src/VirtoCommerce.CatalogModule.Data/Services/VideoService.cs` | feat/VCST-4445 | Delegates to `IVideoProvider`, no validation on Description |
| `src/VirtoCommerce.CatalogModule.Core/Model/Video.cs` | dev | No `[MaxLength]` annotation on Description |
| `src/VirtoCommerce.CatalogModule.Data/Model/VideoEntity.cs` | dev | `[StringLength(1024)]` on Description |
| `src/VirtoCommerce.CatalogModule.Data/Repositories/CatalogDbContext.cs` | dev | No Fluent API `HasMaxLength` on Description |
| `src/VirtoCommerce.CatalogModule.Data.SqlServer/Migrations/20210930081954_AddVideoSupport.cs` | dev | `maxLength: 1024` on Description column |

---

## References

- [YouTube Data API v3 - Videos resource](https://developers.google.com/youtube/v3/docs/videos) -- Description field up to 5,000 characters
- [YouTube Character Limits Guide](https://influencermarketinghub.com/youtube-character-limits/) -- Confirms 5,000 char limit
- [PR #863: Isolates YouTube integration](https://github.com/VirtoCommerce/vc-module-catalog/pull/863)
- Migration: `20210930081954_AddVideoSupport.cs` -- original column definition since September 2021
