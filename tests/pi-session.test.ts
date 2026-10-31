import type { OpenAICompletionsCompat } from "@earendil-works/pi-ai";
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const testRoot = await mkdtemp(
  path.join(os.tmpdir(), "info-pi-sdk-test-"),
);
process.env.INFO_CONFIG_DIR = testRoot;
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const { create } = await import("../apps/server/src/store.js");
const { runtime, piRunner, resetRuntime, getModels } =
  await import("../apps/server/src/pi.js");
// Local deterministic provider verifies real Pi session/tool contracts, not model quality.
await test(
  "Pi reasoning model uses system role on a legacy-compatible endpoint and submits valid output",
  { timeout: 30000 },
  async () => {
    const intent = {
      title: "SDK contract test",
      topic: "reading",
      objective: "test",
      audience: "public",
      scope: "2021–2024",
      data_requirements: "CSV",
      story_direction: "growth",
      visual_preferences: "warm gray",
      constraints: [],
    };
    let declared: string[] = [];
    const sentRoles: string[][] = [];
    const server = http.createServer(async (req, res) => {
      let text = "";
      for await (const c of req) text += c;
      const body = JSON.parse(text);
      sentRoles.push(body.messages.map((m: any) => m.role));
      if (body.messages.some((m: any) => m.role === "developer")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "developer role not supported" },
          }),
        );
        return;
      }

      declared = (body.tools || []).map((t: any) => t.function.name);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (delta: unknown, finish_reason: string | null = null) =>
        res.write(
          `data: ${JSON.stringify({ id: "local-pi-test", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
        );
      if (body.messages.some((m: any) => m.role === "tool"))
        chunk({ content: "Done" }, "stop");
      else {
        chunk({
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "call-submit",
              type: "function",
              function: {
                name: "submit_stage",
                arguments: JSON.stringify({
                  markdown: renderDocument("chatbot", intent, "Local SDK contract fixture"),
                }),
              },
            },
          ],
        });
        chunk({}, "tool_calls");
      }
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const port = (server.address() as { port: number }).port;
      const { saveRuntimeConfig } =
        await import("../apps/server/src/config-store.js");
      await saveRuntimeConfig({
        values: {
          DREAMATIC_PROVIDER_TYPE: "openai-compatible",
          DREAMATIC_BASE_URL: `http://127.0.0.1:${port}/v1`,
          DREAMATIC_MODEL: "qwen3.7-plus",
          DREAMATIC_MODEL_REASONING: "true",
          DREAMATIC_THINKING_LEVEL: "off",
        },
        secrets: { DREAMATIC_API_KEY: "local-test-placeholder" },
      });
      resetRuntime();
      const p = await create("SDK integration fixture", "live");
      const result = await piRunner(p, "chatbot", (await getModels()).chatbot, {
        signal: AbortSignal.timeout(20000),
        event: () => {},
      });
      assert.deepEqual(result.data, intent);
      assert.ok(sentRoles.length > 0);
      assert.ok(
        sentRoles.every(
          (roles) => roles.includes("system") && !roles.includes("developer"),
        ),
      );
      const config = (await getModels()).chatbot;
      const registered = (await runtime()).getModel(
        config.provider,
        config.model,
      )!;
      assert.equal(registered.reasoning, true);
      assert.equal(
        (registered.compat as OpenAICompletionsCompat)?.supportsDeveloperRole,
        false,
      );

      assert.ok(declared.includes("submit_stage"));
      assert.ok(declared.includes("read"));
      assert.ok(declared.includes("read_handoff"));
      assert.ok(result.markdown?.includes("目标受众"));
      assert.ok(!declared.includes("bash"));
      assert.ok(!declared.includes("write"));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await rm(testRoot, { recursive: true, force: true });
    }
  },
);
