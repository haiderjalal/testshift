import { z } from "zod";

export const TESTING_MODES = {
  website: "Website testing",
  repository: "GitHub repository audit",
  ci: "GitHub CI setup",
} as const;
export type TestingMode = keyof typeof TESTING_MODES;
export const testingMode = (value: unknown): TestingMode =>
  typeof value === "string" && Object.hasOwn(TESTING_MODES, value) ? value as TestingMode : "website";

/** Repository identifiers only: never accept credentials, tokens, branches, query strings or arbitrary hosts. */
export function githubRepository(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.port && !url.username && !url.password
      && !url.search && !url.hash && /^\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}\/?$/.test(url.pathname)
      && ![".", ".."].includes(url.pathname.split("/")[2]);
  } catch { return false; }
}

export const repositoryRequest = z.object({
  mode: z.enum(["website", "repository", "ci"]),
  repository: z.string().trim().max(300),
  destructive: z.enum(["", "on"]),
}).superRefine((data, context) => {
  if (data.mode !== "website" && !githubRepository(data.repository)) {
    context.addIssue({ code: "custom", path: ["repository"], message: "Enter a GitHub repository link, like https://github.com/owner/repo. Do not include access tokens." });
  }
  if (data.mode === "website" && (data.repository || data.destructive)) {
    context.addIssue({ code: "custom", path: ["mode"], message: "Choose repository testing or CI setup for this request." });
  }
});

export function repositoryBrief(data: z.infer<typeof repositoryRequest>, details: string): string {
  if (data.mode === "website") return details;
  return [`Testing request: ${TESTING_MODES[data.mode]}`, `GitHub repository: ${data.repository}`,
    `Disposable destructive-test environment requested: ${data.destructive === "on" ? "yes" : "no"}`,
    "Access and execution are pending onboarding; this submission grants no repository or production permissions.", "", details].join("\n");
}
