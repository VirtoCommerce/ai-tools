# Regression — storefront selectors (generated, gated)

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

## Storefront Selectors — generated, gated, and measured against the source

`.claude/knowledge/automation/storefront-selectors.md` (455 lines) and
`.claude/knowledge/execution/test-execution-preflight.md` hand-listed the storefront's
`data-test-id` surface. Both were verified live on their capture dates and were correct then.
Diffed against `vc-frontend@dev` (`17c99c7`, 2026-08-26): of the 78 distinct selectors they assert,
most match exactly, a couple are plausible instantiations of a real template, and a minority match
nothing — while over a hundred real selectors are undocumented.

> **The precise split first published here (54 / 2 / 22) was measured before the generator read
> the UI-kit prop form, so the "matches nothing" figure was an over-count by at least six.**
> `sign-up-first-name-input`, `sign-up-email-input`, `sign-up-confirm-password-input`,
> `global-search-query-input`, `search-keyword-input` and `payment-method-selector` were all real
> the whole time — declared via `test-id-input=` / `test-id-dropdown=` rather than the
> `data-test-id` attribute (see the two-ways bullet below). Reading both forms took the static
> surface from 161 to **194**. The exact re-split is deliberately not restated: the original 78
> was a careful hand harvest, and a fresh automated one picks up CSS classes, attribute names and
> MCP server names, so a number from it would look more precise than it is. What is defensible and
> load-bearing: the drift is real, the direction is right, and `isKnownSelector` is the check —
> not any count written in prose.

**The drift landed on the load-bearing document.** `test-execution-preflight.md`'s selector table
specified the sign-in and sign-out controls, reached by `[PRE:SIGNIN_AS]` / `[PRE:SIGNOUT]` from
~1,572 cases. `main-layout.top-header.account-menu-button` is now `account-menu`;
`main-layout.top-header.account-menu.sign-out-button` is now `sign-out-button`; the `main-layout.`
prefix survives in exactly one unrelated place in the whole source. An agent looking for an element
that is no longer rendered either fails the precondition or falls back to guessing by text — a live
contributor to the measured artefactual-BLOCKED rate (19.9% corpus-wide, 28.6% on suites of 81+
cases — see the note under §Per-Case Lane Routing; the once-quoted flat 29% was a single run).

So the surface is generated, not transcribed — the same shape as `tokens:sync`, and for the same
reason (`.claude/rules/test-data.md` §GOLDEN RULE):

| Command | Does |
|---|---|
| `npm run selectors:sync` | rewrite the committed `scripts/lib/storefront-selectors.generated.ts` |
| `npm run selectors:sync -- --from ../vc-frontend` | read a local checkout instead of cloning |
| `npm run selectors:check` | CI drift gate — **exit 2 on an unreachable source, never a silent pass** |

Four rules make it trustworthy rather than another list:

- **It clones; it cannot fetch files.** Unlike `sync-design-tokens.mjs`, which reads four named
  files, this has to ENUMERATE a tree (454 `.vue` + 916 `.ts`) — `raw.githubusercontent.com` cannot
  list a directory. So the source is a shallow, blobless, sparse clone, or `--from`. (Incidentally
  this makes `selectors:check` usable where `tokens:check` is not: the git proxy serves clones while
  `raw.githubusercontent`/`unpkg` are policy-blocked.)
- **A template is a PREFIX, never a literal.** `:data-test-id="`filter-${facet.paramName}`"` yields
  the prefix `filter-`, and `SELECTOR_PATTERNS` records the template. Writing `filter-price` as a
  literal is the transcription error this file exists to stop — and `filter-price` is in the docs.
  Conversely, `isKnownSelector("filter-price")` is **true**: it is a plausible instantiation, so
  calling it a phantom (as a naive diff against static values does) is the same overreach reversed.
- **`isKnownSelector` false means UNVERIFIED, not invalid.** Twenty bindings are bare expressions
  (`:data-test-id="item.dataTestId"`) whose runtime value cannot be read statically.
  `UNRESOLVED_BINDINGS` records each with its reason and location, so the gap is visible rather
  than silently absent.
- **A test id reaches the DOM two ways, and reading only one of them is how a generator lies.**
  There is the `data-test-id="literal"` **attribute**, and there is a UI-kit **prop**
  (`test-id-input`, `test-id-dropdown`, …): `vc-input.vue` declares `testIdInput?: string` and
  renders `:data-test-id="testIdInput"` on the inner `<input>`, so
  `test-id-input="sign-up-password-input"` puts `data-test-id="sign-up-password-input"` in the DOM
  — the prop value IS the rendered id, verbatim, and just as statically readable. The first version
  of this generator scanned only the attribute, missing **39 real selectors** across the sign-in
  form, the entire sign-up form, the search bar, the address form, the bank-card form and the
  checkout method selectors — exactly the form controls a smoke suite drives. It then wrote the
  absence up as a finding ("`sign-up.vue` does not pass it"), which was measurably false. Fixed
  2026-08-26: 161 → **194** static ids, with a unit test pinning the prop coverage. A generator
  that silently covers half its surface is the same failure as a hand-maintained list, only harder
  to notice — which is the whole reason this section exists.
- **Prefer a test id over a label.** A label is an i18n key (`common.labels.email`), so a
  label-based locator is locale-dependent — and the language selector is itself under test. Where
  no test id exists, `name="email"` is the next-best anchor because it is locale-independent too.

**`data-testid` (no dash) does not exist.** `test-execution-preflight.md` used to say "a few legacy
spots may use `data-testid` … either should work with Playwright locators". Measured across
`client-app/`: zero occurrences, static or bound. The hedge was not a safe fallback; it was a way to
write a locator that always fails.

**Still hand-maintained:** the ~400 rows of `storefront-selectors.md` covering the non-`data-test-id`
layers (`.vc-*` component classes, page-scoped BEM). The generator cannot see those, and re-pointing
them needs a live re-check per row — authoring, not mechanics. The file now carries an audit header
saying so.

