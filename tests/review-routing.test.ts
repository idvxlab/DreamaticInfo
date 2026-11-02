import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await mkdtemp(path.join(os.tmpdir(),'info-review-route-'));
process.env.INFO_CONFIG_DIR = root;
const store = await import('../apps/server/src/store.js');
const { ingest } = await import('../apps/server/src/ingest.js');
const { Orchestrator } = await import('../apps/server/src/orchestrator.js');
const { fixtureRunner } = await import('./fixtures/workflow-runner.js');
test('explicit visual findings repair only their owning role and preserve unrelated upstream versions', async () => {
  const p = await store.create('Synthetic local review repair','live');
  await ingest(p,'reading.csv',await readFile('tests/fixtures/reading.csv'));
  let reviews = 0, repairSeen = false;
  const scheduler = new Orchestrator(async (project,role,config,context) => {
   if (role === 'builder' && context.repair?.length) repairSeen = true;
   return fixtureRunner(project,role,config,context);
  }, async () => ++reviews === 1 ? { status:'issues',markdown:'local implementation issue',issues:[{id:'R1',owner:'builder',component:'heading',message:'Repair this heading only'}] } : {status:'passed',markdown:'无问题',issues:[]});
  await scheduler.start(p.id);
  const finished = await store.get(p.id);
  assert.equal(finished.state.status,'completed',finished.state.error ?? '');
  assert.equal(finished.state.stages.builder.attempts,2);
  assert.equal(finished.state.stages.designer.attempts,1);
  assert.equal(finished.state.stages.analyst.attempts,1);
  assert.equal(reviews,2); assert.ok(repairSeen);
});

test('a composition issue reruns Designer and Builder while retaining official facts', async () => {
 const p = await store.create('Synthetic composition review repair','live');
 await ingest(p,'reading.csv',await readFile('tests/fixtures/reading.csv'));
 let reviews = 0;
 const repaired: string[] = [];
 const scheduler = new Orchestrator(async (project,role,config,context) => {
  if (context.repair?.length) repaired.push(role);
  return fixtureRunner(project,role,config,context);
 }, async () => ++reviews === 1 ? {status:'issues',markdown:'A concrete focal hierarchy failure',issues:[{id:'D1',owner:'designer',component:'整体',message:'Equal-weight regions obscure the core comparison; establish a primary region and retain supporting sources.'}]} : {status:'passed',markdown:'无问题',issues:[]});
 await scheduler.start(p.id);
 const finished = await store.get(p.id);
 assert.equal(finished.state.status,'completed',finished.state.error ?? '');
 assert.equal(finished.state.stages.designer.attempts,2);
 assert.equal(finished.state.stages.builder.attempts,2);
 assert.equal(finished.state.stages.analyst.attempts,1);
 assert.ok(repaired.includes('designer'));
});

test('two repairs retain review history and leave a viewable delivery with explicit failed visual acceptance', async () => {
 const p = await store.create('Synthetic review exhaustion', 'live');
 await ingest(p,'reading.csv',await readFile('tests/fixtures/reading.csv'));
 let reviews = 0;
 const scheduler = new Orchestrator(fixtureRunner, async (_p,_html,_design,_models,_signal,context) => {
  assert.equal(context?.history?.length, reviews);
  assert.equal(context?.previousIssues?.length, reviews ? 1 : 0);
  reviews++;
  return {status:'issues', markdown:'Concrete unresolved issue', issues:[{id:'R1',owner:'builder',component:'heading',message:'The declared heading remains occluded; preserve content and fix its placement.'}]};
 });
 await scheduler.start(p.id);
 let finished = await store.get(p.id);
 assert.equal(reviews,3);
 assert.equal(finished.state.status,'completed');
 assert.equal(finished.state.error,null);
 assert.equal(finished.state.stages.builder.status,'completed');
 assert.equal(finished.state.stages.builder.attempts,3);
 assert.equal(finished.state.visual_review?.status,'needs_revision');
 assert.equal(finished.state.visual_review?.issues[0].id,'R1');
 assert.equal((await store.detail(finished)).has_html,true);
 const ledger = JSON.parse(await readFile(path.join(store.projectDir(p.id),'state/reviews/history.json'),'utf8'));
 assert.equal(ledger.history.length,3);
 await scheduler.start(p.id);
 finished = await store.get(p.id);
 assert.equal(reviews,3);
 assert.equal(finished.state.visual_review?.status,'needs_revision');
});

test('unsupported follow-up vision does not close open review issues', async () => {
 const p = await store.create('Synthetic unsupported review', 'live');
 await ingest(p,'reading.csv',await readFile('tests/fixtures/reading.csv'));
 let reviews = 0;
 const scheduler = new Orchestrator(fixtureRunner, async () => ++reviews === 1 ? {status:'issues',markdown:'Concrete issue',issues:[{id:'R1',owner:'builder',component:'heading',message:'Heading is obscured'}]} : {status:'unsupported',markdown:'Vision unavailable',issues:[]});
 await scheduler.start(p.id);
 const finished = await store.get(p.id);
 assert.equal(finished.state.visual_review?.status,'unsupported');
 assert.equal(finished.state.visual_review?.issues[0].id,'R1');
 const ledger = JSON.parse(await readFile(path.join(store.projectDir(p.id),'state/reviews/history.json'),'utf8'));
 assert.deepEqual(ledger.history[1].resolved,[]);
});

after(async () => { await rm(root,{recursive:true,force:true}); });

test('sample concept rejection revises formal design before delivery and retains facts and rendered history', async () => {
 const p=await store.create('Synthetic sample concept gate','live');
 await ingest(p,'reading.csv',await readFile('tests/fixtures/reading.csv'));
 let samples=0;
 const scheduler=new Orchestrator(async(project,role,config,context)=>{
   const result=await fixtureRunner(project,role,config,context);
   if(role==='builder')await context.sample?.(result.data.html);
   return result;
 },async(_p,_html,_design,_models,_signal,context)=>{
   if(context?.milestone==='sample'&&++samples===1)return{status:'issues',markdown:'Specific concept issue',issues:[{id:'S1',owner:'designer',component:'heading',message:'Establish the core comparison as the dominant region'}]};
   return{status:'passed',markdown:'无问题',issues:[]};
 });
 await scheduler.start(p.id);const finished=await store.get(p.id);
 assert.equal(finished.state.status,'completed',finished.state.error??'');assert.equal(samples,2);
 assert.equal(finished.state.stages.analyst.attempts,1);assert.equal(finished.state.stages.designer.attempts,2);
 assert.equal(finished.state.visual_sample?.status,'passed');assert.equal(finished.state.execution_budget?.repair,1);
 const sample=finished.state.visual_sample!;
 assert.ok((await readFile(path.join(store.projectDir(p.id),`state/samples/${sample.version}/index.html`),'utf8')).includes('<html'));
});
