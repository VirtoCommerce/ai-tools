# How to run an arm

**Every arm runs in its own fresh session.** The session that runs an arm must never have seen this
directory: the oracle, the conditions and the predictions all live here, and an arm that reads them
is grading itself.

Order, revised after arm B: **B → C → B again → A if there is time.**

Arm A was demoted. It measures what an agent does with no context at all, which nobody disputes; a
SECOND arm B is worth more, because n = 1 per arm is this comparison's biggest weakness and twelve
earlier runs ranged from 83 to 319 tool calls. Without a spread for B, "C was faster" is not a
result. C still runs before the repeat, on the residue arm B left.

---

## Before any arm

**Run the pre-flight and get READY.** It exercises the environment rather than reading it:
configs parsed and every path they name stat'd, the logging hook fed an empty payload, the secrets
file checked for the names the brief types, both deployment URLs called, the base opened and `kb`
actually made to answer — against a COPY, because `ask` and `how` write.

```
node C:/_VIRTO/vc-kb-lab/measurements/kb-comparison-2026-09/preflight.mjs B|A|C
```

A check that cannot run reports SKIPPED and the whole run reports NOT READY. Do not launch an arm
on anything but READY. Two launches died on configuration that had been written and never run, and
the fix is not care — it is this.

**Arm material lives OUTSIDE the arena**, in `C:/_VIRTO/_comparison-logs/`. The arena is an arm's
working directory: anything inside it is readable, and another arm's report holds every answer this
one is supposed to find. The pre-flight checks for that too.


1. **The repository must be on `main`**, with `plugins/vc-kb/` absent. PR #298 stays open and
   unmerged until arm B is finished — otherwise arm B finds the tool while looking around and stops
   being a clean control.

   ```
   git -C C:/_VIRTO/vc-mcp-testing-module rev-parse --abbrev-ref HEAD    # main
   test -d C:/_VIRTO/vc-mcp-testing-module/plugins/vc-kb && echo CONTAMINATED || echo clean
   ```

2. **The base must be untouched.** `git -C C:/_VIRTO/vc-knowledge status --porcelain` prints nothing.

3. **The deployment.** Empty cart, no promotion belonging to this arm.

---

## Arm B — the QA repository, no base

**Working directory:** `C:/_VIRTO/vc-mcp-testing-module`, on `main`.

Already wired: `.claude/settings.local.json` points `VC_MEASURE_OUT` at
`C:/_VIRTO/_comparison-logs/arm-B` and the `PostToolUse` hook at the shared instrument. Nothing else was
changed, and the file is restored from
`scratchpad/settings.local.json.bak` afterwards.

Start a new session there and paste **PROMPT-B** below. Nothing else — no follow-up steering, no
hints, no answering questions about the platform. If the arm asks you something, the honest reply is
*"everything you need is in the task"*.

---

## Arm A — the arena, no base

```powershell
Copy-Item C:/_VIRTO/vc-kb-lab/measurements/kb-comparison-2026-09/arena-settings/settings.arm-a.json C:/_VIRTO/_arena/.claude/settings.json -Force
Remove-Item C:/_VIRTO/_arena/artifacts/* -Recurse -Force -ErrorAction SilentlyContinue
```

**Working directory:** `C:/_VIRTO/_arena`. Paste **PROMPT-A/B** (the same text as arm B).

---

## Arm C — the arena, with the base

```powershell
Copy-Item C:/_VIRTO/vc-kb-lab/measurements/kb-comparison-2026-09/arena-settings/settings.arm-c.json C:/_VIRTO/_arena/.claude/settings.json -Force
Remove-Item C:/_VIRTO/_arena/artifacts/* -Recurse -Force -ErrorAction SilentlyContinue
```

**Working directory:** `C:/_VIRTO/_arena`. Paste **PROMPT-C** — identical to the others plus one
sentence.

---

## PROMPT-A/B — paste verbatim

