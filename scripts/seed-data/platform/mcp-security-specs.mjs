/**
 * scripts/seed-data/platform/mcp-security-specs.mjs
 *
 * SINGLE source of truth (side-effect-free) for the back-office accounts VCST-6155 needs — the MCP
 * module's back-office endpoint (/admin/mcp): tool approvals, the kill switch, and the System
 * Operations tools an agent may call on a user's behalf. Imported by the seeder
 * (seed-mcp-security.mjs) and the drift guard (validate-mcp-security-data.mjs); no env load, no network.
 *
 * Four Manager accounts (isAdministrator=false, emailConfirmed, not locked). Each answers one link of
 * the chain, and the guard fails when two of them stop disagreeing on the permission that link reads:
 *
 *   MCP_OPERATOR  — the existing SHARED role "IT Platform Operator": the System Operations tool
 *                   permissions + mcp:audit:read, and NOT mcp:approve / mcp:manage. It requests a
 *                   tool call but cannot approve it. The role belongs to the stand, so the seeder
 *                   READS it and fails loud when it drifted — it never writes or deletes it.
 *   MCP_APPROVER  — AGENT-TEST-MCP-Approver: mcp:approve + mcp:audit:read and NO tool permission. A
 *                   different user from the operator, so "an approver is not the requester" can fail.
 *   MCP_MANAGER   — AGENT-TEST-MCP-Manager: mcp:manage + mcp:audit:read and NOT mcp:approve (tool
 *                   switches / connected agents of everyone, without the right to approve).
 *   MCP_NOROLE    — no role at all: "a user without the role sees no System Operations tools".
 *
 * Permission names read live on vcst 2026-11-09 from GET /api/platform/security/permissions
 * (VirtoCommerce.MCP 3.1000.0-pr-1-df74, VirtoCommerce.SystemOperations 3.1003.0-pr-5-37af).
 * `platform:access` does not exist on this build (kb KB-2E5408CA); userType Manager is what opens the
 * back office, so the AGENT-TEST roles carry nothing beyond the MCP permissions they test.
 *
 * No runtime GUID lives here: emails and role names are business keys; the runtime user ids and
 * role ids land in test-data/aliases.<env>.json (writeEnvAliasOverride). Every account's password
 * is the {{DEFAULT_TEST_PASSWORD}} token, resolved at seed time by user-provision.mjs resolvePassword().
 */

export const AGENT_PREFIX = 'AGENT-TEST-';
export const PASSWORD_TOKEN = '{{DEFAULT_TEST_PASSWORD}}';

// The System Operations tool permissions, and the three MCP permissions.
export const TOOL_PERMISSIONS = ['systemoperations:diagnostics:read', 'cache:reset', 'platform:module:manage'];
export const MCP_APPROVE = 'mcp:approve';
export const MCP_MANAGE = 'mcp:manage';
export const MCP_AUDIT_READ = 'mcp:audit:read';
/** Every permission any of the four fixtures is defined by — the NOROLE account must hold none. */
export const ALL_MCP_FIXTURE_PERMISSIONS = [...TOOL_PERMISSIONS, MCP_APPROVE, MCP_MANAGE, MCP_AUDIT_READ];

/**
 * Roles. `owned: false` = a stand-owned role: read and checked, never PUT, never deleted. Its
 * `permissions` is what the cases EXPECT it to hold; the seeder compares it with GET roles/{name}
 * (roles/search returns permissions: [] for every role — kb KB-49F6B6EF).
 */
export const OPERATOR_ROLE = {
  role_name: 'IT Platform Operator',
  owned: false,
  permissions: [...TOOL_PERMISSIONS, MCP_AUDIT_READ],
};
/**
 * Used ONLY when a stand has no "IT Platform Operator" role: an owned AGENT-TEST role with the same
 * permissions, so the operator account still exists. The seeder says so when it falls back, and
 * --teardown deletes it (it never touches the stand-owned one).
 */
export const OPERATOR_FALLBACK_ROLE = {
  role_id: 'AGENT-TEST-MCP-Operator',
  role_name: 'AGENT-TEST-MCP-Operator',
  owned: true,
  description: 'AGENT-TEST stand-in for the "IT Platform Operator" role (VCST-6155), created only where that role is missing: the System Operations tool permissions + mcp:audit:read, NO mcp:approve / mcp:manage. Safe to delete.',
  permissions: [...OPERATOR_ROLE.permissions],
};
export const APPROVER_ROLE = {
  role_id: 'AGENT-TEST-MCP-Approver',
  role_name: 'AGENT-TEST-MCP-Approver',
  owned: true,
  description: 'AGENT-TEST back-office role for VCST-6155 (MCP approvals): mcp:approve + mcp:audit:read, NO System Operations tool permission and NO mcp:manage. Safe to delete.',
  permissions: [MCP_APPROVE, MCP_AUDIT_READ],
};
export const MANAGER_ROLE = {
  role_id: 'AGENT-TEST-MCP-Manager',
  role_name: 'AGENT-TEST-MCP-Manager',
  owned: true,
  description: 'AGENT-TEST back-office role for VCST-6155 (MCP tool switches / connected agents): mcp:manage + mcp:audit:read, NO mcp:approve and NO System Operations tool permission. Safe to delete.',
  permissions: [MCP_MANAGE, MCP_AUDIT_READ],
};

