import http from "node:http";
import net, { type Socket } from "node:net";
import { lookup } from "node:dns/promises";
import { publicAddress, publicUrl, abortable } from "./public-http.js";
import { setting } from "./config-store.js";
/** CONNECT tunnel only: Chromium retains its own TLS/HTTP/cookies; each actual destination is DNS-pinned. */
export async function createBrowserEgress(signal: AbortSignal, blocked: (error: Error) => void, dependencies: { resolve?: typeof lookup; connect?: typeof net.connect; report?: (message: string) => void } = {}) {
  const resolve = dependencies.resolve ?? lookup, connect = dependencies.connect ?? net.connect;
  signal.throwIfAborted();
  const sockets = new Set<Socket>(); let bytes = 0, closed = false;
  const server = http.createServer((_req, res) => { res.writeHead(403); res.end("Only public HTTPS CONNECT is supported"); });
  server.on("connection", socket => { sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket)); });
  server.on("connect", (request, stream, head) => {
    const client = stream as Socket;
    void (async () => {
      let upstream: Socket | undefined;
      try {
        const target = publicUrl(`https://${request.url}`);
        const addresses = await abortable(resolve(target.hostname.replace(/^\[|\]$/g, ""), { all: true }), signal);
        signal.throwIfAborted();
        if (!addresses.length || addresses.some(address => !publicAddress(address.address))) throw new Error("禁止浏览器访问本地或私有网络");
        if (closed || client.destroyed) return;
        upstream = connect({ host: addresses[0].address, port: 443 });
        sockets.add(upstream); const peer = upstream;
        peer.on("close", () => sockets.delete(peer));
        peer.on("error", error => { dependencies.report?.(`${target.hostname}：${error.message}`); client.destroy(); });
        peer.setTimeout(Number(setting("DREAMATIC_NETWORK_TIMEOUT_MS")), () => { peer.destroy(); client.destroy(); });
        client.on("close", () => peer.destroy());
        peer.on("connect", () => { if (closed || signal.aborted) { peer.destroy(); return; } client.write("HTTP/1.1 200 Connection Established\r\n\r\n"); if (head.length) peer.write(head); client.pipe(peer); peer.pipe(client); });
        const count = (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > Number(setting("DREAMATIC_WEB_BROWSER_MAX_BYTES"))) {
            const error = new Error("网页浏览器累计传输超过配置的字节上限"); blocked(error);
            for (const socket of sockets) socket.destroy();
          }
        };
        peer.on("data", count); client.on("data", count);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!signal.aborted) dependencies.report?.(`${request.url}：${message}`);
        if (/禁止|仅支持|超过配置/.test(message)) blocked(new Error(message));
        if (!client.destroyed) client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        upstream?.destroy();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); }); });
  const address = server.address() as net.AddressInfo;
  const cancel = () => { for (const socket of sockets) socket.destroy(); };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  return { server: `http://127.0.0.1:${address.port}`, close: async () => {
    closed = true; signal.removeEventListener("abort", cancel); cancel();
    await new Promise<void>(resolve => server.close(() => resolve()));
  } };
}
