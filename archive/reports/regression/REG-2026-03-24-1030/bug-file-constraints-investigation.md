# BUG-3 Investigation: File Configuration Section Constraints Not Admin-Configurable

**Investigator:** qa-backend-expert
**Date:** 2026-03-24
**Environment:** QA -- `https://vcst-qa.govirto.com`
**Status:** CLOSED -- BY-DESIGN

---

## 1. Summary

The BA analysis reported that file upload constraints (accepted types, max file size, max files) are identical across all File-type configuration sections and cannot be configured per-section in the admin UI. Investigation confirms this is **by-design**: the constraints are configured at the **platform deployment level** via `appsettings.json` and served to the frontend via a GraphQL API query. They are intentionally scoped per upload context (not per product/section), and the admin UI correctly does not expose them because they are infrastructure-level settings, not catalog-level settings.

---

## 2. Evidence Chain

### 2.1 Frontend Architecture (VirtoCommerce/vc-frontend)

**Component hierarchy for file upload in configurable products:**

```
product-configuration.vue
  --> option-file.vue
    --> VcFileUploader (ui-kit)
      --> VcFilePicker (ui-kit)
```

**`option-file.vue`** (`client-app/shared/catalog/components/configuration/option-file.vue`):
- Uses the `useFiles("product-configuration")` composable
- Calls `fetchFileOptions()` on component mount
- Binds the returned `fileOptions` (maxFileSize, allowedExtensions) to the `VcFileUploader` component via `v-bind`

**`useFiles.ts`** (`client-app/shared/files/composables/useFiles.ts`):
- Defines frontend fallback defaults:
  - `DEFAULT_FILE_MAX_COUNT = 5` (from `client-app/shared/files/constants.ts`)
  - `DEFAULT_FILE_MAX_SIZE = 1 MB` (1 megabyte, via `getBytes()`)
- `fetchOptions()` calls `getFileUploadOptions(scope)` -- a **GraphQL query** to the backend
- Merges backend response with defaults: `{ ...defaultOptions, ...result }`
- The backend response **overrides** the frontend defaults for `maxFileSize` and `allowedExtensions`

**GraphQL query** (`client-app/core/api/graphql/files/queries/getFileUploadOptions/getFileUploadOptions.graphql`):
```graphql
query GetFileUploadOptions($scope: String) {
  fileUploadOptions(scope: $scope) {
    ...fileUploadOptions
  }
}
```

**Fragment** (`client-app/core/api/graphql/files/fragments/fileUploadOptions.graphql`):
```graphql
fragment fileUploadOptions on FileUploadScopeOptionsType {
  maxFileSize
  allowedExtensions
}
```

**Key observation:** `maxFileCount` is NOT returned by the GraphQL API -- it comes exclusively from the frontend constant `DEFAULT_FILE_MAX_COUNT = 5`.

### 2.2 Backend Architecture (VirtoCommerce/vc-module-file-experience-api)

**Configuration model** (`FileUploadOptions.cs`):
```csharp
public class FileUploadOptions
{
    public string RootPath { get; set; } = "upload";
    public IList<FileUploadScopeOptions> Scopes { get; set; } = new List<FileUploadScopeOptions>();
}
```

**Scope model** (`FileUploadScopeOptions.cs`):
```csharp
public class FileUploadScopeOptions
{
    public string Scope { get; set; }           // e.g., "product-configuration"
    public long MaxFileSize { get; set; }        // in bytes
    public IList<string> AllowedExtensions { get; set; } = new List<string>();
    public bool AllowAnonymousUpload { get; set; }
}
```

**Configuration source:** `appsettings.json` on the platform server, under the `FileUpload` section:
```json
{
  "FileUpload": {
    "RootPath": "attachments",
    "Scopes": [
      {
        "Scope": "product-configuration",
        "MaxFileSize": 10000000,
        "AllowedExtensions": [".doc", ".rtf", ".docx", ".txt", ".pdf", ".xls", ".xlsx", ".jpg", ".png", ".odt"]
      }
    ]
  }
}
```

This is the standard .NET Options pattern (`IOptions<FileUploadOptions>`), bound from configuration at startup. It is NOT stored in the database and NOT exposed in the admin UI settings.

### 2.3 Live API Verification

**GraphQL query executed against QA environment:**
```
POST https://vcst-qa.govirto.com/graphql
{ fileUploadOptions(scope: "product-configuration") { scope maxFileSize allowedExtensions } }
```

**Response:**
```json
{
  "data": {
    "fileUploadOptions": {
      "scope": "product-configuration",
      "maxFileSize": 10000000,
      "allowedExtensions": [".doc", ".rtf", ".docx", ".txt", ".pdf", ".xls", ".xlsx", ".jpg", ".png", ".odt"]
    }
  }
}
```

**Actual values in production:**
| Parameter | Value | Source |
|-----------|-------|--------|
| Allowed extensions | `.doc, .rtf, .docx, .txt, .pdf, .xls, .xlsx, .jpg, .png, .odt` | Backend `appsettings.json` via GraphQL |
| Max file size | 10,000,000 bytes (~9.54 MB) | Backend `appsettings.json` via GraphQL |
| Max file count | 5 | Frontend constant (`DEFAULT_FILE_MAX_COUNT`) |

