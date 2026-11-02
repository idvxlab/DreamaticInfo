import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectSvg, saveSvg, readSvg } from '../apps/server/src/visual-resource.js';
import { AssetService } from '../apps/server/src/asset-service.js';
import { documentTemplate, parseDocument } from '../apps/server/src/markdown-protocol.js';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><path d="M0 0L200 100"/></svg>';
test('SVG versions retain old content and isolate project reads; unsafe resources are rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'svg-contract-'));
  try {
    const first = await saveSvg(root, 'A1', svg, { direction: 'first' });
    const next = await saveSvg(root, 'A1', svg.replace('L200', 'L100'), { direction: 'next' });
    assert.notEqual(first.version, next.version);
    assert.equal(await readSvg(root, first.path), svg);
    await assert.rejects(readSvg(root, '../original.svg'));
    for (const injected of ['<script/>', '<foreignObject/>', '<image href="https://example.com/a"/>', '<path onclick="alert(1)"/>', '<path fill="url(https://example.com/a)"/>']) assert.throws(() => inspectSvg(svg.replace('<path d="M0 0L200 100"/>', injected)));
    assert.throws(() => inspectSvg(svg.replace('viewBox="0 0 200 100"', 'viewBox="0 0 0 0"')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CSS and SVG never enter the image queue, including settle and cancellation paths', async () => {
  const asset = parseDocument('designer', documentTemplate('designer')).data.assets[0];
  let calls = 0;
  const service = new AssetService('/unused', [{ ...asset, implementation: 'css' }, { ...asset, id: 'vector', implementation: 'svg' }], {}, new AbortController().signal, async () => { calls++; throw new Error('must not execute'); });
  service.start(); assert.deepEqual(await service.settle(), []); assert.equal(calls, 0);
  await assert.rejects(service.get('vector'), /svg/);
});

test('registered SVG is embedded by server at the intended anchor and contract changes reject stale versions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'svg-embedding-'));
  try {
    const asset = parseDocument('designer', documentTemplate('designer')).data.assets[0];
    asset.id='vector';asset.implementation='svg';
    const composition={background:'paper'};
    const saved=await saveSvg(root,'vector',svg,{asset,composition});
    const service=new AssetService(root,[asset],{direction:composition},new AbortController().signal,async()=>{throw new Error('No image generation');});
    const html=await service.materialize('<html><head><title>Vector</title></head><body style="background:#eee"><div data-component-id="hero" aria-label="Source vector" data-asset-id="vector" style="width:200px;height:100px"></div></body></html>');
    assert.ok(html.includes(saved.version));assert.ok(html.includes('data-component-id="hero"'));assert.ok(html.includes('aria-label="Source vector"'));assert.ok(html.includes('viewBox="0 0 200 100"'));await service.validate(html);
    const changed=new AssetService(root,[{...asset,style:'changed'}],{direction:composition},new AbortController().signal,async()=>{throw new Error('No image');});
    await assert.rejects(changed.validate(html),/contract changed/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
