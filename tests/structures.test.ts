import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { documentTemplate, parseDocument, renderDocument } from '../apps/server/src/markdown-protocol.js';
import { eventTime, structureIssues } from '../packages/shared/structure.js';
import StructureChart from '../apps/web/src/StructureChart.js';
import type { Fact, StructuralData } from '../packages/shared/types.js';
const evidence = [{ source_id: 'S1', quote: 'test evidence', location: 'E-test' }];
const recordEvidence = evidence[0];
const blank = (): StructuralData => ({ events: [], nodes: [], edges: [], observations: [], x_variable: '', x_unit: '', y_variable: '', y_unit: '' });
function fact(type: Fact['type'], structure: StructuralData): Fact {
  const f = parseDocument('analyst', documentTemplate('analyst')).data.facts[0];
  delete f.structure;
  return { ...f, id: 'F1', type, evidence, source_ids: ['S1'], series: [], derivation: 'quoted', structure };
}
test('timeline/process/hierarchy/scatter roundtrip Markdown, preserve record evidence and render in workbench', () => {
  const events = { ...blank(), events: [{ id: 'e1', date: '2020', label: 'first', ...recordEvidence }, { id: 'e2', date: '2024-02-29', label: 'second', ...recordEvidence }] };
  const graph = { ...blank(), nodes: [{ id: 'n1', label: 'start', ...recordEvidence }, { id: 'n2', label: 'end', ...recordEvidence }], edges: [{ from: 'n1', to: 'n2', label: 'precedes', ...recordEvidence }] };
  const scatter = { ...blank(), observations: [{ id: 'o1', x: 1, y: 2, ...recordEvidence }, { id: 'o2', x: 4, y: 8, ...recordEvidence }], x_variable: 'length', x_unit: 'm', y_variable: 'mass', y_unit: 'kg' };
  for (const f of [fact('timeline', events), fact('process', graph), fact('hierarchy', graph), fact('scatter', scatter)]) {
    assert.deepEqual(structureIssues(f), []);
    const data = { summary: 'structure test', facts: [f] };
    assert.deepEqual(parseDocument('analyst', renderDocument('analyst', data)).data, data);
    const html = renderToStaticMarkup(createElement(StructureChart, { fact: f }));
    assert.match(html, /<svg/); assert.match(html, /test evidence/);
  }
});
test('bad dates, hierarchy cycles, unknown edges, missing units and unpaired values are rejected', () => {
  assert.ok(Number.isNaN(eventTime('2023-02-29'))); assert.ok(Number.isNaN(eventTime('2024-13')));
  assert.ok(structureIssues(fact('timeline', { ...blank(), events: [{ id: 'e', date: 'bad', label: 'x', ...recordEvidence }] })).length);
  assert.ok(structureIssues(fact('hierarchy', { ...blank(), nodes: [{ id: 'a', label: 'a', ...recordEvidence }, { id: 'b', label: 'b', ...recordEvidence }], edges: [{ from: 'a', to: 'b', label: 'contains', ...recordEvidence }, { from: 'b', to: 'a', label: 'contains', ...recordEvidence }] })).some(x => x.includes('循环')));
  assert.ok(structureIssues(fact('process', { ...blank(), nodes: [{ id: 'a', label: 'a', ...recordEvidence }], edges: [{ from: 'a', to: 'missing', label: 'next', ...recordEvidence }] })).length);
  assert.ok(structureIssues(fact('scatter', { ...blank(), observations: [{ id: 'a', x: 1, y: NaN, ...recordEvidence }] })).length);
});
