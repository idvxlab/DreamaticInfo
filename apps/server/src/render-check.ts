import { chromium } from 'playwright';
import { browserOptions } from './browser.js';
import { previewCsp } from './export.js';

/** One isolated browser, three media checks. Geometry findings are diagnostics,
 * never proof of aesthetic quality or reasons to reject intentional layering. */
export async function checkRender(html: string, width: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const browser = await chromium.launch({ headless: true, timeout: 30_000, ...await browserOptions() });
  const abort = () => { void browser.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, 45_000);
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message.slice(0, 500)));
    const reports = [];
    for (const media of ['desktop', 'mobile', 'print'] as const) {
      signal?.throwIfAborted();
      await page.setViewportSize({ width: media === 'mobile' ? 390 : width, height: 900 });
      await page.emulateMedia({ media: media === 'print' ? 'print' : 'screen', reducedMotion: 'reduce' });
      await page.setContent(html.replace(/<head[^>]*>/i, match => `${match}<meta http-equiv="Content-Security-Policy" content="${previewCsp}">`), { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))); });
      reports.push({ media, ...await page.evaluate(() => {
        const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-component-id],p,h1,h2,h3,svg,text')).filter(el => el.getClientRects().length);
        return {
          horizontal_overflow: document.documentElement.scrollWidth > innerWidth + 1,
          broken_images: Array.from(document.images).filter(image => !image.complete || image.naturalWidth === 0).length,
          clipped_text: visible.filter(el => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden').map(el => el.dataset.componentId || el.tagName).slice(0, 50),
          outside_viewport: visible.filter(el => { const box = el.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1; }).map(el => el.dataset.componentId || el.tagName).slice(0, 50),
        };
      }) });
    }
    return { errors, reports, limitations: ['几何诊断需人工判别；未检查审美、全部遮挡和对比度。打印媒体检查不等于 PDF 内容一致性验证。'] };
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
    await browser.close();
  }
}
