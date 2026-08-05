# Business Logic Proposals — 2026-08-04 (Sales Rep configurable layout, VCST-5367)

**Status after the 2026-08-04 re-audit:** of the 10 candidates held on 2026-08-04, **8 promoted**
(`BL-SR-023/024/026/027/028/029/030/031`, plus a 9th, `BL-SR-025`, split out of `PROPOSED-BL-SR-LAYOUT-003`)
once a live `qa-frontend-expert` pass against suites 091/093 supplied the second axis — see
`BL-AUDIT-2026-08-04.md` §Re-audit. **2 candidates remain drafted below**, each now missing a
*specific*, narrower capability rather than "no browser at all."

| Candidate | Source | Live | Verdict |
|---|:---:|:---:|---|
| PROPOSED-BL-SR-LAYOUT-003 (failure-handling half only — null-half promoted as `BL-SR-025`) | confirms | not observable (needs request interception) | UNGROUNDED (1 axis) |
| PROPOSED-BL-UI-LAYOUT-001 | confirms | not observable (needs throttled network) | UNGROUNDED (1 axis) |

---

## Drafts (source-confirmed, live-pending — narrowed trigger)

### PROPOSED-BL-SR-LAYOUT-003b: A genuine read failure disables Edit; a genuine save failure keeps the draft and edit mode `[P1-data]`
- **Rule:** A layout **read** failure (distinct from the `null` never-saved case, now `BL-SR-025`) renders registry defaults but disables Edit entirely — offering to overwrite a document that could not be fetched risks destroying it. A layout **write** (save) failure keeps the rep's in-progress draft and edit mode active, surfacing an alert rather than discarding the draft.
- **Source:** module composable's `canEdit`/`loadFailed` state and the `save()` catch path (distinguishes a fetch error from `null`).
- **Why still drafted:** this run's live pass observed the `null` case only; a genuine read/write failure requires intercepting the layout GraphQL request to force an error response, which was out of scope for this session.
- **Re-audit trigger (narrowed):** intercept/mock the `salesRepLayout` query to return an error and confirm Edit is disabled with registry defaults shown; intercept/mock `saveSalesRepLayout` to return an error and confirm the draft + edit mode survive with an alert shown.

