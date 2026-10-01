/**
 * push-specs.mjs — SINGLE SOURCE OF TRUTH for the Push Messages inbox fixtures (`npm run seed:push`).
 *
 * Side-effect-free: no fs, no network, no env. Imported by the seeder (seed-push.mjs), the drift guard
 * (validate-push-data.mjs) and the unit test (scripts/unit/push-specs.test.mjs).
 *
 * WHAT IS DECLARED HERE vs WHAT IS READ ELSEWHERE (GOLDEN RULE, .claude/rules/test-data.md):
 *   - the thresholds (≥11 visible, ≥1 read, ≥1 unread, 3 fresh) are NOT transcribed: they live in the
 *     `PUSH_DATA_READER_INBOX` / `PUSH_DATA_BULK` inline aliases, and the seeder + guard read them there;
 *   - the send contract (endpoint, Sent status, start date, topic prefix) lives in `PUSH_MSG_SEED`;
 *   - the storefront origin is `FRONT_URL`, resolved at runtime and passed in — no host literal here;
 *   - this file declares only the fixture's SHAPE (which alias plays which role) and the pure
 *     derivations the seeder runs (message bodies, the top-up plan, inbox classification).
 *
 * The four roles, and why each exists (test-data/models/push-messages.data-model.json):
 *   reader    — top-up to a MIXED inbox (read AND unread, more than one page) — `data.push.inbox.reader-mixed`
 *   bulk      — 3 FRESH unread every run, consumed by mark-all-read / clear-all — `data.push.inbox.bulk-fresh`
 *   bystander — PROTECTED: same org as the reader, must never be named in memberIds
 *   empty     — PROTECTED: must never have received ANY push, hidden included
 *
 * ISOLATION IS BY ACCOUNT, NOT BY TEARDOWN: a Sent push message can be neither edited nor deleted
 * (domain map §1 link 8), so nothing this seeder sends can be taken back.
 */

/** Every body this seeder writes starts with this — it is what makes a row "ours" in an inbox. */
export const BODY_PREFIX = 'AGENT-TEST-';

/** The storefront route the one link message points at (a real vc-frontend account route). */
export const LINK_ROUTE = '/account/orders';

/** Inline alias the send contract is read from. */
export const SEND_CONTRACT_ALIAS = 'PUSH_MSG_SEED';

/**
 * The populated inboxes. `thresholdsAlias` names the inline alias whose fields carry the numbers —
 * `fields` maps the plan key to the alias field. `writeback` names the fields the seeder writes to
 * aliases.<env>.json for this inbox.
 */
export const INBOXES = Object.freeze({
  reader: Object.freeze({
    recipientAlias: 'PUSH_RECIPIENT_READER',
    requirement: 'data.push.inbox.reader-mixed',
    mode: 'top-up',
    thresholdsAlias: 'PUSH_DATA_READER_INBOX',
    thresholds: Object.freeze({ minVisible: 'min_visible_messages', minRead: 'min_read', minUnread: 'min_unread' }),
    writeback: Object.freeze(['link_message_id']),
  }),
  bulk: Object.freeze({
    recipientAlias: 'PUSH_RECIPIENT_BULK',
    requirement: 'data.push.inbox.bulk-fresh',
    mode: 'fresh',
    thresholdsAlias: 'PUSH_DATA_BULK',
    thresholds: Object.freeze({ fresh: 'min_visible_unread' }),
    writeback: Object.freeze(['batch_marker', 'batch_message_ids']),
  }),
});

/** Accounts NO push may ever target. The seeder refuses to run if one resolves to a send target. */
export const PROTECTED = Object.freeze({
  bystander: Object.freeze({
    recipientAlias: 'PUSH_RECIPIENT_BYSTANDER',
    requirement: 'data.push.recipient.bystander',
    // what must hold: no AGENT-TEST row in the inbox (hidden included), no Sent message naming it
    invariant: 'no-agent-test-messages',
  }),
  empty: Object.freeze({
    recipientAlias: 'PUSH_RECIPIENT_EMPTY',
    requirement: 'data.push.inbox.empty',
    // what must hold: pushMessages(withHidden: true).totalCount === 0 — ANY message ends the state
    invariant: 'zero-messages-including-hidden',
  }),
});

/** Aliases a message is ever sent to — derived, so the guard can prove it never meets PROTECTED. */
export function sendTargetAliases() {
  return Object.values(INBOXES).map((i) => i.recipientAlias);
}

/**
 * Body templates of deliberately different lengths (short / medium / long) so the bell dropdown and
 * the Notifications page are exercised on wrapping and truncation, not on one uniform line.
 * Plain text only; the ONE link message is built by linkMessageBody().
 */
