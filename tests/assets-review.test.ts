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
 const assets = [0,1,2].map(i => ({ ...asset, id: `a${i}` }));
 let active = 0, peak = 0, calls = 0;
 const generate = async () => { calls++; active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 10)); active--; return { data: 'dGVzdA==', mimeType: 'image/png' }; };
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
