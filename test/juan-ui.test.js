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
  assert.match(app, /renderOrdinaryStock\(\{ deckFamilyId: "color-action", className: "juan-stock", count: match\.stockCount \}\)/);
  assert.match(css, /\.ordinary-stock-copy/);
  assert.doesNotMatch(css, /\.card-back-count/);
  assert.match(css, /\.juan-color-chooser/);
  assert.match(css, /\.juan-prism-dialog/);
  assert.match(css, /\.juan-prism-reveal/);
  assert.match(css, /\.juan-reaction-panel/);
  assert.match(css, /\.juan-call-panel/);
  assert.match(css, /\.juan-prism-challenge-panel/);
  assert.match(app, /function queueJuanPrismReveal/);
  assert.match(app, /function queueJuanCallReveal/);
  assert.match(app, /state\.seenJuanCallAnnouncements/);
  assert.match(app, /announcement\.seat === nextViewer/);
  assert.match(app, /One card remains/);
  assert.match(css, /\.juan-prism-reveal\.juan-call-reveal/);
  assert.match(css, /\.juan-call-shout/);
  assert.match(app, /function renderJuanReactionPanels/);
  assert.match(app, /data-action="juan-call"/);
  assert.match(app, /data-action="juan-catch"/);
  assert.match(app, /data-action="juan-challenge-prism-burst"/);
  assert.match(app, /data-action="juan-accept-prism-burst"/);
  assert.match(app, /juan_call/);
  assert.match(app, /juan_catch/);
  assert.match(app, /juan_challenge_prism_burst/);
  assert.match(app, /juan_accept_prism_burst/);
  assert.match(app, /declareJuan/);
  assert.match(app, /function syncJuanPrismReveal/);
  assert.match(app, /data-reveal-key/);
  assert.match(app, /state\.juanPrismReveal\?\.key === revealKey/);
  assert.match(app, /juanPrismRevealRoot\.innerHTML = renderJuanPrismReveal\(\)/);
  assert.match(app, /candidate\.lastPlayedCard\?\.id === nextCard\.id/);
  assert.match(css, /\.juan-game \.game-opponents/);
  assert.match(html, /id="juan-prism-reveal-root"/);
  assert.match(html, /id="juan-gameplay-overlay-root"/);
  assert.match(worker, /shared\/juan-deck\.js/);
  assert.match(worker, /shared\/juan-rules\.js/);
  assert.match(app, /Round \$\{match\.round\} \/ \$\{totalRounds\}/);
  assert.match(app, /match\.matchOver \? renderStandardFinalStandings\(match\)/);
  assert.match(app, /data-action="next-round"/);
  assert.match(app, /player\.score} pts/);

  const renderer = app.slice(app.indexOf("function renderJuanCard"), app.indexOf("function juanColorChooser"));
  assert.doesNotMatch(renderer, /JUAN/);
  assert.doesNotMatch(renderer, /juan-card-brand/);
  assert.doesNotMatch(renderer, /juan-card-emblem/);
});

test("JUAN authoritative reactions stay above non-interactive cinematic reveals", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const html = read("public/index.html");
  const reactionRenderer = app.slice(app.indexOf("function renderJuanReactionPanels"), app.indexOf("function syncJuanGameplayOverlay"));
  const gameRenderer = app.slice(app.indexOf("function renderJuanGame"), app.indexOf("function renderHotSeatHandoff"));

  assert.ok(html.indexOf('id="juan-gameplay-overlay-root"') > html.indexOf('id="juan-prism-reveal-root"'));
  assert.match(app, /const juanGameplayOverlayRoot = document\.querySelector\("#juan-gameplay-overlay-root"\)/);
  assert.match(app, /function syncJuanGameplayOverlay\(\)[\s\S]*?juanGameplayOverlayRoot\.innerHTML = match \? renderJuanReactionPanels\(match, viewerSeat\) : "";/);
  assert.match(app, /syncJuanGameplayOverlay\(\);\s*syncJuanPrismReveal\(\);/);
  assert.doesNotMatch(gameRenderer, /renderJuanReactionPanels/);

  assert.match(reactionRenderer, /match\.juanCall/);
  assert.match(reactionRenderer, /data-action="juan-call"/);
  assert.match(reactionRenderer, /data-action="juan-catch"/);
  assert.match(reactionRenderer, /match\.prismBurstChallenge/);
  assert.match(reactionRenderer, /data-action="juan-challenge-prism-burst"/);
  assert.match(reactionRenderer, /data-action="juan-accept-prism-burst"/);
  assert.match(reactionRenderer, /panels\.join\(""\)/);

  assert.match(css, /--layer-cinematic: 1650;[\s\S]*?--layer-gameplay-overlay: 1850;/);
  assert.match(css, /#juan-gameplay-overlay-root \{[\s\S]*?position: fixed;[\s\S]*?z-index: var\(--layer-gameplay-overlay\);[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.juan-reaction-panel \{[\s\S]*?pointer-events: auto;/);
  assert.match(css, /\.juan-prism-reveal \{[\s\S]*?z-index: var\(--layer-cinematic\);[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.juan-prism-dialog \{[\s\S]*?z-index: var\(--layer-gameplay-overlay\);/);
  assert.match(css, /\.round-result \{[\s\S]*?z-index: var\(--layer-gameplay-overlay\);/);
});

test("JUAN reactions are viewport overlays and mobile prompts stay compact instead of growing document flow", () => {
  const css = read("public/app.css");

  assert.match(css, /\.juan-gameplay-overlay \{[\s\S]*?position: absolute;[\s\S]*?bottom: max\(10px, calc\(var\(--safe-bottom\) \+ 6px\)\);[\s\S]*?max-height: calc\(100dvh - var\(--safe-top\) - var\(--safe-bottom\) - 20px\);/);
  assert.match(css, /\.playing-game:has\(\.juan-game\) \{[\s\S]*?overflow: hidden;/);
  assert.match(css, /@supports \(height: 100dvh\) \{\s*\.playing-game:has\(\.juan-game\) \{ --game-viewport-height: 100dvh; \}/);
  assert.match(css, /\.playing-game \.juan-game \{[\s\S]*?height: calc\(var\(--game-viewport-height\)[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\) auto;[\s\S]*?overflow: hidden;/);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*?\.juan-gameplay-overlay \{[^}]*var\(--safe-bottom\)[^}]*\}[\s\S]*?\.juan-reaction-panel \{[^}]*min-height: 56px;/);
  assert.doesNotMatch(css, /\.juan-reaction-panel \{[^}]*flex-direction: column/);
  assert.doesNotMatch(css, /\.juan-reaction-panel > button \{[^}]*width: 100%/);
});
