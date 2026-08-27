# ECL Proposals — 2026-08-27

Unconfirmed items from `/qa-review-oracles ecl` (scope: **all 54 sections**). Nothing here was written to
`e-commerce-edge-cases-library.md`. Applied edits + the full verdict table:
`reports/knowledge/ECL-AUDIT-2026-08-27.md`.

**Value** = `business · product → label`, derived at decision time by `npm run oracles:rank -- --axis=ecl`
(`scripts/knowledge/oracle-significance.ts`) — never stored in the oracle. The value gate bounds **growth**
only; every item in §1 is blocked by the **truth** gate, not by value.

---

## 1. Unconfirmed rows on existing sections (→ human decision)

| Row | Verdict | Why not applied | Next step |
|---|---|---|---|
| **1.2** r3 *Lost CSRF token* | UNGROUNDED | The named mechanism could not be placed: the payment path is a SPA issuing GraphQL mutations over a bearer token, with no antiforgery token in the graphql link config. But there is no positive evidence a form CSRF token is *absent* either, so §0's bar is unmet and RETIRE would be wrong. | A hypothesis worth recording, **not** confirmed: the modern analogue on this stack is the processor-hosted iframe's own tokenization session expiring while the shopper types. Substituting that for the token the row names is an interpretive stretch. |
| **5.1** r2, r3 · **5.2** r1–r3 | UNGROUNDED (5 rows) | **Structural, and it generalizes.** These are fraud-scoring observations about the *absence of a control*: impossible-travel, VPN/proxy, off-hours, card-testing velocity. A repo search across `org:VirtoCommerce` returns **zero** fraud/risk/velocity/geo repositories, and the platform records no login IP or geo. The docs waiver covers docs only — §1a still requires source **and** live to agree, and the source axis is unsatisfiable *by construction*. | These may not belong in the ECL at all. Precedent: `BL-PERF`/`BL-COMPAT`/`BL-API` were EXCLUDED and their citations **moved** to `performance-thresholds.md` / `browser-quirks.md`. A fraud-heuristics reference would be the analogous home. Human call — exclusion moves citations, it never destroys them. |
| **5.3** r4 *Rapid category browsing / bot scraping* | UNGROUNDED | Same structural reason as above. | ditto |
| **6.1** r3 *Return not credited to inventory* | UNGROUNDED | Source is suggestive but not confirming: the inventory release path is **reservation-scoped** — it restores only against a stored `Reserve` transaction for that outer id, so it cannot serve a return. No return surface was reachable without mutating order state. | One follow-up with an admin lane closes it; the Return module is present and populated (see §4). |
| **6.4** r3 *Oversized file, no pre-upload guard* | UNGROUNDED | Source **contradicts** it for the storefront uploader (a pre-upload size guard exists), but the row's named surfaces are the admin catalog CSV import and asset upload, which were unreachable — no admin identity on that lane, and the only storefront file-picker is quote attachments, which this org has none of. | One follow-up run with an admin lane. |
| **7.2** r1 *Paste triggers validation twice* | UNGROUNDED, deliberately not DRIFT | No code path: the UI-kit input has no `@paste` handler and the form library validates on a single model update. But absence of a mechanism is not evidence the pattern never occurred. | Per the library's own rule `[OBSERVED]` means "confirmed on your platform", so an unsupportable marker is a **status question for a human**, not an auto-apply. |
| **7.4** r3 *Cross-browser divergence on mobile* | UNGROUNDED, structurally | A single-engine lane cannot observe engine divergence, and WebKit is unsupported on this harness **at all** — which is precisely why the row exists. | Recommend marking it as covered by manual/device-cloud verification, rather than leaving it looking unaudited. |
| **14.5** r2 *`VirtoFrontend_UI_Layout` drives the picker* | UNGROUNDED | Zero evidence on all three axes; the property name has no docs mention and no source anchor, and both PDPs observed rendered the B2C picker. A property-name-specific claim with no citation is the shape that rots silently. | Search `vc-frontend` for the property name. If absent, this is a **RETIRE with positive evidence** — which §0 permits and non-reproduction does not. |
| **14.5** r4 *Out-of-stock combination leaves Add-to-Cart enabled* | **CONTRADICTORY** | Docs contradict it twice (unavailable combinations are *visibly disabled*; an out-of-stock variation swaps in a back-in-stock control). But the row's subject (**out of stock** — a variant that exists at zero) is not the docs' subject (**unavailable** — a variant that does not exist), and the live state was not reached. Applying either reading would guess. | One fixture: seed or locate an out-of-stock variant **combination**, then decide DRIFT vs RETIRE. |
| **14.5** r6 *Bulk mixed-type Saved-for-Later* | UNGROUNDED + a citation-scope defect | Live not reached. Separately: the row cites `BL-CART-015` as its anchor, but that invariant's own amendment note reads *"scoped to single-item move, bulk not independently verified"* — it cites an invariant that explicitly disclaims the row's exact scope. | Two independent fixes: seed the fixture; and either widen `BL-CART-015` (a **`bl`** item) or stop citing it here. |
| **4.3** r3 *Weak recovery questions* | CONFIRMED-by-default, RETIRE **declined** | The platform ships no recovery-question mechanism — recovery is email-link only. That is close to a retire argument, but §0's bar is *structurally impossible*, and a client module could add one. | Left alone deliberately; flagged for a human. |
| **4.3** r4 *OTP reuse* | CONFIRMED-by-default, marker questioned | No OTP/passwordless sign-in flow exists in the storefront page set; the nearest one-time artifacts are password-reset and invitation tokens. The `[OBSERVED]` marker could not be reconciled with any surface. | Someone who knows the row's provenance should say which token it meant. Reported, **not** retired. |
| **14.3** r5 `Frequency = "High (false bug)"` | Category error, reported not edited | Measured: it **does** resolve — the parser takes the leading `High` and it supplies 14.3's whole `+20` frequency, with no `unresolved`. Two problems: that extraction is the "guessed from its first token" behaviour §9 forbids; and the `High` measures the frequency of **false bug reports** (already in the Impact cell), i.e. reporter noise, not product exposure. | Human call: decide what this row's product-exposure frequency actually is — the condition is by-design and permanent, so "frequency" may be the wrong axis for it — then fix cell and parser together. |

