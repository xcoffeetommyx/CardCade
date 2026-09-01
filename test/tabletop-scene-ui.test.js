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

test("opponent seats share one camera instead of a flattened fake perspective", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(css, /\.card-table-scene \.table-seat \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);

  // The scene's perspective only reaches a seat if every element between them
  // keeps the 3D context open. .table-seats-layer used to default to flat,
  // which silently collapsed every opponent hand into a 2D squash.
  assert.match(css, /\.card-table-scene \.table-seats-layer \{[\s\S]*?transform-style: preserve-3d/);
  const ruleBody = (selector) => {
    const at = css.indexOf(selector);
    assert.notEqual(at, -1, `${selector} exists`);
    return css.slice(at, css.indexOf("}", at));
  };
  for (const selector of [
    ".card-table-scene .table-seat {",
    ".opponent-hand-wrap {",
    ".opponent-hand {"
  ]) {
    assert.match(ruleBody(selector), /transform-style: preserve-3d/, selector);
  }

  // A filter forces transform-style to flat, so the hand plane must not carry
  // one. Its shadow rides on the cards instead.
  assert.doesNotMatch(ruleBody(".opponent-hand {"), /filter:/);
  assert.match(css, /\.opponent-card \{[\s\S]*?box-shadow:[\s\S]*?var\(--seat-hand-shadow-x/);

  // Yaw turns a hand to face across the table, so west and east must be exact
  // mirrors. Matching signs is the bug that made both side seats look wrong.
  assert.match(css, /\.card-table-scene \.table-seat \{[\s\S]*?--seat-hand-yaw: 0deg[\s\S]*?--seat-hand-pitch: -8deg[\s\S]*?--seat-hand-roll: 0deg/);
  assert.match(css, /\.opponent-hand \{[\s\S]*?rotateY\(var\(--seat-hand-yaw\)\)[\s\S]*?rotateX\(var\(--seat-hand-pitch\)\)[\s\S]*?rotateZ\(var\(--seat-hand-roll\)\)/);
  for (const [west, east] of [["west", "east"], ["west-near", "east-near"], ["north-west", "north-east"]]) {
    const yawOf = (slot) => {
      const match = ruleBody(`.card-table-scene .table-seat-${slot} {`).match(/--seat-hand-yaw: (-?[\d.]+)deg/);
      assert.ok(match, `${slot} declares a yaw`);
      return Number(match[1]);
    };
    assert.ok(yawOf(west) > 0, `${west} yaws toward the table`);
    assert.equal(yawOf(east), -yawOf(west), `${east} mirrors ${west}`);
  }
  assert.match(css, /\.table-seat-north \{[\s\S]*?width: clamp\(280px, 36%, 460px\)/);

  // The hand-tuned per-card fake perspective is gone; the camera does that work
  // and the cards only carry real stack thickness.
  assert.doesNotMatch(css, /--opponent-perspective/);
  assert.doesNotMatch(app, /--opponent-perspective/);
  assert.doesNotMatch(css, /--seat-hand-scale-x|--seat-hand-rotate-y/);
  assert.match(css, /\.opponent-card \{[\s\S]*?--opponent-z: 0px/);
  assert.match(app, /--opponent-z.*CARD_STACK_THICKNESS/);
  assert.match(app, /const stackOrder = leadsWithFirstCard \? cards\.length - index : index \+ 1/);

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
