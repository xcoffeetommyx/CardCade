import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("ordinary stock quantities are table copy, never card-back decoration", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const backRenderer = app.slice(app.indexOf("function renderCardBack"), app.indexOf("function renderOrdinaryStock"));
  const stockRenderer = app.slice(app.indexOf("function renderOrdinaryStock"), app.indexOf("function tableSeatAssignments"));

  assert.doesNotMatch(backRenderer, /countBadge|card-back-count/);
  assert.doesNotMatch(css, /\.card-back-count/);
  assert.match(stockRenderer, /class="ordinary-stock-display"/);
  assert.match(stockRenderer, /ariaLabel: `\$\{safeCount\} cards in stock`/);
  assert.match(stockRenderer, /class="ordinary-stock-copy" aria-hidden="true"/);
  assert.match(stockRenderer, /<strong>\$\{escapeHtml\(label\)\}<\/strong><small>\$\{safeCount\} card/);
  assert.match(css, /\.ordinary-stock-copy \{[^}]*position: relative;[^}]*text-align: center;/);
  assert.doesNotMatch(css.match(/\.ordinary-stock-copy \{[^}]*\}/)?.[0] || "", /transform:/);
});

test("JUAN and Rotating Rummy use the shared external stock label", () => {
  const app = read("public/app.js");

  assert.match(app, /renderOrdinaryStock\(\{ deckFamilyId: "color-action", className: "juan-stock", count: match\.stockCount \}\)/);
  assert.match(app, /renderOrdinaryStock\(\{ deckFamilyId: "rotating-rummy", className: "rummy-stock", count: match\.stockCount \}\)/);
  assert.doesNotMatch(app, /renderCardBack\([^)]*countBadge/);
});

test("Five Card Draw keeps its accessible screen-facing Draw and count presentation", () => {
  const app = read("public/app.js");
  const renderer = app.slice(app.indexOf("function renderFiveCardDrawPile"), app.indexOf("function renderFiveCardDrawGame"));

  assert.match(renderer, /aria-label="\$\{safeCount\} cards in \$\{label\.toLowerCase\(\)\} pile"/);
  assert.match(renderer, /<strong>\$\{label\}<\/strong><small>\$\{safeCount\} card/);
  assert.match(renderer, /class="five-card-draw-pile-cards" aria-hidden="true"/);
  assert.doesNotMatch(renderer, /countBadge|card-back-count/);
});
