import { validateCalculationMode } from "./calculation-contract.js";
import { ResearchToolError } from "./research-feedback.js";
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Fact, Project } from "../../../packages/shared/types.js";
import { atomic, projectDir, safePath } from "./store.js";
import { hash } from "./validation.js";
import { evidenceText, type EvidenceSource } from "./evidence-view.js";
import { operations, statistic, type Operation, type StatisticResult } from "./fact-statistics.js";
export interface SourceCalculation { group_columns?: number[]; group_values?: string[]; time_order?: "ascending"; first_row_header?: boolean; operation: Operation; unit?: string; source_id: string; block_id: string; value_column?: number; label_column?: number; paired_column?: number; focus?: string; ties?: "competition" | "dense"; direction?: "ascending" | "descending"; iqr_multiplier?: number; bins?: number[]; }
export interface CalculationReceipt { selection_scope?: string; id: string; version: string; source_digest: string; request: SourceCalculation; unit: string; series_unit: string; measure: string; breakdown: string; result: StatisticResult; }
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
/** Evidence-derived hints: no model guessing and no change to source rows. */
export function calculationTableGuide(source:EvidenceSource,blockId:string) {
  const block=source.blocks.find(b=>b.id===blockId);if(!block)return undefined;
  try {
    const rows=table(block.text,["原始上传文本","原始数据文本"].includes(block.section) ? source.raw_format==="csv" ? "," : source.raw_format==="tsv" ? "\t" : undefined : undefined);
    const numbered=rows[0][0]==="原始行";
    return {source_id:source.source.id,block_id:blockId,table_kind:numbered?"numbered_original_rows":"explicit_header",first_row_header:numbered?"Only true after verifying the first original row is the header; then use original column indices without row-number column.":false,columns:rows[0].map((name,index)=>({index,name})),rows:rows.length-1,dimensions:numbered ? [] : rows[0].map((name,index)=>{const values=rows.slice(1).map(row=>row[index]);const distinct=[...new Set(values)];const dates=values.every(v=>/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(v));return {index,name,distinct_count:distinct.length,...(distinct.length<=20?{observed_values:distinct}:{}),...(dates?{time_order:values.every((v,i)=>!i||v>values[i-1])?"ascending_unique":values.every((v,i)=>!i||v<values[i-1])?"descending_unique":"repeated_or_mixed",trend_hint:"Repeated entity/year rows require explicit group_columns; descending years require time_order=ascending."}:{})};}),note:"difference requires exactly two observations; all source rows are retained. Values-only calculations are auxiliary, never formal source receipts."};
  }catch{return undefined;}
}
export function buildCalculation(source: EvidenceSource, input: SourceCalculation): CalculationReceipt {
  validateCalculationMode(input as unknown as Record<string,unknown>);
  if(input.unit!==undefined && (!input.unit.trim()||input.unit.length>80||/[\r\n|]/.test(input.unit)))throw new Error("单位声明须为不超过 80 字的单行文本");
  if(!operations.includes(input.operation))throw new Error("未知来源计算操作");
  if(input.source_id!==source.source.id)throw new Error("计算来源编号不一致");
  const block=source.blocks.find(item=>item.id===input.block_id);if(!block)throw new Error("计算证据块不存在或已失效");
  let rows=table(block.text, ["原始上传文本","原始数据文本"].includes(block.section) ? source.raw_format === "csv" ? "," : source.raw_format === "tsv" ? "\t" : undefined : undefined);
  if(input.first_row_header){
    if(rows[0][0]!=="原始行" || rows.length<3)throw new ResearchToolError("table_header_mode","parameter","当前证据表已有正式表头，不适用 first_row_header=true",`删除 first_row_header 或设为 false；列号保持当前表头的零起始索引：${rows[0].map((name,index)=>`${index}=${name}`).join("，")}。不要删除首条观测。`);
    rows=rows.slice(1).map(row=>row.slice(1));
  }
  const header=rows[0];let data=rows.slice(1), originalRows=data.map((_r,i)=>i+2);
  let selection_scope:string|undefined;
  for(const column of [input.label_column??0,input.value_column??0,...(input.paired_column===undefined?[]:[input.paired_column])])if(!Number.isInteger(column)||column<0||column>=header.length)throw new Error("列号必须是表头中的零起始整数索引");
  if(input.group_columns || input.group_values || input.time_order){
    if(input.operation!=="trend")throw new ResearchToolError("trend_transform","parameter","分组与时间排序目前仅支持 trend","其他操作使用完整明确口径的来源表，不自动筛选数据。");
    if(input.group_columns){
      if(!input.group_columns.length || new Set(input.group_columns).size!==input.group_columns.length || input.group_columns.some(c=>!Number.isInteger(c)||c<0||c>=header.length||c===(input.label_column??0)||c===(input.value_column??0)))throw new ResearchToolError("group_columns","parameter","分组列须有效、唯一，且不同于时间列和数值列","从 read_evidence 的列号提示选择国家/实体及必要分层维度。");
      if(!input.group_values || input.group_values.length!==input.group_columns.length)throw new Error("分组计算需由服务器展开所有实际分组");
      const indices=data.map((_r,i)=>i).filter(i=>input.group_columns!.every((c,j)=>data[i][c]===input.group_values![j]));
      if(!indices.length)throw new Error("分组在原始数据中不存在");
      data=indices.map(i=>data[i]);originalRows=indices.map(i=>originalRows[i]);
      selection_scope=`分组 ${JSON.stringify(input.group_columns.map((c,i)=>[header[c],input.group_values![i]]))}`;
    }else if(input.group_values)throw new Error("group_values 缺少对应分组列");
    if(input.time_order){
      const index=input.label_column??0;
      const ordered=data.map((row,i)=>({row,original:originalRows[i]})).sort((a,b)=>a.row[index].localeCompare(b.row[index]));
      data=ordered.map(item=>item.row);originalRows=ordered.map(item=>item.original);
    }
  }
  const valueColumn=input.value_column??0,labelColumn=input.label_column??0;
  for(const column of [valueColumn,labelColumn,...(input.paired_column===undefined?[]:[input.paired_column])])if(!Number.isInteger(column)||column<0||column>=header.length)throw new Error("列号必须是表头中的零起始整数索引");
  if(header.some(value=>!value)||new Set(header).size!==header.length)throw new Error("表头必须非空且唯一，不能猜测缺失列含义");
  const labels=data.map(row=>row[labelColumn]);if(labels.some(label=>!label))throw new Error("对象标签不能为空");
  const categorical=["count","distinct_count","distribution_count"].includes(input.operation);
  const values=categorical?undefined:data.map(row=>number(row[valueColumn]));
  if(input.operation==="trend") {
    const times=labels.map(label=>{ if(!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(label)||label.length!==labels[0].length)return NaN; const full=label.length===4?`${label}-01-01`:label.length===7?`${label}-01`:label, time=Date.parse(`${full}T00:00:00Z`); return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===full?time:NaN; });
    if(times.some((time,index)=>!Number.isFinite(time)||(index>0&&time<=times[index-1])))throw new ResearchToolError("trend_time_order","parameter","趋势时间列必须为严格递增且唯一的 YYYY、YYYY-MM 或 YYYY-MM-DD","降序数据显式设 time_order=ascending；不同实体显式用 group_columns 分组。组内重复时间必须补全分层维度或说明数据问题，不能删除行、平均合并或填补缺失年份。");
  }
  if(input.operation==="pearson"&&(input.paired_column===undefined||input.paired_column===valueColumn))throw new Error("相关计算必须指定第二个数值列");
  if(input.operation==="rank"&&input.direction&&!['ascending','descending'].includes(input.direction))throw new Error("未知排名方向");
  const request: SourceCalculation={...(input.group_columns?{group_columns:input.group_columns,group_values:input.group_values}:{}),...(input.time_order?{time_order:input.time_order}:{}),...(input.first_row_header ? {first_row_header:true} : {}),operation:input.operation,...(input.unit===undefined?{}:{unit:input.unit}),source_id:input.source_id,block_id:input.block_id,value_column:valueColumn,label_column:labelColumn,...(input.paired_column===undefined?{}:{paired_column:input.paired_column}),...(input.focus===undefined?{}:{focus:input.focus}),...(input.ties===undefined?{}:{ties:input.ties}),...(input.direction===undefined?{}:{direction:input.direction}),...(input.iqr_multiplier===undefined?{}:{iqr_multiplier:input.iqr_multiplier}),...(input.bins===undefined?{}:{bins:input.bins})};
  const result=statistic({...request,values,labels,paired_values:input.paired_column===undefined?undefined:data.map(row=>number(row[input.paired_column!]))});
  if(selection_scope || input.time_order)Object.assign(result.details,{selection_scope:selection_scope ?? "完整来源表",original_rows:originalRows,time_order:input.time_order ?? "source_order",observations_retained:data.length});
  const baseUnit=input.unit?.trim()||"未提供";
  const unit=["proportion","change_percent"].includes(input.operation)?"%":input.operation==="rank"?"名":input.operation==="distinct_count"?"类":input.operation==="count"||input.operation==="histogram"||input.operation==="distribution_count"?"条":input.operation==="pearson"?"r":input.operation==="trend"?"趋势":input.operation==="difference"&&baseUnit==="%"?"百分点":baseUnit;
  const seriesUnit=input.operation==="proportion"?"%":["histogram","distribution_count"].includes(input.operation)?"条":result.series.length?baseUnit:"无";
  const body={...(selection_scope?{selection_scope}:{}),unit,series_unit:seriesUnit,version:"source-calculation-v1",source_digest:source.digest,request,measure:categorical?"记录数":input.operation==="pearson"?`${header[valueColumn]} × ${header[input.paired_column!]}`:header[valueColumn],breakdown:header[labelColumn],result};
  return {id:`calc-${hash(body)}`,...body};
}
export async function saveGroupedCalculations(p:Project,source:EvidenceSource,input:SourceCalculation) {
  if(!input.group_columns?.length)return [await saveCalculation(p,source,input)];
  if(input.operation!=="trend" || input.group_values)throw new ResearchToolError("grouped_trend","parameter","分组调用仅支持 trend，分组值由服务器枚举","只提供 group_columns、时间列和数值列，不填写 group_values 或模型标签。");
  const block=source.blocks.find(b=>b.id===input.block_id);if(!block)throw new Error("计算证据块不存在或已失效");
  let rows=table(block.text,["原始上传文本","原始数据文本"].includes(block.section)?source.raw_format==="csv"?",":source.raw_format==="tsv"?"\t":undefined:undefined);
  if(input.first_row_header){if(rows[0][0]!=="原始行")throw new ResearchToolError("table_header_mode","parameter","当前表已有正式表头","删除 first_row_header 或设为 false。");rows=rows.slice(1).map(row=>row.slice(1));}
  if(input.group_columns.some(c=>!Number.isInteger(c)||c<0||c>=rows[0].length))throw new Error("分组列号无效");
  const groups=new Map<string,string[]>();
  for(const row of rows.slice(1)){const values=input.group_columns.map(c=>row[c]);if(values.some(v=>!v))throw new Error("分组字段缺失，不能自动丢弃观测");groups.set(JSON.stringify(values),values);}
  if(groups.size>100)throw new Error("分组超过 100 项，请使用更明确的来源切片");
  // Validate every group first; a bad group must not leave a misleading partial batch.
  const receipts=[...groups.values()].map(group_values=>buildCalculation(source,{...input,group_values}));
  for(const receipt of receipts)await atomic(path.join(projectDir(p.id),`state/calculations/${receipt.id}.json`),JSON.stringify(receipt));
  return receipts;
}
export async function saveCalculation(p: Project, source: EvidenceSource, input: SourceCalculation) {
  const receipt=buildCalculation(source,input);
  await atomic(path.join(projectDir(p.id),`state/calculations/${receipt.id}.json`),JSON.stringify(receipt));
  return receipt;
}
export function calculationMarkdown(receipt: CalculationReceipt, full = false) {
  const r=receipt.result;
  const cell=(value: unknown)=>String(value).replaceAll("|","\\|").replace(/\r?\n/g," ");
  if (!full) return `# 可复算来源计算\n\n${JSON.stringify({ calculation_id: receipt.id, source_id: receipt.request.source_id, block_id: receipt.request.block_id, operation: receipt.request.operation, value: r.value, unit: receipt.unit, method: r.method, scope: receipt.selection_scope ?? receipt.request.block_id, series_count: r.series.length, path: `state/calculations/${receipt.id}.json` })}\n\n完整序列和口径已保存。用 save_computed_facts 引用 calculation_id 保存叙述，由服务器填充原值、完整序列和证据；需要核查明细时用 read_calculation 分页读取，不必重复计算。\n`;
  return `# 可复算来源计算\n\n| 字段 | 内容 |\n| --- | --- |\n| 计算记录编号 | ${receipt.id} |\n| 依据方式 | computed |\n| 分布类别 | ${receipt.request.operation==="histogram"?"numeric":["distribution","distribution_count"].includes(receipt.request.operation)?"categorical":"none"} |\n| 来源编号 | ${receipt.request.source_id} |\n| 证据块 | ${receipt.request.block_id} |\n| 内容范围 | ${receipt.selection_scope ? `${receipt.request.block_id}；${receipt.selection_scope}；保留组内全部观测` : `完整证据块 ${receipt.request.block_id}，不自动过滤或删除行`} |\n| 度量字段 | ${cell(receipt.measure)} |\n| 分组字段 | ${cell(receipt.breakdown)} |\n| 关注对象 | ${cell(r.focus)} |\n| 聚合方法 | ${r.aggregation} |\n| 方法 | ${cell(r.method)} |\n| 数值 | ${r.value} |\n| 单位 | ${cell(receipt.unit)} |\n| 序列单位 | ${cell(receipt.series_unit)} |\n\n## 数值序列\n\n${r.series.length?'| 标签 | 数值 |\n| --- | --- |\n'+r.series.map(item=>`| ${cell(item.label)} | ${item.value} |`).join('\n'):'无'}\n\n## 计算说明\n\n${Object.entries(r.details).map(([key,value])=>`- ${key}：${cell(Array.isArray(value)?value.join("、"):value)}`).join('\n')}\n\n以上结果直接来自原始证据块。先核实完整比较范围与单位；占比分母是证据块全部数值的和，排名覆盖全部行。不要把子集排名称为全国排名。\n`;
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
  if(fresh.selection_scope && !spec.scope.includes(fresh.selection_scope))throw new Error("分组事实必须保留计算返回的分组范围，不能将子集称为总体");
  if(!spec.scope.includes(fresh.request.block_id)||spec.measure!==fresh.measure||spec.breakdown!==fresh.breakdown||spec.focus!==fresh.result.focus||spec.method!==fresh.result.method||spec.aggregation!==fresh.result.aggregation || spec.series_unit!==fresh.series_unit || fact.unit!==fresh.unit)throw new Error("统计口径必须保留计算返回的证据块范围、字段、关注对象、方法与聚合方式");
  const expectedDistribution=fact.type==="distribution"?(fresh.request.operation==="histogram"?"numeric":"categorical"):"none";
  if(spec.distribution_kind!==expectedDistribution)throw new Error("分布类别与计算方式不一致");
  if(fact.series.length!==fresh.result.series.length||fact.series.some((item,index)=>item.label!==fresh.result.series[index].label||!close(item.value,fresh.result.series[index].value)))throw new Error("事实数值序列必须与计算返回的序列一致，不得删除或改写观测值");
}

export { table as sourceTable, number as sourceNumber };
