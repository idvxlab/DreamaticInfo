/** Manual UI verification. Isolated fixture server only; never imported by the product. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path'; import os from 'node:os'; import net from 'node:net'; import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const config=await mkdtemp(path.join(os.tmpdir(),'info-facts-preview-config-'));
const output=await mkdtemp(path.join(os.tmpdir(),'info-facts-preview-images-'));
process.env.INFO_CONFIG_DIR=config;
const socket=net.createServer(); await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve)); const port=(socket.address() as net.AddressInfo).port; await new Promise<void>(resolve=>socket.close(()=>resolve()));
await writeFile(path.join(config,'.env'),`PORT=${port}\n`);
const store=await import('../../apps/server/src/store.js');
const {Orchestrator}=await import('../../apps/server/src/orchestrator.js');
const {fixtureRunner}=await import('./workflow-runner.js');
const {ingest}=await import('../../apps/server/src/ingest.js');
const {AnalystWorkbench}=await import('../../apps/server/src/analyst-workbench.js');
const {renderDocument}=await import('../../apps/server/src/markdown-protocol.js');
const {browserOptions}=await import('../../apps/server/src/browser.js');
const p=await store.create('Facts UI fixture','live'); await ingest(p,'reading.csv',await readFile('tests/fixtures/reading.csv'));
await new Orchestrator(async(...args)=>{if(args[1]==='analyst')throw new Error('Fixture analysis paused');return fixtureRunner(...args);}).start(p.id);
const ready=await store.get(p.id), inputs=await store.upstream(ready,'analyst');
const work=await AnalystWorkbench.open(ready,inputs.research,inputs.intent);
const good=(await fixtureRunner(ready,'analyst',{} as any,{signal:new AbortController().signal,event:()=>{}})).data;
const invalid=structuredClone(good); invalid.facts[0].evidence=invalid.facts[0].evidence.map((item:any,index:number)=>({...item,quote:index===0?'不在原文中的测试引文':item.quote}));
await assert.rejects(work.saveDraft(renderDocument('analyst',invalid)));
const child=spawn(process.execPath,['--import','tsx','apps/server/src/index.ts'],{cwd:process.cwd(),env:{...process.env,INFO_CONFIG_DIR:config},stdio:'ignore'});
let browser: Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 let available=false;for(let i=0;i<100;i++){try{available=(await fetch(`http://127.0.0.1:${port}/api/health`)).ok;}catch{}if(available)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(available);
 browser=await chromium.launch({headless:true,...await browserOptions()});const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${port}/`);await page.getByText(ready.title,{exact:true}).first().click();await page.getByRole('tab',{name:/数据事实/}).click();await page.locator('.analysis-progress').waitFor();
 assert.equal(await page.locator('.analysis-draft-item').count(),3);await page.getByRole('button',{name:'仅看待修正',exact:true}).click();assert.equal(await page.locator('.analysis-draft-item').count(),1);await page.getByRole('button',{name:'全部草稿',exact:true}).click();
 await page.screenshot({path:path.join(output,'draft-desktop.png')});
 const current=await work.readDraft();const revision=/草稿版本：([a-f0-9-]{36})/.exec(current)![1];const single=renderDocument('analyst',{summary:good.summary,facts:[good.facts[0]]}).split('## 数据事实\n\n')[1].split('## 说明')[0];await work.patchFact(revision,good.facts[0].id,single);
 await page.waitForFunction(()=>document.querySelector('.analysis-counts .verified strong')?.textContent==='3');assert.equal(await page.locator('.analysis-draft-item.needs_revision').count(),0);
 await page.setViewportSize({width:760,height:1050});await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=0);await page.screenshot({path:path.join(output,'draft-narrow.png')});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({output,checks:['draft cards','pending filter','live polling after repair','desktop and narrow screenshots','no page errors']}));
}finally{await browser?.close();if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}await rm(config,{recursive:true,force:true});}
