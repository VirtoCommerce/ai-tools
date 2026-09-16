# "An order cannot be deleted on this platform" — it can

Raised by Danil asking whether the cancelled orders should have been deleted. Checked rather than
repeated.

## The claim, and where it has been riding

Every run brief since 07 has said it. The comparison's own `TASK.md` says it to every arm: *"An
order cannot be deleted on this platform — cancel what you place."* `CONDITIONS.md` lists the
accumulated cancelled orders as permanent residue on that basis.

**Three entries in the corpus assert it**, all written from the Admin UI:

    captured/KB-469AA660.md    what cancelling an order does to its shipment and its payment
    captured/KB-C51ACC81.md
    flows/KB-AFB2D3C5.md       "An order cannot be deleted once placed - only cancelled."

## What the contract says

The derived plane, projected from the deployment's own published surface:

    DELETE /api/order/customerOrders
    OrderModule_DeleteOrdersByIds
    "Delete a whole customer orders"  ->  204

**The platform deletes orders.**

**And so does the Admin UI.** The first version of this page said the UI had no button and offered
that as the explanation — *"the UI has no button" became "the platform cannot"*. **Danil sent a
screenshot: there is a Delete button in the Customer orders toolbar AND a Delete item in every row's
context menu.** The explanation was invented, not checked, which is precisely the failure this page
exists to report. It is struck rather than quietly edited.

So there is no excuse available, and I do not have one: the claim is false against the contract and
false against the UI, three entries assert it, and **how it originated is unknown.** Saying so is
better than the second plausible story in a row.

This is the corpus contradicting itself: **an experiential entry asserting a limit the derived
plane refutes.** The two planes disagree and nothing noticed, because nothing compares them — the
gate checks that entries are well-formed and that indexes match their contents, not that a written
claim survives the contract.

## What to do, and when

**Not now.** The corpus is frozen for the comparison, and `kb dispute` is a write.

**Not to the deployment either.** Arms B, C and B2 each ran against whatever the previous arm left,
and the residue has grown monotonically. Clearing it before arm A would give arm A conditions no
other arm had — cleaner than every arm it is being compared with. Keeping it makes arm A the natural
continuation, which is at least the same kind of condition the others met. Either way arm A sees the
most residue, and its record says so.

**After the comparison, three things:**

1. `kb dispute` the three entries — this is what the verb is for, and the dispute has a derived
   coordinate behind it rather than a second opinion.
2. Amend the flow's step, since `KB-AFB2D3C5` states it as a step's consequence. `kb amend` exists
   for exactly that and takes a deployment stamp.
3. Delete the cancelled orders on the deployment, if the endpoint behaves as the contract describes
   — **which is untested here.** A contract that publishes an operation is not proof the operation
   works; testing it means deleting a real order, and that is not a thing to try in the middle of an
   experiment that uses those orders as evidence.

## The bigger point

Three run briefs, twelve runs and a corpus all carried a limit that the platform's own contract
denies. It survived because **nobody asked the derived plane a question the experiential plane had
already answered** — and the derived plane is the one that cannot rot.

That is an argument for a gate that cross-checks the planes, and it is worth more than the cleanup.
