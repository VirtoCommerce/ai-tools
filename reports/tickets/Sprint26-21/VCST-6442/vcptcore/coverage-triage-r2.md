# Coverage triage, round 2 (2a): VCST-6442 on vcptcore-qa

Scan: `npm run tc:scope -- --domain content-cms` with observables `permalink`, `alternates`, `multilanguage`, `publish all`, `grouped/publishing`, `Not published`, `grouped`, `permalink-usages`, `unpublishConflicting`, `legacy`, `organizationId`. 11 suites scanned, 394 rows, 200 hits (round-1 scan: 183 with the first six terms). `legacy` is the proxy for odd/legacy permalinks (no term matches a Normalize-sensitive permalink directly); each 059b case that publishes one was opened. Suites 062 and 069 are unscannable (legacy 11-column header) and unrelated.

Oracle: Jira comments 112508/112509. Delta: POST /grouped Draft-only (db1be24); publish under a lock keyed on store + Normalize(permalink) with page reload (4566f3e, PageBuilderPublishConflictService.cs:59); permalink-usages null body 400 (95880ca); Publish all conflict check and "Not published" report; landing-page Save no longer confirms; Multilanguage form text; xAPI alternates filtered by organization (35cb129).

Rules: CONFIRMED = assertion still correct under the delta; REPAIR = mechanical edit (here: stale References and one oracle tag, no expected value moved); RE-BASE = assertion kept, case carried into C1 (anything not clearly CONFIRMED); SCOPED OUT = term matched, case unrelated.

Totals: CONFIRMED 147, RE-BASE 32, REPAIR 3, NEW (Draft) 7, SCOPED OUT 11.

