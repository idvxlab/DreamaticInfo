import { composition } from "./fixtures/composition.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse } from "dotenv";
import type { Browser, LaunchOptions } from "playwright";
const root = await mkdtemp(path.join(os.tmpdir(), "info-config-wiring-"));
process.env.INFO_CONFIG_DIR = root;
const { CONFIG_FIELDS, saveRuntimeConfig, setting } =
  await import("../apps/server/src/config-store.js");
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const store = await import("../apps/server/src/store.js");
const { getModels, runtime, resetRuntime } =
  await import("../apps/server/src/pi.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { searchWeb } = await import("../apps/server/src/network.js");
const { infoImageProvider } =
  await import("../apps/server/src/image-provider.js");
const { browserOptions, exportPdf } =
  await import("../apps/server/src/export.js");
const { ingest } = await import("../apps/server/src/ingest.js");
const { developmentPorts } = await import("../apps/server/src/environment.js");
const { roles } = await import("../packages/shared/types.js");
const save = (
  values: Record<string, string>,
  secrets: Record<string, string> = {},
) => saveRuntimeConfig({ values, secrets });
const originalFetch = globalThis.fetch;
try {
  await test("every Settings field has an env example and startup disk value", async () => {
    const example = parse(await readFile(".env.example", "utf8")),
      disk = parse(await readFile(path.join(root, ".env"), "utf8"));
    assert.equal(
      new Set(CONFIG_FIELDS.map((f) => f.key)).size,
      CONFIG_FIELDS.length,
    );
    assert.deepEqual(
      Object.keys(example).sort(),
      CONFIG_FIELDS.map((f) => f.key).sort(),
    );
    for (const f of CONFIG_FIELDS) assert.equal(disk[f.key], f.defaultValue);
  });
  await test("Vite and backend use the project env ahead of process values and ignore mode overlays", async () => {
    const dir = path.join(root, "ports");
    await mkdir(dir);
    await writeFile(
      path.join(dir, ".env"),
      "PORT=4615\nDREAMATIC_WEB_PORT=5615\n",
    );
    await writeFile(
      path.join(dir, ".env.local"),
      "PORT=9999\nDREAMATIC_WEB_PORT=9998\n",
    );
    assert.deepEqual(
      developmentPorts(dir, { PORT: "8111", DREAMATIC_WEB_PORT: "8112" }),
      { api: 4615, web: 5615 },
    );
    assert.equal(
      CONFIG_FIELDS.find((f) => f.key === "PORT")?.restartRequired,
      true,
    );
    assert.equal(
      CONFIG_FIELDS.find((f) => f.key === "DREAMATIC_WORKSPACE")
        ?.restartRequired,
      true,
    );
  });
  await test("all five role connections consume independent endpoint, key, model and thinking config", async () => {
    const values: Record<string, string> = {
        DREAMATIC_PROVIDER_TYPE: "openai-responses",
        DREAMATIC_CONTEXT_WINDOW: "16000",
        DREAMATIC_MAX_TOKENS: "4321",
        DREAMATIC_MODEL_REASONING: "true",
      },
      secrets: Record<string, string> = {};
    for (const role of roles) {
      const suffix = role.toUpperCase();
      Object.assign(values, {
        [`DREAMATIC_BASE_URL_${suffix}`]: `https://${role}.example.test/v1`,
        [`DREAMATIC_MODEL_${suffix}`]: `custom-${role}`,
        [`DREAMATIC_THINKING_LEVEL_${suffix}`]: "low",
      });
      secrets[`DREAMATIC_API_KEY_${suffix}`] = `fixture-${role}`;
    }
    await save(values, secrets);
    resetRuntime();
    const rt = await runtime(),
      models = await getModels();
    for (const role of roles) {
      const c = models[role],
        m = rt.getModel(c.provider, c.model)!;
      assert.equal(c.thinkingLevel, "low");
      assert.equal(m.id, `custom-${role}`);
      assert.equal(m.api, "openai-responses");
      assert.equal(m.baseUrl, `https://${role}.example.test/v1`);
      assert.equal(m.contextWindow, 16000);
      assert.equal(m.maxTokens, 4321);
      assert.equal(m.reasoning, true);
      assert.equal((await rt.getAuth(m))?.auth.apiKey, `fixture-${role}`);
    }
  });
  await test("changing Designer Skill config invalidates its inputs, not unrelated upstream inputs", async () => {
    const skill = path.join(root, "knowledge");
    await mkdir(skill);
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: wiring-fixture\ndescription: Deterministic test knowledge\n---\nTest content.\n",
    );
    const p = await store.create("Skill configuration test", "live"),
      engine = new Orchestrator(),
      models = await getModels();
    const before = await Promise.all(
      roles.map((r) => engine.fingerprint(p, r, models)),
    );
    await save({
      DREAMATIC_SKILL_PATHS: JSON.stringify({ designer: [skill] }),
    });
    const after = await Promise.all(
      roles.map((r) => engine.fingerprint(p, r, models)),
    );
    for (let i = 0; i < roles.length; i++)
      roles[i] === "designer"
        ? assert.notEqual(after[i], before[i])
        : assert.equal(after[i], before[i]);
  });
  await test("Brave and Serper consume saved keys and enforce saved result counts", async () => {
    await save(
      { DREAMATIC_SEARCH_PROVIDER: "brave", DREAMATIC_SEARCH_RESULTS: "2" },
      { DREAMATIC_SEARCH_API_KEY: "search-fixture" },
    );
    let seen: { url: string; options: RequestInit } = { url: "", options: {} };
    const transport = {
      fetch: (async (url: any, options: any) => {
        seen = { url: String(url), options };
        const row = {
          title: "source",
          url: "https://example.org",
          description: "fixture",
        };
        return new Response(
          JSON.stringify({
            web: { results: [row, row, row] },
            organic: [
              { title: "a", link: "https://example.org" },
              { title: "b", link: "https://example.org" },
              { title: "c", link: "https://example.org" },
            ],
          }),
        );
      }) as typeof fetch,
      publicGet: async () => {
        throw new Error("Unexpected public fetch");
      },
    };
    assert.equal((await searchWeb("fixture", undefined, transport)).length, 2);
    assert.match(seen.url, /count=2/);
    assert.equal(
      (seen.options.headers as Record<string, string>)["X-Subscription-Token"],
      "search-fixture",
    );
    assert.ok(seen.options.signal instanceof AbortSignal);
    await save({ DREAMATIC_SEARCH_PROVIDER: "serper" });
    assert.equal((await searchWeb("fixture", undefined, transport)).length, 2);
    assert.match(seen.url, /serper/);
    assert.equal(JSON.parse(seen.options.body as string).num, 2);
    assert.equal(
      (seen.options.headers as Record<string, string>)["X-API-KEY"],
      "search-fixture",
    );
  });
  await test("Bing fallback and explicit DuckDuckGo obey saved provider and count", async () => {
    await save({
      DREAMATIC_SEARCH_PROVIDER: "auto",
      DREAMATIC_SEARCH_RESULTS: "1",
    });
    // Use a fresh snapshot with no secret via the isolated test environment.
    const oldKey = process.env.DREAMATIC_SEARCH_API_KEY;
    process.env.DREAMATIC_SEARCH_API_KEY = "";
    const urls: string[] = [];
    const transport = {
      fetch: (async () => {
        throw new Error("Unexpected keyed fetch");
      }) as typeof fetch,
      publicGet: async (url: string) => {
        urls.push(url);
        if (url.includes("bing")) throw new Error("fixture unavailable");
        return {
          text: '<div class="result"><a class="result__a" href="https://example.org/a">a</a></div><div class="result"><a class="result__a" href="https://example.org/b">b</a></div>',
          url,
          contentType: "text/html",
          buffer: Buffer.alloc(0),
        };
      },
    };
    try {
      assert.equal(
        (await searchWeb("fixture", undefined, transport)).length,
        1,
      );
      assert.equal(urls.length, 2);
      urls.length = 0;
      await save({ DREAMATIC_SEARCH_PROVIDER: "duckduckgo" });
      assert.equal(
        (await searchWeb("fixture", undefined, transport)).length,
        1,
      );
      assert.equal(urls.length, 1);
      assert.match(urls[0], /duckduckgo/);
    } finally {
      process.env.DREAMATIC_SEARCH_API_KEY = oldKey;
    }
  });
  await test("upload limit uses the saved value in both enforcement and error", async () => {
    await save({ DREAMATIC_UPLOAD_LIMIT_MB: "1" });
    const p = await store.create("Upload fixture", "live");
    await assert.rejects(
      ingest(p, "large.txt", Buffer.alloc(1024 * 1024 + 1)),
      /1MB/,
    );
  });
  await test("image transport uses endpoint, inherited key, format, size and byte limit", async () => {
    await save(
      {
        DREAMATIC_IMAGE_GENERATION_ENDPOINT:
          "https://images.example.test/custom",
        DREAMATIC_IMAGE_RESPONSE_FORMAT: "b64_json",
        DREAMATIC_IMAGE_DEFAULT_SIZE: "512x768",
        DREAMATIC_IMAGE_RESPONSE_MAX_BYTES: "1024",
      },
      { DREAMATIC_API_KEY: "fallback-image-fixture" },
    );
    const originalKey = process.env.DREAMATIC_IMAGE_API_KEY;
    process.env.DREAMATIC_IMAGE_API_KEY = "";
    let seen: any;
    const model = {
      type: "image",
      provider: "fixture",
      id: "fixture-image",
      api: "dreamatic-openai-images",
      baseUrl: "https://images.example.test/v1",
      name: "fixture",
      input: ["text"],
      output: ["image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    } as const;
    globalThis.fetch = (async (url: any, options: any) => {
      seen = { url, options };
      return new Response("x".repeat(1025));
    }) as typeof fetch;
    try {
      await assert.rejects(
        infoImageProvider.generateImages(model as any, {
          input: [{ type: "text", text: "fixture" }],
        }),
        /字节限制/,
      );
      assert.equal(seen.url, "https://images.example.test/custom");
      assert.equal(
        seen.options.headers.Authorization,
        "Bearer fallback-image-fixture",
      );
      assert.equal(JSON.parse(seen.options.body).size, "512x768");
      assert.equal(JSON.parse(seen.options.body).response_format, "b64_json");
    } finally {
      globalThis.fetch = originalFetch;
      process.env.DREAMATIC_IMAGE_API_KEY = originalKey;
    }
  });
  await test("explicit missing PDF browser path fails instead of silently falling back", async () => {
    await save({ DREAMATIC_CHROME_PATH: path.join(root, "not-a-browser") });
    await assert.rejects(browserOptions(), /浏览器路径不存在/);
  });
  await test("PDF timeout controls launch and page operations, with no hidden 20-second cap", async () => {
    await save({
      DREAMATIC_CHROME_PATH: process.execPath,
      DREAMATIC_PDF_TIMEOUT_MS: "60000",
    });
    const p = await store.create("PDF timeout fixture", "live");
    const design = {
      composition, title: "PDF fixture", narrative_rationale: "打印配置测试", theme: "fixture", font: "system-ui", palette: [], storyline: [{ id: "intro", title: "Fixture", description: "Fixture", rationale: "打印配置测试，不涉及数据", fact_ids: [] }], assets: [],
      page: { width: 960, height: 1200, background: "#fff" },
      components: [{ id: "heading", type: "heading", asset_ids: [], parent_id: null, story_ids: [], fact_ids: [], title: "Fixture", description: "Fixture", layout: { x: 0, y: 0, width: 400, height: 200 }, mapping: { label_field: "", value_field: "", unit: "" }, interaction: { trigger: "", behavior: "" }, animation: { trigger: "", behavior: "" } }],
    };
    await store.commit(p, "designer", design, "fixture", "fixture", renderDocument("designer", design, "fixture"));
    const builder = { html: `<!doctype html><html><head><meta charset="utf-8"><title>PDF configuration fixture</title></head><body><h1 data-component-id="heading">PDF fixture</h1><p>This isolated test checks the configured browser launch and page-operation timeout. It contains no user material.</p></body></html>`, summary: "fixture" };
    await store.commit(p, "builder", builder, "fixture", "fixture", renderDocument("builder", builder, "fixture"));
    let launch: LaunchOptions | undefined,
      pageTimeout = 0,
      closed = false;
    const page = {
      setDefaultTimeout: (n: number) => (pageTimeout = n),
      setContent: async () => {},
      emulateMedia: async () => {},
      evaluate: async () => {},
      pdf: async () => Buffer.from("%PDF-fixture"),
    };
    const driver = {
      launch: async (options: LaunchOptions | undefined) => {
        launch = options;
        return {
          newContext: async () => ({
            route: async () => {},
            newPage: async () => page,
          }),
          close: async () => {
            closed = true;
          },
        } as unknown as Browser;
      },
    };
    const file = await exportPdf(p, driver);
    assert.equal((await readFile(file)).subarray(0, 5).toString(), "%PDF-");
    assert.ok(launch!.timeout! > 59000);
    assert.ok(pageTimeout > 59000);
    assert.equal(launch?.executablePath, process.execPath);
    assert.equal(closed, true);
  });
  await test("configured retry budget controls stage attempts", async () => {
    const intent = {
      title: "fixture",
      topic: "fixture",
      objective: "fixture",
      audience: "fixture",
      scope: "fixture",
      data_requirements: "fixture",
      story_direction: "fixture",
      visual_constraints: [], visual_preferences: "fixture",
      constraints: [],
    };
    for (const limit of [1, 2]) {
      await save({ DREAMATIC_RETRY_ATTEMPTS: String(limit) });
      const p = await store.create("Retry configuration fixture", "live");
      let calls = 0;
      const engine = new Orchestrator(async (_p, role) => {
        if (role === "chatbot") {
          if (++calls === 1) throw new Error("HTTP 503 fixture");
          return { data: intent, notes: "fixture", markdown: renderDocument("chatbot", intent, "fixture") };
        }
        throw new Error("permanent fixture stop");
      });
      await engine.start(p.id);
      assert.equal(calls, limit);
      assert.equal(
        (await store.get(p.id)).state.stages.chatbot.attempts,
        limit,
      );
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}
