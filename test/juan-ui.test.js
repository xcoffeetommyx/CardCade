import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the JUAN browser modules load in deck-before-rules order", () => {
  const html = read("public/index.html");
  const deckIndex = html.indexOf('src="shared/juan-deck.js');
  const rulesIndex = html.indexOf('src="shared/juan-rules.js');
  const appIndex = html.indexOf('src="app.js');
  assert.ok(deckIndex > 0);
  assert.ok(rulesIndex > deckIndex);
  assert.ok(appIndex > rulesIndex);
});

test("JUAN has its own renderer while retaining the shared fan and motion path", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const html = read("public/index.html");
  const worker = read("public/sw.js");
  assert.match(app, /function renderJuanCard/);
  assert.match(app, /function juanCornerFace/);
  assert.match(app, /function juanActionMark/);
  assert.match(app, /function renderJuanGame/);
  assert.match(app, /choose-juan-color/);
  assert.match(app, /animateStandardHandExit\(cardIds/);
  assert.match(app, /juan-rank-glyph/);
  assert.match(app, /juan-card-center/);
  assert.match(app, /juan-action-double-draw/);
  assert.match(app, /juan-action-\$\{kind\}/);
  assert.match(app, /tabindex="\$\{selectable \? "0" : "-1"\}"/);
  assert.match(css, /\.juan-card-ink/);
  assert.match(css, /\.juan-card-center > b[\s\S]*Cardcade Ranks/);
  assert.match(css, /\.juan-action-pause/);
  assert.match(css, /\.juan-action-turnabout/);
  assert.match(css, /\.juan-action-double-draw/);
  assert.match(css, /\.juan-action-prism-burst/);
  assert.match(css, /\.juan-kind-double-draw \.juan-corner strong,[\s\S]*?Cardcade Ranks/);
  assert.match(css, /\.juan-kind-double-draw \.juan-corner strong \{[\s\S]*?color: #fffaf0;[\s\S]*?-webkit-text-stroke: 1px #07101d;/);
  assert.match(css, /\.juan-action-double-draw b \{[\s\S]*?color: #fffaf0;[\s\S]*?-webkit-text-stroke-color: #07101d;/);
  assert.match(css, /\.juan-card\.card-skin-juan-paper-pop:is\(\.juan-kind-double-draw, \.juan-kind-prism-burst\) \.juan-corner strong \{[\s\S]*?color: #07101d;[\s\S]*?-webkit-text-stroke: 0;/);
  assert.match(css, /\.juan-card\.card-skin-juan-paper-pop \.juan-action-double-draw b,[\s\S]*?color: #07101d;[\s\S]*?-webkit-text-stroke-color: var\(--juan-face\);/);
  assert.match(css, /\.juan-action-prism-burst b \{ padding: 0; border: 0; border-radius: 0; background: transparent; \}/);
  assert.match(css, /\.juan-stock span/);
  assert.match(css, /\.juan-color-chooser/);
  assert.match(css, /\.juan-prism-dialog/);
  assert.match(css, /\.juan-prism-reveal/);
  assert.match(app, /function queueJuanPrismReveal/);
  assert.match(app, /function syncJuanPrismReveal/);
  assert.match(app, /data-reveal-key/);
  assert.match(app, /state\.juanPrismReveal\?\.key === revealKey/);
  assert.match(app, /juanPrismRevealRoot\.innerHTML = renderJuanPrismReveal\(\)/);
  assert.match(app, /candidate\.lastPlayedCard\?\.id === nextCard\.id/);
  assert.match(css, /\.juan-game \.game-opponents/);
  assert.match(html, /id="juan-prism-reveal-root"/);
  assert.match(worker, /shared\/juan-deck\.js/);
  assert.match(worker, /shared\/juan-rules\.js/);

  const renderer = app.slice(app.indexOf("function renderJuanCard"), app.indexOf("function juanColorChooser"));
  assert.doesNotMatch(renderer, /JUAN/);
  assert.doesNotMatch(renderer, /juan-card-brand/);
  assert.doesNotMatch(renderer, /juan-card-emblem/);
});
