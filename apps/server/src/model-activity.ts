import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomic } from './store.js';
import type { Project, ModelActivity } from '../../../packages/shared/types.js';

/** Persist metadata only; streamed text, arguments and reasoning never enter this file. */
export class ModelActivityRecorder {
  private queue = Promise.resolve();
  private lastWrite = 0;
  private state: ModelActivity;
  constructor(private root: string, p: Project, role: ModelActivity['role']) {
    this.state = { role, attempt: p.state.stages[role].attempts, phase: 'waiting', started_at: new Date().toISOString(), output_characters: 0, input_characters: 0 };
  }
  update(change: Partial<ModelActivity>, force = false) {
    this.state = { ...this.state, ...change };
    if (!force && Date.now() - this.lastWrite < 1000) return;
    this.lastWrite = Date.now();
    const body = JSON.stringify(this.state);
    this.queue = this.queue.then(() => atomic(path.join(this.root, 'state/model-activity.json'), body));
    void this.queue.catch(() => {});
  }
  flush() { return this.queue; }
}
export async function readModelActivity(root: string, p: Project): Promise<ModelActivity | undefined> {
  if (p.state.status !== 'running') return undefined;
  try {
    const activity = JSON.parse(await readFile(path.join(root, 'state/model-activity.json'), 'utf8')) as ModelActivity;
    const stage = p.state.stages[activity.role];
    return stage?.status === 'running' && stage.attempts === activity.attempt ? activity : undefined;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
