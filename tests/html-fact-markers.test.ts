import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHtml } from '../apps/server/src/validation.js';
import { documentTemplate, parseDocument } from '../apps/server/src/markdown-protocol.js';
import type { Design, DataFacts } from '../packages/shared/types.js';

test('multi-fact chart markers match complete whitespace-separated IDs without executing scripts', () => {
 const design: Design = parseDocument('designer', documentTemplate('designer')).data;
 design.assets = [];
 design.components = [{ ...design.components[0], id: 'C-003', asset_ids: [], fact_ids: ['F-001', 'F-002'] }];
 const facts = { facts: [{ id: 'F-001' }, { id: 'F-002' }, { id: 'unselected' }] } as DataFacts;
 const html = (marker: string) => `<!doctype html><html><head><title>Marker test</title></head><body><section data-component-id="C-003" data-fact-id="${marker}"><h1>Two facts in one chart</h1><p>${'Fixture content. '.repeat(20)}</p></section></body></html>`;
 assert.doesNotThrow(() => validateHtml(html('F-001 F-002'), design, facts));
 assert.doesNotThrow(() => validateHtml(html(' F-001\tF-002\n'), design, facts));
 assert.doesNotThrow(() => validateHtml(html('F-001 F-002 F-002'), design, facts));
 assert.doesNotThrow(() => validateHtml(html('F-001').replace('</section>', '<span data-fact-id="F-002">Forecast</span></section>'), design, facts));
 for (const marker of ['F-001', 'F-001 F-0020', 'F-001 F-002-extra', 'F-001,F-002'])
  assert.throws(() => validateHtml(html(marker), design, facts), /Missing fact/);
 assert.throws(() => validateHtml(html('F-001').replace('</body>', '<script>const id="F-002";</script></body>'), design, facts), /Missing fact F-002/);
});
