import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the launcher is a controller-friendly title menu instead of a landing page", () => {
  const app = read("public/app.js");
  const home = app.slice(app.indexOf("function renderHome"), app.indexOf("function selectedGame"));

  assert.match(home, /class="game-shell-screen title-screen"/);
  assert.match(home, /class="main-menu"/);
  assert.match(home, />Solo</);
  assert.match(home, />Hot Seat</);
  assert.match(home, />Multiplayer</);
  assert.match(home, />Options</);
  assert.doesNotMatch(home, /Every table starts here/);
  assert.doesNotMatch(home, /button-copy/);
  assert.doesNotMatch(home, /title-atmosphere/);
  assert.doesNotMatch(home, /One arcade · many tables/);
  assert.doesNotMatch(home, /MOVE TO CHOOSE/);
  assert.match(app, /function handleMainMenuKeydown/);
  assert.match(app, /function mainMenuTargetIndex/);
  assert.match(app, /if \(state\.screen === "home"\)/);
});

test("Options uses the shared shell while preserving readable utility controls", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const settings = app.slice(app.indexOf("function renderSettings"), app.indexOf("function renderAppearanceSettings"));
  const appearance = app.slice(app.indexOf("function renderAppearanceSettings"), app.indexOf("let gameScrollRestoreFrame"));

  assert.match(settings, /class="game-shell-screen options-screen"/);
  assert.match(settings, /class="options-console" data-form="settings"/);
  assert.match(settings, /class="configuration-selector player-identity-selector options-player-name"/);
  assert.match(settings, /class="arcade-switch"><input type="checkbox" name="reducedMotion"/);
  assert.match(settings, /class="game-primary-action" type="submit">Save options/);
  assert.match(appearance, /class="game-shell-screen options-screen appearance-options-screen"/);
  assert.match(appearance, /class="options-console appearance-console" data-form="appearance-settings"/);
  assert.match(css, /\.option-command \{/);
  assert.match(css, /\.arcade-switch input/);
  assert.match(css, /\.appearance-options-screen \.skin-setting/);
});

test("local and multiplayer setup use shared game-shell configuration controls", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function renderGameObject/);
  assert.match(app, /class="game-shell-screen pregame-screen"/);
  assert.match(app, /class="configuration-selector player-identity-selector"/);
  assert.match(app, /class="stepper game-stepper"/);
  assert.match(app, /class="game-primary-action"[^>]*>Start/);
  assert.match(app, /class="game-shell-screen multiplayer-entry-screen"/);
  assert.match(app, /role="tablist" aria-label="Host or join a room"/);
  assert.match(app, /class="room-code-input"/);
  assert.match(css, /\.room-code,[\s\S]*?\.room-code-input[\s\S]*?font-family: var\(--font-ui\) !important/);
});

test("multiplayer rooms render occupied, CPU, and empty player seats around a table", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function lobbySeatSlots/);
  assert.match(app, /function renderLobbySeat/);
  assert.match(app, /class="lobby-seat empty"/);
  assert.match(app, /class="lobby-seat-ring"/);
  assert.match(app, /class="lobby-table-core"/);
  assert.match(app, /class="game-ready-action/);
  assert.match(css, /\.lobby-seat\[data-lobby-slot="5"\]/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.lobby-seat \{ grid-area: auto !important/);
});

test("shell transitions and HUD refinements respect reduced motion", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /navigationDirection/);
  assert.match(app, /shell-transition-back/);
  assert.match(app, /document\.body\.classList\.toggle\("reduced-motion", libraryReducedMotion\(\)\)/);
  assert.match(css, /body\.reduced-motion #app\.shell-transition-forward/);
  assert.match(css, /\.standard-card-game \.game-score[\s\S]*?border-left/);
  assert.match(css, /\.standard-card-game \.game-seat[\s\S]*?border-bottom/);
  assert.match(css, /\.standard-card-game \.physical-hand[\s\S]*?border-top/);
});
