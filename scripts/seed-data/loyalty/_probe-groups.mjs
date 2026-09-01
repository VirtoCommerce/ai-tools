/* TEMPORARY PROBE — delete after use. Reads group membership for candidate loyalty users. */
import { api, auth, assertSafeTarget } from '../../lib/seed-common.mjs';
import { USER_ROLES, resolveRole } from '../../lib/user-roles.mjs';

const KEYS = ['USER', 'LOYALTY_VIP_USER', 'LOYALTY_NOBAL_USER', 'LOYALTY_WHOLESALE_USER', 'USER2', 'EUR_USER'];

async function main() {
  assertSafeTarget();
  await auth();
  for (const key of KEYS) {
    const decl = USER_ROLES.find((r) => r.key === key);
    if (!decl) { console.log(`${key}: NOT DECLARED`); continue; }
    const role = resolveRole(decl);
    if (!role.email) { console.log(`${key}: no email resolved from ${decl.emailVars.join('|')}`); continue; }
    const acct = await api('GET', `/api/platform/security/users/${encodeURIComponent(role.email)}`, null, { expectStatus: [200, 404] });
    let member = null;
    if (acct?.memberId) {
      member = await api('GET', `/api/members/${encodeURIComponent(acct.memberId)}`, null, { expectStatus: [200, 404] });
    }
    console.log(`${key}
  email        ${role.email}
  declaredGrp  ${decl.group ?? '(none)'}
  account.id   ${acct?.id || '(absent)'}
  memberId     ${acct?.memberId || '(none)'}
  member.type  ${member?.memberType || '(n/a)'}
  member.groups ${JSON.stringify(member?.groups ?? null)}
  acct.roles   ${JSON.stringify((acct?.roles || []).map((r) => r.name))}
  acct.userType ${acct?.userType || ''}`);
  }
}

main().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