---

## 2. MISSING candidates — all HELD, and the reason is the same one every time

Six candidates have real evidence and **none was written**, because business value is `unknown` and
`unknown` never promotes. That is the gate working as designed: **declaring what a violation costs is the
price of entry.** Each is recorded with the invariant that would unlock it.

| Candidate | Would sit at | Endangers | Value |
|---|---|---|---|
| Storefront declares a per-module minimum version, and its guard degrades to a log warning | §14.8 | nothing declared — every 14.8 `BL Invariant` cell reads `— (gap)` | unknown · medium → **undeclared** |
| Order editing is a details editor with **no server-side validation**, so "preservation" is a client-side property of the blade | §14.10 | `BL-ORD-003` `[P1-data]` | medium · high → **qualified** — but held by the **truth** gate, not value: the live axis was absent (read-only run, no order mutated) |
| Analytics / dataLayer event-integrity | new **§11.2** (next free id, no renumbering) | `BL-GA4-001`/`-004` — which **do not exist** (0 matches) | unknown · would be high → **undeclared** |
| Resetting filters does not restore the default control state (reset lands availability on `false`; a first visit defaults to `true`) | §3.2 | `BL-SRCH-001`/`-002` | unknown → **undeclared**; may also be deliberate ("clear everything") |
| External identity-provider account collision / linking (Entra ID + Google render beside the local form) | ch. 4 | `BL-AUTH-002` — a federated sign-in matching an unverified local account can bypass the local gate | unknown → **undeclared** |
| Password expiry forcing a reset at sign-in (`MaxPasswordAge: 90`, a `PASSWORD_EXPIRED` branch, documented) | ch. 4 | nothing — no invariant governs expiry | unknown → **undeclared** |

