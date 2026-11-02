import { Type } from 'typebox';
import { operations } from './fact-statistics.js';
import { ResearchToolError } from './research-feedback.js';
const common={operation:Type.Union(operations.map(value=>Type.Literal(value))),unit:Type.Optional(Type.String()),focus:Type.Optional(Type.String()),ties:Type.Optional(Type.Union([Type.Literal('competition'),Type.Literal('dense')])),direction:Type.Optional(Type.Union([Type.Literal('ascending'),Type.Literal('descending')])),iqr_multiplier:Type.Optional(Type.Number()),bins:Type.Optional(Type.Array(Type.Number()))};
export const calculationSchema=Type.Union([
  Type.Object({...common,source_id:Type.String(),block_id:Type.String(),first_row_header:Type.Optional(Type.Boolean()),label_column:Type.Integer({minimum:0}),value_column:Type.Optional(Type.Integer({minimum:0})),paired_column:Type.Optional(Type.Integer({minimum:0})),group_columns:Type.Optional(Type.Array(Type.Integer({minimum:0}),{minItems:1,uniqueItems:true,description:'For source trend only: explicitly split every observed group into a separate receipt; no group is dropped.'})),time_order:Type.Optional(Type.Literal('ascending',{description:'For source trend only: explicitly sort each series chronologically; preserve every observation.'}))},{additionalProperties:false}),
  Type.Object({...common,values:Type.Optional(Type.Array(Type.Number())),labels:Type.Optional(Type.Array(Type.String())),paired_values:Type.Optional(Type.Array(Type.Number()))},{additionalProperties:false}),
]);
export function validateCalculationMode(input:Record<string,unknown>) {
  if(input.source_id!==undefined || input.block_id!==undefined){
    const conflicts=['values','labels','paired_values'].filter(key=>Object.hasOwn(input,key));
    if(conflicts.length)throw new ResearchToolError('calculation_mode_conflict','parameter',`来源计算不能填写辅助计算字段：${conflicts.join(', ')}`,'删除这些字段；使用 source_id、block_id 和列号，由服务器读取真实标签和数值。多经济体趋势显式设置 group_columns=[国家列号] 和 time_order="ascending"，不要自填 labels。');
    if(!input.source_id||!input.block_id)throw new ResearchToolError('source_reference','parameter','来源计算需同时提供 source_id 和 block_id','从 read_evidence 复制完整来源和证据块编号。');
  }
}
