import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Five Card Draw loads its shared rules before Cardcade's application module", () => {
  const html = read("public/index.html");
  const holdEmRulesIndex = html.indexOf('src="shared/holdem-rules.js');
  const drawRulesIndex = html.indexOf('src="shared/five-card-draw-rules.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(holdEmRulesIndex > 0);
  assert.ok(drawRulesIndex > holdEmRulesIndex);
  assert.ok(appIndex > drawRulesIndex);
});

test("Five Card Draw reuses Cardcade's private fan, physical card flight, and fixed-limit controls", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const worker = read("public/sw.js");

  assert.match(app, /function renderFiveCardDrawGame/);
  assert.match(app, /five_card_draw_draw/);
  assert.match(app, /five_card_draw_fold/);
  assert.match(app, /five_card_draw_check/);
  assert.match(app, /five_card_draw_call/);
  assert.match(app, /five_card_draw_bet/);
  assert.match(app, /five_card_draw_raise/);
  assert.match(app, /five_card_draw_next_hand/);
  assert.match(app, /fiveCardDrawRules\.BETTING_PHASES/);
  assert.match(app, /five-card-draw-draw/);
  assert.match(app, /animateStandardHandExit\(cardIds/);
  assert.match(app, /data-hand-owner="\$\{escapeHtml\(handOwner\)\}"/);
  assert.match(app, /match\.phase !== "draw"/);
  assert.match(app, /function layoutStandardHand/);
  assert.match(app, /standard-card-game \$\{activeTableAppearanceClass\(\)\} five-card-draw-game/);
  assert.match(css, /\.five-card-draw-table-zone/);
  assert.match(css, /\.draw-card-back/);
  assert.match(css, /\.five-card-draw-actions/);
  assert.match(worker, /shared\/five-card-draw-rules\.js/);
});
