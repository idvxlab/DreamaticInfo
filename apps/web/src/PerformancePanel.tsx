import type { ProjectDetail } from '../../../packages/shared/types';
import SupportingPanel from './SupportingPanel';

const seconds = (value: number) => `${(value / 1000).toFixed(1)} 秒`;
const categories: Record<string, string> = { model_call: '模型调用', asset_generation: '素材生成', delivery_check: '交付检查', visual_review: '视觉复核', pdf_export: 'PDF 导出', run: '运行', stage_attempt: '阶段尝试' };
const roles: Record<string, string> = { chatbot: '需求理解', researcher: '资料调研', analyst: '事实分析', designer: '设计', builder: '作品实现' };
const waiting: Record<string, string> = { waiting_for_information: '等待补充信息', interrupted: '中断后等待', failed: '失败后等待' };
function durationLabel(key: string) {
  if (key.startsWith('stage:')) return `${roles[key.slice(6)] ?? key.slice(6)}阶段`;
  if (key.startsWith('tool:')) return `工具 ${key.slice(5)}`;
  return categories[key] ?? key;
}
export default function PerformancePanel({ performance: data }: { performance: NonNullable<ProjectDetail['performance']> }) {
  return <SupportingPanel title="执行观测" summary={<><span>总等待 <b>{seconds(data.wall_ms)}</b></span><span>模型 <b>{data.model_calls} 次</b></span><span>返修 <b>{data.repairs} 次</b></span></>}>
    <dl className="supporting-panel-milestones">
      <div><dt>首次预览</dt><dd>{data.first_preview_ms === undefined ? '尚无' : seconds(data.first_preview_ms)}</dd></div>
      <div><dt>最终交付</dt><dd>{data.delivery_ms === undefined ? '尚无' : seconds(data.delivery_ms)}</dd></div>
    </dl>
    <p className="supporting-panel-note">各项耗时可能重叠，不能相加作为总等待时间。</p>
    <dl className="supporting-panel-fields supporting-panel-durations">
      {Object.entries(data.durations_ms).map(([key, value]) => <div key={`duration:${key}`}><dt>{durationLabel(key)}</dt><dd>{seconds(value)}</dd></div>)}
      {Object.entries(data.waiting_ms).map(([key, value]) => <div key={`waiting:${key}`}><dt>{waiting[key] ?? key}</dt><dd>{seconds(value)}</dd></div>)}
    </dl>
  </SupportingPanel>;
}
