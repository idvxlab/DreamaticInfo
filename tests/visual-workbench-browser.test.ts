import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { browserOptions } from '../apps/server/src/browser.js';
test('visual workflow editor retains selection, focus and text across polling on desktop/mobile', {timeout:30000}, async()=>{
  const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},appType:'custom'});
  server.middlewares.use((req,res,next)=>{if(req.url!=='/'){next();return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/visual-workflow-preview.tsx"></script></body></html>');});
  await server.listen();
  const address=server.httpServer!.address() as {port:number};
  const browser=await chromium.launch({headless:true,...await browserOptions()});
  try{
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/`);
    assert.equal(await page.getByText('System font').count(),0);
    assert.equal(await page.getByText('Historical diagnostic reason',{exact:false}).isVisible(),false);
    await page.getByText('修改作品',{exact:true}).click();const editor=page.locator('textarea');await editor.fill('Preserve this local crop repair');await editor.focus();
    await editor.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(9,13));
    for(let i=0;i<4;i++)await page.locator('[data-refresh]').evaluate((el:HTMLElement)=>el.click());
    assert.equal(await editor.inputValue(),'Preserve this local crop repair');
    assert.deepEqual(await editor.evaluate((el:HTMLTextAreaElement)=>({focused:document.activeElement===el,start:el.selectionStart,end:el.selectionEnd})),{focused:true,start:9,end:13});
    await page.setViewportSize({width:390,height:844});assert.equal(await editor.inputValue(),'Preserve this local crop repair');assert.ok(await page.getByRole('button',{name:'重新设计',exact:true}).isEnabled());
    await page.getByText('诊断详情',{exact:true}).click();assert.equal(await page.getByText('Historical diagnostic reason',{exact:false}).isVisible(),true);
    assert.equal(await page.getByText('System font').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  }finally{await browser.close();await server.close();}
});
