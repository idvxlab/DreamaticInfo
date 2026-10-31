import { setting } from "./config-store.js";
import path from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import type { Project, ResearchProgress } from "../../../packages/shared/types.js";
import { atomic, json, now, projectDir, readArtifact, safePath } from "./store.js";
import { hash } from "./validation.js";
const queues = new Map<string, Promise<unknown>>();
export async function researchScope(p: Project) {
  const intent = await readArtifact(p, "chatbot");
  return hash({ brief: p.brief, uploads: p.uploads.map(u => [u.id, u.sha256]), intent: intent?.data ?? null, body_threshold: setting("DREAMATIC_SOURCE_MIN_TEXT_CHARS") });
}
export function progressPath(p: Project, scope: string) {
  return path.join(projectDir(p.id), "research", "runs", scope, "progress.json");
}
export async function readProgress(p: Project): Promise<ResearchProgress | undefined> {
  const scope = await researchScope(p);
  try { return await json(progressPath(p, scope)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export async function updateProgress<T>(p: Project, scope: string, update: (state: ResearchProgress) => Promise<T> | T): Promise<T> {
  const key = `${p.id}/${scope}`, before = queues.get(key) ?? Promise.resolve();
  const work = before.catch(() => {}).then(async () => {
    let state: ResearchProgress;
    try { state = await json(progressPath(p, scope)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = { scope, revision: 0, updated_at: now(), plan_markdown: "", tasks: [], sources: [], archived_tasks: [] };
    }
    const result = await update(state);
    state.updated_at = now();
    await mkdir(path.dirname(progressPath(p, scope)), { recursive: true });
    await atomic(progressPath(p, scope), JSON.stringify(state, null, 2));
    return result;
  });
  queues.set(key, work);
  try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
}
export async function readableSource(p: Project, entry: ResearchProgress["sources"][number]) {
  if (entry.status !== "accepted" || !entry.source || !entry.content_hash) throw new Error("该来源尚无可用正文");
  const text = await readFile(await safePath(projectDir(p.id), entry.source.path), "utf8");
  if (hash(text) !== entry.content_hash) throw new Error("已保存正文与采集摘要不一致，请重新采集");
  return text;
}
