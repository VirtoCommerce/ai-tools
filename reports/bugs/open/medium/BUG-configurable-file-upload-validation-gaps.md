# Configurable-product file upload — required-gate bypass + silent rejection + missing aria-expanded `[P2]`

**Env:** vcst-qa storefront @ theme 2.53.0-pr-2368, Platform 3.1043.0
**Summary:** On configurable-product file-upload sections, a 0-byte file is accepted on a **required** section and enables Add-to-cart (bypassing the required-file gate); on **optional** sections, disallowed-type and oversize files are rejected **silently** (no error text); and the section accordion never exposes `aria-expanded`. Live-confirmed 2026-07-14 (triage of REG-2026-07-14-0018).

## STR
1. Open a configurable product with a **required** file section (e.g. `agent-test-req-file-child`), sign in as any buyer.
2. Upload a **0-byte** file (`large_logo.png`, 0B) to the required section.
3. Observe the file list + the Add-to-cart button state.
4. Open a configurable product with an **optional** file section (`agent-test-config-fileupload`); upload a disallowed type (`.webp`/`.avif`) and separately a >9.5 MB file.
5. Observe whether any error/toast appears.
6. Expand/collapse the configurable section accordion; inspect the header's ARIA state.

## Expected vs Actual
- **Required 0-byte file (CFG-FILE-003, P2):** Expected — a 0-byte file rejected (or at least not satisfying the required-file gate). **Actual** — accepted into the list showing "(0B)" with a valid `/api/files/` URL; **Add-to-cart flips from disabled to ENABLED** with only the empty file → required-file gate bypassed. See `screenshots/CFG-FILE-003-VERIFY-0byte-accepted-addtocart-enabled.png`.
- **Optional-section silent rejection (CFG-FILE-007/008, P3):** Expected — a rejection message. **Actual** — disallowed `.webp` and 24 MB `.mp4` are **dropped silently** — no list entry, no inline error, no toast. **Scope:** the **required** section correctly shows inline "File format is not allowed" + a blocking "Fix file upload errors to continue" gate (`screenshots/CFG-FILE-007-008-VERIFY-reqfile-inline-errors-shown.png`), so the silent-rejection defect is specific to the **optional-section widget path**. See `screenshots/CFG-FILE-007-VERIFY-optional-silent-drop-no-error.png`.
- **Accordion ARIA (CFG-A11Y-003, P3):** Expected — `aria-expanded` reflects open/closed. **Actual** — the header (role=button) toggles the section correctly but exposes **no `[expanded]` state** in the accessibility tree in either state (WCAG 4.1.2).

## Notes
- Test-data cleanup (not part of the defect): the CFG-FILE-003 CSV row's `product_url` (`.../physical-1703`) 404s — use `@td(CFG_REQUIRED_FILE_CHILD.url)`; and the CFG-FILE-008 title's "10 MB" literal should read the real platform limit **9.5 MB**.

---

# Finding 1 (= VCST-6000): a 0-byte file satisfies a REQUIRED File section

## Status: CONFIRMED — re-reproduced end-to-end on **vcptcore-qa**, 2026-09-23

**Env:** vcptcore-qa · storefront `2.59.0-pr-2485-8b28-8b288e09` · `XCart 3.1036.0` · `FileExperienceApi 3.1004.0` ·
`Xapi 3.1023.0`. Buyer `test-john.mitchell-20260310@test-agent.com`, product `agent-test-req-file-child-20260519`,
section "ID Proof *".

### Measured, with the control that makes it diagnostic

| Check | Result |
|---|---|
| `POST /api/files/product-configuration` with a genuinely 0-byte file | **200**, `succeeded:true`, `size:0`, real id — persisted |
| `addItem` with that file as the **only** content of the required File section | **succeeds**, `validationErrors: []`, line item created |
| **CONTROL** — `addItem` with the required File section **omitted entirely** | **rejected**: `CONFIGURATION_SECTION_REQUIRED` — "Required sections are missing", no line item |
| Storefront: upload it into "ID Proof *" | chip renders `zero-byte-fixture.txt (0B)`, header flips from "Complete all required options…" to the filename, **"Add to cart" loses `disabled`**, console **0 errors** |

