/** One deadline per scope, shared by every retry and tool in that scope. */
export class ExecutionBudget {
  readonly deadline: number;
  private counts = new Map<string, number>();
  consume(kind: 'model' | 'tool' | 'asset' | 'retry' | 'repair') {
    this.signal.throwIfAborted();
    const limits = { model: 120, tool: 400, asset: 16, retry: 10, repair: 2 };
    const count = (this.counts.get(kind) ?? 0) + 1;
    if (count > limits[kind]) { const error = new Error(`运行 ${kind} 次数预算已耗尽`); this.controller.abort(error); throw error; }
    this.counts.set(kind, count);
  }
  private timer: ReturnType<typeof setTimeout>;
  private controller = new AbortController();
  readonly signal: AbortSignal;
  constructor(parent: AbortSignal, milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Invalid execution budget');
    this.deadline = Date.now() + milliseconds;
    this.signal = AbortSignal.any([parent, this.controller.signal]);
    this.timer = setTimeout(() => this.controller.abort(new Error('执行总预算已耗尽')), milliseconds);
    this.timer.unref();
  }
  remaining() { this.signal.throwIfAborted(); return Math.max(0, this.deadline - Date.now()); }
  close() { clearTimeout(this.timer); }
}
