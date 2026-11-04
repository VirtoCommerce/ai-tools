# The release aggregate

`/qa-docs release --sprint <SprintXX-XX>` or `/qa-docs release --version <X.Y.Z>`: one file per sprint or
release that collects the *What's new* sections of the window's ticket documents. Reads only what
`/qa-docs <TICKET>` already wrote; it walks no stand and posts nothing.

## Aggregate

**Input.** Every ticket of the window (the sprint's tickets, or the tickets whose *Shipped in* names the
version) and, per ticket, its document `reports/ba/<Domain>/<ticket>-<slug>-guide.md` and its run's
`documentation.json`. A ticket document exists only for a ticket that was Tested or Done when it was written
([`rules.md`](rules.md) §Evidence bar).

**Included** — a ticket whose document exists and whose *Shipped in* is resolved (not `UNKNOWN`).
Everything else goes to *Not included* with its reason: no document (`refusal` from `documentation.json`,
or never run), `Shipped in: UNKNOWN`.

**Output:** `reports/ba/release-notes/release-<label>.md`. Target 40–80 lines, **cap 150**. Section order
is fixed:

1. **⚠ Breaking changes** — first, whenever any included document carries a `⚠ Breaking` line. A reader
   who stops after one section must have read this one.
2. **What's new** — one line per included ticket: `{TICKET} — {feature}` · `Shipped in` · a link to its
   document. Link, never inline the document (`.claude/rules/reports.md` §8).
3. **Not included** — **mandatory**: every ticket of the window left out, with its reason. An omitted
   section is indistinguishable from a clean window.
4. **Upstream cross-check** — one line against the release ledger's matching month(s)
   ([`../../knowledge/domain/release-ledger.md`](../../knowledge/domain/release-ledger.md)). It may say
   *"the ledger records X in this window with no ticket document"*; it never says "X was missed" or
   quotes a coverage percentage — the ledger declares itself non-exhaustive.

[`rules.md`](rules.md) §Truth guardrail and §Payload hygiene bind every line; when the file is written,
record its path in each included run's `documentation.json` as `aggregated_into`.
