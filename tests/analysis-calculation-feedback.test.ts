import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCalculation,calculationTableGuide} from '../apps/server/src/source-calculation.js';
import {ResearchToolError} from '../apps/server/src/research-feedback.js';
const source={source:{id:'api-data',title:'Official observations',url:'https://api.worldbank.org/',published_at:null,accessed_at:'2026-11-02',kind:'web' as const,path:'research/data.md',fields:[],limitations:[]},digest:'test-digest',blocks:[{id:'E-1234567890abcdef',section:'Selected source data',text:'| country | year | value |\n| --- | --- | --- |\n| A | 2020 | -2 |\n| B | 2020 | 3 |'}]};
test('explicit API headers expose correct indices and reject original-row mode with actionable feedback',()=>{
  const guide=calculationTableGuide(source,source.blocks[0].id)!;
  assert.equal(guide.table_kind,'explicit_header');assert.equal(guide.first_row_header,false);assert.deepEqual(guide.columns,[{index:0,name:'country'},{index:1,name:'year'},{index:2,name:'value'}]);
  assert.throws(()=>buildCalculation(source,{source_id:'api-data',block_id:source.blocks[0].id,operation:'extreme_max',label_column:0,value_column:2,first_row_header:true}),error=>error instanceof ResearchToolError&&error.code==='table_header_mode'&&error.next_action.includes('2=value'));
  const receipt=buildCalculation(source,{source_id:'api-data',block_id:source.blocks[0].id,operation:'difference',label_column:0,value_column:2,unit:'%'});assert.equal(receipt.unit,'百分点');assert.equal(Math.abs(Number(receipt.result.value)),5);
});
test('prose is not presented as a calculable table and missing observations remain rejected',()=>{
  assert.equal(calculationTableGuide({...source,blocks:[{...source.blocks[0],text:'This is explanatory prose.'}]},source.blocks[0].id),undefined);
  assert.throws(()=>buildCalculation({...source,blocks:[{...source.blocks[0],text:source.blocks[0].text.replace('| B | 2020 | 3 |','| B | 2020 | |')}]},{source_id:'api-data',block_id:source.blocks[0].id,operation:'mean',value_column:2,label_column:0}),/不能自动丢弃/);
});
