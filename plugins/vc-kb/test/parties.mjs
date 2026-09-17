// RUN A WRITING VERB AS SOMEBODY ELSE.
//
// `confirmationsOf` counts independent parties, not evidence rows, since 2026-09-16. A test that
// captures an entry and then confirms it in the same process is one party agreeing with itself,
// and reads 1 — correctly. Three tests were asserting 2 there, because the count used to be
// `evidence.length` while the trust LEVEL had already moved to `partiesOf`; the entry printed
// `confirmations: 2` and `single-observation` side by side and nobody noticed.
//
// A test that means "somebody else walked it again" has to say so. This is how it says so.

import { sessionParty } from '../src/provenance.mjs';

export function asAnotherParty(fn, who = 'aaaabbbb-0000-0000-0000-000000000000') {
  const wasClaude = process.env.CLAUDE_CODE_SESSION_ID;
  const wasKb = process.env.KB_SESSION_ID;
  process.env.CLAUDE_CODE_SESSION_ID = who;
  delete process.env.KB_SESSION_ID;
  try {
    return fn();
  } finally {
    if (wasClaude === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = wasClaude;
    if (wasKb === undefined) delete process.env.KB_SESSION_ID;
    else process.env.KB_SESSION_ID = wasKb;
  }
}

// If the environment names no session at all, every row is anonymous and each counts as its own
// party — so the helper would be a no-op and the tests using it would pass for the wrong reason.
export function sessionsAreIdentified() {
  return sessionParty() !== null;
}
