# Auto-fix proof medium — why G2 asks *where* the red was observed

**Status:** active · **Introduced:** 2026-09-10 · **Incident:** VCST-5940

Never loaded by an agent. This is the measured rationale behind the G2 MEDIUM RULE, the
`PROOF_*` declarations, and the executed-argument rule in G4. The gates themselves state the
rule; this file states why, so the rule does not have to carry its own history.

## The incident

VCST-5940: in the Admin SPA, Notifications → Notification activity feed → a journal row →
Preview rendered the literal text of an Angular interpolation instead of the sent email body.

The fix pipeline ran end to end and shipped a change that does not work:

| Stage | Result |
|---|---|
| G2 reproduce RED | Node scratch harness asserting the controller's *assignment timing* — red→green |
| G3 fix green | `$timeout` deferral; build clean |
| G4 review | **APPROVE, HIGH confidence** |
| G5 CI | build, unit, SonarCloud ×2, swagger, auto-tests on 3 DBs, CLA — all green |
| Human review | approved |
| Deploy | artifact pinned to the QA env |
| `/qa-verify-fix` | **bug reproduces 3/3** on that exact artifact |

## Four failures, each independently sufficient

**1. The proof asserted the wrong property.** The ticket's *Actual result* was a statement about
a rendered DOM. The test asserted that a value was not assigned during synchronous construction.
The fix genuinely changed that property; it was simply not the property governing the symptom.
A green test of the wrong thing is worse than no test — it manufactures confidence that survives
review, CI and a human.

**2. The pipeline knew, and had no way to act on it.** The run recorded
`"G2_reproduce_red": "PASS_PROXY"` and a truthful `limits[]` saying the customer-visible outcome
was unverified — then reported `"confidence": "HIGH"`. `PASS_PROXY` existed as vocabulary with
no consequence anywhere in the ladder. The honesty was present; the gate was not.

**3. The evidence cited was for a different intervention.** The `/qa-bug` report said "fix
validated live", meaning: re-assigning the `srcdoc` attribute after load forced a re-navigation
and the body rendered. What shipped was a deferral of the *first* assignment. Related mechanisms,
not the same one. That phrase then propagated into the tracker as support for a change it had
never tested.

**4. G4 overturned the right hypothesis with an argument nobody ran.** The reviewer observed that
the *working* sibling blade also carries an `ng-if` and concluded `ng-if` could not be the
differentiator. X present in the working case and absent in the broken one is the profile of a
candidate cause, not evidence against one. The argument was detailed, confident, plausible, and
never executed.

## What the symptom actually was

Measured afterwards with an instrumented trace on Edge 152, against the real app, unfixed build:

```
t=930.4  iframe-seen   connected:true  attrLen:87   (attribute already CORRECT)
t=932.9  iframe-load   body:"<the literal interpolation text>"
         → zero srcdoc mutation records
```

The HTML parser creates the iframe with a real `srcdoc` attribute holding the raw, uninterpolated
text. Chromium ≤152 commits its `about:srcdoc` navigation from that **parse-time** value and does
not re-navigate when Angular later writes the interpolated one. The same class as the
`ng-src` / `ng-href` trap. The attribute was never the problem — the parsed markup was.

The fix is `ng-attr-srcdoc`, which prevents the attribute from existing at parse time.

## Every hypothesis held during the run, refuted by measurement

Built as real bundles, substituted into the live app by request interception, driven by real clicks:

| Candidate | Result |
|---|---|
| pre-fix source | RED 3/3 |
| `$timeout(fn)` — what shipped | RED 3/3 |
| `ng-if` on the wrapper | RED 3/3 |
| pre-initialised empty trusted value | RED 3/3 |
| both together (the working sibling's exact structure) | RED 3/3 |
| `$timeout(…, 500)` | GREEN, rejected — magic delay + a blank frame |
| **`ng-attr-srcdoc`** | **GREEN** 5/5 Edge 152 · 3/3 Chrome 152 · 3/3 chromium 153 |

The working sibling blades work **by accident of async data arrival, not by structure**. Every
structural theory — including the one the review rejected and the one it endorsed — was wrong.

## Two traps this cost us, worth remembering

**A harness that renders correctly on broken code is a false-green generator.** Two synthetic
render harnesses were built during this investigation and both rendered *correctly* on
known-broken source, because the browser lane they ran on was chromium 153 — where the defect is
fixed upstream. Hours went into chasing template-cache and animation-timing fidelity for a gap
that was the browser version. Hence: **the harness must exhibit the red before it may certify a
green**, and the medium must match the one the symptom was reported on.

**The defect is chromium-152-generic and absent on chromium 153.** Anyone verifying on a newer
browser will report "cannot reproduce" in good faith.

## What changed as a result

- G2 gained the MEDIUM RULE: a rendered-DOM symptom requires a rendered-DOM red, and
  `PASS_PROXY` is a FAIL rather than a caveat.
- The `/angular-admin` and `/vc-shell-fix` proof paths route by **where the symptom is observed**,
  not by which file the fix touches.
- `PROOF_MEDIUM` / `PROOF_PROVENANCE` / `PROOF_LINKAGE` are emitted by the dev agents, checked at
  G4, and persisted to `summary.json` so a later audit can read them.
- G4 gained the executed-argument rule and the differential read.
- `ci/run-fix-cycle.ts` parses the declarations, so the headless lane enforces the same bar —
  without that, all of the above is advisory in CI.