### PROPOSED-BL-UI-LAYOUT-001: Nothing block-shaped renders on a layout-driven surface until the saved-layout query resolves `[P2-ux]`
- **Rule:** A layout surface shows a skeleton (not registry defaults, not an empty flash) until the `salesRepLayout` query settles; page-level chrome (title, breadcrumbs, customer hero) owned by the page component — not the layout surface — renders immediately regardless.
- **Source:** module layout-surface component (skeleton gated on the query's loading state) and its design-spec component-tree (pages own their own title/hero; the layout surface is a child).
- **Why still drafted:** six live attempts this run (a `null` document, a real saved document, and two larger planted documents) never caught the loading window — the response resolved too fast under normal network conditions to observe a skeleton or a defaults-flash either way.
- **Re-audit trigger (narrowed):** re-run under an explicitly throttled/slowed network condition (not just repeated attempts at normal speed) so the loading window is wide enough to observe.

---

## Unrelated critical finding surfaced during this audit — NOT part of this proposal set

See `reports/knowledge/BL-AUDIT-2026-08-04.md` §Oracle file corruption. `business-logic.md` contains
**two full, divergent copies of the entire document concatenated together** (`bl:lint` still reports
150 pre-existing Blocker-severity duplicate-ID findings, unchanged by this run's edits, all confined
to copy 1). This needs a dedicated reconciliation task, not a fix folded into a scoped feature audit.

---

# Second proposal set — VCST-5281 organization invite & membership status (TLC Phase 4c)

Separate scope from the Sales Rep set above, appended by the VCST-5281 Phase 4c BL audit
(`BL-AUDIT-2026-08-04.md` §VCST-5281). 4 of 6 candidates promoted + 2 existing invariants amended;
**1 candidate is drafted below**, and 1 candidate was withdrawn before audit.

| Candidate | Docs | Source | Live | Verdict |
|---|:---:|:---:|:---:|---|
| PROPOSED-BL-AUTH-017 (bogus/foreign `organization_id` silently substituted) | N/A waived | confirms behaviour, **not intent** | confirms behaviour | CONTRADICTORY (intent undeterminable) |

## Draft

### PROPOSED-BL-AUTH-017: A non-member `organization_id` on a password grant is silently substituted, not rejected `[P0-security]`
- **Observed behaviour (all axes agree):** on a `grant_type=password` request, an `organization_id` the user
  is **not associated with at all** — a nonexistent identifier, a real organization the user is not a member
  of, a malformed non-identifier string, an empty value, or a literal placeholder — is **not** rejected.
  The value is discarded and replaced with the user's first accessible organization, and the endpoint
  returns **HTTP 200** with the substituted organization in the token's claim. `invalid_organization_id`
  is returned **only** for a non-`password` grant.
- **Why this is drafted, not promoted — the intent is undeterminable from any axis.** The substitution
  path is the *same* code path that implements the deliberate blocked-org fallback now promoted as
  BL-AUTH-016, and the source comment states the rationale **only** for the blocked-org case ("the
  storefront always resends the last-used organization on every password login, so a blocked org here is
  never a deliberate choice"). Nothing in source, docs, or live behaviour says whether extending that
  leniency to an org the user was **never** associated with is intended or an oversight. Promoting either
  reading would be wrong: blessing it as a contract retroactively legitimises a possible defect, and
  wording it as a violation retroactively condemns a possible design decision.
- **Frame it precisely — this is NOT foreign-org access.** The substituted token is always scoped to an
  organization the user legitimately belongs to, so BL-B2B-007 (per-org JWT scoping; `pageContext` equals
  the JWT) is **not** violated and needs no change. The actual exposure is two-fold and
  **request-relative**: (1) a **swallowed input error** — a caller cannot distinguish "your org id was
  wrong" from "your request succeeded", so a typo, a stale identifier, or an unsubstituted template
  variable fails silently; and (2) **privilege elevation relative to the request** — a multi-org user who
  asks for their low-privilege organization and mistypes the identifier is handed their high-privilege
  organization instead of an error. On the environment the first accessible organization for the
  multi-org fixture is the one where it holds the maintainer role, so the substitution resolves *upward*.
- **Suspected mechanism — HYPOTHESIS, and the originally-supplied one is REFUTED.** The handed-down
  hypothesis ("the unavailable-organization handler never consults `isAutoResolved`, while its sibling
  does") does **not** hold: there is no `isAutoResolved` flag anywhere in the validator, and **both**
  methods gate on grant type alone. The real asymmetry read from source is different: the
  access-validation sibling falls back only when a fallback **exists** and otherwise returns a specific
  error, whereas the unavailable-organization handler substitutes **unconditionally** on a `password`
  grant — including to an empty value — and never returns an error on that path. Treat this as a
  hypothesis until confirmed line-by-line with the owning developer.
- **Not asserted either way: whether this is pre-existing.** It was reported as byte-equivalent in the
  parent revision, but only the post-change artifact is deployed, so the pre-change build was never
  exercised. Do not claim "pre-existing" or "newly introduced".
- **Re-audit trigger (either is sufficient):** (a) the module owner states the intended behaviour for a
  **non-member** `organization_id` on a password grant — then promote as a contract (leniency intended)
  or as a violation-with-defect (rejection intended); or (b) a fix lands that distinguishes
  "associated-but-blocked" (fall back) from "not associated" (reject) — then promote the resulting
  two-branch contract directly.
- **Agents:** qa-backend-expert (token endpoint, memberships), qa-frontend-expert (org switcher)

## Withdrawn before audit — recorded so it is not re-raised

**`BlockingStatuses` completeness / a fifth `Locked` status value.** Settled at source: the legal
manually-selectable set is exactly four values, and both the membership-status and contact-status
dictionary settings bind their allowed values to that four-value array. Both are dictionary settings, so
a fifth value seen on an environment is **admin-added environment data, not the contract**. Lock is a
**separate axis**, now captured in BL-B2B-013 and BL-AUTH-016. No oracle change was needed.
