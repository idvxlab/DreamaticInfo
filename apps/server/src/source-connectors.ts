import { load } from "cheerio";
import type { SearchHit, SourceMetadata } from "../../../packages/shared/types.js";
import { publicRequest, followPublicRedirects, abortable, type WebResponse } from "./public-http.js";
import { setting } from "./config-store.js";
import { connectorId, SOURCE_REGISTRY, type ConnectorId } from "./source-registry.js";
import { paceProvider } from "./acquisition-scheduler.js";
export type ApiGet = (url: string, signal?: AbortSignal) => Promise<WebResponse>;
export interface DatasetSelection { upstream_url?: string; country?: string; from?: string; to?: string; file?: string; filters?: Record<string, string> }
export interface InspectedRecord { hit: SearchHit; metadata: SourceMetadata; files: { name: string; url?: string; size: number | null }[]; details: unknown }
export interface AcquiredData { catalog?: InspectedRecord; response: WebResponse; rows?: string[][]; format?: string; metadata: SourceMetadata; parameters: Record<string, string>; limitations: string[] }
const enc = encodeURIComponent;
const code = (value: string) => { if (!/^[A-Za-z0-9_.-]{1,150}$/.test(value)) throw new Error("无效的官方记录编号"); return value; };
const clean = (value: unknown) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const limit = () => Math.min(5, Number(setting("DREAMATIC_SEARCH_RESULTS")));
export class SourceApiError extends Error {
  constructor(readonly host:string, readonly status:number, readonly retryable:boolean) {
    super(`${host} 官方 API HTTP ${status}：${status === 403 ? "访问被拒绝；不要反复更换关键词重试，应记录访问限制" : status === 401 ? "需要有效的官方接口凭据" : status === 429 ? "请求限流，请稍后重试" : status >= 500 ? "远端服务错误；不代表查询没有数据" : "请检查记录编号和参数"}`);
    this.name="SourceApiError";
  }
}
const blockedUntil=new Map<string,{until:number;status:number}>();
const catalogs = new Map<string, { expires: number; response: Promise<WebResponse> }>();
export async function officialGet(url: string, signal?: AbortSignal, send = publicRequest): Promise<WebResponse> {
  signal?.throwIfAborted();
  const host = new URL(url).hostname;
  const blocked=blockedUntil.get(host);
  if(blocked && blocked.until>Date.now())throw new SourceApiError(host,blocked.status,false);
  const cacheable = (host === "api.worldbank.org" && new URL(url).pathname === "/v2/indicator") || url === "https://unstats.un.org/SDGAPI/v1/sdg/Series/List?all=true";
  const request = async (parent?: AbortSignal) => {
    const effective=AbortSignal.any([parent ?? new AbortController().signal,AbortSignal.timeout(Number(setting("DREAMATIC_ACQUISITION_TIMEOUT_MS")))]);
    const key=host === "eutils.ncbi.nlm.nih.gov" ? setting("DREAMATIC_NCBI_API_KEY") : "";
    await paceProvider(host,host === "eutils.ncbi.nlm.nih.gov" ? (key ? 110 : 350) : 100,effective);
    const endpoint=new URL(url);if(key)endpoint.searchParams.set("api_key",key);
    const token=host === "www.kaggle.com" ? setting("DREAMATIC_KAGGLE_TOKEN") : "";
    try {
      const response=await followPublicRedirects(endpoint.href,effective,undefined,(hop,s,bytes,headers)=>send(hop,s,bytes,{...headers,...(token && new URL(hop).origin === "https://www.kaggle.com" ? {Authorization:`Bearer ${token}`} : {})}),undefined,true);
      if(response.status>=400) {
        if(response.status===403 || (host === "ghoapi.azureedge.net" && response.status>=500))blockedUntil.set(host,{until:Date.now()+30000,status:response.status});
        throw new SourceApiError(host,response.status,[429,502,503,504].includes(response.status));
      }
      if(cacheable && !Array.isArray(JSON.parse(response.text.replace(/^\uFEFF/,""))))throw new Error("Official catalog response is invalid");
      return {...response,url,redirect_chain:[url]};
    } catch(error) {
      if(parent?.aborted)throw parent.reason;
      if(error instanceof SourceApiError)throw error;
      const detail=String(error);
      const message=/AbortError|Timeout|timed? ?out/i.test(detail) ? `${host} 网络请求超时；请稍后显式重试或缩小切片，不代表没有数据` : detail;
      throw new Error(key ? message.replaceAll(key,"[redacted]").replaceAll(encodeURIComponent(key),"[redacted]") : message); }
  };
  const boundedRequest=async(parent?:AbortSignal)=>{
    const effective=AbortSignal.any([parent ?? new AbortController().signal,AbortSignal.timeout(Number(setting("DREAMATIC_ACQUISITION_TIMEOUT_MS")))]);
    try {return await request(effective);} catch(error) {
      if(effective.aborted)throw effective.reason;
      const transient=error instanceof SourceApiError ? error.retryable : /ECONNRESET|EAI_AGAIN|ETIMEDOUT|网络请求超时/.test(String(error));
      if(!transient)throw error;
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {await abortable(new Promise<void>(resolve=>{timer=setTimeout(resolve,750);}),effective);}finally{clearTimeout(timer);}
      return request(effective);
    }
  };
  if(!cacheable)return boundedRequest(signal);
  // Share only public catalogs. A caller can stop waiting without cancelling another project.
  let cached=catalogs.get(url);
  if(!cached || cached.expires<Date.now()) {
    const response=boundedRequest();cached={expires:Date.now()+600000,response};catalogs.set(url,cached);
    void response.catch(()=>{if(catalogs.get(url)?.response===response)catalogs.delete(url);});
    if(catalogs.size>16)catalogs.delete(catalogs.keys().next().value!);
  }
  return signal ? abortable(cached.response,signal) : cached.response;
}
async function json(url: string, signal: AbortSignal | undefined, get: ApiGet) {
  const r = await get(url, signal);
  if ((r.status ?? 200) >= 400) throw new Error(`Official API HTTP ${r.status}`);
  try { return { data: JSON.parse(r.text.replace(/^\uFEFF/, "")), response: r }; }
  catch { throw new Error("官方接口没有返回有效 JSON；登录页或挑战页不能作为数据"); }
}
function hit(connector: ConnectorId, id: string, title: string, url: string, description: string, publisher: string | null = null, license: string | null = null, version: string | null = null): SearchHit {
  return { title, url, description: description.slice(0, 2000), metadata: { connector, record_id: id, publisher, license, version, upstream_url: null, scope: "catalog_metadata" } };
}
async function eurostatMetadata(id: string, signal: AbortSignal | undefined, get: ApiGet, references = false) {
  const response=await get(`https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/ESTAT/${code(id).toUpperCase()}/latest?references=${references ? "all" : "none"}`,signal);
  const $=load(response.text,{xml:true});
  const elements=(name:string)=>$("*").filter((_i,node)=>(node as any).name?.split(":").at(-1)===name);
  const flow=elements("Dataflow").first();
  if(!flow.length || flow.attr("id")!==id.toUpperCase())throw new Error("Eurostat 数据集元数据不存在或编号不匹配");
  const englishName=(node:any)=>$(node).children().filter((_i,n)=>(n as any).name?.split(":").at(-1)==="Name" && $(n).attr("xml:lang")==="en").first().text();
  const dimensions=elements("Dimension").map((_i,node)=>({id:$(node).attr("id"),position:$(node).attr("position"),definition:$(node).text().trim()})).get();
  const codelists=elements("Codelist").map((_i,node)=>({id:$(node).attr("id"),label:englishName(node),codes:$(node).children().filter((_j,n)=>(n as any).name?.split(":").at(-1)==="Code").map((_j,n)=>({id:$(n).attr("id"),label:englishName(n)})).get()})).get();
  return {name:englishName(flow[0]) || id,version:flow.attr("version") ?? null,dimensions,codelists,raw_metadata:response.text};
}
export async function searchOfficial(target: string, query: string, signal?: AbortSignal, get: ApiGet = officialGet): Promise<SearchHit[]> {
  const source = connectorId(target), n = limit();
  switch (source) {
    case "pubmed": {
      const { data } = await json(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${n}&term=${enc(query)}`, signal, get);
      if (data.error || !Array.isArray(data.esearchresult?.idlist)) throw new Error("PubMed 检索响应无效");
      const ids: string[] = data.esearchresult.idlist;
      if (!ids.length) return [];
      const { data: summary } = await json(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`, signal, get);
      return ids.map(id => { const r = summary.result?.[id]; if (!r?.title) throw new Error("PubMed 题录缺失"); return hit(source, id, r.title, `https://pubmed.ncbi.nlm.nih.gov/${id}/`, `${r.pubdate ?? ""}; ${r.fulljournalname ?? ""}. Bibliographic record; retrieve abstract/full text separately.`, r.fulljournalname ?? null); });
    }
    case "kaggle": {
      const { data } = await json(`https://www.kaggle.com/api/v1/datasets/list?search=${enc(query)}&page=1&pageSize=${n}&fileType=csv&sortBy=updated`, signal, get);
      if (!Array.isArray(data)) throw new Error("Kaggle 数据目录响应无效");
      return data.slice(0, n).map(r => hit(source, r.ref, r.title, `https://www.kaggle.com/datasets/${r.ref}`, r.subtitle ?? r.description ?? "", r.ownerName ?? r.ownerRef ?? null, r.licenseName ?? null, r.currentVersionNumber ? String(r.currentVersionNumber) : null));
    }
    case "worldbank": {
      // The catalog is bounded; keyword matches are ranked, never treated as observations.
      const { data } = await json(`https://api.worldbank.org/v2/indicator?format=json&per_page=20000&source=2`, signal, get);
      if (!Array.isArray(data?.[1]) || Number(data[0]?.pages) > 1) throw new Error("World Bank 指标目录不完整");
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return data[1].map((r: any) => ({ r, score: words.filter(w => `${r.id} ${r.name}`.toLowerCase().includes(w)).length })).filter((x: any) => x.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, n).map(({ r }: any) => hit(source, r.id, r.name, `https://data.worldbank.org/indicator/${r.id}`, `${r.sourceNote ?? ""}\n${r.sourceOrganization ?? ""}`, r.sourceOrganization || "World Bank"));
    }
    case "who": {
      const q = query.replaceAll("'", "''");
      const { data } = await json(`https://ghoapi.azureedge.net/api/Indicator?$top=${n}&$filter=${enc(`contains(IndicatorName,'${q}') or IndicatorCode eq '${q}'`)}`, signal, get);
      if (!Array.isArray(data.value)) throw new Error("WHO 指标目录响应无效");
      return data.value.map((r: any) => hit(source, r.IndicatorCode, r.IndicatorName, `https://ghoapi.azureedge.net/api/${code(r.IndicatorCode)}`, "Official GHO indicator; inspect and select geography/time before retrieval.", "WHO"));
    }
    case "zenodo": {
      const { data } = await json(`https://zenodo.org/api/records?q=${enc(`(${query}) AND resource_type.type:dataset`)}&size=${n}`, signal, get);
      if (!Array.isArray(data.hits?.hits)) throw new Error("Zenodo 目录响应无效");
      return data.hits.hits.map((r: any) => hit(source, String(r.id), r.metadata.title, `https://zenodo.org/records/${r.id}`, clean(r.metadata.description).replace(/<[^>]*>/g, " "), r.metadata.creators?.map((c: any) => c.name).join("; ") ?? null, r.metadata.license?.id ?? null, r.metadata.version ?? null));
    }
    case "unsdg": {
      const { data } = await json("https://unstats.un.org/SDGAPI/v1/sdg/Series/List?all=true", signal, get);
      if (!Array.isArray(data)) throw new Error("UN SDG 序列目录响应无效");
      const words = query.toLowerCase().split(/\s+/);
      return data.map((r: any) => ({ r, score: words.filter(w => `${r.code} ${r.description}`.toLowerCase().includes(w)).length })).filter((x: any) => x.score).sort((a: any,b: any) => b.score-a.score).slice(0,n).map(({r}: any) => hit(source,r.code,r.description,`https://unstats.un.org/SDGAPI/v1/sdg/Series/Data?seriesCode=${code(r.code)}`,"Official SDG series; select geography/time.","UNSD",null,r.release ?? null));
    }
    case "eurostat": {
      const id = code(query.trim()), metadata=await eurostatMetadata(id,signal,get);
      return [hit(source,id,metadata.name,`https://ec.europa.eu/eurostat/databrowser/view/${id}/default/table`,"Official SDMX dataset metadata. Inspect dimensions and select a country/year slice before acquiring observations.","Eurostat",null,metadata.version)];
    }
    case "nbs": return [hit(source,"directory","国家统计局·国家数据","https://data.stats.gov.cn/","Official directory only; no observations acquired. Use a known official page or a justified official-domain supplemental search.","国家统计局")];
    case "web": throw new Error("网页搜索只能通过带用途和理由的补充搜索工具执行");
  }
}
export async function inspectOfficial(candidate: SearchHit, signal?: AbortSignal, get: ApiGet = officialGet): Promise<InspectedRecord> {
  if (!candidate.metadata) throw new Error("候选缺少官方连接器元数据");
  const m = { ...candidate.metadata }, id = m.record_id;
  let details: any = {}, files: InspectedRecord["files"] = [];
  if (m.connector === "kaggle") {
    if (!/^[\w-]+\/[\w.-]+$/.test(id)) throw new Error("无效 Kaggle 数据集编号");
    const [view, meta, listing] = await Promise.all([
      json(`https://www.kaggle.com/api/v1/datasets/view/${id}`, signal, get),
      json(`https://www.kaggle.com/api/v1/datasets/metadata/${id}`, signal, get),
      json(`https://www.kaggle.com/api/v1/datasets/list/${id}`, signal, get),
    ]);
    if (listing.data.nextPageToken || !Array.isArray(listing.data.datasetFiles)) throw new Error("Kaggle 文件目录不完整；请选择更小的数据集");
    details = { ...view.data, provenance:meta.data.info };
    m.version = String(details.currentVersionNumber ?? m.version ?? "");
    m.license = meta.data.info?.licenses?.[0]?.name ?? details.licenseName ?? m.license;
    m.upstream_url = meta.data.info?.sources?.[0]?.url ?? details.sourceUrl ?? null;
    files = listing.data.datasetFiles.map((f: any) => ({ name: f.name ?? f.path, size: Number(f.totalBytes ?? f.bytes) || null }));
  } else if (m.connector === "zenodo") {
    details = (await json(`https://zenodo.org/api/records/${code(id)}`, signal, get)).data;
    m.license = details.metadata?.license?.id ?? m.license;
    m.version = details.metadata?.version ?? details.doi ?? m.version;
    m.upstream_url = details.metadata?.related_identifiers?.find((r: any) => r.relation === "isSupplementTo")?.identifier ?? null;
    files = (details.files ?? []).map((f: any) => ({ name:f.key, size:f.size ?? null, url:f.links?.self }));
  } else if (m.connector === "worldbank") {
    details = (await json(`https://api.worldbank.org/v2/indicator/${code(id)}?format=json`, signal,get)).data?.[1]?.[0];
    if (!details?.id) throw new Error("World Bank 指标不存在");
  } else if (m.connector === "eurostat") {
    details=await eurostatMetadata(id,signal,get,true);
  } else details = { description: candidate.description, guidance: SOURCE_REGISTRY[connectorId(m.connector)].guidance };
  return { hit: candidate, metadata: m, files, details };
}
function selectedYears(s: DatasetSelection) {
  if (!s.from || !s.to || !/^\d{4}$/.test(s.from) || !/^\d{4}$/.test(s.to) || +s.from > +s.to || +s.to - +s.from > 100) throw new Error("必须指定有效的 from/to 年份：from=2019，to=2024；from 不能填来源名称（跨度不超过 100 年）");
  return { from:s.from, to:s.to };
}
/** Validate locally before inspection, persistence or any network request. */
export function validateDatasetSelection(connector: string, selection: DatasetSelection) {
  if (["kaggle","zenodo"].includes(connector)) {
    if (!selection.file?.trim()) throw new Error("文件采集必须指定 file，复制 inspect_dataset 返回的文件名");
    if (selection.country || selection.from || selection.to || selection.filters) throw new Error("文件采集不接收国家或年份参数");
    return;
  }
  if (!["worldbank","who","unsdg","eurostat"].includes(connector)) throw new Error("此来源不提供数据切片，请使用文章阅读工具");
  selectedYears(selection);
  const country=selection.country ?? "";
  const valid=connector === "worldbank" ? /^[A-Za-z0-9_-]{2,15}(?:;[A-Za-z0-9_-]{2,15}){0,19}$/.test(country) && country.split(";").every(c=>!/^all$/i.test(c)) : connector === "unsdg" ? /^\d{1,3}$/.test(country) : connector === "who" ? /^[A-Z]{3}$/.test(country) : /^[A-Za-z0-9_-]{2,15}$/.test(country);
  if(!valid)throw new Error(`国家/地区编号无效：${connector === "worldbank" ? "使用 CHN、WLD 或 CHN;USA（最多 20 项）" : connector === "unsdg" ? "使用 M49 数字编号，如 156" : connector === "who" ? "使用三字母国家编号，如 CHN" : "使用 Eurostat 地区编号，如 DE"}`);
  if(connector!=="eurostat" && Object.keys(selection.filters ?? {}).length)throw new Error("filters 仅用于 Eurostat 维度；年份直接填写 from=2019、to=2024");
}
function objectRows(rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error("指定切片没有观测数据");
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return [keys, ...rows.map(r => keys.map(k => clean(r[k])))];
}
export async function acquireOfficial(record: InspectedRecord, selection: DatasetSelection, signal?: AbortSignal, get: ApiGet = officialGet): Promise<AcquiredData> {
  validateDatasetSelection(record.metadata.connector,selection);
  const m = { ...record.metadata, scope:"selected_data" }, id = m.record_id, max = Number(setting("DREAMATIC_ACQUISITION_MAX_ROWS"));
  const parameters: Record<string,string> = {}, limitations = ["Official transport does not establish suitability; verify definitions, population, units and license. Missing values remain missing."];
  let url = "", rows: string[][] | undefined;
  if (["kaggle","zenodo"].includes(m.connector)) {
    if (!m.license || /^(?:unknown|other|unspecified)/i.test(m.license)) throw new Error("数据集许可未知或不明确，不能自动下载用于作品");
    const file = record.files.find(f => f.name === selection.file);
    if (!file || !/\.(csv|tsv|xlsx|json|txt|md|pdf|docx)$/i.test(file.name)) throw new Error("先检查文件列表，再明确选择支持的数据文件");
    if (file.size && file.size > Number(setting("DREAMATIC_MAX_FETCH_BYTES"))) throw new Error("选定文件超过下载字节上限");
    parameters.file = file.name;
    if (m.connector === "kaggle") {
      if (!m.version || !/^\d+$/.test(m.version)) throw new Error("Kaggle 数据集缺少可固定的版本编号");
      url = `https://www.kaggle.com/api/v1/datasets/download/${id}/${enc(file.name)}?datasetVersionNumber=${m.version}`;
    } else { if (!file.url || new URL(file.url).hostname !== "zenodo.org") throw new Error("无效的 Zenodo 文件地址"); url=file.url; }
    const response=await get(url,signal);
    return {catalog:record,response,format:file.name.split(".").at(-1)!.toLowerCase(),metadata:m,parameters,limitations};
  }
  const {from,to}=selectedYears(selection); Object.assign(parameters,{from,to});
  parameters.country=selection.country!;
  if (m.connector === "worldbank") url=`https://api.worldbank.org/v2/country/${selection.country}/indicator/${code(id)}?format=json&date=${from}:${to}&per_page=${max}&page=1`;
  else if (m.connector === "who") url=`https://ghoapi.azureedge.net/api/${code(id)}?$top=${max}&$filter=${enc(`SpatialDim eq '${selection.country}' and TimeDim ge ${from} and TimeDim le ${to}`)}`;
  else if (m.connector === "unsdg") url=`https://unstats.un.org/SDGAPI/v1/sdg/Series/Data?seriesCode=${code(id)}&areaCode=${selection.country}&timePeriodStart=${from}&timePeriodEnd=${to}&pageSize=${max}&page=1`;
  else if (m.connector === "eurostat") {
    const params=new URLSearchParams({lang:"EN",geo:selection.country!,sinceTimePeriod:from,untilTimePeriod:to});
    for(const [key,value] of Object.entries(selection.filters ?? {})) { if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || ["geo","lang","sinceTimePeriod","untilTimePeriod"].includes(key)) throw new Error("无效 Eurostat 维度过滤器"); params.set(key,value); parameters[key]=value; }
    url=`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${code(id)}?${params}`;
  } else throw new Error("此来源不支持数据切片，请使用文章/官方页面阅读工具");
  const {data,response}=await json(url,signal,get);
  if(m.connector === "worldbank") {
    if (!Array.isArray(data?.[1]) || Number(data[0]?.pages)>1) throw new Error("World Bank 切片不完整，请缩小范围");
    rows=objectRows(data[1].map((r:any)=>({country:r.country?.value,country_code:r.countryiso3code,year:r.date,indicator:r.indicator?.value,value:r.value,unit:r.unit,decimal:r.decimal,obs_status:r.obs_status})));
    m.version=data[0]?.lastupdated ?? null;
  } else if(m.connector === "who") {
    if(!Array.isArray(data.value) || data["@odata.nextLink"] || data.value.length >= max) throw new Error("WHO 切片可能不完整，请缩小范围");
    rows=objectRows(data.value);
  } else if(m.connector === "unsdg") {
    if(!Array.isArray(data.data) || (Number(data.totalElements)>data.data.length || Number(data.totalPages)>1 || data.data.length>=max)) throw new Error("UN SDG 切片不完整，请缩小范围");
    rows=objectRows(data.data);
  } else {
    if(!Array.isArray(data.id) || !Array.isArray(data.size) || !data.value) throw new Error("Eurostat JSON-stat 响应无效");
    const total=data.size.reduce((a:number,b:number)=>a*b,1);
    if(total>max) throw new Error("Eurostat 切片过大，请明确 age/sex/unit 等维度");
    rows=[[...data.id,"value","status"]];
    const dimensions=data.id.map((dim:string)=> {const c=data.dimension[dim].category; return {index:Array.isArray(c.index)?c.index:Object.keys(c.index).sort((a,b)=>c.index[a]-c.index[b]),labels:c.label};});
    for(let i=0;i<total;i++) { let rest=i; const coords=new Array(data.id.length); for(let j=data.id.length-1;j>=0;j--){ const d=rest%data.size[j];rest=Math.floor(rest/data.size[j]);const key=dimensions[j].index[d];coords[j]=`${key}: ${dimensions[j].labels?.[key] ?? key}`;} rows.push([...coords,clean(data.value[i]),clean(data.status?.[i])]); }
    m.version=data.updated ?? null;
  }
  if(rows.length-1>max) throw new Error("数据切片超过行数上限");
  return {catalog:record,response,rows,metadata:m,parameters,limitations};
}

