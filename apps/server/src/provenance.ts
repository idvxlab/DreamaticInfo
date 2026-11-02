import { hash } from "./validation.js";
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
    for(const task of progress?.tasks ?? []) {
      const gap=task.resolution?.gap;
      if(gap && !(data.limitations ?? []).some((item:string)=>item.includes(gap)))throw new Error(`任务 ${task.id} 的数据缺口必须原样保留在调研 limitations 中`);
    }
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
        if (entry.acquisition && hash(s) !== hash(entry.source)) throw new Error("数据来源元数据必须完整保留工具登记值，不能改写范围或许可局限");
      }
    }
    if (!data.sources.length) throw new Error("没有可追溯数据来源");
    for (const ds of data.datasets) {
      const source = data.sources.find((item: any) => item.id === ds.source_id);
      if (!source || ds.path !== source.path) throw new Error("数据集必须绑定同一来源的完整规范化文件");
      await safePath(root, ds.path);
      const entry = progress?.sources.find(item => item.source?.id === ds.source_id);
      if (source.kind !== "upload" && !entry?.acquisition) throw new Error("网络数据集必须通过选定数据采集工具取得，目录/文章不能冒充数据文件");
    }
  }
  if (role === "analyst") {
    const research = (await upstream(p, role)).research as Research;
    const issues = await analystIssues(p, data, research);
    if (issues.length) throw new Error(analysisReport(issues));
  }
}
