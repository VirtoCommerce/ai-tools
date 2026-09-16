# Run 08 — conditions

What the instrument was when this run started. Written for whoever reads the measurement
afterwards.

**This page states no hypothesis and no expected result.** Run 07 read its own conditions page at
call 2, hypothesis and predicted answer included, and its verdict on the thing the run existed to
test stopped being independent. The prediction for this run is in the commit message that ships
this file — pre-registration a run does not read, verified: no `git log`, `git show` or archive
access in run 07's 302 calls.

## Tools

`vc-kb-lab` at the commit that adds this file. 132 node tests, plus 28 + 45 + 14 in
`vendor/agent-log`.

**Changed since run 07:** `kb capture`, `kb confirm` and `kb dispute` now record the platform
version and pin of the observation, read out of `derived/pin.json` when the observation was made on
the deployment the corpus was projected from. Before this, 54 of 54 evidence rows in the base
carried a deployment name and no version. On any other deployment nothing is stamped and the writer
is told to pass `--platform-version`; the entry is written either way.

`kb how <question>` is new, and `kb capture --flow` writes to the plane it reads. Nothing else in
the retrieval path changed: `relevanceFloor`, `SEARCH_OPTIONS` and `INDEX_OPTIONS` are as they were
for runs 06 and 07, and `kb ask` returns byte-identical results to run 07's on all 34 replay rows.

## Base

`vc-knowledge` — **590 derived + 40 captured active** (2 retired), pin `c2f9c438eba4cd95`,
platform `3.1007.26`, deployment `vcptcore_stable`.

**Changed since run 07:** the base gained a third plane, `flows/`, holding one entry —
`KB-AFB2D3C5`, a procedure distilled on 2026-09-14 from run 07's archived tool log rather than from
a fresh observation; its body says so. It is anchored on `/cart`, `/search` and `/account/orders`,
and it is the first entry in this base anchored on storefront routes at all: before it the only
route anchors anywhere were two on `/company/members`.

It is served by `kb how`, never by `kb ask`, and it arrives on its own from the coordinate hook.
`KB-C51ACC81` is the same procedure written into the experiential plane the day before and retired
there; its body records why. `kb validate` is green.

Run 07's six entries are in the base and describe the order's own fields. The task page says not to
re-derive them.

## The deployment

`vcptcore_stable`, unchanged. Residue a reader should know about:

* Order `CO260913-00001` — **Cancelled**, placed by run 07. Its shipment `SH260913-00001` is still
  `New`. Orders cannot be deleted.
* Contact the run-05 invitee (address in `MEASUREMENT-archive/run-05-invitation/`), id
  `c2d5087c-c1ec-4b24-a4db-bd3b23ae083d` — undeletable through UI or REST (`ConcurrencyFailure`).
  Not this run's to touch.
* No configurable product exists on this store. Two demand rows about them stand open and this
  run's task does not need one.

## Protocol

`RUN-BRIEF-unprompted.md`, unchanged since run 07 — including the closing gate, which was added
after run 07 left the corpus failing, correctly, having never been asked to check.

The run sets `KB_PHASE` from `orient|locate|understand|reproduce|change|diagnose|verify|restore|report`.
That list is the real one; a run that invents a phase vocabulary loses a row, which is how run 06
lost one.

## Session

`CLAUDE_CODE_HOST_SESSION_ID` is recorded by the hook and matched by the door, `log-row` and
`resolveSession`; a run sets nothing. **`reconcile.mjs` deliberately does not match on host** — it
is run afterwards by an analyst pointing at somebody else's directory, so the caller's own host id
would name the wrong log. Use `VC_MEASURE_SESSION=<run>` when reconciling.
