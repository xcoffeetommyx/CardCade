import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the browser loads the skin registry before the table renderer", () => {
  const html = read("public/index.html");
  const registryIndex = html.indexOf('src="shared/card-skins.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(registryIndex >= 0);
  assert.ok(appIndex > registryIndex);
  assert.match(read("public/sw.js"), /"shared\/card-skins\.js\?v=\d+"/);
});

test("appearance settings are versioned, family-scoped, and local-only", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /appearance: "cardcade\.appearance\.v1"/);
  assert.match(app, /function loadAppearancePreferences/);
  assert.match(app, /function saveAppearancePreferences/);
  assert.match(app, /function selectedTableSkin/);
  assert.match(app, /function createAppearanceDraft/);
  assert.match(app, /function appearanceCategories/);
  assert.match(app, /cardSkins\.skinsForFamily\(id\)/);
  assert.match(app, /function renderAppearanceDraftInputs/);
  assert.match(app, /name="tableSkin"/);
  assert.match(app, /name="skin-\$\{escapeHtml\(deckFamilyId\)\}"/);
  assert.match(app, /Loadout bay/);
  assert.match(app, /Saved on this device only/);
  assert.match(app, /tableSkin: String\(data\.get\("tableSkin"\) \|\| ""\)/);
  assert.doesNotMatch(app.match(/function saveAppearancePreferences[\s\S]*?\n}/)?.[0] || "", /sendRoom|socket|api\(/);
  assert.match(css, /\.appearance-loadout-layout/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.appearance-category-menu/);
});

