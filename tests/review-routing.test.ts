import { test } from 'node:test';
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
 try {
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
 } finally { await rm(root,{recursive:true,force:true}); }
});
