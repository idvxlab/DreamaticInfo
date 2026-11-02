/** One deadline per scope, shared by every retry and tool in that scope. */
export class ExecutionBudget {
  readonly deadline: number;
  private counts = new Map<string, number>();
  private reportedCost = 0;
  private runModel = 0;
  private extraModel = 0;
  charge(amount: unknown, limit: number) { if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) { this.reportedCost += amount; if (this.reportedCost > limit) this.controller.abort(new Error("已报告模型估算费用预算已耗尽")); } }
  restore(counts: Record<string, number>) { for (const [kind, count] of Object.entries(counts)) if (kind === "reported_cost_usd" && Number.isFinite(count) && count >= 0) this.reportedCost = count; else if (kind === "model_extra_limit" && Number.isSafeInteger(count) && count >= 0) this.extraModel = count; else if (["model", "tool", "asset", "retry", "repair"].includes(kind) && Number.isInteger(count) && count >= 0) this.counts.set(kind, count); }
  snapshot(): Record<string, number> { return { ...Object.fromEntries(this.counts), reported_cost_usd: this.reportedCost, run_model: this.runModel, model_run_limit: this.modelLimits.run, model_task_limit: this.modelLimits.task + this.extraModel, model_extra_limit: this.extraModel }; }
  consume(kind: 'model' | 'tool' | 'asset' | 'retry' | 'repair') {
    this.signal.throwIfAborted();
    if (kind === 'model') {
      const used = this.counts.get('model') ?? 0, total = this.modelLimits.task + this.extraModel;
      const message = used >= total ? `任务累计模型调用预算已耗尽（${used}/${total} 次）；可明确追加额度，已有成果和历史用量保留` : this.runModel >= this.modelLimits.run ? `本次运行模型调用预算已耗尽（${this.runModel}/${this.modelLimits.run} 次）；继续可建立新的单次运行预算，任务累计用量保留` : undefined;
      if (message) { const error = new Error(message); this.controller.abort(error); throw error; }
      this.runModel++;
      this.counts.set('model', used + 1);
      return;
    }
    const limits = { model: this.modelLimits.task + this.extraModel, tool: 400, asset: 16, retry: 10, repair: 2 };
    const count = (this.counts.get(kind) ?? 0) + 1;
    if (count > limits[kind]) { const error = new Error(`运行 ${kind} 次数预算已耗尽`); this.controller.abort(error); throw error; }
    this.counts.set(kind, count);
  }
  private timer: ReturnType<typeof setTimeout>;
  private controller = new AbortController();
  readonly signal: AbortSignal;
  constructor(parent: AbortSignal, milliseconds: number, scope = "运行", private modelLimits = { run: 120, task: 120 }) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Invalid execution budget');
    if (![modelLimits.run, modelLimits.task].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid model count budget');
    this.deadline = Date.now() + milliseconds;
    this.signal = AbortSignal.any([parent, this.controller.signal]);
    this.timer = setTimeout(() => this.controller.abort(new Error(`${scope}超时（预算 ${milliseconds / 60_000} 分钟），已有成果已保留`)), milliseconds);
    this.timer.unref();
  }
  remaining() { this.signal.throwIfAborted(); return Math.max(0, this.deadline - Date.now()); }
  close() { clearTimeout(this.timer); }
}
