import { readProgress, readableSource } from "./research-state.js";
import type {
  Project,
  Role,
  Research,
} from "../../../packages/shared/types.js";
import { projectDir, safePath, upstream } from "./store.js";
import { analystIssues, analysisReport } from "./analyst-validation.js";
export async function validateProvenance(p: Project, role: Role, data: any) {
  const root = projectDir(p.id);
  if (role === "researcher") {
    const progress = await readProgress(p);
    for (const s of (data as Research).sources) {
      await safePath(root, s.path);
      if (s.kind === "upload") {
        if (
          !p.uploads.some(
            (u) =>
              u.id === s.id && (u.normalized === s.path || u.path === s.path),
          )
        )
          throw new Error("调研来源不对应上传文件");
      } else {
        const entry = progress?.sources.find(item => item.status === "accepted" && item.source?.id === s.id && item.source.path === s.path && item.source.url === s.url);
        if (!entry) throw new Error("网络来源必须由当前调研范围的采集工具获取并通过正文检查");
        await readableSource(p, entry);
      }
    }
    if (!data.sources.length) throw new Error("没有可追溯数据来源");
    for (const ds of data.datasets) await safePath(root, ds.path);
  }
  if (role === "analyst") {
    const research = (await upstream(p, role)).research as Research;
    const issues = await analystIssues(p, data, research);
    if (issues.length) throw new Error(analysisReport(issues));
  }
}
