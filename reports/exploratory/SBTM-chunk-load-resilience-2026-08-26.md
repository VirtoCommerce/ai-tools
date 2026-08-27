# Exploratory Session: Storefront resilience — route chunk loads

**Date:** 2026-08-26
**Duration:** ~30 min (charter EXP-01, sprint 26-16 §5.3)
**Platform:** 3.1061.0 · **Theme:** 2.56.0 · **Env:** vcst-qa
**Session type:** [EXP]
**Discovery technique:** User-flow edge enumeration + Saboteur (induced network failure)
**Lane:** Chrome DevTools MCP (`networkConditions: Offline`) — not firefox, per the click-driven rule
**Charter:** Discover failure modes of route-level dynamic-`import()` recovery (VCST-5654) that no suite
covers — GAP-03 records the domain as having no suite. Confirmed: the only `chunk` match across all 126
suite CSVs is `Transfer-Encoding: chunked` in `047`, i.e. unrelated.

## Net-New Scenarios Discovered

| # | Scenario | Why uncovered | What we found | Fate | Suggested next charter |
|---|----------|---------------|---------------|------|------------------------|
| 1 | A route whose chunk fetch failed once is unreachable for the rest of the page session — **no retry is ever attempted, even after the network returns** | No suite induces a chunk failure | Exactly **one** request for `bulk-order-XXCCKnh8.js` (`ERR_INTERNET_DISCONNECTED`). Two further clicks *online* produced **zero** new requests and zero new console errors. Positive control: after a reload the same route loads fine ("BULK ORDER PAD"). Mechanism: the rejected dynamic-import promise is cached (standard ESM semantics), so recovery covers the **session**, not the **route** | **PROMOTE** — assert the current contract; the in-place-retry gap is bug candidate #1 below | Explore the same failure on a *nested* lazy chunk (a component inside an already-loaded route) |
| 2 | The app's own prescribed recovery **does not resume the user's intent** | Requires reaching the error state first | The failed navigation never changes the URL (correct containment), so the toast's **"Reload page"** reloads `/` — the user lands back on the **homepage**, alert cleared, no closer to Bulk order. They must remember to re-click. On the flaky-mobile scenario VCST-5654 targets, this repeats | **PROMOTE** + bug draft | Explore whether a deep-linked reload (`/bulk-order` typed directly) recovers where the button does not |
| 3 | Failure is re-announced on **every** attempt and never stacks — worth pinning before it regresses | Positive behaviour; nobody writes a case for what works | Each failed click mounts a **new** alert node (uid `2_0` → `4_0`), never duplicating; region is `live="polite"` with a Close control; the page underneath stays fully intact — **no blank route, no partial render** | **PROMOTE** | — |

## Bugs Found

| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | Low–Medium (UX) | Chunk-load recovery is one step short: "Reload page" clears the error but returns the user to the page they were already on, and the route cannot retry in place | Scenarios 1 + 2 above; console `TypeError: Failed to fetch dynamically imported module: …/assets/bulk-order-XXCCKnh8.js` (logged once) | Yes |

**Not filed.** Per `/qa-exploratory` rules this session stops at drafting — route through `/qa-bug` if you
want a ticket. Fix shape, for whoever picks it up: reload to the *intended* route rather than the current
URL, or bust the import cache (`import(url + '?t=' + Date.now())`) so the next click retries in place.

## Untested — and why (this is a finding, not an omission)

Charter candidate #2, **permanent 404 / stale chunk hash after a deploy**, was NOT exercised. It needs
request interception (rewrite one asset response to 404); the `enforce-real-user` hook blocks
`browser_evaluate` / `run_code_unsafe` outright. The hook is right about UI validation but has no
exception for **network-fault injection**, which is not a UI-validation bypass — offline emulation was
the only fault I could induce. The stale-hash case is the one most likely to hit real users on a deploy,
so this gap matters. Options: extend the hook's allowlist for route-interception, or add a Playwright MCP
`--save-har`-style fault tool.

## Risk Areas
- Every lazily-loaded route shares this failure mode; the blast radius is the whole route table, not `/bulk-order`.
- A deploy that changes chunk hashes while users hold an open tab reproduces scenario 1 without any network fault.

## Charter-from-Gap (next-session candidates)
- Nested lazy chunk (component inside a loaded route) — same failure, different containment boundary?
- Deep-linked reload vs the toast button — does the recovery path differ?
- Chunk failure *during* a checkout step — does cart state survive the reload the toast asks for?
