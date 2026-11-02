import { useState } from 'react';
import type { ProjectDetail, Role } from '../../../packages/shared/types';
const roleNames: Record<Role, string> = { chatbot: '需求确认', researcher: '资料采集', analyst: '事实分析', designer: '设计方案', builder: '作品制作' };
const origins: Record<string, string> = { user: '用户要求', reference: '参考材料', brand: '品牌规范' };
export function VisualWorkflow({ project, operate }: { project: ProjectDetail; operate: (mode: 'repair' | 'redesign', reason: string, owner: Role) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [owner, setOwner] = useState<Role>('builder');
  const sample = project.state.stages.designer?.status === 'completed' ? project.state.visual_sample : undefined;
  const builder = project.state.stages.builder;
  const review = builder?.status === 'completed' && project.state.visual_review?.revision === builder.version ? project.state.visual_review : undefined;
  const invalidation = project.state.invalidation;
  const remaining = invalidation?.affected.filter(role => project.state.stages[role]?.status !== 'completed') ?? [];
  const constraints = project.intent?.visual_constraints?.filter(item => item.origin !== 'default') ?? [];
  const current = project.state.current_stage;
  const status = project.state.status === 'running' ? `${current ? roleNames[current] : '任务'}进行中` : project.state.status === 'failed' ? '任务遇到问题' : project.state.status === 'interrupted' ? '任务已暂停，可继续执行' : project.state.status === 'completed' ? '作品已生成' : '等待执行';
  const issues = review?.status === 'needs_revision' ? review.issues : !project.has_html && sample?.status === 'issues' ? sample.issues : [];
  const disabled = busy || project.state.status === 'running' || project.state.stages.analyst?.status !== 'completed';
  async function run(mode: 'repair' | 'redesign') {
    setBusy(true); setError('');
    try { await operate(mode, reason, owner); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }
  return <section className="work-progress" aria-label="作品进展">
    <div className="work-progress-heading"><strong>{status}</strong>{project.has_html && <span>{review?.status === 'needs_revision' ? '仍有待修问题' : review?.status === 'passed' ? '视觉检查通过' : review?.status === 'unsupported' ? '视觉评审未执行' : '可查看预览'}</span>}</div>
    {!project.has_html && sample && <p><a href={`/api/projects/${project.id}/sample`} target="_blank" rel="noreferrer">查看实际样稿</a> · {sample.status === 'passed' ? '样稿检查通过，等待完整作品' : sample.status === 'unsupported' ? '视觉评审未执行' : '样稿需要修订'}</p>}
    {!!issues.length && <div aria-label="待处理问题"><strong>待处理问题</strong><ul>{issues.map(issue => <li key={issue.id}>{issue.message}</li>)}</ul></div>}
    <details className="dw-advanced"><summary>修改作品</summary>
      {project.state.stages.analyst?.status !== 'completed' && <p>事实分析完成后可提出局部修改或重新设计。</p>}
      <label>修改要求<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="描述希望调整的内容或效果" /></label>
      <details><summary>高级选项：修复环节</summary><label>修复环节<select value={owner} onChange={event => setOwner(event.target.value as Role)}>{Object.entries(roleNames).map(([role,name]) => <option key={role} value={role}>{name}</option>)}</select></label></details>
      <div><button disabled={disabled || !reason.trim()} onClick={() => void run('repair')}>局部修复</button> <button disabled={disabled || !reason.trim()} onClick={() => void run('redesign')}>重新设计</button></div>
      {error && <p role="alert">{error}</p>}
    </details>
    {!!constraints.length && <details className="dw-advanced"><summary>需求详情</summary><ul>{constraints.map((item,index) => <li key={index}><strong>{origins[item.origin]}</strong>：{item.requirement}（{item.basis}）</li>)}</ul></details>}
    <details className="dw-advanced"><summary>诊断详情</summary>
      {invalidation && <div><p>{remaining.length ? '更新记录：部分阶段仍待重新完成' : '历史更新记录：受影响阶段已重新完成'} · {invalidation.at}</p><p>记录原因：{invalidation.reason}</p><p>当时影响：{invalidation.affected.map(role => roleNames[role]).join(' → ')}。历史版本保留。</p>{!!remaining.length && <p>仍待更新：{remaining.map(role => roleNames[role]).join('、')}</p>}</div>}
      {project.execution && <p>最近执行记录：{project.execution.mode === 'continue' ? '运行／继续' : project.execution.mode === 'repair' ? '局部修复' : '重新设计'} · {project.execution.reason}</p>}
      {sample && <p>样稿版本：{sample.version} · 检查 {sample.checks}/2 次 · 正式版本：{project.state.stages.builder?.version ?? '尚未生成'}</p>}
      {project.sample_comparison && <p>与样稿相比：已完成区域 {project.sample_comparison.completed_regions.join('、') || '无'}；代码变化组件 {project.sample_comparison.changed_components.join('、') || '无'}。代码差异不代表艺术质量改善。</p>}
      {project.state.execution_budget && <p>执行计数：模型 {project.state.execution_budget.model ?? 0} · 工具 {project.state.execution_budget.tool ?? 0} · 素材 {project.state.execution_budget.asset ?? 0} · 返修 {project.state.execution_budget.repair ?? 0}。SDK 已报告费用估算 ${project.state.execution_budget.reported_cost_usd?.toFixed(4) ?? '0'}，不代表服务账单。</p>}
      {project.asset_observations?.map(asset => <p key={asset.id}>{asset.id} · {asset.lifecycle?.at(-1)} · {asset.visual_acceptance ?? 'pending'} {asset.technical && `· ${asset.technical.width}×${asset.technical.height} · ${asset.technical.bytes} 字节`} {asset.error}</p>)}
      <p>技术检查不等于艺术验收。并发任务耗时不可相加作为端到端耗时。</p>
    </details>
  </section>;
}
