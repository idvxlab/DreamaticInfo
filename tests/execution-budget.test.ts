import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ExecutionBudget } from '../apps/server/src/execution-budget.js';
import { requireUsableDelivery } from '../apps/server/src/delivery-quality.js';

test('a shared scope expires across retries and parent cancellation remains authoritative', async () => {
  const parent = new AbortController();
  const budget = new ExecutionBudget(parent.signal, 30);
  try {
    const initial = budget.remaining();
    await delay(15);
    assert.ok(budget.remaining() < initial);
    await delay(25);
    assert.throws(() => budget.remaining(), /预算/);
  } finally { budget.close(); }
  const cancelled = new ExecutionBudget(AbortSignal.abort(new Error('user stop')), 1000);
  try { assert.throws(() => cancelled.remaining(), /user stop/); }
  finally { cancelled.close(); }
});

test('delivery gates reject basic failures while advisory geometry does not become aesthetic judgement', () => {
  const report = { screenshots: [], errors: [], reports: [{ media: 'desktop' as const, horizontal_overflow: false, broken_images: 0, clipped_text: [], overlapping_components: [], occluded_text: [], outside_viewport: ['intentional decoration'] }], limitations: [] };
  assert.doesNotThrow(() => requireUsableDelivery(report));
  assert.throws(() => requireUsableDelivery({ ...report, errors: ['runtime failure'] }), /runtime failure/);
  assert.throws(() => requireUsableDelivery({ ...report, reports: [{ ...report.reports[0], horizontal_overflow: true }] }), /溢出/);
  assert.throws(() => requireUsableDelivery({ ...report, reports: [{ ...report.reports[0], broken_images: 1 }] }), /图片损坏/);
});

test('stage expiry names the stage while the run budget remains available', async () => {
 const run = new ExecutionBudget(new AbortController().signal, 1000);
 const stage = new ExecutionBudget(run.signal, 10, 'designer 阶段');
 try {
  await delay(25);
  assert.throws(() => stage.remaining(), /designer 阶段超时/);
  assert.ok(run.remaining() > 0);
 } finally { stage.close(); run.close(); }
});

test('persisted operation counts and reported costs survive resume without resetting limits', () => {
  const first=new ExecutionBudget(new AbortController().signal,10000);
  first.consume('repair');first.charge(0.4,1);
  const snapshot=first.snapshot();first.close();
  const resumed=new ExecutionBudget(new AbortController().signal,10000);resumed.restore(snapshot);
  try { assert.equal(resumed.snapshot().repair,1);assert.equal(resumed.snapshot().reported_cost_usd,0.4);resumed.consume('repair');assert.throws(()=>resumed.consume('repair'),/预算/); }
  finally {resumed.close();}
  const costly=new ExecutionBudget(new AbortController().signal,10000);costly.restore(snapshot);
  try {costly.charge(0.7,1);assert.throws(()=>costly.remaining(),/费用/);}finally{costly.close();}
});

test('model run counters reset on continuation while cumulative usage and extra credit remain binding', () => {
  const first = new ExecutionBudget(new AbortController().signal, 10000, 'run', { run: 2, task: 3 });
  first.consume('model'); first.consume('model');
  assert.throws(() => first.consume('model'), /本次运行.*2\/2/);
  const previous = first.snapshot(); first.close();
  const next = new ExecutionBudget(new AbortController().signal, 10000, 'run', { run: 2, task: 3 });
  try {
    next.restore(previous);
    assert.equal(next.snapshot().run_model, 0);
    assert.equal(next.snapshot().model, 2);
    next.consume('model');
    assert.throws(() => next.consume('model'), /任务累计.*3\/3/);
    assert.equal(next.snapshot().model, 3);
  } finally { next.close(); }
  const credited = new ExecutionBudget(new AbortController().signal, 10000, 'run', { run: 2, task: 3 });
  try {
    credited.restore({ ...previous, model: 3, model_extra_limit: 1, repair: 2 });
    credited.consume('model');
    assert.equal(credited.snapshot().model_task_limit, 4);
    assert.throws(() => credited.consume('repair'), /预算/);
    assert.equal(credited.snapshot().model, 4);
  } finally { credited.close(); }
});
