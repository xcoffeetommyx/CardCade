import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the launcher organizes each play mode by deck family before its games", () => {
  const app = read("public/app.js");

  assert.match(app, /selectedDeckFamilyId/);
  assert.match(app, /function compatibleDeckFamilies/);
  assert.match(app, /function selectedDeckFamily/);
  assert.match(app, /data-action="select-deck-family"/);
  assert.match(app, /Step 1 · Choose a deck family/);
  assert.match(app, /Step 2 · Choose a game/);
  assert.match(app, /catalogMarkup\("multiplayer", \{ compact: true, selectedGameId: room\.gameId \}\)/);
  assert.match(app, /data-action="open-hot-seat"/);
});

test("the deck-first launcher stays compact at desktop and narrow phone breakpoints", () => {
  const css = read("public/app.css");
  const html = read("public/index.html");
  const worker = read("public/sw.js");

  assert.match(css, /\.deck-family-picker/);
  assert.match(css, /\.deck-family-rail/);
  assert.match(css, /\.library-game-grid/);
  assert.match(css, /@media \(min-width: 1040px\)[\s\S]*?\.library-game-grid/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.deck-family-button/);
  assert.match(css, /@media \(max-width: 520px\) and \(min-height: 620px\)[\s\S]*?\.home-screen \.button-copy \{ display: none; \}/);
  assert.match(html, /\/app\.css\?v=31/);
  assert.match(html, /\/app\.js\?v=32/);
  assert.match(worker, /cardcade-shell-v36/);
});
