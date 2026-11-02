import { cssResourceIssues } from "./css-resources.js";
import { structureIssues } from "../../../packages/shared/structure.js";
import { designReferenceIssues } from "./design-validation.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Ajv } from "ajv";
import { load } from "cheerio";
import type {
  DataFacts,
  Design,
  Research,
  Role,
} from "../../../packages/shared/types.js";
export const names: Record<Role, string> = {
  chatbot: "intent",
  researcher: "research",
  analyst: "datafacts",
  designer: "design",
  builder: "delivery",
};
const ajv = new Ajv({ allErrors: true, strict: false });
export const schemas = Object.fromEntries(
  ["intent", "research", "datafacts", "design", "task-state"].map((n) => [
    n,
    JSON.parse(
      readFileSync(
        new URL(`../../../schemas/${n}.schema.json`, import.meta.url),
        "utf8",
      ),
    ),
  ]),
);
const validators = Object.fromEntries(
  Object.entries(schemas).map(([n, s]) => [n, ajv.compile(s)]),
);
export const hash = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export function schemaErrors(name: string, value: unknown) {
  const fn = validators[name];
  if (!fn) throw new Error(`Unknown schema ${name}`);
  fn(value);
  return [...(fn.errors ?? [])];
}
export function validate(name: string, value: unknown) {
  const fn = validators[name];
  if (!fn?.(value))
    throw new Error(`${name} Schema: ${ajv.errorsText(fn?.errors)}`);
}
const unique = (xs: string[], label: string) => {
  if (xs.some((x) => !x.trim()) || new Set(xs).size !== xs.length)
    throw new Error(`${label} IDs must be nonempty and unique`);
};
export function validateReferences(
  role: Role,
  data: any,
  upstream: Record<string, any>,
) {
  if (role !== "builder") validate(names[role], data);
  if (role === "researcher") {
    const d = data as Research;
    unique(
      d.sources.map((x) => x.id),
      "Source",
    );
    unique(
      d.datasets.map((x) => x.id),
      "Dataset",
    );
    for (const ds of d.datasets)
      if (!d.sources.some((s) => s.id === ds.source_id))
        throw new Error("Unknown dataset source");
  }
  if (role === "analyst") {
    const d = data as DataFacts,
      sources = new Set(
        (upstream.research as Research).sources.map((x) => x.id),
      );
    unique(
      d.facts.map((x) => x.id),
      "Fact",
    );
    for (const f of d.facts) {
      const structural = structureIssues(f);
      if (structural.length) throw new Error(structural.join("；"));
      if (
        !f.source_ids.length ||
        !f.evidence.length ||
        f.source_ids.some((x) => !sources.has(x))
      )
        throw new Error("Fact requires traceable sources and evidence");
      if (
        f.evidence.some(
          (e) =>
            !f.source_ids.includes(e.source_id) ||
            !e.quote.trim() ||
            !e.location.trim(),
        )
      )
        throw new Error("Incomplete evidence");
      for (const rel of f.relations)
        if (
          !d.facts.some((x) => x.id === rel.target_id) ||
          rel.target_id === f.id ||
          !rel.basis.trim()
        )
          throw new Error("Invalid fact relation");
    }
  }
  if (role === "designer") {
    const issues = designReferenceIssues(data as Design, upstream.datafacts as DataFacts);
    if (issues.length) throw new Error(issues.map(issue => `${issue.location}：${issue.message}；修正要求：${issue.fix}`).join("\n"));
  }

  if (role === "builder")
    validateHtml(data.html, upstream.design, upstream.datafacts);
}
export class HtmlValidationError extends Error {
  constructor(readonly issues: string[]) { super(issues.join("\n")); }
}
export function validateHtml(html: string, design?: Design, facts?: DataFacts) {
  if (typeof html !== "string" || html.length < 200 || html.length > 15_000_000)
    throw new HtmlValidationError(["Invalid HTML size"]);
  const issues: string[] = [];
  const add = (message: string) => { issues.push(message); };
  const $ = load(html);
  if (!$("title").text().trim() || !$("body").text().trim())
    add("HTML needs a title and content");
  if ($('iframe,object,embed,base,form,meta[http-equiv="refresh"]').length)
    add("Unsupported embedded HTML");
  if ($("script[src],link[href]").length)
    add("External dependencies must be inlined");
  for (const el of $("[src],[srcset],[href],[poster]")) {
    const a = $(el).attr();
    for (const key of ["src", "srcset", "href", "poster"]) {
      const v = a?.[key];
      if (
        v &&
        !v.startsWith("#") &&
        !v.startsWith("data:") &&
        !(key === "href" && el.tagName === "a" && /^https?:\/\//.test(v))
      )
        add("Resources must be embedded as data URLs");
    }
  }
  for (const el of $("style")) issues.push(...cssResourceIssues($(el).text()));
  for (const el of $('[style]')) issues.push(...cssResourceIssues($(el).attr('style') ?? '', true));
  if (design) {
    if ($("[data-unimplemented]").length) add("Final delivery contains unfinished sample regions");
    for (const asset of design.assets) if (!$('[data-asset-id]').toArray().some(el => $(el).attr('data-asset-id') === asset.id)) add(`Missing asset or declared fallback ${asset.id}`);
    for (const el of $('[data-asset-id]')) if (!design.assets.some(a => a.id === $(el).attr('data-asset-id'))) add('Unknown asset use');
  }
  if (design)
    for (const c of design.components)
      if (
        !$("[data-component-id]")
          .toArray()
          .some((el) => $(el).attr("data-component-id") === c.id)
      )
        add(`Missing design component ${c.id}`);
  // One chart may encode several official facts. Match complete ID tokens, never substrings.
  const markedFacts = new Set($("[data-fact-id]").toArray().flatMap(el =>
    ($(el).attr("data-fact-id") ?? "").trim().split(/\s+/).filter(Boolean)));
  if (design && facts)
    for (const id of new Set(design.components.flatMap((c) => c.fact_ids)))
      if (!markedFacts.has(id))
        add(`Missing fact ${id}：请在对应内容元素的 data-fact-id 中标记该完整事实编号；多个编号用空格分隔。save_html 尚未接受，请修复后再次保存，再调用 check_render`);
  if (issues.length) throw new HtmlValidationError([...new Set(issues)]);
}
