import type { SearchTask } from "../../../packages/shared/types.js";
import { setting } from "./config-store.js";
export const planTemplate = `# 搜索计划

## 调研目标
说明待回答的问题、范围、统计口径、优先来源及停止条件。已有上传资料时说明先读哪些文件。

## 搜索队列

| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |
| --- | --- | --- | --- | --- |
| Q1 | 需要查证的问题 | 实际搜索关键词 | 1 | 优先查找的机构或资料 |

## 说明
优先级 1 最高，3 最低。每条关键词应有明确目的。纯上传资料无需搜索时，搜索队列可写“无”。`;
export const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export function parseSearchPlan(markdown: string, hasUploads: boolean): Omit<SearchTask, "status" | "hits" | "attempts" | "updated_at">[] {
  if (typeof markdown !== "string" || !markdown.trim() || markdown.length > 40000) throw new Error("搜索计划必须为非空 Markdown，且不超过 40000 字符");
  const goal = /^## 调研目标\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(markdown)?.[1]?.trim();
  const section = /^## 搜索队列\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(markdown)?.[1]?.trim();
  if (!goal || section === undefined) throw new Error("计划必须包含“## 调研目标”和“## 搜索队列”");
  if (section === "无") { if (!hasUploads) throw new Error("没有上传资料时，搜索队列不能为空"); return []; }
  const lines = section.split("\n").map(x => x.trim()).filter(Boolean);
  if (lines.some(line => !line.startsWith("|"))) throw new Error("搜索队列必须使用五列表格，不能混入段落");
  const rows = lines.map(line => line.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(x => x.trim().replaceAll("\\|", "|")));
  const headers = ["编号", "问题", "关键词", "优先级", "目标来源"];
  if (rows.length < 3 || rows[0].join("/") !== headers.join("/") || rows[1].length !== 5 || rows[1].some(x => !/^:?-{3,}:?$/.test(x))) throw new Error("搜索队列表头应为：编号、问题、关键词、优先级、目标来源");
  if (rows.length - 2 > Number(setting("DREAMATIC_RESEARCH_MAX_TASKS"))) throw new Error("关键词队列超过系统配置的条目上限");
  const ids = new Set<string>(), queries = new Set<string>();
  return rows.slice(2).map(row => {
    const [id, question, query, priority, target] = row;
    if (row.length !== 5 || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || !question || !query || query.length > 500 || !target || !/^[123]$/.test(priority)) throw new Error("队列条目需有唯一编号、问题、关键词、优先级 1–3 和目标来源；关键词不超过 500 字符");
    if (ids.has(id) || queries.has(normalizeQuery(query))) throw new Error("队列编号与关键词不能重复，请合并重复目标");
    ids.add(id); queries.add(normalizeQuery(query));
    return { id, question, query, priority: Number(priority), target };
  });
}
