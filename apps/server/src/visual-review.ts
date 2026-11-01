import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { Design, Models, Project, Role } from '../../../packages/shared/types.js';
import { runtime, type RunContext } from './pi.js';
import { setting } from './config-store.js';
import { inspectDelivery } from './delivery-quality.js';
import { atomic, projectDir } from './store.js';
import path from 'node:path';
export interface ReviewIssue { id: string; owner: Role; component: string; message: string }
export type Reviewer = (p: Project, html: string, design: Design, models: Models, signal: AbortSignal, context?: Pick<RunContext, 'metric' | 'consume'>) => Promise<{ status: 'passed' | 'issues' | 'unsupported'; markdown: string; issues: ReviewIssue[] }>;
export function parseReview(markdown: string, design: Design): ReviewIssue[] {
  if (markdown.trim() === '无问题') return [];
  const rows = markdown.split('\n').filter(l => l.trim().startsWith('|')).slice(2);
  if (!rows.length) throw new Error('复核需使用问题表，或单独填写无问题');
  const issues = rows.map(line => {
    const cells = line.trim().split('|').slice(1, -1).map(x => x.trim());
    if (cells.length !== 4) throw new Error('复核表必须为编号、归属、组件、问题四列');
    const [id, owner, component, message] = cells;
    if (!id || !message || !['researcher','analyst','designer','builder'].includes(owner) || (component !== '整体' && !design.components.some(c => c.id === component))) throw new Error('复核问题编号、归属或组件无效');
    return { id, owner: owner as Role, component, message };
  });
  if (new Set(issues.map(i => i.id)).size !== issues.length) throw new Error('复核问题编号重复');
  return issues;
}
/** A second task for the existing Designer role, not a sixth agent or model config. */
export const reviewDelivery: Reviewer = async (p, html, design, models, signal, context = {}) => {
  const rt = await runtime(), config = models.designer;
  const model = rt.getModel(setting("DREAMATIC_API_KEY_DESIGNER") && !config.provider.startsWith("dreamatic-info-") ? "dreamatic-info-designer" : config.provider, config.model);
  if (!model?.input.includes('image')) return { status: 'unsupported', markdown: 'Designer 模型未声明图像输入能力，未执行视觉复核。', issues: [] };
  const rendered = await inspectDelivery(html, design.page.width, signal);
  let markdown: string | undefined;
  const loader = new DefaultResourceLoader({ cwd: projectDir(p.id), agentDir: path.join(projectDir(p.id), "state/pi"), noExtensions: true, noContextFiles: true, noSkills: true, systemPrompt: '你是 Designer，负责依据正式设计进行一次视觉复核。检查主次、阅读路径、图文关联、风格、背景、装饰密度、留白和设计还原。只报告明确问题，程序检查不证明审美质量。实现问题归 builder，构图/素材方向归 designer，事实归 analyst，资料归 researcher。不得重新创作或泛泛要求更多装饰。' });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: projectDir(p.id), agentDir: path.join(projectDir(p.id), "state/pi"), modelRuntime: rt, model, thinkingLevel: config.thinkingLevel, resourceLoader: loader, settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }), sessionManager: SessionManager.inMemory(), tools: ['submit_review'], customTools: [{ name: 'submit_review', label: '提交视觉复核', description: '提交 Markdown 问题表：编号 | 归属 | 组件 | 问题。无问题时仅写无问题。', parameters: Type.Object({ markdown: Type.String() }), execute: async (_id, args) => { context.consume?.("tool"); const input = args as { markdown: string }; parseReview(input.markdown, design); markdown = input.markdown; return { content: [{ type: 'text', text: '复核已记录' }], details: {} }; } }] });
  const abort = () => { void session.abort(); }; signal.addEventListener('abort', abort, { once: true });
  let modelStarted = performance.now();
  const unsub = session.subscribe(event => {
    if (event.type === 'turn_start') { modelStarted = performance.now(); try { context.consume?.('model'); } catch { void session.abort(); } }
    if (event.type === 'message_end' && event.message.role === 'assistant') context.metric?.('model_call', { task: 'visual_review', duration_ms: performance.now() - modelStarted, usage: event.message.usage, context_characters: JSON.stringify(session.messages).length });
    if (markdown && event.type === 'tool_execution_end') void session.abort(); });
  try {
    signal.throwIfAborted();
    await session.prompt(`正式设计：${JSON.stringify(design)}\n截图顺序：${rendered.screenshots.map(s => s.media).join(', ')}。按正式组件编号定位问题。`, { images: rendered.screenshots.map(s => ({ type: 'image', mimeType: 'image/png', data: s.data })) });
    signal.throwIfAborted(); if (!markdown) throw new Error('视觉复核未提交明确结果');
    const issues = parseReview(markdown, design);
    await atomic(path.join(projectDir(p.id), 'state/visual-review.md'), markdown);
    return { status: issues.length ? 'issues' : 'passed', markdown, issues };
  } finally { unsub(); signal.removeEventListener('abort', abort); session.dispose(); }
};
