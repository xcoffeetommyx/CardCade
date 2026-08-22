import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Texas Hold'em loads its rules before Cardcade's application module", () => {
  const html = read("public/index.html");
  const rulesIndex = html.indexOf("/shared/holdem-rules.js");
  const appIndex = html.indexOf("/app.js");

  assert.ok(rulesIndex > 0);
  assert.ok(appIndex > rulesIndex);
});

test("Texas Hold'em reuses the shared card fan for hole cards and community cards", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const worker = read("public/sw.js");

  assert.match(app, /function renderHoldemGame/);
  assert.match(app, /renderPlayingCard\(card, index, \{ played: true, enter: boardIsNew \}\)/);
  assert.match(app, /data-hand-owner="\$\{escapeHtml\(handOwner\)\}"/);
  assert.match(app, /inert: true/);
  assert.match(app, /holdem_fold/);
  assert.match(app, /holdem_check/);
  assert.match(app, /holdem_call/);
  assert.match(app, /holdem_bet/);
  assert.match(app, /holdem_raise/);
  assert.match(app, /holdem_next_hand/);
  assert.match(app, /function layoutActivePiles/);
  assert.match(app, /function layoutStandardHand/);
  assert.match(css, /\.holdem-game/);
  assert.match(css, /\.holdem-board-zone/);
  assert.match(css, /\.holdem-actions/);
  assert.match(css, /\.poker-hole-back/);
  assert.match(worker, /shared\/holdem-rules\.js/);
});