Wrong axis, not held: **per-validator fault isolation in a shared cart-validator extension point** (§14.9 rows
1 and 3 both carry `— (gap)`, making that section's two most architecturally significant rows unrankable). The
missing thing is a **normative invariant**, so it is a `bl` axis MISSING candidate.

---

## 3. Routed to `/qa-review-tests` Dimension 6 — ~180 semantically wrong citations

Every one of these **resolves**, so `ecl:lint` passes it (the §8 limitation, by design). This audit edited no CSV.
Beyond traceability, this distorts §9's product-value axis, so it corrupts the audit queue too.

| Section | Citations | What is actually citing it | Likely home |
|---|---|---|---|
| **9.1** Fake & Manipulated Reviews | **87** | payment-card negatives (`PAY-CS-004..007`), search-index status + rebuild (`BSM-022/048/095`), price-histogram BVA + sortings (`CAT-GQL-117/118/128`) | various — essentially none is about reviews |
| **5.1** Rapid & Repetitive Actions | **70** | 20 admin delete/clone/duplicate rows, plus the whole `SEC-INPUT-001..004` / `SEC-VALIDATION-*` / `AUTH-066/068` / `CHK-029` injection-and-validation cluster | **7.2** (form input) · **10.3** (destructive admin confirmation) |
| **7.1** Browser & Device Issues | **382** (vs 7.4's **13**) | a material share are mobile-layout cases; 7.1 r1's subject *is* 7.4 r1's | **7.4** |
| **8.1** Product Information Problems | **71** | dynamic-property value-type validation (`PLAT-048/051/054/057/071/072`), notification attachment, Cyrillic display | needs a generic "field/content correctness" section |
| **14.3** B2B Organization Context | **33** | GA4 event emission (`GA-001` login, `GA-002` `view_item_list`, `GA-003` `view_item`) | **11.1** for the conversion subset; the rest needs §11.2 (§2) |
| **14.1** GraphQL xAPI Error Patterns | **43** | security-verification **form** cases (form rendered, cancel redirects, wrong password inline error) | re-judge the cluster; some may be legitimate |
| **12.1** / **12.2** | **9 of 12.1's 18** | one *performance* suite — pickup-modal render, search/filter latency, memory growth, scroll | **10.1** |
| **3.2** Filter & Sort | **130** | shipping-address country→state→city cascade (`SA-003..005`), quotes date-range filter, order/profile/sales-rep list filters | needs a generic non-catalog "list filter / sort / pagination" section — `QUOTE-032` is arguably a *correct* use of r4 |
| **5.2** Geographic & Temporal | **2 — both wrong** | price-list entry CRUD (`BSM-036`, `BSM-079`) | **14.4**. Its genuine demand is **zero**. |
| **9.2**, **5.3**, **4.2**, **13.1** | minor strays | price-range intersection; `BSM-043` rounding rules + `CFG-FILE-ST-*`; loyalty ProductPoints + sales-rep suites; review-permission 403s (`REV-ADM-009..011`) | per-case |

Two calls made deliberately: `045-accessibility-tests.csv` `A11Y-SR-002` cites `BL-A11Y-002` for structural
list semantics (WCAG 1.3.1), which that invariant does not cover — **leave the citation** until a
`BL-A11Y-005` exists, it is the closest home. And `4.2`'s `CUST-103/106/110` cite it for **org-scoped**
membership lockout, which `BL-AUTH-003`'s own Scope note says is a distinct mechanism governed by
`BL-AUTH-012`/`-013`.

---

## 4. Routed to the `bl` axis

1. **`BL-SEC-*` does not exist** (0 headings) yet carries **26 citations** — `BL-SEC-001`×7, `-002`×3, `-003`×8, `-004`×6, `-005`×2, from `044-security-tests.csv` and `011-checkout-flow.csv`.
2. **`BL-GA4-*` does not exist**, cited by 33 cases in `043-google-analytics.csv`. Blocks §11.2 above.
3. **`BL-UI-004` contradicts itself inside one entry** — its Rule transcribes the same incomplete `375 / 768 / 1024 / 1280 / 1920` list this audit amended out of ECL-1.6, while its own Verify step correctly points at the derived sweep.
4. **6 `BL-UI-*` entries claim `Suite coverage: NONE — suite removed 2026-07-25`**, but `048c-layout-stability.csv` exists and carries 24 cases citing exactly those invariants.
5. **Gaps with no covering invariant:** loyalty-balance liability / point validity (all 13 `BL-LOY-*` concern currency scoping, dedup, insufficient-balance and totals shape); a cart warning when a stored line price diverges from the re-evaluated tier price, suppressed at zero; sanctioned-country shipping restriction and customs-duty disclosure (12.2 r1, r3); environment/schema integrity (14.8); accessibility structural semantics (`BL-A11Y-005`).
6. **`BL-CART-015`** scope: widen to bulk, or stop being cited by ECL-14.5 r6.

---

## 5. Test-data note (→ `test-data-engineer`)

`test-data/aliases.json` is **stale where the CSV was corrected**. `COUPON_LC_CASEFIDELITY._notes` and
`changelog_1_5_33` both assert `ValidateCoupon` is case-**sensitive** and that uppercasing yields "not valid";
`COUPON_SUPER._notes` says the same while its own next clause describes a case-**insensitive** collision. The
owning case `CPN-062` was corrected on 2026-07-21 and carries an explicit `MECHANISM CORRECTION` stating
validation is case-**insensitive** — live-reconfirmed this run. `td:validate:marketing` cannot catch this: the
staleness is in the notes' *inference*, not in the data shape. **`CPN-062` itself is not vacuous** — its guard
is display/clipboard fidelity, which remains falsifiable.

---

## 6. Two tooling defects — **BOTH FIXED 2026-08-27**

1. ~~**Business value unreachable for 45 of 54 sections.**~~ `eclBusinessValue` read only the `BL Invariant` column, which exists in chapter 14 alone, while **Appendix D already declared a real invariant for 34 of the rest**. Demonstrated by correcting Appendix D's 15.1 row to `BL-A11Y-001/002/004` and watching its label not move. **Fixed:** `parseLibrary` now returns `appendixBlRefs` and `eclBusinessValue` falls back to it when a section's own rows declare none. Two guards came with it — refs are read from the Appendix D row's **last cell only** (`ECL-14.9`'s BL cell also names `ECL-10.2`, which must not inherit `BL-LOY-008`), and an **em-dash cell declares nothing** even when its parenthetical names an invariant the section merely *overlaps*, because declining to declare is itself a claim.
2. ~~**A fenced template row counts as real.**~~ Appendix A's code-fenced placeholder was attributed to the preceding section — 13.3 scored 4 rows and 4/4 `[OBSERVED]` for its 3. **Fixed:** `parseLibrary` tracks fences and skips their contents.

**Measured effect:** `unresolved` 1 → **0**; §13.3 now reads 3/3 rows; §15.1 moved `undeclared` → `qualified` via `BL-A11Y-001 (P1-data) (via Appendix D)`. Distribution **7 high · 2 qualified · 45 undeclared → 23 high · 14 qualified · 5 low · 12 undeclared**, promotable **9 → 37**. The 12 that remain `undeclared` are exactly the 12 Appendix D rows whose BL cell opens with an em dash — genuine declaration gaps, and the right target for §4's `bl_proposals` work. 4 new unit tests; full suite 1938 pass.

**Effect on the §2 held candidates — two are now value-cleared, and that changes the next run's scope:**

| Candidate | Before | After the fix |
|---|---|---|
| reset-does-not-restore-default-controls (§3.2) | undeclared → HELD | **`qualified`** — business medium via `BL-SRCH-001` `[P1-data]` (Appendix D), product high (111 cases) |
| external-IdP account collision (§4.3, endangers `BL-AUTH-002`) | undeclared → HELD | **`qualified`** — business medium via `BL-AUTH-002` `[P1-data]` (Appendix D), product high |
| storefront per-module version-contract guard (§14.8) | undeclared → HELD | **still HELD** — 14.8's Appendix D row is `— (gap; VCST-5651)` |
| analytics/dataLayer integrity (new §11.2) | undeclared → HELD | **still HELD** — a new section has no Appendix D row, and `BL-GA4-*` does not exist |
| password-expiry-forces-reset (ch. 4) | undeclared → HELD | **depends on placement** — §4.2 declares `BL-AUTH-003`, §4.1 declares nothing; no invariant governs expiry itself |
| order-editor-has-no-server-validation (§14.10) | `qualified`, held by the **truth** gate | unchanged — its live axis was absent, which value cannot fix |

**Value-cleared is not write-cleared.** Both newly-qualified candidates still need their **MISSING verdict** to clear the three-axis bar in its own right, and each currently rests on a single batch's evidence (§3.2's docs axis was never established). They are now eligible to be written, not owed a write — re-triangulate before adding either.

