import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Fact, Project } from "../../../packages/shared/types.js";
import { atomic, projectDir, safePath } from "./store.js";
import { hash } from "./validation.js";
import { evidenceText, type EvidenceSource } from "./evidence-view.js";
import { operations, statistic, type Operation, type StatisticResult } from "./fact-statistics.js";
export interface SourceCalculation { operation: Operation; unit?: string; source_id: string; block_id: string; value_column?: number; label_column?: number; paired_column?: number; focus?: string; ties?: "competition" | "dense"; direction?: "ascending" | "descending"; iqr_multiplier?: number; bins?: number[]; }
export interface CalculationReceipt { id: string; version: string; source_digest: string; request: SourceCalculation; unit: string; series_unit: string; measure: string; breakdown: string; result: StatisticResult; }
const number = (text: string) => {
  const value=evidenceText(text);
  if(!/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))throw new Error(`单元格不是无歧义数值：${value.slice(0,70)}；不能自动丢弃缺失值或换算单位`);
  const result=Number(value.replaceAll(",",""));if(!Number.isFinite(result))throw new Error("来源数值不是有限数");return result;
};
function table(text: string, delimiter?: string): string[][] {
  if(/<table|rowspan|colspan/i.test(text))throw new Error("复杂 HTML 表格不能直接独立计算，请提供完整规则表格或引用原文结果");
  const lines=text.trim().split(/\r?\n/).filter(line=>line.trim());
  let rows: string[][];
  if(!delimiter && lines.every(line=>line.trim().startsWith("|"))) rows=lines.map(line=>line.trim().replace(/^\|/,"").replace(/\|$/,"").split(/(?<!\\)\|/).map(cell=>evidenceText(cell))).filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));
  else { if(!delimiter&&!lines.every(line=>line.includes(",")||line.includes("\t")))throw new Error("证据块不是可识别的 Markdown/CSV/TSV 表格");rows=parse(text,{delimiter:delimiter??(text.includes("\t")?"\t":","),skip_empty_lines:true}).map((row:string[])=>row.map(evidenceText)); }
  if(rows.length<2||rows.some(row=>row.length!==rows[0].length))throw new Error("表格至少需要表头与数据行，且列数必须一致");
  return rows;
}
export function buildCalculation(source: EvidenceSource, input: SourceCalculation): CalculationReceipt {
  if(input.unit!==undefined && (!input.unit.trim()||input.unit.length>80||/[\r\n|]/.test(input.unit)))throw new Error("单位声明须为不超过 80 字的单行文本");
  if(!operations.includes(input.operation))throw new Error("未知来源计算操作");
  if(input.source_id!==source.source.id)throw new Error("计算来源编号不一致");
  const block=source.blocks.find(item=>item.id===input.block_id);if(!block)throw new Error("计算证据块不存在或已失效");
  const rows=table(block.text, block.section === "原始上传文本" ? source.raw_format === "csv" ? "," : source.raw_format === "tsv" ? "\t" : undefined : undefined), header=rows[0], data=rows.slice(1);
  const valueColumn=input.value_column??0,labelColumn=input.label_column??0;
  for(const column of [valueColumn,labelColumn,...(input.paired_column===undefined?[]:[input.paired_column])])if(!Number.isInteger(column)||column<0||column>=header.length)throw new Error("列号必须是表头中的零起始整数索引");
  if(header.some(value=>!value)||new Set(header).size!==header.length)throw new Error("表头必须非空且唯一，不能猜测缺失列含义");
  const labels=data.map(row=>row[labelColumn]);if(labels.some(label=>!label))throw new Error("对象标签不能为空");
  const categorical=["count","distinct_count","distribution_count"].includes(input.operation);
  const values=categorical?undefined:data.map(row=>number(row[valueColumn]));
  if(input.operation==="trend") {
    const times=labels.map(label=>{ if(!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(label)||label.length!==labels[0].length)return NaN; const full=label.length===4?`${label}-01-01`:label.length===7?`${label}-01`:label, time=Date.parse(`${full}T00:00:00Z`); return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===full?time:NaN; });
    if(times.some((time,index)=>!Number.isFinite(time)||(index>0&&time<=times[index-1])))throw new Error("趋势时间列必须为严格递增的 YYYY、YYYY-MM 或 YYYY-MM-DD，不填补缺失年份");
  }
  if(input.operation==="pearson"&&(input.paired_column===undefined||input.paired_column===valueColumn))throw new Error("相关计算必须指定第二个数值列");
  if(input.operation==="rank"&&input.direction&&!['ascending','descending'].includes(input.direction))throw new Error("未知排名方向");
  const request: SourceCalculation={operation:input.operation,...(input.unit===undefined?{}:{unit:input.unit}),source_id:input.source_id,block_id:input.block_id,value_column:valueColumn,label_column:labelColumn,...(input.paired_column===undefined?{}:{paired_column:input.paired_column}),...(input.focus===undefined?{}:{focus:input.focus}),...(input.ties===undefined?{}:{ties:input.ties}),...(input.direction===undefined?{}:{direction:input.direction}),...(input.iqr_multiplier===undefined?{}:{iqr_multiplier:input.iqr_multiplier}),...(input.bins===undefined?{}:{bins:input.bins})};
  const result=statistic({...request,values,labels,paired_values:input.paired_column===undefined?undefined:data.map(row=>number(row[input.paired_column!]))});
  const baseUnit=input.unit?.trim()||"未提供";
  const unit=["proportion","change_percent"].includes(input.operation)?"%":input.operation==="rank"?"名":input.operation==="distinct_count"?"类":input.operation==="count"||input.operation==="histogram"||input.operation==="distribution_count"?"条":input.operation==="pearson"?"r":input.operation==="trend"?"趋势":input.operation==="difference"&&baseUnit==="%"?"百分点":baseUnit;
  const seriesUnit=input.operation==="proportion"?"%":["histogram","distribution_count"].includes(input.operation)?"条":result.series.length?baseUnit:"无";
  const body={unit,series_unit:seriesUnit,version:"source-calculation-v1",source_digest:source.digest,request,measure:categorical?"记录数":input.operation==="pearson"?`${header[valueColumn]} × ${header[input.paired_column!]}`:header[valueColumn],breakdown:header[labelColumn],result};
  return {id:`calc-${hash(body)}`,...body};
}
export async function saveCalculation(p: Project, source: EvidenceSource, input: SourceCalculation) {
  const receipt=buildCalculation(source,input);
  await atomic(path.join(projectDir(p.id),`state/calculations/${receipt.id}.json`),JSON.stringify(receipt));
  return receipt;
}
export function calculationMarkdown(receipt: CalculationReceipt) {
  const r=receipt.result;
  const cell=(value: unknown)=>String(value).replaceAll("|","\\|").replace(/\r?\n/g," ");
  return `# 可复算来源计算\n\n| 字段 | 内容 |\n| --- | --- |\n| 计算记录编号 | ${receipt.id} |\n| 依据方式 | computed |\n| 分布类别 | ${receipt.request.operation==="histogram"?"numeric":["distribution","distribution_count"].includes(receipt.request.operation)?"categorical":"none"} |\n| 来源编号 | ${receipt.request.source_id} |\n| 证据块 | ${receipt.request.block_id} |\n| 内容范围 | 完整证据块 ${receipt.request.block_id}，不自动过滤或删除行 |\n| 度量字段 | ${cell(receipt.measure)} |\n| 分组字段 | ${cell(receipt.breakdown)} |\n| 关注对象 | ${cell(r.focus)} |\n| 聚合方法 | ${r.aggregation} |\n| 方法 | ${cell(r.method)} |\n| 数值 | ${r.value} |\n| 单位 | ${cell(receipt.unit)} |\n| 序列单位 | ${cell(receipt.series_unit)} |\n\n## 数值序列\n\n${r.series.length?'| 标签 | 数值 |\n| --- | --- |\n'+r.series.map(item=>`| ${cell(item.label)} | ${item.value} |`).join('\n'):'无'}\n\n## 计算说明\n\n${Object.entries(r.details).map(([key,value])=>`- ${key}：${cell(Array.isArray(value)?value.join("、"):value)}`).join('\n')}\n\n以上结果直接来自原始证据块。先核实完整比较范围与单位；占比分母是证据块全部数值的和，排名覆盖全部行。不要把子集排名称为全国排名。\n`;
}
const close=(a:number,b:number)=>a===b;
export async function verifyCalculation(p: Project, fact: Fact, sources: Map<string,EvidenceSource>) {
  const id=fact.specification.calculation_id;
  if(!id||!/^calc-[a-f0-9]{64}$/.test(id))throw new Error("确定性计算必须引用 calculate 生成的来源计算编号");
  const recorded=JSON.parse(await readFile(await safePath(projectDir(p.id),`state/calculations/${id}.json`),"utf8")) as CalculationReceipt;
  const source=sources.get(recorded.request.source_id);if(!source)throw new Error("计算记录来源不在本事实的可核验来源中");
  const fresh=buildCalculation(source,recorded.request);
  if(id!==fresh.id||hash(recorded)!==hash(fresh))throw new Error("来源内容、计算参数或记录已变化，必须重新计算");
  if(!fact.source_ids.includes(source.source.id)||!fact.evidence.some(item=>item.source_id===source.source.id&&item.location.includes(recorded.request.block_id)))throw new Error("计算证据必须关联同一来源及 E- 证据块编号");
  const permitted:Record<string,readonly string[]>={value:["sum","mean","median","min","max","count"],comparison:["difference","change_percent"],trend:["trend"],distribution:["distribution","distribution_count","histogram"],correlation:["pearson"],proportion:["proportion"],categorization:["distinct_count"],rank:["rank"],extreme:["extreme_max","extreme_min"],outlier:["outlier_iqr"]};
  if(!permitted[fact.type]?.includes(fresh.request.operation))throw new Error("计算操作与事实类型不匹配");
  if(typeof fact.value!==typeof fresh.result.value || (typeof fact.value==="number" && typeof fresh.result.value==="number" ? !close(fact.value,fresh.result.value) : fact.value!==fresh.result.value))throw new Error("事实数值与可复算结果不一致");
  const spec=fact.specification;
  if(!spec.scope.includes(fresh.request.block_id)||spec.measure!==fresh.measure||spec.breakdown!==fresh.breakdown||spec.focus!==fresh.result.focus||spec.method!==fresh.result.method||spec.aggregation!==fresh.result.aggregation || spec.series_unit!==fresh.series_unit || fact.unit!==fresh.unit)throw new Error("统计口径必须保留计算返回的证据块范围、字段、关注对象、方法与聚合方式");
  const expectedDistribution=fact.type==="distribution"?(fresh.request.operation==="histogram"?"numeric":"categorical"):"none";
  if(spec.distribution_kind!==expectedDistribution)throw new Error("分布类别与计算方式不一致");
  if(fact.series.length!==fresh.result.series.length||fact.series.some((item,index)=>item.label!==fresh.result.series[index].label||!close(item.value,fresh.result.series[index].value)))throw new Error("事实数值序列必须与计算返回的序列一致，不得删除或改写观测值");
}
