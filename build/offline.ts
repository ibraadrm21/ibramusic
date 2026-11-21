import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export function offline(): Plugin {
  return {
    name: "ibramusic-offline",
    apply: "build",
    generateBundle(_options, bundle) {
      const version = createHash("sha256").update(Object.keys(bundle).sort().join("\n")).digest("hex").slice(0, 16);
      const assets = Object.values(bundle)
        .filter(file => /\.(css|js)$/.test(file.fileName) && !(file.type === "chunk" && !file.isEntry && file.code.length > 500_000))
        .map(file => "./" + file.fileName);
      const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8")
        .replace("__CACHE_VERSION__", version)
        .replace("const appAssets = __APP_ASSETS__;", "const appAssets = " + JSON.stringify(["./", "./favicon.svg", "./manifest.webmanifest", ...assets]) + ";");
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