/** What each account must and must not hold, as /currentuser reports it. */
export const ACCOUNTS = [
  {
    aliasName: 'MCP_OPERATOR',
    email: 'AGENT-TEST-mcp-operator@test.virtocommerce.com',
    role: OPERATOR_ROLE,
    required: [...OPERATOR_ROLE.permissions],
    excluded: [MCP_APPROVE, MCP_MANAGE],
  },
  {
    aliasName: 'MCP_APPROVER',
    email: 'AGENT-TEST-mcp-approver@test.virtocommerce.com',
    role: APPROVER_ROLE,
    required: [...APPROVER_ROLE.permissions],
    excluded: [...TOOL_PERMISSIONS, MCP_MANAGE],
  },
  {
    aliasName: 'MCP_MANAGER',
    email: 'AGENT-TEST-mcp-manager@test.virtocommerce.com',
    role: MANAGER_ROLE,
    required: [...MANAGER_ROLE.permissions],
    excluded: [...TOOL_PERMISSIONS, MCP_APPROVE],
  },
  {
    aliasName: 'MCP_NOROLE',
    email: 'AGENT-TEST-mcp-norole@test.virtocommerce.com',
    role: null,
    required: [],
    excluded: [...ALL_MCP_FIXTURE_PERMISSIONS],
  },
].map((a) => ({ ...a, userType: 'Manager', isAdministrator: false, password: PASSWORD_TOKEN }));

export const CURRENTUSER_ENDPOINT = '/api/platform/security/currentuser';

/** Idempotent role upsert body (PUT /api/platform/security/roles) — owned roles only. */
export function roleBody(role) {
  if (!role?.owned) throw new Error(`refusing to build a write body for the stand-owned role "${role?.role_name}"`);
  return { id: role.role_id, name: role.role_name, description: role.description, permissions: role.permissions.map((name) => ({ name })) };
}

/** POST /api/platform/security/users/create body. `roleRef` = { id, name } or null for NOROLE. */
export function accountBody(account, { password, storeId, roleRef }) {
  return {
    userName: account.email,
    email: account.email,
    password,
    storeId,
    userType: account.userType,
    isAdministrator: account.isAdministrator,
    emailConfirmed: true,
    roles: roleRef ? [roleRef] : [],
  };
}

/**
 * The decidability contract (SECOND RULE). Returns a list of problems; [] = the four accounts still
 * disagree on every permission a case reads. Pure — the guard calls it on the spec, the seeder on
 * the live role it read.
 */
export function decidabilityProblems(accounts = ACCOUNTS) {
  const p = [];
  const by = Object.fromEntries(accounts.map((a) => [a.aliasName, a]));
  for (const a of accounts) {
    const granted = new Set(a.role?.permissions || []);
    const missing = a.required.filter((x) => !granted.has(x));
    const leaked = a.excluded.filter((x) => granted.has(x));
    if (missing.length) p.push(`${a.aliasName}: role does not grant required ${missing.join(', ')}`);
    if (leaked.length) p.push(`${a.aliasName}: role grants excluded ${leaked.join(', ')}`);
    if (a.isAdministrator !== false) p.push(`${a.aliasName}: isAdministrator must be false (an administrator bypasses every check)`);
    if (a.userType !== 'Manager') p.push(`${a.aliasName}: userType must be Manager (back-office account)`);
    if (!a.email.startsWith(AGENT_PREFIX)) p.push(`${a.aliasName}: email must start with ${AGENT_PREFIX}`);
    if (a.password !== PASSWORD_TOKEN) p.push(`${a.aliasName}: password must be the ${PASSWORD_TOKEN} token`);
  }
  const has = (name, perm) => (by[name]?.role?.permissions || []).includes(perm);
  // Requester vs approver: only the approver approves, only the operator runs tools.
  if (has('MCP_OPERATOR', MCP_APPROVE) || !has('MCP_APPROVER', MCP_APPROVE)) p.push('approve: MCP_APPROVER must hold mcp:approve and MCP_OPERATOR must not');
  for (const t of TOOL_PERMISSIONS) if (!has('MCP_OPERATOR', t) || has('MCP_APPROVER', t) || has('MCP_NOROLE', t)) p.push(`tool ${t}: only MCP_OPERATOR may hold it`);
  // Manage vs approve: two different rights, so the two accounts must not share either.
  if (!has('MCP_MANAGER', MCP_MANAGE) || has('MCP_APPROVER', MCP_MANAGE) || has('MCP_MANAGER', MCP_APPROVE)) p.push('manage: MCP_MANAGER must hold mcp:manage without mcp:approve, MCP_APPROVER must not hold mcp:manage');
  if ((by.MCP_NOROLE?.role)) p.push('MCP_NOROLE must have no role');
  const emails = accounts.map((a) => a.email.toLowerCase());
  if (new Set(emails).size !== emails.length) p.push('every fixture must be a different user (distinct emails)');
  return p;
}

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Runtime GUIDs in a text that must never be committed (spec module, aliases.json entry). */
export function findGuidLeaks(text) { return String(text).match(GUID_RE) || []; }
