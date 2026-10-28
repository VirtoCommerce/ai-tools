#!/usr/bin/env node
/**
 * sign-webhook.mjs — send ONE Sanity webhook notification to ${BACK_URL}/api/pages/sanity, signed the
 * way Sanity signs it, for a suite-114 (VCST-6475) case step. Prints `HTTP <status>` then the body.
 * It never prints a secret (only which secret slot was used).
 *
 * Signature: header `sanity-webhook-signature: t=<unix ms>,v1=<base64url HMAC-SHA256(secret, "<t>.<raw body>")>`.
 * Body (the signed projection): { _id, _operation, _projectId, _dataset }; the sanity-* headers carry the
 * same values unless overridden.
 *
 * USAGE
 *   TEST_ENV=<env> npm run sanity:webhook -- --id <doc id> --op create|update|delete --dataset <name> [options]
 *     --project <id>          default {{SANITY_QA_PROJECT_ID}}
 *     --secret 0|1|none|<lit> 0/1 = {{SANITY_QA_WEBHOOK_SECRET_0/1}} (default 0); none = no signature header;
 *                             anything else is used AS the secret (negative cases: an unknown secret)
 *     --t-offset-ms N         shift the timestamp by N ms (e.g. -600000 = 10 min in the past)
 *     --t-seconds             timestamp in SECONDS instead of ms (a malformed-signature negative)
 *     --header-id X | --header-op X | --header-dataset X | --header-project X
 *                             override one sanity-* header (body keeps the real value → contradiction)
 *     --no-headers            send no sanity-* headers (body projection only)
 *     --empty-body            body `{}` (headers only)
 *     --title <t>             add a title to the signed body (SAN-001: a decoy the indexer must ignore)
 *     --store <id>            add storeId to the body
 *     --query <?k=v>          appended to the URL, e.g. ?cultureName=fr-FR
 *     --pad-bytes N           add a `pad` field of N bytes (oversized-body negative: > 10 MB default limit)
 *     --tamper-body           sign the body, then change one byte before sending
 *     --sig-format <f>        malformed header: no-v1 | v1-only | garbage | double-v1
 *     --dry-run               print the request (signature redacted to its shape), send nothing
 */
import '../../lib/sync-stdio.mjs';
import crypto from 'node:crypto';
import { BACK_URL } from '../../lib/seed-common.mjs';
import { ENV } from './sanity-specs.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f, d = undefined) => { const i = argv.indexOf(f); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const die = (m) => { console.error(`sign-webhook: ${m}`); process.exit(2); };

export function signature(secret, body, t) {
  return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('base64url')}`;
}

/** Pure request builder — exported for a temporary unit check; main() only runs when executed. */
export function buildRequest(o, env) {
  // `--project ""` is an explicit empty value (??, not ||); the env value is trimmed like seed-sanity does.
  const project = o.project ?? (String(env[ENV.projectId] ?? '').trim() || undefined);
  const projection = { _id: o.id, _operation: o.op, _projectId: project, _dataset: o.dataset };
  let bodyObj = o.emptyBody ? {} : projection;
  if (o.title !== undefined) bodyObj = { ...bodyObj, title: o.title };
  if (o.store) bodyObj = { ...bodyObj, storeId: o.store };
  if (o.padBytes > 0) bodyObj = { ...bodyObj, pad: 'x'.repeat(o.padBytes) };
  const signed = JSON.stringify(bodyObj);
  const headers = { 'Content-Type': 'application/json' };
  if (!o.noHeaders) {
    // A header is skipped when it has NO value (undefined/null — `--empty-body` without --id/--dataset must
    // not send "undefined"/"null"); an explicitly passed "" (--header-id "") is sent empty on purpose.
    const set = (name, v) => { if (v !== undefined && v !== null) headers[name] = String(v); };
    set('sanity-document-id', o.headerId ?? o.id);
    set('sanity-operation', o.headerOp ?? o.op);
    set('sanity-dataset', o.headerDataset ?? o.dataset);
    set('sanity-project-id', o.headerProject ?? project);
  }
  let secretLabel = 'none';
  if (o.secret !== 'none') {
    let secret;
    if (o.secret === '0' || o.secret === '1') { secret = env[ENV.webhookSecrets[Number(o.secret)]]; secretLabel = `{{${ENV.webhookSecrets[Number(o.secret)]}}}`; if (!secret) throw new Error(`${secretLabel} is not set (.env.local)`); }
    else { secret = o.secret; secretLabel = 'literal (negative)'; }
    const now = Date.now() + (o.tOffsetMs || 0);
    const t = o.tSeconds ? Math.floor(now / 1000) : now;
    let sig = signature(secret, signed, t);
    const v1 = sig.split('v1=')[1];
    if (o.sigFormat === 'no-v1') sig = `t=${t}`;
    else if (o.sigFormat === 'v1-only') sig = `v1=${v1}`;
    else if (o.sigFormat === 'garbage') sig = 'abc';
    else if (o.sigFormat === 'double-v1') sig = `t=${t},v1=AAAA,v1=${v1}`;
    else if (o.sigFormat) throw new Error(`unknown --sig-format ${o.sigFormat}`);
    headers['sanity-webhook-signature'] = sig;
  }
  let body = signed;
  // Still valid JSON with the same values — only the raw bytes differ, so a reject is the signature check alone.
  if (o.tamperBody) body = `${signed.slice(0, -1)} }`;
  return { url: `${String(o.backUrl).replace(/\/+$/, '')}/api/pages/sanity${o.query || ''}`, headers, body, secretLabel, bodyBytes: Buffer.byteLength(body) };
}

async function main() {
  const o = {
    id: opt('--id'), op: opt('--op', 'update'), dataset: opt('--dataset'), project: opt('--project'),
    secret: opt('--secret', '0'), tOffsetMs: Number(opt('--t-offset-ms', 0)), tSeconds: has('--t-seconds'),
    headerId: opt('--header-id'), headerOp: opt('--header-op'), headerDataset: opt('--header-dataset'), headerProject: opt('--header-project'),
    noHeaders: has('--no-headers'), emptyBody: has('--empty-body'), store: opt('--store'), title: opt('--title'), query: opt('--query', ''),
    padBytes: Number(opt('--pad-bytes', 0)), tamperBody: has('--tamper-body'), sigFormat: opt('--sig-format'), backUrl: BACK_URL,
  };
  if (!o.id && !o.emptyBody) die('--id is required (or --empty-body)');
  if (!o.dataset && !o.emptyBody) die('--dataset is required');
  if (!['create', 'update', 'delete'].includes(o.op) && !o.headerOp) die('--op must be create|update|delete');
  if (o.query && !o.query.startsWith('?')) die('--query must start with ?');
  if (!BACK_URL) die('BACK_URL is not set for this TEST_ENV');
  let req;
  try { req = buildRequest(o, process.env); } catch (e) { die(e.message); }
  const shown = { ...req.headers };
  if (shown['sanity-webhook-signature']) shown['sanity-webhook-signature'] = shown['sanity-webhook-signature'].replace(/v1=[^,]+/g, 'v1=<hmac>');
  console.error(`POST ${req.url}  secret=${req.secretLabel}  body=${req.bodyBytes} bytes`);
  console.error(`headers ${JSON.stringify(shown)}`);
  if (req.bodyBytes <= 400) console.error(`body ${req.body}`);
  if (has('--dry-run')) { console.log('HTTP (dry-run, not sent)'); return; }
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text.length > 2000 ? `${text.slice(0, 2000)}… (${text.length} chars, truncated)` : text);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error(`sign-webhook FAILED: ${e.message}`); process.exit(1); });
}
