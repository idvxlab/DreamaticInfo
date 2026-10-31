export const operations = ["sum", "mean", "median", "min", "max", "count", "distinct_count", "difference", "change_percent", "trend", "proportion", "rank", "extreme_max", "extreme_min", "outlier_iqr", "pearson", "distribution", "distribution_count", "histogram"] as const;
export type Operation = typeof operations[number];
export interface StatisticInput { operation: Operation; values?: number[]; labels?: string[]; paired_values?: number[]; focus?: string; ties?: "competition" | "dense"; direction?: "ascending" | "descending"; iqr_multiplier?: number; bins?: number[]; }
export interface StatisticResult { value: number | string; series: {label: string; value: number}[]; focus: string; method: string; aggregation: string; details: Record<string, unknown>; }
const finite = (value: number) => { if (!Number.isFinite(value)) throw new Error("计算结果超出有限数值范围"); return value; };
export function quantile(values: number[], probability: number) { const sorted = [...values].sort((a,b)=>a-b), index=(sorted.length-1)*probability, lower=Math.floor(index), fraction=index-lower; return finite(sorted[lower]*(1-fraction)+sorted[Math.ceil(index)]*fraction); }
export function statistic(input: StatisticInput): StatisticResult {
  const {operation}=input, values=input.values??[], labels=input.labels??values.map((_v,i)=>String(i+1));
  if (!operations.includes(operation)) throw new Error("未知计算操作");
  if (values.some(v=>!Number.isFinite(v)) || (!values.length && !labels.length)) throw new Error("需要非空的有限原始数据");
  if (values.length && labels.length!==values.length) throw new Error("标签与数值长度不一致");
  const n=values.length||labels.length;
  if (!["count","distinct_count","distribution_count"].includes(operation) && !values.length) throw new Error("该操作需要数值列");
  let value: number | string=0, series: StatisticResult["series"]=[], focus="全部行", method=operation as string, aggregation="none", details: Record<string,unknown>={sample_size:n};
  const sum=()=>finite(values.reduce((total,v)=>total+v,0));
  const atFocus=()=>{if (!input.focus || labels.filter(label=>label===input.focus).length!==1) throw new Error("关注对象必须在比较集合中唯一出现"); return labels.indexOf(input.focus);};
  if (["sum","mean","median","min","max","count"].includes(operation)) {
    aggregation=operation;
    value=operation==="count"?n:operation==="sum"?sum():operation==="mean"?finite(values.reduce((a,v)=>a+v/n,0)):operation==="median"?quantile(values,.5):values.reduce((a,v)=>operation==="min"?Math.min(a,v):Math.max(a,v));
    if (operation==="median") method="median(type7)";
  } else if(operation==="distinct_count") { const categories=[...new Set(labels)]; value=categories.length; focus=categories.join("、"); aggregation="distinct_count"; details.categories=categories; }
  else if(operation==="trend") {
    if(values.length<2)throw new Error("趋势至少需要两个有序时间点");
    const deltas=values.slice(1).map((v,i)=>v-values[i]);
    value=deltas.every(d=>d===0)?"constant":deltas.every(d=>d>=0)?"increasing":deltas.every(d=>d<=0)?"decreasing":"mixed";
    focus="全部时间点";method="ordered_adjacent_comparison";series=values.map((v,i)=>({label:labels[i],value:v}));details.direction=value;
  }
  else if(operation==="difference" || operation==="change_percent") {
    if(values.length<2 || (operation==="difference"&&values.length!==2)) throw new Error("差值需要恰好两项，变化率需要至少两项有序数据");
    if(operation==="change_percent" && values[0]===0) throw new Error("基期为零，变化率不可计算");
    value=operation==="difference"?finite(values[1]-values[0]):finite((values.at(-1)!-values[0])/Math.abs(values[0])*100);
    focus=`${labels[0]} → ${labels.at(-1)}`; series=values.map((v,i)=>({label:labels[i],value:v})); method=operation==="difference"?"last-first":"(last-first)/abs(first)*100";
  } else if(operation==="proportion") {
    if(values.some(v=>v<0) || sum()<=0) throw new Error("占比要求非负部分和大于零的总体");
    const index=atFocus(), denominator=sum(); focus=input.focus!; value=finite(values[index]/denominator*100); series=values.map((v,i)=>({label:labels[i],value:finite(v/denominator*100)})); method="part/sum(all_rows)*100"; aggregation="sum"; details={...details,numerator:values[index],denominator};
  } else if(operation==="rank") {
    if(new Set(labels).size!==labels.length) throw new Error("排名对象必须唯一，请先提供已聚合且同口径的数据");
    const index=atFocus(), ascending=input.direction==="ascending", ties=input.ties??"competition";
    if(!["competition","dense"].includes(ties))throw new Error("未知并列规则");
    const ordered=values.map((v,i)=>({label:labels[i],value:v})).sort((a,b)=>(ascending?a.value-b.value:b.value-a.value)||a.label.localeCompare(b.label));
    const higher=values.filter(v=>ascending?v<values[index]:v>values[index]); value=(ties==="dense"?new Set(higher).size:higher.length)+1; focus=input.focus!; series=ordered; method=`rank(${ascending?"ascending":"descending"},${ties})`; details.ties=ties;
  } else if(operation==="extreme_max" || operation==="extreme_min") {
    value=values.reduce((a,v)=>operation==="extreme_max"?Math.max(a,v):Math.min(a,v)); const targets=labels.filter((_v,i)=>values[i]===value); focus=targets.join("、"); aggregation=operation==="extreme_max"?"max":"min"; method=aggregation; series=values.map((v,i)=>({label:labels[i],value:v})); details.targets=targets;
  } else if(operation==="outlier_iqr") {
    if(n<4)throw new Error("IQR 异常检测至少需要四个观测值");
    const k=input.iqr_multiplier??1.5; if(!Number.isFinite(k)||k<=0)throw new Error("IQR 倍数必须为正数");
    const q1=quantile(values,.25),q3=quantile(values,.75),iqr=finite(q3-q1),lower=finite(q1-k*iqr),upper=finite(q3+k*iqr),index=atFocus();
    if(values[index]>=lower&&values[index]<=upper)throw new Error("指定对象不是该方法识别的异常点，不得生成异常事实");
    value=values[index]; focus=input.focus!; method=`IQR(type7,k=${k})`; series=values.map((v,i)=>({label:labels[i],value:v})); details={...details,q1,q3,lower,upper,score:iqr?finite(Math.max(lower-value,value-upper)/iqr):null, distance:finite(Math.max(lower-value,value-upper)), score_note:iqr?"distance/IQR":"IQR 为零，不提供归一化异常分数"};
  } else if(operation==="pearson") {
    const y=input.paired_values??[]; if(n<3||y.length!==n||y.some(v=>!Number.isFinite(v)))throw new Error("相关计算需要至少三组成对、完整的有限观测值");
    const scaleX=values.reduce((a,v)=>Math.max(a,Math.abs(v)),0)||1,scaleY=y.reduce((a,v)=>Math.max(a,Math.abs(v)),0)||1,x=values.map(v=>v/scaleX),ys=y.map(v=>v/scaleY),mx=x.reduce((a,v)=>a+v/n,0),my=ys.reduce((a,v)=>a+v/n,0);
    let xx=0,yy=0,xy=0; for(let i=0;i<n;i++){xx+=(x[i]-mx)**2;yy+=(ys[i]-my)**2;xy+=(x[i]-mx)*(ys[i]-my);}
    if(!xx||!yy)throw new Error("常数列无法计算 Pearson 相关系数");value=Math.max(-1,Math.min(1,finite(xy/Math.sqrt(xx*yy))));method="Pearson r";details.paired_sample_size=n;
  } else if(operation==="distribution" || operation==="distribution_count") {
    const counting=operation==="distribution_count",groups=new Map<string,number>(); labels.forEach((label,i)=>groups.set(label,finite((groups.get(label)??0)+(counting?1:values[i]))));series=[...groups].map(([label,value])=>({label,value}));value=counting?n:sum(); aggregation=counting?"count":"sum"; method=counting?"group_count":"group_sum";
  } else if(operation==="histogram") {
    const bins=input.bins??[];if(bins.length<2||bins.some((v,i)=>!Number.isFinite(v)||(i>0&&v<=bins[i-1])))throw new Error("分箱边界必须是严格递增的有限数值");
    if(values.some(v=>v<bins[0]||v>bins.at(-1)!))throw new Error("分箱必须覆盖全部观测值，不能丢弃范围外数据");
    series=bins.slice(1).map((end,i)=>({label:`[${bins[i]},${end}${i===bins.length-2?"]":")"}`,value:0}));
    values.forEach(v=>{const index=v===bins.at(-1)?series.length-1:bins.findIndex((edge,i)=>i<bins.length-1&&v>=edge&&v<bins[i+1]);series[index].value++;});value=n;aggregation="count";method=`histogram(left_closed,last_closed;${bins.join(",")})`; details.bins=bins;
  }
  if(typeof value==="number")finite(value);series.forEach(item=>finite(item.value));return {value,series,focus,method,aggregation,details};
}
