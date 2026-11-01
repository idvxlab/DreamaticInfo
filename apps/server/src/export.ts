import { RunMetrics } from "./run-metrics.js";
import { browserOptions } from "./browser.js";
export { browserOptions } from "./browser.js";
import { setting } from "./config-store.js";
import { chromium } from "playwright";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { atomic, exists, projectDir, readArtifact } from "./store.js";
import type { Project } from "../../../packages/shared/types.js";
export const previewCsp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';";
export async function exportPdf(
  p: Project,
  driver: Pick<typeof chromium, "launch"> = chromium,
) {
  const artifact = await readArtifact(p, "builder");
  if (!artifact) throw new Error("请先完成信息图");
  const design = (await readArtifact(p, "designer"))?.data;
  const timeout = Number(setting("DREAMATIC_PDF_TIMEOUT_MS")),
    started = Date.now();
  const metrics = new RunMetrics(projectDir(p.id));
  const endPdf = metrics.span("pdf_export", { builder_version: p.state.stages.builder.version });
  const remaining = () => Math.max(1, timeout - (Date.now() - started));
  let timedOut = false;
  const browser = await driver.launch({
    headless: true,
    timeout: remaining(),
    ...(await browserOptions()),
  });
  const deadline = setTimeout(() => {
    timedOut = true;
    void browser.close();
  }, remaining());
  try {
    const context = await browser.newContext({
      viewport: { width: design.page.width, height: 900 },
      javaScriptEnabled: true,
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(remaining());
    const html = artifact.data.html.replace(
      /<head[^>]*>/i,
      (match: string) =>
        `${match}<meta http-equiv="Content-Security-Policy" content="${previewCsp}"><style>*,*::before,*::after{animation:none!important;transition:none!important}</style>`,
    );
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((img) => img.decode().catch(() => {})),
      );
    });
    const buf = await page.pdf({
      width: `${design.page.width}px`,
      height: `${design.page.height}px`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    if (buf.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("PDF validation failed");
    const target = path.join(projectDir(p.id), "output/poster.pdf");
    await atomic(
      target + ".meta.json",
      JSON.stringify({
        created_at: new Date().toISOString(),
        builder_version: p.state.stages.builder.version,
      }),
    );
    const { writeFile, rename } = await import("node:fs/promises");
    await writeFile(target + ".tmp", buf);
    await rename(target + ".tmp", target);
    endPdf();
    return target;
  } catch (error) {
    endPdf("error");
    if (timedOut || Date.now() - started >= timeout)
      throw new Error(`PDF 导出超过配置的总时限（${timeout} 毫秒）`);
    throw error;
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await metrics.flush();
  }
}
