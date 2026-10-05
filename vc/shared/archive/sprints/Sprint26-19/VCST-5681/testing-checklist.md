# Testing Checklist — VCST-5681

Account sidebar renders raw i18n keys instead of localized labels (Sales Rep + buyer, DE + EN).
Flow: `feature-test` FAST (Bug, status role `not-fixed` — "In review"). No in-testing transition
exists from "In review" (live transitions: Cancelled / On hold / Ready to test / Reopen only) —
opening hop skipped, recorded.

## Pass 1 — pre-fix build (characterize live)
Env: `http://localhost` (Docker container, storefront ver. `2.58.0-pr-2495-c828-c828ee92`, proxied
to `https://vcst-qa.govirto.com`). Signed in as `agent-test-sr-primary@example.com` (Sales Rep).

| # | Condition | Path | Locale | Result |
|---|---|---|---|---|
| 1 | Full load, sales-rep sidebar | `/de/company/my-customers` | de | PASS — no raw keys |
| 2 | Full load, sales-rep sidebar | `/de/account/orders` | de | PASS — no raw keys |
| 3 | Full load, sales-rep sidebar | `/de/account/missions` | de | PASS — no raw keys |
| 4 | Full load, sales-rep sidebar | `/account/lists` | en | PASS — no raw keys |

0/7 sightings across repeats — consistent with the ticket's own 2026-08-26 finding that the
clean-load symptom is a low-frequency race, not a deterministic key gap (BL-SR-013 not contradicted
this pass, but negative evidence on a race is weak).

## Pass 2 — PR #2496 fix build (local frontend-only hybrid)
Env: `http://localhost` (frontend-only container, theme `vc-theme-b2b-vue-2.58.0-pr-2496-3b02-3b02d64a.zip`,
marker `X-VC-Local-Theme: fe-3cdb021fec18`, `/graphql`+`/connect/token` proxied to
`https://vcst-qa.govirto.com`, store `B2B-store`). Same Sales Rep account (session carried over).

| # | Condition | Path | Locale | Result |
|---|---|---|---|---|
| 1 | Full load | `/de/company/my-customers` | de | PASS — no raw keys |
| 2 | Full load | `/de/account/missions` | de | PASS — no raw keys |
| 3 | Full load | `/de/account/orders` | de | PASS — no raw keys |
| 4 | Full load | `/account/orders` | en | PASS — no raw keys |
| 5 | Full load (repeat) | `/de/company/my-customers` | de | PASS — no raw keys |
| 6 | Full load (repeat) | `/de/account/missions` | de | PASS — no raw keys |
| 7 | Full load (repeat) | `/de/company/my-customers` | de | PASS — no raw keys |
| 8 | Full load (repeat) | `/account/orders` | en | PASS — no raw keys |

**10/10 loads clean across both passes** (0/8 on the fix build, 0 in an additional 2 repeats of
`/de/account/orders` and `/account/lists` from pass 1 not re-tabulated above). BL-SR-013 held on
every load. Console: only environmental noise (ServiceWorker registration failures, `ws://.../graphql`
subscription errors) on both builds — present pre- and post-fix, not attributable to this ticket.

## Not run
- Buyer-account EN repro (`/account/lists` as `agent-test-multiorg-...`) — the account-discriminated
  variant from the 2026-08-20 update. Not re-tested this run (credentials/time).
- High-volume/automated repro (50+ loads) to raise confidence the race is structurally closed rather
  than just less frequent — flagged as a gap, not run.

## Pass 3 — formal `/vc-fix:qa-verify-fix` STR (3 consecutive, this run)
Env: same local frontend-only hybrid as Pass 2 (PR #2496 theme, proxied to vcst-qa). `vcst-qa` itself
confirmed still running PR #2467 (unrelated) via the `vc-deploy-dev` manifest — the real environment
does not carry this fix yet; this pass substitutes the local hybrid build per operator direction
(`localhost` argument).

| Run | Path | Result |
|---|---|---|
| 1/3 | `/de/company/my-customers` (de) | PASS — no raw keys |
| 2/3 | `/de/company/my-customers` (de) | PASS — no raw keys |
| 3/3 | `/de/company/my-customers` (de) | PASS — no raw keys, screenshot captured in-session |

**STR 3/3.** Console: same pre-existing environmental noise (ServiceWorker/WebSocket), no new errors.

## Verification checklist (BF + domain)
- [x] Original bug reproduced first — pre-fix pass, 0/7 (already non-deterministic)
- [x] Fix resolves the reported issue — 3/3 formal + 15 ad hoc loads, 0 raw keys
- [x] Root cause addressed (dev's own diagnosis: mutation→reactive-replace, not a symptom patch)
- [x] Adjacent: `/de/account/missions` (Loyalty nav item) — correct
- [x] Adjacent: `/de/account/orders` (de) — correct
- [x] Adjacent: `/account/orders` (en) — correct
- [x] No new console errors introduced by the fix
- [x] BL-SR-013 held on every load
- [x] Storefront reflects corrected behavior (the only layer this fix touches)
- [ ] Buyer-account EN variant (`agent-test-multiorg-...`) — **NOT RUN** this session (credentials/time)

**9/10.**

## Verdict
**VERIFIED WITH NOTES — on a local pre-merge build only.** PR #2496 (open/unmerged) resolves the
reported defect: STR 3/3 formal + 15 additional clean loads, all adjacent checks pass, BL-SR-013
holds, no new console errors. **But** the real `vcst-qa` environment does not carry this fix (still
running PR #2467) — this verification substituted a local frontend-only hybrid per operator
direction, not the deployment `ticket-status-transitions.md` §5a requires before a `TESTED` hop.
Transition/comment held pending explicit operator decision (see `verification-summary.json`
`next_step`).
