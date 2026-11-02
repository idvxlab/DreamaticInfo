import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
const root=await mkdtemp(path.join(os.tmpdir(),"info-acquisition-"));
process.env.INFO_CONFIG_DIR=root;
const {searchOfficial,inspectOfficial,acquireOfficial}=await import("../apps/server/src/source-connectors.js");
const {acquisitionBatch}=await import("../apps/server/src/acquisition-scheduler.js");
const {saveAcquiredData,selectedZip}=await import("../apps/server/src/dataset-acquisition.js");
const {ResearchWorkbench}=await import("../apps/server/src/research-workbench.js");
const {readableSource,updateProgress}=await import("../apps/server/src/research-state.js");
const {validateProvenance}=await import("../apps/server/src/provenance.js");
const {loadEvidenceSource}=await import("../apps/server/src/evidence-view.js");
const {buildCalculation}=await import("../apps/server/src/source-calculation.js");
const store=await import("../apps/server/src/store.js");
const response=(data:unknown,url="https://api.worldbank.org/data")=>{const text=JSON.stringify(data);return {text,buffer:Buffer.from(text),url,contentType:"application/json",status:200};};
const plan=(rows:string)=>`## 调研目标\nCompare actual populations in 2020–2021, stop when evidence is sufficient.\n\n## 搜索队列\n| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |\n| --- | --- | --- | --- | --- |\n${rows}`;
try {
  await test("dedicated catalogs return metadata, preserve publisher, and never invoke a web fallback",async()=>{
    const queries:string[]=[];
    const get=async(url:string)=>{queries.push(url);return response([{pages:1},[{id:"SP.POP.TOTL",name:"Population total",sourceNote:"Actual count",sourceOrganization:"Official statistics"},{id:"OTHER",name:"Unrelated"}]]);};
    const hits=await searchOfficial("worldbank","population",undefined,get);
    assert.equal(hits.length,1);assert.equal(hits[0].metadata?.scope,"catalog_metadata");assert.equal(hits[0].metadata?.publisher,"Official statistics");
    await assert.rejects(searchOfficial("web","population",undefined,get),/补充/);assert.equal(queries.length,1);
    await assert.rejects(searchOfficial("who","population",undefined,async()=>response({error:"unavailable"})),/响应无效/);
  });
  await test("same keywords on different sources are valid but unknown target names are rejected",async()=>{
    const w=await ResearchWorkbench.open(await store.create("Plan","live"));
    await w.savePlan(plan("| Q1 | 人口 | population | 1 | worldbank |\n| Q2 | 人口 | population | 1 | pubmed |"));
    await assert.rejects(w.savePlan(plan("| Q1 | 人口 | population | 1 | 官方统计 |")),/注册编号/);
  });
  await test("supplemental data-gap search requires dedicated discovery, and preserves purpose and reason",async()=>{
    let calls=0;
    const w=await ResearchWorkbench.open(await store.create("Fallback policy","live"),{search:async()=>{calls++;return [];},fetch:async()=>{throw new Error("unused");}});
    await w.savePlan(plan("| Q1 | 人口 | population | 1 | worldbank |\n| W1 | 人口 | official population report | 2 | web |"));
    await assert.rejects(w.search("W1"),/用途/);
    await assert.rejects(w.search("W1",undefined,false,{purpose:"data_gap",related_task_ids:["Q1"],reason:"Official indicator does not cover the requested age group"}),/专门来源/);
    assert.equal(calls,0);await w.search("Q1");
    await w.search("W1",undefined,false,{purpose:"data_gap",related_task_ids:["Q1"],reason:"Official indicator does not cover the requested age group"});
    assert.equal(calls,2);assert.equal((await w.snapshot()).tasks[1].supplemental?.purpose,"data_gap");
    await assert.rejects(w.searchBatch(["W1"]),/专门来源/);
  });
  await test("bounded batch overlaps independent work, isolates failures, and stops scheduling after cancellation",async()=>{
    let active=0,max=0,started=0;
    const results=await acquisitionBatch([1,2,3,4],2,async value=>{started++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,20));active--;if(value===2)throw new Error("source unavailable");return value;});
    assert.equal(max,2);assert.equal(started,4);assert.equal(results[1].status,"rejected");assert.equal(results[3].status,"fulfilled");
    const c=new AbortController();c.abort();await assert.rejects(acquisitionBatch([1,2],1,async()=>1,c.signal));
  });
  await test("World Bank selected slices reject incomplete pagination and preserve null observations",async()=>{
    const candidate=(await searchOfficial("worldbank","population",undefined,async()=>response([{pages:1},[{id:"SP.POP.TOTL",name:"Population"}]])))[0];
    const inspected=await inspectOfficial(candidate,undefined,async()=>response([{},[{id:"SP.POP.TOTL",sourceNote:"Population estimate"}]]));
    const partial=async()=>response([{pages:2},[{value:123}]]);
    await assert.rejects(acquireOfficial(inspected,{country:"CN",from:"2020",to:"2021"},undefined,partial),/不完整/);
    await assert.rejects(acquireOfficial(inspected,{country:"all",from:"2021",to:"2020"},undefined,partial),/年份/);
    const data=await acquireOfficial(inspected,{country:"CN",from:"2020",to:"2021"},undefined,async()=>response([{pages:1,lastupdated:"2026-01-01"},[{country:{value:"China"},date:"2020",value:null},{country:{value:"China"},date:"2021",value:123}]]));
    assert.equal(data.rows?.length,3);assert.equal(data.rows?.[1][4],"");assert.equal(data.metadata.version,"2026-01-01");
    const p=await store.create("Raw snapshots","live"),saved=await saveAcquiredData(p.id,data);
    const w=await ResearchWorkbench.open(p);await w.savePlan(plan("| Q1 | 人口 | population | 1 | worldbank |"));
    const {document,preview,raw_path,reader,diagnostics,redirect_chain,quality,acquisition,...source}=saved;
    const {hash}=await import("../apps/server/src/validation.js");
    const entry={id:"entry",title:source.title,url:source.url,requested_url:candidate.url,status:"accepted" as const,reason:quality.reason,task_ids:["Q1"],updated_at:store.now(),attempts:1,source,raw_path,acquisition,content_hash:hash(document)};
    await updateProgress(p,w.scope,state=>{state.sources.push(entry);});
    await validateProvenance(p,"researcher",{sources:[source],datasets:[{source_id:source.id,path:source.path}]});
    await assert.rejects(validateProvenance(p,"researcher",{sources:[source],datasets:[{source_id:source.id,path:"brief.md"}]}),/同一来源/);
    assert.match(await readableSource(p,entry),/Selected source data/);
    const evidence=await loadEvidenceSource(p,source);assert.ok(evidence.blocks.some(b=>b.text.includes("| country |")));
    await writeFile(path.join(store.projectDir(p.id),raw_path),"tampered");await assert.rejects(readableSource(p,entry),/原始数据/);
  });
  await test("selected ZIP extraction excludes unrelated files and rejects path traversal",()=>{
    assert.equal(selectedZip(Buffer.from(zipSync({"chosen.csv":strToU8("year,value\n2020,12"),"ignored.csv":strToU8("x,y")})),"chosen.csv").toString(),"year,value\n2020,12");
    assert.throws(()=>selectedZip(Buffer.from(zipSync({"../chosen.csv":strToU8("bad")})),"chosen.csv"),/无效/);
  });
  await test("discovery to acquisition to independently computed facts reuses the complete slice",async()=>{
    let downloads=0;
    const get=async(url:string)=> url.includes("country/") ? (downloads++,response([{pages:1,lastupdated:"2026-01-01"},[{country:{value:"China"},date:"2020",value:120},{country:{value:"China"},date:"2021",value:140}]])) : response([{pages:1},[{id:"SP.POP.TOTL",name:"Population"}]]);
    const p=await store.create("Complete acquisition pipeline","live");
    const w=await ResearchWorkbench.open(p,{search:async()=>{throw new Error("General web search must not run");},fetch:async()=>{throw new Error("Generic reader must not run");},official:(target,query,signal)=>searchOfficial(target,query,signal,get),inspect:(candidate,signal)=>inspectOfficial(candidate,signal,get),acquire:(record,selection,signal)=>acquireOfficial(record,selection,signal,get)});
    await w.savePlan(plan("| Q1 | 人口 | population | 1 | worldbank |"));
    const results=await w.searchBatch(["Q1"]);assert.equal(results[0].status,"fulfilled");
    const candidate=(await w.snapshot()).tasks[0].hits[0];
    const acquired=await w.acquire("Q1",candidate.url,{country:"CN",from:"2020",to:"2021"},"Matches the requested population scope and official indicator definition");
    assert.equal(acquired.entry.status,"accepted");
    const evidence=await loadEvidenceSource(p,acquired.entry.source!);
    const block=evidence.blocks.find(b=>b.text.startsWith("| country |"))!;
    const computed=buildCalculation(evidence,{operation:"mean",source_id:evidence.source.id,block_id:block.id,value_column:4,label_column:2,unit:"people"});
    assert.equal(computed.result.value,130);
    assert.equal((await w.acquire("Q1",candidate.url,{country:"CN",from:"2020",to:"2021"},"Matches the requested population scope and official indicator definition")).reused,true);
    assert.equal(downloads,1);
    await assert.rejects(w.assertReady(),/覆盖情况/);
    await assert.rejects(w.saveCoverage("| 任务 | 来源编号 | 缺口说明 |\n| --- | --- | --- |\n| Q1 | invented | 无 |"),/有效来源/);
    await w.saveCoverage(`| 任务 | 来源编号 | 缺口说明 |\n| --- | --- | --- |\n| Q1 | ${evidence.source.id} | 无 |`);
    await w.assertReady();
    const draft=await w.composeReport(`## 概要\nVerified official observations.\n\n## 采用来源\n- ${evidence.source.id}\n\n## 局限\n无`);
    const formal=await w.submitReport(draft.draft_revision);assert.deepEqual(formal.data.sources[0],acquired.entry.source);
    await validateProvenance(p,"researcher",formal.data);
    await validateProvenance(p,"researcher",{sources:[acquired.entry.source],datasets:[{source_id:evidence.source.id,path:evidence.source.path}]});
  });
  await test("Kaggle inspection uses the official file listing and rejects unknown license before downloading",async()=>{
    const candidate=(await searchOfficial("kaggle","population",undefined,async()=>response([{ref:"official/population",title:"Population",currentVersionNumber:2}])))[0];
    const inspected=await inspectOfficial(candidate,undefined,async url=>response(url.includes("/view/") ? {currentVersionNumber:2,files:[],licenseName:"Other"} : url.includes("/metadata/") ? {info:{licenses:[{name:"other"}],sources:[{url:"https://official.example/data"}]}} : {datasetFiles:[{name:"population.csv",totalBytes:100}],nextPageToken:""}));
    assert.equal(inspected.files[0].name,"population.csv");assert.equal(inspected.metadata.version,"2");
    await assert.rejects(acquireOfficial(inspected,{file:"population.csv"},undefined,async()=>{throw new Error("Must not download");}),/许可/);
  });
  await test("numbered spreadsheet evidence uses an explicit original header without discarding observations",async()=>{
    const {evidenceBlocks}=await import("../apps/server/src/evidence-view.js");
    const {renderDataTable}=await import("../apps/server/src/markdown-protocol.js");
    const source={id:"sheet",title:"Sheet",url:null,published_at:null,accessed_at:"2026-11-01",kind:"upload" as const,path:"sheet.md",fields:[],limitations:[]};
    const blocks=evidenceBlocks("sheet","digest",renderDataTable([["year","value"],["2020","10"],["2021","20"]]));
    const receipt=buildCalculation({source,digest:"digest",blocks},{source_id:"sheet",block_id:blocks[0].id,operation:"mean",label_column:0,value_column:1,first_row_header:true,unit:"people"});
    assert.equal(receipt.result.value,15);assert.equal(receipt.measure,"value");assert.equal(receipt.request.first_row_header,true);
  });
  await test("dataset tool schema rejects the actual source-name/year confusion and requires complete slice arguments",async()=>{
    const {default:Ajv}=await import('ajv');
    const {datasetRequestSchema}=await import('../apps/server/src/acquisition-contract.js');
    const valid=new Ajv({strict:false}).compile(datasetRequestSchema);
    const base={task_id:'Q1',candidate_id:'C-0123456789abcdef0123',rationale:'Actual official GDP comparison'};
    assert.equal(valid({...base,country:'WLD',from:'worldbank',to:'2024'}),false);
    assert.equal(valid({...base,country:'WLD',filters:{date:'2019:2024'}}),false);
    assert.equal(valid({...base,country:'WLD;USA;CHN',from:'2019',to:'2024'}),true);
    assert.equal(valid({...base,file:'data.csv'}),true);
  });
  await test("invalid selection is rejected before inspection/network and never creates a failed remote source",async()=>{
    let networkCalls=0;
    const w=await ResearchWorkbench.open(await store.create('Local validation','live'),{search:async()=>[],fetch:async()=>{throw new Error('unused');},inspect:async()=>{networkCalls++;throw new Error('must not inspect');}});
    await w.savePlan(plan('| Q1 | GDP | GDP growth | 1 | worldbank |'));
    await assert.rejects(w.acquire('Q1','https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG',{country:'WLD',from:'worldbank',to:'2024'},'Matches official GDP series'),/from=2019/);
    assert.equal(networkCalls,0);assert.equal((await w.snapshot()).sources.length,0);
  });
  await test("World Bank accepts bounded country lists while SDG rejects ISO instead of M49",async()=>{
    const {validateDatasetSelection}=await import('../apps/server/src/source-connectors.js');
    assert.doesNotThrow(()=>validateDatasetSelection('worldbank',{country:'WLD;USA;CHN',from:'2019',to:'2024'}));
    assert.throws(()=>validateDatasetSelection('unsdg',{country:'CHN',from:'2019',to:'2024'}),/M49/);
    assert.throws(()=>validateDatasetSelection('worldbank',{country:'all',from:'2019',to:'2024'}),/编号无效/);
    assert.throws(()=>validateDatasetSelection('worldbank',{country:'WLD',from:'2019',to:'2024',filters:{date:'2019:2024'}}),/filters/);
  });
  await test("official transport classifies denial, cools down blocked services and bounds transient retry",async()=>{
    const {officialGet,SourceApiError}=await import('../apps/server/src/source-connectors.js');
    let denied=0;
    const deny=async(url:string)=>({...response('Forbidden',url),status:403,headers:{}});
    await assert.rejects(officialGet('https://denied.example/api',undefined,async url=>{denied++;return deny(url);}),error=>error instanceof SourceApiError && error.status===403);
    await assert.rejects(officialGet('https://denied.example/other',undefined,async url=>{denied++;return deny(url);}),/403/);
    assert.equal(denied,1);
    let attempts=0;
    const result=await officialGet('https://transient.example/api',undefined,async url=>({...response({ok:true},url),status:++attempts===1?503:200,headers:{}}));
    assert.equal(result.status,200);assert.equal(attempts,2);
  });
  await test("JSON-stat normalization retains dimension labels, missing cells and flags",async()=>{
    const record={hit:{title:"Population",url:"https://ec.europa.eu/eurostat/databrowser/view/test/default/table",description:""},metadata:{connector:"eurostat",record_id:"test",publisher:"Eurostat",license:null,version:null,upstream_url:null,scope:"catalog_metadata"},files:[],details:{}};
    const data=await acquireOfficial(record,{country:"DE",from:"2020",to:"2021",filters:{sex:"T"}},undefined,async()=>response({id:["geo","time"],size:[1,2],dimension:{geo:{category:{index:{DE:0},label:{DE:"Germany"}}},time:{category:{index:{2020:0,2021:1},label:{2020:"2020",2021:"2021"}}}},value:{0:123},status:{1:"missing"},updated:"2026-01-01"}));
    assert.deepEqual(data.rows?.[2],["DE: Germany","2021: 2021","","missing"]);
  });
} finally {await rm(root,{recursive:true,force:true});}