/** Resolve a known record against official metadata before admitting it as a candidate. */
export async function verifyOfficialRecord(target:string, recordId:string, signal?:AbortSignal, get:ApiGet=officialGet):Promise<SearchHit> {
  const source=connectorId(target), id=recordId.trim();
  if(source==='worldbank') {
    const {data}=await json(`https://api.worldbank.org/v2/indicator/${code(id)}?format=json`,signal,get);
    const record=data?.[1]?.find((r:any)=>r.id===id);
    if(!record?.name)throw new Error('World Bank 官方记录未返回匹配指标编号');
    return hit(source,id,record.name,`https://data.worldbank.org/indicator/${id}`,record.sourceNote ?? '',record.sourceOrganization || 'World Bank');
  }
  if(source==='unsdg') {
    const {data}=await json('https://unstats.un.org/SDGAPI/v1/sdg/Series/List?all=true',signal,get);
    const record=Array.isArray(data)?data.find(r=>r.code===code(id)):undefined;
    if(!record)throw new Error('UN SDG 官方记录未返回匹配序列编号');
    return hit(source,id,record.description,`https://unstats.un.org/SDGAPI/v1/sdg/Series/Data?seriesCode=${id}`,'Official verified series','UNSD',null,record.release ?? null);
  }
  if(source==='eurostat')return (await searchOfficial(source,code(id),signal,get))[0];
  if(source==='pubmed') {
    if(!/^\d+$/.test(id))throw new Error('PubMed 记录编号必须为 PMID 数字');
    const {data}=await json(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${id}`,signal,get);
    const record=data.result?.[id];if(!record?.title || record.error)throw new Error('PubMed 官方题录未返回匹配 PMID');
    return hit(source,id,record.title,`https://pubmed.ncbi.nlm.nih.gov/${id}/`,'Official verified bibliographic record; abstract/full text requires collection.',record.fulljournalname ?? null);
  }
  if(source==='who') {
    const {data}=await json(`https://ghoapi.azureedge.net/api/Indicator?$filter=${enc(`IndicatorCode eq '${code(id)}'`)}`,signal,get);
    const record=data.value?.find((r:any)=>r.IndicatorCode===id);
    if(!record)throw new Error('WHO 官方记录未返回匹配指标');
    return hit(source,id,record.IndicatorName,`https://ghoapi.azureedge.net/api/${id}`,'Official verified indicator','WHO');
  }
  if(source==='kaggle'||source==='zenodo') {
    if(source==='kaggle' && !/^[\w-]+\/[\w.-]+$/.test(id))throw new Error('Kaggle 编号须为 owner/dataset');
    if(source==='zenodo' && !/^\d+$/.test(id))throw new Error('Zenodo 编号须为数字记录编号');
    const candidate=hit(source,id,id,source==='kaggle'?`https://www.kaggle.com/datasets/${id}`:`https://zenodo.org/records/${id}`,'Known record awaiting official verification');
    const record=await inspectOfficial(candidate,signal,get), details=record.details as any;
    if(source==='kaggle' ? details.ref!==id : String(details.id)!==id)throw new Error('官方记录编号不匹配');
    return {...candidate,title:details.title ?? details.metadata?.title ?? id,metadata:record.metadata};
  }
  throw new Error('该来源没有可核验的官方记录编号接口，请选择支持的专门来源');
}
