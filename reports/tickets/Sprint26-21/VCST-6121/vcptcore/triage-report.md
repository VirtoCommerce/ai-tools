# Triage — VCST-6121 (ticket mode, PARTIAL) · vcptcore · 2026-10-28
**Sources:** testing-checklist.md (4a), exploratory/SBTM-VCST-6121-2026-10-28.md (3x), design-report.md (4v) · Build: Platform 3.1091.0-pr-3144-e637, Passkeys 3.1000.0-pr-1-a25f (5d36 → a25f mid-run: storefront plugin + locales only)
**Counts:** packet 5 (FAIL 4, BLOCKED 1) + 6 recorded findings + 4 incidentals + 10 a11y · real bugs 10 (P1 1 · P2 1 · P3 8) · test defects 1 · dismissed 2
**PARTIAL:** checklist items 10, 24, 25, 39, 40, 41 have no verdict yet — they take their evidence from C1 run REG-2026-10-28-1519 (in progress) and are triaged in a second pass. The join gate (`unresulted[]`) is recorded, not bypassed.
**Phase 4 (live repro):** not re-run — both Chromium lanes are held by C1; every candidate was reproduced live twice today on this build (3x + 4a). Investigation packages to be built when a lane frees.
`--fix` ignored in ticket mode.

## Confirmed real bugs
| Item | Sev | Prov. | Repo (route confidence) | Root cause | Evidence |
|---|---|---|---|---|---|
| ~~28~~ | **RE-GRADED → BY DESIGN** | — | — | Filed as VCST-6596; developer: a passkey is not a password sign-in, no reset. Confirmed at source: .NET 10 `SignInManager.PasskeySignInAsync` never resets lockout (only password check + 2FA do). BL-AUTH-003 wording is password-sourced → oracle proposal. Open question only: OTP resets on success, passkey does not | KB-CA7DBAD0 disputed (source) |
| 32 | **P2 Medium** | IN-SCOPE | vc-module-x-frontend (DeleteSignInKeyCommandHandler) | xAPI key delete leaves other sessions + refresh valid; REST sibling revokes (VC-AUTH-004). Hinges on author Q3 (conf. LOW) | API only · KB-65F26B96, KB-4E12E506 |
| 30 | P3 Low | PRE-EXISTING | vc-module-profile-experience-api (ProfileAuthorizationHandler) | Impersonated xAPI changePassword not refused; each failure increments the TARGET's counter → operator can lock the customer out. Guard absent since 2024 | screenshots/30-FAIL-impersonated-changepassword-*.png · KB-C6E9866D |
| 35 | P3 Low | IN-SCOPE | vc-platform AngularJS blade / vc-module-passkeys (MED) | Last-key delete enabled, only "400: Bad request"; Admin Shell disables it | screenshots/35-FAIL-angular-last-key-*.png |
| 14b | P3 Low | IN-SCOPE | vc-module-passkeys (passkey-provider) | Stale credential → visible "Login attempt failed" on /sign-in load with no user action | KB-CD356AF4 |
| 19 | P3 Low | IN-SCOPE | vc-module-passkeys / Identity (LOW) | 327 s old assertion accepted (no server challenge TTL) → author question | KB-F71D8D4D |
| 22 | P3 Low | IN-SCOPE | vc-module-passkeys / platform base (MED) | Passkey store refusal logged reason "Unknown" + the user's own store (password logs NotAllowed) | KB-01950023 |
| 7 | P3 Low | IN-SCOPE | vc-module-passkeys (LOW) | Rename never updates modifiedDate; no "Changed" label | checklist 7 |
| 36 | P3 Low | IN-SCOPE | vc-module-admin-shell (MED) | Set password calls validateuserpassword → 403 for a Manager; saves anyway | KB-5B5D8A99 |
| INC-hash | P3 Low (LOW conf.) | PRE-EXISTING / OUT-OF-SCOPE | vc-platform | Admin users API returns passwordHash + securityStamp (security:read) — recommend a separate security triage | REST, value not printed |

## Pending C1 (not yet graded)
Store Passkey OFF still signs in from an already-open page (3x N3; checklist 25 → PKS-016 / PKA-002) — candidate **Medium, IN-SCOPE**, vc-module-passkeys PasskeyGrantTypeHandler (no store-scheme check). Graded after C1.

## Accessibility (BL-A11Y — standalone + related, never fails the verdict; triage.md §7a)
High: B1 Admin Shell login passkey/Google focus ~1.3:1 · C2 AngularJS sign-in-methods icons (no focus indicator, 2.45:1, unlabeled rename input) · A1 storefront primary 2.11:1 (stand theme — PRE-EXISTING, not passkey). Medium: A2 identical "Edit/Delete" names · A3 focus lost to BODY after add/delete · B2 Admin Shell login 4.06:1 · B3 Admin Shell tab order · C1 AngularJS login chrome (PRE-EXISTING). Low: A4, B4. Detail: design-report.md.

## Test-case fixes
| Item | Class | Fix |
|---|---|---|
| 38 | TEST_DATA_DEFECT | no PK_* account holds sign-in-log read — add a Manager role with that permission to the passkey seeder (recommended, not applied) |
| 30 (row wording) | — | expected rests on BL-AUTH-009 (SUSPECT): reword to {SPEC}/{HYPOTHESIS} "impersonated changePassword refused / does not feed the target's counter" |

## Dismissed
| Item | Class | Reason |
|---|---|---|
| 23 | (UX question) | UV-failed registration silent — harness artefact on a virtual authenticator; folded into author questions |
| INC-cookie-login | KNOWN_ISSUE | Customer back-office cookie login — KB-1700428D, pre-existing |
| INC-revoke | KNOWN_ISSUE | revoke/token without client_id — likely harness misuse (KB-7564A9BF partial) |
| INC-409 | needs-review | Admin Shell raw EF 409 toast — no repro captured |

**Severity floor (5-file):** Critical/High/Medium are filed; every P3 above keeps its draft here and is named in the tracker comment's "Not filed (below severity floor)" line.
No tracker ticket filed, no fix triggered — human decides.
