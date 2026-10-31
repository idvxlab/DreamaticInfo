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
export function validateHtml(html: string, design?: Design, facts?: DataFacts) {
  if (typeof html !== "string" || html.length < 200 || html.length > 15_000_000)
    throw new Error("Invalid HTML size");
  const $ = load(html);
  if (!$("title").text().trim() || !$("body").text().trim())
    throw new Error("HTML needs a title and content");
  if ($('iframe,object,embed,base,form,meta[http-equiv="refresh"]').length)
    throw new Error("Unsupported embedded HTML");
  if ($("script[src],link[href]").length)
    throw new Error("External dependencies must be inlined");
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
        throw new Error("Resources must be embedded as data URLs");
    }
  }
  if (/@import\b|url\(\s*['"]?(?!data:|#)/i.test($("style").text()))
    throw new Error("Remote CSS resources prohibited");
  if (design)
    for (const c of design.components)
      if (
        !$("[data-component-id]")
          .toArray()
          .some((el) => $(el).attr("data-component-id") === c.id)
      )
        throw new Error(`Missing design component ${c.id}`);
  if (design && facts)
    for (const id of new Set(design.components.flatMap((c) => c.fact_ids)))
      if (
        !$("[data-fact-id]")
          .toArray()
          .some((el) => $(el).attr("data-fact-id") === id)
      )
        throw new Error(`Missing fact ${id}`);
}
