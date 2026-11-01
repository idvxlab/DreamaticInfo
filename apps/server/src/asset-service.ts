import { load } from "cheerio";
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import type { Design } from '../../../packages/shared/types.js';
import { atomic, safePath } from './store.js';
import { hash } from './validation.js';
export interface AssetResult { id: string; version: string; status: 'ready' | 'fallback'; data_url?: string; fallback?: string; error?: string }
/** Per-build queue: a single job per official commission; no independent retries. */
export class AssetService {
  private jobs = new Map<string, Promise<AssetResult>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private root: string, private assets: Design['assets'], private configuration: unknown, private signal: AbortSignal, private generate: (asset: Design['assets'][number], signal: AbortSignal) => Promise<{ data: string; mimeType: string }>, private concurrency = 2) {}
  start() { for (const asset of this.assets) { const job = this.get(asset.id); void job.catch(() => {}); } }
  get(id: string): Promise<AssetResult> {
    const asset = this.assets.find(a => a.id === id);
    if (!asset) return Promise.reject(new Error('未知正式素材'));
    let job = this.jobs.get(id);
    if (!job) { job = this.run(asset); this.jobs.set(id, job); void job.catch(() => {}); }
    return job;
  }
  private async run(asset: Design['assets'][number]): Promise<AssetResult> {
    this.signal.throwIfAborted();
    const version = hash({ contract: 'asset-1', asset, configuration: this.configuration });
    const file = path.join(this.root, 'assets', `${version}.json`);
    try {
      const result: AssetResult = JSON.parse(await readFile(await safePath(this.root, `assets/${version}.json`), 'utf8'));
      if (result.id === asset.id && result.version === version && ((result.status === 'ready' && result.data_url?.startsWith('data:image/')) || (result.status === 'fallback' && result.fallback === asset.commission.fallback))) return result;
    } catch {}
    if (this.active >= this.concurrency) await new Promise<void>((resolve, reject) => {
      const resume = () => { this.signal.removeEventListener('abort', abort); resolve(); };
      const abort = () => { const index = this.waiting.indexOf(resume); if (index >= 0) this.waiting.splice(index, 1); reject(this.signal.reason); };
      this.waiting.push(resume); this.signal.addEventListener('abort', abort, { once: true });
      if (this.signal.aborted) abort();
    });
    this.signal.throwIfAborted(); this.active++;
    try {
      const image = await this.generate(asset, this.signal);
      this.signal.throwIfAborted();
      const result: AssetResult = { id: asset.id, version, status: 'ready', data_url: `data:${image.mimeType};base64,${image.data}` };
      await mkdir(path.dirname(file), { recursive: true }); await atomic(file, JSON.stringify(result));
      return result;
    } catch (error) {
      this.signal.throwIfAborted();
      const result: AssetResult = { id: asset.id, version, status: 'fallback', fallback: asset.commission.fallback, error: error instanceof Error ? error.message : String(error) };
      await atomic(file, JSON.stringify(result));
      return result;
    } finally { this.active--; this.waiting.shift()?.(); }
  }
  async validate(html: string) {
    const results = await this.settle(), $ = load(html);
    for (const result of results) {
      const elements = $('[data-asset-id]').toArray().filter(el => $(el).attr('data-asset-id') === result.id);
      if (!elements.length) throw new Error(`缺少素材或替代元素 ${result.id}`);
      if (result.status === 'ready' && !elements.some(el => $.html(el).includes(result.data_url!))) throw new Error(`素材 ${result.id} 未嵌入正式生成版本`);
      if (result.status === 'fallback' && !elements.some(el => $(el).attr('data-asset-status') === 'fallback')) throw new Error(`素材 ${result.id} 失败，必须实现正式替代并标记 data-asset-status=fallback：${result.fallback}`);
    }
    return results;
  }
  async settle() { return Promise.all(this.assets.map(asset => this.get(asset.id))); }

}
