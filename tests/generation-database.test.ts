import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { enqueueGeneration, claimGeneration } from "../src/lib/github/generation-store";
import { processRepositoryGeneration } from "../worker/repository-generation";
import { snapshot, proposal } from "./repository-generation.fixture";

const database = new PGlite(); let socket: PGLiteSocketServer; let sql: postgres.Sql; let connection: string;
const savedFetch = globalThis.fetch;
const variables = ['GITHUB_GENERATION_ENABLED','ANTHROPIC_API_KEY','GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY'] as const;
const savedEnv = Object.fromEntries(variables.map(key=>[key,process.env[key]]));
before(async()=>{
  for(const file of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort()) await database.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  socket = new PGLiteSocketServer({db:database,port:0,host:'127.0.0.1'}); await socket.start();
  sql=postgres(`postgres://postgres:postgres@${socket.getServerConn()}/postgres`,{prepare:false,max:1});Object.assign(globalThis,{sql});
  await sql`insert into github_users (id,login) values (1,'owner'),(2,'other')`;
  const [row]=await sql`insert into github_connections (user_id,installation_id,repository_id,full_name,workflow_path) values (1,5,7,'owner/project','.github/workflows/testshift-generated.yml') returning id`;connection=row.id;
  process.env.GITHUB_GENERATION_ENABLED='1'; process.env.ANTHROPIC_API_KEY='fixture-not-a-real-api-key';process.env.GITHUB_APP_ID='123';
  process.env.GITHUB_APP_PRIVATE_KEY=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
});
beforeEach(async()=>{await sql`delete from github_generations`;await sql`delete from github_generation_daily`;await sql`delete from github_generation_reservations`;await sql`update github_connections set active=true`;globalThis.fetch=savedFetch;});
after(async()=>{globalThis.fetch=savedFetch;for(const key of variables){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key];}await sql?.end();await socket?.stop();await database.close();});
const enqueue=()=>sql.begin(tx=>enqueueGeneration(tx,connection,'1'));

test('generation queue deduplicates requests and grants one exclusive lease',async()=>{
  const ids=await Promise.all([enqueue(),enqueue()]);assert.equal(ids[0],ids[1]);
  assert.equal((await sql`select requests from github_generation_daily`)[0].requests,1);
  const leases=await Promise.all([claimGeneration(sql),claimGeneration(sql)]);assert.equal(leases.filter(Boolean).length,1);
  await sql`delete from github_connections where id=${connection} and user_id=2`;
  assert.equal((await sql`select id from github_generations` ).length,1);
  await database.exec(await readFile('supabase/migrations/20261010000000_github_generation.sql','utf8'));
  assert.equal((await sql`select id from github_generations` ).length,1);
  const tables=await sql`select relname,relrowsecurity from pg_class where relname in ('github_generations','github_generation_daily','github_generation_reservations')`;
  assert.equal(tables.length,3);assert.ok(tables.every(row=>row.relrowsecurity));
});
test('daily reservation caps concurrent generation before a model is called',async()=>{
  await sql`insert into github_generation_daily (requests) values (10)`;
  await assert.rejects(enqueue()); assert.equal((await sql`select id from github_generations`).length,0);
  await sql`update github_generation_daily set requests=0`;
  for(let i=0;i<3;i++){const id=await enqueue();await sql`update github_generations set status='failed' where id=${id}`;}
  await assert.rejects(enqueue());assert.equal((await sql`select requests from github_generation_daily`)[0].requests,3);
  await sql`delete from github_generations where connection_id=${connection}`;
  await assert.rejects(enqueue());assert.equal((await sql`select requests from github_generation_daily`)[0].requests,3);
});
test('crashed AI requests fail without duplicate spending and revoked connections cannot be claimed',async()=>{
  await enqueue();const first=await claimGeneration(sql);
  await sql`update github_generations set model_started_at=now(),lease_until=now()-interval '1 second' where id=${first.id}`;
  assert.equal(await claimGeneration(sql),null);assert.equal((await sql`select failure_code from github_generations`)[0].failure_code,'generation-interrupted');
  await enqueue();await sql`update github_connections set active=false where id=${connection}`;assert.equal(await claimGeneration(sql),null);
});

