// Fix: env-level userId/memberId (type:default) override collection-set values when empty.
// Auth request now sets BOTH env and collection scopes for userId; profile request already does.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'collection.json');
const OUT = path.join(__dirname, 'collection.fixed.json');
const c = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const auth = c.collection.item.find(i => i.name === '00 :: Get Storefront User Token');
if (!auth) { console.error('Auth req not found'); process.exit(1); }
const ev = auth.event.find(e => e.listen === 'test');
ev.script.exec = [
  "pm.test('Auth: Status 200', () => pm.response.to.have.status(200));",
  "var d = pm.response.json();",
  "pm.test('Auth: access_token present', () => pm.expect(d.access_token).to.be.a('string'));",
  "pm.environment.set('authToken', d.access_token);",
  "try {",
  "  var payload = JSON.parse(atob(d.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));",
  "  if (payload.sub) {",
  "    // Set BOTH scopes — env wins resolution, collection scope as fallback",
  "    pm.environment.set('userId', payload.sub);",
  "    pm.collectionVariables.set('userId', payload.sub);",
  "    console.log('userId =', payload.sub);",
  "  }",
  "} catch (e) { console.warn('Could not decode JWT for userId:', e); }",
];

fs.writeFileSync(OUT, JSON.stringify(c.collection, null, 2));
console.log('Wrote', OUT);
