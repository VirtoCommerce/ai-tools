# Triage — VCST-5904 · vcst · 2026-10-22 (ticket mode, `--min-severity P2`)

Source: `testing-checklist.md` (C-1…C-72) · packet `.vc-fix/vc-test/VCST-5904/triage/packet.json` · verdicts
`.vc-fix/vc-test/VCST-5904/triage/verdicts-FAIL.md`, `verdicts-BLOCKED.md`

**Failures 21** (FAIL 9 · BLOCKED 12) · **real bugs 1** · **test-defects 5** · **dismissed 11** · **below floor 4**
(unresulted: 0)

## 1. Confirmed real bugs

| Case | Severity | Repo | Root cause | Investigation package |
|---|---|---|---|---|
| C-69 (VIS-1) | Medium (P2) | vc-frontend | OTP code cells use `border-neutral-300`: 1.48:1 light / 1.88:1 dark, under WCAG 1.4.11's 3:1; the cell border is the only cue (the input is transparent) — `client-app/shared/sign-in/components/sign-in-code-input.vue:148` @ 2fc9261a (new in #2570). neutral-400 still fails in light (VCST-6460); neutral-500 passes both | `investigations/C-69/` (evidence-index.md, root-cause.md) |

## 2. Test-case fixes (recommended, none applied — no `--fix`)

| Case | Class | Fix |
|---|---|---|
| C-33 | ASSERTION_DEFECT | Row expected pre-feature parity citing VCST-6353 (unrelated AC); #3133 documents the challenge before the token validators, so `two_factor_required` + code email with no `storeId` is specified. Re-word to the documented order. **Open PO question:** is emailing a code to a store-refused customer acceptable? (`ac-checks/C-33.json`) |
| C-66 (EXP-2) | ASSERTION_DEFECT | Same order (S-19, model #10) — a recorded door, not FAIL |
| C-72 (VIS-4) | ASSERTION_DEFECT | Two stills cannot show timing — needs a motion capture, not a FAIL |
| C-36 | TEST_DATA_DEFECT | No external IdP account on vcst; source note `ExternalSignInService.cs:75` (`bypassTwoFactor: true`) |
| C-49 | TEST_DATA_DEFECT | `lockoutEnabled=false` is a protected field (KB-87EC0A28) — needs a DB-seeded user or `AllowUpdateProtectedUserFields` for one run |

## 3. Dismissed

| Case | Class | Reason |
|---|---|---|
| C-65 (EXP-1) | KNOWN_ISSUE | OTP `user_not_found` / `store_not_found` only with PasswordLogin DetailedErrors on (on for vcst, C-8); generic when off (KB-9AF5645D); pre-existing OTP behaviour |
| C-5, C-6 | ENV | Backoffice code screen needs global MFA on in a browser lane; the strategy's one window is REST-only (guard rule 3). Plan gap: these rows can never run under this plan |
| C-15…C-20, C-54 | ENV | Shared B2B-store `StoreMode` write refused by the session's permission system; own store AGENT-TEST-MFA5904 has no storefront url |
| C-56 | ENV | Shared B2B-store `OtpSignIn.Enabled` write refused (same) |

## 4. Below floor (not investigated, not drafted)

| Case | Severity | Root cause | Evidence |
|---|---|---|---|
| C-67 (EXP-3) | P3 | Password step ignores the 30 s resend interval (per-instance limiter, P9) | exploratory/SBTM-VCST-5904-2026-10-22.md |
| C-68 (EXP-4) | P3 | Sign-in log top-account click leaves a hidden userName filter | screenshots/exp-signin-log-awaiting.png |
| C-70 (VIS-2) | P3 | Resend / Use a different email 18 px tall (BL-UI-006) | screenshots/vis-otp-code-step-375m.png |
| C-71 (VIS-3) | P3 | Error banner shifts the code boxes 46 px (BL-UI-003) | screenshots/vis-otp-code-filled-375m.png |

No tracker ticket filed, no fix triggered — human decides.
