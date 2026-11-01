import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { cartesianChart } from "../packages/shared/chart-geometry.js";
import FactChart, { hasFactChart } from "../apps/web/src/FactChart.js";
import type { Fact } from "../packages/shared/types.js";
import { embedVisualizationRuntime, visualizationGuide, visualizationRuntimeInfo } from "../apps/server/src/visualization-runtime.js";
const root = await mkdtemp(path.join(os.tmpdir(), "info-d3-test-"));
process.env.INFO_CONFIG_DIR = root;
after(() => rm(root, { recursive: true, force: true }));
const observation = (value: number, label = String(value)) => ({ label, value });
const fact: Fact = { id: "F-test", title: "Original observations", type: "trend", derivation: "quoted", value: "increasing", unit: "趋势", series: [observation(10, "2020"), observation(20, "2021"), observation(40, "2024")], specification: { series_unit: "万元", scope: "Complete test series", measure: "amount", breakdown: "year", focus: "2024", method: "Original data", aggregation: "none", distribution_kind: "none", calculation_id: null }, description: "Test only", analysis: "Test only", context: "Test only", source_ids: [], evidence: [], relations: [], importance: 1, confidence: { score: 1, reason: "Test fixture" } };
const render = (value: Fact) => renderToStaticMarkup(createElement(FactChart, { fact: value }));
test("D3 bars represent negatives and zeros from the zero baseline without discarding observations", () => {
  for (const kind of ["bar", "rank"] as const) {
    const chart = cartesianChart([-20, 0, 40].map(value => observation(value)), kind);
    assert.equal(chart.points.length, 3);
    for (const point of chart.points) {
      assert.ok([point.x, point.y, point.width, point.height].every(Number.isFinite));
      assert.ok(point.width >= 0 && point.height >= 0);
    }
    const [negative, zero, positive] = chart.points;
    if (chart.horizontal) { assert.equal(negative.x + negative.width, chart.zero); assert.equal(positive.x, chart.zero); assert.equal(zero.width, 0); }
    else { assert.equal(negative.y, chart.zero); assert.equal(positive.y + positive.height, chart.zero); assert.equal(zero.height, 0); }
  }
  const zeros = cartesianChart([observation(0), observation(0)], "bar");
  assert.ok(zeros.ticks.length > 1); assert.ok(zeros.points.every(point => point.height === 0));
});
test("D3 lines use elapsed time, retain supplied order and reject invalid chronology", () => {
  const chart = cartesianChart(fact.series, "line");
  assert.equal(chart.elapsedTime, true);
  const [a, b, c] = chart.points;
  const actualRatio = (Date.UTC(2021, 0, 1) - Date.UTC(2020, 0, 1)) / (Date.UTC(2024, 0, 1) - Date.UTC(2020, 0, 1));
  assert.ok(Math.abs((b.x - a.x) / (c.x - a.x) - actualRatio) < 1e-12);
  assert.ok(chart.path?.startsWith("M"));
  assert.throws(() => cartesianChart([...fact.series].reverse(), "line"), /不会自动重排/);
  assert.throws(() => cartesianChart([observation(1, "2024-02-30")], "line"), /无效日期/);
  assert.throws(() => cartesianChart([observation(1, "2024"), observation(2, "2024")], "line"), /未严格递增/);
});
test("duplicate categories, constant/single-point lines and dense series retain every observation", () => {
  const duplicates = cartesianChart([observation(1, "same"), observation(2, "same")], "rank");
  assert.notEqual(duplicates.points[0].y, duplicates.points[1].y);
  assert.deepEqual(duplicates.points.map(point => point.value), [1, 2]);
  for (const series of [[observation(3, "2024")], [observation(3, "A"), observation(3, "B")]]) {
    const chart = cartesianChart(series, "line"); assert.ok(chart.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))); assert.doesNotMatch(chart.path!, /NaN|Infinity/);
  }
  const dense = cartesianChart(Array.from({ length: 40 }, (_, index) => observation(index, `category-${index}`)), "bar");
  assert.equal(dense.points.length, 40); assert.ok(dense.labels.length < 40); assert.equal(dense.labels.at(-1)?.index, 39);
  assert.throws(() => cartesianChart([observation(NaN)], "bar"), /非有限/);
  assert.throws(() => cartesianChart([observation(-1e308), observation(1e308)], "bar"), /跨度/);
});
test("fact charts preserve original values and series units, with a readable fallback for invalid data", () => {
  const html = render(fact), $ = load(html);
  assert.equal($('[data-chart-engine="d3"]').length, 1); assert.equal($("tbody tr").length, 3);
  assert.match($("tbody").text(), /202420 万元|202440 万元/);
  assert.match($("svg > title").text(), /万元/); assert.doesNotMatch($("tbody").text(), /趋势/);
  assert.equal($('[data-chart-point][tabindex="0"]').length, 3);
  const fallback = render({ ...fact, series: [observation(1, "2024-02-30")] });
  assert.match(fallback, /无效日期/); assert.match(fallback, /2024-02-30/); assert.doesNotMatch(fallback, /<svg/);
});
test("percentage donuts handle 0 and 100 and never treat mixed units or unpaired correlations as charts", () => {
  for (const value of [0, 35, 100]) {
    const html = render({ ...fact, type: "proportion", value, unit: "%" });
    assert.match(html, /data-chart-kind="donut"/); assert.doesNotMatch(html, /NaN|Infinity/);
    assert.match(html, /数学余量/); assert.match(html, new RegExp(`占比：${value}%`));
  }
  assert.equal(hasFactChart({ ...fact, type: "proportion", value: 2, unit: "倍" }), false);
  assert.equal(hasFactChart({ ...fact, type: "proportion", value: 101, unit: "%" }), false);
  assert.equal(hasFactChart({ ...fact, type: "correlation" }), false);
  assert.equal(hasFactChart({ ...fact, type: "distribution", specification: { ...fact.specification, series_unit: "万元、%" } }), false);
});
const html = `<!doctype html><html><head><title>D3 offline verification</title></head><body><h1>Original observations</h1><p>Test-only values, not product examples.</p><svg id="chart" viewBox="0 0 300 100"></svg><script>const values = [10,20,40]; const scale = d3.scaleLinear().domain([0,40]).range([0,300]); d3.select('#chart').selectAll('rect').data(values).join('rect').attr('x',0).attr('y',(_,i)=>i*30).attr('width',scale).attr('height',20);</script></body></html>`;
test("Builder embeds the pinned licensed runtime once before authored scripts and produces an idempotent self-contained file", async () => {
  const saved = await embedVisualizationRuntime(html), $ = load(saved), info = await visualizationRuntimeInfo();
  assert.equal(info.version, "7.9.0"); assert.equal(info.digest.length, 64);
  assert.equal($("head meta[charset]").attr("charset"), "utf-8");
  assert.equal($("script").first().attr("data-dreamatic-runtime"), "d3");
  assert.match($("script").first().text(), /ISC License/);
  assert.equal($("script[src],link[href]").length, 0);
  assert.equal(await embedVisualizationRuntime(saved), saved);
  assert.match(await visualizationGuide(), /d3@7\.9\.0/);
  await assert.rejects(embedVisualizationRuntime(html.replace("</head>", '<script src="https://cdn.example/d3.js"></script></head>')), /inlined/);
});
test("embedded D3 renders under the production preview CSP without requests and exports a PDF", async () => {
  const { chromium } = await import("playwright"), { browserOptions } = await import("../apps/server/src/browser.js"), { previewCsp } = await import("../apps/server/src/export.js");
  const browser = await chromium.launch({ headless: true, ...await browserOptions() });
  try {
    const page = await browser.newPage(), requests: string[] = [], errors: string[] = [];
    page.on("request", request => requests.push(request.url())); page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.abort());
    const saved = await embedVisualizationRuntime(html);
    await page.setContent(saved.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${previewCsp}">`));
    assert.deepEqual(await page.locator("#chart rect").evaluateAll(elements => elements.map(element => Number(element.getAttribute("width")))), [75, 150, 300]);
    assert.deepEqual(requests, []); assert.deepEqual(errors, []);
    const pdf = await page.pdf({ width: "400px", height: "300px", printBackground: true });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); assert.ok(pdf.length > 2000);
  } finally { await browser.close(); }
});
