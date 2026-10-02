# Testing checklist — VCST-5944 "[Push Messages] Improve Recipients list UX"

**Path:** FULL · **Flow:** feature-test · **Env:** vcptcore-qa1 (`TEST_ENV=vcptcore_qa1`)
**Build under test:** `VirtoCommerce.PushMessages 3.1006.0-pr-28-1764` (PR #28, OPEN, head `176458e2`) · Platform 3.1071.0 — **superseded, see STATUS at the end**
**Member index provider:** `ElasticAppSearchProvider` — decides C9–C11.
**Model:** `reports/ba/test-models/VCST-5944-2026-09-24.md` (scenario ids S1–S15 referenced below).

Admin: https://vcptcore-qa1.govirto.com → More → Push Messages. Login `admin`; in a browser lane type the
BARE KEY NAME `ADMIN_PASSWORD` into the password field (`--secrets` substitutes it; never a literal).

## A+B. Reviewer renames (Alla Volkova, 17 Sep) and the four modes (S1, S2, S3, S5)

| # | Condition | Expected |
|---|---|---|
| C1 | Label above the person/company picker in **Specific people or companies** mode | literally `Add specific recipients (people or whole companies)` |
| C2 | Same label in **Match by conditions** and **Advanced query** modes | same literal string |
| C3 | Label on the schedule field | literally `Schedule start date (leave empty to send now)` |
| C4 | All four modes present with design labels/sub-labels | Everyone / Specific people or companies / Match by conditions / Advanced query |
| C5 | **Everyone** selected | estimate panel shows headline count + `members matched`, `people in scope`, `extra logins`, caption `Everyone — all registered customers`, buttons `Preview recipients` + `Show generated query` |
| C6 | `Show generated query` in Everyone mode | reveals the stored phrase, which must be `membertype:Contact` |
| C7 | **Specific people or companies** — pick one company | count updates; caption names the selection; `companies expanded` > 0 |
| C8 | **Match by conditions** — `Custom conditions` chip → one row `Customer type` `is` `Contact` | count must equal the Everyone count (both resolve to `membertype:Contact`); `Edit as query` must show that same phrase |

## C. The wildcard operators on THIS provider (S4) — the developer's open decision (a)

| # | Condition | Expected |
|---|---|---|
| C9 | Conditions mode, `Email` + **starts with** + a prefix that demonstrably matches existing contacts (`a`) | the generated `emails:"a*"` returns **0** on this provider. A 0 with no warning is the finding, not a pass |
| C10 | Same with **ends with** (`.com`) and **contains** (`test`) | both 0 on this provider |
| C11 | Is the operator offered with ANY warning, hint, or disabled state? | report literally |

## D. The malformed-query behaviour (S6)

> **Counts drift (seeding ran concurrently) — assert the RELATIONSHIP.** A malformed phrase returns the
> *match-all* figure, strictly larger than deliberate-everyone and identical across inputs: `emails:"a` · `(((` ·
> `*:*` all → 136 / 240 / 63, byte-identical (same empty filter set); `membertype:Contact` → 129 / 173 / 0. Text that
> merely tokenises behaves normally (`hello world` → 2), so the trigger is anything the lexer cannot tokenise.

| # | Condition | Expected |
|---|---|---|
| C12 | Well-formed phrase `membertype:Contact` | hint reads `Query is valid — <deliberate count> recipients.` |
| C13 | Unparseable phrase — unbalanced quote `emails:"a` | must NOT silently widen the audience to everybody. Record the count and the hint wording |
| C14 | Unknown field `junkfield:xyz` | resolves to 0. Record whether the UI still claims the query is valid |
| C15 | Does the "valid" hint ever say *invalid*? | **Source fact:** it renders on `v-if="rawQuery"` alone — no validity check exists. Confirm live in both directions |

## E. Preview arithmetic reconciles (S8)

| # | Condition | Expected |
|---|---|---|
| C16 | Everyone mode breakdown | `people in scope` + `extra logins` = headline count |
| C17 | `Preview recipients` lists actual people | the multi-login contact **Elena Kutasina** (`memberId 46e9d6fb-67aa-4a8b-a5ca-92dd1f0c8587`) appears **twice**, once per login (`-kutasina-elena`, `kutasina.elena+user4@gmail.com`) — this is the one member on this env that makes `extra logins` falsifiable |
| C18 | Contacts holding **no** login | never appear as recipients; every returned row carries a non-null `userId` |
| C19 | Organization query `membertype:Organization` | expansion arithmetic internally consistent: `people in scope` + `extra logins` = total |

## F. Recursive company expansion (S2) — needs the seeded fixture

> **Fixture SEEDED + verified** (`npm run seed:push-audience`). Aliases `PUSH_AUDIENCE_PARENT_ORG` ·
> `_CHILD_ORG` · `_PARENT_CONTACT` · `_CHILD_CONTACT_1/2` · `_CHILD_CONTACT_NOLOGIN` · `_EMPLOYEE` —
> reference by `@td(ALIAS.id)`. Teardown `npm run seed:push-audience:teardown`.

| # | Condition | Expected |
|---|---|---|
| C20 | Pick the seeded **parent** org in list mode | **3** recipients — the fixture is built so the wrong answers differ: non-recursive → **1**, login-blind → **4**. API-measured (3 identical runs): `totalCount 3`, `companiesExpanded 2`, `peopleFromCompanies 5`, `peopleInScope 3` |
| C21 | Pick the seeded **child** org | **2** recipients: `companiesExpanded 1`, `peopleInScope 2` |
| C22 | ~~If the fixture did not seed~~ | **Resolved — no GAP** |

## G. Persistence and reopen (S9, S10, S11) — governed by `BL-NOTIF-004`

> **`BL-NOTIF-004`** — a success toast, auto-closing blade or refreshed `Modified` column may NOT stand in
> for a change existing only in client memory. For every item: re-read via the REST API and assert the
> changed `memberQuery`/`memberIds` **and** an advanced `modifiedDate`, plus an actually-issued request.

| # | Condition | Expected |
|---|---|---|
| C23 | Save a message built in **Everyone** mode, reopen it | reopens in **Everyone**, not as a raw query |
| C24 | Save one built in **Match by conditions** (2 rows, ALL), reopen | reopens as **condition rows**, same fields/operators/values, same ALL/ANY |
| C25 | Save one built in **Advanced query** with a phrase the builder cannot represent (e.g. containing parentheses `(membertype:Contact)`), reopen | reopens in **Advanced query**, phrase intact, not silently reinterpreted |
| C26 | Save one in **list** mode, reopen | reopens in **Specific people or companies** with the same picks |
| C27 | **conditions + list combined** (S7) — conditions AND a picked person | the two sets **UNION**, they do not replace each other; `Show generated query` states the phrase plus the explicitly selected count |

## H. The central claim — preview equals delivered (S12) — **P0**

| # | Condition | Expected |
|---|---|---|
| C28 | Build a small, precisely-known audience (use the seeded child org, or one picked person). Note the previewed count. **Send.** | the number of recipient rows written equals the previewed number, exactly |
| C29 | Verify via `POST /api/push-message/search-recipients` for that message id | row count == previewed count |
| C30 | Cross-check one recipient in the storefront inbox | the message is present for that user |
| C31 | Use a **fresh draft** for every send | a sent message is terminal; reusing one makes the case pass once and never again |

## I. Boundary and scope (S13, S14, S1)

| # | Condition | Expected |
|---|---|---|
| C32 | **Everyone** vs `PUSH_AUDIENCE_EMPLOYEE` (seeded, login verified via `/connect/token` → 200) | the employee is **excluded** by `membertype:Contact` despite the label "All registered customers" — declared decision (b). API-measured: `membertype:Employee` → `totalCount 1`, `peopleInScope 1`; the employee is absent from all `membertype:Contact` rows. Record whether any UI text discloses it |
| C33 | A phrase longer than 1024 chars | the textarea's own `maxlength="1024"` caps typing, so the `This audience is too long to store…` guard is effectively unreachable from the UI. Via the API: ≤1024 → 200 stored verbatim; **>1024 → HTTP 500 leaking `String or binary data would be truncated in table '…dbo.PushMessage', column 'MemberQuery'`**. There is **no** silent truncation |
| C34 | An incomplete condition row (field + operator, no value) | `Pick a field and an operator for every condition.` / `Enter a value`, and the row must not silently drop out of the phrase while the count shows a wider audience |

## J. Reverse edge (S15) and the additions made after the context analysis

| # | Condition | Expected |
|---|---|---|
| C35 | After sending, narrow the audience and re-save | already-created recipient rows are **not** revoked (no revocation path exists in the product — confirm and report, do not file as a bug unless the product claims otherwise) |
| C36 | Re-saving a sent message | does not duplicate recipients |
| C40 | The **"Email domain"** starter chip in conditions mode | it seeds `emails` + **endsWith** + (empty) — i.e. the advertised one-click happy path is built on one of the three operators that resolve to 0 on this provider. Fill a domain that demonstrably matches existing contacts (`gmail.com`, `yopmail.com`) and record the count. A 0 here is the wildcard problem hitting the most discoverable path, not an edge case |
| C41 | `membersMatched` vs a direct member search | `preview-recipients {memberQuery:"membertype:Contact"}` → `membersMatched` **169**; `POST /api/members/search {keyword:"membertype:Contact", deepSearch:true}` → **170**. Reproduced twice. Distinguish (a) a pagination fencepost in the shared batch walk — which would mean real sends drop members at page boundaries — from (b) a duplicate row the audience service correctly collapses. Symptom-only is an acceptable report; a guess is not |

## K. Always-on (not a ceiling)

| # | Condition | Expected |
|---|---|---|
| C37 | Console during the whole walk | no NEW JS errors from the push-messages bundle. Known pre-existing noise: 401 `WidgetColorMarkers`, 404 `algolia_search/logo.svg`, 404 `reports/logo.svg`, and a module-specific `[tiptap warn] Duplicate extension names found: ['link','underline']` |
| C38 | Network | no 4xx/5xx from `/api/push-message/*`; note any request > 2 s |
| C39 | Accessibility + design conformance | covered by the separate visual lane (`ui-ux-expert`) against the three ticket mockups |

---

# RESULTS — executed 2026-09-24

**33 PASS · 5 FAIL · C22 n/a (fixture present) · C39 covered by the visual lane** · AC-coverage 40/40 = **100%** · DoD: none declared → `null`.

| Group | Outcome |
|---|---|
| A · renames C1–C3 | **PASS** — all three of Alla's renames shipped, verified as literal on-screen strings |
| B · four modes C4–C8 | **PASS** — all four present with design labels; `Show generated query` returns `membertype:Contact` for Everyone; `Edit as query` round-trips with the count unchanged |
| C · wildcards C9–C11, C40 | **FAIL** — `starts with` / `ends with` / `contains` all resolve to **0** on this provider, offered unconditionally with no warning or disabled state. The `Email domain` starter chip is built on `endsWith` and returns 0 for a domain with ~30+ matching contacts |
| D · malformed query C12–C15 | **FAIL, re-attributed 2026-09-28.** `emails:"a` → *"Query is valid — 136 recipients"* vs 129 for a deliberate `membertype:Contact`. The hint never says invalid. **But the match-all collapse is PRE-EXISTING** — vcst-qa (3.1005.0, ES8) gives 1321 vs 1104 on the same inputs. Only the unconditional affirmation is new; the old build had no preview endpoint at all (405) |
| E · arithmetic C16–C19 | **PASS** except **C17 FAIL** — the arithmetic is correct (`128 + 1 = 129`; org path `62 + 1 = 63`) and the multi-login contact genuinely yields 2 rows, but the UI cannot show it (rows sit at indices 95/96, past the 50-row cut) |
| F · recursive expansion C20–C22 | **PASS** — parent org → exactly **3**, the correct one of three distinct outcomes (1 = non-recursive, 4 = login-blind). Child org → 2. `Child Nologin` correctly absent |
| G · persistence C23–C27 | **PASS** — all four modes reopen in the mode that produced them; every Save verified per `BL-NOTIF-004` by fresh `GET` + observed request, never by a toast. C27 union holds; its **caption** is defective (see BUG-C) |
| H · preview == delivered C28–C31 | **PASS — the ticket's central claim holds.** Proven twice on two audience shapes, row-by-row via `search-recipients`, plus a real storefront inbox confirmation as John Mitchell |
| I · boundary C32–C34 | **C32** behaviour confirmed (declared decision (b), no UI disclosure) · **C33 — the reported silent truncation DID NOT REPRODUCE**; ≤1024 stores verbatim, >1024 returns HTTP 500 with a raw SQL error (API-only; the UI caps input at 1024) · **C34 FAIL** — incomplete row silently dropped, count shows the WIDER audience |
| J · reverse edge C35–C36 | **PASS** — a sent message is read-only and re-save is refused; no revocation path exists and none is claimed |
| K · always-on C37–C38 | **C37 PASS** (no unrelated new JS errors; 8 of 10 console errors trace to BUG-D) · **C38 FAIL** — two HTTP 500s from the new endpoint |

## Regression scope exclusions (stated, because a blank reads as a pass)
Suites 068 (22) and 050l (18) are the only push-message suites; `tc:scope` scanned all 40 rows, **0 at risk**. None
asserts recipient count, audience resolution or who receives a message, so **no existing case covered this change**
and C1–C41 are the entire evidence base. No cross-suite sweep ran (removed 2026-09-10) — `feature_release_gate: not-assessed`.

## Environment residue
Three **sent** messages cannot be deleted (*"Cannot modify or delete messages with status Sent"*) and remain on
vcptcore-qa1: `AGENT-TEST-5944-C27`, `-C28b`, `-C33` — DB-level cleanup if that matters. Seeded fixtures left in place;
teardown `TEST_ENV=vcptcore_qa1 npm run seed:push-audience:teardown`.

---

## STATUS 2026-10-01 — read before acting on anything above

The run above ran on `-pr-28-1764` and is **superseded**. All five findings reported to the ticket were fixed and
re-verified on `-pr-28-21fe`; the loading blur and the "Also" label were confirmed fixed by measurement on `-pr-28-8de4`.
The **C-group FAIL is provider-conditional, not a product defect** — switching the stand to `ElasticSearch8Provider`
(2026-09-30) took `starts with` / `ends with` / `contains` from 0 to 15 / 18 / 15, and the six-OR-clause 500 to 200.
Three body claims were re-attributed on 2026-09-28: the 500 is **clause count, not length**; the malformed-phrase
match-all is **pre-existing**; the 1024 **truncation did not reproduce** (>1024 returns HTTP 500 leaking the SQL column).
This run MISSED the `peopleFromCompanies` inflation — a nested company counted as a person — found by the developer.

**`summary.json` is authoritative** for the verdict, the open findings and the full re-verification record; this file is
the executed condition list. Jira comment 110794 is STALE — it calls the wildcard operators non-functional, which the
ES8 switch made untrue.
