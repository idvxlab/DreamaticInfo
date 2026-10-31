import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { roles, type ProjectDetail } from "../packages/shared/types.js";
import { conversationEntries, pendingQuestion } from "../apps/web/src/conversation-model.js";
import Conversation from "../apps/web/src/Conversation.js";
function project(): ProjectDetail {
  return {
    id: "conversation-test", title: "Test", brief: "Test", mode: "live", created_at: "2026-10-30T00:00:00Z", updated_at: "2026-10-30T00:04:00Z", uploads: [], files: [], has_html: false, has_pdf: false,
    messages: [{ role: "user", text: "First request", at: "2026-10-30T00:00:00Z" }, { role: "user", text: "Follow-up", at: "2026-10-30T00:03:00Z" }],
    state: { project_id: "conversation-test", status: "running", current_stage: "researcher", completed: ["chatbot"], pending: ["researcher", "analyst", "designer", "builder"], updated_at: "2026-10-30T00:04:00Z", last_success_at: "2026-10-30T00:02:00Z", error: null, stages: Object.fromEntries(roles.map(role => [role, { status: role === "chatbot" ? "completed" : role === "researcher" ? "running" : "pending", attempts: role === "chatbot" || role === "researcher" ? 1 : 0, ...(role === "chatbot" ? { completed_at: "2026-10-30T00:02:00Z" } : {}) }])) as ProjectDetail["state"]["stages"] },
    stage_results: { chatbot: { summary: "Verified objective", notes: "<script>untrusted material</script>" } },
  };
}
function render(p: ProjectDetail | null, disabled: boolean) {
  return renderToStaticMarkup(createElement(Conversation, { project: p, disabled, pending: false, events: [{ at: "2026-10-30T00:04:00Z", text: "搜索：公开资料", role: "researcher" }], text: "", setText: () => {}, files: [], setFiles: () => {}, error: "", clearError: () => {}, onSend: async () => {}, onPause: () => {}, onContinue: () => {}, onRerun: () => {}, onPreview: () => {} }));
}
test("conversation interleaves follow-up messages with stage results and omits unstarted stages", () => {
  assert.deepEqual(conversationEntries(project()).map(entry => entry.key), ["message-0", "chatbot", "message-1", "researcher"]);
});
test("answered or completed clarification does not reappear", () => {
  const p = project();
  p.state.status = "interrupted";
  p.messages.push({ role: "assistant", text: "Choose scope", question: { title: "Choose scope", options: ["A", "B"] }, at: "2026-10-30T00:05:00Z" });
  assert.equal(pendingQuestion(p)?.question?.title, "Choose scope");
  assert.match(render(p, false), /aria-label="需求确认"/);
  p.messages.push({ role: "user", text: "A", at: "2026-10-30T00:06:00Z" });
  assert.equal(pendingQuestion(p), undefined);
  p.messages.pop(); p.state.status = "completed";
  assert.equal(pendingQuestion(p), undefined);
});
test("conversation renders grouped progress and persisted results, escapes source text, and exposes pause while running", () => {
  const html = render(project(), true);
  assert.match(html, /workflow-agent-card/);
  assert.match(html, /Verified objective/);
  assert.match(html, /搜索：公开资料/);
  assert.match(html, /&lt;script&gt;untrusted material&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /aria-label="暂停任务"/);
  assert.match(html, /document\/intent.md/);
  assert.doesNotMatch(html, /Analyst ·/);
});
test("no selected project disables composer, attachments and suggestions with an explanation", () => {
  const html = render(null, true);
  assert.match(html, /请先新建项目/);
  assert.match(html, /<textarea[^>]*disabled=""/);
  assert.match(html, /aria-label="上传数据文件"[^>]*disabled=""/);
  assert.match(html, /aria-label="发送需求"[^>]*disabled=""/);
});

test("stage startup count is distinct from source reads, and shutdown interruptions are not shown as manual pauses", () => {
  const p = project(); p.state.stages.researcher.attempts = 4;
  assert.match(render(p, false), /第 4 次启动/);
  assert.doesNotMatch(render(p, false), /第 4 次尝试/);
  assert.match(render(p, false), /不代表文献读取次数/);
  p.state.status = "interrupted"; p.state.stages.researcher.status = "interrupted";
  p.state.stages.researcher.error = "服务停止，任务已中断，已有成果已保存，可继续执行";
  assert.match(render(p, false), /已中断/); assert.doesNotMatch(render(p, false), /已暂停/);
  p.state.stages.researcher.error = "用户暂停任务";
  assert.match(render(p, false), /已暂停/);
});
