import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { customerConfig, customerWorkflow } from "@/lib/github/workflow";
import { sourceZip } from "@/lib/github/zip";
export async function GET() {
  const [action, runner] = await Promise.all([readFile(join(process.cwd(), "github-action/action.yml"), "utf8"), readFile(join(process.cwd(), "github-action/runner.mjs"), "utf8")]);
  const archive = sourceZip([
    { name: ".github/workflows/testshift.yml", data: customerWorkflow },
    { name: ".github/actions/testshift/action.yml", data: action },
    { name: ".github/actions/testshift/runner.mjs", data: runner },
    { name: "testshift.config.json", data: JSON.stringify(customerConfig, null, 2) },
    { name: "TESTSHIFT_SETUP.txt", data: "Review every command and adapt testshift.config.json to your stack. Required scripts must exist; missing tests fail. Provision synthetic fixtures and a test server for E2E. Never add production secrets. Extract this bundle at your repository root; commit the reviewed workflow, action and config. Connect this repository on TestShift to receive verified workflow reports. Destructive testing is disabled until the config and action input both explicitly approve it. See the TestShift GitHub integration guide for details.\n" },
  ]);
  return new Response(new Uint8Array(archive), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="testshift-github-starter.zip"', "Cache-Control": "no-store" } });
}
