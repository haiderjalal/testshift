import { db } from "@/lib/db";

export interface RequirementProposal {
  id: string;
  title: string;
  requirement: string;
  priority: "high" | "medium" | "low";
  viewport: "desktop" | "mobile";
  start_url: string;
  expected: string;
  status: "proposed" | "approved" | "rejected";
  steps: string[];
}

export interface RequirementRun {
  id: string;
  url: string;
  plan: string;
  status: string;
  requirements: string;
  requested: boolean;
  proposals: RequirementProposal[];
}

/** Recent runs that submitted requirements, with their proposed tests. Admin-only: callers check isAdmin first. */
export async function loadRequirementRuns(): Promise<RequirementRun[]> {
  return db()<RequirementRun[]>`
    select r.id, r.url, r.plan, r.status, r.requirements, r.requirements_requested_at is not null as requested,
      coalesce(
        json_agg(json_build_object(
          'id', t.id, 'title', t.title, 'requirement', t.requirement, 'priority', t.priority, 'viewport', t.viewport,
          'start_url', t.start_url, 'expected', t.expected, 'status', t.status, 'steps', t.steps
        ) order by t.created_at) filter (where t.id is not null),
        '[]'
      ) as proposals
    from runs r
    left join requirement_tests t on t.run_id = r.id
    where r.requirements is not null
    group by r.id
    order by r.created_at desc
    limit 25`;
}
