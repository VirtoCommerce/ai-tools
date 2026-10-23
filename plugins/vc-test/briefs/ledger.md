# Brief — the ledger (every entity you create, every setting you change)

The run tears down from its ledger only (spec §6a Teardown), so whatever you create or change and do not record stays
on the stand. Create or change data only when `CAPABILITIES`' `stand.writable` is `true`.

**Record it at once, one call per entity, and only with this command** — never with Write or Edit and never by hand:
the agents of a wave share the file, and the command appends and stamps the time, the env and the stand. `<plugin>`
is the folder above this brief's.

    node <plugin>/lib/ledger.mjs append --key <KEY> --by <your step> --item <C-n> --entity <type> --id <platform id>

- `--entity` — one of the types `node <plugin>/lib/ledger.mjs types` prints. `--id` is the id the platform
  returned — never a name, an email or a prefix.
- **A setting:** `--id` is its name (`<storeId>/<name>` for a store's), plus `--before <json>` and `--after <json>` —
  its `value` as the platform returns it, read before your change and after it (`true`, `5`, `'"text"'`). Teardown
  puts `before` back only while the stand still holds your `after`; one that someone else changed goes to a human.
- **Anything else** you create: `--entity other --id <what it is> --note "<how to undo it>"` — it goes to a human.
- Exit 1 ⇒ the line was refused: fix what it names and run it again. A line you could not record is a line in your
  return, never a silent gap.
