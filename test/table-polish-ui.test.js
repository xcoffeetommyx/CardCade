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
  assert.match(css, /\.playing-card\.played\s*\{[\s\S]*?transition: none/);
});

test("table seats render the last public card instead of player initials", () => {
  const app = read("public/app.js");
  assert.match(app, /function renderSeatLastCard/);
  assert.match(app, /player\.lastPlayedCard/);
  assert.match(app, /renderSeatLastCard\(player, game\.gameId\)/);
  assert.match(app, /renderSeatLastCard\(player, "juan"\)/);
});

test("mobile tables use the visible viewport and keep long player names inside their seats", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(css, /--game-viewport-height: 100svh/);
  assert.match(css, /min-height: calc\(var\(--game-viewport-height\) - var\(--safe-top\) - var\(--game-main-top\) - var\(--game-main-bottom\)\)/);
  assert.match(css, /grid-template-columns: 44px minmax\(0, 1fr\) auto/);
  assert.match(css, /\.game-seat-copy \{ min-width: 0; \}/);
  assert.match(css, /\.game-seat-copy > strong, \.game-seat-copy > small \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.playing-game \.standard-card-game \{[\s\S]*?--game-card-width: clamp\(60px, 18vw, 76px\)/);
  assert.match(app, /class="game-seat-copy" title="\$\{escapeHtml\(player\.name\)\}"/);
  assert.match(app, /window\.visualViewport\?\.addEventListener\("resize", scheduleGameTableLayout\)/);
});

test("showdowns reveal full Five Card Draw hands and Blackjack insurance stays in view", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function renderFiveCardDrawShowdownCard/);
  assert.match(app, /function renderFiveCardDrawShowdown/);
  assert.match(app, /player\.revealedCards\.map\(renderFiveCardDrawShowdownCard\)/);
  assert.match(app, /winnerSeats = new Set\(match\.showdown\.winnerSeats/);
  assert.match(app, /renderFiveCardDrawShowdown\(match\)/);
  assert.match(css, /\.five-card-draw-showdown-hand\.winner/);
  assert.match(app, /function renderBlackjackInsurancePrompt/);
  assert.match(app, /blackjack-table \$\{isInsuranceTurn \? "insurance-pending"/);
  assert.match(css, /\.blackjack-table\.insurance-pending/);
  assert.match(css, /\.playing-game \.blackjack-insurance-prompt \{[\s\S]*?position: fixed;/);
});
