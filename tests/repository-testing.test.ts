import { test } from "node:test";
import assert from "node:assert/strict";
import { githubRepository, repositoryBrief, repositoryRequest, testingMode } from "../src/lib/repository-testing";

test("repository intake allows GitHub identifiers and rejects credentials and other targets", () => {
  assert.equal(githubRepository("https://github.com/example/project"), true);
  for (const url of ["https://token@github.com/example/project", "https://github.com/example/project?token=fixture", "https://github.com/example/project#branch", "http://github.com/example/project", "https://github.com.evil.test/example/project", "https://127.0.0.1/example/project", "https://github.com/example/project/tree/main", "https://github.com/example/.."])
    assert.equal(githubRepository(url), false, url);
});

test("destructive planning requires a repository mode and valid repository", () => {
  assert.equal(repositoryRequest.safeParse({ mode: "website", repository: "", destructive: "on" }).success, false);
  assert.equal(repositoryRequest.safeParse({ mode: "ci", repository: "", destructive: "" }).success, false);
  assert.equal(repositoryRequest.safeParse({ mode: "repository", repository: "https://github.com/example/project", destructive: "on" }).success, true);
  assert.equal(testingMode("constructor"), "website");
});

test("repository brief records planning scope without implying access or execution", () => {
  const brief = repositoryBrief({ mode: "ci", repository: "https://github.com/example/project", destructive: "on" }, "Run the existing regression suite.");
  assert.match(brief, /GitHub CI setup/);
  assert.match(brief, /environment requested: yes/);
  assert.match(brief, /grants no repository or production permissions/);
  assert.equal(repositoryBrief({ mode: "website", repository: "", destructive: "" }, "Website testing"), "Website testing");
});
