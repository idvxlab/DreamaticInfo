import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import https from "node:https";
import net from "node:net";
import type { lookup } from "node:dns/promises";
import { chromium } from "playwright";
import os from "node:os";
import path from "node:path";
const root = await mkdtemp(path.join(os.tmpdir(), "info-native-egress-"));
process.env.INFO_CONFIG_DIR = root;
const { createBrowserEgress } = await import("../apps/server/src/browser-egress.js");
const { readBrowserPage } = await import("../apps/server/src/web-reader.js");
const { saveRuntimeConfig } = await import("../apps/server/src/config-store.js");
try {
  await test("CONNECT gateway rejects mixed public/private DNS before making any upstream connection", async () => {
    let connected = false, violation = "";
    const egress = await createBrowserEgress(AbortSignal.timeout(5000), error => { violation = error.message; }, {
      resolve: (async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]) as unknown as typeof lookup,
      connect: (() => { connected = true; throw new Error("must not connect"); }) as typeof net.connect,
    });
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(Number(new URL(egress.server).port), "127.0.0.1");
        let text = "";
        socket.on("connect", () => socket.write("CONNECT mixed.example:443 HTTP/1.1\r\nHost: mixed.example:443\r\n\r\n"));
        socket.on("data", chunk => { text += chunk; }); socket.on("end", () => resolve(text)); socket.on("error", reject);
      });
      assert.match(response, /403/); assert.match(violation, /私有网络/); assert.equal(connected, false);
    } finally { await egress.close(); }
  });
  await test("real Chromium HTTPS preserves TLS, cookies and redirects through CONNECT; a redirected private host is still blocked", { timeout: 30000 }, async () => {
    // This one disposable certificate is trusted only by this fixture browser via its SPKI pin.
    const keyPath = path.join(root, "key.pem"), certPath = path.join(root, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=reader.example", "-addext", "subjectAltName=DNS:reader.example"], { stdio: "ignore" });
    const cert = await readFile(certPath), key = await readFile(keyPath);
    const pin = createHash("sha256").update(createPublicKey(cert).export({ type: "spki", format: "der" })).digest("base64");
    const paragraph = "A deterministic public study reports complete methodology, evidence, findings and limitations. ".repeat(10);
    let chromeAgent = "", cookie = "", posted = false, localLookups = 0;
    const server = https.createServer({ cert, key }, (req, res) => {
      chromeAgent = req.headers["user-agent"] || "";
      if (req.url === "/start") { res.writeHead(302, { location: "/report", "set-cookie": "session=ready; Secure; Path=/" }); res.end(); }
      else if (req.url === "/redirect-private") { res.writeHead(302, { location: "https://localhost/private" }); res.end(); }
      else if (req.url === "/data") { cookie = req.headers.cookie || ""; posted = req.method === "POST"; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ text: paragraph })); }
      else { res.setHeader("content-type", "text/html"); res.end("<title>Native HTTPS fixture</title><article></article><script>setTimeout(()=>fetch('/data',{method:'POST',body:'query'}).then(r=>r.json()).then(d=>document.querySelector('article').textContent=d.text),650)</script>"); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const fixturePort = (server.address() as net.AddressInfo).port;
    const options = {
      createEgress: ((signal, blocked) => createBrowserEgress(signal, blocked, {
        resolve: (async (host: string) => { if (host === "localhost") localLookups++; return [{ address: host === "localhost" ? "127.0.0.1" : "93.184.216.34", family: 4 }]; }) as unknown as typeof lookup,
        connect: ((address: net.TcpNetConnectOpts) => { assert.equal(address.host, "93.184.216.34"); assert.equal(address.port, 443); return net.connect(fixturePort, "127.0.0.1"); }) as typeof net.connect,
      })) as typeof createBrowserEgress,
      launch: ((opts = {}) => chromium.launch({ ...opts, args: [...(opts.args ?? []), `--ignore-certificate-errors-spki-list=${pin}`] })) as typeof chromium.launch,
    };
    try {
      await saveRuntimeConfig({ values: { DREAMATIC_WEB_BROWSER_WAIT_MS: "0", DREAMATIC_WEB_BROWSER_READY_TIMEOUT_MS: "3000" } });
      const result = await readBrowserPage("https://reader.example/start", AbortSignal.timeout(15000), options);
      assert.match(result.text, /deterministic public study/); assert.match(chromeAgent, /Chrome/); assert.match(cookie, /session=ready/); assert.equal(posted, true);
      assert.equal(result.url, "https://reader.example/report"); assert.deepEqual(result.redirect_chain, ["https://reader.example/start", "https://reader.example/report"]);
      await assert.rejects(readBrowserPage("https://reader.example/redirect-private", AbortSignal.timeout(10000), options), /私有网络/);
      assert.ok(localLookups > 0);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
} finally { await rm(root, { recursive: true, force: true }); }
