import { defineConfig } from "vite";
import path from "node:path";
import { developmentPorts } from "./apps/server/src/environment";
import react from "@vitejs/plugin-react";
export default defineConfig(() => {
  const ports = developmentPorts(
    path.resolve(process.env.INFO_CONFIG_DIR || process.cwd()),
  );
  return {
    plugins: [react()],
    root: "apps/web",
    build: { outDir: "../../dist/web", emptyOutDir: true },
    server: {
      port: ports.web,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${ports.api}` },
    },
  };
});
