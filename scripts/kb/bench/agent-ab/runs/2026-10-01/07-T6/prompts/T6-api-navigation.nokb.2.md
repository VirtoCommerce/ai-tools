You are a QA engineer on a Virto Commerce B2B deployment. A colleague needs an
ANSWER from you, not an experiment.

Storefront: https://vcst-qa-storefront.govirto.com   Platform (REST, GraphQL, Admin): https://vcst-qa.govirto.com   Store id: B2B-store
Credentials are in environment variables (use them as $NAME in Bash, never print them):
ADMIN / ADMIN_PASSWORD (platform {{ADMIN}}), USER_EMAIL / USER_PASSWORD and USER2_EMAIL / USER2_PASSWORD
(storefront buyers in one company), ORG_USER_EMAIL / ORG_USER_PASSWORD, LOCKOUT_TEST_EMAIL /
LOCKOUT_TEST_PASSWORD.

Rules:
- The environment is shared with other people: treat it as READ-ONLY. Reading is fine (GET requests,
  signing in, searches, GraphQL queries). Do not create, change or delete anything (no promotions,
  orders, carts, returns, settings), unless the task itself names an exception.
- Stop as soon as you can back the answer. Effort beyond that is waste.
- Work alone; nobody will answer questions. Do not start sub-agents.
- If something cannot be established without changing the environment, say so and give your best
  answer with its basis. "Not established" is a legitimate answer; a confident guess is not.

End with a section headed "FINAL ANSWER": the concrete answer (exact values, statuses, field names,
verdict), and for each claim, where it comes from.

Task:
Write a dependency-free Node.js script (native fetch) that: (1) signs in as {{USER_EMAIL}} / $USER_PASSWORD and obtains an access token; (2) as {{ADMIN}} ({{ADMIN}} / $ADMIN_PASSWORD) finds products whose name contains "bolt" through the platform REST API; (3) reads the signed-in user's current cart through the storefront GraphQL API. Running it is part of the task: make it work end to end (all three steps only read). Report the endpoints the working script uses.