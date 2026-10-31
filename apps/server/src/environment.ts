import path from "node:path";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
/** Application .env wins over inherited process values. No .env.local / mode overlays. */
export function readProjectEnvironment(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  let disk: Record<string, string> = {};
  try {
    disk = parse(readFileSync(path.join(root, ".env")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { ...env, ...disk };
}
export function developmentPorts(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const values = readProjectEnvironment(root, env);
  return {
    api: Number(values.PORT ?? 4315),
    web: Number(values.DREAMATIC_WEB_PORT ?? 5175),
  };
}
