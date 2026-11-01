import { checkRender } from './render-check.js';
import { hash } from './validation.js';

export type RenderReport = Awaited<ReturnType<typeof checkRender>>;
/** Keep binary screenshots out of model text; visual review consumes them separately. */
export function renderDiagnostics(report: RenderReport) {
  return { errors: report.errors, reports: report.reports, limitations: report.limitations };
}
/** Content-addressed, bounded observations only. Failed/aborted work is never cached. */
const reports = new Map<string, RenderReport>();
export async function inspectDelivery(html: string, width: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const key = hash({ contract: 'delivery-check-1', html, width });
  const cached = reports.get(key);
  if (cached) return cached;
  const report = await checkRender(html, width, signal, true);
  signal?.throwIfAborted();
  reports.set(key, report);
  if (reports.size > 16) reports.delete(reports.keys().next().value!);
  return report;
}
export function requireUsableDelivery(report: RenderReport) {
  const failures = [
    ...report.errors,
    ...report.reports.flatMap(item => [
      ...(item.broken_images ? [`${item.media}: ${item.broken_images} 个图片损坏`] : []),
      ...(item.horizontal_overflow ? [`${item.media}: 页面水平溢出`] : []),
      ...(item.clipped_text.length ? [`${item.media}: 文本裁切 ${item.clipped_text.join(', ')}`] : []),
    ]),
  ];
  if (failures.length) throw new Error(`交付检查未通过，请局部修复：\n${failures.join('\n')}`);
}