function transport({failFirstPull=false}: {failFirstPull?:boolean}={}) {
  let ref=false,pr=false;const counts={model:0,refs:0,pulls:0,tokens:0};
  const pkg=JSON.stringify({scripts:{dev:'vite'},devDependencies:{vite:'8.0.0'}});
  const blobs=new Map([['1'.repeat(40),pkg],['2'.repeat(40),snapshot.files[0].content]]);
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),path=url.pathname,body=init?.body?JSON.parse(String(init.body)):null;
    if(path.endsWith('/access_tokens')){counts.tokens++;assert.deepEqual(body.repository_ids,[7]);if(body.permissions.contents==='write')assert.deepEqual(body.permissions,{contents:'write',pull_requests:'write',workflows:'write'});return Response.json({token:'fixture-scoped-token'});}
    if(path==='/installation/token')return new Response(null,{status:204});
    if(path.endsWith('/permission'))return Response.json({permission:'admin'});
    if(path==='/repos/owner/project')return Response.json({id:7,full_name:'owner/project',default_branch:'main'});
    if(path.endsWith('/commits/main'))return Response.json({sha:snapshot.sha,commit:{tree:{sha:snapshot.treeSha}}});
    if(path.includes('/git/trees/')&&init?.method==='GET')return Response.json({truncated:false,tree:[
      ...[...blobs].map(([sha,content],index)=>({path:['package.json','src/cart.ts'][index],sha,size:Buffer.byteLength(content),type:'blob',mode:'100644'})),
      {path:'package-lock.json',sha:'3'.repeat(40),size:10,type:'blob',mode:'100644'}]});
    if(path.includes('/git/blobs/')){const sha=path.split('/').at(-1)!,content=blobs.get(sha)!;return Response.json({sha,encoding:'base64',content:Buffer.from(content).toString('base64'),size:Buffer.byteLength(content)});}
    if(path.endsWith('/git/trees')&&init?.method==='POST')return Response.json({sha:'c'.repeat(40)});
    if(path.includes('/git/ref/heads/'))return ref?Response.json({object:{sha:'d'.repeat(40)}}):Response.json({},{status:404});
    if(path.endsWith('/git/commits')&&init?.method==='POST')return Response.json({sha:'d'.repeat(40)});
    if(path.includes('/git/commits/'))return Response.json({tree:{sha:'c'.repeat(40)},parents:[{sha:snapshot.sha}]});
    if(path.endsWith('/git/refs')){counts.refs++;ref=true;return Response.json({});}
    if(path.endsWith('/pulls')&&init?.method==='POST'){counts.pulls++;pr=true;return failFirstPull?Response.json({},{status:503}):Response.json({number:42});}
    if(path.endsWith('/pulls'))return Response.json(pr?[{number:42,state:'open',head:{ref:`testshift/tests-${url.searchParams.get('head')!.split('tests-')[1]}`},base:{ref:'main'}}]:[]);
    throw new Error('Unexpected fixture API');
  };
  return counts;
}
test('generation analyzes code, persists a proposal and recovers an uncertain PR response without another AI call',async()=>{
  const id=await enqueue(),counts=transport({failFirstPull:true});
  const generate=async()=>{counts.model++;return{suite:proposal,usage:{input:100,output:200,cost:0.0022}};};
  assert.equal(await processRepositoryGeneration(generate),true);
  let [job]=await sql`select * from github_generations where id=${id}`;assert.equal(job.status,'queued');assert.ok(job.artifact);assert.deepEqual(job.artifact.source.files,[]);
  assert.equal(JSON.stringify(job.artifact).includes(snapshot.files[0].content),false);assert.equal(Number(job.cost_usd),0.0022);
  await sql`update github_generations set next_attempt_at=now() where id=${id}`;
  await processRepositoryGeneration(generate);[job]=await sql`select * from github_generations where id=${id}`;
  assert.equal(job.status,'review_ready');assert.equal(Number(job.pull_number),42);
  assert.deepEqual([counts.model,counts.refs,counts.pulls],[1,1,1]);
});
test('disconnect during generation prevents the proposed PR being published',async()=>{
  const id=await enqueue(),counts=transport();
  await processRepositoryGeneration(async()=>{counts.model++;await sql`update github_connections set active=false where id=${connection}`;return{suite:proposal,usage:{input:10,output:10,cost:0.00012}};});
  const [job]=await sql`select * from github_generations where id=${id}`;assert.equal(job.status,'blocked');assert.equal(counts.pulls,0);
});
