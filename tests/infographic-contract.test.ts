import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RunMetrics } from '../apps/server/src/run-metrics.js';
import { documentTemplate, parseDocument, renderDocument } from '../apps/server/src/markdown-protocol.js';

test('composition and complete asset commissions survive Markdown; missing formal fields are rejected', () => {
  const template = documentTemplate('designer');
  const parsed = parseDocument('designer', template).data;
  assert.ok(parsed.composition);
  assert.ok(parsed.assets[0].commission);
  assert.deepEqual(parseDocument('designer', renderDocument('designer', parsed)).data, parsed);
  delete parsed.composition;
  parsed.assets = [];
  delete parsed.components[0].asset_ids;
  assert.throws(() => parseDocument('designer', renderDocument('designer', parsed)), /整体设计|素材编号/);
});
test('metrics preserve ordered events and wall spans without recording content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'info-metrics-'));
  try {
    const metrics = new RunMetrics(root);
    metrics.record('start'); metrics.span('stage', { role: 'designer' })();
    await metrics.flush();
    const events = (await readFile(path.join(root, 'state/performance.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => event.kind), ['start', 'stage']);
    assert.equal(events[0].run, events[1].run);
    assert.ok(events[1].duration_ms >= 0);
    assert.equal(events[1].prompt, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('editorial visual system survives Markdown and cannot silently accept an older design contract', () => {
  const design = parseDocument('designer', documentTemplate('designer')).data;
  const fields = ['core_message', 'information_hierarchy', 'primary_visual', 'typography', 'background_treatment', 'decoration_rules', 'visual_acceptance'];
  for (const field of fields) {
    const edited = structuredClone(design);
    edited.composition[field] = `Concrete visual decision for ${field}: region A | region B`;
    assert.equal(parseDocument('designer', renderDocument('designer', edited)).data.composition[field], edited.composition[field]);
    delete edited.composition[field];
    assert.throws(() => parseDocument('designer', renderDocument('designer', edited)), `${field} must be required`);
  }
  design.assets = [];
  design.components.forEach((component: any) => { component.asset_ids = []; });
  assert.deepEqual(parseDocument('designer', renderDocument('designer', design)).data.assets, []);
});

test('asset reference lists accept a single none marker but reject mixed IDs', () => {
 const template = documentTemplate('designer');
 const design = parseDocument('designer', template).data;
 design.assets = [];
 design.components.forEach((c: any) => { c.asset_ids = []; });
 const markdown = renderDocument('designer', design);
 const bullet = markdown.replace(/(#### 素材编号列表\n\n)无/g, '$1- 无');
 assert.deepEqual(parseDocument('designer', bullet).data, design);
 assert.throws(() => parseDocument('designer', bullet.replace('- 无', '- 无\n- A-1')), /混写/);
 const assetDocument = template.replace(/(##### 关联内容编号\n\n)[^#]+/, '$1- 无\n\n');
 assert.deepEqual(parseDocument('designer', assetDocument).data.assets[0].commission.content_ids, []);
});
