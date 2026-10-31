// Lifecycle-only API smoke: never calls models or creates product examples.
import assert from "node:assert/strict";
const base = process.env.INFO_API || "http://127.0.0.1:4315/api";
async function call(url: string, options: RequestInit = {}) {
  const r = await fetch(base + url, options);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
assert.equal((await call("/health")).pi, "1.4.0");
const draft = await call("/projects", post({ brief: "", mode: "live" }));
assert.equal(draft.state.status, "pending");
assert.equal(draft.brief, "");
assert.equal(draft.title, "未命名项目");
assert.ok((await call("/projects")).some((p: any) => p.id === draft.id));
const name = "项目管理 API 验收";
await call(`/projects/${draft.id}/title`, {
  ...post({ title: name }),
  method: "PATCH",
});
assert.equal((await call(`/projects/${draft.id}`)).title, name);
const removed = await call(`/projects/${draft.id}`, { method: "DELETE" });
assert.match(removed.trashedPath, /^\.trash\//);
assert.ok(!(await call("/projects")).some((p: any) => p.id === draft.id));
const retired = await fetch(
  base + "/projects",
  post({ mode: "demo", brief: "retired mode must be rejected" }),
);
assert.equal(retired.status, 400);
const unsafe = await fetch(base + "/projects", {
  ...post({}),
  headers: {
    Origin: "https://external.example",
    "Content-Type": "application/json",
  },
});
assert.equal(unsafe.status, 403);
console.log(
  JSON.stringify(
    {
      ok: true,
      draft_create_rename_trash: true,
      retired_mode_rejected: true,
      external_origin_rejected: true,
      models_called: false,
    },
    null,
    2,
  ),
);
