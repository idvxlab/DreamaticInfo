import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { RepairSnapshot } from "../apps/server/src/analysis-repair-policy.js";
const root = await mkdtemp(path.join(os.tmpdir(), "info-repair-policy-"));
process.env.INFO_CONFIG_DIR = root;
const { AnalysisRepairPolicy } = await import("../apps/server/src/analysis-repair-policy.js");
const { SubmissionPolicy } = await import("../apps/server/src/submission-policy.js");
const ids = Array.from({ length: 10 }, (_, i) => `F-${i + 1}`);
function state(remaining: number): RepairSnapshot {
  return { parsed: true, factIds: ids, verified: ids.slice(remaining), issues: ids.slice(0, remaining).map(id => ({ fact: id, location: `${id}/证据`, message: "引文不在对应来源中：original", fix: "读取证据" })) };
}
try {
  await test("more than five meaningful repairs continue and reset the formal consecutive-failure window", () => {
    const repair = new AnalysisRepairPolicy(state(9)), submission = new SubmissionPolicy();
    for (let remaining = 8; remaining >= 0; remaining--) {
      submission.reject(new Error("pending evidence"));
      const review = repair.review(state(remaining));
      assert.equal(review.progress, true);
      submission.progress();
      assert.equal(submission.hasFailures, false);
      assert.equal(submission.fatal, undefined);
    }
    assert.equal(repair.fatal, undefined);
    assert.equal(repair.pending, false);
  });
  await test("reducing issues in an unverified fact is progress, and parsing a previously broken draft is progress", () => {
    const initial = state(1); initial.verified = []; initial.issues.push({ ...initial.issues[0], location: "F-1/单位" });
    const repair = new AnalysisRepairPolicy(initial), partial = structuredClone(initial); partial.issues.pop();
    assert.equal(repair.review(partial).progress, true);
    const broken = new AnalysisRepairPolicy({ parsed: false, factIds: [], verified: [], issues: [{ location: "文档格式", message: "格式错误", fix: "修复表格" }] });
    assert.equal(broken.review(state(9)).progress, true);
  });
  await test("changing bad quote text and revision-independent repeated issues cannot fake repair progress", () => {
    const repair = new AnalysisRepairPolicy(state(3));
    for (let i = 0; i < 2; i++) {
      const next = state(3); next.issues[0].message = `引文不在对应来源中：changed-${i}`;
      assert.equal(repair.review(next).progress, false);
    }
    assert.throws(() => repair.review(state(3)), /连续无进展/);
  });
  await test("deleting facts or regressing verified facts does not reset no-progress protection", () => {
    const repair = new AnalysisRepairPolicy(state(3)), deleted = state(2);
    deleted.factIds = ids.slice(1);
    assert.equal(repair.review(deleted).progress, false);
    const regressed = state(2); regressed.verified = [];
    assert.equal(repair.review(regressed).progress, false);
    assert.equal(repair.review(deleted).progress, false);
    assert.throws(() => repair.review(deleted), /连续无进展/);
  });
  await test("oscillating problems cannot replenish the repair budget and a new genuine improvement does reset it", () => {
    const repair = new AnalysisRepairPolicy(state(4));
    assert.equal(repair.review(state(4)).progress, false);
    assert.equal(repair.review(state(4)).progress, false);
    assert.equal(repair.review(state(3)).progress, true);
    for (let i = 0; i < 4; i++) {
      const next = state(3); next.issues[0].location = `F-1/variant-${i}`;
      assert.equal(repair.review(next).progress, false);
    }
    const next = state(3); next.issues[0].location = "F-1/another-variant";
    assert.throws(() => repair.review(next), /连续无进展（5 次）/);
  });
  await test("a fully verified unchanged draft asks for formal submission without creating repair failures", () => {
    const repair = new AnalysisRepairPolicy(state(0));
    for (let i = 0; i < 8; i++) assert.match(repair.review(state(0)).message, /submit_stage/);
    assert.equal(repair.fatal, undefined);
  });
  await test("narrative-to-visual expansion establishes one new baseline without rewarding phase oscillation", () => {
    const narrative = { ...state(1), phase: 0 };
    const policy = new AnalysisRepairPolicy(narrative, "design", "items", "Use patch_design_asset for asset references.");
    const expanded = { ...state(8), phase: 1, verified: narrative.verified };
    assert.equal(policy.review(expanded).progress, true);
    assert.equal(policy.review({ ...expanded, issues: expanded.issues.slice(1) }).progress, true);
    assert.equal(policy.review(expanded).progress, false);
    policy.review({ ...expanded, phase: 0 });
    assert.throws(() => policy.review(expanded), /patch_design_asset/);
  });
} finally { await rm(root, { recursive: true, force: true }); }
