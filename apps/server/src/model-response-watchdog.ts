export class ModelResponseTimeout extends Error {
  constructor(message: string, readonly kind: "idle" | "call" | "progress", readonly milliseconds: number) { super(message); }
}
/** Idle and absolute call clocks exclude tools; durable progress spans the Analyst session. */
export class ModelResponseWatchdog {
  private timeout?: ReturnType<typeof setTimeout>;
  private absolute?: ReturnType<typeof setTimeout>;
  private progress?: ReturnType<typeof setTimeout>;
  private progressKey?: string;
  private notice?: ReturnType<typeof setTimeout>;
  private reject!: (error: Error) => void;
  private failure = new Promise<never>((_resolve, reject) => { this.reject = reject; });
  constructor(private milliseconds: number, private onTimeout: (error: Error) => void, private onWaiting: () => void, private noticeMs = 30000, private limits?: { callMs: number; progressMs?: number }) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Invalid model response timeout');
    if (limits && (!Number.isFinite(limits.callMs) || limits.callMs <= 0 || (limits.progressMs !== undefined && (!Number.isFinite(limits.progressMs) || limits.progressMs <= 0)))) throw new Error('Invalid model response limits');
    void this.failure.catch(() => {});
  }
  private fail(message: string, kind: ModelResponseTimeout["kind"], milliseconds: number) {
    this.stop(); this.clearProgress();
    const error = new ModelResponseTimeout(message, kind, milliseconds);
    this.onTimeout(error); this.reject(error);
  }
  beginCall() {
    this.stop(); this.activity();
    if (this.limits) this.absolute = setTimeout(() => this.fail(`单次模型调用超过 ${Math.round(this.limits!.callMs / 1000)} 秒，已停止等待；已保存的计算和草稿保留，继续时从当前草稿恢复。`, "call", this.limits!.callMs), this.limits.callMs);
  }
  durableProgress(key: string) {
    if (!this.limits?.progressMs || key === this.progressKey) return;
    this.progressKey = key;
    clearTimeout(this.progress);
    this.progress = setTimeout(() => this.fail(`分析连续 ${Math.round(this.limits!.progressMs! / 1000)} 秒未保存新的可验证进展，已停止等待；已有计算和草稿保留，请继续当前分析。`, "progress", this.limits!.progressMs!), this.limits.progressMs);
  }
  private clearProgress() { clearTimeout(this.progress); }
  activity() {
    clearTimeout(this.timeout); clearTimeout(this.notice);
    this.notice = setTimeout(this.onWaiting, Math.min(this.noticeMs, this.milliseconds / 2));
    this.timeout = setTimeout(() => {
      this.fail(`模型连续 ${Math.round(this.milliseconds / 1000)} 秒未返回响应，已停止等待；已有资料已保存，可稍后继续。此错误不是数据搜索仍在执行。`, "idle", this.milliseconds);
    }, this.milliseconds);
  }
  stop() { clearTimeout(this.timeout); clearTimeout(this.notice); clearTimeout(this.absolute); }
  dispose() { this.stop(); this.clearProgress(); }
  async wait<T>(operation: Promise<T>): Promise<T> {
    try { return await Promise.race([operation, this.failure]); }
    finally { this.stop(); this.clearProgress(); }
  }
}
