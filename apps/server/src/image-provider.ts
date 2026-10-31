import { hash } from "./validation.js";
import type { ProviderImages } from "@earendil-works/pi-ai";
import { setting } from "./config-store.js";
import { publicGet } from "./network.js";
export function imageCacheKey(
  assetId: string,
  prompt: string,
  model: { id: string; baseUrl: string },
) {
  return hash({
    asset_id: assetId,
    prompt,
    model: model.id,
    baseUrl: model.baseUrl,
    endpoint: setting("DREAMATIC_IMAGE_GENERATION_ENDPOINT"),
    responseFormat: setting("DREAMATIC_IMAGE_RESPONSE_FORMAT"),
    size: setting("DREAMATIC_IMAGE_DEFAULT_SIZE"),
  });
}
/** OpenAI-compatible transport, exposed through Pi's public ProviderImages contract.
 * Same request fields as Dreamatic Art's image-request.ts; no runtime internals. */
export const infoImageProvider: ProviderImages = {
  async generateImages(model, context, options) {
    const apiKey =
      setting("DREAMATIC_IMAGE_API_KEY") || setting("DREAMATIC_API_KEY");
    if (!apiKey) throw new Error("请在设置中配置图像 API 密钥");
    const signal = AbortSignal.any([
      options?.signal ?? new AbortController().signal,
      AbortSignal.timeout(Number(setting("DREAMATIC_IMAGE_TIMEOUT_MS"))),
    ]);
    const format = setting("DREAMATIC_IMAGE_RESPONSE_FORMAT");
    const url =
      setting("DREAMATIC_IMAGE_GENERATION_ENDPOINT") ||
      `${model.baseUrl.replace(/\/$/, "")}/images/generations`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        model: model.id,
        prompt: context.input
          .filter((x) => x.type === "text")
          .map((x) => x.text)
          .join("\n"),
        size:
          options?.metadata?.size || setting("DREAMATIC_IMAGE_DEFAULT_SIZE"),
        ...(format === "auto" ? {} : { response_format: format }),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`图像生成失败（HTTP ${response.status}）`);
    }
    const limit = Number(setting("DREAMATIC_IMAGE_RESPONSE_MAX_BYTES"));
    const reader = response.body!.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > limit) {
          await reader.cancel();
          throw new Error("图像响应超过配置的字节限制");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")),
      image = payload.data?.[0];
    let bytes: Buffer;
    if (image?.b64_json) bytes = Buffer.from(image.b64_json, "base64");
    else if (image?.url)
      bytes = (await publicGet(image.url, signal, 0, limit)).buffer;
    else throw new Error("图像服务未返回有效图片");
    if (!bytes.length || bytes.length > limit)
      throw new Error("图像数据为空或超过大小限制");
    const mimeType =
      bytes[0] === 0xff && bytes[1] === 0xd8
        ? "image/jpeg"
        : bytes.subarray(0, 4).toString() === "RIFF"
          ? "image/webp"
          : bytes.subarray(1, 4).toString() === "PNG"
            ? "image/png"
            : null;
    if (!mimeType) throw new Error("图像服务返回了不支持的图片格式");
    return {
      api: model.api,
      provider: model.provider,
      model: model.id,
      output: [{ type: "image", mimeType, data: bytes.toString("base64") }],
      stopReason: "stop",
      timestamp: Date.now(),
    };
  },
};
