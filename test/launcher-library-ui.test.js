import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the launcher keeps catalog and launch behavior behind one spatial deck-to-game scene", () => {
  const app = read("public/app.js");

  assert.match(app, /selectedDeckFamilyId/);
  assert.match(app, /libraryStage: "decks"/);
  assert.match(app, /function compatibleDeckFamilies/);
  assert.match(app, /function selectedDeckFamily/);
  assert.match(app, /function renderOrbitalDeck/);
  assert.match(app, /deck-box-side deck-box-side-left/);
  assert.match(app, /deck-box-bottom/);
  assert.match(app, /deck-box-emblem/);
  assert.match(app, /function rotateLibraryDeck/);
  assert.match(app, /function openLibraryGames/);
  assert.match(app, /data-action="select-orbital-deck"/);
  assert.match(app, /data-action="select-library-game"/);
  assert.match(app, /data-action="open-room-library"/);
  assert.match(app, /if \(sendRoom\(\{ type: "select_game", gameId: game\.id \}\)\) navigate\("room"\)/);
  assert.match(app, /state\.screen === "library" && state\.mode === "multiplayer" && state\.room/);
  assert.match(app, /data-action="open-hot-seat"/);
  assert.match(app, /state\.libraryStage === "decks"/);
  assert.match(app, /app\.querySelector\("\.spatial-mode-list"\)\?\.scrollBy/);
  assert.match(app, /const availableTargets = controllerTargets\(\)/);
  assert.match(app, /librarySwipeGesture/);
  assert.match(app, /librarySuppressDeckClickUntil = performance\.now\(\) \+ 120/);
  assert.match(app, /document\.addEventListener\("wheel"/);
});

test("the orbital launcher uses CSS depth, fixed-scene mode scrolling, and responsive reduced-motion layouts", () => {
  const css = read("public/app.css");
  const html = read("public/index.html");
  const worker = read("public/sw.js");

  assert.match(css, /\.library-screen \{ overflow: hidden; \}/);
  assert.match(css, /\.arcade-library-scene/);
  assert.match(css, /perspective: 1100px/);
  assert.match(css, /\.orbital-deck\[data-orbit-slot="0"\]/);
  assert.match(css, /translate3d\([\s\S]*?rotateY/);
  assert.match(css, /\.orbital-deck-box/);
  assert.match(css, /--deck-box-depth: clamp/);
  assert.match(css, /\.orbital-deck \{[\s\S]*?filter: none;[\s\S]*?transform-style: preserve-3d/);
  assert.match(css, /\.deck-box-front,[\s\S]*?brightness\(var\(--orbit-face-brightness\)\)/);
  assert.match(css, /\.orbital-deck-box::after[\s\S]*?translateZ\(calc\(var\(--deck-box-half-depth\) \+ 3px\)\)/);
  assert.match(css, /\.orbital-deck:is\(:focus-visible, \.controller-hover, \.controller-focus\) \.orbital-deck-box::after \{ opacity: 1; \}/);
  assert.match(css, /\.controller-hover\.orbital-deck,[\s\S]*?outline: 0 !important;[\s\S]*?filter: none !important;/);
  assert.match(css, /\.deck-box-side-left/);
  assert.match(css, /\.deck-box-side-right/);
  assert.match(css, /\.deck-box-bottom/);
  assert.match(css, /translateZ\(var\(--deck-box-half-depth\)\)/);
  assert.match(css, /rotateX\(-12deg\) rotateY\(-20deg\)/);
  assert.match(css, /data-orbit-slot="2"[^}]*rotateY\(-164deg\)/);
  assert.match(css, /--deck-box-face: #234d8b/);
  assert.match(css, /\.show-games \.orbital-deck-stage/);
  assert.match(css, /\.spatial-game-option/);
  assert.match(css, /\.spatial-mode-list \{[\s\S]*?overflow-y: auto/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?--library-orbit-x/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 640px\)[\s\S]*?--library-deck-width/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\) and \(min-height: 620px\)[\s\S]*?\.home-screen \.button-copy \{ display: none; \}/);
  assert.match(html, /<link rel="stylesheet" href="app\.css\?v=\d+">/);
  assert.match(html, /<script type="module" src="app\.js\?v=\d+"><\/script>/);
  assert.match(worker, /const CACHE_NAME = "cardcade-shell-v\d+"/);
});