test("Options moves table and card appearance into a dedicated submenu", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const mainSettings = app.match(/function renderSettings\(\)[\s\S]*?(?=function renderAppearanceSettings)/)?.[0] || "";

  assert.match(app, /function renderAppearanceSettings/);
  assert.match(app, /function renderOptionsCommands[\s\S]*?data-action="\$\{action\}"/);
  assert.match(app, /renderOptionsMenuBackground\(\{ staticOnly: true \}\)/);
  assert.doesNotMatch(mainSettings, /data-(?:skin-family|table-skin)|name="legacyMode"/);
  assert.match(app, /class="game-shell-screen layered-menu-screen options-menu-screen appearance-options-screen panel-open"/);
  assert.match(app, /class="menu-layer appearance-menu-layer" role="dialog"/);
  assert.match(app, /"appearance-settings": renderAppearanceSettings/);
  assert.match(app, /if \(action === "open-appearance-settings"\) \{[\s\S]*?navigate\("appearance-settings"\);/);
  assert.match(app, /if \(formType === "appearance-settings"\) \{[\s\S]*?saveAppearancePreferences/);
  assert.match(css, /\.game-command-option \{/);
  assert.match(css, /\.appearance-category-menu/);
  assert.match(css, /\.appearance-choice-stage/);
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

test("modern Standard 52 artwork scales equally in hands and table piles", () => {
  const css = read("public/app.css");

  assert.match(css, /\.playing-card \{[\s\S]*?container-type: size;/);
  assert.match(css, /\.card-corner \{[\s\S]*?top: 5\.5cqh;[\s\S]*?left: 7cqw;/);
  assert.match(css, /\.card-corner strong \{[^}]*font-size: 18cqh;/);
  assert.match(css, /\.card-center:not\(\.court\) \{[\s\S]*?inset: 27% 16%;[\s\S]*?font: normal 24cqh\/\.8 Georgia, serif;/);
  assert.match(css, /\.card-center\.court \{ inset: 20% 27% 25%;/);
  assert.doesNotMatch(css, /\.playing-card\.played \.card-center:not\(\.court\)/);
  assert.doesNotMatch(css, /\.card-center \{[^}]*font: 4\.1rem/);
});

test("default felt and Cardcade Pixel backs stay consistent across game modes", () => {
  const css = read("public/app.css");

  assert.match(css, /\.standard-card-game,\s*\.table-skin-classic-green \{[\s\S]*?--table-green: #0f4635;[\s\S]*?--table-green-deep: #092b23;[\s\S]*?--table-border: #315a54;/);
  assert.match(css, /\.game-table \{[\s\S]*?border: 2px solid var\(--table-border\);[\s\S]*?var\(--table-green-deep\)/);
  assert.doesNotMatch(css, /\.blackjack-game\s*\{[^}]*?--table-green/);
  assert.doesNotMatch(css, /\.holdem-game\s*\{[^}]*?--table-green/);
  for (const selector of ["blackjack-table", "holdem-table", "five-card-draw-table", "juan-table"]) {
    assert.doesNotMatch(css, new RegExp(`\\.${selector}\\s*\\{[^}]*?(?:border-color|background:)`));
  }

  assert.match(css, /\.card-back\.card-skin-cardcade-pixel \{/);
  assert.match(css, /\.draw-stack\.card-skin-cardcade-pixel::before/);
  assert.match(css, /\.blackjack-card-back b \{ display: none; \}/);
  assert.match(css, /\.draw-card-back\.card-skin-cardcade-pixel::after \{ content: none; \}/);
});

test("table skins are independently previewed and applied to every game table", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function renderTableSkinPreview/);
  assert.match(app, /type: "table",[\s\S]*?options: cardSkins\.tableSkins\(\)/);
  assert.match(app, /function renderAppearanceChoicePreview[\s\S]*?renderTableSkinPreview\(choice\)/);
  assert.match(app, /data-appearance-category=/);
  for (const gameClass of ["blackjack-game", "holdem-game", "five-card-draw-game", "juan-game", "rotating-rummy-game"]) {
    assert.match(app, new RegExp("standard-card-game \\$\\{activeTableAppearanceClass\\(\\)\\} " + gameClass));
  }
  assert.match(app, /standard-card-game \$\{activeTableAppearanceClass\(\)\}" data-game-id="\$\{escapeHtml\(game\.gameId\)\}"/);
  for (const className of ["table-skin-classic-green", "table-skin-midnight-blue", "table-skin-burgundy-velvet", "table-skin-plum-purple"]) {
    assert.match(css, new RegExp(`\\.${className} \\{[\\s\\S]*?--table-green:`));
  }
  assert.match(css, /\.table-skin-preview \{[\s\S]*?var\(--table-green-light\)[\s\S]*?var\(--table-green-deep\)/);
  assert.match(css, /\.game-table \{[\s\S]*?var\(--table-grid\)[\s\S]*?var\(--table-felt-shadow\)/);
});

test("every game shell uses the shared 3s and 7s table UI", () => {
  const css = read("public/app.css");

  assert.match(css, /:is\(\.suit-ladder, \.blackjack-rule-bar, \.holdem-rule-bar, \.five-card-draw-rule-bar\) \{/);
  assert.match(css, /\.game-actions button\.primary \{ border-color: #ff8580;/);
  assert.match(css, /\.game-actions button\.danger \{ border-color: #c87072;/);
  assert.match(css, /:is\(\.holdem-opponents, \.five-card-draw-opponents\) \.game-seat\.all-in \{ border-color: var\(--blue\);/);
  assert.match(css, /\.juan-game \.game-seat\.juan-alert \{ border-color: var\(--coral\);/);
  assert.doesNotMatch(css, /--(?:blackjack|holdem|draw)-/);
  for (const selector of [
    "blackjack-actions button.primary",
    "holdem-actions button.primary",
    "five-card-draw-actions button.primary",
    "blackjack-table .game-status .badge",
    "holdem-table .game-status .badge",
    "five-card-draw-table .game-status .badge",
    "blackjack-result",
    "holdem-result",
    "five-card-draw-result",
    "juan-result"
  ]) {
    assert.doesNotMatch(css, new RegExp(`\\.${selector.replaceAll(".", "\\.")}\\s*\\{`));
  }
});

test("the Standard 52 settings preview leaves clear space around its corner mark", () => {
  const css = read("public/app.css");

  assert.match(css, /\.skin-preview-standard-face > span i \{ margin-top: 1px; font: normal \.68rem Georgia, serif; \}/);
  assert.match(css, /\.skin-preview-standard-face > b \{ position: absolute; inset: 30px 25% 16px; display: grid; place-items: center; font: normal 1\.25rem\/\.8 Georgia, serif; \}/);
});

test("alternate standard skins cover faces, backs, stacks, and previews without leaking into JUAN", () => {
  const css = read("public/app.css");

  for (const skinClass of ["card-skin-casino-gold", "card-skin-royal-violet", "card-skin-crimson-arcade"]) {
    assert.match(css, new RegExp(`\\.playing-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.standard-seat-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.card-back\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.draw-stack\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.skin-preview\\.${skinClass}`));
  }
  assert.doesNotMatch(css, /\.juan-card\.card-skin-(?:casino-gold|royal-violet|crimson-arcade)/);
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
  assert.match(app, /original illustrated 3s & 7s and Thirteen cards/);
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
