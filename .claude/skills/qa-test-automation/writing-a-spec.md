# Writing a spec — layout, link, data, CLI session (fallback), the one run

Read from `/qa-test-automation` step 4–5. Decisions cited by number (D5–D13): [`docs/superpowers/specs/2026-10-21-suites-reorg-design.md`](../../../docs/superpowers/specs/2026-10-21-suites-reorg-design.md) §4–§8.

## Layout and title (D5, D6)

- A folder named after the **CSV stem**, beside the CSV, **one file per case**: `<CASE-ID>.spec.ts`
  (e.g. `regression/suites/Frontend/cart/028-cart-core.csv` ↔ `028-cart-core/CART-001.spec.ts`).
- **The link is the case ID**: file name = `test()` title prefix = the CSV `ID`. Nothing is written into the
  CSV or the manifest. Title format: `test("<ID>: <Title>", …)` with the row's `Title`. SP-002 fails on a mismatch,
  SP-001 on an ID with no row.
- **One `test()` per file.** A second test in the file is a second case: give it its own row and file.
- The header comment states that the CSV row is the truth for WHAT and a failure is fixed here or reported,
  never by editing the row (copy the three-line header of a pilot).
- Imports: `test`/`expect` from `regression/lib/fixtures.ts` (never from `@playwright/test`), data from
  `regression/lib/data.ts`, cart helpers from `regression/lib/cart.ts`, generated storefront selectors from
  `scripts/lib/storefront-selectors.generated.ts`. Relative paths with a `.js` extension, exactly as the pilots write them.
- Browser: the suite's `preferredBrowser`, else the manifest default (D13). The spec never picks one.

## Preconditions map to fixtures and API setup

| Row says | Spec does |
|---|---|
| `[PRE:SIGNIN_AS:<ROLE>]` | `const page = await signedInAs("<ROLE>")`. Never sign in by hand; sign-in is OTP-first and lives in `save-storage-state.ts` / the fixture |
| `[PRE:RESET_CART]`, seeded cart, other server state | `apiAs(ROLE)` and the helpers in `regression/lib/cart.ts`, **before** the session opens, so the UI reads seeded state |
| An entity asserted by name | `td("@td(ALIAS.field)")` |
| An entity whose ID drifts | `discover` (assert shape, not exact values) |
| A unique input never asserted on | `random` (`AGENT-TEST-` prefix so teardown sweeps it) |
| A URL, store, culture, currency | `env("FRONT_URL")` etc. — non-secret names only; `env()` refuses `PASSWORD`/`SECRET`/`TOKEN`/`API_KEY` |
| Cleanup | `test.afterEach` through API (see `practice.md` §Cleanup through API) |

A precondition the seed should have provided and did not is a **plain `Error`** (BLOCKED, D8), not an
`expect` (FAIL): the seed is not the product under test. Pilot example: `CART-006.spec.ts`, the line-count guard.

Never combine the plain `page` fixture with `signedInAs` in one test: both write `session.har`. Use one.
Fixture states that other things can move (auto-enrolment, expiry, pooled state) are created in the case, not
seeded: [`../../rules/test-data.md`](../../rules/test-data.md) FIFTH RULE, DISPOSABLE FIXTURES rules.

## From a CLI session to a spec

The fallback only (D18): used when a spec cannot be written from source and the generated selectors.
`@playwright/cli` is pinned in `package.json`; it drives the browser of a paused test, so it never types a
password or picks an account itself.

1. **Write the spec's skeleton first** — title, fixtures (`signedInAs` / `apiAs`), the data it needs through
   `data.ts`, and the steps you already know — then pause it **in the background**:
   `PLAYWRIGHT_HTML_OPEN=never npm run specs:debug -- -g "<CASE-ID>:"`. Wait for "Debugging Instructions" and
   the `tw-XXXX` session name. It opens a headed browser, so it runs on a desktop, not in CI or a cloud session.
2. **Attach and walk the row's Steps:** `npx playwright-cli attach tw-XXXX`, then `snapshot` (find refs),
   `click e7`, `fill e3 …`, `requests`, `console`. Each action prints the Playwright line it ran; that line is the
   draft. Never `fill` a password or a token — sign-in is the fixture's.
3. **The CSV row is the plan, the live app is not the authority.** A step that names something the page does
   not have, or an expectation the page does not meet, is a finding: report the row as stale or the behaviour
   as a bug (D7, [`../../knowledge/execution/cases-that-catch-bugs.md`](../../knowledge/execution/cases-that-catch-bugs.md)).
   Never edit the row, or soften an `expect`, to match what the page does — the CLI's own skill advises that,
   which is why it is not installed.
4. **Stop the session and the background test** before the next case: `npx playwright-cli close` and end the
   `specs:debug` process.
5. Take the printed lines as a draft, not the spec, and finish it with the steps below.
6. **Replace every observed literal** with its source: a URL becomes `env("FRONT_URL")` + path; an SKU, coupon
   or org becomes `td(...)`; an account becomes a role through the fixture; a generated name becomes `random`.
   A GUID or e-mail in the draft is a leak — `DV-025` catches the literal, you catch the reason.
7. **Replace brittle locators** (nth-child, generated class names, coordinates) per `practice.md` §Locators.
8. **Map each row tag to a check, in row order**, with the tag in a comment (`// [MATH] …`) as the pilots do.
   Every assertion in the row has an `expect` in the spec. Add none the row does not state.
9. **Delete everything the draft did only to explore** — wait-for-timeouts, manual screenshots, console prints.
10. Do not keep the CLI output in the repo; anything you saved stays in the run's gitignored folder.

## The one run (D9)

Run exactly the new spec, once, with `npx playwright test -g "<CASE-ID>:"` (the `-g` text is matched against
"project file describe title", so do not anchor with `^`). For a suite folder: `npx playwright test <suite folder>`.

| Case | Required result | A different result means |
|---|---|---|
| Passed check | PASS | spec defect — fix the spec. Never change the checklist verdict, never touch the row |
| Bug reproduction | FAIL on an `expect` (name which) | a timeout or fixture error is `BLOCKED`/`spec-defect`; a PASS means it does not reproduce — report it, do not weaken |

If the spec cannot be made to behave faithfully after fixing every spec defect, **stop and report**: the row
may be wrong, the product may have changed, or the stand may be off. That is a finding for a human; D7 forbids
resolving it by editing the row or loosening the `expect`.

## D7 in one paragraph

The CSV row's expectation is what the case is for. If the spec disagrees with the build, there are only three
honest outcomes: the spec is wrong (fix it), the product is wrong (report a finding), or the row is stale
(report it; a human or `/qa-review-tests` changes it, citing evidence). Rewriting an expectation to match
whatever the build does turns a case that catches bugs into one that documents them
([`../../knowledge/execution/cases-that-catch-bugs.md`](../../knowledge/execution/cases-that-catch-bugs.md)).
