import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the controller cursor is loaded before Cardcade and cached for offline use", () => {
  const html = read("public/index.html");
  const worker = read("public/sw.js");
  const controllerIndex = html.indexOf('src="shared/controller-input.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(controllerIndex >= 0 && controllerIndex < appIndex);
  assert.match(html, /id="controller-cursor"/);
  assert.match(html, /<svg viewBox="0 0 30 30"/);
  assert.match(html, /class="controller-cursor-outline" d="M15 2V10M15 20V28M2 15H10M20 15H28"/);
  assert.match(html, /id="controller-keyboard-root"/);
  assert.match(worker, /"shared\/controller-input\.js\?v=3"/);
});

test("controller inputs use a virtual cursor, d-pad navigation, and safe A/B actions", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function moveControllerCursor/);
  assert.match(app, /function scrollControllerPage/);
  assert.match(app, /onScroll: \(\{ left, top \}\) => scrollControllerPage\(left, top\)/);
  assert.match(app, /window\.scrollBy\(\{ left, top, behavior: "auto" \}\)/);
  assert.match(app, /function moveControllerFocus/);
  assert.match(app, /controllerInput\.directionalTarget/);
  assert.match(app, /function activateControllerTarget/);
  assert.match(app, /function controllerBack/);
  assert.match(app, /window\.addEventListener\("gamepadconnected", startControllerPolling\)/);
  assert.match(app, /window\.addEventListener\("gamepaddisconnected", stopControllerPollingIfIdle\)/);
  assert.match(app, /if \(hasConnectedGamepad\(\)\) startControllerPolling\(\)/);
  assert.match(app, /prismCancel\.click\(\)/);
  assert.match(app, /screen-head \.back-button/);
  assert.match(css, /\.controller-hover:not\(\.playing-card\)/);
  assert.match(app, /controllerState\.cursorX - 15/);
  assert.match(css, /\.controller-cursor-outline \{ stroke: #02050b; stroke-width: 4\.5;/);
  assert.match(css, /\.controller-cursor-fill \{ stroke: #fff; stroke-width: 1\.8;/);
});

test("controller cursor and d-pad support selectable fanned cards across decks", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /\.playing-card\.selectable:not\(\[disabled\]\)/);
  assert.match(app, /function controllerCardNeighbor/);
  assert.match(app, /current\.closest\("\.game-hand"\)/);
  assert.match(app, /Number\(left\.dataset\.fanIndex\) - Number\(right\.dataset\.fanIndex\)/);
  assert.match(app, /target\.click\?\.\(\)/);
  assert.match(css, /\.playing-card\.selectable\.controller-hover:not\(\.selected\)/);
  assert.match(css, /\.playing-card\.selectable\.controller-focus/);
  assert.match(css, /\.game-hand\.legacy-flat-hand \.playing-card\.selectable\.controller-hover:not\(\.selected\)/);
});

test("controller mode provides a keyboard for text fields and select controls", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function openControllerTextEntry/);
  assert.match(app, /function renderControllerTextEntry/);
  assert.match(app, /function handleControllerKeyboardAction/);
  assert.match(app, /function closeControllerTextEntry/);
  assert.match(app, /function cycleControllerSelect/);
  assert.match(app, /data-action="controller-key-done"/);
  assert.match(app, /controllerKeyboardRoot\?\.querySelector\("\.controller-keyboard-dialog"\)/);
  assert.match(app, /if \(controllerTextState\.inputId\)/);
  assert.match(css, /\.controller-keyboard-dialog/);
  assert.match(css, /\.controller-keyboard-keys/);
  assert.match(css, /\.controller-keyboard-action\.done/);
});
