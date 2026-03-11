/**
 * B2B Test Data Loader
 *
 * Loads seeded test data (organizations, contacts, users) from _seed-results-orgs.json
 * and provides lookup helpers for agents and test scripts.
 *
 * Usage:
 *   import { b2b } from './test-data/b2b/load-test-data.js';
 *
 *   b2b.orgByName('AcmeCorp')        // → { id, name }
 *   b2b.contactByRole('Buyer')        // → { id, name, email, orgKey, role, status }
 *   b2b.userByRole('Org Admin')       // → { id, userName, email, contactId, ... }
 *   b2b.usersForOrg('AcmeCorp')       // → [user, user, ...]
 *   b2b.allOrgs()                     // → [org, org, ...]
 *   b2b.allContacts()                 // → [contact, ...]
 *   b2b.allUsers()                    // → [user, ...]
 *   b2b.credentials('Org Admin')      // → { userName, password }
 *   b2b.orgHierarchy()                // → { parent: org, children: [org] }
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(__dirname, '_seed-results-orgs.json');
const DEFAULT_PASSWORD = 'TestPass123!';

let _data = null;

function loadData() {
  if (_data) return _data;
  const raw = readFileSync(SEED_FILE, 'utf-8');
  _data = JSON.parse(raw);
  return _data;
}

export const b2b = {
  /** Get raw seed data */
  raw() {
    return loadData();
  },

  // --- Organizations ---

  allOrgs() {
    return loadData().organizations;
  },

  orgByName(nameFragment) {
    return loadData().organizations.find(o =>
      o.name.toLowerCase().includes(nameFragment.toLowerCase())
    );
  },

  orgById(id) {
    return loadData().organizations.find(o => o.id === id);
  },

  /** Returns { parent, children } for the org hierarchy */
  orgHierarchy() {
    const orgs = loadData().organizations;
    const parent = orgs.find(o => !o.parentId);
    const children = orgs.filter(o => o.parentId === parent?.id);
    return { parent, children };
  },

  // --- Contacts ---

  allContacts() {
    return loadData().contacts;
  },

  contactByName(nameFragment) {
    return loadData().contacts.find(c =>
      c.name.toLowerCase().includes(nameFragment.toLowerCase())
    );
  },

  contactByRole(role) {
    return loadData().contacts.find(c =>
      c.role.toLowerCase().includes(role.toLowerCase())
    );
  },

  contactsByOrg(orgKey) {
    return loadData().contacts.filter(c =>
      c.orgKey.toLowerCase() === orgKey.toLowerCase()
    );
  },

  contactById(id) {
    return loadData().contacts.find(c => c.id === id);
  },

  // --- Users ---

  allUsers() {
    return loadData().users;
  },

  userByRole(role) {
    return loadData().users.find(u =>
      u.role.toLowerCase().includes(role.toLowerCase())
    );
  },

  userByName(nameFragment) {
    return loadData().users.find(u =>
      u.contactName.toLowerCase().includes(nameFragment.toLowerCase())
    );
  },

  usersForOrg(orgKey) {
    return loadData().users.filter(u =>
      u.orgKey.toLowerCase() === orgKey.toLowerCase()
    );
  },

  userById(id) {
    return loadData().users.find(u => u.id === id);
  },

  userByEmail(email) {
    return loadData().users.find(u =>
      u.email.toLowerCase() === email.toLowerCase()
    );
  },

  // --- Credentials ---

  /** Get login credentials for a role (returns first match) */
  credentials(role) {
    const user = this.userByRole(role);
    if (!user) return null;
    return {
      userName: user.userName,
      email: user.email,
      password: DEFAULT_PASSWORD,
      contactName: user.contactName,
      orgKey: user.orgKey,
      platformRoles: user.platformRoles,
    };
  },

  /** Get all credentials grouped by org */
  credentialsByOrg(orgKey) {
    return this.usersForOrg(orgKey).map(u => ({
      userName: u.userName,
      email: u.email,
      password: DEFAULT_PASSWORD,
      contactName: u.contactName,
      role: u.role,
      platformRoles: u.platformRoles,
    }));
  },

  // --- Test Scenario Helpers ---

  /** RBAC test set: admin, buyer, viewer from AcmeCorp */
  rbacTestSet() {
    const users = this.usersForOrg('AcmeCorp');
    return {
      admin: users.find(u => u.role === 'Org Admin'),
      buyer: users.find(u => u.role === 'Buyer'),
      viewer: users.find(u => u.role === 'Viewer'),
      password: DEFAULT_PASSWORD,
    };
  },

  /** Multi-org test set: one user from each org */
  multiOrgTestSet() {
    return {
      acmeCorp: this.userByName('John Mitchell'),
      techFlow: this.userByName('Emily Johnson'),
      buildRight: this.userByName('Carlos Rodriguez'),
      acmeWest: this.userByName('Robert Lee'),
      password: DEFAULT_PASSWORD,
    };
  },

  /** Multi-buyer test set: two buyers in same org */
  multiBuyerTestSet() {
    const buyers = this.usersForOrg('AcmeCorp').filter(u =>
      u.platformRoles.includes('Purchasing agent')
    );
    return {
      buyer1: buyers[0],
      buyer2: buyers[1],
      password: DEFAULT_PASSWORD,
    };
  },
};
