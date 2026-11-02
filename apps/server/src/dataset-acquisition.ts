import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";
import type { AcquisitionReceipt } from "../../../packages/shared/types.js";
import type { AcquiredData } from "./source-connectors.js";
import { normalizeMaterial } from "./ingest.js";
import { renderObservationTable } from "./markdown-protocol.js";
import { hash } from "./validation.js";
import { now, projectDir } from "./store.js";
import { policy } from "./policy.js";
import { setting } from "./config-store.js";
/** Kaggle may wrap a selected file in ZIP. Inflate only that exact file, with an output bound. */
export function selectedZip(buffer: Buffer, expected: string) {
  let result: Buffer | undefined, error: Error | undefined, count=0;
  const unzip = new Unzip(file => {
    count++;
    if (count > 100 || /(^|[\/\\])\.\.([\/\\]|$)|^[\/\\]|^[A-Za-z]:/.test(file.name)) { error = new Error("无效或过大的数据压缩包"); return; }
    if (file.name !== expected) return;
    if (result) { error=new Error("压缩包中有重复文件"); return; }
    const chunks: Uint8Array[]=[];let bytes=0;
    file.ondata=(err,data,final)=>{ if(err){error=err;return;} bytes+=data.length;if(bytes>policy.max_fetch_bytes){file.terminate();error=new Error("解压数据超过字节上限");return;} chunks.push(data);if(final)result=Buffer.concat(chunks); };
    file.start();
  });
  unzip.register(UnzipInflate);
  for(let offset=0;offset<buffer.length;offset+=1024) { unzip.push(buffer.subarray(offset,offset+1024),offset+1024>=buffer.length);if(error)throw error; }
  if(error)throw error;
  if(!result)throw new Error("压缩包没有返回选定文件");
  return result;
}
/** Bound total Office archive expansion before passing it to document parsers. */
export function validateOfficeArchive(buffer: Buffer) {
  let bytes=0,count=0,error:Error|undefined;
  const unzip=new Unzip(file=>{
    if(++count>1000 || /(^|[\/\\])\.\.([\/\\]|$)|^[\/\\]|^[A-Za-z]:/.test(file.name)){error=new Error("Office 压缩包路径或文件数无效");return;}
    file.ondata=(err,data)=>{if(err){error=err;return;}bytes+=data.length;if(bytes>policy.max_fetch_bytes){file.terminate();error=new Error("Office 解压内容超过字节上限");}};file.start();
  });
  unzip.register(UnzipInflate);
  for(let offset=0;offset<buffer.length;offset+=1024){unzip.push(buffer.subarray(offset,offset+1024),offset+1024>=buffer.length);if(error)throw error;}
}
export async function saveAcquiredData(project: string, acquired: AcquiredData) {
  const {response,metadata,parameters}=acquired;
  if((response.status ?? 200)>=400)throw new Error(`数据下载 HTTP ${response.status}`);
  const id=`data-${randomUUID()}`,root=projectDir(project),raw_path=`research/${id}.raw.txt`, rel=`research/${id}.md`;
  const raw=response.buffer;
  let content: string, rows: number | null=null, material_path:string|undefined, material_hash:string|undefined;
  const transformations: string[]=[];
  if(acquired.rows){ rows=acquired.rows.length-1;content=renderObservationTable(acquired.rows);transformations.push("Official API response normalized to a complete selected-slice table; null values retained as empty cells."); }
  else {
    let bytes=raw;
    if(raw[0]===0x50&&raw[1]===0x4b&&acquired.format!=="xlsx"&&acquired.format!=="docx") { bytes=selectedZip(raw,parameters.file);transformations.push("Extracted the exact selected file from the returned ZIP."); }
    if(/html/i.test(response.contentType) || /^\s*<(?:!doctype|html)/i.test(bytes.toString("utf8",0,200)))throw new Error("下载返回登录/网页内容，未取得数据文件");
    if(acquired.format === "xlsx" || acquired.format === "docx")validateOfficeArchive(bytes);
    const material=`research/${id}.${acquired.format}`;
    await writeFile(path.join(root,material),bytes);
    material_path=material;material_hash=hash(bytes.toString("base64"));
    content=await normalizeMaterial(path.join(root,material),bytes,`.${acquired.format}`,Number(setting("DREAMATIC_ACQUISITION_MAX_ROWS")));
    transformations.push(`Normalized selected ${acquired.format} file without sampling.`);
    // Large tables must be narrowed at source rather than silently truncated.
    const tableRows=content.split("\n").filter(line=>line.startsWith("|")).length;
    if(tableRows>Number(setting("DREAMATIC_ACQUISITION_MAX_ROWS"))+2)throw new Error("数据文件超过行数上限，请选择更小文件或来源切片");
  }
  const catalog_path=`research/${id}.catalog.json`, catalog=JSON.stringify(acquired.catalog ?? {metadata});
  await writeFile(path.join(root,catalog_path),catalog);
  const acquisition:AcquisitionReceipt={metadata,material_path,material_hash,format:acquired.format,catalog_path,catalog_hash:hash(catalog),raw_path,raw_hash:hash(raw.toString("base64")),parameters,transformations,rows,complete:true};
  const document=`# ${metadata.record_id}\n\n## Acquisition provenance\n\n${JSON.stringify(acquisition,null,2)}\n\n## Selected source data\n\n${content}`;
  await writeFile(path.join(root,raw_path),raw);
  await writeFile(path.join(root,rel),document);
  return {id,title:acquired.catalog?.hit.title ?? metadata.record_id,url:acquired.catalog?.hit.url ?? response.url,published_at:null,accessed_at:now(),kind:"web" as const,path:rel,fields:acquired.rows?.[0] ?? [],limitations:[...acquired.limitations,`License: ${metadata.license ?? "unknown; verify source terms"}. Scope: ${JSON.stringify(parameters)}.`],preview:content.slice(0,1500),raw_path,document,reader:`official:${metadata.connector}`,redirect_chain:response.redirect_chain ?? [response.url],diagnostics:transformations,quality:{status:"accepted" as const,reason:"已取得选定数据；仍需核实口径、许可与适用性"},acquisition};
}