| Suite | Case | Disposition | Reason |
|---|---|---|---|
| 050f | CMS-GQL-014 | CONFIRMED | xCMS query (pages, page by id, zero-GUID, reindex health) that does not select alternates and has no organization fixture |
| 050f | CMS-GQL-115 | CONFIRMED | xCMS query (pages, page by id, zero-GUID, reindex health) that does not select alternates and has no organization fixture |
| 050f | CMS-GQL-123 | CONFIRMED | pageContext slugInfo for "/" and "/catalog"; the organization filter is in the alternates handler only and no organization page sits on those permalinks |
| 050f | CMS-GQL-124 | CONFIRMED | pageDocuments List asserts errors[] empty and totalCount >= 0; pageDocuments organization filtering was already in place and is unchanged |
| 050f | CMS-GQL-125 | CONFIRMED | xCMS query (pages, page by id, zero-GUID, reindex health) that does not select alternates and has no organization fixture |
| 050f | CMS-GQL-126 | CONFIRMED | pageContext slugInfo for "/" and "/catalog"; the organization filter is in the alternates handler only and no organization page sits on those permalinks |
| 050f | CMS-GQL-130 | CONFIRMED | xCMS query (pages, page by id, zero-GUID, reindex health) that does not select alternates and has no organization fixture |
| 050f | CMS-GQL-131 | CONFIRMED | xCMS query (pages, page by id, zero-GUID, reindex health) that does not select alternates and has no organization fixture |
| 050f | CMS-GQL-132 | CONFIRMED | xCMS query (pages, page by id, zero-GUID, reindex health) that does not select alternates and has no organization fixture |
| 050f | CMS-GQL-133 | RE-BASE | Round-1 BLOCKED (4935 absent), now deployed; slugInfo localized resolution with fixtures created through the publish path |
| 050f | CMS-GQL-134 | RE-BASE | Round-1 BLOCKED, now deployed; asserts the alternates list, the surface the organization filter changed |
| 050f | CMS-GQL-135 | RE-BASE | Round-1 RE-BASE: page-first slug resolver; carried unchanged |
| 059 | CMS-001 | RE-BASE | UI create goes through POST /grouped, which now builds the page as a Draft from the model and drops body pages (db1be24); asserts the created page in the Draft list |
| 059 | CMS-002 | CONFIRMED | Edit is a PUT on a Draft page; neither POST /grouped nor the publish lock is in the path |
| 059 | CMS-017 | CONFIRMED | Status filter, grid or URL display; not touched by the delta |
| 059 | CMS-053 | CONFIRMED | Status filter, grid or URL display; not touched by the delta |
| 059 | CMS-099 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-100 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-111 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-113 | RE-BASE | Load content creates the page via POST /grouped then uploads content; body pages are now ignored, so the content and permalink hand-off must be re-observed |
| 059 | CMS-115 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-116 | RE-BASE | Clone = POST /grouped then POST content/{source}; body pages ignored, so the cloned content and Draft status must be re-observed |
| 059 | CMS-118 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-119 | RE-BASE | Clone of a clone, same POST /grouped create path (name, permalink pattern and content carried) |
| 059 | CMS-120 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-121 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-122 | RE-BASE | Save/Load round-trip ends in a POST /grouped create from a JSON file; content must survive the Draft-only create |
| 059 | CMS-124 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-125 | RE-BASE | Clones a PUBLISHED page via POST /grouped; asserts the clone is Draft, which 6601 now forces, and that content is copied |
| 059 | CMS-126 | CONFIRMED | Permissive (a)/(b)/(c) assertion on clone collision; any outcome of the Draft-only create is accepted |
| 059 | CMS-129 | CONFIRMED | Content copy/export/import dialog, archive, GetPageContent or legacy-endpoint case; POST /grouped create and publish are not asserted |
| 059 | CMS-130 | RE-BASE | Round-1 BLOCKED. Rename + republish of a published page runs through the lock and reload (4566f3e); asserts content intact after each publish |
| 059 | CMS-135 | RE-BASE | Subject is the state after a clean publish (hasChanges false, no banner); the publish now reloads the page under the lock |
| 059 | CMS-136 | CONFIRMED | Unpublish path unchanged by the delta |
| 059b | CMS-259 | RE-BASE | Journey ends in a publish of a corrected permalink: locked publish, key built from Normalize(permalink) |
| 059b | CMS-260 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-261 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-262 | CONFIRMED | POST /grouped valid create asserts 2xx and the stored permalink verbatim; no status or pages asserted, so the Draft-only create does not contradict it |
| 059b | CMS-263 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-264 | RE-BASE | Publishes a stored legacy-invalid permalink; the new lock key is Normalize(permalink) (PageBuilderPublishConflictService.cs:59), odd input unobserved |
| 059b | CMS-265 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-266 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-267 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-268 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-269 | RE-BASE | Publishes a Cyrillic permalink through the new lock keyed on Normalize(permalink); asserts it opens as written |
| 059b | CMS-270 | RE-BASE | Publishes a %20 permalink through the new lock keyed on Normalize(permalink); asserts it opens as written |
| 059b | CMS-271 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-272 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-273 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-274 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-275 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-276 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-277 | RE-BASE | Clone of a legacy-invalid page = POST /grouped create; expected 400 predates the Draft-only create path |
| 059b | CMS-278 | RE-BASE | Clone from a dirty form = POST /grouped create; expected 400 and no page, on the changed create path |
| 059b | CMS-279 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-280 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-281 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-282 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-283 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-284 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-285 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-286 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-287 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-288 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-289 | RE-BASE | Publishes a legacy percent permalink (lock key via Normalize) and uses POST/PUT grouped; asserts publish 2xx and Published |
| 059b | CMS-290 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-291 | CONFIRMED | Admin UI/blade permalink validation (field error, Save/Publish disabled, legacy blade, import, i18n); no publish call or create body asserted |
| 059b | CMS-292 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059b | CMS-293 | CONFIRMED | Permalink format, boundary or authorization over create-group-page and POST/PUT grouped; validation runs before the changed create/publish code and no page status or body pages are asserted |
| 059m | CMS-ML-001 | CONFIRMED | Uses publish-all as setup on unique non-conflicting permalinks (versions differ in language); asserts alternates, NoDraft or archive, none organization-bound |
| 059m | CMS-ML-002 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-003 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-004 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-005 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-006 | CONFIRMED | Version create is MultilanguagePageService, not PageBuilderPageController.CreateGroup (6601 is controller-only); asserts Draft status and content copy, both unchanged |
| 059m | CMS-ML-007 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-008 | CONFIRMED | Convert/link service path; the single publish used as setup is on a unique ASCII permalink and nothing about it is asserted |
| 059m | CMS-ML-009 | CONFIRMED | Propagation into DRAFT versions and the override dialog; Published-version propagation is new CMS-PC-030 |
| 059m | CMS-ML-010 | CONFIRMED | Propagation into DRAFT versions and the override dialog; Published-version propagation is new CMS-PC-030 |
| 059m | CMS-ML-011 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-012 | RE-BASE | Outdated lifecycle driven by source publish, translation publish and publish-all, all of which changed (lock, reload, conflict check) |
| 059m | CMS-ML-013 | RE-BASE | Outdated bookkeeping after re-publishing the source through grouped/publishing, which now runs locked with a reload |
| 059m | CMS-ML-014 | RE-BASE | Publish all now checks every version like a single publish and reports a conflict skip ("Not published: ..."); the case asserts only NoDraft/Failed reasons |
| 059m | CMS-ML-015 | CONFIRMED | Uses publish-all as setup on unique non-conflicting permalinks (versions differ in language); asserts alternates, NoDraft or archive, none organization-bound |
| 059m | CMS-ML-016 | CONFIRMED | Uses publish-all as setup on unique non-conflicting permalinks (versions differ in language); asserts alternates, NoDraft or archive, none organization-bound |
| 059m | CMS-ML-017 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-018 | CONFIRMED | Uses publish-all as setup on unique non-conflicting permalinks (versions differ in language); asserts alternates, NoDraft or archive, none organization-bound |
| 059m | CMS-ML-019 | RE-BASE | Round-1 BLOCKED. Asserts the permalink warning/Save flow and the "one page per permalink" sentence that the forms no longer show |
| 059m | CMS-ML-020 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-021 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-022 | RE-BASE | Root default differs from store default; Outdated source after publish-all and single publishes through the changed paths |
| 059m | CMS-ML-023 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-024 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-025 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-026 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-027 | RE-BASE | Plain Landing Page publish/unpublish/archive lifecycle: the publish step is exactly the locked, reloading path |
| 059m | CMS-ML-028 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-029 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-030 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-031 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059m | CMS-ML-032 | CONFIRMED | Alternates, hreflang or routing on fixtures with no organization (user-group or date gating only), so the organization filter cannot change them |
| 059m | CMS-ML-033 | CONFIRMED | Create/link/clone/list/role case; no changed publish, create-body or organization-alternates behaviour asserted |
| 059p | CMS-PC-001 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-002 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-003 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-004 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-005 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-006 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-007 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-008 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-009 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-010 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-011 | RE-BASE | Round-1 BLOCKED, never executed. Publish confirmation dialog (cancel, confirm, unpublish the other page) now on the locked, reloading publish path; Save no longer confirms on the landing-page form |
| 059p | CMS-PC-012 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-013 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-014 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-015 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-016 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-017 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-018 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-019 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-020 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-021 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-022 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-023 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-024 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-025 | CONFIRMED | Unique-permalink API/UI/xAPI case; asserts nothing the round-2 delta moves (no body pages, no concurrency, no organization-filtered alternates); the lock is transparent to a single publish |
| 059p | CMS-PC-026 | REPAIR | References stale ("EXPECTED FAIL ... do not promote until fixed"); 6601 fixed in db1be24. Expected values untouched |
| 059p | CMS-PC-027 | REPAIR | References stale ("EXPECTED FLAKY-FAIL"); 6602 fixed in 4566f3e. Expected values untouched |
| 059p | CMS-PC-028 | REPAIR | References stale ("EXPECTED FAIL ... 500"); usages 400 fixed in 95880ca; HYPOTHESIS status assertions tightened to SPEC 112508. Expected values unchanged |
| 059p | CMS-PC-029 | NEW (Draft) | authored this round (Draft) |
| 059p | CMS-PC-030 | NEW (Draft) | authored this round (Draft) |
| 059p | CMS-PC-031 | NEW (Draft) | authored this round (Draft) |
| 059p | CMS-PC-032 | NEW (Draft) | authored this round (Draft) |
| 059p | CMS-PC-033 | NEW (Draft) | authored this round (Draft) |
| 059p | CMS-PC-034 | NEW (Draft) | authored this round (Draft) |
| 059p | CMS-PC-035 | NEW (Draft) | authored this round (Draft) |
| 060 | CMS-014 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-016 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-028 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-030 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-059 | RE-BASE | Designer Save and Publish: publish call now locked and reloaded; asserts post-publish state |
| 060 | CMS-074 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-078 | RE-BASE | E2E create (POST /grouped, Draft-only now) then publish (locked); asserts the storefront page |
| 060 | CMS-079 | RE-BASE | E2E edit published page and republish through the locked publish; asserts the storefront update |
| 060 | CMS-080 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-081 | CONFIRMED | Storefront/designer behaviour not touched by body-ignored create, the publish lock or the alternates organization filter |
| 060 | CMS-082 | RE-BASE | Round-1 BLOCKED. User-group page publish and visibility; publish path changed |
| 060 | CMS-083 | RE-BASE | Organization-restricted page publish and visibility; touches the organization audience the alternates filter now honours |
| 060b | CMS-084 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-085 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-086 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-087 | RE-BASE | Expects a duplicate-permalink error, which 112272/112407 reversed in round 1 (assertion kept; also a SUPERSEDED proposal for a human: CMS-PC-002 supersedes it); known fail by design |
| 060b | CMS-088 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-089 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-093 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-094 | RE-BASE | API CRUD: POST create then publish then GET Published; both calls changed (Draft-only create, locked publish) |
| 060b | CMS-095 | CONFIRMED | Unpublish path unchanged by the delta |
| 060b | CMS-097 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-108 | CONFIRMED | Manual (NOT_EXECUTING); control-type fallback, unrelated |
| 060b | CMS-110 | CONFIRMED | Asserts only the publish URL shape (groupId path parameter, publish query); route unchanged |
| 060b | CMS-149 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-150 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-151 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-152 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-153 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-157 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-169 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-170 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-171 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-172 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-173 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-220 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-221 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-222 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-223 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-225 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-233 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-234 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-237 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-239 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-240 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-241 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-242 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-243 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-244 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-245 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-253 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060b | CMS-254 | CONFIRMED | Scheduling, form fields, validation or grid case; creation and publish results are not asserted beyond what is unchanged |
| 060c | CMS-175 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-199 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-200 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-207 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-208 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-209 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-210 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-211 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-212 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 060c | CMS-215 | SCOPED OUT | Asset library / picker; the permalink word appears only in page-reference lists |
| 084 | NEWS-013 | SCOPED OUT | News status filter; unrelated to Page Builder |

## C1 --ids (RE-BASE + REPAIR + NEW)

| Suite | Ids |
|---|---|
| 050f | CMS-GQL-133, CMS-GQL-134, CMS-GQL-135 |
| 059 | CMS-001, CMS-113, CMS-116, CMS-119, CMS-122, CMS-125, CMS-130, CMS-135 |
| 059b | CMS-259, CMS-264, CMS-269, CMS-270, CMS-277, CMS-278, CMS-289 |
| 059m | CMS-ML-012, CMS-ML-013, CMS-ML-014, CMS-ML-019, CMS-ML-022, CMS-ML-027 |
| 059p | CMS-PC-011, CMS-PC-026, CMS-PC-027, CMS-PC-028, CMS-PC-029, CMS-PC-030, CMS-PC-031, CMS-PC-032, CMS-PC-033, CMS-PC-034, CMS-PC-035 |
| 060 | CMS-059, CMS-078, CMS-079, CMS-082, CMS-083 |
| 060b | CMS-087, CMS-094 |