The control is the point: **the backend does enforce required File sections** — it simply counts an empty file as
satisfying one. So this is not "the frontend forgot a check"; the requirement semantics are implemented server-side
and are wrong there. Screenshot: `../screenshots/VCST-6000-vcptcore-qa-zero-byte-satisfies-required-addtocart-enabled.png`.

### Root cause (source)
`ConfigurationItemValidator.ValidateSectionTypeFile` (`vc-module-x-cart`,
`XCart.Core/Validators/ConfigurationItemValidator.cs`) tests **presence only**:

```csharp
if (section != null && section.IsRequired && configurationItem.Files.IsNullOrEmpty())
    context.AddFailure(CartErrorDescriber.AddingFileIsRequired(section));
```

A 0-byte file is present, so the gate passes. The only other file rule there is a **maximum** count
(`limitOfFiles`); no size floor exists anywhere in the path.

**The platform already disagrees with itself one method below.** `ValidateSectionTypeText` rejects an empty *string*
for a required Text section (`!string.IsNullOrEmpty(configurationItem.CustomText)`). Empty content therefore does
**not** satisfy a required Text section but **does** satisfy a required File section — an internal inconsistency,
which is a stronger argument than any preference about what "should" happen.

### Correction to the ticket's proposed fix
VCST-6000 suggests rejecting 0-byte at the upload endpoint, "next to `INVALID_EXTENSION` / `INVALID_SIZE`". That is
the wrong home: `FileUploadScopeOptions` carries only `Scope`, `MaxFileSize`, `AllowedExtensions`,
`AllowAnonymousUpload` — there is **no minimum-size concept**, so adding one is a change to a shared, platform-wide
model that would apply to *every* scope (quote attachments, sales-rep documents, …). "Does an empty file satisfy a
required section?" is a per-section question that the cart validator already owns and already answers correctly for
Text. Fix it there; the upload endpoint may legitimately keep accepting empty files for other scopes.

### Fix Routing (→ /qa-fix) — for this finding
- **Owning layer:** Layer 3 — GraphQL xAPI (cart configuration validation)
- **Suggested repo:** `VirtoCommerce/vc-module-x-cart` · **repoKind:** module · **Ownership hint:** platform
- **Component / module:** XCart — `ConfigurationItemValidator.ValidateSectionTypeFile`
- **RCA anchor:** `src/VirtoCommerce.XCart.Core/Validators/ConfigurationItemValidator.cs`, `ValidateSectionTypeFile`
- **Routing confidence:** HIGH — the control run proves the requirement gate lives in this validator, and the Text
  branch in the same file shows the intended shape. A storefront-side guard in `vc-frontend` is worth adding for the
  error message, but it is cosmetic once the server rejects.

**Suite impact:** the case `CFG-FILE-003` ("0-Byte File Rejected on Required Upload Section") asserts the *correct*
behaviour and currently fails — it is not stale, it is ahead of the code. Keep it; do not re-base it downward.

---

# Findings 2–3 (unfiled): optional-section silent rejection · missing `aria-expanded`

Neither is covered by VCST-6000. Both were measured on vcst-qa 2026-07-14 and have **not** been re-checked on
vcptcore-qa.

## Fix Routing (findings 2–3 only)
- **Repo:** `vc-frontend` · **Layer:** storefront (frontend) · **Component:** configurable-product file-upload widget
  (surface inline errors on the optional-section variant; emit `aria-expanded` on the section accordion).

## Related
Not to be confused with VCST-5995 / VCST-5999, which are *read*-path defects on the same attachments (order 403 /
quote 404) — see [`../critical-high/BUG-configurable-product-order-attachment-403-for-owner-VCST-5995.md`](../critical-high/BUG-configurable-product-order-attachment-403-for-owner-VCST-5995.md).
