import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authoredHtml, patchHtml } from '../apps/server/src/builder-html.js';
import { embedVisualizationRuntime } from '../apps/server/src/visualization-runtime.js';

test('local repair excludes packaged D3 and can restore the offline runtime', async () => {
  const html = '<!doctype html><html><head><title>Fixture</title></head><body><h1>Original</h1><p>' + 'Fixture content. '.repeat(100) + '</p><script>document.title="authored"</script></body></html>';
  const packaged = await embedVisualizationRuntime(html);
  const source = authoredHtml(packaged);
  assert.ok(source.length < 3000);
  assert.ok(!source.includes('data-dreamatic-runtime'));
  assert.ok(source.includes('document.title'));
  const patched = patchHtml(source, [{ old_text: '<h1>Original</h1>', new_text: '<h1>Repaired $&</h1>' }]);
  assert.ok(patched.includes('<h1>Repaired $&</h1>'));
  const restored = await embedVisualizationRuntime(patched);
  assert.ok(restored.includes('data-dreamatic-runtime="d3"'));
});

test('ambiguous or absent replacements fail without changing the base', () => {
  const base = '<p>same</p><p>same</p>';
  for (const old_text of ['', 'missing', 'same'])
    assert.throws(() => patchHtml(base, [{ old_text, new_text: 'replacement' }]), /exactly once/);
  assert.throws(() => patchHtml(base, []), /at least one/);
  assert.throws(() => patchHtml(base, [{ old_text: base, new_text: 'new' }, { old_text: 'missing', new_text: 'bad' }]), /exactly once/);
  assert.equal(base, '<p>same</p><p>same</p>');
});
