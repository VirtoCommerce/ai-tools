// The four exit states (PLAN §3.5), and the one invariant that makes them worth having.
//
// | 0 | answered      | entries + trust + provenance   | use them, cite the id
// | 1 | no coverage   | base read, nothing matched     | go find out, then `capture`
// | 2 | no base       | nothing was configured         | a config problem, not a knowledge one
// | 3 | unreachable   | the base was NOT read          | conclude nothing; retry
//
// THE INVARIANT: `unreachable` must never be able to collapse into `no coverage`. Collapse them
// and an agent that could not reach the base concludes "the base doesn't know", then guesses --
// or worse, writes a new entry duplicating one that already exists, so the base starts
// commissioning work it has already done.
//
// It is enforced here rather than trusted: `exitFor` is a total map over a closed set of state
// names, and an unrecognised state is 3 (could not ask) and never 1. Every path that could not
// establish coverage therefore has to name itself, and the accident -- an empty match list
// standing in for a failed read -- has nowhere to land.

export const EXIT = Object.freeze({
  ANSWER: 0,
  NO_COVERAGE: 1,
  NO_BASE: 2,
  UNREACHABLE: 3,
});

/**
 * The state names that may appear on a result, and nothing else is a state.
 *
 * `candidates` (STEP 6, VCST-6087): `ask` read the base and has entries that MIGHT answer -- the
 * judgement of whether one does is the agent's, so it is exit 0 like an answer, and the agent's
 * "none of these" is its own verb (`kb_none`), which lands as `recorded`. `miss` still means what it
 * always meant: the base was read and not one entry matched at all.
 */
export const STATES = Object.freeze(['answer', 'candidates', 'recorded', 'miss', 'no-base', 'unreachable']);

const BY_STATE = Object.freeze({
  answer: EXIT.ANSWER,
  candidates: EXIT.ANSWER,
  recorded: EXIT.ANSWER,
  miss: EXIT.NO_COVERAGE,
  'no-base': EXIT.NO_BASE,
  unreachable: EXIT.UNREACHABLE,
});

/**
 * State name -> exit code. Total: an unknown state is UNREACHABLE, never NO_COVERAGE, because
 * "I do not know what happened" is much closer to "I could not ask" than to "I asked and the
 * answer was nothing", and only one of those two errors makes an agent invent facts.
 */
export function exitFor(state) {
  return Object.hasOwn(BY_STATE, state) ? BY_STATE[state] : EXIT.UNREACHABLE;
}

/** What the caller is told, in the words PLAN §3.5 puts in each row. */
export const HEADLINE = Object.freeze({
  answer: 'answered from the base',
  // THE JUDGING INSTRUCTION, which is the whole of Stage 2: the base proposes, the agent decides. Both
  // doors are named for the same reason `miss` names both.
  candidates: 'these entries MIGHT answer your question — you decide. Pick the one that records the specific fact you '
    + 'asked about: open it with `kb_show <id>` / `npm run kb -- show <id>` (that records your pick, even for one shown '
    + 'below) and cite its id. Being about the same page or feature is NOT enough. If none of them answers it, say so '
    + 'with `kb_none` / `npm run kb -- none`, then go find out and record it with `kb_capture`.',
  recorded: 'recorded: none of the candidates answered your question. Go find out, then record it — `kb_capture`, or `npm run kb -- capture`.',
  // BOTH DOORS ARE NAMED, for the same reason the always-loaded line names both (PLAN §5.1): the
  // MCP server does not reach a clone until somebody registers `.mcp.json`, and the CLI does not
  // exist inside an MCP client. Naming one of them is a dead end for whichever reader has the other.
  miss: 'the base was read and holds nothing on this. Go find out, then record it — `kb_capture`, or `npm run kb -- capture`.',
  'no-base': 'no base is configured. This is a config problem, not a knowledge one.',
  unreachable: 'the base was NOT read. This is not "nothing is known" — conclude nothing; retry.',
});
