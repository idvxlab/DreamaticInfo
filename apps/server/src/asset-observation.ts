import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { atomic, safePath } from './store.js';
import { hash } from './validation.js';
import type { AssetResult } from './asset-service.js';
import type { Design } from '../../../packages/shared/types.js';
import type { ReviewIssue } from './visual-review.js';
export async function observeAsset(root: string, result: AssetResult) {
  const { data_url, ...metadata } = result;
  await atomic(path.join(root, `state/assets/${hash(result.id)}.json`), JSON.stringify({ ...metadata, updated_at: new Date().toISOString() }));
}
export async function assetObservations(root: string) {
  const files = await readdir(path.join(root, 'state/assets')).catch((e: NodeJS.ErrnoException) => { if(e.code === 'ENOENT') return []; throw e; });
  return Promise.all(files.filter(file => /^[a-f0-9]{64}\.json$/.test(file)).map(async file => JSON.parse(await readFile(await safePath(root, `state/assets/${file}`), 'utf8')) as Omit<AssetResult, 'data_url'>));
}
export async function acceptAssets(root: string, design: Design, status: string, issues: ReviewIssue[]) {
  for (const observed of await assetObservations(root)) {
    const asset = design.assets.find(item => item.id === observed.id);
    if (!asset) continue;
    const components = design.components.filter(c => c.asset_ids.includes(asset.id)).map(c => c.id);
    const unsuitable = issues.some(issue => issue.owner === 'designer' && (issue.component === '整体' || issue.component === asset.id || components.includes(issue.component)));
    const visual_acceptance = observed.status === 'fallback' ? 'fallback' : status === 'unsupported' ? 'pending' : unsuitable ? 'unsuitable' : status === 'passed' ? 'accepted' : 'pending';
    await observeAsset(root, { ...observed, visual_acceptance });
  }
}
