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
