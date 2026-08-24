import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the browser loads the skin registry before the table renderer", () => {
  const html = read("public/index.html");
  const registryIndex = html.indexOf('/shared/card-skins.js?v=1');
  const appIndex = html.indexOf('/app.js?v=25');

  assert.ok(registryIndex >= 0);
  assert.ok(appIndex > registryIndex);
  assert.match(read("public/sw.js"), /\/shared\/card-skins\.js\?v=1/);
});

test("faces and all hidden-card contexts use the shared skin boundary", () => {
  const app = read("public/app.js");

  assert.match(app, /const cardSkins = globalThis\.CardcadeCardSkins/);
  assert.match(app, /function renderCardBack/);
  assert.match(app, /function renderMiniCardBack/);
  assert.match(app, /"card-skin-face"/);
  for (const context of ["opponent-mini", "dealer-hole", "private-seat", "draw-stock", "discard", "stock", "hot-seat-handoff"]) {
    assert.match(app, new RegExp(`context: "${context}"`));
  }
});
