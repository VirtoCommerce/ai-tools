// HOW A FACT WAS ESTABLISHED (VCST-6186): observed on a live stand, or read from source code.
//
// The base holds what agents OBSERVED. A fact read from code -- how AbstractTypeFactory overrides a
// type, which handler a setting reaches -- had no place in it: written anyway, it passed as an
// observation (`method` was free text nothing read), and kept out, it was lost and the next agent read
// the same code again (2 of the 8 unclosed misses of 2026-09-30..10-06 were source questions).
//
// So `method` is a CLOSED vocabulary:
//   * `observation` (the default) -- seen on a live stand; `deployment` names the stand (VCST-6189).
//   * `source` -- read from code; `deployment` names the CODE VERSION it was read from,
//     `<repo or module>@<version or commit>` (`vc-platform@3.1078.0`, `VirtoCommerce.XCart@3.1041.0`,
//     `vc-module-order@a1b2c3d`). A source fact holds for a version, not for a stand, so the stand map
//     and the build stamp do not apply to it.
// Anything else is refused at the door. What a source fact may claim, and how it is shown and upgraded,
// is the contract's (`.claude/knowledge/execution/kb-capture-contract.md` §Facts read from source code).

export const METHODS = Object.freeze(['observation', 'source']);
export const CODE_VERSION = /^[A-Za-z][\w.-]{0,79}@[\w.+-]{1,60}$/;

/** `{ value }` -- the method, `observation` when none was given -- or `{ problem }`. */
export function resolveMethod(raw) {
  const m = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!m) return { value: 'observation' };
  if (METHODS.includes(m)) return { value: m };
  return { problem: `method "${String(raw).slice(0, 40)}" is not one of ${METHODS.join(', ')} -- \`observation\` for what you saw on a live stand (the default), \`source\` for what you read in code; how you looked goes in the claim or note` };
}

/** Why a SOURCE fact's `deployment` is not a code version, or null. */
export function codeVersionProblem(deployment) {
  const d = typeof deployment === 'string' ? deployment.trim() : '';
  if (CODE_VERSION.test(d)) return null;
  return `with method source, deployment is the code version you read: <repo or module>@<version or commit> (vc-platform@3.1078.0, VirtoCommerce.XCart@3.1041.0, vc-module-order@a1b2c3d)${d ? `, not "${d.slice(0, 40)}"` : ''}`;
}

/** An evidence item read from code. Anything but exactly `source` -- legacy free text included -- is an observation. */
export const isSource = (e) => String(e?.method ?? '').trim().toLowerCase() === 'source';
