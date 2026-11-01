import SupportingPanel from "./SupportingPanel";
import type { Design } from '../../../packages/shared/types';

export default function CompositionPlan({ design }: { design: Design }) {
  const plan = design.composition;
  if (!plan) return null;
  const tasks = { statistical: '统计概览', comparison: '比较排名', temporal: '时间演进', process: '流程决策', hierarchy: '构成层级', spatial: '空间地理', relationships: '关系流动', explanation: '原理结构解释', guide: '清单知识指南' };
  const reading = { guided: '作者引导', exploratory: '读者探索', hybrid: '引导与探索结合' };
  const media = { poster: '静态海报', responsive: '响应式页面', interactive: '交互页面', scrollytelling: '滚动叙事' };
  return <SupportingPanel title="整体设计" summary={<><span>{tasks[plan.task]}</span><span>{reading[plan.reading]}</span><span>{media[plan.medium]}</span></>}><dl className="supporting-panel-fields">{[
    ['选型依据', plan.selection_basis], ['内容与传播', plan.communication], ['艺术方向', plan.art_direction], ['构图关系', plan.layout_rules], ['安全区域', plan.safe_regions], ['媒介适配', plan.responsive_rules], ['打印方案', plan.print_rules], ['验收要求', plan.acceptance],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></SupportingPanel>;
}
