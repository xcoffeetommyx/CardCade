import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Blackjack loads its browser rules before the Cardcade application", () => {
  const html = read("public/index.html");
  const rulesIndex = html.indexOf('src="shared/blackjack-rules.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(rulesIndex > 0);
  assert.ok(appIndex > rulesIndex);
});

test("Blackjack uses the shared physical cards, fan, and private hand model", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const worker = read("public/sw.js");

  assert.match(app, /function renderBlackjackGame/);
  assert.match(app, /renderPlayingCard\(card, index, \{ played: true/);
  assert.match(app, /data-hand-owner="\$\{escapeHtml\(handOwner\)\}"/);
  assert.match(app, /function renderBlackjackCardBack/);
  assert.match(app, /blackjackPrivateCards\(message\.view\)/);
  assert.match(app, /blackjack_hit/);
  assert.match(app, /blackjack_stand/);
  assert.match(app, /blackjack_double/);
  assert.match(app, /blackjack_split/);
  assert.match(app, /blackjack_surrender/);
  assert.match(app, /blackjack_insurance/);
  assert.match(app, /match\.phase === "dealer-turn"/);
  assert.match(css, /\.blackjack-game/);
  assert.match(css, /\.blackjack-card-back/);
  assert.match(css, /\.blackjack-hand-summaries/);
  assert.match(css, /\.blackjack-actions/);
  assert.match(worker, /shared\/blackjack-rules\.js/);
});
