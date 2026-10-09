import { z } from "zod";
import { github, githubId, GitHubError, repoName } from "./api";
import { GenerationError, type SourceSnapshot } from "./source";
import { suiteFiles, type GeneratedSuite } from "./generated-suite";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
/** Unique job branch, base tree preserved, no force push and no writes to default branch. */
export async function publishSuite(token: string, jobId: string, source: SourceSnapshot, suite: GeneratedSuite, checkAuthority: () => Promise<void>) {
  repoName.parse(source.repository);
  if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new GenerationError("invalid-generation-id");
  const branch = `testshift/tests-${jobId}`;
  const root = `/repos/${source.repository}`;
  await checkAuthority();
  const tree = z.object({ sha }).parse(await github(`${root}/git/trees`, token, "POST", { base_tree: source.treeSha,
    tree: suiteFiles(suite, source).map((file) => ({ path: file.path, mode: "100644", type: "blob", content: file.content })) }));
  let ref: { object: { sha: string } } | null = null;
  try { ref = z.object({ object: z.object({ sha }) }).parse(await github(`${root}/git/ref/heads/${branch}`, token)); }
  catch (error) { if (!(error instanceof GitHubError) || error.status !== 404) throw error; }
  if (ref) {
    const commit = z.object({ tree: z.object({ sha }), parents: z.array(z.object({ sha })) }).parse(await github(`${root}/git/commits/${ref.object.sha}`, token));
    if (commit.tree.sha !== tree.sha || commit.parents.length !== 1 || commit.parents[0].sha !== source.sha) throw new GenerationError("generation-branch-conflict");
  } else {
    const commit = z.object({ sha }).parse(await github(`${root}/git/commits`, token, "POST", { message: "Add TestShift proposed unit, integration and browser tests", tree: tree.sha, parents: [source.sha] }));
    await checkAuthority();
    await github(`${root}/git/refs`, token, "POST", { ref: `refs/heads/${branch}`, sha: commit.sha });
  }
  await checkAuthority();
  const head = `${source.repository.split('/')[0]}:${branch}`;
  const existing = z.array(z.object({ number: githubId, state: z.string(), head: z.object({ ref: z.string() }), base: z.object({ ref: z.string() }) })).max(100)
    .parse(await github(`${root}/pulls?state=all&head=${encodeURIComponent(head)}&base=${encodeURIComponent(source.branch)}&per_page=100`, token));
  const previous = existing.find((pr) => pr.head.ref === branch && pr.base.ref === source.branch);
  if (previous) return previous.number;
  const body = `AI-generated tests for review. Source commit: ${source.sha}.\n\n${suite.summary}\n\nAnalyzed ${source.inventory.analyzedFiles} of ${source.inventory.totalFiles} files. ${source.inventory.exclusions}\n\nThree independent GitHub Actions jobs run unit, integration and Playwright tests on push and pull request using disposable resources. Existing workflows and application dependencies are preserved. No deployment or production secrets are added. Review test assertions, fixtures and CI results before merging; generated tests may need correction. This is not a claim of full coverage.\n\nCoverage gaps / prerequisites:\n${suite.gaps.map((gap) => `- ${gap}`).join('\n') || '- Review against application requirements.'}\n\nMerging enables future runs; new pushes rerun the suite without another AI generation call. Close this PR to decline.\n\nGeneration: ${jobId}`;
  const pr = z.object({ number: githubId }).parse(await github(`${root}/pulls`, token, "POST", { title: "Add TestShift generated test suite", head: branch, base: source.branch, body }));
  return pr.number;
}
