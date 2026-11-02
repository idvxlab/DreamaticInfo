import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AssetService } from '../apps/server/src/asset-service.js';
import { parseReview } from '../apps/server/src/visual-review.js';
import { documentTemplate, parseDocument } from '../apps/server/src/markdown-protocol.js';
import type { Design } from '../packages/shared/types.js';

test('official commissions execute with bounded concurrency, reuse content cache and expose failures as explicit fallback', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'info-assets-'));
 const asset = parseDocument('designer', documentTemplate('designer')).data.assets[0] as Design['assets'][number];
 asset.implementation = 'generated_image'; asset.width = 1; asset.height = 1; asset.commission.transparent = 'optional';
 const assets = [0,1,2].map(i => ({ ...asset, id: `a${i}` }));
 let active = 0, peak = 0, calls = 0;
 const generate = async () => { calls++; active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 10)); active--; return { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', mimeType: 'image/png' }; };
 try {
   const service = new AssetService(root, assets, { model: 'test' }, new AbortController().signal, generate);
   service.start(); const results = await service.settle();
   assert.equal(peak, 2); assert.equal(calls, 3); assert.equal(results[0].status, 'ready');
   assert.equal(await service.get('a0'), results[0]);
   const cache = new AssetService(root, assets, { model: 'test' }, new AbortController().signal, generate);
   await cache.settle(); assert.equal(calls, 3);
   await new AssetService(root, assets.slice(0,1), { model: 'changed' }, new AbortController().signal, generate).settle(); assert.equal(calls, 4);
   const failure = new AssetService(root, assets.slice(0,1), {}, new AbortController().signal, async () => { throw new Error('offline'); });
   const fallback = await failure.get('a0'); assert.equal(fallback.status, 'fallback'); assert.equal(fallback.fallback, asset.commission.fallback);
   await assert.rejects(failure.validate('<div data-asset-id="a0"></div>'), /替代/);
   await failure.validate('<div data-asset-id="a0" data-asset-status="fallback">designed replacement</div>');
   const cancelled = new AssetService(root, assets, {}, AbortSignal.abort(new Error('cancel')), generate);
   await assert.rejects(cancelled.settle(), /cancel/);
 } finally { await rm(root, { recursive: true, force: true }); }
});
test('review Markdown accepts only explicit existing component ownership and unique issues', () => {
 const design = parseDocument('designer', documentTemplate('designer')).data;
 assert.deepEqual(parseReview('无问题', design), []);
 assert.equal(parseReview('| 编号 | 归属 | 组件 | 问题 |\n| --- | --- | --- | --- |\n| R1 | builder | 整体 | 标题被遮挡 |', design)[0].owner, 'builder');
 assert.throws(() => parseReview('| 编号 | 归属 | 组件 | 问题 |\n| --- | --- | --- | --- |\n| R1 | orchestrator | 整体 | 主次错误 |', design), /归属/);
});

test('asset tools exclude binary payloads and server embedding survives local read/patch cycles', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'info-asset-embedding-'));
 const { authoredHtml, patchHtml } = await import('../apps/server/src/builder-html.js');
 const asset = parseDocument('designer', documentTemplate('designer')).data.assets[0] as Design['assets'][number];
 asset.id = 'A-001';
 const binary = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'), Buffer.alloc(1_500_000)]).toString('base64');
 asset.implementation = 'generated_image'; asset.width = 1; asset.height = 1; asset.commission.transparent = 'optional';
 const service = new AssetService(root, [asset], {}, new AbortController().signal, async () => ({ data: binary, mimeType: 'image/png' }));
 try {
  const metadata = await service.describe(asset.id);
  assert.equal(metadata.status, 'ready');
  assert.ok(JSON.stringify(metadata).length < 3000);
  assert.ok(!('data_url' in metadata));
  const html = '<html><head><title>Art</title></head><body><h1>Original</h1><img data-asset-id="A-001" alt="Theme scene"></body></html>';
  const packaged = await service.materialize(html);
  await service.validate(packaged);
  assert.ok(packaged.includes(binary));
  const source = authoredHtml(packaged);
  assert.ok(source.length < 500);
  assert.ok(source.includes('data-asset-id="A-001"'));
  const repaired = await service.materialize(patchHtml(source, [{ old_text: 'Original', new_text: 'Repaired' }]));
  await service.validate(repaired);
  assert.ok(repaired.includes('Repaired'));
  assert.ok(repaired.includes(binary));
  await assert.rejects(service.validate(await service.materialize('<div>Missing image</div>')), /缺少素材/);
  const { readFile } = await import('node:fs/promises');
  const pi = await readFile(new URL('../apps/server/src/pi.ts', import.meta.url), 'utf8');
  assert.match(pi, /async \(\{ asset_id \}\) => assets.describe\(asset_id\)/);
 } finally { await rm(root, { recursive: true, force: true }); }
});
