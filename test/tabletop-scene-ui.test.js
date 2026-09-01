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
  assert.match(css, /\.card-table-surface \{[\s\S]*?rotateX\(40deg\)/);
  assert.match(css, /\.card-table-scene \[data-opponent-hand\]|\.opponent-hand/);
  assert.match(css, /\.card-table-scene\[data-play-origin="south"\]/);
  assert.match(css, /@keyframes tableCardPileIn/);
  assert.match(css, /@media \(max-width: 520px\) and \(orientation: portrait\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.card-table-scene \.playing-card\.played\.enter/);
});

test("opponent seats preserve one fan and use readable fake perspective toward the table", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(css, /\.card-table-scene \.table-seat \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.card-table-scene \.table-seat \{[\s\S]*?--seat-hand-depth: 26px[\s\S]*?--seat-hand-rotate-z: 0deg[\s\S]*?--seat-hand-rotate-x: -6deg/);
  assert.match(css, /\.opponent-hand \{[\s\S]*?rotateZ\(var\(--seat-hand-rotate-z\)\)[\s\S]*?rotateY\(var\(--seat-hand-rotate-y\)\)/);
  assert.match(css, /\.table-seat-north \{[\s\S]*?width: clamp\(280px, 36%, 460px\)/);
  assert.match(css, /\.table-seat-north \{[\s\S]*?--seat-hand-depth: 38px[\s\S]*?--seat-hand-rotate-x: -8deg/);
  assert.match(css, /\.table-seat-west \{[\s\S]*?--seat-hand-rotate-z: 8deg[\s\S]*?--seat-hand-rotate-y: -24deg[\s\S]*?--seat-hand-scale-x: \.72/);
  assert.match(css, /\.table-seat-east \{[\s\S]*?--seat-hand-rotate-z: -8deg[\s\S]*?--seat-hand-rotate-y: 24deg[\s\S]*?--seat-hand-scale-x: \.72/);
  assert.match(css, /:is\(\.table-seat-west, \.table-seat-east\) \.opponent-card \{[\s\S]*?--opponent-perspective-z: 0px[\s\S]*?scale\(var\(--opponent-perspective-scale\)\)/);
  assert.match(app, /const nearBias = seatSlot === "west"[\s\S]*?--opponent-perspective-z[\s\S]*?nearBias \* 18/);
  assert.match(app, /if \(sideSeat\)[\s\S]*?seatSlot === "west" \? cards\.length - index : index \+ 1/);
  assert.doesNotMatch(css, /--seat-hand-angle:\s*-?92deg/);
  assert.doesNotMatch(css, /--seat-hand-rotate-z:\s*-?(?:3[2-9]|[4-9]\d)deg/);
  assert.match(css, /filter: drop-shadow\(var\(--seat-hand-shadow-x\) var\(--seat-hand-shadow-y\) 7px/);
  assert.match(css, /data-play-origin="west"[\s\S]*?--play-origin-x: -340px/);
  assert.match(css, /data-play-origin="east"[\s\S]*?--play-origin-x: 340px/);
  assert.equal((app.match(/cardPresentation\.calculateFanLayout\(\{/g) || []).length, 3);
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
