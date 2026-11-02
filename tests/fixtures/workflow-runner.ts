import { composition } from "./composition.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type {
  DataFacts,
  Design,
  Fact,
  Intent,
  Research,
} from "../../packages/shared/types.js";
import { renderDocument } from "../../apps/server/src/markdown-protocol.js";
import type { Runner, StageResult } from "../../apps/server/src/pi.js";
import { projectDir, upstream } from "../../apps/server/src/store.js";
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function fixtureHtml(design: Design, facts: DataFacts) {
  const fs = facts.facts;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(design.title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#e8e7e1;color:#20211d;font-family:system-ui,"PingFang SC",sans-serif}main{width:min(100%,960px);margin:auto;background:#f6f5f0;min-height:1200px;padding:64px}small{letter-spacing:.13em;color:#777a6e}h1{font-size:64px;letter-spacing:-.055em;line-height:1.1;margin:28px 0}h2{font-size:24px;font-weight:500}p{color:#73766a;line-height:1.8}.hero{border-bottom:1px solid #d5d6cb;padding-bottom:32px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:44px 0}.metric{padding:28px;background:#e7eadb;border-radius:6px}.metric b{display:block;font-size:64px;letter-spacing:-.05em}.chart{margin-top:48px}.row{display:grid;grid-template-columns:55px 1fr 44px;gap:18px;align-items:center;margin:26px 0}.track{background:#e2e3d9;height:40px}.bar{background:#d76942;height:100%;width:var(--w);animation:grow .8s ease-out}.row:last-child .bar{background:#a6bb65}.row b{font-weight:500}footer{margin-top:54px;border-top:1px solid #d5d6cb;padding-top:24px;font-size:12px}.legend{display:inline-flex;align-items:center;gap:8px}.legend:before{content:'';height:9px;width:9px;background:#d76942;border-radius:50%}@keyframes grow{from{width:0}}@media(max-width:600px){main{padding:28px}h1{font-size:44px}.metrics{gap:12px}.metric{padding:16px}.metric b{font-size:42px}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}@page{size:960px 1200px;margin:0}@media print{body{background:white}main{width:960px;margin:0}*{animation:none!important;print-color-adjust:exact}}
</style></head><body><main><header class="hero" data-component-id="heading"><small>DREAMATIC · INFO / DEMO DATA / 2021—2024</small><h1>数据变化测试</h1><p>一份关于测试数据参与的练习叙事。<br>测试数据由内置 CSV 提供，不代表任何现实城市。</p></header><section class="metrics"><article class="metric" data-component-id="metric-1" data-fact-id="fact-total"><small>2024 年参与人数</small><b>${escape(fs[0].value)}<span style="font-size:20px"> 人</span></b><p>${escape(fs[0].description)}</p></article><article class="metric" data-component-id="metric-2" data-fact-id="fact-growth"><small>相较 2021 年增长</small><b>${escape(fs[1].value)}<span style="font-size:20px"> %</span></b><p>${escape(fs[1].description)}</p></article></section><section class="chart" data-component-id="chart" data-fact-id="fact-trend"><small>01 / THE BIGGER PICTURE</small><h2>每一年，都有更多人加入。</h2><p>${escape(fs[2].description)}</p>${fs[2].series.map((s) => `<div class="row" title="${escape(s.label)}：${s.value} 人"><span>${escape(s.label)}</span><div class="track"><div class="bar" style="--w:${(s.value / Math.max(...fs[2].series.map((x) => x.value))) * 100}%"></div></div><b>${s.value}</b></div>`).join("")}<span class="legend">测试数据参与人数 / 人</span></section><footer data-component-id="source">来源：内置 reading.csv，行 2–5。数值为产品测试样例。增长率 = (294 − 120) / 120 × 100%。<br>Dreamatic · Info — From data to a story.</footer></main></body></html>`;
}
const fixtureDataRunner: (...args: Parameters<Runner>) => Promise<Omit<StageResult, "markdown">> = async (
  p,
  role,
  _config,
  { signal, event },
) => {
  await new Promise<void>((resolve, reject) => {
    const cb = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cb);
      resolve();
    }, 350);
    signal.addEventListener("abort", cb, { once: true });
  });
  signal.throwIfAborted();
  event(`测试模式 · ${role} · 使用内置 CSV 样例，不调用模型`);
  const source = p.uploads[0];
  if (!source) throw new Error("测试数据文件缺失");
  const data = await upstream(p, role);
  if (role === "chatbot") {
    const intent: Intent = {
      visual_constraints: [],
      title: "测试数据 · 生长的轨迹",
      topic: "测试数据参与趋势（测试）",
      objective: "使用内置 CSV 测试从数据到信息图的工作流",
      audience: "一般公众",
      scope: "2021—2024",
      data_requirements: "仅使用 reading.csv 测试数据",
      story_direction: "由增长概览到年度趋势",
      visual_preferences: "Dreamatic 暖灰、橙色与青柠色",
      constraints: ["所有数据标注为测试，不能用于现实结论"],
    };
    return { data: intent, notes: "需求明确，直接形成 Brief；无需补充提问。" };
  }
  if (role === "researcher") {
    const research: Research = {
      summary: "读取内置 CSV，四行年度测试参与人数，全部为测试数据。",
      sources: [
        {
          id: source.id,
          title: source.name,
          url: null,
          published_at: null,
          accessed_at: p.created_at,
          kind: "upload",
          path: source.normalized,
          fields: ["year", "readers"],
          limitations: ["合成测试数据，不代表现实统计"],
        },
      ],
      datasets: [
        {
          id: "reading",
          source_id: source.id,
          path: source.normalized,
          fields: ["year", "readers"],
          description: "年度参与人数",
        },
      ],
      limitations: ["不能外推至现实人口或因果结论"],
    };
    return { data: research, notes: research.summary };
  }
  if (role === "analyst") {
    const rows = parse(
      await readFile(path.join(projectDir(p.id), source.path), "utf8"),
      { columns: true, skip_empty_lines: true },
    ) as { year: string; readers: string }[];
    const series = rows.map((r) => ({
        label: r.year,
        value: Number(r.readers),
      })),
      first = series[0].value,
      last = series.at(-1)!.value;
    const { loadEvidenceSource } = await import("../../apps/server/src/evidence-view.js");
    const { saveCalculation } = await import("../../apps/server/src/source-calculation.js");
    const evidenceSource = await loadEvidenceSource(p, data.research.sources[0]);
    const block = evidenceSource.blocks.find(block => block.text.startsWith("year,readers"))!;
    const growthCalculation = await saveCalculation(p, evidenceSource, { operation: "change_percent", unit: "人", source_id: source.id, block_id: block.id, label_column: 0, value_column: 1 });
    const trendCalculation = await saveCalculation(p, evidenceSource, { operation: "trend", unit: "人", source_id: source.id, block_id: block.id, label_column: 0, value_column: 1 });
    const specification = (receipt: typeof growthCalculation) => ({ series_unit: receipt.series_unit, scope: `完整 CSV ${block.id}`, measure: receipt.measure, breakdown: receipt.breakdown, focus: receipt.result.focus, method: receipt.result.method, aggregation: receipt.result.aggregation as Fact["specification"]["aggregation"], distribution_kind: "none" as const, calculation_id: receipt.id });
    const base = {
      derivation: "quoted" as const,
      specification: { series_unit: "人", scope: "2021–2024 测试 CSV", measure: "readers", breakdown: "year", focus: "全部对象", method: "原文引用", aggregation: "none" as const, distribution_kind: "none" as const, calculation_id: null },
      unit: "人",
      evidence: [
        {
          source_id: source.id,
          quote: rows.map((r) => `${r.year},${r.readers}`).join("\n"),
          location: "CSV 行 2–5",
        },
      ],
      context: "内置测试数据，不是现实统计",
      source_ids: [source.id],
      importance: 0.9,
      confidence: { score: 1, reason: "来自可复算的测试 CSV，仅对样例有效" },
      series,
    };
    const facts: Fact[] = [
      {
        ...base,
        id: "fact-total",
        title: "2024 年：294 位参与者",
        type: "value",
        description: "测试样例的最后一年参与人数。",
        value: last,
        analysis: "取最后一行 readers 字段。",
        relations: [
          {
            target_id: "fact-trend",
            type: "contains",
            basis: "年度序列包含该年份",
          },
        ],
      },
      {
        ...base,
        id: "fact-growth",
        derivation: "computed",
        specification: specification(growthCalculation),
        evidence: [{ source_id: source.id, quote: rows.map(r => `${r.year},${r.readers}`).join("\n"), location: `CSV 行 2–5；${block.id}` }],
        title: "四年间增长 145%",
        type: "comparison",
        description: "从 120 到 294，参与人数增长 145%。",
        value: Math.round(((last - first) / first) * 100),
        unit: "%",
        analysis: `(${last}−${first})/${first}×100%`,
        relations: [
          {
            target_id: "fact-total",
            type: "comparison",
            basis: "末年数值相较首年",
          },
        ],
      },
      {
        ...base,
        id: "fact-trend",
        derivation: "computed",
        specification: specification(trendCalculation),
        unit: trendCalculation.unit,
        evidence: [{ source_id: source.id, quote: rows.map(r => `${r.year},${r.readers}`).join("\n"), location: `CSV 行 2–5；${block.id}` }],
        title: "连续四年增长",
        type: "trend",
        description: "2021—2024 年，样例参与人数逐年上升。",
        value: trendCalculation.result.value,
        analysis: "逐行比较相邻年份，无下降。",
        relations: [
          {
            target_id: "fact-growth",
            type: "context",
            basis: "趋势为总体增幅提供上下文",
          },
        ],
      },
    ];
    return {
      data: { summary: "三条可复算的测试事实，包含两类关联。", facts },
      notes: "保留原始 CSV 行号与计算公式；没有因果推断。",
    };
  }
  if (role === "designer") {
    const component = (
      id: string,
      type: any,
      fact_ids: string[],
      y: number,
      height: number,
      x = 64,
      width = 832,
    ) => ({
      id,
      type,
      asset_ids: [], parent_id: null,
      story_ids: fact_ids.length ? [fact_ids.includes("fact-trend") ? "story-evidence" : "story-intro"] : [],
      fact_ids,
      title: id,
      description: "测试参与叙事",
      layout: { x, y, width, height },
      mapping: {
        label_field: type === "metric" ? "title" : "series.label",
        value_field: type === "metric" ? "value" : "series.value",
        unit: type === "metric" && fact_ids[0] === "fact-growth" ? "%" : "人",
      },
      interaction: { trigger: "hover", behavior: "显示年度与人数" },
      animation: {
        trigger: "load",
        behavior: "条形从零展开；减少动态偏好时禁用",
      },
    });
    const design: Design = { composition,
      narrative_rationale: "先概览规模与增长，再展示逐年证据，避免只看终点。",
      title: "数据变化测试",
      theme: "测试数据参与趋势（测试）",
      storyline: [
        {
          rationale: "先用总量和增长率交代变化规模。",
          id: "story-intro",
          title: "看见增长",
          description: "核心人数与整体增长率",
          fact_ids: ["fact-total", "fact-growth"],
        },
        {
          rationale: "紧接总览逐年展开证据，解释增长过程。",
          id: "story-evidence",
          title: "回到每一年",
          description: "年度比较展示增长路径",
          fact_ids: ["fact-trend"],
        },
      ],
      page: { width: 960, height: 1200, background: "#f6f5f0" },
      palette: ["#20211d", "#d76942", "#c9e46b"],
      font: "system-ui, PingFang SC, sans-serif",
      components: [
        component("heading", "heading", [], 64, 240),
        component("metric-1", "metric", ["fact-total"], 340, 200, 64, 400),
        component("metric-2", "metric", ["fact-growth"], 340, 200, 496, 400),
        component("chart", "bar", ["fact-trend"], 590, 400),
        component("source", "text", [], 1040, 96),
      ],
      assets: [],
    };
    return {
      data: design,
      notes:
        "以两项核心指标建立概览，再以零基线条形图展开年度证据。暖灰背景、橙色主图与青柠色终点强调。SVG/CSS 保持可打印。",
    };
  }
  return {
    data: {
      html: fixtureHtml(data.design, data.datafacts),
      summary: "响应式单页信息图；自包含 CSS、可打印。",
    },
    notes: "作品使用内置测试数据；核心值、趋势和增长计算均保留。",
  };
};

export const fixtureRunner: Runner = async (...args) => {
  const result = await fixtureDataRunner(...args);
  return { ...result, markdown: renderDocument(args[1], result.data, result.notes) };
};