---

## 7. Outstanding anchors for the next run

| # | Anchor | Unblocks | Cost |
|---|---|---|---|
| 1 | An out-of-stock variant **combination** PDP | 14.5 r4 (DRIFT vs RETIRE) | one fixture |
| 2 | `vc-frontend` search for `VirtoFrontend_UI_Layout` | 14.5 r2 (RETIRE vs keep) | one search |
| 3 | A cart with ≥2 configurable items of different shapes + bulk Saved-for-Later | 14.5 r6 | one seeded cart |
| 4 | An **admin lane** | 6.1 r3, 6.4 r3 | one batch |
| 5 | A multi-org fixture (`@td(MULTI_ORG_TF_BR)`) | 14.3 r4 (confirmed at reachability only; the lane user resolved to a single org) | one fixture |
| 6 | A chrome/edge lane for click-driven detail views | 13.1 per-shipment detail; 3.2 r1's filter→sort sequence | scheduling |

**Source pointers worth adding while touching these:** §14.10 rows 2–3 concern add-product-to-order, which
lives in `vc-module-order-management`, and the section carries no `Source:` note — so it will be re-derived
from scratch every audit. Also: `VirtoCommerce/vc-module-orders` (plural) and `vc-module-x-purchase` both
404; the real repos are **`vc-module-order`** and **`vc-module-x-cart`**, and `CLAUDE.md` /
`.claude/rules/agents.md` name the wrong ones.
