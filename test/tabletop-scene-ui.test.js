import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("every shared card game renders through the pseudo-3D table scene without replacing DOM cards", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /function renderTableScene/);
  assert.match(app, /class="card-table-scene \$\{className\}"/);
  assert.match(app, /function renderTableOpponent/);
  assert.match(app, /function renderOpponentFan/);
  assert.match(app, /function layoutOpponentHands/);
  assert.match(app, /cardPresentation\.calculateFanLayout\(\{/);
  assert.doesNotMatch(app, /THREE\.|new THREE|WebGLRenderer|canvas\.getContext/);

  for (const sceneClass of [
    "blackjack-table-scene",
    "holdem-table-scene",
    "five-card-draw-table-scene",
    "juan-table-scene",
    "rummy-table-scene",
    "snap-table-scene"
  ]) {
    assert.match(app, new RegExp(sceneClass));
  }
  assert.match(css, /\.casino-table-scene \.center-play-area/);
  assert.match(css, /\.juan-table-scene \.center-play-area/);
  assert.match(css, /\.rummy-table-scene \.center-play-area/);
  assert.match(css, /\.snap-table-scene \.center-play-area/);
});

test("opponent fans contain the actual number of privacy-safe card backs", () => {
  const app = read("public/app.js");

  assert.match(app, /Array\.from\(\{ length: safeCount \}/);
  assert.match(app, /context: "opponent-hand"/);
  assert.match(app, /className: "opponent-card"/);
  assert.match(app, /ariaHidden: true/);
  assert.match(app, /cardCount: player\.cardCount/);
  assert.match(app, /cardCount: player\.holeCardCount/);
  assert.match(app, /cardCount: player\.drawCount/);
  assert.doesNotMatch(app, /Math\.min\(player\.cardCount, 7\)/);
});

test("screen-facing HUDs, seat-origin motion, responsive depth, and reduced motion are explicit", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /data-play-origin="\$\{escapeHtml\(playOrigin\)\}"/);
  assert.match(css, /\.card-table-surface \{[\s\S]*?rotateX\(55deg\)/);
  assert.match(css, /\.card-table-scene \[data-opponent-hand\]|\.opponent-hand/);
  assert.match(css, /\.card-table-scene\[data-play-origin="south"\]/);
  assert.match(css, /@keyframes tableCardPileIn/);
  assert.match(css, /@media \(max-width: 520px\) and \(orientation: portrait\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.card-table-scene \.playing-card\.played\.enter/);
});

test("Finders Makers keeps its board top-down inside the shared table shell", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /card-table-scene finders-table-scene/);
  assert.match(app, /data-table-seat="\$\{player\.seat === viewerSeat \? "south" : "north"\}"/);
  assert.match(css, /\.finders-table-scene \.finders-board-zone \{[\s\S]*?position: absolute/);
  assert.match(css, /\.finders-table-scene \.finders-player\[data-table-seat="north"\]/);
  assert.match(css, /\.finders-table-scene \.finders-player\[data-table-seat="south"\]/);
});
