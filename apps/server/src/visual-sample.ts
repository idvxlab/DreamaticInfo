import { readFile } from 'node:fs/promises';
import { validateHtml } from "./validation.js";
import path from 'node:path';
import { load } from 'cheerio';
import { atomic, safePath } from './store.js';
import { hash } from './validation.js';
import { inspectDelivery, requireUsableDelivery } from './delivery-quality.js';
import type { ReviewIssue } from './visual-review.js';
import type { Design } from '../../../packages/shared/types.js';

export class ConceptRevision extends Error {
  constructor(readonly issues: ReviewIssue[]) { super('Visual sample requires formal Designer revision'); }
}
export function validateSample(html: string, design: Design, completed: string[]) {
  validateHtml(html);
  const $ = load(html);
  const ids = new Set(completed);
  if (completed.some(id => !design.components.some(c => c.id === id))) throw new Error('Unknown completed sample component');
  if (!design.components.some(c => ids.has(c.id) && c.type === 'heading') || !design.components.some(c => ids.has(c.id) && c.fact_ids.length)) throw new Error('Sample must implement the hero heading and a representative information region');
  for (const component of design.components) {
    if (ids.has(component.id)) {
      for (const fact of component.fact_ids) if (!$('[data-fact-id]').toArray().some(el => ($(el).attr('data-fact-id') ?? '').split(/\s+/).includes(fact))) throw new Error(`Sample is missing real fact ${fact}`);
    } else if (!$('[data-unimplemented]').toArray().some(el => $(el).attr('data-unimplemented') === component.id && $(el).text().trim())) throw new Error(`Mark unimplemented region ${component.id} explicitly`);
  }
}
export async function persistSample(root: string, scope: string, html: string, width: number, signal: AbortSignal, attempt: number) {
  const report = await inspectDelivery(html, width, signal); requireUsableDelivery(report);
  const version = hash({ scope, html, attempt });
  const base = path.join(root, 'state/samples', version);
  await atomic(path.join(base, 'index.html'), html);
  for (const screenshot of report.screenshots) await atomic(path.join(base, `${screenshot.media}.png`), Buffer.from(screenshot.data, 'base64'));
  await atomic(path.join(base, 'diagnostics.json'), JSON.stringify({ reports: report.reports, errors: report.errors }));
  return version;
}

export async function readSample(root: string, sample: { version: string; scope: string; checks: number }) {
  if (!/^[a-f0-9]{64}$/.test(sample.version)) throw new Error('Invalid sample version');
  const html = await readFile(await safePath(root, `state/samples/${sample.version}/index.html`), 'utf8');
  if (hash({ scope: sample.scope, html, attempt: sample.checks }) !== sample.version) throw new Error('Saved sample digest mismatch');
  return html;
}
export async function sampleComparison(root: string, sample: { version: string; scope: string; checks: number } | undefined, final: string | undefined) {
  if (!sample || !final) return undefined;
  const before = load(await readSample(root, sample)), after = load(final);
  const changed = after('[data-component-id]').toArray().filter(el => {
    const id = after(el).attr('data-component-id');
    const old = before('[data-component-id]').toArray().find(prior => before(prior).attr('data-component-id') === id);
    return !old || before.html(old) !== after.html(el);
  }).map(el => after(el).attr('data-component-id')!);
  return { sample_version: sample.version, changed_components: [...new Set(changed)], completed_regions: before('[data-unimplemented]').toArray().map(el => before(el).attr('data-unimplemented')!).filter(id => after('[data-component-id]').toArray().some(el => after(el).attr('data-component-id') === id)) };
}
