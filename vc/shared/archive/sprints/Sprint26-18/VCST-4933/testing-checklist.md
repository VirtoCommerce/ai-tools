# VCST-4933 — Testing Checklist (Artifact B)

Run 2026-09-17 · env **vcptcore-qa** · FULL path · build PageBuilderModule `3.1025.0-pr-159-7361` (PR #159)
+ storefront `2.58.0-pr-2410-3aa8` (PR #2410). Written AFTER the 3x discovery lane, so items marked
`[3x]` carry what was OBSERVED rather than what the ACs guessed.

Access: Admin UI `https://vcptcore-qa.govirto.com`, VC Shell app
`https://vcptcore-qa.govirto.com/apps/page-builder-shell/` (NOT in the AngularJS left-nav).
Storefront `https://vcptcore-qa-storefront.govirto.com`. Store `B2B-store`.

## Already CLOSED before execution — do not re-run

| Item | Result | Evidence |
|---|---|---|
| B0.1 AC7(a) authoring keeps the compact 3-key `componentRef` marker | **PASS** | `GET /api/page-builder-pages/grouped/{gid}/content?draft=true` |
| B0.2 AC7(b) expanded before Pages indexing — 0 markers delivered | **PASS** | `pageDocument(id)` = 10 expanded blocks, `componentRef` count 0 |
| B0.3 AC7(c) storefront never calls the Shared Components API | **PASS** | full network trace: zero platform-API calls |
| B0.4 expanded ids are regenerated per placement (`lc<hex(placementId)>sectionN`) | **PASS** [3x] | `lc6167706c6163652d75736531section0..2` |
| B0.5 usage count reconciles with ground truth, master INCLUDED | **PASS** [3x] | swept all 107 pages: 3/3, 2/2, 1/1 |
| B0.6 no orphan `componentRef` anywhere on the env | **PASS** [3x] | every marker resolves to a live component |
| B0.7 delivery is identity-free (G-b) | **PASS** [3x] | `pageDocument` 200 with no auth header |
| B0.8 blank storefront render on `AGENT-TEST-*` pages | **NOT A DEFECT** | A/B control: block type `"Text"` has no renderer |

## TRACK 1 — the overlay-gated items (chromium lane; firefox stalled on these)

Each needs a Designer session on a page holding a Shared placement. The Designer reads AUTHORING
content, so the existing `AGENT-TEST-*` pages are usable here even though they render blank.

- [ ] **B1.1 [P-4, prior finding]** Select adjacent top-level sections, **remove some blocks**, then
      "Save selected as Shared Component". Does the FALSE error *"Select only independent sections to
      create a Shared Component"* appear? Decide which: (a) the selection really is invalid and only
      the MESSAGE is misleading, or (b) the validator wrongly blocks a valid save. These are different
      defects with different severities — do not report "the error appeared" without deciding.
- [ ] **B1.2 [P-3, prior finding]** Put something invalid on the clipboard, then check whether
      "Paste section" is ENABLED. Paste it. Record: error / silent no-op / corrupted block. The
      reported concern is that the control is enabled before the clipboard is validated.
- [ ] **B1.3 [P-6, prior finding]** Detach a linked placement. Immediately observe the properties
      panel: is it EMPTY, and can the author edit the detached sections without an extra re-select?
      AC5 implies detach yields ordinary editable sections.
- [ ] **B1.4 [R-b]** After a Detach, is there ANY re-attach path (button, menu, undo)? The model
      predicts ABSENT IN PRODUCT — confirm or refute.
- [ ] **B1.5 [D-b, AC4]** Open a Shared placement and then edit the original. Record VERBATIM: the
      badge/label text identifying it as shared, the usage count shown, the Where-used list, and the
      exact copy of any warning that editing affects all linked placements. AC4 is unfalsifiable as
      written; this item exists to make it falsifiable.
- [ ] **B1.6 [#19/#20]** Detach, then SAVE the page. Does `usageCount` decrement? Verify at
      `GET /api/page-builder-shared-components/{id}` as well as in the UI.

## TRACK 2 — creation, insertion and propagation (Designer)

- [ ] **B2.1 [#1]** Select 3 adjacent top-level sections out of 4 and save as a Shared Component.
      One row replaces the three; **the unselected section keeps its position**; preview shows one
      boundary. Save, reload, confirm persistence.
- [ ] **B2.2 [#2]** Same with a SINGLE section (the arity boundary).
- [ ] **B2.3 [#1 negative]** Non-adjacent selection -> rejected, **and the page is not modified**.
- [ ] **B2.4 [#1 negative]** Selection containing an existing Shared placement (nesting) -> rejected,
      page unchanged.
- [ ] **B2.5 [D-a, AC1]** Add block panel: is **Shared Blocks Library** FIRST, above the ordinary
      blocks, and are the ordinary blocks still present and usable? [3x] observed a flat list of 14
      under one collapsible library section and **no "groups"** — record what is actually there.
- [ ] **B2.6 [#6]** Insert shared instance -> the placement is genuinely LINKED (authoring content
      holds the 3-key marker, not inlined sections).
- [ ] **B2.7 [#8]** Insert independent copy -> ordinary sections, **ids regenerated**, no reference
      created, usage unchanged.
- [ ] **B2.8 [#9/#10]** Insert a placement but DO NOT save -> usage must NOT move. Then save ->
      usage becomes authoritative. (Reload between, to defeat client-side caching.)
- [ ] **B2.9 [#12]** Edit the original, save -> every LINKED placement reflects it.
- [ ] **B2.10 [#13]** The independent copy from B2.7 must NOT change.
- [ ] **B2.11 [#14]** A detached placement must NOT change.
- [ ] **B2.12 [#7]** A multi-section component renders as ONE logical editor item and ONE preview
      boundary, not N separate items.
- [ ] **B2.13 [#18]** Two placements of the SAME component on ONE page -> expanded ids must not
      collide. (Mechanism already evidenced by B0.4; this is the two-on-one-page case.)

## TRACK 3 — VC Shell workspace + deletion guard (API + UI)

- [ ] **B3.1 [AC1]** Workspace: search, pagination, details, audit metadata (store, modified, modified
      by), usage, rename. Rename persists across refresh.
- [ ] **B3.2 [net-new #3, UIP-DEEP]** Open the VC Shell app at its own URL directly. [3x] observed
      *"Store context is missing"*, inert buttons and **no store picker** — a dead end. Confirm, and
      record whether any in-app route reaches it correctly.
- [ ] **B3.3 [#22]** Delete a component with usage > 0 -> **BLOCKED**, and the response/UI **names the
      affected pages**. Assert at the API too (expect a 409 whose body carries the pages).
- [ ] **B3.4 [#21]** Drive a component to usage 0 (remove/detach all placements + save), then delete
      -> succeeds. **Use a component seeded for this run** — deletion is terminal.
- [ ] **B3.5 [net-new #2]** `usagePages` is `[]` from `POST /search` but populated by
      `GET /{id}`. Confirm and record as a CONTRACT note. This is BY DESIGN (search uses
      `includePages:false`) — it is only a defect if the UI relies on the search projection to list
      affected pages for AC6.
- [ ] **B3.6 [#27]** Name validation: empty, whitespace-only, and >128 characters -> deterministic
      rejection, no partial persistence.

## TRACK 4 — contract negatives (API only, no browser)

Marker shape is decisive: a linked placement is a TOP-LEVEL item with EXACTLY 3 keys
`{"id","type":"componentRef","componentRef"}`. **Using the wrong shape makes every negative below
appear to be wrongly accepted** — the single most likely source of false FAILs on this ticket.

- [ ] **B4.1 [#27]** Each malformed marker partition -> deterministic 400, nothing persisted:
      extra field · missing field · wrong `type` · dangling component id · duplicate placement id ·
      placement id colliding with another top-level id.
- [ ] **B4.2 [#25]** Cross-store LINKED reference -> rejected. (An independent copy across stores may
      still be allowed where the caller can read the source.) **If no second store exists on this env,
      record a STATED GAP — do not skip silently.**
- [ ] **B4.3 [net-new #5]** The undocumented `/{id}/content` sub-resource must be RBAC-gated exactly
      like the detail GET. [3x] found it 401s anonymously, but the RBAC cases assert only the detail
      GET and would pass while this stayed open.

## TRACK 5 — permissions & store isolation (BLOCKED on 3a seeding)

Every item asserts at the **SERVER with that role's own token**, never as a missing button.
**Run B5.0 FIRST** — without it a correct uniform 403 reads as broken gating.

- [ ] **B5.0 CONTROL [#26]** As the `sc-nostore` user (permissions but no matching `user.StoreId`):
      every store-scoped route 403s, **AND** the unrelated control route
      `POST /api/page-builder-pages/search` (which the token does hold `builder:read` for) **also**
      403s. A uniform 403 here is CORRECT.
- [ ] **B5.1 [#23, BSC-1]** `sc-all` (correctly scoped, all four perms) can do the full lifecycle and
      sees only its own store's components.
- [ ] **B5.2 [#24, BSC-2]** `sc-read` — can read; every mutation refused at the server.
- [ ] **B5.3 [#24]** `sc-nocreate` / `sc-noupdate` / `sc-nodelete` — each refused for exactly its
      missing verb and permitted for the others (a clean diagonal).
- [ ] **B5.4 [#24]** `sc-noread` — no library, no workspace; pages containing refs behave per spec.

## TRACK 6 — the seam discovery found

- [ ] **B6.1 [net-new #1, strongest P-Preview lead]** On every Designer load, `postMessage` is sent to
      the WRONG target origin twice (posts to the storefront origin before the iframe has left the
      platform origin), dropping the first content push; it self-heals later. Reproduce, capture the
      console, and determine whether a real edit can be LOST in that window (PR #2410 claims
      "reliable iframe reconnection with message queuing"). Then reload/replace the iframe and make an
      immediate change — does the queued update wait for the new `preview-loaded` handshake?
- [ ] **B6.2 [P-Preview]** With a VALID (rendering) fixture page from 3a, confirm whether a Shared
      Component displays correctly in the Designer preview. **This is the only item that can close the
      2026-09-11 finding.** If 3a's fixtures are unavailable, record NOT REACHED + reason.

## TRACK 7 — AC8 atomicity (the unverified invariant)

No oracle is stated by the story and no test exists anywhere. Treat divergence between the three
stores (page content · reference index · asset references) as the observable.

- [ ] **B7.1 [#28-A]** Session A opens an unused component; Session B inserts and saves it on a page;
      Session A attempts delete -> expect conflict/refresh, component survives.
- [ ] **B7.2 [#28-B]** Session A opens the original; Session B deletes the still-unused component;
      Session A saves stale content -> expect not-found/concurrency failure, component NOT recreated.
- [ ] **B7.3 [#28-C]** Save the same page from two sessions -> content, reference index and asset refs
      must correspond to ONE committed version, never a mix.
- [ ] **B7.4** Report whether AC8 is verifiable at all as written. If the product exposes no
      concurrency signal, that absence IS the finding.

## TRACK 8 — asset references (AC8 / dev plan §8)

- [ ] **B8.1 [#27]** Use a unique asset inside a component; its reference details list the Shared
      Component and the affected pages, with correct direct/component/total counts.
- [ ] **B8.2** An asset used only by an UNUSED component remains protected.
- [ ] **B8.3** Replace/remove the asset in the original and save -> references update with no stale
      duplicates.

## Standing rules for every item

1. **Evidence or it did not happen** — PASS and FAIL both need an artifact.
2. **Never conclude a permission defect without B5.0.** Contract fact: a non-admin 403s on every
   store-scoped route unless `user.StoreId` matches.
3. **`usagePages: []` from search is BY DESIGN.** Assert pages against `GET /{id}`.
4. **A blank storefront render proves nothing on `AGENT-TEST-*` pages** (block-type fixture defect).
5. Known env noise, never a defect: App Insights `400 Invalid workspace`;
   `GET /api/pagebuilder/sections` returning an empty catalog; `GET /api/content/themes/{store}` 500.
6. A finding plausibly owned by sub-task VCST-5184 ("Production ready") or VCST-5185 ("Tuning") is
   still FILED, but FLAGGED as possibly-deferred — it does not automatically fail this ticket.
