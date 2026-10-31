import { load } from "cheerio";
import { publicGet, publicUrl, type WebResponse } from "./public-http.js";
import { setting } from "./config-store.js";
import { extractSource } from "./document-reader.js";
/** Site-specific official endpoints, never arbitrary user-supplied API URLs. */
export function scholarlyTarget(url: string) {
  const target = publicUrl(url);
  const pmc = ["pmc.ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov"].includes(target.hostname) && /\/(?:pmc\/)?articles\/(PMC\d+)(?:\/|$)/i.exec(target.pathname);
  if (pmc) return { id: pmc[1].toUpperCase(), fulltext: true, endpoint: `https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/bioc_xml/${pmc[1].toUpperCase()}/unicode` };
  const pubmed = target.hostname === "pubmed.ncbi.nlm.nih.gov" && /^\/(\d+)(?:\/|$)/.exec(target.pathname);
  if (pubmed) return { id: pubmed[1], fulltext: false, endpoint: `https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pubmed.cgi/bioc_xml/${pubmed[1]}/unicode` };
}
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function biocResponse(input: WebResponse, original: string): WebResponse {
  const target = scholarlyTarget(original);
  if (!target) throw new Error("不支持的学术来源");
  const $ = load(input.text, { xml: true });
  const documents = $("collection > document");
  const documentId = documents.children("id").first().text().trim().toUpperCase();
  // BioC's PMC corpus legitimately uses both PMC-prefixed and numeric document IDs.
  const matches = target.fulltext ? /^(?:PMC)?[1-9]\d*$/.test(documentId) && documentId.replace(/^PMC/, "") === target.id.slice(3) : documentId === target.id;
  const articleId = documents.find("passage > infon[key='article-id_pmc']").first().text().trim().toUpperCase();
  if ((input.status ?? 200) >= 400 || documents.length !== 1 || !matches || (target.fulltext && articleId && articleId.replace(/^PMC/, "") !== target.id.slice(3))) throw new Error(`${target.fulltext ? "PMC 官方开放全文" : "PubMed 官方摘要"}接口没有返回匹配记录（${target.id}）；接口无记录不代表浏览器不能打开该页面，请改用其他公开来源或上传原文`);
  const passages = documents.children("passage");
  let title = "", paragraphs = 0, body = "";
  passages.each((_i, element) => {
    const passage = $(element), text = passage.children("text").text().trim();
    const type = passage.children("infon[key='type']").text(), section = passage.children("infon[key='section_type']").text();
    if (!text) return;
    if ((section === "TITLE" || type === "title") && !title) { title = text; body += `<h1>${escape(text)}</h1>`; }
    else { const heading = /title/i.test(type); body += `<${heading ? "h2" : "p"}>${escape(text)}</${heading ? "h2" : "p"}>`; if (!heading) paragraphs++; }
  });
  if (!title || !paragraphs || (target.fulltext && !passages.toArray().some(p => /^(?:INTRO|METHODS|RESULTS|DISCUSS|CONCL|CASE|BODY)$/.test($(p).children("infon[key='section_type']").text()) && $(p).children("text").text().trim()))) throw new Error(`官方接口未返回可确认的${target.fulltext ? "全文" : "摘要"}（${target.id}）`);
  const license = documents.children("infon[key='license']").text().trim();
  const limitations = target.fulltext
    ? ["官方 BioC 开放全文按文本段落转换；表格版式、图片和补充材料可能不完整，相关数据须核对原文。"]
    : ["官方 PubMed 接口仅提供题录与摘要，未取得论文全文，不可作为已读全文使用。"];
  if (license) limitations.push(`官方记录许可：${license}；具体使用条件以原文许可声明为准。`);
  const text = `<html><head><meta charset="utf-8"><title>${escape(title)}${target.fulltext ? "" : " [摘要]"}</title></head><body><article>${body}</article></body></html>`;
  const output = { ...input, text, buffer: Buffer.from(text), contentType: "text/html; charset=utf-8", raw_text: input.text, reader: "ncbi-bioc", content_scope: target.fulltext ? "fulltext" as const : "abstract" as const, limitations, redirect_chain: [original, ...(input.redirect_chain ?? [input.url])], diagnostics: [target.fulltext ? "通过官方 PMC Open Access BioC 接口读取全文" : "通过官方 PubMed BioC 接口读取摘要；不是全文"] };
  if (extractSource(output).quality.status !== "accepted") throw new Error("官方学术接口返回的正文不足，未登记为有效资料");
  return output;
}
let nextRequest = 0;
export async function readScholarly(url: string, parent: AbortSignal, get = publicGet): Promise<WebResponse> {
  const target = scholarlyTarget(url);
  if (!target) throw new Error("不支持的学术来源");
  const signal = AbortSignal.any([parent, AbortSignal.timeout(Number(setting("DREAMATIC_WEB_SCHOLARLY_TIMEOUT_MS")))]);
  // Conservative global pacing across projects; avoids concurrent retries hammering the public API.
  const delay = Math.max(0, nextRequest - Date.now()); nextRequest = Math.max(Date.now(), nextRequest) + 500;
  if (delay) await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delay);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  return biocResponse(await get(target.endpoint, signal), url);
}
