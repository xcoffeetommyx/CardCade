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

test("side seats sit edge-on and split into back-showing and leaf-showing cards", () => {
  const app = read("public/app.js");
  const css = read("public/app.css");
  const presentation = read("shared/card-presentation.js");

  // A grazing seat cannot reuse the head-on fan: translating along a line and
  // leaning slightly collapses into a slab once the seat yaws.
  assert.match(presentation, /function calculateSideFanLayout/);
  // Which fan a seat needs follows how far it is actually turned, not which slot
  // it sits in, so a scene that lays its hands flat on the felt -- Snap's
  // face-down draw piles -- keeps the ordinary fan.
  assert.match(app, /const GRAZING_SEAT_YAW = 45;/);
  assert.match(app, /if \(seatYaw >= GRAZING_SEAT_YAW\)/);
  assert.match(app, /cardPresentation\.calculateSideFanLayout\(\{/);
  // Snap has no hands at all: nobody picks their draw pile up, so its seats
  // render a HUD and nothing else, and there is no local hand section either.
  assert.match(app, /showHand: false/);
  assert.match(app, /\$\{showHand \? `<div class="opponent-hand-wrap">/);
  assert.doesNotMatch(app, /snap-local-pile/);
  assert.doesNotMatch(css, /snap-local-pile/);
  assert.match(css, /rotateY\(var\(--opponent-bow\)\)/);

  const seatYaw = (slot) => {
    const at = css.indexOf(`.card-table-scene .table-seat-${slot} {`);
    assert.notEqual(at, -1, `${slot} exists`);
    return Number(css.slice(at, css.indexOf("}", at)).match(/--seat-hand-yaw: (-?[\d.]+)deg/)[1]);
  };

  // Backs belong to the player sitting opposite. West's opposite is east, so its
  // fan turns a right angle and sits edge-on to the viewer; only north, whose
  // opposite IS the viewer, shows its backs square to the camera.
  for (const slot of ["west", "west-near"]) {
    assert.ok(seatYaw(slot) >= 85, `${slot} points its backs across the table, not at the viewer`);
  }
  for (const [west, east] of [["west", "east"], ["west-near", "east-near"], ["north-west", "north-east"]]) {
    assert.equal(seatYaw(east), -seatYaw(west), `${east} mirrors ${west}`);
  }
  const northBlock = css.slice(css.indexOf(".card-table-scene .table-seat-north {"));
  assert.doesNotMatch(northBlock.slice(0, northBlock.indexOf("}")), /--seat-hand-yaw/, "north keeps the default 0deg yaw");

  // Side hands show nothing but printed backs. At these angles a card is read by
  // its edge, so there is no second surface to render and nothing of an opponent
  // hand is ever shown to anyone but its owner.
  assert.doesNotMatch(app, /showing-leaf/);
  assert.doesNotMatch(css, /showing-leaf/);
});

test("the side fan keeps its middle edge-on and cannot slice through itself", async () => {
  const { createRequire } = await import("node:module");
  const cardPresentation = createRequire(import.meta.url)("../shared/card-presentation.js");
  const cardWidth = 47;

  for (const count of [2, 3, 4, 5, 7, 10, 13, 20, 52]) {
    for (const leadsWithFirstCard of [true, false]) {
      const layout = cardPresentation.calculateSideFanLayout({
        count, cardWidth, cardHeight: 82, leadsWithFirstCard
      });
      const yaw = leadsWithFirstCard ? 90 : -90;
      const turned = layout.cards.map((card) => Math.abs(yaw + card.bow));

      // The middle of the fan stays square to its owner. If easing ever flattens
      // out, every card picks up the same lean and the hand turns to face the
      // viewer -- which is the bug this whole seat model exists to avoid.
      if (count >= 5) {
        const middle = turned[Math.floor((count - 1) / 2)];
        assert.ok(Math.abs(middle - 90) < 12, `count ${count}: middle stays edge-on (was ${middle.toFixed(1)})`);
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
  const turned = hand.cards.map((card) => Math.abs(90 + card.bow));
  assert.ok(Math.max(...turned.map((a) => Math.abs(a - 90))) < 20, "the fan stays near edge-on");
  assert.ok(turned.some((angle) => Math.abs(angle - 90) > 5), "the ends still rock off edge-on");
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
