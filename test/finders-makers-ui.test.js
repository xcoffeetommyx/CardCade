import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Finders Makers content loads before the app and is part of the offline shell", () => {
  const html = read("public/index.html");
  const worker = read("public/sw.js");
  const contentIndex = html.indexOf('src="shared/finders-makers-content.js');
  const appIndex = html.indexOf('src="app.js');
  assert.ok(contentIndex > 0);
  assert.ok(appIndex > contentIndex);
  assert.match(worker, /shared\/finders-makers-content\.js/);
});

test("Finders Makers searches directly from cards, flips private results in place, and keeps Build controls explicit", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const html = read("public/index.html");
  assert.match(app, /function renderFindersMakersGame/);
  assert.match(app, /function renderFindersSearchConfirmation/);
  assert.match(app, /function queueFindersSearchFlip/);
  assert.match(app, /function queueFindersBuildReveal/);
  assert.match(app, /privateSearch/);
  assert.match(app, /finders-confirm-search/);
  assert.match(app, /finders-cancel-search/);
  assert.match(app, /finders_begin_build/);
  assert.match(app, /finders_attempt_build/);
  assert.match(app, /finders_start_sudden_death/);
  assert.match(app, /Lock in Build/);
  assert.doesNotMatch(app, /finders-start-search/);
  assert.doesNotMatch(app, /findersSearchMode/);
  assert.match(html, /finders-makers-presentation-root/);
  assert.match(css, /\.finders-piece-board/);
  assert.match(css, /\.finders-piece-card-inner/);
  assert.match(css, /backface-visibility/);
  assert.match(css, /findersPieceSearchFlip/);
  assert.match(css, /\.finders-search-confirmation/);
  assert.match(css, /\.finders-build-reveal/);
  assert.match(css, /\.finders-actions\.idle/);
  assert.match(css, /\.playing-game \.finders-makers-game \{[\s\S]*?height: calc\(var\(--game-viewport-height\)/);
  assert.match(css, /touch-action: manipulation/);
});
