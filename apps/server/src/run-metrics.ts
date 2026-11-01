import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

/** Append-only observations: no prompts, credentials, source text or model output. */
export class RunMetrics {
  private queue = Promise.resolve();
  constructor(private root: string, readonly run = crypto.randomUUID()) {}
  record(kind: string, fields: Record<string, unknown> = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), run: this.run, kind, ...fields }) + '\n';
    this.queue = this.queue.then(async () => {
      await mkdir(path.join(this.root, 'state'), { recursive: true });
      await appendFile(path.join(this.root, 'state/performance.jsonl'), line);
    });
    // Observe failures immediately; flush still propagates them to the caller.
    void this.queue.catch(() => {});
  }
  span(kind: string, fields: Record<string, unknown> = {}) {
    const started = performance.now();
    return (status = 'ok') => this.record(kind, { ...fields, status, duration_ms: performance.now() - started });
  }
  flush() { return this.queue; }
}
