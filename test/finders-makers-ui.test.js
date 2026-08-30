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

test("Finders Makers has a dedicated private-search renderer and guarded Build controls", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  assert.match(app, /function renderFindersMakersGame/);
  assert.match(app, /function queueFindersMakersReveal/);
  assert.match(app, /privateSearch/);
  assert.match(app, /finders_begin_build/);
  assert.match(app, /finders_attempt_build/);
  assert.match(app, /finders_start_sudden_death/);
  assert.match(app, /Commit \$\{selectedPositions\.size\}\/3/);
  assert.match(app, /finders-makers-reveal-root/);
  assert.match(css, /\.finders-piece-board/);
  assert.match(css, /\.finders-private-reveal/);
  assert.match(css, /\.playing-game \.finders-makers-game \{[\s\S]*?height: calc\(var\(--game-viewport-height\)/);
  assert.match(css, /touch-action: manipulation/);
});