**Note:** The BA report stated 9.5 MB -- the actual value is 10,000,000 bytes (approximately 9.54 MiB or exactly 10 MB in SI units).

### 2.4 Admin Settings Check

The admin Settings page does NOT contain any configurable products file upload settings. This is expected because:
- The `vc-module-file-experience-api` module uses the .NET Options pattern (bound from `appsettings.json`), not the VC module settings system (`ModuleConstants.Settings`)
- This is by-design: file upload constraints are infrastructure/deployment concerns, not runtime admin settings

---

## 3. Classification

| Dimension | Assessment |
|-----------|-----------|
| **Classification** | **By-Design** -- not a bug |
| **Architecture** | Intentional scope-based configuration via `appsettings.json`, exposed to frontend via GraphQL `fileUploadOptions` query |
| **Per-section config** | Not supported by design -- constraints apply to the entire `product-configuration` scope, not individual sections |
| **Admin UI gap** | No -- this is a deployment-level setting, not a runtime admin setting |
| **Severity** | N/A -- reclassified from Medium to Not Applicable |

---

## 4. Where Each Constraint Lives

| Constraint | Configured In | Changeable By | Per-Section? |
|------------|--------------|---------------|--------------|
| **Allowed file extensions** | `appsettings.json` > `FileUpload.Scopes[].AllowedExtensions` | DevOps / platform administrator (requires app restart) | No -- per scope |
| **Max file size** | `appsettings.json` > `FileUpload.Scopes[].MaxFileSize` | DevOps / platform administrator (requires app restart) | No -- per scope |
| **Max file count** | Frontend constant `DEFAULT_FILE_MAX_COUNT = 5` in `client-app/shared/files/constants.ts` | Frontend developer (requires rebuild) | No -- global |
| **Allow anonymous upload** | `appsettings.json` > `FileUpload.Scopes[].AllowAnonymousUpload` | DevOps / platform administrator | No -- per scope |

---

## 5. Correction to BA Report

The BA report (BUG-3) stated these are "hardcoded at platform level." This is partially correct but needs nuance:

1. **`maxFileSize` and `allowedExtensions`** are NOT hardcoded -- they are **configurable in `appsettings.json`** per scope. A DevOps engineer can change them by editing the platform's configuration and restarting the app. They are also overridable via environment variables (standard .NET configuration).

2. **`maxFileCount`** IS hardcoded -- it is a frontend constant (`DEFAULT_FILE_MAX_COUNT = 5`) that is not returned by the backend API and cannot be changed without a frontend rebuild. This is a genuine gap in the architecture: the backend `FileUploadScopeOptions` model does not include a `MaxFileCount` property, so even if it were added to `appsettings.json`, the frontend has no way to receive it.

---

## 6. Enhancement Recommendation (if per-section config is desired)

If merchants need per-section control over file constraints, this would require:

1. **Backend (vc-module-configurable-products or equivalent):** Add `MaxFileSize`, `AllowedExtensions`, `MaxFileCount` fields to the `ConfigurationSection` entity for File-type sections
2. **Admin SPA:** Expose these fields in the section detail blade when Type = "File"
3. **GraphQL schema:** Return the per-section constraints in the `productConfiguration` query response
4. **Frontend:** Read constraints from the section configuration response instead of the global `fileUploadOptions` query

This is a **feature enhancement**, not a bug fix. It should be filed as an enhancement request, not a defect.

---

## 7. Source Code References

| File | Repository | Purpose |
|------|-----------|---------|
| `client-app/shared/catalog/components/configuration/option-file.vue` | VirtoCommerce/vc-frontend | File section component, uses `useFiles("product-configuration")` |
| `client-app/shared/files/composables/useFiles.ts` | VirtoCommerce/vc-frontend | File management composable, fetches options from GraphQL |
| `client-app/shared/files/constants.ts` | VirtoCommerce/vc-frontend | `DEFAULT_FILE_MAX_COUNT = 5`, `DEFAULT_FILE_MAX_SIZE = 1 MB` |
| `client-app/core/api/graphql/files/queries/getFileUploadOptions/getFileUploadOptions.graphql` | VirtoCommerce/vc-frontend | GraphQL query for file upload options |
| `client-app/core/api/graphql/files/fragments/fileUploadOptions.graphql` | VirtoCommerce/vc-frontend | Fragment: `maxFileSize`, `allowedExtensions` |
| `src/VirtoCommerce.FileExperienceApi.Core/Models/FileUploadOptions.cs` | VirtoCommerce/vc-module-file-experience-api | Backend options model with `Scopes` list |
| `src/VirtoCommerce.FileExperienceApi.Core/Models/FileUploadScopeOptions.cs` | VirtoCommerce/vc-module-file-experience-api | Per-scope options: `Scope`, `MaxFileSize`, `AllowedExtensions` |
| `README.md` | VirtoCommerce/vc-module-file-experience-api | Documents `appsettings.json` configuration pattern |

---

## 8. Sign-Off

**Classification:** BY-DESIGN
**Action required:** None (close BUG-3). Optionally file enhancement request for per-section configurability if business requires it.
**Test case impact:** Test cases TC-5, TC-6, TC-7 in the BA report remain valid -- they test enforcement of the platform-level constraints. Test data should reference the actual values from the GraphQL API, not hardcoded assumptions.
