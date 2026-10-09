import { test } from "node:test";
import assert from "node:assert/strict";
import { readableSource, containsSecret, readRepositorySource, GenerationError } from "../src/lib/github/source";
import { validateGeneratedSuite, suiteFiles, generatedWorkflow } from "../src/lib/github/generated-suite";
import { publishSuite } from "../src/lib/github/publish-suite";
import { snapshot, proposal } from "./repository-generation.fixture";
import { generateRepositorySuite } from "../worker/repository-ai";

test("repository source excludes hidden secrets, fixtures, build products and traversal", () => {
  for (const path of [".env.local", ".git/config", "../app.ts", "src/credentials.json", "node_modules/pkg/a.ts", "dist/app.js", "fixtures/customers.json", "package-lock.json", "src/private-key.ts"]) assert.equal(readableSource(path), false, path);
  assert.equal(readableSource("src/checkout.ts"), true);
  assert.equal(containsSecret("const api_key = 'synthetic-sensitive-key-value'"), true);
  assert.equal(containsSecret("postgres://postgres:postgres@127.0.0.1:5432/postgres"), true);
  assert.equal(containsSecret("export const sum = (a,b) => a+b;"), false);
});
test("AI request is bounded and treats source as data; provider failures are not retried", async () => {
  const saved=globalThis.fetch,key=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='fixture-not-real';let calls=0,fail=false;
  globalThis.fetch=async(_input,init)=>{
    calls++;const body=JSON.parse(String(init?.body));assert.equal(body.max_tokens,8192);assert.equal(body.model,'claude-sonnet-5-5');
    assert.match(body.system,/UNTRUSTED DATA/);assert.equal(body.output_config.format.type,'json_schema');assert.ok(body.messages[0].content.includes('src/cart.ts'));
    if(fail)return Response.json({type:'error',error:{type:'overloaded_error',message:'Fixture provider failure'}},{status:529});
    return Response.json({id:'msg_fixture',type:'message',role:'assistant',model:'claude-sonnet-5-5',stop_reason:'end_turn',stop_sequence:null,
      content:[{type:'text',text:JSON.stringify(proposal)}],usage:{input_tokens:100,output_tokens:500,cache_creation_input_tokens:0,cache_read_input_tokens:0}});
  };
  try{const result=await generateRepositorySuite(snapshot);assert.equal(result.suite.files.length,3);assert.ok(result.usage.cost>0);fail=true;await assert.rejects(generateRepositorySuite(snapshot));assert.equal(calls,2);}
  finally{globalThis.fetch=saved;if(key===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=key;}
});
test("proposal validation rejects destructive files, leaked credentials, skipped assertions and fabricated source", () => {
  assert.equal(validateGeneratedSuite(proposal, snapshot).cases.length, 3);
  for (const path of ["package.json", ".github/workflows/deploy.yml", ".testshift/generated/unit/../cart.test.ts", ".testshift/generated/unit/cart.spec.ts"]) {
    assert.throws(() => validateGeneratedSuite({ ...proposal, files: [{...proposal.files[0],path},...proposal.files.slice(1)] },snapshot));
  }
  for (const content of ["test('fake', () => expect(true).toBe(true));", "test('fake arithmetic', () => expect(1+1).toBe(2));", "test.skip('fake', () => expect(true).toBe(true))", "test('network', () => expect(fetch('https://example.com')).toBeTruthy())", "test('secret', () => expect(process.env.GITHUB_TOKEN).toBeTruthy())", "const secret = 'synthetic-sensitive-key-value'; test('x',()=>expect(secret).toBeTruthy());", "test('syntax', () => { expect( }).toBe(1)"] ) {
    assert.throws(() => validateGeneratedSuite({ ...proposal, files: [{...proposal.files[0],content},...proposal.files.slice(1)] },snapshot));
  }
  assert.throws(() => validateGeneratedSuite({ ...proposal, cases: [{...proposal.cases[0], source:"src/invented.ts"},...proposal.cases.slice(1)] },snapshot));
  assert.throws(() => validateGeneratedSuite({ ...proposal, files: proposal.files.slice(1) },snapshot));
});
test("generated workflow isolates categories and uses pinned read-only CI without deployment secrets", () => {
  const workflow = generatedWorkflow(snapshot);
  assert.match(workflow, /category: \[unit, integration, e2e\]/); assert.match(workflow,/fail-fast: false/);
  assert.match(workflow,/persist-credentials: false/); assert.match(workflow,/contents: read/);
  assert.match(workflow,/npm ci/); assert.match(workflow,/127\.0\.0\.1:5432/);
  assert.doesNotMatch(workflow,/pull_request_target|secrets\.|self-hosted|deploy|ANTHROPIC|GITHUB_APP_PRIVATE_KEY/);
  const files = suiteFiles(proposal,snapshot); assert.equal(new Set(files.map(file=>file.path)).size,files.length);
  assert.match(files.find(file=>file.path.endsWith('playwright.config.ts'))!.content,/reuseExistingServer: false/);
  const pnpm = suiteFiles(proposal,{...snapshot,manager:'pnpm',pnpmVersion:'10.20.0'});
  assert.match(pnpm.find(file=>file.path.endsWith('playwright.config.ts'))!.content,/pnpm run dev --host/);
});
test("source inventory reads immutable blobs, omits secret content and refuses truncated trees", async () => {
  const saved = globalThis.fetch; const manifest = JSON.stringify({ scripts:{dev:'vite'},devDependencies:{vite:'8.0.0'} });
  const source = new Map([["1".repeat(40),manifest],["2".repeat(40),snapshot.files[0].content],["3".repeat(40),"const token = 'synthetic-sensitive-key-value'"]]);
  let truncated = false; const fetched: string[] = [];
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/project')) return Response.json({id:7,full_name:'owner/project',default_branch:'main'});
    if (path.endsWith('/commits/main')) return Response.json({sha:snapshot.sha,commit:{tree:{sha:snapshot.treeSha}}});
    if (path.includes('/git/trees/')) return Response.json({truncated,tree:[
      ...[...source].map(([sha,content],index)=>({path:['package.json','src/cart.ts','src/config.ts'][index],sha,size:Buffer.byteLength(content),mode:'100644',type:'blob'})),
      {path:'package-lock.json',sha:'4'.repeat(40),size:10,mode:'100644',type:'blob'},
      {path:'.env',sha:'5'.repeat(40),size:10,mode:'100644',type:'blob'},
    ]});
    if (path.includes('/git/blobs/')) { const sha=path.split('/').at(-1)!; fetched.push(sha); const content=source.get(sha)!; return Response.json({sha,encoding:'base64',size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')}); }
    throw new Error('Unexpected fixture request');
  };
  try {
    const result = await readRepositorySource('fixture','owner/project',7);
    assert.deepEqual(result.files.map(file=>file.path),['package.json','src/cart.ts']); assert.equal(result.sha,snapshot.sha);
    assert.equal(result.inventory.omittedFiles,3); assert.equal(fetched.includes('5'.repeat(40)),false);
    truncated=true; await assert.rejects(readRepositorySource('fixture','owner/project',7),error=>error instanceof GenerationError && error.code==='repository-inventory-too-large');
  } finally {globalThis.fetch=saved;}
});
test("test PR publication preserves the base, deduplicates recovery, and stops on revoked access", async () => {
  const saved=globalThis.fetch, id='12345678-1234-4123-8123-123456789abc', branch=`testshift/tests-${id}`;
  let existing=false, createdPR=false, commits=0, refs=0, pulls=0;
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname, body=init?.body?JSON.parse(String(init.body)):null;
    if(path.endsWith('/git/trees')) { assert.equal(body.base_tree,snapshot.treeSha); assert.ok(body.tree.every((file:{path:string})=>file.path.startsWith('.testshift/generated/')||file.path==='.github/workflows/testshift-generated.yml')); return Response.json({sha:'c'.repeat(40)}); }
    if(path.includes('/git/ref/heads/')) return existing?Response.json({object:{sha:'d'.repeat(40)}}):Response.json({}, {status:404});
    if(path.endsWith('/git/commits')&&init?.method==='POST') {commits++;assert.deepEqual(body.parents,[snapshot.sha]);return Response.json({sha:'d'.repeat(40)});}
    if(path.includes('/git/commits/')) return Response.json({tree:{sha:'c'.repeat(40)},parents:[{sha:snapshot.sha}]});
    if(path.endsWith('/git/refs')) {refs++; assert.equal(body.ref,`refs/heads/${branch}`); existing=true; return Response.json({});}
    if(path.endsWith('/pulls')&&init?.method==='POST'){pulls++;assert.equal(body.base,'main');createdPR=true;return Response.json({number:14});}
    if(path.endsWith('/pulls')) return Response.json(createdPR?[{number:14,state:'open',head:{ref:branch},base:{ref:'main'}}]:[]);
    throw new Error('Unexpected fixture request');
  };
  try{
    assert.equal(await publishSuite('fixture',id,snapshot,proposal,async()=>{}),14);
    assert.equal(await publishSuite('fixture',id,snapshot,proposal,async()=>{}),14);
    assert.deepEqual([commits,refs,pulls],[1,1,1]);
    await assert.rejects(publishSuite('fixture',id,snapshot,proposal,async()=>{throw new GenerationError('generation-access-revoked');}));
    assert.equal(pulls,1);
  }finally{globalThis.fetch=saved;}
});
