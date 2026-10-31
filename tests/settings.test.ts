import type { OpenAICompletionsCompat } from "@earendil-works/pi-ai";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  stat,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { parse } from "dotenv";
const root = await mkdtemp(path.join(os.tmpdir(), "info-settings-"));
process.env.INFO_CONFIG_DIR = root;
const {
  initializeConfig,
  readRuntimeConfig,
  saveRuntimeConfig,
  CONFIG_FIELDS,
} = await import("../apps/server/src/config-store.js");
const { resolveModels } = await import("../packages/shared/model-settings.js");
try {
  await test("blank role overrides inherit the configured custom connection after restart", async () => {
    const dir = await mkdtemp(path.join(root, "inherit-")),
      env: NodeJS.ProcessEnv = {};
    initializeConfig(dir, env);
    await saveRuntimeConfig(
      {
        values: {
          DREAMATIC_PROVIDER_TYPE: "openai-compatible",
          DREAMATIC_PROVIDER: "studio",
          DREAMATIC_BASE_URL: "https://api.example.com/v1",
          DREAMATIC_MODEL: "custom-model",
        },
        secrets: { DREAMATIC_API_KEY: "fixture-key" },
      },
      dir,
      env,
    );
    const restarted: NodeJS.ProcessEnv = {};
    initializeConfig(dir, restarted);
    const result = resolveModels(restarted as Record<string, string>);
    for (const role of [
      "chatbot",
      "researcher",
      "analyst",
      "designer",
      "builder",
    ] as const) {
      assert.equal(result[role].provider, `dreamatic-info-${role}`);
      assert.equal(result[role].model, "custom-model");
    }
    assert.equal(
      readRuntimeConfig(dir, restarted).secretConfigured.DREAMATIC_API_KEY,
      true,
    );
  });
  await test("explicit role overrides remain visible and can be reset to inherit", async () => {
    const values = {
      DREAMATIC_PROVIDER_TYPE: "openai-compatible",
      DREAMATIC_PROVIDER: "studio",
      DREAMATIC_MODEL: "custom-model",
      DREAMATIC_THINKING_LEVEL: "medium",
      DREAMATIC_PROVIDER_CHATBOT: "openai",
      DREAMATIC_MODEL_CHATBOT: "gpt-5.4",
    };
    assert.equal(resolveModels(values).chatbot.provider, "openai");
    assert.equal(resolveModels(values).chatbot.model, "gpt-5.4");
    assert.equal(
      resolveModels({
        ...values,
        DREAMATIC_PROVIDER_CHATBOT: "",
        DREAMATIC_MODEL_CHATBOT: "",
      }).chatbot.provider,
      "dreamatic-info-chatbot",
    );
    assert.equal(
      resolveModels({
        ...values,
        DREAMATIC_PROVIDER_CHATBOT: "",
        DREAMATIC_MODEL_CHATBOT: "",
      }).chatbot.model,
      "custom-model",
    );
  });
  await test("all defaults persisted to .env, and secret values never exposed", async () => {
    const dir = await mkdtemp(path.join(root, "defaults-")),
      env: NodeJS.ProcessEnv = {};
    initializeConfig(dir, env);
    await saveRuntimeConfig(
      {
        values: { DREAMATIC_PROVIDER_NAME: "My studio #1" },
        secrets: { DREAMATIC_API_KEY: "fixture-secret-value" },
      },
      dir,
      env,
    );
    const disk = parse(await readFile(path.join(dir, ".env"), "utf8"));
    for (const f of CONFIG_FIELDS) assert.ok(f.key in disk);
    assert.equal(disk.DREAMATIC_PROVIDER_NAME, "My studio #1");
    assert.equal(disk.DREAMATIC_API_KEY, "fixture-secret-value");
    const config = readRuntimeConfig(dir, env);
    assert.equal(config.secretConfigured.DREAMATIC_API_KEY, true);
    assert.ok(!JSON.stringify(config).includes("fixture-secret-value"));
    assert.equal((await stat(path.join(dir, ".env"))).mode & 0o777, 0o600);
    await saveRuntimeConfig({ secrets: { DREAMATIC_API_KEY: "" } }, dir, env);
    assert.equal(
      parse(await readFile(path.join(dir, ".env"), "utf8")).DREAMATIC_API_KEY,
      "fixture-secret-value",
    );
  });
  await test("atomic validation rejects invalid settings without changing disk or runtime", async () => {
    const dir = await mkdtemp(path.join(root, "invalid-")),
      env: NodeJS.ProcessEnv = {};
    initializeConfig(dir, env);
    const before = await readFile(path.join(dir, ".env"), "utf8"),
      runtime = { ...env };
    for (const values of [
      { PORT: "-1" },
      { DREAMATIC_RETRY_ATTEMPTS: "0" },
      { DREAMATIC_BASE_URL: "https://user:password@example.org" },
      { DREAMATIC_MODEL: "injected\nKEY=value" },
      { DREAMATIC_IMAGE_DEFAULT_SIZE: "invalid" },
      { DREAMATIC_MAX_TOKENS: "200000" },
      { UNKNOWN: "x" },
      { DREAMATIC_SKILL_PATHS: "[]" },
      { DREAMATIC_SKILL_PATHS: '{"designer":["relative-path"]}' },
    ])
      await assert.rejects(saveRuntimeConfig({ values }, dir, env));
    await assert.rejects(
      saveRuntimeConfig(
        { values: { DREAMATIC_API_KEY: "wrong-group" } },
        dir,
        env,
      ),
    );
    assert.equal(await readFile(path.join(dir, ".env"), "utf8"), before);
    assert.deepEqual(env, runtime);
  });
  await test("existing comments, unrelated keys and concurrent updates survive saves", async () => {
    const dir = await mkdtemp(path.join(root, "preserve-")),
      env: NodeJS.ProcessEnv = {};
    await writeFile(
      path.join(dir, ".env"),
      "# Keep this comment\nOTHER_SETTING=untouched\nDREAMATIC_MODEL=gpt-5.4\n",
    );
    initializeConfig(dir, env);
    await Promise.all([
      saveRuntimeConfig(
        { values: { DREAMATIC_SEARCH_RESULTS: "6" } },
        dir,
        env,
      ),
      saveRuntimeConfig(
        { values: { DREAMATIC_RETRY_ATTEMPTS: "4" } },
        dir,
        env,
      ),
    ]);
    const text = await readFile(path.join(dir, ".env"), "utf8"),
      disk = parse(text);
    assert.match(text, /# Keep this comment/);
    assert.equal(disk.OTHER_SETTING, "untouched");
    assert.equal(disk.DREAMATIC_SEARCH_RESULTS, "6");
    assert.equal(disk.DREAMATIC_RETRY_ATTEMPTS, "4");
  });
  await test("restart settings persist but do not silently move active runtime", async () => {
    const dir = await mkdtemp(path.join(root, "restart-")),
      env: NodeJS.ProcessEnv = {};
    initializeConfig(dir, env);
    const before = env.DREAMATIC_WORKSPACE;
    const result = await saveRuntimeConfig(
      { values: { PORT: "4501", DREAMATIC_WORKSPACE: "./other-projects" } },
      dir,
      env,
    );
    assert.equal(env.PORT, "4315");
    assert.equal(env.DREAMATIC_WORKSPACE, before);
    assert.ok(result.restartRequired.includes("PORT"));
    assert.equal(readRuntimeConfig(dir, env).values.PORT, "4501");
    assert.equal(readRuntimeConfig(dir, env).pendingApply, true);
    initializeConfig(dir, env);
    assert.equal(env.PORT, "4501");
    assert.equal(env.DREAMATIC_WORKSPACE, "./other-projects");
    assert.equal(readRuntimeConfig(dir, env).pendingApply, false);
  });
  await test("startup persists current env names and defaults without migration", async () => {
    const dir = await mkdtemp(path.join(root, "current-")), env: NodeJS.ProcessEnv = {};
    await writeFile(path.join(dir, ".env"), "DREAMATIC_MODEL_ANALYST=custom-model\nDREAMATIC_UPLOAD_LIMIT_MB=12\n");
    initializeConfig(dir, env);
    assert.equal(env.DREAMATIC_MODEL_ANALYST, "custom-model");
    assert.equal(env.DREAMATIC_UPLOAD_LIMIT_MB, "12");
    for (const field of CONFIG_FIELDS) assert.ok(field.key in parse(await readFile(path.join(dir, ".env"), "utf8")));
  });
  await test("saved .env actually configures Pi custom models and image requests", async () => {
    let seen: any;
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5n0AAAAASUVORK5CYII=";
    const server = http.createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      seen = {
        path: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(raw),
      };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ b64_json: png }] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
      await saveRuntimeConfig({
        values: {
          DREAMATIC_PROVIDER_TYPE: "openai-compatible",
          DREAMATIC_BASE_URL: base,
          DREAMATIC_MODEL: "custom-fixture-model",
          DREAMATIC_MODEL_ANALYST: "analyst-fixture",
          DREAMATIC_IMAGE_BASE_URL: base,
          DREAMATIC_IMAGE_MODEL: "fixture-image",
          DREAMATIC_IMAGE_DEFAULT_SIZE: "512x512",
        },
        secrets: {
          DREAMATIC_API_KEY: "fixture-main-key",
          DREAMATIC_IMAGE_API_KEY: "fixture-image-key",
        },
      });
      const { getModels, runtime, resetRuntime } =
        await import("../apps/server/src/pi.js");
      resetRuntime();
      const rt = await runtime(),
        models = await getModels();
      assert.equal(models.analyst.model, "analyst-fixture");
      assert.equal(
        (
          rt.getModel(models.analyst.provider, models.analyst.model)
            ?.compat as OpenAICompletionsCompat
        )?.supportsDeveloperRole,
        false,
      );

      assert.ok(rt.getModel(models.analyst.provider, models.analyst.model));
      assert.equal(
        rt.getModel(models.chatbot.provider, models.chatbot.model)?.baseUrl,
        base,
      );
      const img = rt.getModelOfType(
        "image",
        "dreamatic-info-images",
        "fixture-image",
      )!;
      const result = await rt.generateImages(img, {
        input: [{ type: "text", text: "local image fixture" }],
      });
      assert.equal(result.output[0].type, "image");
      assert.equal(seen.path, "/v1/images/generations");
      assert.equal(seen.authorization, "Bearer fixture-image-key");
      assert.equal(seen.body.size, "512x512");
      assert.equal(seen.body.model, "fixture-image");
      await saveRuntimeConfig({
        values: { DREAMATIC_SUPPORTS_DEVELOPER_ROLE: "true" },
      });
      resetRuntime();
      const optedIn = await runtime();
      assert.equal(
        (
          optedIn.getModel(models.analyst.provider, models.analyst.model)
            ?.compat as OpenAICompletionsCompat
        )?.supportsDeveloperRole,
        true,
      );
      assert.notEqual(
        (
          optedIn.getModel("openai", "gpt-5.4")
            ?.compat as OpenAICompletionsCompat
        )?.supportsDeveloperRole,
        false,
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
} finally {
  await rm(root, { recursive: true, force: true });
}
