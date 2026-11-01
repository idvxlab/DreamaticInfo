export const factTypes = ["value", "comparison", "trend", "distribution", "correlation", "proportion", "categorization", "rank", "extreme", "outlier", "timeline", "process", "hierarchy", "scatter"] as const;
export const factBases = ["quoted", "computed", "inferred", "forecast"] as const;
export const factTypeLabels = new Map<string, string>([["timeline", "时间线"], ["process", "流程"], ["hierarchy", "层级"], ["scatter", "散点"], ["value", "关键数值"], ["comparison", "对比"], ["trend", "趋势"], ["distribution", "分布"], ["correlation", "相关"], ["proportion", "占比"], ["categorization", "分类"], ["rank", "排名"], ["extreme", "极值"], ["outlier", "异常"]]);
export const factBasisLabels = new Map<string, string>([["quoted", "原文引用"], ["computed", "确定性计算"], ["inferred", "推断"], ["forecast", "预测"]]);
