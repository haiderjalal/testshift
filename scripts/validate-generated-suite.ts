/** Executes ONLY the synthetic fixture, never a connected customer repository. No AI calls or GitHub writes. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { suiteFiles, validateGeneratedSuite } from "../src/lib/github/generated-suite";
import { snapshot, proposal } from "../tests/repository-generation.fixture";

const root = resolve('test-results/generated-pilot');
async function main() {
await mkdir(resolve(root,'src'),{recursive:true});
const files = suiteFiles(validateGeneratedSuite(proposal,snapshot),snapshot);
for(const file of files){const path=resolve(root,file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.content);}
await writeFile(resolve(root,'src/cart.ts'),snapshot.files[0].content);
await writeFile(resolve(root,'package.json'),JSON.stringify({private:true,type:'module',scripts:{dev:'vite'},devDependencies:{vite:'8.3.4'}}));
await writeFile(resolve(root,'index.html'),`<!doctype html><html><body><button>Checkout</button><p role="status">Waiting</p><script type="module">import {checkout} from '/src/cart.ts';document.querySelector('button').onclick=()=>document.querySelector('[role=status]').textContent='Total: '+checkout([20,30],0.2);</script></body></html>`);
async function run(command:string,args:string[],environment:Record<string,string>={}) {
  await new Promise<void>((accept,reject)=>{
    const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,...environment,CI:'true'}});
    child.once('error',reject);child.once('exit',code=>code===0?accept():reject(new Error('Synthetic generated-suite check failed')));
  });
}
// Launch npm through its JS CLI so Windows requires no shell/argument interpolation.
const npm = process.env.npm_execpath;
if(!npm)throw new Error('Run with npm run github:validate-generated');
await run(process.execPath,[npm,'install','--ignore-scripts','--no-audit','--no-fund']);
await run(process.execPath,[npm,'ci','--prefix','.testshift/generated','--ignore-scripts','--no-audit','--no-fund']);
const tool=(path:string)=>resolve(root,'.testshift/generated/node_modules',path);
for(const category of ['unit','integration'])await run(process.execPath,[tool('vitest/vitest.mjs'),'run','--config','.testshift/generated/vitest.config.ts'],{TESTSHIFT_CATEGORY:category});
await run(process.execPath,[tool('@playwright/test/cli.js'),'install','--no-shell','chromium']);
await run(process.execPath,[tool('@playwright/test/cli.js'),'test','--config','.testshift/generated/playwright.config.ts']);
console.log('SYNTHETIC_GENERATED_SUITE_OK');
}
void main().catch(()=>{console.error('Synthetic generated-suite validation failed');process.exitCode=1;});
