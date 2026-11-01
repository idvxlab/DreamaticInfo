import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRender } from '../apps/server/src/render-check.js';

test('real Chromium checks responsive and print media and reports runtime failure and broken images', async () => {
  const report = await checkRender('<!doctype html><html><head><style>body{margin:0} main{width:100%}</style></head><body><main data-component-id="main"><h1>Evidence stays readable</h1><img src="data:image/png;base64,invalid"><script>throw new Error("diagnostic-test")</script></main></body></html>', 1000);
  assert.equal(report.reports.length, 3);
  assert.deepEqual(report.reports.map(item => item.media), ['desktop', 'mobile', 'print']);
  assert.ok(report.reports.every(item => item.broken_images === 1));
  assert.ok(report.errors.some(error => error.includes('diagnostic-test')));
});
test('render checks honor cancellation before launch', async () => {
  await assert.rejects(checkRender('', 1000, AbortSignal.abort(new Error('cancelled'))), /cancelled/);
});
