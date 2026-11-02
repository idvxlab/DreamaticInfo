import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { load } from 'cheerio';
import type { Design, Models, Project, Role } from '../../../packages/shared/types.js';
import { runtime, type RunContext } from './pi.js';
import { setting } from './config-store.js';
import { inspectDelivery } from './delivery-quality.js';
import { atomic, projectDir } from './store.js';
import path from 'node:path';
export interface ReviewIssue { category?: "concept" | "asset" | "implementation" | "data"; id: string; owner: Role; component: string; message: string }
export type Reviewer = (p: Project, html: string, design: Design, models: Models, signal: AbortSignal, context?: Pick<RunContext, 'metric' | 'consume'> & { milestone?: "sample"; previousIssues?: ReviewIssue[]; history?: ReviewRound[] }) => Promise<{ status: 'passed' | 'issues' | 'unsupported'; markdown: string; issues: ReviewIssue[] }>;
export interface ReviewRound { design_revision?: string; revision: string; issues: ReviewIssue[]; resolved: string[]; status?: "passed" | "issues" | "unsupported" }
export function parseReview(markdown: string, design: Design): ReviewIssue[] {
  if (markdown.trim() === '无问题') return [];
  const table = markdown.split('\n').filter(l => l.trim().startsWith('|'));
  if (!/^\|\s*编号\s*\|\s*归属\s*\|\s*组件\s*\|\s*问题\s*\|\s*$/.test(table[0]?.trim() ?? '')) throw new Error('复核表缺少四列表头');
  const rows = table.slice(1).filter(line => !/^\|(?:\s*:?-+:?\s*\|){4}\s*$/.test(line.trim()));
  if (!rows.length) throw new Error('复核需使用问题表，或单独填写无问题');
  const issues = rows.map(line => {
    const cells = line.trim().split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim().replaceAll('\\|', '|'));
    if (cells.length !== 4) throw new Error('复核表必须为编号、归属、组件、问题四列');
    const [id, owner, component, message] = cells;
    if (!id || !message || !['researcher','analyst','designer','builder'].includes(owner) || (component !== '整体' && !design.components.some(c => c.id === component) && !design.assets.some(a => a.id === component))) throw new Error('复核问题编号、归属或组件无效');
    const target = design.assets.some(a => a.id === component) ? design.components.find(c => c.asset_ids.includes(component))?.id ?? '整体' : component;
    return { id, owner: owner as Role, component: target, message, category: owner === "builder" ? "implementation" : owner !== "designer" ? "data" : design.assets.some(a => a.id === component) ? "asset" : "concept" } as ReviewIssue;
  });
  if (new Set(issues.map(i => i.id)).size !== issues.length) throw new Error('复核问题编号重复');
  return issues;
}
/** Every previous issue must be explicitly retained or closed by the visual reviewer. */
export function parseReviewOutcome(markdown: string, design: Design, previous: ReviewIssue[] = [], history: ReviewRound[] = []) {
  if ((markdown.match(/^## 已解决\s*$/gm) ?? []).length > 1) throw new Error("已解决章节重复");
  const section = /^## 已解决\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(markdown);
  const resolved = section ? section[1].trim().split('\n').filter(Boolean).map(line => {
    if (!/^- [^\s]+$/.test(line)) throw new Error('已解决章节只接受 - 问题编号');
    return line.slice(2);
  }) : [];
  if (new Set(resolved).size !== resolved.length) throw new Error('已解决问题编号重复');
  const body = section ? markdown.replace(section[0], '').trim() : markdown;
  const issues = parseReview(body.replace(/^## 待修问题\s*$/m, '').trim(), design);
  for (const id of resolved) if (!previous.some(issue => issue.id === id) || issues.some(issue => issue.id === id)) throw new Error('关闭的问题必须来自上一轮，且不能同时待修');
  for (const issue of previous) if (!resolved.includes(issue.id) && !issues.some(item => item.id === issue.id)) throw new Error(`上一轮问题 ${issue.id} 未核销：保留原编号或在已解决章节明确关闭`);
  const closed = new Set(history.flatMap(round => round.resolved));
  for (const issue of issues) if (closed.has(issue.id)) throw new Error('已关闭编号不能复用；回归问题请使用新编号并说明关联');
  return { issues, resolved };
}

/** Bounded, binary-free evidence helps distinguish missing assets from poor presentation. */
export function assetPresentation(html: string) {
  const $ = load(html);
  return $('img[data-asset-id]').toArray().slice(0, 16).map(el => {
    const node = $(el), src = node.attr('src') ?? '';
    let dimensions: { width: number; height: number } | undefined;
    if (src.startsWith('data:image/png;base64,')) {
      const header = Buffer.from(src.slice(22, 86), 'base64');
      if (header.length >= 24 && header.toString('ascii', 1, 4) === 'PNG') dimensions = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
    }
    const classes = (node.attr('class') ?? '').split(/\s+/).filter(Boolean);
    const styles = $('style').text().split('}').filter(rule => classes.some(name => rule.includes('.' + name))).slice(0, 8).map(rule => rule.slice(0, 500) + '}');
    return { asset: node.attr('data-asset-id'), embedded: src.startsWith('data:image/'), dimensions, inline_style: node.attr('style')?.slice(0, 500), class_rules: styles };
  });
}
/** A second task for the existing Designer role, not a sixth agent or model config. */
export const reviewDelivery: Reviewer = async (p, html, design, models, signal, context = {}) => {
  const rt = await runtime(), config = models.designer;
  const model = rt.getModel(setting("DREAMATIC_API_KEY_DESIGNER") && !config.provider.startsWith("dreamatic-info-") ? "dreamatic-info-designer" : config.provider, config.model);
  if (!model?.input.includes('image')) return { status: 'unsupported', markdown: 'Designer 模型未声明图像输入能力，未执行视觉复核。', issues: [] };
  const rendered = await inspectDelivery(html, design.page.width, signal);
  const $ = load(html);
  const sourceImages = $('img[data-asset-id]').toArray().map(el => ({ id: $(el).attr('data-asset-id'), src: $(el).attr('src') ?? '' })).filter(item => /^data:image\/(png|jpeg|webp);base64,/.test(item.src)).slice(0, 4);
  let markdown: string | undefined;
  const loader = new DefaultResourceLoader({ cwd: projectDir(p.id), agentDir: path.join(projectDir(p.id), "state/pi"), noExtensions: true, noContextFiles: true, noSkills: true, systemPrompt: 'You are Designer performing one visual review of both design adequacy and implementation fidelity. Inspect the actual screenshots against the official core message, information hierarchy, primary visual, typography, background treatment, decoration rules and visual acceptance. A faithfully implemented but generic or weak composition is a designer-owned problem: identify concrete regions, the observed hierarchy/subject-expression failure, its reading impact and a bounded repair goal. Missing or incorrectly implemented planned treatments belong to builder. Facts belong to analyst; source problems to researcher. Check focal dominance, reading path, association, rhythm/whitespace, type roles and wrapping, material/icon consistency, background interference, crops/layers, asset fallbacks, mobile and print. Do not approve merely because all charts and numbers are present. Do not require arbitrary images, extra decoration or a fixed style; typography-only and repeated containers may be justified. Do not invent factual links or redesign unrelated regions. Use the required four-column Markdown issue table with official component IDs or 整体. Each issue must state observation, impact and repair target. When no concrete issue remains, submit 无问题. Structural checks do not establish aesthetic quality.' });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: projectDir(p.id), agentDir: path.join(projectDir(p.id), "state/pi"), modelRuntime: rt, model, thinkingLevel: config.thinkingLevel, resourceLoader: loader, settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }), sessionManager: SessionManager.inMemory(), tools: ['submit_review'], customTools: [{ name: 'submit_review', label: '提交视觉复核', description: '提交 Markdown 问题表：编号 | 归属 | 组件 | 问题。无问题时仅写无问题。', parameters: Type.Object({ markdown: Type.String() }), execute: async (_id, args) => { context.consume?.("tool"); const input = args as { markdown: string }; parseReviewOutcome(input.markdown, design, context.previousIssues, context.history); markdown = input.markdown; return { content: [{ type: 'text', text: '复核已记录' }], details: {} }; } }] });
  const abort = () => { void session.abort(); }; signal.addEventListener('abort', abort, { once: true });
  let modelStarted = performance.now();
  const unsub = session.subscribe(event => {
    if (event.type === 'turn_start') { modelStarted = performance.now(); try { context.consume?.('model'); } catch { void session.abort(); } }
    if (event.type === 'message_end' && event.message.role === 'assistant') context.metric?.('model_call', { task: 'visual_review', duration_ms: performance.now() - modelStarted, usage: event.message.usage, context_characters: JSON.stringify(session.messages).length });
    if (markdown && event.type === 'tool_execution_end') void session.abort(); });
  try {
    signal.throwIfAborted();
    await session.prompt(`Milestone: ${context.milestone ?? "final"}. For a sample, evaluate concept, theme specificity, whole-page weights, type/material coherence, hero and representative region. Explicitly unimplemented regions are expected; do not demand full delivery at this milestone. Reject mechanical equal-weight facts when unsupported by content rationale. Source asset images follow the three media screenshots in this order: ${JSON.stringify(sourceImages.map(item => item.id))}. Compare source content/crop with its rendered visibility before assigning asset quality to Designer or implementation opacity/crop to Builder. Previous open issues: ${JSON.stringify(context.previousIssues ?? [])}. Review history: ${JSON.stringify(context.history ?? [])}. Asset presentation facts: ${JSON.stringify(assetPresentation(html))}. First reconcile every previous issue: retain its ID if unresolved; list closed IDs under ## 已解决 using one - ID per line; omit this section when no IDs are closed. Put the remaining four-column table under ## 待修问题, or 无问题. Use fresh IDs for new issues, never renumber old issues. On repair rounds focus on the assigned fixes and regressions; do not expand optional styling demands. Identify genuinely new blockers explicitly. Distinguish image presence from visibility: a present but unsuitable generated asset is designer-owned, while opacity/crop/layout errors are builder-owned. Screenshots show ticks, not proof of the numerical scale domain; do not infer axis bounds from the last visible tick. Review both composition quality and faithful execution, including visible fallback elements. Official design: ${JSON.stringify(design)}\n截图顺序：${rendered.screenshots.map(s => s.media).join(', ')}。按正式组件编号定位问题。`, { images: [...rendered.screenshots.map(s => ({ type: 'image' as const, mimeType: 'image/png', data: s.data })), ...sourceImages.map(item => ({ type: 'image' as const, mimeType: item.src.slice(5, item.src.indexOf(';')), data: item.src.slice(item.src.indexOf(',') + 1) }))] });
    signal.throwIfAborted(); if (!markdown) throw new Error('视觉复核未提交明确结果');
    const { issues } = parseReviewOutcome(markdown, design, context.previousIssues, context.history);
    await atomic(path.join(projectDir(p.id), 'state/visual-review.md'), markdown);
    return { status: issues.length ? 'issues' : 'passed', markdown, issues };
  } finally { unsub(); signal.removeEventListener('abort', abort); session.dispose(); }
};
