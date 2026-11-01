import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RunMetrics } from '../apps/server/src/run-metrics.js';
import { documentTemplate, parseDocument, renderDocument } from '../apps/server/src/markdown-protocol.js';

test('composition and complete asset commissions survive Markdown; optional extension does not manufacture fields', () => {
  const template = documentTemplate('designer');
  const parsed = parseDocument('designer', template).data;
  assert.ok(parsed.composition);
  assert.ok(parsed.assets[0].commission);
  assert.deepEqual(parseDocument('designer', renderDocument('designer', parsed)).data, parsed);
  delete parsed.composition;
  parsed.assets = [];
  delete parsed.components[0].asset_ids;
  assert.deepEqual(parseDocument('designer', renderDocument('designer', parsed)).data, parsed);
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
