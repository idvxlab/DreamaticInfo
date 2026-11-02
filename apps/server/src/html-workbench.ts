import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomic } from './store.js';
import { hash, HtmlValidationError } from './validation.js';
import { authoredHtml, patchHtml } from './builder-html.js';

interface HtmlDraft { revision: string; html: string; issues: string[]; digest: string; context?: { completed_components: string[] }; }
/** Invalid drafts are repair input only; acceptance and formal delivery stay separate. */
export class HtmlWorkbench {
  private queue: Promise<unknown> = Promise.resolve();
  private bestIssues = Infinity;
  constructor(private root: string, readonly scope: string, private kind: "delivery" | "sample" = "delivery") {}
  private get directory() { return path.join(this.root, 'state/drafts/builder', this.scope); }
  private async current(): Promise<HtmlDraft | undefined> {
    let revision: string;
    try { revision = JSON.parse(await readFile(path.join(this.directory, 'current.json'), 'utf8')).revision; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    if (!/^[a-f0-9-]{36}$/.test(revision)) throw new Error('Invalid HTML draft revision');
    const draft = JSON.parse(await readFile(path.join(this.directory, revision, 'draft.json'), 'utf8')) as HtmlDraft;
    if (draft.revision !== revision || draft.digest !== hash(draft.html)) throw new Error('HTML draft digest mismatch');
    return draft;
  }
  async snapshot() { return this.current(); }
  async read() {
    const draft = await this.current();
    return draft ? `${this.describe(draft)}\n\n${draft.html}` : '尚无 HTML 修复草稿；先 save_html 提供完整 HTML，不能对不存在的底稿调用 patch_html。';
  }
  private describe(draft: HtmlDraft) {
    if (this.kind === "sample") return `样稿修复版本：${draft.revision}\n已完成组件：${draft.context?.completed_components.join(", ") ?? "未记录"}\n样稿检查：${draft.issues.length ? draft.issues.join('\n') : '通过'}\n样稿已保存。用 read_visual_sample_draft 读取、patch_visual_sample 局部修复并重新检查；未完成区域是样稿占位，不要改用正式 save_html。`;
    return `HTML 草稿版本：${draft.revision}\n组件与事实覆盖及资源检查：${draft.issues.length ? draft.issues.join('\n') : '通过'}\n草稿已保存，可用 read_html_draft 读取和 patch_html 局部修复。只有校验通过的 HTML 才能 check_render 和正式提交；这不是 Markdown 格式问题。`;
  }
  stage(html: string | undefined, replacements: { old_text: string; new_text: string }[] | undefined, validate: (html: string) => Promise<string>, fallback?: () => Promise<string>, context?: { completed_components: string[] }) {
    const operation = this.queue.then(async () => {
      const prior = await this.current();
      if (prior) this.bestIssues = Math.min(this.bestIssues, prior.issues.length);
      if (replacements) {
        let base = prior?.html;
        if (base === undefined && fallback) {
          try { base = await fallback(); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
        if (base === undefined) throw new Error('没有可修改的 HTML 底稿；先 save_html 提供完整 HTML。调用 read_html_draft 检查状态，不要重复 patch_html。');
        html = patchHtml(base, replacements);
      }
      if (typeof html !== 'string' || !html.trim() || html.length > 15_000_000) throw new Error('HTML 为空或超过 15MB；修复后用 save_html 保存。');
      // Keep packaged runtime/image bytes out of repair context; save restores them.
      if (/data-dreamatic-runtime|<img\b[^>]*data-asset-id/i.test(html)) html = authoredHtml(html);
      const draftContext = context ?? prior?.context;
      const persist = async (issues: string[]) => {
        const draft: HtmlDraft = { revision: randomUUID(), html: html!, issues, digest: hash(html), context: draftContext };
        await atomic(path.join(this.directory, draft.revision, 'draft.json'), JSON.stringify(draft));
        await atomic(path.join(this.directory, 'current.json'), JSON.stringify({ revision: draft.revision }));
        return draft;
      };
      // Preserve sample input before rendering, provider review or cancellation.
      if (this.kind === 'sample') await persist(['等待样稿检查；未通过，不可正式提交']);
      let accepted: string | undefined, issues: string[] = [];
      try { accepted = await validate(html); }
      catch (error) {
        if (!(error instanceof HtmlValidationError)) throw error;
        issues = error.issues;
      }
      const draft = await persist(issues);
      const progress = issues.length < this.bestIssues;
      this.bestIssues = Math.min(this.bestIssues, issues.length);
      return { accepted, issues, progress, report: this.describe(draft) };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
