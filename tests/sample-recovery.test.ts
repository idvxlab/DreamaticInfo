import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await mkdtemp(path.join(os.tmpdir(), 'info-sample-mobile-'));
process.env.INFO_CONFIG_DIR = root;
const { HtmlWorkbench } = await import('../apps/server/src/html-workbench.js');
const { HtmlValidationError } = await import('../apps/server/src/validation.js');
const { persistSample, validateSample } = await import('../apps/server/src/visual-sample.js');
const { documentTemplate, parseDocument } = await import('../apps/server/src/markdown-protocol.js');
try {
  await test('real mobile overflow leaves sample repair input; a local CSS fix survives restart and passes browser checks', { timeout: 30000 }, async () => {
    const design = parseDocument('designer', documentTemplate('designer')).data;
    const component = design.components[0];
    design.components = [{ ...component, id: 'hero', type: 'heading', fact_ids: [] }, { ...component, id: 'real', type: 'metric', fact_ids: ['F-real'] }];
    const html = '<!doctype html><html><head><title>Sample fixture</title><style>main{width:1800px}body{font:16px sans-serif}</style></head><body><main><h1 data-component-id="hero">Sample heading</h1><p data-component-id="real" data-fact-id="F-real">A documented fixture value: 42 people. This local fixture verifies layout recovery only.</p></main></body></html>';
    const signal = AbortSignal.timeout(25000);
    const validate = async (page: string) => {
      validateSample(page, design, ['hero', 'real']);
      try { await persistSample(root, 'browser-scope', page, 1024, signal, 1); }
      catch (error) { throw new HtmlValidationError([String(error instanceof Error ? error.message : error)]); }
      return page;
    };
    const failed = await new HtmlWorkbench(root, 'sample', 'sample').stage(html, undefined, validate, undefined, { completed_components: ['hero', 'real'] });
    assert.equal(failed.accepted, undefined);
    assert.ok(failed.issues.some(issue => /mobile.*水平溢出/.test(issue)), failed.report);
    const resumed = new HtmlWorkbench(root, 'sample', 'sample');
    const fixed = await resumed.stage(undefined, [{ old_text: 'width:1800px', new_text: 'width:100%' }], validate);
    assert.ok(fixed.accepted); assert.deepEqual(fixed.issues, []);
  });
} finally { await rm(root, { recursive: true, force: true }); }
