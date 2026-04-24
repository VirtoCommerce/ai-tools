import { readFileSync, writeFileSync } from 'fs';

const path = 'regression/suites/Backend/graphql/050d-graphql-xprofile.csv';

const NEW_CASES = {
  'GQL-039': [
    'GQL-039,"xProfile — requestRegistration Personal Account Happy Path","GraphQL > xProfile > Registration",Critical,BL-AUTH-002,ECL-14.1; ECL-2.1,"BLOCKED: Creates a real user account. Email must be unique per run — runner has no dynamic-timestamp primitive. Runs once successfully then hits DuplicateEmail on re-runs. Mark Draft until runner gains a [VAR timestamp] primitive or UUID email generator.","—","[MANUAL-BLOCKED] Needs per-run unique email (timestamp/UUID).","[MANUAL] blocked on runner dynamic-email support","[EVIDENCE] Track as Draft","Account not created on first run; HTTP 500",Admin cleanup to delete the test account,xAPI; legacy 050d GQL-039; BL-AUTH-002,Draft'
  ].join('\n'),

  'GQL-040': [
    'GQL-040,"xProfile — requestRegistration Organization Account Happy Path","GraphQL > xProfile > Registration",Critical,BL-AUTH-002,ECL-14.1; ECL-2.1,"BLOCKED: Same as GQL-039 + creates a real org. No dynamic-timestamp primitive. Mark Draft.","—","[MANUAL-BLOCKED] Needs per-run unique email and org name.","[MANUAL] blocked on runner dynamic primitives","[EVIDENCE] Track as Draft","Account/org not created on first run",Admin cleanup,xAPI; legacy 050d GQL-040,Draft'
  ].join('\n'),

  'GQL-041': [
    'GQL-041,"xProfile — requestRegistration Duplicate Email Rejected","GraphQL > xProfile > Registration",Critical,BL-AUTH-003,ECL-14.1; ECL-5.1,"Runner-native. Anonymous requestRegistration with a known-existing email (ORG_USER_EMAIL from .env — acme_store_maintainer_1@acme.com). Expects result.succeeded=false with DuplicateEmail/DuplicateUserName errors.","dup_email=acme_store_maintainer_1@acme.com","[GQL-OP dup_register]',
    '  mutation {',
    '    requestRegistration(command: {',
    '      storeId: ""{{STORE_ID}}""',
    '      contact: { firstName: ""DupTest"" lastName: ""EmailCheck"" }',
    '      account: {',
    '        username: ""acme_store_maintainer_1@acme.com""',
    '        email: ""acme_store_maintainer_1@acme.com""',
    '        password: ""Password1!""',
    '      }',
    '    }) {',
    '      result { succeeded errors { code description } }',
    '      account { id email }',
    '      contact { id }',
    '    }',
    '  }',
    '[GQL-EXEC dup_register]","[ERRORS label=dup_register] errors[] empty — server returns structured validation via result.errors, not top-level errors',
    '[DATA label=dup_register] data.requestRegistration.result.succeeded = false',
    '[DATA label=dup_register] data.requestRegistration.contact is null',
    '[DATA label=dup_register] data.requestRegistration.account is null","[EVIDENCE] result.errors[].code includes DuplicateEmail or DuplicateUserName. Messages do not reveal active-account details (security/BL-AUTH-003).","result.succeeded=true on duplicate (P0 data corruption); HTTP 500; stack trace in errors[]; account created",none — no account created,xAPI; graphql-schema.md — Mutation.requestRegistration BL-AUTH-003,Draft'
  ].join('\n'),

  'GQL-042': [
    'GQL-042,"xProfile — requestRegistration Missing Required Fields","GraphQL > xProfile > Registration",High,BL-GQL-001,ECL-14.1,"Runner-native. Sends requestRegistration with deliberately-missing required fields (empty contact). Expects schema-validator rejection (client-side DV-010) or server-side validation error.","—","[GQL-OP missing_fields]',
    '  mutation {',
    '    requestRegistration(command: {',
    '      storeId: ""{{STORE_ID}}""',
    '      contact: { firstName: """" lastName: """" }',
    '      account: { username: """" email: """" password: """" }',
    '    }) { result { succeeded errors { code description } } account { id } contact { id } }',
    '  }',
    '[GQL-EXEC missing_fields]","[DATA label=missing_fields] data is non-null or errors[] non-empty","[EVIDENCE] Either (a) top-level errors[] non-empty with schema-validation codes OR (b) result.succeeded=false with field-level errors. No HTTP 500.","HTTP 500; stack trace; account silently created with empty fields",none,xAPI; graphql-schema.md — InputRequestRegistrationType,Draft'
  ].join('\n'),

  'GQL-043': [
    'GQL-043,"xProfile — requestRegistration Weak Password Rejected","GraphQL > xProfile > Registration",High,BL-AUTH-002,ECL-14.1,"Runner-native. Anonymous requestRegistration with a trivially-weak password (\'123\'). Expects result.succeeded=false with password-validator error.","weak_pwd=123","[GQL-OP weak_pwd]',
    '  mutation {',
    '    requestRegistration(command: {',
    '      storeId: ""{{STORE_ID}}""',
    '      contact: { firstName: ""Weak"" lastName: ""Password"" }',
    '      account: {',
    '        username: ""weakpwd-agent-test-nonexistent@test-agent.com""',
    '        email: ""weakpwd-agent-test-nonexistent@test-agent.com""',
    '        password: ""123""',
    '      }',
    '    }) { result { succeeded errors { code description } } account { id } }',
    '  }',
    '[GQL-EXEC weak_pwd]","[ERRORS label=weak_pwd] errors[] empty — validation is communicated via result.errors',
    '[DATA label=weak_pwd] data.requestRegistration.result.succeeded = false',
    '[DATA label=weak_pwd] data.requestRegistration.account is null","[EVIDENCE] result.errors[].code mentions password-strength (PasswordTooShort / PasswordRequires*). Not a stack trace.","result.succeeded=true on weak password (P0 auth weakness); HTTP 500",none — no account created,xAPI; BL-AUTH-002 password complexity,Draft'
  ].join('\n'),

  'GQL-044': [
    'GQL-044,"xProfile — requestRegistration XSS in Name Fields","GraphQL > xProfile > Registration",High,BL-GQL-001,ECL-14.1; ECL-5.1,"Runner-native. Anonymous requestRegistration with an XSS payload in firstName. Expects server name-validator rejection or silent sanitization. NOT expected to succeed.","xss_name=@td(ORG_XSS.payload)","[GQL-OP xss_name]',
    '  mutation {',
    '    requestRegistration(command: {',
    '      storeId: ""{{STORE_ID}}""',
    '      contact: { firstName: ""@td(ORG_XSS.payload)"" lastName: ""XssTest"" }',
    '      account: {',
    '        username: ""xss-agent-test-nonexistent@test-agent.com""',
    '        email: ""xss-agent-test-nonexistent@test-agent.com""',
    '        password: ""Password1!""',
    '      }',
    '    }) { result { succeeded errors { code description } } contact { firstName } account { id } }',
    '  }',
    '[GQL-EXEC xss_name]","[DATA label=xss_name] data is non-null or errors[] non-empty","[EVIDENCE] If result.succeeded=true, assert contact.firstName does not contain <script> raw (sanitized). If succeeded=false, result.errors[].code references name validation. No HTTP 500.","HTTP 500; account created with literal <script> tag in firstName (P0 stored XSS); stack trace",Admin cleanup if account created; normal case: nothing created,xAPI; BL-GQL-001 XSS name validation,Draft'
  ].join('\n'),

  'GQL-045': [
    'GQL-045,"xProfile — requestRegistration Result Contains requireEmailVerification","GraphQL > xProfile > Registration",High,BL-AUTH-002,ECL-14.1; ECL-2.1,"Runner-native. Sends a duplicate-email registration (reusable, idempotent) then asserts the response shape includes requireEmailVerification as a Boolean (schema coverage + contract assertion). Reuses duplicate flow from GQL-041 pattern.","—","[GQL-OP flag_shape]',
    '  mutation {',
    '    requestRegistration(command: {',
    '      storeId: ""{{STORE_ID}}""',
    '      contact: { firstName: ""FlagShape"" lastName: ""Check"" }',
    '      account: {',
    '        username: ""acme_store_maintainer_1@acme.com""',
    '        email: ""acme_store_maintainer_1@acme.com""',
    '        password: ""Password1!""',
    '      }',
    '    }) {',
    '      result { succeeded requireEmailVerification errors { code } }',
    '    }',
    '  }',
    '[GQL-EXEC flag_shape]","[ERRORS label=flag_shape] errors[] empty',
    '[DATA label=flag_shape] data.requestRegistration.result is non-null',
    '[DATA label=flag_shape] data.requestRegistration.result.succeeded = false","[EVIDENCE] result.requireEmailVerification is a Boolean (field present in schema — DV-009 would catch removal). Value depends on store setting.","Field requireEmailVerification missing (schema drift); field typed as non-Boolean",none,xAPI; graphql-schema.md — AccountCreationResultType,Draft'
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
