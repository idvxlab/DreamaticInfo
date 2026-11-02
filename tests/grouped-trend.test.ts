import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'info-grouped-trend-'));process.env.INFO_CONFIG_DIR=root;
const {buildCalculation,saveGroupedCalculations,verifyCalculation,calculationTableGuide}=await import('../apps/server/src/source-calculation.js');
const {calculationSchema,validateCalculationMode}=await import('../apps/server/src/calculation-contract.js');
const {default:Ajv}=await import('ajv');const store=await import('../apps/server/src/store.js');
const source={source:{id:'api',title:'GDP',url:'https://api.worldbank.org',path:'research/a.md',published_at:null,accessed_at:'2026-11-02',kind:'web' as const,fields:[],limitations:[]},digest:'source-digest',blocks:[{id:'E-0123456789abcdef',section:'Data',text:'| country | year | value |\n| --- | --- | --- |\n| China | 2021 | 8 |\n| China | 2020 | 2 |\n| US | 2021 | 6 |\n| US | 2020 | -2 |'}]};
const request={source_id:'api',block_id:source.blocks[0].id,operation:'trend' as const,group_columns:[0],time_order:'ascending' as const,label_column:1,value_column:2,unit:'%'};
try{
 await test('calculation schema excludes source/auxiliary mixing and runtime names the conflicting labels field',()=>{
  const validate=new Ajv({strict:false}).compile(calculationSchema);assert.equal(validate(request),true);assert.equal(validate({...request,labels:['China','US']}),false);assert.equal(validate({...request,values:[]}),false);
  assert.throws(()=>validateCalculationMode({...request,labels:['China','US']}),error=>(error as any).code==='calculation_mode_conflict'&&(error as any).message.includes('labels'));
 });
 await test('all observed groups retain every observation, sort explicitly and verify per-group receipts',async()=>{
  const p=await store.create('Grouped calculation','live');const receipts=await saveGroupedCalculations(p,source,request);assert.equal(receipts.length,2);
  assert.deepEqual(receipts.map(r=>r.result.series.map(x=>x.label)),[['2020','2021'],['2020','2021']]);assert.equal(receipts.reduce((n,r)=>n+r.result.series.length,0),4);
  assert.deepEqual(receipts[0].result.details.original_rows,[3,2]);
  for(const r of receipts){assert.deepEqual(buildCalculation(source,r.request),r);const fact={type:'trend',derivation:'computed',value:r.result.value,unit:r.unit,series:r.result.series,source_ids:['api'],evidence:[{source_id:'api',location:request.block_id}],specification:{calculation_id:r.id,scope:`${request.block_id}; ${r.selection_scope}`,measure:r.measure,breakdown:r.breakdown,focus:r.result.focus,method:r.result.method,aggregation:r.result.aggregation,series_unit:r.series_unit,distribution_kind:'none'}} as any;await verifyCalculation(p,fact,new Map([['api',source]]));await assert.rejects(verifyCalculation(p,{...fact,specification:{...fact.specification,scope:request.block_id}},new Map([['api',source]])),/分组范围/);}
  const hints=calculationTableGuide(source,request.block_id)!;assert.equal(hints.dimensions[1].time_order,'repeated_or_mixed');
 });
 await test('duplicates, missing values and invalid grouping fail without dropping or averaging observations',async()=>{
  const p=await store.create('Invalid grouped trend','live');
  const duplicate={...source,blocks:[{...source.blocks[0],text:source.blocks[0].text.replace('| China | 2021 | 8 |','| China | 2020 | 8 |')}]};await assert.rejects(saveGroupedCalculations(p,duplicate,request),/严格递增/);
  const missing={...source,blocks:[{...source.blocks[0],text:source.blocks[0].text.replace('| US | 2020 | -2 |','| US | 2020 | |')}]};await assert.rejects(saveGroupedCalculations(p,missing,request),/不能自动丢弃/);
  await assert.rejects(saveGroupedCalculations(p,source,{...request,group_columns:[1]}),/分组列/);
  assert.throws(()=>buildCalculation(source,{...request,group_columns:undefined,time_order:undefined}),/严格递增/);
 });
}finally{await rm(root,{recursive:true,force:true});}
