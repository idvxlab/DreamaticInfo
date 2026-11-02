import { readSvg } from "./visual-resource.js";
import { observeAsset } from "./asset-observation.js";
import { inspectImage } from "./image-inspection.js";
import { load } from "cheerio";
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import type { Design } from '../../../packages/shared/types.js';
import { atomic, safePath } from './store.js';
import { hash } from './validation.js';
export interface AssetResult { id: string; version: string; status: 'ready' | 'fallback'; resource_path?: string; resource_contract?: string; technical?: Awaited<ReturnType<typeof inspectImage>> | { width: number; height: number; bytes: number; svg: true }; visual_acceptance?: 'pending' | 'accepted' | 'unsuitable' | 'fallback'; lifecycle?: string[]; data_url?: string; fallback?: string; error?: string }
/** Per-build queue: a single job per official commission; no independent retries. */
export class AssetService {
  private jobs = new Map<string, Promise<AssetResult>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private root: string, private assets: Design['assets'], private configuration: unknown, private signal: AbortSignal, private generate: (asset: Design['assets'][number], signal: AbortSignal) => Promise<{ data: string; mimeType: string }>, private concurrency = 2) {}
  start() { for (const asset of this.assets.filter(item => item.implementation === 'generated_image' && item.commission.semantics !== 'data')) { const job = this.get(asset.id); void job.catch(() => {}); } }
  get(id: string): Promise<AssetResult> {
    const asset = this.assets.find(a => a.id === id);
    if (!asset) return Promise.reject(new Error('未知正式素材'));
    if (asset.implementation !== 'generated_image' || asset.commission.semantics === 'data') return Promise.reject(new Error(`素材 ${id} 的实现方式为 ${asset.implementation}，不得进入图像生成队列`));
    let job = this.jobs.get(id);
    if (!job) { job = this.run(asset); this.jobs.set(id, job); void job.catch(() => {}); }
    return job;
  }
  /** Binary image transport stays internal; models receive placement instructions only. */
  async describe(id: string) {
    const { data_url, ...metadata } = await this.get(id);
    return { ...metadata, embedding: 'For a ready asset use <img data-asset-id="' + id + '" alt="...">. save_html/patch_html embeds the official image automatically. For fallback implement the commission substitute with data-asset-status="fallback".' };
  }
  async materialize(html: string) {
    const results = await this.settle(), $ = load(html);
    for (const result of results) {
      if (result.status !== 'ready') continue;
      for (const el of $('img[data-asset-id]')) {
        if ($(el).attr('data-asset-id') === result.id) {
          $(el).attr('src', result.data_url!);
          $(el).removeAttr('data-asset-status');
        }
      }
    }
    for (const asset of this.assets.filter(item => item.implementation === 'svg')) {
      const file = `state/assets/${hash(asset.id)}.json`;
      let saved: AssetResult;
      try { saved = JSON.parse(await readFile(await safePath(this.root, file), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (!saved.resource_path || saved.resource_contract !== hash({ asset, composition: (this.configuration as { direction?: unknown }).direction })) continue;
      const svg = await readSvg(this.root, saved.resource_path);
      for (const element of $('[data-asset-id]').toArray().filter(el => $(el).attr('data-asset-id') === asset.id)) {
        const vector = load(svg, { xml: true }); vector('svg').attr('data-asset-id', asset.id).attr('data-asset-version', saved.version);
        for (const [name, value] of Object.entries($(element).attr() ?? {})) {
          if (['id', 'class', 'style', 'role'].includes(name) || /^(data-|aria-)/.test(name) && name !== 'data-asset-version') vector('svg').attr(name, value);
        }
        $(element).replaceWith(vector.xml());
      }
    }
    return $.html();
  }
  private async run(asset: Design['assets'][number]): Promise<AssetResult> {
    this.signal.throwIfAborted();
    const version = hash({ contract: 'asset-2', asset, configuration: this.configuration });
    const file = path.join(this.root, 'assets', `${version}.json`);
    try {
      const result: AssetResult = JSON.parse(await readFile(await safePath(this.root, `assets/${version}.json`), 'utf8'));
      if (result.id === asset.id && result.version === version && ((result.status === 'ready' && result.data_url?.startsWith('data:image/')) || (result.status === 'fallback' && result.fallback === asset.commission.fallback))) { const reopened: AssetResult = { ...result, visual_acceptance: result.status === "fallback" ? "fallback" : "pending" }; await observeAsset(this.root, reopened); return reopened; }
    } catch {}
    if (this.active >= this.concurrency) await new Promise<void>((resolve, reject) => {
      const resume = () => { this.signal.removeEventListener('abort', abort); resolve(); };
      const abort = () => { const index = this.waiting.indexOf(resume); if (index >= 0) this.waiting.splice(index, 1); reject(this.signal.reason); };
      this.waiting.push(resume); this.signal.addEventListener('abort', abort, { once: true });
      if (this.signal.aborted) abort();
    });
    this.signal.throwIfAborted(); this.active++;
    try {
      await observeAsset(this.root, { id: asset.id, version, status: "ready", lifecycle: ["generating"], visual_acceptance: "pending" });
      const image = await this.generate(asset, this.signal);
      this.signal.throwIfAborted();
      await observeAsset(this.root, { id: asset.id, version, status: "ready", lifecycle: ["generating", "generated"], visual_acceptance: "pending" });
      const technical = await inspectImage(image, asset, this.signal);
      const result: AssetResult = { id: asset.id, version, technical, visual_acceptance: 'pending', lifecycle: ['generating', 'generated', 'technical_checked'], status: 'ready', data_url: `data:${image.mimeType};base64,${image.data}` };
      await mkdir(path.dirname(file), { recursive: true }); await atomic(file, JSON.stringify(result));
      await observeAsset(this.root, result);
      return result;
    } catch (error) {
      this.signal.throwIfAborted();
      const result: AssetResult = { id: asset.id, version, status: 'fallback', visual_acceptance: 'fallback', lifecycle: ['generating', 'fallback'], fallback: asset.commission.fallback, error: error instanceof Error ? error.message : String(error) };
      await atomic(file, JSON.stringify(result));
      await observeAsset(this.root, result);
      return result;
    } finally { this.active--; this.waiting.shift()?.(); }
  }
  async validate(html: string) {
    const results = await this.settle(), $ = load(html);
    for (const result of results) {
      const elements = $('[data-asset-id]').toArray().filter(el => $(el).attr('data-asset-id') === result.id);
      if (!elements.length) throw new Error(`缺少素材或替代元素 ${result.id}`);
      if (result.status === 'ready' && !elements.some(el => $.html(el).includes(result.data_url!))) throw new Error(`素材 ${result.id} 未嵌入正式生成版本：请使用 img 元素并设置 data-asset-id="${result.id}" 和 alt，服务器会在 save_html/patch_html 时嵌入图片；不要复制 Base64 或用占位图替代正式素材`);
      if (result.status === 'fallback' && !elements.some(el => $(el).attr('data-asset-status') === 'fallback')) throw new Error(`素材 ${result.id} 失败，必须实现正式替代并标记 data-asset-status=fallback：${result.fallback}`);
    }
    for (const asset of this.assets.filter(item => item.implementation === 'svg')) {
      const saved: AssetResult = JSON.parse(await readFile(await safePath(this.root, `state/assets/${hash(asset.id)}.json`), 'utf8'));
      if (saved.resource_contract !== hash({ asset, composition: (this.configuration as { direction?: unknown }).direction })) throw new Error(`SVG contract changed: ${asset.id}; save a new version`);
      if (!$('svg[data-asset-id]').toArray().some(el => $(el).attr('data-asset-id') === asset.id && $(el).attr('data-asset-version') === saved.version)) throw new Error(`Missing registered SVG version ${asset.id}`);
    }
    return results;
  }
  async settle() { return Promise.all(this.assets.filter(asset => asset.implementation === 'generated_image' && asset.commission.semantics !== 'data').map(asset => this.get(asset.id))); }

}