> You are working on a Virto Commerce B2B deployment as a signed-in customer.
>
> **Place one order, then prove it is correct.**
>
> The order must contain **at least three distinct products**, with a quantity greater than one on at least one line, and it must be placed under a **percentage-off promotion that you create yourself and that is active at the time of placement**.
>
> Then verify the placed order. For each item below, state the value **and where you read it**:
>
> 1. the order number and its status
> 2. every line: product, quantity, unit price, line total
> 3. the discount — which promotion applied, and the exact amount
> 4. the shipping cost, **and why it is that amount**
> 5. the tax, and why it is that amount
> 6. the payment method the order records
> 7. the grand total, shown to add up from the parts above
>
> The order must read the same on **all three surfaces**: the storefront order page, the Admin order blade, and the REST API. Where two surfaces disagree, **say so** — a disagreement is a finding, not a failure to complete the task.
>
> **The deployment**
>
> | | |
> |---|---|
> | storefront | `https://vcptcore-stable-storefront.govirto.com` |
> | Admin / platform / REST | `https://vcptcore-stable.govirto.com` |
> | store | `B2B-store` |
>
> **There are TWO identities and you will need both.** They are different accounts with different scopes, and neither can do the other's half of this task:
>
> | for | username | password |
> |---|---|---|
> | shopping — the storefront, the cart, placing the order | `agent-test-impersonator@virtoworks.com` | secret name `IMPERSONATION_ADMIN_PASSWORD` |
> | Admin and REST — the Marketing module, the order blade, the API | secret name `ADMIN` | secret name `ADMIN_PASSWORD` |
>
> The storefront account is a company administrator of its organization, scoped to the storefront. It has no platform permissions: it cannot open the Marketing module and it cannot open an order in Admin. The second identity is the platform administrator and is what those parts of the task need.
>
> No password is written down anywhere and you must not ask for one. The browser is started with a secrets file: type the secret NAME into the field and the value is substituted for you. That is true of the admin USERNAME as well — type `ADMIN`, not a literal. You will never see any of these values, and none of them may appear in anything you write.
>
> The storefront account's organization already has a shipping address.
>
> **Budget and scope**
>
> * **Work until the task is done.** There is no call budget — how much it costs to finish is part of what this is for. Do not ration, and do not stop early because it is taking a while.
> * You may create **ONE** promotion, and edit or disable the one you created. Name it so it is obviously yours and obviously disposable.
> * **Do not touch any promotion that existed before you arrived.** Several are deliberately left disabled by earlier work, and none of them is yours.
> * **One order.** An order cannot be deleted on this platform — cancel what you place.
> * Do not modify catalog or pricing data. Do not create or delete member accounts.
>
> **When you are done**
>
> Empty your cart, cancel your order, and leave your promotion **disabled, not deleted**.
>
> Then write a report that answers the seven items, names the surface each value was read from, and states plainly anything you could not establish. An item you could not settle is an honest "unknown", never a plausible guess — a wrong confident answer is worse here than a gap.
>
> Scratch files and screenshots go in the working directory, not in the repository root.

---

## PROMPT-C — the same, plus one sentence

Paste **PROMPT-A/B** exactly as above, and add this as its own paragraph immediately after the first
line:

> A knowledge base about this platform is available. Ask it with `node C:/_VIRTO/vc-kb-lab/bin/kb.mjs ask "<question>"` for facts and `node C:/_VIRTO/vc-kb-lab/bin/kb.mjs how "<what you are trying to do>"` for procedures; an uncovered question returns an explicit MISS.

That is the whole treatment. **It does not say what to ask, or when, or that the base knows anything
about this particular task.** If arm C only wins when told what to ask, that is a finding about the
prompt and the write-up says so.

---

## After each arm

1. **Save the arm's report** to `C:/_VIRTO/_comparison-logs/arm-<X>/report.md`.
2. **Check the log landed:** `ls C:/_VIRTO/_comparison-logs/arm-<X>/` should show a
   `tool-log-*.jsonl`.
3. **Check the deployment was left as asked** — cart empty, order cancelled, promotion disabled and
   not deleted. Record what is actually left, including anything the arm failed to clean up.
4. **The base must still be clean** after arms B and A — neither has one. After arm C, record what
   it wrote rather than reverting it.
5. Grade against `ORACLE.md`. Do not grade an arm while another is still to run: knowing arm B's
   score changes how arm A's report reads.

## After arm B specifically

Restore the QA repository's settings:

```powershell
Copy-Item "C:/Users/Danil/AppData/Local/Temp/claude/C---VIRTO-vc-kb-lab/c842f27b-698f-425c-a282-3ad38d7c3c33/scratchpad/settings.local.json.bak" C:/_VIRTO/vc-mcp-testing-module/.claude/settings.local.json -Force
```

That file carries a personal access token, so it is never committed, never printed, and never
copied anywhere but back to where it came from.
