import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the UI pixel font substitutes the readable 2 and 5 glyphs globally", () => {
  const css = read("public/app.css");
  assert.match(css, /font-family: "Cardcade Pixel";[\s\S]*cardcade-pixel-ranks\.woff2[\s\S]*unicode-range: U\+0032, U\+0035/);
  assert.match(css, /pixelify-sans-latin\.woff2[\s\S]*U\+0033-0034, U\+0036-10FFFF/);
});

test("long table combinations use the shared adaptive fan pile", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  assert.match(app, /function layoutActivePiles/);
  assert.match(app, /cardPresentation\.calculateFanLayout/);
  assert.match(app, /maximumRotation: 7/);
  assert.match(app, /layoutActivePiles\(\);[\s\S]*layoutStandardHand\(\)/);
  assert.match(css, /\.active-pile\.cards-pile[\s\S]*width: 100%/);
  assert.match(css, /--pile-x/);
  assert.match(css, /--pile-rotation/);
});

test("table seats render the last public card instead of player initials", () => {
  const app = read("public/app.js");
  assert.match(app, /function renderSeatLastCard/);
  assert.match(app, /player\.lastPlayedCard/);
  assert.match(app, /renderSeatLastCard\(player, game\.gameId\)/);
  assert.match(app, /renderSeatLastCard\(player, "juan"\)/);
});
