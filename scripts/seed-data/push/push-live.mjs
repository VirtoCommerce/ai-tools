/**
 * push-live.mjs — network helpers shared by seed-push.mjs and validate-push-data.mjs (--live).
 *
 * Not a spec module: it talks to the platform. Everything declarative lives in push-specs.mjs.
 *
 * Recipient identity is resolved from the alias registry (CSV row by the alias `filter`, password via
 * user-provision.resolvePassword so a `{{VAR}}` cell resolves from .env.local), then CONFIRMED live
 * with the recipient's own storefront token (`me { id memberId }`). `memberIds` on a push takes the
 * MEMBER (contact) id, so `memberId` is the id that matters; the overlay's `contactId` is only a
 * cross-check.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BACK_URL, STORE_ID, ROOT, loadAliases, loadCsv } from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const TEST_ENV = process.env.TEST_ENV || 'vcst';

export function loadOverlay() {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

/** Read an inline alias's declared fields as numbers: { planKey: Number(alias[aliasField]) }. */
export function readThresholds(aliases, aliasName, mapping) {
  const def = aliases[aliasName];
  if (!def) throw new Error(`alias ${aliasName} is not registered in test-data/aliases.json`);
  const out = {};
  for (const [key, field] of Object.entries(mapping)) {
    const n = Number(def[field]);
    if (!Number.isInteger(n)) throw new Error(`${aliasName}.${field} is not an integer (got "${def[field]}")`);
    out[key] = n;
  }
  return out;
}

/** CSV-backed alias → its row, via the alias's own `filter`. */
export function aliasRow(aliases, aliasName) {
  const def = aliases[aliasName];
  if (!def?.file || !def.filter) throw new Error(`alias ${aliasName} is not a CSV-backed alias`);
  const [col, val] = Object.entries(def.filter)[0];
  const row = loadCsv(`test-data/${def.file}.csv`).find((r) => r[col] === val);
  if (!row) throw new Error(`alias ${aliasName}: no row in test-data/${def.file}.csv where ${col}=${val}`);
  return row;
}

export async function storefrontToken(email, password) {
  const body = new URLSearchParams({ grant_type: 'password', scope: 'offline_access', username: email, password, storeId: STORE_ID });
  const res = await fetch(`${BACK_URL}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`storefront token for ${email}: HTTP ${res.status} ${text.slice(0, 160)}`);
  return JSON.parse(text).access_token;
}

export async function gql(token, query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) throw new Error(`graphql: HTTP ${res.status} ${JSON.stringify(json.errors || json).slice(0, 300)}`);
  return json.data;
}

/** Resolve + sign in one recipient. Returns { alias, email, token, userId, memberId, overlayContactId }. */
export async function signInRecipient(aliases, aliasName) {
  const row = aliasRow(aliases, aliasName);
  const token = await storefrontToken(row.email, resolvePassword(row.password));
  const { me } = await gql(token, '{ me { id memberId } }');
  const overlay = loadOverlay()[aliasName] || {};
  return { alias: aliasName, email: row.email, token, userId: me?.id, memberId: me?.memberId, overlayContactId: overlay.contactId || null };
}

const INBOX_QUERY = `query($first: Int, $after: String) {
  pushMessages(first: $first, after: $after, withHidden: true) {
    totalCount
    pageInfo { hasNextPage endCursor }
    items { id shortMessage isRead isHidden createdDate }
  }
}`;

/** The caller's whole inbox, hidden rows included. Returns { totalCount, items }. */
export async function fetchInbox(token) {
  const items = []; let after = null; let totalCount = 0;
  for (let page = 0; page < 50; page++) {
    const { pushMessages: pm } = await gql(token, INBOX_QUERY, { first: 100, after });
    totalCount = pm.totalCount;
    items.push(...(pm.items || []));
    if (!pm.pageInfo?.hasNextPage) break;
    after = pm.pageInfo.endCursor;
  }
  return { totalCount, items };
}

export async function setRead(token, messageId, read) {
  const op = read ? 'markPushMessageRead' : 'markPushMessageUnread';
  const type = read ? 'InputMarkPushMessageReadType' : 'InputMarkPushMessageUnreadType';
  const data = await gql(token, `mutation($c: ${type}!) { ${op}(command: $c) }`, { c: { messageId } });
  if (data[op] !== true) throw new Error(`${op}(${messageId}) returned ${JSON.stringify(data[op])}`);
}

/**
 * Poll the recipient's inbox until every id in `ids` is present (the recipient rows are written by an
 * async Hangfire job after the message turns Sent — domain map §1 link 3). Returns the final inbox.
 */
export async function waitForMessages(token, ids, { timeoutMs = 180000, everyMs = 4000 } = {}) {
  const want = new Set(ids);
  const started = Date.now();
  for (;;) {
    const inbox = await fetchInbox(token);
    const seen = new Set(inbox.items.map((i) => i.id));
    const missing = [...want].filter((id) => !seen.has(id));
    if (!missing.length) return { inbox, waitedMs: Date.now() - started };
    if (Date.now() - started > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms: ${missing.length}/${want.size} message(s) never reached the inbox (${missing.join(', ')})`);
    await sleep(everyMs);
  }
}

/**
 * Live state of the PROTECTED accounts (push-specs PROTECTED). Returns one verdict per account:
 * { key, alias, ok, detail }. `isOurs` / `invariant` come from the spec so the rule is stated once.
 *   no-agent-test-messages        — no AGENT-TEST row in the inbox (hidden included) AND no push message
 *                                   (admin search) whose memberIds names the account's member id
 *   zero-messages-including-hidden — pushMessages(withHidden: true).totalCount === 0
 */
export async function protectedStateReport({ aliases, api, PROTECTED, isOurs }) {
  const out = [];
  let all = null;
  for (const [key, p] of Object.entries(PROTECTED)) {
    const who = await signInRecipient(aliases, p.recipientAlias);
    const inbox = await fetchInbox(who.token);
    if (p.invariant === 'zero-messages-including-hidden') {
      const ok = inbox.totalCount === 0;
      const sample = inbox.items.slice(0, 3).map((i) => `${i.id} "${String(i.shortMessage).replace(/<[^>]+>/g, '').slice(0, 40)}"`).join('; ');
      out.push({ key, alias: p.recipientAlias, ok, detail: `totalCount(withHidden)=${inbox.totalCount}${ok ? '' : ` — e.g. ${sample}`}` });
    } else if (p.invariant === 'no-agent-test-messages') {
      const ours = inbox.items.filter((i) => isOurs(i.shortMessage));
      all = all || await allPushMessages(api);
      const naming = all.filter((m) => (m.memberIds || []).includes(who.memberId));
      const ok = ours.length === 0 && naming.length === 0;
      out.push({ key, alias: p.recipientAlias, ok, detail: `AGENT-TEST rows in inbox=${ours.length}, messages naming member ${who.memberId}=${naming.length}${naming.length ? ` (${naming.slice(0, 3).map((m) => m.id).join(', ')})` : ''}; foreign rows=${inbox.totalCount - ours.length}` });
    } else {
      throw new Error(`unknown PROTECTED invariant "${p.invariant}" for ${key}`);
    }
  }
  return out;
}

/** Admin: every push message (all statuses). */
export async function allPushMessages(api) {
  const out = [];
  for (let skip = 0; skip < 20000; skip += 100) {
    const r = await api('POST', '/api/push-message/search', { skip, take: 100 });
    out.push(...(r?.results || []));
    if (!r?.results || r.results.length < 100) break;
  }
  return out;
}