const FILLER = [
  'Your account notifications are working.',
  'A reminder about your organization account: review your open quotes and recent orders when you have a moment, then mark this message as read.',
  'This is a longer notification used to check how the storefront lays out a multi-line message. It keeps going past a single line on a desktop '
    + 'viewport so that the bell dropdown has to truncate it and the Notifications page has to wrap it, which is exactly the rendering path a '
    + 'short message never reaches. Nothing in it needs any action.',
];

/**
 * Build `count` plain-text bodies for one inbox, numbered from `startIndex`, all carrying `marker`
 * (so one run's batch can be told apart from another's) and cycling through the three lengths.
 */
export function buildMessageBodies({ inboxKey, marker, count, startIndex = 1 }) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`buildMessageBodies: count must be a non-negative integer (got ${count})`);
  const out = [];
  for (let k = 0; k < count; k++) {
    const n = startIndex + k;
    out.push(`${BODY_PREFIX}${inboxKey}-${marker}-${String(n).padStart(2, '0')}: ${FILLER[(n - 1) % FILLER.length]}`);
  }
  return out;
}

/** The one message whose body carries an anchor to a real storefront route. `frontUrl` is FRONT_URL. */
export function linkMessageBody({ marker, frontUrl }) {
  const origin = String(frontUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error(`linkMessageBody: frontUrl must be an http(s) origin (got "${frontUrl}")`);
  return `${BODY_PREFIX}reader-${marker}-link: Your order history is available. <a href="${origin}${LINK_ROUTE}">View your orders</a>`;
}

/** True when a body is this seeder's link message (the href ends on LINK_ROUTE). */
export function isLinkMessage(body) {
  return isOurs(body) && new RegExp(`href="[^"]*${LINK_ROUTE.replace(/\//g, '\\/')}"`).test(String(body));
}

/** A row is ours when its body starts with BODY_PREFIX, ignoring a leading HTML wrapper (<p>). */
export function isOurs(body) {
  return String(body || '').replace(/^(\s*<[^>]+>)+/, '').startsWith(BODY_PREFIX);
}

/**
 * Classify one inbox's rows (xAPI PushMessageType[]: {id, shortMessage, isRead, isHidden}).
 * Counts only OUR rows — a tracked message from another sender can land in any AGENT-TEST inbox
 * (Track new recipients + a free-text memberQuery), and it must not satisfy the fixture's thresholds.
 */
export function classifyInbox(items) {
  const ours = (items || []).filter((i) => isOurs(i.shortMessage));
  const visible = ours.filter((i) => !i.isHidden);
  const read = visible.filter((i) => i.isRead);
  const unread = visible.filter((i) => !i.isRead);
  return {
    total: (items || []).length,
    ours: ours.length,
    visible: visible.length,
    read: read.length,
    unread: unread.length,
    hidden: ours.length - visible.length,
    linkVisible: visible.some((i) => isLinkMessage(i.shortMessage)),
    readIds: read.map((i) => i.id),
    unreadIds: unread.map((i) => i.id),
  };
}

/**
 * The reader TOP-UP plan. Given what the inbox holds now (classifyInbox) and the thresholds, return how
 * many messages to send and how many read flags to move so that afterwards
 *     visible ≥ minVisible, read ≥ minRead, unread ≥ minUnread   (⇒ unread < visible)
 * and a visible link message exists. New messages arrive UNREAD. A second run on a satisfied inbox
 * returns all zeros — that is the idempotency contract.
 */
export function planReaderTopUp(state, { minVisible, minRead, minUnread }) {
  for (const [k, v] of Object.entries({ minVisible, minRead, minUnread })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`planReaderTopUp: ${k} must be a non-negative integer (got ${v})`);
  }
  if (minRead + minUnread > minVisible) throw new Error(`planReaderTopUp: minRead + minUnread (${minRead + minUnread}) exceeds minVisible (${minVisible})`);
  const includeLink = !state.linkVisible;
  const plain = Math.max(0, minVisible - state.visible - (includeLink ? 1 : 0));
  const send = plain + (includeLink ? 1 : 0);
  const readAfterSend = state.read;
  const unreadAfterSend = state.unread + send;
  const markRead = Math.max(0, minRead - readAfterSend);
  const markUnread = Math.max(0, minUnread - (unreadAfterSend - markRead));
  return { send, plain, includeLink, markRead, markUnread };
}

/** A run marker: UTC date + time to the minute, e.g. 20260929T1512 — distinguishes one run's batch. */
export function runMarker(date) {
  return date.toISOString().replace(/[-:]/g, '').slice(0, 13);
}
