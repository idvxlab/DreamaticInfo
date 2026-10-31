import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const root = await mkdtemp(path.join(os.tmpdir(), "info-scholarly-"));
process.env.INFO_CONFIG_DIR = root;
const { scholarlyTarget, biocResponse } = await import("../apps/server/src/scholarly-reader.js");
const { readWebPage } = await import("../apps/server/src/web-reader.js");
const { extractSource } = await import("../apps/server/src/document-reader.js");
const paragraph = "A documented public study describes its methods, findings, sources and limitations. ".repeat(8);
const xml = (id = "PMC12345678", fulltext = true) => `<collection><document><id>${id}</id><infon key="license">CC BY</infon><passage><infon key="section_type">TITLE</infon><infon key="type">title</infon><text>Deterministic study &amp; evidence</text></passage><passage><infon key="section_type">${fulltext ? "RESULTS" : "ABSTRACT"}</infon><infon key="type">paragraph</infon><text>${paragraph}</text></passage></document></collection>`;
const response = (text: string) => ({ text, buffer: Buffer.from(text), url: "https://www.ncbi.nlm.nih.gov/official-api", contentType: "text/xml", status: 200 });
try {
  await test("BioC converts matched article passages to traceable readable Markdown and retains original XML and license", () => {
    const result = biocResponse(response(xml()), "https://pmc.ncbi.nlm.nih.gov/articles/PMC12345678/");
    assert.equal(result.content_scope, "fulltext");
    assert.equal(biocResponse(response(xml("12345678")), "https://pmc.ncbi.nlm.nih.gov/articles/PMC12345678/").content_scope, "fulltext"); assert.equal(result.raw_text, xml()); assert.equal(result.url, "https://www.ncbi.nlm.nih.gov/official-api");
    assert.match(result.limitations!.join(" "), /CC BY/); assert.equal(extractSource(result).quality.status, "accepted"); assert.equal(extractSource(result).title, "Deterministic study & evidence"); assert.match(extractSource(result).markdown, /A documented public study/);
  });
  await test("BioC refuses help/error pages, wrong article identities and abstract-only PMC responses", () => {
    const url = "https://pmc.ncbi.nlm.nih.gov/articles/PMC12345678/";
    assert.throws(() => biocResponse(response("[Error] No result can be found. " + paragraph), url), /没有返回匹配记录/);
    assert.throws(() => biocResponse(response(xml("PMC87654321")), url), /没有返回匹配记录/);
    assert.throws(() => biocResponse(response(xml("PMC12345678", false)), url), /未返回可确认的全文/);
    assert.equal(scholarlyTarget("https://pmc.ncbi.nlm.nih.gov.attacker.example/articles/PMC12345678/"), undefined);
  });
  await test("PubMed is explicitly marked abstract-only; PMC uses its official API without scraping the article page", async () => {
    const abstract = biocResponse(response(xml("98765", false)), "https://pubmed.ncbi.nlm.nih.gov/98765/");
    assert.equal(abstract.content_scope, "abstract"); assert.match(abstract.limitations!.join(" "), /未取得论文全文/);
    let browsers = 0;
    const result = await readWebPage("https://pmc.ncbi.nlm.nih.gov/articles/PMC12345678/", undefined, async url => { assert.match(url, /pmcoa.cgi\/bioc_xml\/PMC12345678\/unicode$/); return response(xml()); }, async () => { browsers++; throw new Error("must not scrape PMC"); });
    assert.equal(result.reader, "ncbi-bioc"); assert.equal(browsers, 0);
  });
} finally { await rm(root, { recursive: true, force: true }); }
