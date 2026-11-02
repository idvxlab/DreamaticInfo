import { abortable } from "./public-http.js";
/** Bounded fan-out preserves input order and isolates unrelated connector failures. */
export async function acquisitionBatch<T, R>(items: T[], concurrency: number, run: (item: T) => Promise<R>, signal?: AbortSignal) {
  let cursor = 0;
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      signal?.throwIfAborted();
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await run(items[index]) }; }
      catch (reason) { if (signal?.aborted) throw reason; results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}
const next = new Map<string, number>();
export async function paceProvider(provider: string, interval: number, signal: AbortSignal) {
  const delay = Math.max(0, (next.get(provider) ?? 0) - Date.now());
  next.set(provider, Date.now() + delay + interval);
  if (delay) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, delay); }), signal); }
    finally { clearTimeout(timer); }
  }
  signal.throwIfAborted();
}
