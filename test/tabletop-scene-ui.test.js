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

test("the shedding-game turn banner occupies the sky above lowered opponents", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  assert.match(app, /tableStatusMarkup = ""/);
  assert.match(app, /class="tabletop-status-area"/);
  assert.match(app, /tableStatusMarkup: `<div class="game-status">/);
  assert.match(css, /\.tabletop-status-area \{[\s\S]*?position: absolute;[\s\S]*?top: 2%;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.table-seat-north \{ top: 13%; \}[\s\S]*?\.table-seat-west \{ left: 14%; top: 48%; \}/);
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

  // Yaw turns a hand to face across the table, so mirrored seats must carry
  // exact opposite signs. Matching signs is the bug that made side seats wrong.
  assert.match(css, /\.card-table-scene \.table-seat \{[\s\S]*?--seat-hand-yaw: 0deg[\s\S]*?--seat-hand-pitch: -8deg[\s\S]*?--seat-hand-roll: 0deg/);
  assert.match(css, /\.opponent-hand \{[\s\S]*?rotateY\(var\(--seat-hand-yaw\)\)[\s\S]*?rotateX\(var\(--seat-hand-pitch\)\)[\s\S]*?rotateZ\(var\(--seat-hand-roll\)\)/);
  const yawOf = (slot) => {
    const match = ruleBody(`.card-table-scene .table-seat-${slot} {`).match(/--seat-hand-yaw: (-?[\d.]+)deg/);
    assert.ok(match, `${slot} declares a yaw`);
    return Number(match[1]);
  };
  assert.ok(yawOf("north-west") > 0, "north-west yaws toward the table");
  assert.equal(yawOf("north-east"), -yawOf("north-west"), "north-east mirrors north-west");
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

test("seats the viewer sits beside show a name instead of a hand", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");

  // A hand at a seat beside the viewer points its backs at the player opposite
  // it, so from here it is edge-on and there is nothing readable to draw. It
  // only ever fought the table for space. Those seats collapse to a name chip.
  assert.match(app, /SIDELINE_SEAT_SLOTS = new Set\(\["west", "east", "west-near", "east-near"\]\)/);
  assert.match(app, /const showsHand = showHand && !SIDELINE_SEAT_SLOTS\.has\(slot\)/);
  assert.match(app, /\$\{showsHand \? `<div class="opponent-hand-wrap">/);

  const sideBlock = css.slice(css.indexOf(".card-table-scene :is(.table-seat-west, .table-seat-east, .table-seat-west-near, .table-seat-east-near) {"));
  assert.match(sideBlock.slice(0, sideBlock.indexOf("}")), /grid-template-rows: auto;/, "the hand row is gone");

  // The name belongs off the playing surface, which means the felt has to leave
  // a gutter for it rather than running edge to edge.
  const felt = css.slice(css.indexOf(".card-table-surface {"));
  const inset = felt.slice(0, felt.indexOf("}")).match(/inset: [\d.]+% ([\d.]+)%/);
  assert.ok(inset, "the felt declares an inline inset");
  assert.ok(Number(inset[1]) >= 8, `the felt leaves a gutter for the names (was ${inset[1]}%)`);

  // Seats across the table still hold cards; only the ones beside you do not.
  assert.match(css, /\.card-table-scene \.table-seat-north \{/);
  assert.match(app, /cardPresentation\.calculateSideFanLayout\(\{/);
});

test("the angled fan keeps its middle flat and cannot slice through itself", async () => {
  const { createRequire } = await import("node:module");
  const cardPresentation = createRequire(import.meta.url)("../shared/card-presentation.js");
  const cardWidth = 47;

  for (const count of [2, 3, 4, 5, 7, 10, 13, 20, 52]) {
    for (const leadsWithFirstCard of [true, false]) {
      const layout = cardPresentation.calculateSideFanLayout({
        count, cardWidth, cardHeight: 82, leadsWithFirstCard
      });
      const turned = layout.cards.map((card) => Math.abs(card.bow));

      // The middle of the fan stays square to its owner. If easing ever flattens
      // out, every card picks up the same lean and the hand turns to face the
      // viewer -- which is the bug this whole seat model exists to avoid.
      if (count >= 5) {
        // The middle of the fan stays square to its owner and the ends carry the
        // curl. If the easing ever flattens out, every card picks up the same
        // lean and the hand reads as one bent sheet instead of separate cards.
        const middle = turned[Math.floor((count - 1) / 2)];
        assert.ok(middle < Math.max(...turned) / 3, `count ${count}: middle stays flat (was ${middle.toFixed(1)}deg)`);
      }

      // Neighbouring cards differ in bow, so their planes pinch toward the card
      // edges. Anything closer than that pinch lets one card slice through the
      // next.
      const byStack = [...layout.cards].sort((a, b) => a.zIndex - b.zIndex);
      for (let i = 1; i < byStack.length; i += 1) {
        const turn = Math.abs(byStack[i].bow - byStack[i - 1].bow) * Math.PI / 180;
        const pinch = (cardWidth / 2) * Math.sin(Math.min(turn, Math.PI / 2));
        assert.ok(
          Math.abs(byStack[i].z - byStack[i - 1].z) > pinch,
          `count ${count}: cards ${i - 1}/${i} must not intersect`
        );
      }

      // zIndex has to be a clean permutation or the stacking fights the depth.
      assert.deepEqual(
        [...layout.cards.map((card) => card.zIndex)].sort((a, b) => a - b),
        Array.from({ length: count }, (_, i) => i + 1)
      );
    }
  }

  // West and east already mirror through their seat yaw. Mirroring the bow on
  // top of that double-negates it, and the pair ends up showing opposite faces
  // at the same end -- one hand leading with its back, the other with its leaf.
  // Read each hand from the card nearest the camera outward; they must agree.
  const nearestFirst = (leadsWithFirstCard, yaw) => {
    const layout = cardPresentation.calculateSideFanLayout({
      count: 13, cardWidth, cardHeight: 82, leadsWithFirstCard
    });
    return layout.cards
      .map((card) => ({ zIndex: card.zIndex, turned: Math.abs(yaw + card.bow) }))
      .sort((a, b) => b.zIndex - a.zIndex)
      .map((card) => Math.round(card.turned));
  };
  assert.deepEqual(
    nearestFirst(true, 90),
    nearestFirst(false, -90),
    "west and east must mirror when read from the nearest card outward"
  );

  // The rock is small on purpose. Opening it wider does not reveal more of a
  // hand, it just scatters the slivers to conflicting angles until the fan stops
  // reading as one object.
  const hand = cardPresentation.calculateSideFanLayout({
    count: 13, cardWidth, cardHeight: 82, leadsWithFirstCard: true
  });
  const turned = hand.cards.map((card) => Math.abs(card.bow));
  assert.ok(Math.max(...turned) < 20, "the curl stays gentle");
  assert.ok(turned.some((angle) => angle > 5), "the ends still curl");
});

test("every table scene has a width to lay itself out in", () => {
  const css = read("public/app.css");

  // A table scene positions all of its children absolutely, so it has no
  // in-flow content to size against. Any scene that also takes auto inline
  // margins shrink-to-fits to zero width and renders nothing at all.
  const sceneBlock = (selector) => {
    const at = css.indexOf(selector);
    assert.notEqual(at, -1, `${selector} exists`);
    return css.slice(at, css.indexOf("}", at));
  };
  for (const selector of [".snap-table-scene {", ".finders-table-scene {", ".card-table-scene {"]) {
    const block = sceneBlock(selector);
    if (/margin-inline:\s*auto/.test(block)) {
      assert.match(block, /width:/, `${selector} centres on an explicit width`);
    }
  }
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
