import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the JUAN browser modules load in deck-before-rules order", () => {
  const html = read("public/index.html");
  const deckIndex = html.indexOf("/shared/juan-deck.js");
  const rulesIndex = html.indexOf("/shared/juan-rules.js");
  const appIndex = html.indexOf("/app.js");
  assert.ok(deckIndex > 0);
  assert.ok(rulesIndex > deckIndex);
  assert.ok(appIndex > rulesIndex);
});

test("JUAN has its own renderer while retaining the shared fan and motion path", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const worker = read("public/sw.js");
  assert.match(app, /function renderJuanCard/);
  assert.match(app, /function renderJuanGame/);
  assert.match(app, /choose-juan-color/);
  assert.match(app, /animateStandardHandExit\(cardIds/);
  assert.match(css, /\.juan-card-orbit/);
  assert.match(css, /\.juan-color-chooser/);
  assert.match(css, /\.juan-game \.game-opponents/);
  assert.match(worker, /shared\/juan-deck\.js/);
  assert.match(worker, /shared\/juan-rules\.js/);
});
