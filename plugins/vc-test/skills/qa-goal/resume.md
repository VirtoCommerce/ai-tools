# Resuming a run (step 0.3)

`goal.mjs init` resumes the newest unclosed run of this key and env (`resumed: true`). Read `goal.json`, then do
§1 and §2 in this order.

## 1. Carry the earlier spend over

`run-cost.mjs` reads this session's log only, and `goal.mjs cost` replaces the journal's reading. Without this step
a resumed run's budget gate sees only the new session's spend, and "no judged verdict past the budget"
([`goal-contract.md`](goal-contract.md) §The budget) would not hold.

- `contract` null ⇒ nothing to carry here: step 1 drafts the contract; deduct the journal's `cost` (when it is not
  null) from the budget in that draft, and say so in the S1 question.
- `cost` null ⇒ no spend is on record: go to §2.
- Else the remainder: `budget.tokens` − `cost.inputTotal` (round down) and `budget.wallMin` − `cost.wallMin`.
  Either below 1 ⇒ the budget stop ([`goal-contract.md`](goal-contract.md) §The stop list, 1). Otherwise:
  1. write `<dir>/in/contract.json` with the journal's `goal`, `done` and `stops` and the budget
     `{ "tokens": <remainder>, "wallMin": <remainder>, "researchShare": <unchanged> }`;
  2. `node <plugin>/lib/goal.mjs contract --dir <dir> --file <dir>/in/contract.json` (it clears the approval);
  3. one AskUserQuestion: what the earlier sessions spent and the budget left. *Approve* ⇒
     `goal.mjs contract --dir <dir> --approve --who '<who>'`, then
     `goal.mjs checkpoint --dir <dir> --stop S1 --decision approved --who '<who>' --note 'budget: resumed, earlier spend deducted'`.
     *Reject* ⇒ the abort close (SKILL.md §Stops).

The journal's `cost` is the earlier session's last reading: anything it spent after that reading is not on record.
The verdict's cost line says "resumed — earlier sessions deducted from their last reading".

## 2. Resume at the first row that holds

| Journal | Resume at |
|---|---|
| `contract` null | 1 |
| no `S2` checkpoint `approved` | 2 (re-read, not re-derived), then 3 while `in/research.md` has `open` items, else 4 |
| an AC `open` | 2, then 5 |
| an in-scope finding without `fixPriorityBy` | 2, then 6 (the fix-priority question) |
| `judge` null | 2, then 7 |
| `judge` REJECT, only `judge-1.md` on disk | 8, its round-1 REJECT |
| `judge` REJECT, `judge-1.md` and `judge-2.md` on disk | 8, its REJECT-twice stop — never the normal close |
| `closed` null | 9 |
