import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Rotating Rummy browser modules load deck, Routes, and rules before the app", () => {
  const html = read("public/index.html");
  const worker = read("public/sw.js");
  const deckIndex = html.indexOf('src="shared/rotating-rummy-deck.js');
  const routesIndex = html.indexOf('src="shared/rotating-rummy-routes.js');
  const rulesIndex = html.indexOf('src="shared/rotating-rummy-rules.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(deckIndex > 0);
  assert.ok(routesIndex > deckIndex);
  assert.ok(rulesIndex > routesIndex);
  assert.ok(appIndex > rulesIndex);
  assert.match(worker, /shared\/rotating-rummy-deck\.js/);
  assert.match(worker, /shared\/rotating-rummy-routes\.js/);
  assert.match(worker, /shared\/rotating-rummy-rules\.js/);
});

test("Rotating Rummy has its own Route UI, controls, and fanned-card renderer", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function renderRotatingRummyGame/);
  assert.match(app, /function renderRotatingRummyCard/);
  assert.match(app, /function rotatingRummySelection/);
  assert.match(app, /function rummyRouteForPlayer/);
  assert.match(app, /function renderRummyPatternHelp/);
  assert.match(app, /function rummyWildMark/);
  assert.match(app, /Pattern help/);
  assert.match(app, /data-action="rummy-toggle-help"/);
  assert.match(app, /function rummyCornerFace/);
  assert.match(app, /rummy_draw_stock/);
  assert.match(app, /rummy_draw_discard/);
  assert.match(app, /rummy_complete_route/);
  assert.match(app, /rummy_link/);
  assert.match(app, /rummy_discard/);
  assert.match(app, /discardOk: selected\.length === 1/);
  assert.match(app, /evaluateRoute\(selected, route\)/);
  assert.match(app, /Lay the exact \$\{routeCardCount\}-card Route first, then link extra cards before your discard/);
  assert.match(app, /Choose your Route or another completed group, then link compatible cards before your discard/);
  assert.doesNotMatch(app, /evaluateRoute\(selected, match\.yourRoute\)/);
  assert.doesNotMatch(app, /findRouteCompletion\(state\.gameView\.hand, match\.yourRoute\)/);
  assert.doesNotMatch(app, /recommendedDiscard\(state\.gameView\.hand, match\.yourRoute\)/);
  assert.match(app, /rummy_next_round/);
  assert.match(app, /data-game-card=/);
  assert.match(app, /renderMiniCardBack\("rotating-rummy"/);
  assert.match(app, /standard-card-game \$\{activeTableAppearanceClass\(\)\} rotating-rummy-game/);
  assert.match(app, /class="rummy-table-stage"/);
  assert.match(app, /rummy-route-banner \$\{yourPlayer\?\.routeComplete \? "complete" : ""\}/);
  assert.doesNotMatch(app, /Your current Route/);
  assert.doesNotMatch(app, /class="rummy-route-stage"/);
  assert.doesNotMatch(app, /class="rummy-meld-zone/);
  assert.match(app, /desktopRummyFit/);
  assert.match(app, /rummy-action-wild/);
  assert.match(app, /rummy-action-pass/);
  assert.match(app, /rummy-action-pass" aria-hidden="true"><i><\/i><i><\/i>/);
  assert.match(app, /<b>Wild cards<\/b>/);
  assert.match(app, /<b>Pass cards<\/b>/);
  assert.doesNotMatch(app, />LOCK</);

  const renderer = app.slice(app.indexOf("function renderRotatingRummyCard"), app.indexOf("function renderRummyRouteProgress"));
  assert.match(renderer, /rummy-card-center/);
  assert.match(renderer, /rummy-rank-glyph/);
  assert.doesNotMatch(renderer, /pips|suit|♥|♠|♦|♣/);
  assert.match(css, /\.rummy-card \{/);
  assert.match(css, /\.rummy-card-center > b \{[\s\S]*?min\(56cqw, 46cqh\)[\s\S]*?text-align: center/);
  assert.match(css, /\.rummy-route-banner/);
  assert.match(css, /\.rummy-route-banner\.complete \{/);
  assert.match(css, /\.rummy-pattern-help/);
  assert.match(css, /\.rummy-link-board/);
  assert.match(css, /\.rummy-link-group-cards \.playing-card\.played \{[\s\S]*?flex: 0 0 27px;[\s\S]*?border-radius: 3px/);
  assert.match(css, /\.rummy-link-group-cards \.rummy-card-ink::before,[\s\S]*?content: none/);
  assert.match(css, /\.rummy-link-group-cards \.rummy-card-center \{ inset-inline: 7%;/);
  assert.match(css, /\.rummy-link-group-cards \.rummy-card-center > b \{ font-size: min\(48cqw, 40cqh\)/);
  assert.match(css, /\.rummy-link-group-cards \.rummy-corner strong \{[\s\S]*?font-size: min\(26cqw, 20cqh\)/);
  assert.match(css, /\.rummy-actions \{ grid-template-columns: repeat\(7/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.rummy-actions \{ grid-template-columns: repeat\(3/);
  assert.match(css, /\.rummy-table-stage \{ display: contents; \}/);
  assert.match(css, /\.playing-game \.rotating-rummy-game \{[\s\S]*?height: calc\(var\(--game-viewport-height\)[\s\S]*?grid-template-rows:/);
  assert.match(css, /\.rummy-table-stage \{ min-height: 0; display: grid; grid-template-rows: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.rotating-rummy-game \.rummy-table-stage \.rummy-link-board \{ min-height: 0; max-height: 116px;[\s\S]*?overflow: auto;/);
});

test("Rotating Rummy's blackout and light skins remain deck-family-scoped visual preferences", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const skins = read("shared/card-skins.js");

  assert.match(app, /skin-preview-rummy-face/);
  assert.match(app, /skin-preview-rummy-wild/);
  assert.match(app, /deckFamilyId: "rotating-rummy", context: "stock"/);
  assert.match(css, /\.rummy-wild-mark \{/);
  assert.match(css, /\.rummy-action-pass i \{/);
  for (const skinClass of ["card-skin-rotating-rummy-blackout", "card-skin-rotating-rummy-light"]) {
    assert.match(css, new RegExp(`\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.rummy-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.card-back\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.rummy-stock\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.rummy-seat-card\\.${skinClass}`));
    assert.match(css, new RegExp(`\\.skin-preview\\.${skinClass}`));
  }
  assert.match(skins, /id: "rotating-rummy-light"/);
  assert.doesNotMatch(css, /\.playing-card\.card-skin-rotating-rummy-(?:blackout|light)\.(?:red|black)/);
});
