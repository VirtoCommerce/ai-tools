/**
 * Jira REST search, shared by the scripts that read bugs (`gaps`, `bl:fresh`).
 *
 * Credentials come from the layered env (JIRA_BASE_URL + JIRA_EMAIL / JIRA_API_TOKEN, the same ones
 * `scripts/tracker/comment.mjs` uses). `config.js` is imported only here, on first use: it refuses to start
 * without the storefront/admin core variables, which a run on an exported `--input` file does not need.
 */
export interface JiraIssue { key: string; fields: Record<string, unknown> }

export async function jiraSearch(jql: string, fields: readonly string[]): Promise<JiraIssue[]> {
  await import(new URL("../../config.js", import.meta.url).href);
  const base = (process.env.JIRA_BASE_URL ?? "").replace(/\/+$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error("no Jira credentials (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env.local)");
  const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
  const out: JiraIssue[] = [];
  let next: string | undefined;
  do {
    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jql, fields, maxResults: 100, ...(next ? { nextPageToken: next } : {}) }),
    });
    if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as { issues: JiraIssue[]; nextPageToken?: string };
    out.push(...page.issues);
    next = page.nextPageToken;
  } while (next);
  return out;
}

/** The plain text of an Atlassian Document Format value (a description), or the string itself. */
export function adfText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: string; content?: unknown[] };
  return [node.text ?? "", ...(node.content ?? []).map(adfText)].join(" ");
}
