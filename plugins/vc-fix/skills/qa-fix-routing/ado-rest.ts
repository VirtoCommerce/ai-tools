/**
 * Azure DevOps REST auth helpers — shared by azure-tracker (Boards work items)
 * and azure-repos-vcs (Repos / Pull Requests). Mirrors LEO's ado-api.sh.
 *
 * Auth, NO passwords:
 *   - Default: PAT via env ADO_PAT → Basic auth with an empty username
 *     (LEO `curl -u ":$PAT"`).
 *   - Browser/device login: a token from the `az login` session via
 *     @azure/identity (AzureCliCredential), used when ADO_AUTH=az-login or when
 *     no PAT is present. @azure/identity is imported LAZILY (only when this path
 *     runs), so PAT-only and non-Azure deployments never load it.
 *
 * The Azure DevOps OAuth resource id is well-known and constant.
 */
const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798/.default";

let _bearer: { token: string; exp: number } | null = null;

/** True when Azure DevOps REST can authenticate (PAT present, or az-login chosen). */
export function adoConfigured(): boolean {
  return (
    Boolean(process.env.ADO_PAT) ||
    (process.env.ADO_AUTH || "").toLowerCase() === "az-login"
  );
}

/**
 * Build the Authorization header for an Azure DevOps REST call.
 * PAT (Basic) by default; `az login` bearer token when ADO_AUTH=az-login or no
 * PAT is set. Throws a clear, actionable error when neither is available.
 */
export async function adoAuthHeader(): Promise<string> {
  const pat = process.env.ADO_PAT || "";
  const mode = (process.env.ADO_AUTH || (pat ? "pat" : "az-login")).toLowerCase();

  if (mode !== "az-login" && pat) {
    return "Basic " + Buffer.from(`:${pat}`).toString("base64");
  }

  // Browser/device login token via the Azure CLI session (`az login`).
  const now = Date.now();
  if (_bearer && _bearer.exp - now > 60_000) return `Bearer ${_bearer.token}`;

  const { AzureCliCredential } = await import("@azure/identity");
  const tok = await new AzureCliCredential().getToken(ADO_RESOURCE);
  if (!tok?.token) {
    throw new Error(
      "Azure DevOps auth unavailable: set ADO_PAT, or run `az login` and set ADO_AUTH=az-login.",
    );
  }
  _bearer = { token: tok.token, exp: tok.expiresOnTimestamp };
  return `Bearer ${tok.token}`;
}

/** Base URL for an Azure DevOps org+project: https://dev.azure.com/{org}/{project} */
export function adoBase(org: string, project: string): string {
  return `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
}
