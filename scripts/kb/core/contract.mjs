// The kb write contract's strings a caller prints: where it is written down, where a `deployment`
// comes from, and what a scope is made of. A module of its own so that the Stop hook (`kb-remind`) and the renderer can name them
// without loading the ranker and the vocabulary that `door-hints.mjs` needs (PR #400 review). Its one
// import, `index-load.mjs`, is the surface vocabulary itself -- never transcribed here.
import { SURFACES } from './index-load.mjs';

export const CONTRACT = '.claude/knowledge/execution/kb-capture-contract.md';

/**
 * Where a `deployment` value comes from -- said by every write that takes one (capture, confirm,
 * dispute). No spelling rule: the door maps every alias of a stand onto its one name (VCST-6189,
 * `core/stands.mjs`), so `vcst`, `vcst-qa` and `vcst_qa` all land on the same stand.
 */
export const DEPLOYMENT_SOURCE = 'the stand you observed it on, as one token (vcst_qa, vcptcore_stable, or its TEST_ENV name)';

/** What `method` takes (VCST-6186) -- said by every write that takes one. */
export const METHOD_SOURCE = '"observation" (default): you saw it on a live stand, and deployment is that stand. '
  + '"source": you read it in code and did not see it live -- deployment is then the code version you read '
  + '(vc-platform@3.1078.0, VirtoCommerce.XCart@3.1041.0, vc-module-order@a1b2c3d), and readers are told it was not observed live';

/** What `conditions` holds (VCST-6179) -- said by every write that takes one. */
export const CONDITIONS_SOURCE = 'Optional, and expected on a dispute: what the stand was running and how it was set up, as '
  + '`key=value; key=value` -- the build (platform=3.1007.27, theme=2.59.0-pr-2476, module:VirtoCommerce.XCart=3.1037.0-pr-141) '
  + 'and any setting, store, role or feature flag the behaviour may depend on (setting:Loyalty.LoyaltyBalanceCalculationMode=Organization, '
  + 'role=Organization maintainer). Only what you actually read; never a credential';

/** What `defect` / `fixedIn` take (VCST-6317) -- said by capture and confirm. */
export const DEFECT_SOURCE = 'Optional: the behaviour you observed should NOT happen -- checked against the docs (VirtoOZ) or a BL-* rule first. '
  + 'A bug ticket of a public project (VCST-1234) or "suspected" (no ticket yet, or one in a private tracker); on a confirm, "none" withdraws a marker that proved wrong. '
  + 'fixedIn, once fixed: the first build without it, <module>@<version> (VirtoCommerce.XOrder@3.1001.0, platform@3.1080.0, theme@2.61.0). '
  + 'The claim still says what happens; readers are told never to assert it. Rules: ' + CONTRACT + ' §Defects';

export const SCOPE_SOURCE = `at least one axis=value, e.g. surface=<${SURFACES.join(' | ')}>`;
