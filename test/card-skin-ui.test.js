import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the browser loads the skin registry before the table renderer", () => {
  const html = read("public/index.html");
  const registryIndex = html.indexOf('/shared/card-skins.js?v=4');
  const appIndex = html.indexOf('/app.js?v=32');

  assert.ok(registryIndex >= 0);
  assert.ok(appIndex > registryIndex);
  assert.match(read("public/sw.js"), /\/shared\/card-skins\.js\?v=4/);
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

test("JUAN skins cover number, action, Prism, backs, piles, opponent minis, and previews without leaking into Standard 52", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /skin-preview-juan-prism/);
  assert.match(app, /renderMiniCardBack\("color-action"/);
  assert.match(app, /deckFamilyId: "color-action", context: "stock"/);
  assert.match(app, /juan-prism-stage-card.*renderJuanCard/s);
  assert.match(app, /juan-prism-reveal-card.*renderJuanCard/s);
  for (const skinClass of ["card-skin-juan-night-shift", "card-skin-juan-paper-pop"]) {
    assert.match(css, new RegExp(`\\.juan-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.juan-seat-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.card-back\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.juan-stock\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.skin-preview\\.${skinClass}`));
  }
  assert.doesNotMatch(css, /\.playing-card\.card-skin-juan-(?:night-shift|paper-pop)\.(?:red|black)/);
});

test("Legacy Mode restores the original 3s & 7s and Thirteen cards without becoming a skin or JUAN layout", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /name="legacyMode"/);
  assert.match(app, /original 3s &amp; 7s and Thirteen illustrated Standard 52 cards/);
  assert.match(app, /function standardLegacyModeEnabled/);
  assert.match(app, /function renderLegacyStandardCenter/);
  assert.match(app, /legacy-card-center legacy-court/);
  assert.match(app, /legacy-card-center legacy-emblem/);
  assert.doesNotMatch(app, /LEGACY_STANDARD_PIP_LAYOUTS/);
  assert.doesNotMatch(app, /legacy-card-center legacy-face/);
  assert.match(app, /"card-style-legacy-standard"/);
  assert.match(app, /hand\.classList\.remove\("fan-ready"\);[\s\S]*?hand\.classList\.add\("legacy-flat-hand"\);[\s\S]*?void hand\.offsetWidth;[\s\S]*?hand\.classList\.add\("fan-ready"\);/);
  assert.match(app, /scrollLeft: hand\.scrollLeft/);
  assert.match(app, /legacyMode: data\.get\("legacyMode"\) === "on"/);
  assert.match(css, /\.game-hand\.legacy-flat-hand[\s\S]*?overflow-x: auto/);
  assert.match(css, /\.playing-card\.card-style-legacy-standard/);
  assert.match(css, /\.legacy-court svg/);
  assert.match(css, /\.legacy-emblem/);
  assert.doesNotMatch(css, /\.legacy-face strong/);
  assert.match(css, /\.card-back\.card-style-legacy-standard[\s\S]*?#142644/);
  assert.match(css, /\.card-back\.card-style-legacy-standard/);
  assert.match(css, /\.standard-seat-card\.card-style-legacy-standard/);
  assert.doesNotMatch(css, /\.juan-card\.card-style-legacy-standard/);

  const saveFunction = app.match(/function saveAppearancePreferences[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(saveFunction, /sendRoom|socket|api\(/);
});
