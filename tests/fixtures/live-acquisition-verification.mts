/** Public API verification only: temporary isolated config/projects, no model or credential use. */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const root=await mkdtemp(path.join(os.tmpdir(),"info-live-acquisition-"));
process.env.INFO_CONFIG_DIR=root;
try {
  const {ResearchWorkbench}=await import("../../apps/server/src/research-workbench.js");
  const {loadEvidenceSource}=await import("../../apps/server/src/evidence-view.js");
  const {buildCalculation}=await import("../../apps/server/src/source-calculation.js");
  const store=await import("../../apps/server/src/store.js");
  const p=await store.create("Public API verification","live"),work=await ResearchWorkbench.open(p);
  await work.savePlan("## 调研目标\nRetrieve official China population estimates for 2020–2021 and inspect a biomedical citation. Stop after the selected slice and bibliographic results are available.\n\n## 搜索队列\n| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |\n| --- | --- | --- | --- | --- |\n| W | Population | SP.POP.TOTL | 1 | worldbank |\n| P | Biomedical definitions | diabetes[Title] | 2 | pubmed |\n| K | Dataset discovery | population | 2 | kaggle |\n| E | European population | demo_pjan | 2 | eurostat |\n| U | Unemployment | SL_TLF_UEM | 2 | unsdg |");
  const started=performance.now();
  const results=await work.searchBatch(["W","P","K","E","U"]);
  console.log(JSON.stringify({kind:"discovery",duration_ms:Math.round(performance.now()-started),results:results.map((r,i)=>({task:["W","P","K","E","U"][i],...(r.status==="fulfilled"?{candidates:r.value.hits.length}:{error:String(r.reason)})}))}));
  const state=await work.snapshot(),candidate=state.tasks.find(t=>t.id==="W")?.hits[0];
  if(candidate){
    const before=performance.now();
    const {entry}=await work.acquire("W",candidate.url,{country:"CN",from:"2020",to:"2021"},"World Bank official population indicator matches China and the requested years; unit and definitions retained in metadata.");
    const evidence=await loadEvidenceSource(p,entry.source!),block=evidence.blocks.find(b=>b.text.startsWith("| country |"))!;
    const result=buildCalculation(evidence,{operation:"mean",source_id:evidence.source.id,block_id:block.id,value_column:4,label_column:2,unit:"people"});
    const reused=await work.acquire("W",candidate.url,{country:"CN",from:"2020",to:"2021"},"World Bank official population indicator matches China and the requested years; unit and definitions retained in metadata.");
    console.log(JSON.stringify({kind:"selected_slice",duration_ms:Math.round(performance.now()-before),rows:entry.acquisition?.rows,calculation_verified:Number.isFinite(result.result.value),reused:reused.reused}));
  }
  const gdp=(await import("../../apps/server/src/source-connectors.js"));
  const hits=await gdp.searchOfficial("worldbank","NY.GDP.MKTP.KD.ZG");
  const record=await gdp.inspectOfficial(hits[0]);
  try {
    const comparison=await gdp.acquireOfficial(record,{country:"WLD;USA;CHN",from:"2019",to:"2024"});
    console.log(JSON.stringify({kind:"worldbank_multi_country",rows:comparison.rows!.length-1,parameters:comparison.parameters}));
  } catch(error) { console.log(JSON.stringify({kind:"worldbank_multi_country",error:String(error)}));process.exitCode=1; }

  const sdg=(await work.snapshot()).tasks.find(t=>t.id === "U")?.hits.find(hit=>hit.metadata?.record_id === "SL_TLF_UEM");
  if(sdg){const {entry}=await work.acquire("U",sdg.url,{country:"156",from:"2020",to:"2021"},"Official SDG unemployment series for China M49 156; explicit two-year slice preserves definitions.");console.log(JSON.stringify({kind:"sdg_nonempty_slice",status:entry.status,rows:entry.acquisition?.rows}));}
} finally {await rm(root,{recursive:true,force:true});}
