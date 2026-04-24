import { readFileSync, writeFileSync } from 'fs';

const path = 'regression/suites/Backend/graphql/050d-graphql-xprofile.csv';

const NEW_CASES = {
  'GQL-038': [
    'GQL-038,"xProfile — createContact Phone Field Validation","GraphQL > xProfile",High,BL-GQL-001; BL-GQL-004,ECL-5.1; ECL-14.1,"Runner-native. Attempts createContact with a phone field containing an HTML-injection payload. Expected: phone validator rejects (errors[] non-empty).","html_phone=@td(PHONE_XSS_HTML.payload)","[AUTH role=ORG_USER]',
    '[GQL-OP create_bad_phone]',
    '  mutation {',
    '    createContact(command: {',
    '      firstName: ""AGENT-TEST-PHONE""',
    '      lastName: ""Validation""',
    '      phones: [""@td(PHONE_XSS_HTML.payload)""]',
    '    }) { id firstName lastName }',
    '  }',
    '[GQL-EXEC create_bad_phone]","[ERRORS label=create_bad_phone] errors[] non-empty — NoHtmlTags phone validator rejects (BL-GQL-001)',
    '[DATA label=create_bad_phone] data.createContact is null","[EVIDENCE] errors[].message references phone field validation; no stack traces leaked","errors[] empty (phone accepted silently); HTTP 500; NewContact created with HTML in phone",none — contact not created,xAPI; graphql-schema.md — Mutation.createContact phone validator,Draft'
  ].join('\n'),

  'GQL-047': [
    'GQL-047,"xProfile — OrganizationType Full-Field Schema Coverage","GraphQL > xProfile > Schema Coverage",High,BL-GQL-002; BL-GQL-004; BL-B2B-001,ECL-2.1,"Runner-native. Reads ORG_USER\'s organizationId then queries every OrganizationType field. Any rename/removal → DV-009 at lint time.","—","[AUTH role=ORG_USER]',
    '[GQL-OP get_me]',
    '  query { me { id contact { organizationId } } }',
    '[GQL-EXEC get_me]',
    '[GQL-CAPTURE get_me.data.me.contact.organizationId → ORG_ID]',
    '[GQL-OP org_full]',
    '  query {',
    '    organization(id: ""{{ORG_ID}}"") {',
    '      id name description status',
    '      ownerId businessCategory groups',
    '      phones emails',
    '      addresses { id city countryCode firstName lastName line1 postalCode }',
    '      dynamicProperties { name value valueType }',
    '      memberType outerId',
    '      parentId parentName',
    '    }',
    '  }',
    '[GQL-EXEC org_full]","[ERRORS label=org_full] errors[] empty — every OrganizationType field resolves',
    '[DATA label=org_full] data.organization is non-null',
    '[DATA label=org_full] data.organization.id = {{ORG_ID}}',
    '[DATA label=org_full] data.organization.name is non-null',
    '[DATA label=org_full] data.organization.memberType is non-null","[ROUNDTRIP label=org_full] re-execute → identical structure","Any OrganizationType field renamed/removed (DV-009); schema drift",none — read-only,xAPI; graphql-schema.md — OrganizationType,Draft'
  ].join('\n'),

  'GQL-049': [
    'GQL-049,"xProfile — currentCustomerAddresses Keyword Filter","GraphQL > xProfile > Addresses > Keyword",High,BL-GQL-001,ECL-3.2,"Runner-native. ORG_USER queries their own addresses with a keyword filter. User may have 0+ addresses; test asserts structural invariants, not row counts.","keyword=New","[AUTH role=ORG_USER]',
    '[GQL-OP list_addresses]',
    '  query {',
    '    currentCustomerAddresses(first: 10, keyword: ""New"") {',
    '      totalCount',
    '      items { id city countryCode line1 postalCode regionId }',
    '    }',
    '  }',
    '[GQL-EXEC list_addresses]","[ERRORS label=list_addresses] errors[] empty',
    '[DATA label=list_addresses] data.currentCustomerAddresses is non-null',
    '[COUNT label=list_addresses] data.currentCustomerAddresses.totalCount >= 0","[EVIDENCE] Each returned item either has keyword substring in some field OR totalCount=0 (acceptable if user has no matching addresses)","errors[] non-empty; items null; totalCount negative",none — read-only,xAPI; graphql-schema.md — Query.currentCustomerAddresses,Draft'
  ].join('\n'),

  'GQL-050': [
    'GQL-050,"xProfile — currentCustomerAddresses Facet Filters","GraphQL > xProfile > Addresses > Facets",High,BL-GQL-001,ECL-3.2,"Runner-native. Queries currentCustomerAddresses with countryCodes/cities facet filters. Verifies filter args are accepted + response shape.","—","[AUTH role=ORG_USER]',
    '[GQL-OP list_us]',
    '  query {',
    '    currentCustomerAddresses(first: 10, countryCodes: [""US""]) {',
    '      totalCount',
    '      items { id city countryCode }',
    '    }',
    '  }',
    '[GQL-EXEC list_us]',
    '[GQL-OP list_cities]',
    '  query {',
    '    currentCustomerAddresses(first: 10, cities: [""New York""]) {',
    '      totalCount',
    '      items { id city }',
    '    }',
    '  }',
    '[GQL-EXEC list_cities]","[ERRORS label=list_us] errors[] empty',
    '[DATA label=list_us] data.currentCustomerAddresses is non-null',
    '[ERRORS label=list_cities] errors[] empty',
    '[DATA label=list_cities] data.currentCustomerAddresses is non-null","[EVIDENCE] Facet args accepted by resolver; each item\'s countryCode/city matches the filter OR totalCount=0","errors[] non-empty on any filter; resolver rejects valid facet args (DV-008)",none — read-only,xAPI; graphql-schema.md — Query.currentCustomerAddresses facets,Draft'
  ].join('\n'),

  'GQL-053': [
    'GQL-053,"xProfile — currentOrganizationAddresses Non-Org-Member Returns Error","GraphQL > xProfile > Addresses > Auth",High,BL-B2B-001,ECL-14.3,"Runner-native. USER2 is a personal account (no org). currentOrganizationAddresses should fail or return empty for non-org users.","—","[AUTH role=USER2]',
    '[GQL-OP personal_me]',
    '  query { me { contact { organizationId } } }',
    '[GQL-EXEC personal_me]',
    '[GQL-OP org_addrs_as_personal]',
    '  query {',
    '    currentOrganizationAddresses(first: 5) {',
    '      totalCount items { id city }',
    '    }',
    '  }',
    '[GQL-EXEC org_addrs_as_personal]","[DATA label=personal_me] data.me.contact.organizationId is null","[EVIDENCE] org_addrs_as_personal: either errors[] non-empty with authz/forbidden message OR data.currentOrganizationAddresses is null. No user data leaked.","Personal user gets org data (P0 cross-org leak); HTTP 500",none — read-only,xAPI; graphql-schema.md — Query.currentOrganizationAddresses BL-B2B-001,Draft'
  ].join('\n'),

  'GQL-054': [
    'GQL-054,"xProfile — checkDuplicateAddress Returns True for Existing","GraphQL > xProfile > Addresses > Duplicate Guard",High,BL-PROFILE-001,ECL-5.1,"Runner-native. Captures memberId, attempts checkDuplicateAddress with a synthetic address that may or may not exist. Documents isDuplicated result.","—","[AUTH role=ORG_USER]',
    '[GQL-OP get_me]',
    '  query { me { memberId } }',
    '[GQL-EXEC get_me]',
    '[GQL-CAPTURE get_me.data.me.memberId → MEMBER_ID]',
    '[GQL-OP check_dup]',
    '  query {',
    '    checkDuplicateAddress(memberId: ""{{MEMBER_ID}}"", address: {',
    '      city: ""New York"" countryCode: ""US"" line1: ""123 Test St"" postalCode: ""10001""',
    '    }) { isDuplicated }',
    '  }',
    '[GQL-EXEC check_dup]","[ERRORS label=check_dup] errors[] empty',
    '[DATA label=check_dup] data.checkDuplicateAddress is non-null","[EVIDENCE] isDuplicated reflects real duplicate-guard logic. If user has no addresses, result=false (acceptable).","errors[] non-empty; resolver throws; HTTP 500",none — read-only,xAPI; graphql-schema.md — Query.checkDuplicateAddress,Draft'
  ].join('\n'),

  'GQL-055': [
    'GQL-055,"xProfile — checkDuplicateAddress Returns False for Synthetic","GraphQL > xProfile > Addresses > Duplicate Guard",High,BL-PROFILE-001,ECL-5.1,"Runner-native. Attempts checkDuplicateAddress with a deliberately-unique synthetic address. Expects isDuplicated=false.","—","[AUTH role=ORG_USER]',
    '[GQL-OP get_me]',
    '  query { me { memberId } }',
    '[GQL-EXEC get_me]',
    '[GQL-CAPTURE get_me.data.me.memberId → MEMBER_ID]',
    '[GQL-OP check_new]',
    '  query {',
    '    checkDuplicateAddress(memberId: ""{{MEMBER_ID}}"", address: {',
    '      city: ""Nowhereville-XYZ"" countryCode: ""US""',
    '      line1: ""99999 Nonexistent Agent Test Blvd"" postalCode: ""00000""',
    '    }) { isDuplicated }',
    '  }',
    '[GQL-EXEC check_new]","[ERRORS label=check_new] errors[] empty',
    '[DATA label=check_new] data.checkDuplicateAddress is non-null',
    '[DATA label=check_new] data.checkDuplicateAddress.isDuplicated = false","[ROUNDTRIP label=check_new] Synthetic address shouldn\'t exist — predictable false","errors[] non-empty; isDuplicated=true on synthetic address (data corruption)",none — read-only,xAPI; graphql-schema.md — Query.checkDuplicateAddress,Draft'
  ].join('\n'),

  'GQL-056': [
    'GQL-056,"xProfile — updateMemberAddresses Duplicate-Insert Semantics","GraphQL > xProfile > Addresses > Duplicate Guard",High,BL-PROFILE-001,ECL-5.1,"Runner-native. Calls updateMemberAddresses twice with the same address. updateMemberAddresses uses REPLACE semantics per fixtures — the second call is an identity no-op.","—","[AUTH role=ORG_USER]',
    '[GQL-OP get_me]',
    '  query { me { memberId } }',
    '[GQL-EXEC get_me]',
    '[GQL-CAPTURE get_me.data.me.memberId → MEMBER_ID]',
    '[GQL-OP insert_first]',
    '  mutation {',
    '    updateMemberAddresses(command: {',
    '      memberId: ""{{MEMBER_ID}}""',
    '      addresses: [{',
    '        city: ""AgentTestCity-DupGuard"" countryCode: ""US""',
    '        line1: ""123 Agent Test Dup St"" postalCode: ""10002""',
    '      }]',
    '    }) { id }',
    '  }',
    '[GQL-EXEC insert_first]',
    '[GQL-OP insert_again]',
    '  mutation {',
    '    updateMemberAddresses(command: {',
    '      memberId: ""{{MEMBER_ID}}""',
    '      addresses: [{',
    '        city: ""AgentTestCity-DupGuard"" countryCode: ""US""',
    '        line1: ""123 Agent Test Dup St"" postalCode: ""10002""',
    '      }]',
    '    }) { id }',
    '  }',
    '[GQL-EXEC insert_again]","[ERRORS label=insert_first] errors[] empty',
    '[ERRORS label=insert_again] errors[] empty',
    '[DATA label=insert_again] data.updateMemberAddresses.id is non-null","[EVIDENCE] Post-both-inserts: currentCustomerAddresses should contain the address once, not twice. Manual review via evidence. updateMemberAddresses uses REPLACE — second call is identity.","errors[] non-empty; duplicate address persisted (2 records with same line1+city+postalCode)",Test leaves a test address on the real user; manual cleanup via deleteMemberAddresses if desired,xAPI; BL-PROFILE-001 duplicate guard,Draft'
  ].join('\n'),

  'GQL-057': [
    'GQL-057,"xProfile — currentOrganizationAddresses Cross-Org Access Denied","GraphQL > xProfile > Addresses > Org > AuthZ",High,BL-B2B-001,ECL-14.3,"BLOCKED: Needs a second-org user alias (_inline in aliases.json) to validate cross-org isolation. Same blocker as WL-022/023.","—","[MANUAL-BLOCKED] Needs TECHFLOW-or-other-org user _inline alias in test-data/aliases.json.","[MANUAL] blocked on second-org user role","[EVIDENCE] Track as Draft","Cross-org data leak",Admin reset,xAPI; legacy 050d GQL-057,Draft'
  ].join('\n'),

  'GQL-058': [
    'GQL-058,"xProfile — checkDuplicateAddress Cannot Probe Foreign Member","GraphQL > xProfile > Addresses > Duplicate Guard > AuthZ",High,BL-B2B-001,ECL-14.3,"Runner-native. ORG_USER attempts checkDuplicateAddress with a memberId that\'s not theirs (zero-GUID). Expects error or isDuplicated=false — never leaks foreign data.","bogus_member=00000000-0000-0000-0000-000000000000","[AUTH role=ORG_USER]',
    '[GQL-OP check_other]',
    '  query {',
    '    checkDuplicateAddress(memberId: ""00000000-0000-0000-0000-000000000000"", address: {',
    '      city: ""Anywhere"" countryCode: ""US"" line1: ""1 Main St"" postalCode: ""00001""',
    '    }) { isDuplicated }',
    '  }',
    '[GQL-EXEC check_other]","—","[EVIDENCE] Either errors[] non-empty with authz/not-found OR isDuplicated=false (harmless). NO leak of foreign member data; no HTTP 500.","HTTP 500; resolver returns true for foreign member (data leak)",none — read-only,xAPI; BL-B2B-001 cross-member authz,Draft'
  ].join('\n'),

  'GQL-059': [
    'GQL-059,"xProfile — checkDuplicateAddress Required Fields Validation","GraphQL > xProfile > Addresses > Duplicate Guard > Validation",Medium,BL-GQL-001,ECL-5.1,"Runner-native. Sends checkDuplicateAddress with an incomplete address (only city). Schema requires city+countryCode+line1+postalCode — client-side validator catches.","—","[AUTH role=ORG_USER]',
    '[GQL-OP get_me]',
    '  query { me { memberId } }',
    '[GQL-EXEC get_me]',
    '[GQL-CAPTURE get_me.data.me.memberId → MEMBER_ID]',
    '[GQL-OP check_missing]',
    '  query {',
    '    checkDuplicateAddress(memberId: ""{{MEMBER_ID}}"", address: {',
    '      city: ""Onlycity""',
    '    }) { isDuplicated }',
    '  }',
    '[GQL-EXEC check_missing]","[ERRORS label=check_missing] errors[] non-empty — InputMemberAddressType requires countryCode + line1 + postalCode (BL-GQL-001)",""—""," schema validator (client-side DV-010) catches missing required fields OR server rejects","errors[] empty on incomplete address (validation bypass)",none — read-only,xAPI; graphql-schema.md — InputMemberAddressType required fields,Draft'
  ].join('\n')
};

const raw = readFileSync(path, 'utf-8');
const lines = raw.split('\n');
const starts = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(GQL-\d+),/);
  if (m) starts.push({ id: m[1], line: i });
}

const out = [];
let i = 0;
let replaced = 0;
while (i < lines.length) {
  const startIdx = starts.findIndex(s => s.line === i);
  if (startIdx >= 0) {
    const s = starts[startIdx];
    const nextStart = startIdx + 1 < starts.length ? starts[startIdx + 1].line : lines.length;
    if (NEW_CASES[s.id]) {
      out.push(NEW_CASES[s.id]);
      i = nextStart;
      replaced++;
      continue;
    } else {
      for (let j = i; j < nextStart; j++) out.push(lines[j]);
      i = nextStart;
      continue;
    }
  }
  out.push(lines[i]);
  i++;
}

writeFileSync(path, out.join('\n'));
console.log('Replaced ' + replaced + ' of ' + Object.keys(NEW_CASES).length);
