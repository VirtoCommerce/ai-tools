# Common VC backend fix shapes

The "easy, single-module, non-breaking" bugs the auto-fix pipeline takes (Gate 0) usually fall into a
handful of shapes. Each is a **minimal** change near the seam — not a redesign.

| Shape | Symptom | Typical minimal fix |
|-------|---------|---------------------|
| **Missing null/empty guard** | NRE / 500 on empty collection or absent entity | Add the guard / early-return; assert via the repro test |
| **Wrong default** | Field defaults to wrong value when unset | Correct the default at the source of truth; check callers don't rely on the old one |
| **Off-by-one / boundary** | Pagination, quantity, range edge wrong | Fix the comparison; cover with a `[Theory]` |
| **Wrong field mapping** | Data saved/returned under the wrong field; "silently no-ops" | Verify the real contract first, then map correctly (e.g. `sections` not `configurationSections`) |
| **Cascade gap** | Delete/cancel doesn't propagate (index, cart, stock) | Wire the missing event handler / cascade call (`BL-CROSS-*`) — confirm it stays in THIS module |
| **RBAC gap** | Action allowed for a role that shouldn't (or vice-versa) | Fix the permission check (6-permission pattern, `BL-AUTH-005`) |
| **Missing await / fire-and-forget** | Intermittent / out-of-order behavior | `await` the call; don't swallow the task |
| **Status guard** | Invalid state transition allowed | Add the guard in the state machine (`BL-ORD-001`) |

## Rules of thumb
- Change **one** thing. If the fix needs a second module, a schema/migration, or a contract change →
  that's not an "easy" fix → STOP (Gate 0/G3 boundary).
- Keep the diff reviewable at a glance — the human reviewer (G7) approves faster when it's tiny.
- Re-read `vc-bug-catalog.md` for the domain so the fix doesn't re-introduce a known past failure.
- After green, scan the diff yourself for accidental churn (formatting, imports) before G4.
