// HOW BIG THE CATALOG MAY GET BEFORE NOBODY READS IT.
//
// The redesign hands the written catalog to an agent in its prompt instead of making it search.
// That works because there are 78 active entries and the catalog is 13.8 KB — about 3,400 tokens,
// or 1.7% of a 200k window. Capacity is not the constraint and will not be for a long time: at the
// current 151 bytes a row there is room for a thousand entries inside 10% of the window.
//
// THE CONSTRAINT IS ATTENTION. A list of 78 one-line claims gets read. A list of 500 gets skimmed,
// and a skimmed list is retrieval again — performed by the reader, over rows sorted by an id that
// is a hash. The thing that fails is not the context window; it is the reading.
//
// NOBODY KNOWS WHERE THAT LINE IS. The threshold below is a GUESS, labelled as one, set at roughly
// double the present size so it cannot fire today and will fire well before anything is hopeless.
// It exists so the question is asked by the tool rather than remembered by a person.
//
// It is meant to be REPLACED BY A MEASUREMENT, not tuned. The next live run records the POSITION in
// the catalog of every entry the agent opens. If opens cluster in the first rows, the attention
// limit has been measured and this guess can be retired.

export const CATALOG_BUDGET = {
  // Rows, counting retired entries, because a reader scanning the list reads those too.
  rows: 150,
  // Bytes of catalog. Both are checked: a format change can blow the byte budget without adding a
  // single entry, and adding entries can blow the row budget while the bytes look calm.
  bytes: 25_000,
  basis: 'a guess at roughly double the 2026-09-16 size (89 rows, 13.8 KB), not a measurement',
};

/** Roughly what a catalog costs to carry in a prompt. Bytes/4 is the usual English approximation; */
/** this table is heavier per byte than prose because ids and pipes tokenise badly, so it reads low. */
export const approxTokens = (bytes) => Math.round(bytes / 4);

/**
 * A notice when the catalog is approaching the size at which handing it over stops working.
 *
 * Returns null while there is room. Never a problem, always a notice: a corpus that grows past a
 * guess has not failed a rule, it has reached the point where the guess should be replaced.
 */
export function catalogBudgetNotice({ rows, bytes, label = 'captured-catalog.md' }) {
  const overRows = rows > CATALOG_BUDGET.rows;
  const overBytes = bytes > CATALOG_BUDGET.bytes;
  if (!overRows && !overBytes) return null;

  const which = [
    overRows ? `${rows} rows against a budget of ${CATALOG_BUDGET.rows}` : null,
    overBytes ? `${bytes} bytes (~${approxTokens(bytes)} tokens) against ${CATALOG_BUDGET.bytes}` : null,
  ].filter(Boolean).join(' and ');

  return `${label} is past its budget: ${which}. The budget is ${CATALOG_BUDGET.basis}. `
    + 'This is not about the context window — 1.7% of one held 89 rows, and there is room for a '
    + 'thousand. It is about whether the list is still READ. Past this point, either measure where '
    + 'attention actually falls off (the run records the catalog position of every entry an agent '
    + 'opens) or decide what stops being in the list — and then sort what remains by something '
    + 'load-bearing, because it is sorted by id today and an id is a hash.';
}
