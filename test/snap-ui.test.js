import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Snap rules load before the application and remain available offline", () => {
  const html = read("public/index.html");
  const worker = read("public/sw.js");
  const rulesIndex = html.indexOf('src="shared/snap-rules.js');
  const appIndex = html.indexOf('src="app.js');
  assert.ok(rulesIndex > 0);
  assert.ok(appIndex > rulesIndex);
  assert.match(worker, /shared\/snap-rules\.js/);
});

test("Snap uses the shared physical cards with explicit READY, countdown, and SNAP controls", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  assert.match(app, /function renderSnapGame/);
  assert.match(app, /renderPlayingCard\(match\.previousCard/);
  assert.match(app, /renderPlayingCard\(match\.twoBackCard/);
  assert.match(app, /renderPlayingCard\(match\.currentCard/);
  assert.match(app, /match\.matchType === "sandwich"/);
  assert.match(app, /SNAP on matching ranks or a sandwich: 7 → K → 7/);
  assert.match(app, /snapCountdownValue/);
  assert.match(app, /data-action="\$\{match\.phase === snapRules\.PHASES\.REACTION \? "snap-react" : "snap-ready"\}"/);
  assert.match(app, /type: "snap_ready"/);
  assert.match(app, /type: "snap_react", reactionId: match\.reactionId/);
  assert.match(app, /skipNextReveal/);
  assert.doesNotMatch(app, /FIRST CARD/);
  assert.match(css, /\.snap-phase-banner\.counting/);
  assert.match(css, /\.snap-primary-action\.react:not\(:disabled\)/);
  assert.match(css, /touch-action: manipulation/);
});

test("Snap is intentionally absent from Hot Seat while available to Solo and multiplayer", () => {
  const catalog = read("server/src/game-catalog.js");
  const snapEntry = catalog.slice(catalog.indexOf('id: "snap"'), catalog.indexOf('id: "juan"'));
  assert.match(snapEntry, /modes: \["solo", "multiplayer"\]/);
  assert.doesNotMatch(snapEntry, /hot-seat/);
  assert.match(snapEntry, /supportsBots: true/);
});
