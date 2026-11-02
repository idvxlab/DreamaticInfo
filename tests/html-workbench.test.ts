import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HtmlWorkbench } from '../apps/server/src/html-workbench.js';
import { validateHtml, HtmlValidationError } from '../apps/server/src/validation.js';
import { documentTemplate, parseDocument } from '../apps/server/src/markdown-protocol.js';
import { cssResourceIssues } from '../apps/server/src/css-resources.js';

const page = (css: string, body = '') => `<!doctype html><html><head><title>Fixture</title><style>${css}</style></head><body><h1>Fixture repair</h1>${body}<p>${'Evidence content '.repeat(20)}</p></body></html>`;
test('CSS URLs retain quoting, SVG internals and comments while external resources stay blocked', () => {
  for (const url of ['data:image/png;base64,AA==', '#gradient', "data:image/svg+xml,%3Csvg%3E%3Crect fill='url(%23n)'/%3E%3C/svg%3E"])
    for (const q of ['"', "'", '']) {
      if (url.includes("'") && q !== '"') continue;
      const css = `a{background:url(${q}${url}${q})}`;
      assert.deepEqual(cssResourceIssues(css), [], css);
    }
  assert.deepEqual(cssResourceIssues('/* url(https://example.com/a) */ a{content:"url(https://example.com)"}'), []);
  for (const css of ['a{background:url("https://example.com/x")}', 'a{background:url(//example.com/x)}', 'a{background:url(local.png)}', 'a{--image:url(https://example.com/a);background:var(--image)}', '@import "data:text/css,a{}";', 'a{background:image-set("https://example.com/a" 1x)}']) assert.ok(cssResourceIssues(css).length, css);
  assert.ok(cssResourceIssues('background:url("https://example.com/a")', true).length);
});
test('rejected HTML persists across restart, aggregates coverage issues, repairs locally and isolates changed scopes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'info-html-repair-'));
  try {
    const design = parseDocument('designer', documentTemplate('designer')).data;
    design.assets = []; design.components = [{ ...design.components[0], id: 'C-010', fact_ids: ['F-017'] }];
    const validate = async (html: string) => { validateHtml(html, design, { summary: '', facts: [] }); return html; };
    const original = page('a{background:url("https://example.com/a")}');
    const work = new HtmlWorkbench(root, 'scope');
    const rejected = await work.stage(original, undefined, validate);
    assert.equal(rejected.accepted, undefined);
    assert.ok(rejected.issues.some(i => i.includes('Remote CSS')));
    assert.ok(rejected.issues.some(i => i.includes('Missing design component C-010')));
    assert.ok(rejected.issues.some(i => i.includes('Missing fact F-017')));
    const resumed = new HtmlWorkbench(root, 'scope');
    assert.ok((await resumed.read()).includes(original));
    const partial = await resumed.stage(undefined, [{ old_text: 'https://example.com/a', new_text: 'data:image/png;base64,AA==' }], validate);
    assert.equal(partial.accepted, undefined); assert.equal(partial.progress, true);
    const repeated = await resumed.stage(original, undefined, validate);
    assert.equal(repeated.progress, false);
    const repaired = await resumed.stage(undefined, [{ old_text: 'https://example.com/a', new_text: 'data:image/png;base64,AA==' }, { old_text: '<h1>', new_text: '<section data-component-id="C-010" data-fact-id="F-017">Complete</section><h1>' }], validate);
    assert.ok(repaired.accepted); assert.deepEqual(repaired.issues, []);
    const before = await resumed.read();
    await assert.rejects(resumed.stage(undefined, [{ old_text: 'absent', new_text: 'x' }], validate), /exactly once/);
    assert.equal(await resumed.read(), before);
    const other = new HtmlWorkbench(root, 'changed-scope');
    await assert.rejects(other.stage(undefined, [{ old_text: '<h1>', new_text: '<h2>' }], validate, async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }), /没有可修改/);
    assert.ok(!((await other.read()).includes(original)));
    assert.throws(() => validateHtml(original, design, { summary: '', facts: [] }), HtmlValidationError);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('sample HTML and completed metadata persist before interrupted review and can be repaired after restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'info-sample-repair-'));
  try {
    const work = new HtmlWorkbench(root, 'sample-scope', 'sample');
    const html = page('a{width:1800px}', '<section data-unimplemented="C-rest">Unfinished</section>');
    await assert.rejects(work.stage(html, undefined, async () => { throw new Error('review aborted'); }, undefined, { completed_components: ['C-hero', 'C-real'] }), /aborted/);
    const resumed = new HtmlWorkbench(root, 'sample-scope', 'sample');
    assert.ok((await resumed.read()).includes('width:1800px'));
    assert.deepEqual((await resumed.snapshot())!.context?.completed_components, ['C-hero', 'C-real']);
    const fixed = await resumed.stage(undefined, [{ old_text: 'width:1800px', new_text: 'max-width:100%' }], async h => h);
    assert.ok(fixed.accepted); assert.ok(fixed.report.includes('patch_visual_sample'));
    assert.ok(!fixed.report.includes('Missing design component'));
    assert.equal(await new HtmlWorkbench(root, 'delivery-scope').snapshot(), undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
