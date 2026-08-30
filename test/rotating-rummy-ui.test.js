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
  assert.doesNotMatch(app, /evaluateRoute\(selected, match\.yourRoute\)/);
  assert.doesNotMatch(app, /findRouteCompletion\(state\.gameView\.hand, match\.yourRoute\)/);
  assert.doesNotMatch(app, /recommendedDiscard\(state\.gameView\.hand, match\.yourRoute\)/);
  assert.match(app, /rummy_next_round/);
  assert.match(app, /data-game-card=/);
  assert.match(app, /renderMiniCardBack\("rotating-rummy"/);
  assert.match(app, /standard-card-game \$\{activeTableAppearanceClass\(\)\} rotating-rummy-game/);

  const renderer = app.slice(app.indexOf("function renderRotatingRummyCard"), app.indexOf("function renderRummyRouteProgress"));
  assert.match(renderer, /rummy-card-center/);
  assert.match(renderer, /rummy-rank-glyph/);
  assert.doesNotMatch(renderer, /pips|suit|♥|♠|♦|♣/);
  assert.match(css, /\.rummy-card \{/);
  assert.match(css, /\.rummy-card-center > b \{[\s\S]*?Cardcade Ranks/);
  assert.match(css, /\.rummy-route-banner/);
  assert.match(css, /\.rummy-pattern-help/);
  assert.match(css, /\.rummy-meld-zone/);
  assert.match(css, /\.rummy-link-board/);
  assert.match(css, /\.rummy-actions \{ grid-template-columns: repeat\(7/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.rummy-actions \{ grid-template-columns: repeat\(3/);
});

test("Blackout Edition remains a deck-family-scoped visual preference", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /skin-preview-rummy-face/);
  assert.match(app, /skin-preview-rummy-glitch/);
  assert.match(app, /deckFamilyId: "rotating-rummy", context: "stock"/);
  assert.match(css, /\.card-skin-rotating-rummy-blackout/);
  assert.match(css, /\.rummy-card\.card-skin-rotating-rummy-blackout/);
  assert.match(css, /\.card-back\.card-skin-rotating-rummy-blackout/);
  assert.match(css, /\.rummy-stock\.card-skin-rotating-rummy-blackout/);
  assert.match(css, /\.skin-preview\.card-skin-rotating-rummy-blackout/);
  assert.doesNotMatch(css, /\.playing-card\.card-skin-rotating-rummy-blackout\.(?:red|black)/);
});
