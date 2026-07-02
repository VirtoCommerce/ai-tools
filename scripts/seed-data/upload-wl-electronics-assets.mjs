/**
 * One-off: upload WL Electronics (WL-ORG-A) logo/secondary-logo/favicon to the
 * platform asset storage exactly the way the White Labeling admin blades do
 * (POST /api/assets?folderUrl=customization[/favicons]), then persist the
 * returned asset URLs onto the org's white-labeling config.
 *
 * Mirrors vc-module-white-labeling white-labeling-logo.js / white-labeling-favicon.js:
 *   logo/secondaryLogo -> folderUrl=customization           (png/gif/svg)
 *   favicon            -> folderUrl=customization/favicons   (png/jpg/jpeg/webp)
 *   filename           -> {kind}_{entityId}_{timestamp}.{ext}
 *   config url         -> uploadedImages[0].url
 *
 * Run: node scripts/seed-data/upload-wl-electronics-assets.mjs
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BACK_URL, ADMIN, ADMIN_PASSWORD, ROOT } from '../lib/seed-common.mjs';

const ORG_ID = '5c3fcbf6-8105-4ea7-9e62-9bdfd5a20610'; // WL-ORG-A Electronics Store
const TS = Date.now();

const ASSETS = [
  { kind: 'logo',           file: 'test-data/uploads/wl-electronics-logo.png',           folder: 'customization',           type: 'image/png',  cfg: 'logoUrl' },
  { kind: 'secondary_logo', file: 'test-data/uploads/wl-electronics-logo-secondary.png', folder: 'customization',           type: 'image/png',  cfg: 'secondaryLogoUrl' },
  { kind: 'favicon',        file: 'test-data/uploads/wl-electronics-favicon.webp',       folder: 'customization/favicons',  type: 'image/webp', cfg: 'faviconUrl' },
];

async function getToken() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function uploadAsset(token, a) {
  const ext = a.file.split('.').pop();
  const name = `${a.kind}_${ORG_ID}_${TS}.${ext}`;
  const bytes = await readFile(join(ROOT, a.file));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: a.type }), name);
  const res = await fetch(`${BACK_URL}/api/assets?folderUrl=${encodeURIComponent(a.folder)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${name} -> ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  const uploaded = await res.json();
  const info = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  if (!info?.url) throw new Error(`upload ${name}: no .url in response ${JSON.stringify(info).slice(0, 200)}`);
  return info.url;
}

async function main() {
  const token = await getToken();
  console.log('Auth: OK');

  const urls = {};
  for (const a of ASSETS) {
    const url = await uploadAsset(token, a);
    urls[a.cfg] = url;
    console.log(`  uploaded ${a.kind.padEnd(15)} -> ${url}`);
  }

  // Fetch current config, merge the new asset URLs, PUT back
  const authHdr = { Authorization: `Bearer ${token}` };
  const getRes = await fetch(`${BACK_URL}/api/white-labeling/organization/${ORG_ID}`, { headers: authHdr });
  const cur = getRes.ok ? await getRes.json() : {};
  const body = {
    id: cur.id,
    organizationId: ORG_ID,
    isEnabled: true,
    mainMenuLinkListName: cur.mainMenuLinkListName ?? 'main-menu-electronics',
    footerLinkListName: cur.footerLinkListName ?? 'footer-electronics',
    themePresetName: cur.themePresetName ?? 'Watermelon',
    logoUrl: urls.logoUrl,
    secondaryLogoUrl: urls.secondaryLogoUrl,
    faviconUrl: urls.faviconUrl,
  };
  const method = cur?.id ? 'PUT' : 'POST';
  const putRes = await fetch(`${BACK_URL}/api/white-labeling`, {
    method,
    headers: { ...authHdr, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (![200, 201, 204].includes(putRes.status)) {
    throw new Error(`${method} /api/white-labeling -> ${putRes.status}: ${(await putRes.text().catch(() => '')).slice(0, 300)}`);
  }
  console.log(`  WL config ${method}: OK`);

  // Verify each asset URL is now reachable (200)
  console.log('\nVerifying asset URLs:');
  for (const cfg of ['logoUrl', 'secondaryLogoUrl', 'faviconUrl']) {
    const u = urls[cfg];
    const abs = u.startsWith('http') ? u : `${BACK_URL}${u.startsWith('/') ? '' : '/'}${u}`;
    const r = await fetch(abs, { method: 'GET' });
    console.log(`  ${r.status}  ${cfg.padEnd(16)} ${abs}`);
  }

  // Emit machine-readable result for the caller
  console.log('\nRESULT_JSON=' + JSON.stringify(urls));
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
