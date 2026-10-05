// scripts/deploy/lib/exit.ts — exit-code plumbing shared by the vc-deploy subcommands.

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class Exit { constructor(public code: number) {} }
export function fail(msg: string, tag = 'deploy-pr'): never { console.error(`[${tag}] ${msg}`); throw new Exit(2); }
