import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Fact, Research } from "../packages/shared/types.js";
import { factTypes } from "../packages/shared/fact-types.js";
const root=await mkdtemp(path.join(os.tmpdir(),"info-taxonomy-"));process.env.INFO_CONFIG_DIR=root;
const store=await import("../apps/server/src/store.js");
const {ingest}=await import("../apps/server/src/ingest.js");
const {statistic}=await import("../apps/server/src/fact-statistics.js");
const {loadEvidenceSource}=await import("../apps/server/src/evidence-view.js");
const {saveCalculation,buildCalculation}=await import("../apps/server/src/source-calculation.js");
const {analystIssues}=await import("../apps/server/src/analyst-validation.js");
const {renderDocument,parseDocument}=await import("../apps/server/src/markdown-protocol.js");
const {schemas}=await import("../apps/server/src/validation.js");
const source={id:"web-taxonomy-test",title:"Typed source",url:"https://data.example/source",published_at:null,accessed_at:"2026-10-31",kind:"web" as const,path:"research/data.md",fields:[],limitations:[]};
const research:Research={summary:"Fixture",sources:[source],datasets:[],limitations:[]};
const document="## Categories\n\n| Entity | Amount | Paired |\n| --- | --- | --- |\n| A | 1 | 2 |\n| B | 2 | 4 |\n| C | 3 | 6 |\n| D | 4 | 8 |\n| E | 100 | 200 |\n\n## Time\n\nyear,amount\n2021,10\n2022,12\n2024,15\n";
try {
 await test("deterministic operators cover aggregation, shares, ranks with ties, extrema, IQR, paired correlation and distributions",()=>{
  assert.equal(statistic({operation:"mean",values:[1,2,3]}).value,2);
  assert.equal(statistic({operation:"median",values:[4,1,2,3]}).value,2.5);
  assert.equal(statistic({operation:"difference",values:[3,9]}).value,6);
  assert.equal(statistic({operation:"proportion",values:[25,75],labels:["A","B"],focus:"A"}).value,25);
  assert.equal(statistic({operation:"distinct_count",labels:["A","B","A"]}).value,2);
  assert.equal(statistic({operation:"rank",values:[9,9,4],labels:["A","B","C"],focus:"C"}).value,3);
  assert.equal(statistic({operation:"rank",values:[9,9,4],labels:["A","B","C"],focus:"C",ties:"dense"}).value,2);
  assert.equal(statistic({operation:"rank",values:[9,9,4],labels:["A","B","C"],focus:"C",direction:"ascending"}).value,1);
  assert.equal(statistic({operation:"extreme_max",values:[9,9,4],labels:["A","B","C"]}).focus,"A、B");
  assert.equal(statistic({operation:"outlier_iqr",values:[1,2,3,4,100],labels:["A","B","C","D","E"],focus:"E"}).value,100);
  assert.equal(statistic({operation:"outlier_iqr",values:[1,1,1,1,100],labels:["A","B","C","D","E"],focus:"E"}).details.score,null);
  assert.equal(statistic({operation:"pearson",values:[1,2,3],paired_values:[2,4,6]}).value,1);
  assert.deepEqual(statistic({operation:"distribution",values:[2,3,4],labels:["A","A","B"]}).series,[{label:"A",value:5},{label:"B",value:4}]);
  assert.deepEqual(statistic({operation:"histogram",values:[0,1,2,3],bins:[0,1,3]}).series.map(item=>item.value),[1,3]);
  assert.equal(statistic({operation:"trend",values:[1,3,2]}).value,"mixed");
 });
 await test("undefined denominators, invalid ranks, non-outliers, incomplete pairs and discarded observations are rejected",()=>{
  for(const input of [
   {operation:"proportion",values:[0,0],focus:"1"}, {operation:"proportion",values:[-1,2],focus:"1"},
   {operation:"change_percent",values:[0,3]}, {operation:"rank",values:[1,2],labels:["A","A"],focus:"A"},
   {operation:"outlier_iqr",values:[1,2,3,4],labels:["A","B","C","D"],focus:"D"},
   {operation:"pearson",values:[1,1,1],paired_values:[1,2,3]}, {operation:"pearson",values:[1,2,3],paired_values:[2,4]},
   {operation:"histogram",values:[-1,1,4],bins:[0,2]}, {operation:"histogram",values:[1,2],bins:[2,1]},
  ])assert.throws(()=>statistic(input as any));
 });
 const p=await store.create("Taxonomy fixture","live");await writeFile(path.join(store.projectDir(p.id),source.path),document);
 const evidence=await loadEvidenceSource(p,source), categorical=evidence.blocks.find(block=>block.text.startsWith("| Entity"))!, temporal=evidence.blocks.find(block=>block.text.startsWith("year,amount"))!;
 const makeFact=(type:Fact["type"],receipt:Awaited<ReturnType<typeof saveCalculation>>):Fact=>({id:`F-${type}`,type,derivation:"computed",title:type,description:"Deterministic typed fixture",value:receipt.result.value,unit:receipt.unit,analysis:"Compute on the complete source block",context:"Test data only",importance:.8,confidence:{score:1,reason:"Computed on deterministic fixture"},source_ids:[source.id],evidence:[{source_id:source.id,quote:receipt.request.block_id===categorical.id?"| A | 1 | 2 |":"2021,10",location:receipt.request.block_id}],relations:[],series:receipt.result.series,specification:{scope:`Complete ${receipt.request.block_id}`,measure:receipt.measure,breakdown:receipt.breakdown,focus:receipt.result.focus,aggregation:receipt.result.aggregation as Fact["specification"]["aggregation"],method:receipt.result.method,distribution_kind:type==="distribution"?(receipt.request.operation==="histogram"?"numeric":"categorical"):"none",calculation_id:receipt.id,series_unit:receipt.series_unit}});
 await test("all ten fact types roundtrip through Markdown with source-bound computations and separate derivation",async()=>{
  assert.deepEqual(schemas.datafacts.properties.facts.items.properties.type.enum,[...factTypes]);
  const requests=[['value','sum'],['comparison','difference'],['trend','trend'],['distribution','distribution'],['correlation','pearson'],['proportion','proportion'],['categorization','distinct_count'],['rank','rank'],['extreme','extreme_max'],['outlier','outlier_iqr']] as const;
  const facts:Fact[]=[];
  for(const [type,operation] of requests){
   // difference requires a complete two-row comparison set rather than truncating a larger table.
   let current=evidence,block=type==='trend'?temporal:categorical;
   if(type==='comparison'){
    const secondary={...source,id:"web-two-rows",path:"research/two.md"};await writeFile(path.join(store.projectDir(p.id),secondary.path),'| Entity | Amount |\n| --- | --- |\n| A | 1 |\n| B | 3 |\n');current=await loadEvidenceSource(p,secondary);block=current.blocks[0];research.sources.push(secondary);
   }
   const receipt=await saveCalculation(p,current,{operation,source_id:current.source.id,block_id:block.id,value_column:1,label_column:0,unit:"items",...(type==='correlation'?{paired_column:2}:{}),...(['proportion','rank','outlier'].includes(type)?{focus:'E'}:{})});
   const fact=makeFact(type,receipt);if(type==='comparison'){fact.source_ids=[current.source.id];fact.evidence=[{source_id:current.source.id,quote:'| A | 1 |',location:block.id}];}
   facts.push(fact);
  }
  const md=renderDocument('analyst',{summary:'Ten types',facts});const parsed=parseDocument('analyst',md);
  assert.deepEqual(parsed.data.facts.map((fact:Fact)=>fact.type),[...factTypes].filter(t => !["timeline","process","hierarchy","scatter"].includes(t)));
  assert.deepEqual(await analystIssues(p,parsed.data,research),[]);
  const legacy={summary:'Bad enum',facts:[{...facts[0],type:'inference'}]};assert.throws(()=>parseDocument('analyst',renderDocument('analyst',legacy)),/allowed/);
  const derived={...facts[0],derivation:'inferred',specification:{...facts[0].specification,calculation_id:null}};assert.deepEqual(await analystIssues(p,{summary:'Inferred',facts:[derived]},research),[]);
 });
 await test("computed fact values, units, series, methods, evidence anchors and receipt files cannot be changed independently",async()=>{
  const receipt=await saveCalculation(p,evidence,{operation:'proportion',source_id:source.id,block_id:categorical.id,value_column:1,label_column:0,focus:'E',unit:'items'}),fact=makeFact('proportion',receipt);
  for(const change of [
   (f:Fact)=>{f.value=99;},(f:Fact)=>{f.unit='people';},(f:Fact)=>{f.series[0].value=999;},(f:Fact)=>{f.specification.method='invented';},(f:Fact)=>{f.evidence[0].location='other';},(f:Fact)=>{f.specification.calculation_id=null;},
  ]){const modified=structuredClone(fact);change(modified);assert.ok((await analystIssues(p,{summary:'Tampered',facts:[modified]},research)).length);}
  const file=path.join(store.projectDir(p.id),`state/calculations/${receipt.id}.json`),raw=await readFile(file,'utf8');await writeFile(file,raw.replace('part/sum(all_rows)*100','invented'));
  assert.ok((await analystIssues(p,{summary:'Tampered record',facts:[fact]},research)).some(issue=>issue.message.includes('记录已变化')));
 });
 await test("single-column category files retain CSV quoting and source shares/differences retain distinct units",async()=>{
  const upload=await ingest(p,"categories.csv",Buffer.from('Category\n"A,B"\nC\n"A,B"\n'));
  const record={...source,id:upload.id,kind:"upload" as const,path:upload.normalized};
  const view=await loadEvidenceSource(p,record),block=view.blocks.find(block=>block.section==='原始上传文本'&&block.text.startsWith('Category'))!;
  const categories=buildCalculation(view,{operation:'distinct_count',source_id:upload.id,block_id:block.id,label_column:0});assert.equal(categories.result.value,2);
  const distribution=buildCalculation(view,{operation:'distribution_count',source_id:upload.id,block_id:block.id,label_column:0});assert.deepEqual(distribution.result.series,[{label:'A,B',value:2},{label:'C',value:1}]);assert.equal(distribution.unit,'条');
  const temp={...evidence,blocks:[{id:categorical.id,section:'Comparison',text:'| Entity | Rate |\n| --- | --- |\n| A | 40 |\n| B | 50 |'}]};
  const difference=buildCalculation(temp,{operation:'difference',source_id:source.id,block_id:categorical.id,value_column:1,label_column:0,unit:'%'});assert.equal(difference.result.value,10);assert.equal(difference.unit,'百分点');assert.equal(difference.series_unit,'%');
 });
 await test("source computation rejects ragged/missing tables, wrong columns, invalid dates and self-correlation",()=>{
  for(const request of [{operation:'sum',value_column:8},{operation:'pearson',value_column:1,paired_column:1},{operation:'trend',value_column:1}])assert.throws(()=>buildCalculation(evidence,{...request,source_id:source.id,block_id:categorical.id,label_column:0} as any));
  for(const text of ['Date,Amount\n2024-02-31,1\n2024-03-02,2','| Entity | Amount |\n| --- | --- |\n| A | 1 | extra |','| Entity | Amount |\n| --- | --- |\n| A | - |']) {
    const view={...evidence,blocks:[{id:categorical.id,section:'Invalid',text}]};
    assert.throws(()=>buildCalculation(view,{operation:text.startsWith('Date')?'trend':'sum',source_id:source.id,block_id:categorical.id,value_column:1,label_column:0}));
  }
 });
}finally{await rm(root,{recursive:true,force:true});}
