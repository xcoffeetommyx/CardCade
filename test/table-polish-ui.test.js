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

test("modern hands honor the card directly under the pointer", () => {
  const app = read("public/app.js");
  const handLayoutStart = app.indexOf("function layoutStandardHand()");
  const handLayoutEnd = app.indexOf("function toggleStandardCard", handLayoutStart);
  assert.ok(handLayoutStart >= 0 && handLayoutEnd > handLayoutStart);
  const handLayout = app.slice(handLayoutStart, handLayoutEnd);

  assert.match(handLayout, /const targetCard = event\.target\.closest\?\.\("\[data-game-card\]"\);/);
  assert.match(handLayout, /if \(!targetCard \|\| !hand\.contains\(targetCard\)\) return;/);
  assert.match(handLayout, /toggleStandardCard\(targetCard\.dataset\.gameCard\);/);
  assert.doesNotMatch(handLayout, /fanIndexAtPoint/);
});

test("game redraws preserve the current mobile viewport position", () => {
  const app = read("public/app.js");

  assert.match(app, /function captureGameScrollPosition/);
  assert.match(app, /function restoreGameScrollPosition/);
  assert.match(app, /state\.screen === "game" && Boolean\(app\.querySelector\("\.standard-card-game"\)\)/);
  assert.match(app, /captureGameScrollPosition\(\)/);
  assert.match(app, /window\.scrollTo\(position\.left, position\.top\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{[\s\S]*?state\.screen === "game"\) restore\(\)/);
});

test("table status and stock counts expand instead of cutting off long labels", () => {
  const css = read("public/app.css");

  assert.match(css, /\.game-status > span:first-child \{ flex: 1 1 auto; min-width: 0; \}/);
  assert.match(css, /\.game-status \.badge \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.doesNotMatch(css, /\.game-status \.badge \{ max-width: 112px;[\s\S]*?text-overflow: ellipsis/);
  assert.match(css, /:is\(\.juan-stock, \.rummy-stock\) b \{[\s\S]*?width: max-content;[\s\S]*?white-space: nowrap;/);
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

test("shedding tables visibly mark first, second, and third place as players go out", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function placementForPlayer/);
  assert.match(app, /function placementClassFor/);
  assert.match(app, /const yourPlace = placementForPlayer\(match, yourPlayer\);/);
  assert.match(app, /const playerPlace = placementForPlayer\(match, player\);/);
  assert.match(app, /class="game-score \$\{placementClassFor\(yourPlace\)\}"/);
  assert.match(app, /\$\{placementClassFor\(playerPlace\)\}/);
  assert.match(app, /\$\{playerPlace \? `\$\{placeLabel\(playerPlace\)\} place`/);
  assert.match(css, /\.game-seat\.placement-first,[\s\S]*?\.game-score\.placement-first,[\s\S]*?\.juan-game \.game-seat\.placement-first/);
  assert.match(css, /\.game-seat\.placement-second,[\s\S]*?\.game-score\.placement-second,[\s\S]*?\.juan-game \.game-seat\.placement-second/);
  assert.match(css, /\.game-seat\.placement-third,[\s\S]*?\.game-score\.placement-third,[\s\S]*?\.juan-game \.game-seat\.placement-third/);
});

test("four-round Thirteen matches show progress and final point standings", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function renderStandardFinalStandings/);
  assert.match(app, /Number\.isInteger\(match\.totalRounds\) \? `Round \$\{match\.round\}\/\$\{match\.totalRounds\}`/);
  assert.match(app, /match\.matchOver \? renderStandardFinalStandings\(match\)/);
  assert.match(app, /match\.matchOver \? "Match complete" : "Round complete"/);
  assert.match(css, /\.final-standings \{/);
  assert.match(css, /\.final-standings li\.winner/);
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
