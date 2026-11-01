import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { OfficeParser } from 'officeparser';
import { infographicCases } from './fixtures/infographic-cases.js';
import { inspectDelivery, requireUsableDelivery } from '../apps/server/src/delivery-quality.js';
import { browserOptions, previewCsp } from '../apps/server/src/export.js';
test('three infographic media fixtures render offline at desktop/mobile/print and retain essential text in PDF', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'info-three-cases-'));
 const browser = await chromium.launch({ headless: true, ...await browserOptions() });
 try {
  const context = await browser.newContext(); let requests = 0;
  await context.route('**/*', route => { requests++; return route.abort(); });
  const page = await context.newPage();
  for (const fixture of infographicCases) {
   const report = await inspectDelivery(fixture.html, 1000); requireUsableDelivery(report);
   assert.equal(report.reports.length,3); assert.equal(report.screenshots.length,3);
   await page.setContent(fixture.html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${previewCsp}">`));
   await page.emulateMedia({ media:'print', reducedMotion:'reduce' });
   const essential = await page.locator('h1').innerText();
   const buffer = await page.pdf({ printBackground:true, preferCSSPageSize:true });
   const file = path.join(root, fixture.id+'.pdf'); await writeFile(file,buffer);
   const parsed = await OfficeParser.parseOffice(file,{ocr:false});
   const text = String((await parsed.to('text')).value);
   assert.ok(text.includes(essential), `${fixture.id}: missing heading`); assert.match(text,/synthetic regression fixture/);
  }
  assert.equal(requests,0);
 } finally { await browser.close(); await rm(root,{recursive:true,force:true}); }
});
