import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/juan-deck.js";
import rules from "../shared/juan-rules.js";

const cards = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => cards.get(id);

test("JUAN matches the active color, the printed face, or a Prism", () => {
  const top = card("blaze-3-a");
  assert.equal(rules.canPlay(card("blaze-7-a"), top, "blaze"), true);
  assert.equal(rules.canPlay(card("tide-3-a"), top, "blaze"), true);
  assert.equal(rules.canPlay(card("tide-7-a"), top, "blaze"), false);
  assert.equal(rules.canPlay(card("prism-1"), top, "blaze"), true);
  assert.equal(rules.canPlay(card("prism-burst-1"), top, "blaze"), true);
  assert.equal(rules.canPlay(card("grove-7-a"), top, "grove"), true, "a Prism-selected color controls the next match");
});

test("JUAN action faces match across color lanes", () => {
  assert.equal(rules.canPlay(card("tide-pause"), card("blaze-pause"), "blaze"), true);
  assert.equal(rules.canPlay(card("tide-turnabout"), card("blaze-pause"), "blaze"), false);
  assert.equal(rules.canPlay(card("spark-double-draw"), card("tide-double-draw"), "tide"), true);
});

test("JUAN sorting and CPU color choice remain deck-specific", () => {
  const hand = [card("prism-1"), card("tide-7-a"), card("blaze-pause"), card("tide-1-a")];
  assert.deepEqual(rules.sortCards(hand, "color").map((entry) => entry.id), ["blaze-pause", "tide-1-a", "tide-7-a", "prism-1"]);
  assert.equal(rules.chooseColor(hand), "tide");
  assert.equal(rules.cardPoints(card("spark-double-draw")), 18);
  assert.equal(rules.cardPoints(card("prism-1")), 25);
  assert.equal(rules.cardPoints(card("prism-burst-1")), 35);
});
