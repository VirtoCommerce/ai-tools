# The `.claude/` ↔ `plugins/vc-fix/` mirror — why it is a declared ledger, not a sync

*Decided 2026-09-09, closing item 13 of `docs/agentic-system-audit-2026-09-07.md` §6.*

Never loaded by an agent. This is the reasoning for whoever is deciding whether to change
`scripts/maintenance/mirror-check.mjs` or to "just re-sync the plugin".

## What the audit asked for

> **Extend `mirror-parity.test.mjs` from 5 files to all 99 shared paths** (or delete the mirror and
> resolve the plugin against one copy). Normalise CRLF→LF first, then re-sync `business-logic.md` —
> 81 missing invariants is shipping broken judgment to customers.

The BL/ECL half was done on 2026-09-08 and the parity list grew from 5 to 28. The rest of the
sentence turned out to rest on an assumption that does not hold.

## What is actually true, measured 2026-09-09

92 paths exist in both trees. 28 were byte-identical; **64 diverged**. The audit read that as 64
things to sync. Opening them one at a time says otherwise:

| what the divergence is | count | example |
|---|---:|---|
| paths that MUST differ between the trees | 11 | the root cites `plugins/vc-fix/commands/qa-fix.md`; inside the plugin that is `commands/qa-fix.md` |
| the plugin deliberately omits surface it does not ship | 25 | `vc-bug-catalog.md` de-links `skills/qa-sbtm/*`; `sign-off-templates.md` replaces `@qa-lead-orchestrator` with *"assign in your tracker"* |
| the **plugin** is canonical and the root copy is a fossil | 12 | every `skills/project-init/*` file — `verify-access.mjs` is 481 lines ahead in the plugin |
| plugin-only frontmatter | 3 | `disable-model-invocation: true` |
| the plugin must be tracker-neutral where the root is JIRA-specific | 1 | Azure Boards slot mapping in `defect-report-templates.md` |
| the **root** is canonical and the plugin copy is a frozen snapshot | 1 | `graphql-schema.md` — plugin introspection dated 2026-08-27 vs the root's 2026-09-04 |
| the AND-gated allowlist hook, comment-only | 1 | `enforce-real-user.mjs` — **resolved**, see below |
| nobody has decided | 10 | `tracker-ops.md`, `vc-self-check/SKILL.md` |

**So a bulk re-sync would break the plugin**, not fix it. It would reintroduce references a client
install cannot follow, overwrite twelve files where the plugin is the version that runs, and undo
the tracker-neutral wording the plugin exists to provide.

**Why 2026-09-08's BL/ECL re-sync was safe anyway:** those two oracles carry no plugin-specific
adaptation at all — no links into unshipped skills, no agent names, no tracker wording. That is the
exception. Checking for it is one `diff` per file and it was not done before generalising.

## What replaced it

`npm run mirror:check` puts every shared path in exactly one bucket:

- **identical** — byte-for-byte. Any drift fails.
- **structural** — identical once the paths that must differ are normalised (`PATH_REWRITES`). Any
  *content* drift fails. **This bucket is the actual gain: 11 files that byte-parity could never
  have covered are now watched.**
- **forked** — a real content difference, which must be in `FORKS` with a reason from a closed
  vocabulary. An **undeclared fork fails**; so does a declared fork that has since become identical,
  so the ledger cannot rot. Same burn-down shape as `XREF_BASELINE` and `CSV_LINT_BASELINE`.

Gated pairs went from **28 → 40** (29 identical + 11 structural), and the other 52 stopped being
invisible.

**Three ratchets, not one**, because the buckets alone turned out to be too weak — every one of
these was a review finding against the first cut:

- `BYTE_IDENTICAL` pins the pairs that match today. Without it a byte-gated pair could slide
  quietly into `structural` on a one-sided path edit, and the predecessor of this file *did*
  assert byte equality for 23 of them — losing that would have been a regression, not a rewrite.
  A pair leaves the list only in the commit that deliberately forks it.
- **Line-ending parity on every shared path.** `canonicalise` folds CRLF to LF so a structural
  comparison is possible at all, which means a line-ending flip is invisible to everything else
  here — and that is exactly what hid the `business-logic.md` drift until the audit found 81
  missing invariants (§4.3).
- **A declared fork that no longer exists in both trees is an ORPHAN, not a re-sync.** These were
  one field at first, and the message said *"delete the FORKS entry"* — advice that, followed on a
  file whose plugin copy had been deleted, turns a fork **by omission** green.

**`hooks/enforce-real-user.mjs` is no longer a declared fork.** It differed only by a comment, so
it was filed as `plugin-note` — which left the claim *"the executable content is in lock-step"*
asserted by nobody, on an AND-gated hook whose own MIRROR NOTE records a 6-week one-sided drift
(`REG-2026-09-07-2225`). The note is now worded to hold on both surfaces, the copies are
byte-identical, and the file sits in `CONTAINMENT_CORE`.

`scripts/unit/mirror-parity.test.mjs` no longer keeps its own list — it derives everything from that
registry, so the two cannot disagree. The security argument for byte-identity on the
self-diagnostics containment core is unchanged (PR #143, and the AND-gated-hooks incident recorded
in `plugins/vc-fix/hooks/enforce-real-user.mjs`): both copies are registered, so a stale one denies
what the fresh one allows.

## What is deliberately NOT solved

- **The 10 `undecided` forks.** Each needs someone to say which side wins. The test ratchets the
  count downward and will not let an eleventh appear.
- **`graphql-schema.md`, `vc-bug-catalog.md`, `storefront-selectors.md`** are stale on the plugin
  side *and* carry plugin-specific edits, so they need a manual, adaptation-preserving merge — not
  an overwrite. `storefront-selectors.md` is the one worth doing first: the root carries an
  *"⚠ AUDITED 2026-08-26 — 22 of these selectors no longer exist"* banner that the plugin copy does
  not, so a client is currently reading known-dead selectors with no warning.
- **The plugin's own citations.** Resolving every path cited inside `plugins/vc-fix/**` against the
  plugin root leaves **238 of 734 unresolved**, dominated by `ci/lib/repo-router.ts` (19),
  `ci/run-fix-cycle.ts` (12) and `reports/**` — files the plugin references but does not ship. Some
  are the ephemeral-output class the root's `DOC-003E` already exempts; the `ci/` ones are not, and
  deciding what the plugin should say instead is a product question about the shipped surface, not
  a lint fix. Left as a measured finding rather than a silent one.

## The rule going forward

Adding a file to both trees is fine. Letting them drift is fine **if you say why**. What is no
longer possible is drifting by accident: `mirror:check` runs in `.github/workflows/gates.yml` and
inside `npm test`.
