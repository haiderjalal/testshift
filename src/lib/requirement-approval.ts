import { db, json } from "./db";

export const FINISHED_STATUSES = ["completed", "failed"];

/**
 * Turns one proposed test into a pending test on its run. Called only from the admin action, after isAdmin().
 */
export async function approveRequirementTest(id: string): Promise<void> {
  await db().begin(async (sql) => {
    const [proposal] = await sql<{
      run_id: string;
      requirement: string;
      title: string;
      priority: string;
      viewport: string;
      start_url: string;
      steps: unknown;
      expected: string;
      script: unknown;
    }[]>`
      select run_id, requirement, title, priority, viewport, start_url, steps, expected, script
      from requirement_tests where id = ${id} and status = 'proposed' for update`;
    if (!proposal) return;

    const [run] = await sql<{ status: string }[]>`select status from runs where id = ${proposal.run_id} for update`;
    if (!run || FINISHED_STATUSES.includes(run.status)) return;

    const [{ next }] = await sql<{ next: number }[]>`
      select coalesce(max(seq), 0) + 1 as next from test_cases where run_id = ${proposal.run_id}`;
    const [testCase] = await sql<{ id: string }[]>`
      insert into test_cases (run_id, seq, agent, feature, title, category, priority, viewport, start_url, steps, expected,
        status, script, actions, scripted, requirement)
      values (${proposal.run_id}, ${next}, 'uat', null, ${proposal.title}, 'functional', ${proposal.priority}, ${proposal.viewport},
        ${proposal.start_url}, ${json(proposal.steps as object)}, ${proposal.expected}, 'pending',
        ${json(proposal.script as object)}, '[]'::jsonb, false, ${proposal.requirement})
      returning id`;
    await sql`update requirement_tests set status = 'approved', test_case_id = ${testCase.id} where id = ${id}`;
  });
}
