import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Research, Source } from '../packages/shared/types.js';
const root = await mkdtemp(path.join(os.tmpdir(), 'info-analyst-latency-'));
process.env.INFO_CONFIG_DIR = root;
const store = await import('../apps/server/src/store.js');
const { AnalystWorkbench } = await import('../apps/server/src/analyst-workbench.js');
const { loadEvidenceSource } = await import('../apps/server/src/evidence-view.js');
const { computedNarrativeTemplate } = await import('../apps/server/src/markdown-protocol.js');
const { ModelActivityRecorder, readModelActivity } = await import('../apps/server/src/model-activity.js');
const { RunMetrics, performanceSummary } = await import('../apps/server/src/run-metrics.js');
const source: Source = { id: 'dataset', title: 'Fixture series', path: 'research/series.md', kind: 'web', url: 'https://example.org/data', published_at: null, accessed_at: '2026-11-02', fields: [], limitations: ['Fixture only'] };
const research: Research = { summary: 'Fixture', sources: [source], datasets: [], limitations: [] };
const text = '| year | value |\n| --- | --- |\n' + Array.from({ length: 400 }, (_, i) => `| ${1600 + i} | ${i + 1} |`).join('\n');
function narrative(id: string, calculation: string) {
  return computedNarrativeTemplate().replace('| 编号 | 填写实际内容 |', `| 编号 | ${id} |`).replace('| 类型 | value |', '| 类型 | trend |').replace('| 计算记录编号 | 填写实际内容 |', `| 计算记录编号 | ${calculation} |`).replace(/#### 关联[\s\S]*$/, '#### 关联\n\n无\n').replaceAll('填写实际内容', 'Fixture narrative');
}
try {
  await test('compact receipts preserve all observations and server-filled Markdown survives resume and exact recomputation', async () => {
    const p = await store.create('Latency fixture', 'live');
    await writeFile(path.join(store.projectDir(p.id), source.path), text);
    const view = await loadEvidenceSource(p, source), block = view.blocks.find(b => b.text.includes('1600'))!;
    const work = await AnalystWorkbench.open(p, research);
    const output = await work.calculate({ source_id: source.id, block_id: block.id, operation: 'trend', label_column: 0, value_column: 1, unit: 'people' });
    const id = /calc-[a-f0-9]{64}/.exec(output)![0];
    assert.ok(output.length < 1500); assert.doesNotMatch(output, /\| 1600 \|/);
    const receipt = JSON.parse(await readFile(path.join(store.projectDir(p.id), `state/calculations/${id}.json`), 'utf8'));
    assert.equal(receipt.result.series.length, 400);
    const page = JSON.parse(await work.readCalculation(id, 398, 2));
    assert.equal(page.series_count, 400); assert.equal(page.result.series.length, 2); assert.equal(page.result.series[1].value, 400);
    const report = await work.saveComputedFacts(narrative('F1', id));
    const revision = /草稿版本：([a-f0-9-]{36})/.exec(report)![1];
    const resumed = await AnalystWorkbench.open(p, research);
    assert.match(await resumed.calculationCatalog(), new RegExp(id));
    assert.equal((await resumed.progress()).counts.saved, 1);
    const submitted = await resumed.submit(undefined, revision), fact = submitted.data.facts[0];
    assert.equal(fact.series.length, 400); assert.equal(fact.value, receipt.result.value); assert.equal(fact.unit, receipt.unit); assert.equal(fact.specification.series_unit, 'people');
    assert.equal(fact.evidence[0].quote, block.text); assert.equal(fact.specification.calculation_id, id);
    const before = await resumed.progressKey();
    await assert.rejects(resumed.saveComputedFacts(narrative('F1', id), revision), /F1.*已存在/);
    assert.deepEqual(await resumed.progressKey(), before);
    await assert.rejects(resumed.saveComputedFacts(narrative('F2', id), 'wrong-revision'), /版本/);
    await assert.rejects(resumed.saveComputedFacts(narrative('F2', id), revision, 'F1'), /相同/);
    await assert.rejects(resumed.saveComputedFacts(narrative('missing', id), revision, 'missing'), /已有 computed/);
    const repairedReport = await resumed.saveComputedFacts(narrative('F1', id).replaceAll('Fixture narrative', 'Repaired interpretation'), revision, 'F1');
    const repairedRevision = /草稿版本：([a-f0-9-]{36})/.exec(repairedReport)![1];
    const repaired = await resumed.submit(undefined, repairedRevision);
    assert.equal(repaired.data.facts.length, 1);
    assert.equal(repaired.data.facts[0].title, 'Repaired interpretation');
    assert.deepEqual(repaired.data.facts[0].series, fact.series);
    assert.deepEqual(repaired.data.facts[0].evidence, fact.evidence);
    assert.equal(repaired.data.summary, submitted.data.summary);
    await assert.rejects(resumed.saveComputedFacts(narrative('F1', id), repairedRevision), /F1.*已存在.*本批未保存/);

    const afterRepair = await resumed.progressKey();
    const tampered = { ...receipt, unit: 'forged' };
    await writeFile(path.join(store.projectDir(p.id), `state/calculations/${id}.json`), JSON.stringify(tampered));
    await assert.rejects(resumed.saveComputedFacts(narrative('F2', id), repairedRevision), /计算记录已变化/);
    assert.deepEqual(await resumed.progressKey(), afterRepair);
  });
  await test('narrative batches reject injected numeric fields and oversized batches before replacing any draft', async () => {
    const p = await store.create('Batch fixture', 'live'); await writeFile(path.join(store.projectDir(p.id), source.path), text);
    const work = await AnalystWorkbench.open(p, research);
    await assert.rejects(work.saveComputedFacts(narrative('F1', 'calc-' + 'a'.repeat(64)).replace('| 类型 | trend |', '| 类型 | trend |\n| 数值 | 999 |')), /未知/);
    const one = narrative('F1', 'calc-' + 'a'.repeat(64));
    const item = one.slice(one.indexOf('### 条目'));
    await assert.rejects(work.saveComputedFacts(one + item.repeat(3)), /1–3/);
    assert.equal(await work.progressKey(), undefined);
  });
  await test('activity metadata hides past attempts and metrics record first saved fact without output content', async () => {
    const p = await store.create('Activity fixture', 'live'); p.state.status = 'running'; p.state.stages.analyst.status = 'running'; p.state.stages.analyst.attempts = 1;
    const recorder = new ModelActivityRecorder(store.projectDir(p.id), p, 'analyst');
    recorder.update({ phase: 'tool_arguments', output_characters: 120 }, true); await recorder.flush();
    assert.equal((await readModelActivity(store.projectDir(p.id), p))?.phase, 'tool_arguments');
    p.state.stages.analyst.attempts++;
    assert.equal(await readModelActivity(store.projectDir(p.id), p), undefined);
    const metrics = new RunMetrics(store.projectDir(p.id));
    metrics.record('run_start', { effective_request_at: new Date(Date.now() - 1000).toISOString() });
    metrics.record('analysis_fact_saved', { saved: 1 });
    metrics.record('model_call', { duration_ms: 320, context_characters: 500, output_characters: 100 }); await metrics.flush();
    const summary = (await performanceSummary(store.projectDir(p.id)))!;
    assert.ok(summary.first_fact_ms! >= 1000); assert.equal(summary.max_model_call_ms, 320); assert.equal(summary.max_context_characters, 500);
  });
} finally { await rm(root, { recursive: true, force: true }); }
