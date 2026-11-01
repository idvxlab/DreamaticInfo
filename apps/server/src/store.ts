import { embedVisualizationRuntime } from "./visualization-runtime.js";
import { readDesignProgress } from "./designer-workbench.js";
import { readAnalysisProgress } from "./analyst-workbench.js";
import { readProgress } from "./research-state.js";
import { isDeepStrictEqual } from "node:util";
import { DOCUMENT_PROTOCOL, parseDocument } from "./markdown-protocol.js";
import { setting, CONFIG_ROOT } from "./config-store.js";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  realpath,
  appendFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  roles,
  type Project,
  type ProjectDetail,
  type Role,
  type TaskState,
} from "../../../packages/shared/types.js";
import { hash, names, validate } from "./validation.js";
export const ROOT = path.resolve(CONFIG_ROOT, setting("DREAMATIC_WORKSPACE"));
export const now = () => new Date().toISOString();
export async function atomic(file: string, value: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, value);
  await rename(tmp, file);
}
export async function json(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}
export function projectDir(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid project ID");
  return path.join(ROOT, id);
}
export async function safePath(root: string, relative: string) {
  if (path.isAbsolute(relative) || relative.includes("\0"))
    throw new Error("Invalid relative path");
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep))
    throw new Error("Path outside workspace");
  const actual = await realpath(target);
  if (!actual.startsWith((await realpath(root)) + path.sep))
    throw new Error("Symlink outside workspace");
  return actual;
}
export function initialState(id: string): TaskState {
  return {
    project_id: id,
    status: "pending",
    current_stage: null,
    completed: [],
    pending: [...roles],
    stages: Object.fromEntries(
      roles.map((r) => [r, { status: "pending", attempts: 0 }]),
    ) as TaskState["stages"],
    updated_at: now(),
    last_success_at: null,
    error: null,
  };
}
export async function save(p: Project) {
  p.updated_at = now();
  p.state.updated_at = p.updated_at;
  validate("task-state", p.state);
  await atomic(
    path.join(projectDir(p.id), "project.json"),
    JSON.stringify(p, null, 2),
  );
  await atomic(
    path.join(projectDir(p.id), "task-state.json"),
    JSON.stringify(p.state, null, 2),
  );
}
export async function create(brief: string, mode: "live") {
  const id = randomUUID();
  const p: Project = {
    id,
    title: brief.slice(0, 32) || "未命名项目",
    brief,
    mode,
    created_at: now(),
    updated_at: now(),
    uploads: [],
    messages: brief ? [{ role: "user", text: brief, at: now() }] : [],
    state: initialState(id),
  };
  for (const dir of [
    "input",
    "research",
    "analysis",
    "design",
    "assets",
    "output",
    "state/versions",
    "state/sessions",
  ])
    await mkdir(path.join(projectDir(id), dir), { recursive: true });
  await save(p);
  return p;
}
export async function displayTitle(id: string): Promise<string | undefined> {
  try {
    const data = JSON.parse(
      await readFile(path.join(projectDir(id), "project-display.json"), "utf8"),
    );
    return typeof data.title === "string" && data.title.trim()
      ? data.title
      : undefined;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export async function get(id: string): Promise<Project> {
  const project: Project = await json(
    path.join(projectDir(id), "project.json"),
  );
  const title = await displayTitle(id);
  return title ? { ...project, title } : project;
}
export async function list() {
  await mkdir(ROOT, { recursive: true });
  const result: Project[] = [];
  for (const id of await readdir(ROOT)) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue;
    result.push(await get(id));
  }
  return result.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export async function log(id: string, text: string) {
  await appendFile(
    path.join(projectDir(id), "execution-log.md"),
    `- ${now()} ${text.replaceAll("\n", " ")}\n`,
  );
}
export async function readArtifact(p: Project, role: Role) {
  const version = p.state.stages[role].version;
  if (!version) return undefined;
  const artifact = await json(await safePath(projectDir(p.id), `state/versions/${version}/artifact.json`));
  if (artifact.protocol !== DOCUMENT_PROTOCOL || typeof artifact.markdown !== "string")
    throw new Error("阶段产物必须使用当前 Markdown 协议");
  return artifact;
}
export async function upstream(p: Project, role: Role) {
  const out: Record<string, any> = {};
  for (const r of roles.slice(0, roles.indexOf(role))) {
    const a = await readArtifact(p, r);
    if (a) out[names[r]] = a.data;
  }
  return out;
}
export async function commit(
  p: Project,
  role: Role,
  data: any,
  notes: string,
  inputHash: string,
  document: string,
) {
  if (role === "builder") data = { ...data, html: await embedVisualizationRuntime(data.html) };
  const root = projectDir(p.id),
    version = `${role}-${randomUUID()}`,
    vdir = path.join(root, "state/versions", version);
  await mkdir(vdir, { recursive: true });
  {
    const parsed = parseDocument(role, document);
    const expected = role === "builder" ? { summary: data.summary } : data;
    if (!isDeepStrictEqual(parsed.data, expected) || parsed.notes !== notes)
      throw new Error("Markdown 文档与内部索引不一致");
  }
  const authored = document;
  const artifact = { data, notes, markdown: authored, protocol: DOCUMENT_PROTOCOL };
  await atomic(
    path.join(vdir, "artifact.json"),
    JSON.stringify(artifact, null, 2),
  );
  const md = authored;
  await atomic(path.join(vdir, `${names[role]}.md`), md);
  // Immutable version first; checkpoint is the commit point. Canonical paths are repairable views.
  p.state.stages[role] = {
    ...p.state.stages[role],
    status: "completed",
    input_hash: inputHash,
    output_hash: hash(artifact),
    version,
    completed_at: now(),
  };
  p.state.last_success_at = now();
  p.state.completed = roles.filter(
    (r) => p.state.stages[r].status === "completed",
  );
  p.state.pending = roles.filter((r) => !p.state.completed.includes(r));
  if (role === "chatbot") p.title = data.title;
  await save(p);
  await materialize(p, role, artifact);
  await log(p.id, `${role} completed → ${version}`);
}
export async function materialize(p: Project, role: Role, a: any) {
  const root = projectDir(p.id);
  await atomic(
    path.join(root, `${names[role]}.md`),
    a.markdown,
  );
  if (role === "builder")
    await atomic(path.join(root, "output/index.html"), a.data.html);
}
export async function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  );
}
export async function detail(p: Project): Promise<ProjectDetail> {
  const data = await upstream(p, "builder"),
    builder = await readArtifact(p, "builder");
  const stage_results: NonNullable<ProjectDetail["stage_results"]> = {};
  for (const role of roles) {
    if (p.state.stages[role].status !== "completed") continue;
    const artifact = role === "builder" ? builder : await readArtifact(p, role);
    if (artifact)
      stage_results[role] = {
        notes: artifact.notes,
        summary: String(artifact.data.summary ?? artifact.data.objective ?? artifact.data.theme ?? ""),
      };
  }
  return {
    ...p,
    ...data,
    stage_results,
    research_progress: await readProgress(p),
    analysis_progress: await readAnalysisProgress(p, data.research, data.intent),
    design_progress: await readDesignProgress(p, data),
    has_html: !!builder,
    has_pdf: await exists(path.join(projectDir(p.id), "output/poster.pdf")),
    files: (await readdir(projectDir(p.id))).filter((f) =>
      /\.md$/.test(f),
    ),
  };
}

/** Read the authored upstream Markdown documents. */
export async function handoffDocuments(p: Project, role: Role) {
  const documents: { name: string; text: string; summary: string }[] = [];
  for (const previous of roles.slice(0, roles.indexOf(role))) {
    const artifact = await readArtifact(p, previous);
    if (artifact) documents.push({
      name: `${names[previous]}.md`,
      text: artifact.markdown,
      summary: String(artifact.data.summary ?? artifact.data.objective ?? artifact.data.theme ?? "已完成").slice(0, 400),
    });
  }
  return documents;
}
