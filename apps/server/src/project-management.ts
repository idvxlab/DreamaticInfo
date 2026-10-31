import path from "node:path";
import { lstat, mkdir, rename, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ROOT, projectDir, get, now } from "./store.js";

async function checkedDirectory(id: string) {
  const dir = projectDir(id);
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("项目目录无效");
  return dir;
}
export async function renameProject(id: string, value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 120 ||
    /[\r\n\0]/.test(value)
  )
    throw new Error("项目名称须为 1–120 个字符的单行文本");
  const dir = await checkedDirectory(id);
  await get(id);
  const title = value.trim(),
    file = path.join(dir, "project-display.json"),
    temp = `${file}.${randomUUID()}.tmp`;
  // Separate display metadata avoids racing with a running agent's project checkpoint.
  try {
    await writeFile(
      temp,
      JSON.stringify({ title, updated_at: now() }, null, 2),
      { mode: 0o600 },
    );
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
  return { id, title };
}
export async function trashProject(id: string) {
  const source = await checkedDirectory(id),
    p = await get(id);
  if (p.state.status === "running")
    throw new Error("请先暂停正在运行的项目，再删除");
  const trash = path.join(ROOT, ".trash");
  await mkdir(trash, { recursive: true });
  const info = await lstat(trash);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("回收目录无效");
  const target = path.join(
    trash,
    `${id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  await rename(source, target);
  return { id, trashedPath: path.relative(ROOT, target).replaceAll("\\", "/") };
}
