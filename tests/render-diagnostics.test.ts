import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDiagnostics, requireUsableDelivery, type RenderReport } from '../apps/server/src/delivery-quality.js';

test('Builder receives actionable diagnostics without screenshot payloads', async () => {
  const report: RenderReport = {
    screenshots: [{ media: 'mobile', data: 'large-binary-payload'.repeat(100000) }],
    errors: ['script failed'],
    reports: [{ media: 'mobile', horizontal_overflow: true, broken_images: 0, clipped_text: ['C-06'], overlapping_components: [], occluded_text: [], outside_viewport: ['C-06'] }],
    limitations: ['Geometry is diagnostic.'],
  };
  const diagnostics = renderDiagnostics(report);
  assert.deepEqual(diagnostics, { errors: report.errors, reports: report.reports, limitations: report.limitations });
  assert.ok(JSON.stringify(diagnostics).length < 1000);
  assert.equal(report.screenshots.length, 1);
  assert.throws(() => requireUsableDelivery(report), /C-06/);
  const source = await readFile(new URL('../apps/server/src/pi.ts', import.meta.url), 'utf8');
  assert.match(source, /return renderDiagnostics\(await inspectDelivery\(savedHtml,/);
});
