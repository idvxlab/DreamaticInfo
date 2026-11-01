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

export interface PerformanceSummary {
  wall_ms: number; first_preview_ms?: number; delivery_ms?: number;
  model_calls: number; repairs: number; stage_attempts: number;
  durations_ms: Record<string, number>; waiting_ms: Record<string, number>;
}
/** Categories may overlap. Durations must never be added to infer wall time. */
export async function performanceSummary(root: string): Promise<PerformanceSummary | undefined> {
  const { readFile, stat } = await import('node:fs/promises');
  const file = path.join(root, 'state/performance.jsonl');
  let content: string;
  try { const metadata = await stat(file); if (metadata.size > 20_000_000) return undefined; content = await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  const events = content.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const first = events.find(e => e.kind === 'run_start' && e.effective_request_at);
  if (!first) return undefined;
  const start = Date.parse(first.effective_request_at);
  const result: PerformanceSummary = { wall_ms: Math.max(0, Date.now() - start), model_calls: 0, repairs: 0, stage_attempts: 0, durations_ms: {}, waiting_ms: {} };
  let waiting: { kind: string; at: number } | undefined;
  for (const event of events) {
    const at = Date.parse(event.at);
    if (event.kind === 'run_start' && waiting) { result.waiting_ms[waiting.kind] = (result.waiting_ms[waiting.kind] ?? 0) + Math.max(0, at - waiting.at); waiting = undefined; }
    if (['waiting_for_information', 'interrupted', 'failed'].includes(event.kind)) waiting = { kind: event.kind, at };
    if (event.kind === 'model_call') result.model_calls++;
    if (event.kind === 'repair') result.repairs++;
    if (event.kind === 'stage_attempt') result.stage_attempts++;
    if (typeof event.duration_ms === 'number') {
      const key = event.kind === 'tool' ? `tool:${event.name}` : event.kind === 'stage_attempt' ? `stage:${event.role}` : event.kind;
      result.durations_ms[key] = (result.durations_ms[key] ?? 0) + event.duration_ms;
    }
    if (event.kind === 'first_preview' && result.first_preview_ms === undefined) result.first_preview_ms = event.wall_ms;
    if (event.kind === 'delivery') { result.delivery_ms = event.wall_ms; result.wall_ms = event.wall_ms; }
  }
  if (waiting) result.waiting_ms[waiting.kind] = (result.waiting_ms[waiting.kind] ?? 0) + Math.max(0, Date.now() - waiting.at);
  return result;
}
