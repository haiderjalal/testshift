import { runGitHubWorker } from "../worker/github";
void runGitHubWorker().catch(() => { console.error("GitHub worker could not start. Check integration configuration."); process.exitCode = 1; });
