import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { offline } from "../build/offline.ts";

test("build installs an evaluable service worker and answers offline navigation", async () => {
  let built;
  offline().generateBundle.call({ emitFile: file => { built = file.source; } }, {}, {
    main: { type: "chunk", isEntry: true, fileName: "assets/index.js", code: "x".repeat(510_000) },
    styles: { type: "asset", fileName: "assets/index.css", source: "" },
  });
  const events = new Map();
  const storage = new Map();
  const base = "https://ibramusic.example/";
  const cache = {
    addAll: async assets => { for (const asset of assets) storage.set(asset, new Response("cached " + asset)); },
    match: async url => storage.get(url),
  };
  runInNewContext(built, {
    URL,
    Response,
    self: {
      registration: { scope: base },
      addEventListener: (name, handler) => events.set(name, handler),
    },
    caches: { open: async () => cache },
    fetch: async () => { throw new Error("offline"); },
  });

  let installed;
  events.get("install")({ waitUntil: promise => { installed = promise; } });
  await installed;
  assert.equal(storage.has(base + "assets/index.js"), true);

  let response;
  events.get("fetch")({
    request: { method: "GET", mode: "navigate", url: base + "?view=playlists" },
    respondWith: promise => { response = promise; },
  });
  assert.equal(await (await response).text(), "cached " + base);

  const asset = base + "assets/index.js";
  events.get("fetch")({
    request: { method: "GET", mode: "cors", url: asset, headers: { Origin: base } },
    respondWith: promise => { response = promise; },
  });
  assert.equal(await (await response).text(), "cached " + asset);
});
