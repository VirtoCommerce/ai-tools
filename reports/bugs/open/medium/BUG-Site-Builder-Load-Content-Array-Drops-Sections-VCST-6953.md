# [Medium] Site Builder: "Load content" reports success for a top-level-array file but saves an empty page; invalid JSON escapes as an unhandled SyntaxError

## Status: CONFIRMED — filed in Jira as VCST-6953 (2026-11-20)
**Found by:** agent — regression REG-2026-11-19-2029
**Tracker:** [VCST-6953](https://virtocommerce.atlassian.net/browse/VCST-6953) (Bug, Priority Medium, Relates VCST-6571)

**Severity:** Medium. The page content is lost without a warning (the toast says it loaded), but no existing data is touched and an export file from the shell's own "Save content" imports correctly.

**Env:** vcst (vcst-qa) @ Platform 3.1099.0, VirtoCommerce.SiteBuilder 3.1000.0-pr-1-28d0 (vc-module-site-builder PR #1 @ 28d00e0), storefront 2.63.0-pr-2676. Admin user, store B2B-store.

## Summary
Load content in the Site Builder shell (Draft pages list) reads only the file's `content` property. A file whose root is a JSON array (a page document with no export wrapper) has no `content` property, so the shell shows "Content loaded successfully", and Save creates the page through `POST /api/site-builder-pages/grouped` with no content. The page is saved with no sections. An empty, malformed or plain-text file is not handled by the import code: the raw `JSON.parse` message and a JS stack trace appear in the blade, and the SyntaxError reaches the vc-shell global error handler.

## Steps to reproduce
1. Back office → Site Builder → Draft pages (`/apps/site-builder-shell/?storeId=B2B-store#/site-builder-draft`).
2. Create `array.json` that contains a top-level array of two text sections, e.g. `[{"id":"text01","type":"text","text":"A"},{"id":"text02","type":"text","text":"B"}]`.
3. Click **Load content** and choose `array.json`. The toast says "Content loaded successfully" and a New page blade opens.
4. Enter a Name and a Permalink (AGENT-TEST-…), then click **Save**.
5. `GET /api/site-builder-pages/grouped/{id}/content?draft=true`.
6. Repeat step 3 with `empty.json` (0 bytes), `malformed.json` (a truncated object) and `text.json` (plain text).

## Expected vs Actual
| | Expected (README @ 28d00e0 §create-group-page) | Actual |
|---|---|---|
| Array file | Either converted to `{settings, content[]}` and saved with its sections, or rejected with a message. No success toast for content that is then dropped | Success toast. Save sends `POST /grouped` with `{name, permalink, storeId}` only (no `create-group-page` call). The stored draft is `{settings:{name,permalink,cultureName:null}, content:[]}` |
| Empty / malformed / text | "fails client parsing" with a user-facing error. No page is created | No page is created (correct). But the blade alert shows the raw parser text ("Unexpected end of JSON input", "Expected ',' or '}' after property value in JSON at position 46", "Unexpected token 'T'…") with an expandable stack trace. The console logs `[@vc-shell/framework#use-error-handler] Captured Error: SyntaxError …` |

**Related, same root cause:** a file shaped as a bare page document, `{settings:{}, content:[s1,s2]}`, is saved as `{settings: s1, content:[s2]}`. The shell passes the file's `content` array into the legacy converter, which treats the first array slot as page settings (`importContent.ts:4-6`). That conversion rule is documented and intended for the legacy content array of an export file. Applying it to a sections array is the defect: no file-shape check is made before the rule runs. A real export (`{name, permalink, …, content:{settings, content[]}}`) imports correctly.

**Incidental (same function):** `parseImportFile` copies `visibility: data.visibility`. For a file without the field, `visibility` is `undefined`, so the imported page is saved with Visibility off (the New page blade otherwise defaults it to on, `useSiteBuilderDetails/index.ts:83`).

![Array import saved with empty content](../../screenshots/Site-Builder-Load-Content-Array-Drops-Sections/SB-083-FAIL-array-import-saved-empty-content.png)

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront | N/A | Admin-only import flow |
| 2. Backend Admin (Site Builder Vue shell) | **FAIL** | REG-2026-11-19-2029 SB-083 (screenshot above, `traces/SB-083-FAIL-trace.json`) |
| 3. GraphQL xAPI | N/A | Not used by the import |
| 4. Platform REST | PASS | Re-run 2026-11-20 (admin token, AGENT-TEST pages, deleted afterwards): `POST /create-group-page` with `content` = a JSON array → **400** "Content root must be a JSON object with `settings` and `content` keys." The same call with `{settings:{}, content:[s1,s2]}` → 200, both sections stored. `POST /grouped` with no content → 200, `content:[]`, `visibility:false`. These are correct for the inputs the shell sends |

**Owning layer:** Layer 2, the module's embedded Vue shell. REST validates correctly. The shell never sends the array, and it never catches the parse error.

## Root Cause Analysis (vc-module-site-builder @ 28d00e0)
- `src/VirtoCommerce.SiteBuilder.Web/vue/src/modules/site-builder/composables/usePageContentApi.ts:55-69`, `parseImportFile`. Line 57 runs `JSON.parse(text)` with no try/catch. Line 68 sets `content: data.content`. For an array root, `data.content` is `undefined`. For a bare document, it is the sections array. The file's shape is never checked.
- `src/VirtoCommerce.SiteBuilder.Web/vue/src/modules/site-builder/components/pagesList.vue:360-375`, `onFileSelected`. It awaits `parseImportFile` with no try/catch. Line 367 shows the success toast without checking that any content was found.
- `src/VirtoCommerce.SiteBuilder.Web/vue/src/modules/site-builder/composables/useSiteBuilderDetails/index.ts:106-114`. When `importData.content === undefined`, the code falls back to `createGroup` (no content). The legacy converter `serializeImportedPageContent` (`…/useSiteBuilderDetails/importContent.ts:1-11`) is never reached for an array-root file.
- Fix shape: in `parseImportFile`, catch the parse error and throw a localized "not a valid page file" error. Detect the root shape: an array root is a legacy document; `{settings, content[]}` is a bare document; otherwise treat it as an export wrapper. Reject a file with no content. `onFileSelected` must show the success toast only after that check passes. The existing `vue/tests/pageImportContent.test.ts` (node `--test`) covers only the converter. Add cases for `parseImportFile`.

**Regression or new?** Not a regression from Page Builder: the defect was inherited. `vc-module-pagebuilder` `dev` has byte-identical `parseImportFile` (`Apps/page-builder-shell/…/usePageContentApi.ts:70-85`), `onFileSelected` (`pagesList.vue:365-380`) and `importContent.ts`, all from VCST-6009 (`afddef05`, 2026-10-12). Its first Load content (VCST-4872, `785bf30e`) also read only `data.content` with an unguarded `JSON.parse`. Page Builder likely shows the same behaviour, but it was not re-run there. A fix in Site Builder should be mirrored to `vc-module-pagebuilder`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin (module-embedded Vue 3 shell)
- **Suggested repo:** VirtoCommerce/vc-module-site-builder (the fix belongs on PR #1's branch `feat/VCST-6571-site-builder-r1`, which is still open and not merged to `dev`)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Site Builder shell: Load content (`parseImportFile` / `onFileSelected`)
- **RCA anchor:** `src/VirtoCommerce.SiteBuilder.Web/vue/src/modules/site-builder/composables/usePageContentApi.ts:57` and `:68` @ 28d00e0 (`const data = JSON.parse(text);` / `content: data.content,`)
- **Routing confidence:** HIGH for the repo and file. The sub-app path is not declared in `fix-repos.json` `moduleFrontendSubApps` (only `vc-module-pagebuilder`'s shell is), so `/qa-fix` would route the bug to `fullstack-backend`.
