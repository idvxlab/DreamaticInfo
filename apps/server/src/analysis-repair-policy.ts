import type { AnalysisIssue } from "../../../packages/shared/types.js";
import { setting } from "./config-store.js";
import { DocumentSubmissionError } from "./submission-policy.js";

export interface RepairSnapshot {
  parsed: boolean;
  factIds: string[];
  verified: string[];
  issues: AnalysisIssue[];
}

/** Track improvements against the best result, rather than rewarding oscillation. */
export class AnalysisRepairPolicy {
  private readonly repeatedLimit = Number(setting("DREAMATIC_MAX_REPEATED_SUBMISSIONS"));
  private readonly stalledLimit = Number(setting("DREAMATIC_MAX_INVALID_SUBMISSIONS"));
  private facts = new Set<string>();
  private verified = new Set<string>();
  private bestIssues = Infinity;
  private parsed = false;
  private initialized = false;
  private stalled = 0;
  private repeated = new Map<string, number>();
  pending = false;
  fatal: Error | undefined;

  constructor(initial?: RepairSnapshot, private subject = "分析草稿", private item = "事实") { if (initial) this.remember(initial); }

  private remember(state: RepairSnapshot) {
    this.initialized = true;
    this.parsed ||= state.parsed;
    state.factIds.forEach(id => this.facts.add(id));
    state.verified.forEach(id => this.verified.add(id));
    if (state.parsed) this.bestIssues = state.issues.length;
    this.pending = state.issues.length > 0;
  }

  review(state: RepairSnapshot) {
    if (this.fatal) throw this.fatal;
    const preserved = [...this.facts].every(id => state.factIds.includes(id)) && [...this.verified].every(id => state.verified.includes(id));
    const progress = !this.initialized || preserved && (
      state.parsed && !this.parsed ||
      state.verified.some(id => !this.verified.has(id)) ||
      state.parsed && state.issues.length < this.bestIssues
    );
    if (!progress && preserved && state.parsed && state.issues.length === 0) {
      this.pending = false;
      return { progress: false, message: "草稿预检已全部通过，请调用 submit_stage 提交当前 draft_revision；预检尚未完成正式提交。" };
    }
    if (progress) { this.stalled = 0; this.repeated.clear(); }
    else {
      this.stalled++;
      // Ignore changing revision IDs, quote text and invalid enum values: these do
      // not establish that an unresolved validation problem has been repaired.
      const key = JSON.stringify([state.parsed, [...state.factIds].sort(), [...state.verified].sort(), state.issues.map(issue => [issue.fact, issue.location, issue.message.replace(/实际值 .* 不属于允许值/, "枚举值无效").split("：")[0]]).sort()]);
      const count = (this.repeated.get(key) ?? 0) + 1;
      this.repeated.set(key, count);
      if (count >= this.repeatedLimit || this.stalled >= this.stalledLimit) {
        this.fatal = new DocumentSubmissionError(`阶段已停止：${this.subject}连续无进展（${this.stalled} 次），已有草稿已保存。请核对证据定位、统计指标或工具参数后继续；这不是累计修复次数限制。`);
      }
    }
    // Regressions must not lower the bar for the next attempt.
    if (progress) this.remember(state);
    else {
      state.factIds.forEach(id => this.facts.add(id));
      state.verified.forEach(id => this.verified.add(id));
      this.pending = state.issues.length > 0;
    }
    if (this.fatal) throw this.fatal;
    return {
      progress,
      message: progress
        ? `修复进展已保存：${state.verified.length} 条${this.item}通过，剩余 ${state.issues.length} 项问题；继续局部修正。`
        : `草稿已保存，本次未超过此前最佳校验结果（连续 ${this.stalled} 次）。请调整修复策略：重新定位原始证据块、核对指标单位，优先处理其他待修问题；不要重复同一引文、删除事实或覆盖已通过条目。`,
    };
  }
}
