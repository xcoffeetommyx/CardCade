import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the browser loads the skin registry before the table renderer", () => {
  const html = read("public/index.html");
  const registryIndex = html.indexOf('/shared/card-skins.js?v=2');
  const appIndex = html.indexOf('/app.js?v=27');

  assert.ok(registryIndex >= 0);
  assert.ok(appIndex > registryIndex);
  assert.match(read("public/sw.js"), /\/shared\/card-skins\.js\?v=2/);
});

test("appearance settings are versioned, family-scoped, and local-only", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /appearance: "cardcade\.appearance\.v1"/);
  assert.match(app, /function loadAppearancePreferences/);
  assert.match(app, /function saveAppearancePreferences/);
  assert.match(app, /Object\.keys\(cardSkins\.DEFAULT_SKIN_IDS\)\.map\(renderSkinSetting\)/);
  assert.match(app, /data-skin-family=/);
  assert.match(app, /Appearance is saved only on this device and never changes a room or its rules/);
  assert.doesNotMatch(app.match(/function saveAppearancePreferences[\s\S]*?\n}/)?.[0] || "", /sendRoom|socket|api\(/);
  assert.match(css, /\.appearance-family-grid/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.appearance-family-grid \{ grid-template-columns: 1fr; \}/);
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

test("alternate standard skins cover faces, backs, stacks, and previews without leaking into JUAN", () => {
  const css = read("public/app.css");

  for (const skinClass of ["card-skin-casino-gold", "card-skin-royal-violet"]) {
    assert.match(css, new RegExp(`\\.playing-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.standard-seat-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.card-back\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.draw-stack\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.skin-preview\\.${skinClass}`));
  }
  assert.doesNotMatch(css, /\.juan-card\.card-skin-(?:casino-gold|royal-violet)/);
});
