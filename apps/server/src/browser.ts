import { setting, CONFIG_ROOT } from "./config-store.js";
import path from "node:path";
import { access } from "node:fs/promises";
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
export async function browserOptions() {
  const explicit = setting("DREAMATIC_CHROME_PATH");
  if (explicit) {
    const configured = path.resolve(CONFIG_ROOT, explicit);
    if (!(await exists(configured)))
      throw new Error(
        "配置的浏览器路径不存在，请检查 DREAMATIC_CHROME_PATH",
      );
    return { executablePath: configured };
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  for (const p of candidates) if (await exists(p)) return { executablePath: p };
  return {};
}
