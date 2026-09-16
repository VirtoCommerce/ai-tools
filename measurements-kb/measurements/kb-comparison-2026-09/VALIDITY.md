# Is the comparison sound? — audited after arm B

Written after the first arm finished, by checking the configuration rather than remembering it.
The short answer: **arm B is a valid run, and the call-count comparison between it and the arena
arms was not clean.** One thing is fixed; two are stated and carried.

## Arm B is valid as a run

Every rule that was supposed to hold, held, and each was verified rather than assumed:

| | |
|---|---|
| repository on `main`, `plugins/vc-kb/` absent | checked before the start |
| no base, no `arrive` hook, nothing mentioning the corpus | the repository has none |
| 150-call cap | 149 used |
| identical task text | the revised brief, which every arm gets |
| deployment cleaned as instructed | read back over REST, not taken on trust |
| the base untouched | it has none |

The oracle's items are arithmetic and cross-surface agreement. **Nothing below touches them**, so
arm B's score will be a fair score.

## What was NOT clean: the arms did not have the same browser

The QA repository carries two `PreToolUse` hooks the arena never had:

    mcp__…__(browser_evaluate|browser_run_code_unsafe|evaluate_script)  -> enforce-real-user.mjs
    mcp__…__(browser_type|browser_fill_form)                            -> enforce-secret-token.mjs

**Arm B could not script the page.** It did all 149 calls through UI interaction — 42 clicks, 26
snapshots, 21 screenshots. An arena arm with `browser_evaluate` could read the same state in a
fraction of that. The difference is plausibly worth tens of calls, which is **larger than the effect
the comparison is trying to see** — P4 predicted arm C would beat arm B by at least 25%.

**Fixed:** `browser_evaluate` and `browser_run_code_unsafe` are now explicitly DENIED in both arena
settings. No arm can script the page. Arm B lacked it by hook, arms A and C lack it by rule; the
capability set is the same.

**Also equalised:** `Bash` is granted to both arena arms. Arm B ran eleven shell calls in the
repository without being asked each time, and an arena arm that must approve every one is not doing
the same task — it would hit arm C hardest, since running `kb` IS its treatment.

**The two arena settings now differ by exactly two lines**, and it is a diff anybody can run:
`KB_BASE`, which is the treatment, and `VC_MEASURE_OUT`, which is where the log goes.

**Not fixable, and carried instead:** `enforce-secret-token.mjs` shapes how arm B typed into fields.
The arena arms only ever hold secret NAMES, so they would type names regardless — but the enforcement
is not identical, and saying so is cheaper than pretending it is.

## A defect in the counter, found the same way

**A call blocked by a `PreToolUse` hook never reaches `PostToolUse`, so the log never sees it.**
Arm B's narration says `browser_evaluate` was refused; the tool log contains **zero** evaluate calls
and **zero** failures. The attempt is invisible.

So **149 is a floor, not a count.** Arm B's true number of attempts is higher by however many times a
hook refused it.

**Corrected after the fix:** the asymmetry is now smaller than that paragraph first claimed. A
permission `deny` also stops a call before it executes, and `PostToolUse` fires only on a call that
ran — so the arena arms have an invisible-refusal path too, now that scripting is denied there. All
three arms can under-count in the same way. What stays one-sided is the SHAPE of the refusal: arm B
met a hook that explains itself, the arena arms meet a flat denial.

This is the second instrument defect the measured party found rather than its author, on the second
arm-day. It does not invalidate anything already recorded; it means the call counts are reported as
"logged calls", with this note attached, rather than as "calls".

## Two conditions that are shared, and still worth stating

**Eight unrelated promotions were active throughout**, and every arm meets them. Arm B chose printers
and its order carried exactly one discount line, its own. An arm that chooses phones will meet "All
phones get 5% discount" and may stack. The order is still gradable — the oracle checks the arm's
numbers against the order — but the arms would not be doing equally easy arithmetic. This is the cost
of not pre-choosing products, and it was accepted so that nobody could pick products that suit the
base.

**The 150-call cap came within one call of binding on arm B.** A cap that nearly binds is not a
neutral condition: it limits how much verification an arm can afford, and it compresses any
difference between arms towards the cap. If arm C also finishes near 149, the call count will say
nothing and only the oracle score will.

## The seal

Unaffected. It covers the PREDICTIONS, which are about outcomes and have not been touched. The task
was revised once — before any arm produced a gradable result — because it named one identity where
the task needs two, and every arm runs the revised text. That revision is recorded in
`CONDITIONS.md` with what it cost: 25 calls of an aborted first attempt.

## What this means for the write-up

The honest headline was never the call count; it is **which entries arm C used, who wrote them and
when**. That claim is untouched by everything above.

The call count is reported with its caveats, or not at all. A number that would not survive somebody
reading this page should not be on the demo page either.
