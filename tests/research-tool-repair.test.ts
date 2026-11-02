import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'info-research-tool-repair-'));process.env.INFO_CONFIG_DIR=root;
const store=await import('../apps/server/src/store.js');
const {ResearchWorkbench,candidateId}=await import('../apps/server/src/research-workbench.js');
const {researchFeedback,ResearchToolError,ResearchFeedbackPolicy,ResearchToolLoopError}=await import('../apps/server/src/research-feedback.js');
const {verifyOfficialRecord}=await import('../apps/server/src/source-connectors.js');
const {updateProgress}=await import('../apps/server/src/research-state.js');
const {ingest}=await import('../apps/server/src/ingest.js');
const {validateProvenance}=await import('../apps/server/src/provenance.js');
const plan=`## 调研目标\nVerify population and explain remaining coverage.\n\n## 搜索队列\n| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |\n| --- | --- | --- | --- | --- |\n| Q1 | Population time series | population | 1 | worldbank |\n| W1 | Missing age coverage, differently worded | official age report | 2 | web |`;
const response=(data:unknown)=>{const text=JSON.stringify(data);return {text,buffer:Buffer.from(text),url:'https://api.worldbank.org/v2/indicator',contentType:'application/json',status:200};};
try {
  await test('partial coverage retains evidence and gap, shows exact valid IDs and rejects invalid rows atomically',async()=>{
    const p=await store.create('Partial coverage','live');await ingest(p,'data.csv',Buffer.from('year,value\n2020,1\n2021,2'));
    const w=await ResearchWorkbench.open(p);await w.savePlan(plan);
    await w.saveCoverage(`| 任务 | 来源编号 | 缺口说明 |\n| --- | --- | --- |\n| Q1 | ${p.uploads[0].id} | Missing earlier years |\n| W1 | 无 | No independent explanatory evidence was obtained |`);
    const state=await w.snapshot();assert.deepEqual(state.tasks[0].resolution,{source_ids:[p.uploads[0].id],gap:'Missing earlier years'});
    await assert.rejects(w.saveCoverage('| 任务 | 来源编号 | 缺口说明 |\n| --- | --- | --- |\n| Q1 Population | 无 | Missing population evidence |'),error=>error instanceof ResearchToolError&&error.next_action.includes('Q1, W1'));
    assert.deepEqual((await w.snapshot()).tasks[0].resolution,state.tasks[0].resolution);
    await w.assertReady();
    const draft=await w.composeReport(`## 概要\nPartial observations only.\n\n## 采用来源\n- ${p.uploads[0].id}\n\n## 局限\n无\n\n## 说明\nKeep professional interpretation separate from metadata.`);
    const parsed=await w.submitReport(draft.draft_revision);assert.equal(parsed.data.sources[0].path,p.uploads[0].normalized);assert.equal(parsed.data.datasets[0].source_id,p.uploads[0].id);assert.ok(parsed.data.limitations.includes('Missing earlier years'));
    await validateProvenance(p,'researcher',parsed.data);
    await writeFile(path.join(store.projectDir(p.id),draft.path),'tampered');await assert.rejects(w.submitReport(draft.draft_revision),/变化/);
    const fresh=await w.composeReport(`## 概要\nPartial observations.\n\n## 采用来源\n- ${p.uploads[0].id}\n\n## 局限\n无`);
    await w.savePlan(plan);await assert.rejects(w.submitReport(fresh.draft_revision),/过期|覆盖/);
  });
  await test('supplemental discovery follows task references rather than wording and validates nonexistent references',async()=>{
    let calls=0;const p=await store.create('Related tasks','live');const w=await ResearchWorkbench.open(p,{search:async()=>{calls++;return [];},fetch:async()=>{throw new Error('unused');}});await w.savePlan(plan);
    await assert.rejects(w.search('W1',undefined,false,{purpose:'data_gap',reason:'Missing age observations',related_task_ids:['Q1']}),/关联/);
    await w.search('Q1');await w.search('W1',undefined,false,{purpose:'data_gap',reason:'Missing age observations',related_task_ids:['Q1']});assert.equal(calls,2);
    await assert.rejects(w.search('W1',undefined,false,{purpose:'data_gap',reason:'Missing age observations',related_task_ids:['invented']}),/关联/);
  });
  await test('official known-code verification registers stable candidates independent of keyword ranking',async()=>{
    const hit=await verifyOfficialRecord('worldbank','SL.UEM.TOTL.ZS',undefined,async()=>response([{},[{id:'SL.UEM.TOTL.ZS',name:'Unemployment total',sourceOrganization:'Official statistics'}]]));
    assert.equal(hit.metadata?.record_id,'SL.UEM.TOTL.ZS');assert.equal(candidateId(hit),candidateId({...hit,title:'Changed presentation'}));
    await assert.rejects(verifyOfficialRecord('worldbank','https://private.example/api',undefined,async()=>{throw new Error('must not request');}),/无效/);
    const w=await ResearchWorkbench.open(await store.create('Known code','live'),{search:async()=>[],fetch:async()=>{throw new Error('unused');},verify:async()=>hit,inspect:async candidate=>({hit:candidate,metadata:candidate.metadata!,files:[],details:{verified:true}})});await w.savePlan(plan);
    const candidate=await w.verify('Q1','SL.UEM.TOTL.ZS');const inspected=await w.inspect('Q1',candidate.candidate_id!);assert.equal(inspected.metadata.record_id,'SL.UEM.TOTL.ZS');
    assert.match(await w.report(true),/C-[a-f0-9]{20}/);await assert.rejects(w.inspect('W1',candidate.candidate_id!),/候选编号/);
  });
  await test('feedback distinguishes corrections, prerequisites, outages and cancellation without hiding internal errors',()=>{
    assert.equal(researchFeedback(new ResearchToolError('bad_id','parameter','Wrong ID','Use Q1'),'inspect_dataset').category,'parameter');
    assert.equal(researchFeedback(new Error('先保存搜索计划'),'search_sources').category,'prerequisite');
    assert.equal(researchFeedback(new Error('Official API HTTP 503'),'search_sources').category,'unavailable');
    assert.equal(researchFeedback(new Error('This operation was aborted'),'search_sources').category,'interrupted');
    assert.equal(researchFeedback(new Error('Unexpected database corruption'),'search_sources').category,'internal');
  });
  await test('identical rejected calls do not repeat work and state changes permit correction',async()=>{
    const policy=new ResearchFeedbackPolicy();let calls=0;const run=async()=>{calls++;throw new ResearchToolError('candidate','prerequisite','Wrong candidate','Read C-1 from Q1');};
    await policy.execute('inspect',{id:'wrong'},'state1',run);const second=await policy.execute('inspect',{id:'wrong'},'state1',run);assert.equal(calls,1);assert.equal(second.ok,false);if(!second.ok)assert.match(second.feedback.next_action,/未重复执行/);
    await assert.rejects(policy.execute('inspect',{id:'wrong'},'state1',run),ResearchToolLoopError);assert.equal(calls,1);
    await policy.execute('inspect',{id:'wrong'},'state2',run);assert.equal(calls,2);
  });
} finally {await rm(root,{recursive:true,force:true});}
