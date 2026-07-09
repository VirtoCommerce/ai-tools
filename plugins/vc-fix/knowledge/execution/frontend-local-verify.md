# Frontend local live-verify (recipe for the verification skill — NOT a `/qa-fix` step)

> **Ownership:** this recipe is used by the **verification skills**, NOT by `/qa-fix`. `/qa-fix` ships a
> unit-proven fix + PR and stops at `On Review` (it does not stand up a running app). Live/visual
> re-verification is decoupled: **`/qa-verify-fix`** re-runs the STR on the **deployed** artifact
> post-merge; and a **future local-PR-artifact verify skill** will boot the storefront locally against
> the **real PR artifact** using exactly the steps below. Do not invoke this from `/qa-fix`.

For a **client `frontend` fork** with **no auto-deploy pipeline**, the fix is verified **live** by building
the branch locally, pointing it at the deployment's QA backend, and driving the bug's STR through
**Playwright MCP**. Everything below is data-driven from `profile.repos.client[<frontend>].localVerify` +
`profile.paths`; `/project-init` baked and PROBED these, so do not rediscover them.

`localVerify` fields: `devCmd`, `url`, `selfSignedCert`, `backendUrlForDev`, `storeId`, `storeDomain`,
`userEnv`, `passEnv`. Login creds live in the env files (`userEnv`→`USER_EMAIL`, `passEnv`→`USER_PASSWORD`,
password promoted from the `_<ENV>` suffix).

## Why `APP_BACKEND_URL` must be the STOREFRONT host (the blank-app trap)
In dev, vc-frontend's `client-app/app-runner.ts` derives the store-resolution `domain` from the
**hostname of `APP_BACKEND_URL`** (`IS_DEVELOPMENT ? extractHostname(APP_BACKEND_URL) : location.hostname`).
The Vite dev server also proxies `/graphql`, `/connect/token`, `/api`, `/cms-content` to `APP_BACKEND_URL`.

- Point it at the **admin/platform host** (e.g. `qa-admin-*`) and the store won't resolve — that host is
  not a registered storefront store domain, so `GetPageContext` returns `pageContext: null` and the SPA
  renders a **blank page**. (This cost a whole wasted verification pass before it was understood.)
- Point it at the **storefront host** (e.g. `qa-frontend-*`) and it BOTH resolves the store (that host IS
  the store's SEO domain) AND proxies the API to the platform. → `localVerify.backendUrlForDev` is that
  storefront host, probed at init (`GetPageContext` returned `store.storeId`).

Sanity probe (optional, before spinning up the browser):
```bash
curl -k -s -X POST "$BACKEND/graphql" -H 'Content-Type: application/json' \
  --data '{"operationName":"GetPageContext","query":"query GetPageContext($domain:String,$permalink:String){pageContext(domain:$domain,permalink:$permalink){store{storeId}}}","variables":{"domain":"<storeDomain>","permalink":"sign-in"}}'
# expect {"data":{"pageContext":{"store":{"storeId":"<storeId>"}}}}
```

## Recipe
All paths absolute from `profile.paths.projectRoot`; the clone is at `<projectRoot>/<paths.workspace>/<repo-basename>` on the fix branch.

1. **Wire the backend (gitignored, no code change):** write `<clone>/.env.local` with
   `APP_BACKEND_URL=<localVerify.backendUrlForDev>`. `.env.local` overrides the repo's `.env` and is
   gitignored (confirm `git -C <clone> check-ignore .env.local`) so it never pollutes the PR.
2. **Start the dev server (background):** `( cd <clone> && <localVerify.devCmd> )` via a background Bash.
   Poll its output for the `Local: <url>` line (Vite ~a few seconds). It generates a self-signed cert on
   first run — expected. Confirm it serves: `curl -k -s -o /dev/null -w '%{http_code}' <url>` → 200, and
   the sanity probe above through the proxy (`<url>/graphql`) resolves the store.
3. **Drive the STR via Playwright MCP** (delegate to `qa-frontend-expert`): navigate to `<url>` (accept
   the self-signed cert — the MCP context usually ignores it; if a Chrome interstitial appears, click
   **Advanced → Proceed**, or type the literal `thisisunsafe` on the error page), log in with
   `userEnv`/`passEnv`, run the bug's exact reproduction steps, assert the fixed behaviour, capture a
   screenshot to `<paths.reports>/fixes/FIX-*/`. Report PASS/FAIL with the DOM snapshot + screenshot.
4. **Tear down:** kill the dev server (find the PID on the port and `taskkill //PID <pid> //F` on Windows /
   `kill` on POSIX). Remove any stray helper files the browser MCP created (e.g. an empty
   `test-results/auth/*.json`).

## Notes
- Store data on `localhost` resolves via the QA backend, so real orders/catalog load — but even if store
  context were thin, a **UI-only** fix (markup/layout) renders regardless, so the STR is still verifiable.
- Node/Yarn versions come from the repo (`.nvmrc`/`package.json`); `profile.repos.client[].toolchain` has
  the install/build/test commands if a full build is wanted (the dev server alone is enough for G6).
- This is a **pre-merge local** confirmation; a **deployed-env** re-check via `/qa-verify-fix` after the
  PR merges + deploys is still recommended, and is where the official Gate 6 sign-off lands.
