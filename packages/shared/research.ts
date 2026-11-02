/** Protocol empty markers are not executable search queries. */
export function missingSearchQuery(query: string) {
  return /^(?:无|未提供|待补充|待确定|none|null|n\/a|-|—)?$/i.test(query.trim().replace(/^`+|`+$/g, '').trim());
}

export const researchFeedbackLabels:Record<string,string> = {parameter:'参数待修正',prerequisite:'前置条件未满足',unavailable:'接口不可用',interrupted:'执行已中断',internal:'内部错误'};
