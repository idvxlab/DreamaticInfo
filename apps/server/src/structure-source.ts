import type { StructuralData } from '../../../packages/shared/types.js';
import type { EvidenceSource } from './evidence-view.js';
import { sourceTable, sourceNumber } from './source-calculation.js';
export function extractStructure(source: EvidenceSource, request: { block_id: string; kind: 'timeline' | 'scatter'; id_column: number; first_column: number; second_column: number; x_unit: string; y_unit: string }): StructuralData {
 const block = source.blocks.find(b => b.id === request.block_id);
 if (!block) throw new Error('未知来源证据块');
 const rows = sourceTable(block.text), header = rows[0];
 for (const c of [request.id_column,request.first_column,request.second_column]) if (!Number.isInteger(c) || c < 0 || c >= header.length) throw new Error('列号无效');
 if (request.kind === 'scatter' && (request.first_column === request.second_column || !request.x_unit.trim() || !request.y_unit.trim())) throw new Error('配对变量列须不同且单位明确');
 const result: StructuralData = { events:[],nodes:[],edges:[],observations:[],x_variable:'',x_unit:'',y_variable:'',y_unit:'' };
 for (const [i,row] of rows.slice(1).entries()) {
  const evidence = { source_id:source.source.id,quote:block.text,location:`${block.id} 原始表格行 ${i+2}` };
  const id = row[request.id_column]; if (!id.trim()) throw new Error('观察或事件的原始编号为空');
  if (request.kind === 'scatter') result.observations.push({ id, x:sourceNumber(row[request.first_column]),y:sourceNumber(row[request.second_column]),...evidence });
  else result.events.push({ id,date:row[request.first_column],label:row[request.second_column],...evidence });
 }
 if (request.kind === 'scatter') Object.assign(result,{x_variable:header[request.first_column],y_variable:header[request.second_column],x_unit:request.x_unit,y_unit:request.y_unit});
 return result;
}
