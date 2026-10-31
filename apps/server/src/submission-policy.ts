/** A model may repair a rejected document, but cannot loop on invalid submissions. */
import { setting } from "./config-store.js";
export class DocumentSubmissionError extends Error {}
export class SubmissionPolicy {
  private readonly repeatedLimit = Number(setting("DREAMATIC_MAX_REPEATED_SUBMISSIONS"));
  private readonly totalLimit = Number(setting("DREAMATIC_MAX_INVALID_SUBMISSIONS"));
  private failures = 0;
  private counts = new Map<string, number>();
  fatal: Error | undefined;
  get hasFailures() { return this.failures > 0; }
  /** Verified repair progress starts a new consecutive-failure window. */
  progress() { this.failures = 0; this.counts.clear(); }
  reject(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const key = error instanceof Error && "failureKey" in error && typeof error.failureKey === "string" ? error.failureKey : message;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    this.failures++;
    const feedback = `文档提交未通过：${message}。请按 Markdown 模板修正该位置后再提交，不要改用需求提问处理技术错误。`;
    if (count >= this.repeatedLimit || this.failures >= this.totalLimit)
      this.fatal = new DocumentSubmissionError(`阶段已停止：文档连续校验失败（共 ${this.failures} 次），最近原因：${message}。请检查文档格式或模型工具遵循能力后重试。`);
    return new Error(this.fatal?.message ?? feedback);
  }
}
