import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, documentTemplate, renderDocument } from '../apps/server/src/markdown-protocol.js';
import { validateSample } from '../apps/server/src/visual-sample.js';
import { validateHtml } from '../apps/server/src/validation.js';
import { inspectImage } from '../apps/server/src/image-inspection.js';

test('visual constraint origins roundtrip and cannot be silently inferred', () => {
  const intent = parseDocument('chatbot', documentTemplate('chatbot')).data;
  intent.visual_constraints = ['user','reference','brand','default'].map(origin => ({ origin, requirement: `${origin} constraint`, basis: 'Explicit fixture basis' }));
  assert.deepEqual(parseDocument('chatbot', renderDocument('chatbot', intent)).data, intent);
  assert.throws(() => parseDocument('chatbot', renderDocument('chatbot', { ...intent, visual_constraints: undefined })), /视觉约束|schema|undefined/i);
});
test('real-code sample needs hero, representative real fact and labelled unfinished regions; final output rejects placeholders', () => {
  const design = parseDocument('designer', documentTemplate('designer')).data;
  design.assets=[];
  const base = design.components[0];
  design.components = [{...base,id:'hero',type:'heading',fact_ids:[]}, {...base,id:'info',type:'text',fact_ids:['F1']}, {...base,id:'later',type:'text',fact_ids:['F2']}];
  const html = '<!doctype html><html><head><title>Sample</title></head><body><h1>Specific concept hero</h1><section data-fact-id="F1">Verified representative content and original source, not fabricated filler.</section><section data-unimplemented="later">尚未实现</section></body></html>';
  validateSample(html,design,['hero','info']);
  assert.throws(() => validateSample(html,design,['hero']), /representative/);
  assert.throws(() => validateSample(html.replace('data-fact-id="F1"',''),design,['hero','info']), /F1/);
  assert.throws(() => validateSample(html.replace('data-unimplemented="later"',''),design,['hero','info']), /later/);
  assert.throws(() => validateHtml(html,design), /unfinished/);
});
test('image inspection rejects invalid formats and cancellation before browser launch', async () => {
  const asset = parseDocument('designer', documentTemplate('designer')).data.assets[0];
  await assert.rejects(inspectImage({data:'dGVzdA==',mimeType:'image/png'},asset,new AbortController().signal), /signature/);
  await assert.rejects(inspectImage({data:'dGVzdA==',mimeType:'image/svg+xml'},asset,new AbortController().signal), /format/);
  await assert.rejects(inspectImage({data:'dGVzdA==',mimeType:'image/png'},asset,AbortSignal.abort(new Error('cancel'))), /cancel/);
});

test('continue and repair preserve scope; explicit redesign opens a new scope without changing material or stages', async () => {
  const { executionIntent } = await import('../apps/server/src/execution-intent.js');
  const p = { brief: 'Original material', uploads: [{id:'original'}], execution: {mode:'continue',design_scope:'old'}, state:{stages:{analyst:{status:'completed'}}} } as any;
  const original = JSON.stringify(p);
  assert.equal(executionIntent(p,'continue','Continue operation').design_scope,'old');
  assert.equal(executionIntent(p,'repair','Fix the crop').design_scope,'old');
  assert.notEqual(executionIntent(p,'redesign','New conceptual direction').design_scope,'old');
  assert.equal(JSON.stringify(p),original);
  assert.throws(()=>executionIntent(p,'redesign',''), /reason/);
});

test('role prompt and Skill body changes alter contract digests even at unchanged paths', async () => {
  const { instructionDigest } = await import('../apps/server/src/design-contract.js');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(),'skill-body-'));
  try {
    await writeFile(join(root,'SKILL.md'),'First body');
    const first = await instructionDigest('Role contract',[root]);
    assert.equal(await instructionDigest('Role contract',[root]),first);
    await writeFile(join(root,'SKILL.md'),'Revised body');
    const revised = await instructionDigest('Role contract',[root]);
    assert.notEqual(revised,first);
    assert.notEqual(await instructionDigest('Revised role contract',[root]),revised);
  } finally { await rm(root,{recursive:true,force:true}); }
});


test('workbench keeps defaults out of product flow and separates historical invalidation from pending work', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { VisualWorkflow } = await import('../apps/web/src/VisualWorkflow.js');
  const p = {id:'workflow-test',has_html:true,state:{status:'completed',current_stage:null,stages:{analyst:{status:'completed'},designer:{status:'completed'},builder:{status:'completed',version:'current'}},invalidation:{reason:'Earlier edit',affected:['designer','builder'],at:'2026-11-01'},visual_review:{revision:'current',status:'needs_revision',issues:[{id:'I1',message:'Labels overlap'}]}},intent:{visual_constraints:[{origin:'default',requirement:'Blue-gray industry standard',basis:'Inferred convention'},{origin:'user',requirement:'Use supplied logo',basis:'Brief quotation'}]}} as any;
  const render=()=>renderToStaticMarkup(createElement(VisualWorkflow,{project:p,operate:async()=>{}}));
  let html=render();
  assert.doesNotMatch(html,/Blue-gray|系统默认|继续同一方向/);
  assert.match(html,/历史更新记录：受影响阶段已重新完成/);
  assert.match(html,/需求详情/);assert.match(html,/Use supplied logo/);
  assert.match(html,/待处理问题/);assert.match(html,/Labels overlap/);
  assert.match(html,/<details class="dw-advanced"><summary>诊断详情/);
  p.state.stages.builder.status='pending';html=render();
  assert.match(html,/仍待更新：作品制作/);
  html=render();assert.doesNotMatch(html,/Labels overlap/);
  p.state.stages.builder={status:'completed',version:'new'};html=render();assert.doesNotMatch(html,/Labels overlap/);
  p.has_html=false;p.state.stages.designer.status='pending';p.state.visual_sample={status:'issues',version:'old',checks:1,issues:[{id:'old',message:'Old sample issue'}]};
  html=render();assert.doesNotMatch(html,/Old sample issue|查看实际样稿/);
});
