# WX — exclusive window, Sprint 26-23 (handed over)

Owner: Elena Mutykova. Stand vcst (Platform 3.1101.0). Stopped early — the owner ran out of time; the wave is **not finished**.

## Done
| Run | What | Result |
|---|---|---|
| REG-2026-11-26-1540-WXE | the 28 `[EXCLUSIVE]` cases of 002, 004, 005, 036, 044, 070, 071, 089, 093, 093b (`regression:plan --exclusive`) | 24 PASS, 0 FAIL, 0 BLOCKED, 4 SKIPPED (FWL-001/003/004/009, then `Manual`) |
| REG-2026-11-26-1702-WXM | those 4 FWL cases, flipped `Manual` → `Draft` (all of 070 is `Manual`, 17/18 of 071: a TestRail import) and run live | FWL-001 BLOCKED, FWL-003 FAIL, FWL-009 FAIL, FWL-004 FAIL (step 18 only) |

`release:split` cannot record these runs: it assigns a run to a wave by suite, and these cases sit in suites of other waves. So `cases.json` is empty for WX and the numbers above are from the runs' own results (`suite-<id>-cases.jsonl`). Both runs' store settings were restored (before/after snapshots in the run folders); the WXM fixtures were deleted except the org White Labeling record `6c8aac99-2a1c-480c-a107-f79cada6884a`, which has no REST delete.

## Triage of the WXM run (not in ledger.csv: it only takes rows for WX's own suites, and 070/071 belong to other waves)
| Case | Status | Verdict | Why | Follow-up |
|---|---|---|---|---|
| FWL-001 | BLOCKED | ENV_CONFIG | POST /connect/token 400 login_failed for wl-electronics@virtocommerce.com with TEST_USER_PASSWORD_VCST; account exists, Approved, not locked, password last changed 2026-11-10 so the stored credential is stale. No other credential was tried; no platform state changed | OPEN: a person puts the current WL_USER_ELECTRONICS password into test-accounts.local.json, then re-run (the case enables the ImageTools thumbnail job, which FWL-003's favicon result depends on) |
| FWL-003 | FAIL | TEST_DEFECT | Steps do not match the build: a .ico is rejected by the admin favicon widget (PNG/JPG/WEBP only), the org White Labeling blade is under Contacts > Manage not Customer > Organizations, step 10 Save is disabled. Logo and Coffee theme assertions held (store values reach the org user). Favicon: favicons[] _16x16.._196x196 all 404 because the ImageTools thumbnail job is disabled on vcst, and the storefront has no faviconUrl fallback | PENDING_DECISION: should the storefront fall back to faviconUrl when thumbnails do not exist (xAPI advertises sizes that 404)? Product owner. Rewrite the steps through /qa-test-lifecycle |
| FWL-009 | FAIL | TEST_DEFECT | Step 3 is ambiguous: two store-level switches exist, the blade Enabled toggle (drops only the store's contribution, KB-A23A4A41) and the store setting WhiteLabeling.WhiteLabelingEnabled=false, which does give the default logo/theme/menu and would satisfy the assertions. Company1 does not exist; the run used AGENT-TEST-Electronics Store. WL_ELECTRONICS seeded logo/favicon URLs are relative and 404 on the storefront host (fixture) | OPEN: rewrite step 3 to name the setting; fix the WL_ELECTRONICS seeded asset URLs; re-run |
| FWL-004 | FAIL | PENDING_DECISION | Fails on step 18 only: the org favicon is not shown, all 5 favicons[] thumbnail hrefs 404 and faviconUrl is never requested (KB-D4EEDC37), the same cause as FWL-003. Org logo, theme, main menu and footer are the org's (observed PASS) | The same product question as FWL-003 (favicon fallback / thumbnail job); rewrite the steps through /qa-test-lifecycle |

## Not run — before the next owner continues
- **Suites 098, 104, 107, 109, 111, 114b: 166 cases, about 3.5 h on 3 browser slots, none run.** Plan: `npm run regression:plan -- 098,104,107,109,111,114b --preflight --json --release sprint-26-23 --accept delivery:VCST-6909,delivery:VCST-6910,delivery:VCST-6861`. Re-run `npm run release:delivery -- sprint-26-23 --write` first: vcst-qa changed again (#7168 put PageBuilderModule back in place of SiteBuilder, 2026-11-26 15:06Z).
- 109 PNCR-018 and PNCR-021 read `@td(PUNCHOUT_CONFIG_1.senderDomain)`, which config 1 does not have by design: case defect, they will be recorded BLOCKED.
- 107/109 need `Punchout.Enabled=true` on B2B-store and QA-STORE: set it with `npm run store:set -- --name Punchout.Enabled --value true --store <store>` and restore with `false` afterwards (it was `null` before this wave). It is `false` now.
- 113 (not in this wave) needs `PUNCHOUT_SHARED_SECRET_DEFAULTS_VCST` in `.env.local`; its value is the same vault secret as `PUNCHOUT_SHARED_SECRET_3_VCST`.
- 089 SR-FE-030 is `Deprecated` on a retired persona; ignore it.

## State left on vcst (all intentional, none touches another wave)
- Punchout 3.1001.0 installed and configured (vc-deploy-dev#7167, #7160); Punchout and sales-rep fixtures seeded; mapping `AGENT-TEST-PO-100` created for 107 (owned by the run; delete it when 107 is done).
- Credentials: `SR_REP_PRIMARY` cannot sign in (400 invalid_grant, password changed 2026-11-26 03:09Z by someone else); `WL_USER_ELECTRONICS` stale (FWL-001). Neither was changed by this wave.

## Real bugs
None confirmed. Unconfirmed, from the WXE runners, not filed: mobile search overlay shows the raw key `common.labels.close`; pickup-locations "Load more" shown when all are listed; deactivated pickup locations stay on the storefront until a manual reindex; `/api/files/<id>_sm` 404 on the PDP.

## Case repairs
- 070 FWL-001/003/009 and 071 FWL-004 are `Draft` (commit 9c3d8f49), not promoted. Hand 070/071 to `/qa-test-lifecycle` as a package (64 other `Manual` TestRail rows).
- 005 SRCH-FSORT-002 expects the exact reverse of 001 but equal-priority values sort A-Z both ways; FSORT-003/004/006 steps change the setting in the Admin blade.
