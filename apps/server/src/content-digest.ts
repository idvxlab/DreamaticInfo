import { readFile, stat } from 'node:fs/promises';
import { hash } from './validation.js';
/** Metadata is checked each use; content is hashed only for a stable file snapshot. */
const cache = new Map<string, { signature: string; digest: string }>();
export async function contentDigest(file: string, encoding: 'utf8' | 'base64' = 'utf8') {
  const signature = async () => { const s = await stat(file, { bigint: true }); return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':'); };
  const before = await signature(), key = `${encoding}:${file}`, cached = cache.get(key);
  if (cached?.signature === before) return cached.digest;
  const digest = hash((await readFile(file)).toString(encoding));
  if (await signature() !== before) throw new Error('输入文件在读取过程中发生变化，请重试');
  cache.set(key, { signature: before, digest });
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  return digest;
}
