/** Opt-in live verification. Synthetic source material stays under tests/. Never run in npm test. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { runtime, getModels } from '../apps/server/src/pi.js';
import { setting } from '../apps/server/src/config-store.js';
import { parseDocument, documentInstructions } from '../apps/server/src/markdown-protocol.js';
import { inspectImage } from '../apps/server/src/image-inspection.js';
const out = path.resolve('workspace/verification', new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true});
const models = await getModels(), rt = await runtime();
const results: unknown[] = [];
const task = 'Design an offline public-facing explanation of a fictional community reading programme. Explicitly label every observation synthetic test data. Same facts for both runs: 2021: 120 people; 2022: 165; 2023: 210; 2024: 294. F1 total 2024=294 people; F2 change 2021→2024=145 percent; F3 temporal series with the four observations. Source TEST-CSV tests/fixtures/reading.csv (synthetic). Audience general public, responsive desktop/mobile and print. Explain growth and its limitations. No causal claims. Choose a content-specific visual concept, one main focal region and deliberate hierarchy; any CSS/SVG/image decision is allowed. Font system-ui. Budget one proposal, maximum four model turns, no revisions. Use exact template and submit_design. This harness evaluates proposal adherence, not rendered artistic acceptance.';
for (const variant of ['baseline','current']) {
  const started=performance.now();
  let markdown: string|undefined, turns=0;
  const usage: unknown[]=[];
  try {
    const prompt = await readFile(variant==='baseline' ? 'tests/fixtures/baseline-designer.md' : 'agents/designer.md','utf8');
    const config=models.designer;
    const model=rt.getModel(setting('DREAMATIC_API_KEY_DESIGNER')&&!config.provider.startsWith('dreamatic-info-')?'dreamatic-info-designer':config.provider,config.model)!;
    const loader=new DefaultResourceLoader({cwd:out,agentDir:path.join(out,variant),noExtensions:true,noContextFiles:true,noSkills:true,systemPrompt:prompt});await loader.reload();
    const {session}=await createAgentSession({cwd:out,agentDir:path.join(out,variant),modelRuntime:rt,model,thinkingLevel:config.thinkingLevel,resourceLoader:loader,settingsManager:SettingsManager.inMemory({retry:{enabled:false}}),sessionManager:SessionManager.inMemory(),tools:['submit_design'],customTools:[{name:'submit_design',label:'Save design',description:'Submit complete formal design Markdown for this proposal-only comparison.',parameters:Type.Object({markdown:Type.String()}),execute:async(_id,args)=>{const text=(args as {markdown:string}).markdown;parseDocument('designer',text);markdown=text;return{content:[{type:'text',text:'Saved'}],details:{}};}}]});
    const controller=new AbortController(), timer=setTimeout(()=>{controller.abort();void session.abort();},120_000);
    const unsubscribe=session.subscribe(event=>{if(event.type==='turn_start'&&++turns>4)void session.abort();if(event.type==='message_end'&&event.message.role==='assistant')usage.push(event.message.usage);if(markdown&&event.type==='tool_execution_end')void session.abort();});
    try {await session.prompt(task+'\n'+documentInstructions('designer'));if(!markdown)throw new Error(controller.signal.aborted?'120-second deadline':'No valid design submitted');await writeFile(path.join(out,variant+'.md'),markdown);results.push({variant,status:'proposal_saved',turns,usage,duration_ms:performance.now()-started,rendered_artistic_acceptance:'not_executed'});} finally {clearTimeout(timer);unsubscribe();session.dispose();}
  }catch(error){results.push({variant,status:'failed',duration_ms:performance.now()-started,error:String(error).slice(0,500)});}
  await writeFile(path.join(out,'results.json'),JSON.stringify({models:Object.fromEntries(Object.entries(models).map(([role,c])=>[role,{provider:c.provider,model:c.model,thinking:c.thinkingLevel}])),budget:{turns:4,timeout_ms:120000,revisions:0},results},null,2));
  console.log(variant,JSON.stringify(results.at(-1)));
}
try {
 const started=performance.now();
 const model=rt.getModelOfType('image','dreamatic-info-images',setting('DREAMATIC_IMAGE_MODEL'))!;
 const output=await rt.generateImages(model,{input:[{type:'text',text:'A simple conceptual illustration of a reading lamp illuminating an open book, warm paper and ink textures, no letters, no numbers, no charts, square opaque composition.'}]},{signal:AbortSignal.timeout(120_000),metadata:{size:'1024x1024',background:'auto'}});
 const image=output.output.find(item=>item.type==='image');if(!image||image.type!=='image')throw new Error(output.errorMessage||'No image');
 const asset=parseDocument('designer',(await import('../apps/server/src/markdown-protocol.js')).documentTemplate('designer')).data.assets[0];asset.width=asset.height=1024;asset.commission.transparent='optional';
 const technical=await inspectImage(image,asset,AbortSignal.timeout(45000));await writeFile(path.join(out,'provider-image.'+(image.mimeType==='image/png'?'png':'jpg')),Buffer.from(image.data,'base64'));results.push({image_status:'technically_checked',technical,duration_ms:performance.now()-started,visual_acceptance:'pending'});
}catch(error){results.push({image_status:'failed',error:String(error).slice(0,500)});}
await writeFile(path.join(out,'results.json'),JSON.stringify({models,budget:{turns:4,timeout_ms:120000,revisions:0},results,limitation:'Proposal comparison and image transport only; no rendered same-facts end-to-end artistic quality claim.'},null,2));
console.log('Saved verification:',out);
