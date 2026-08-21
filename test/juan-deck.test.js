import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/juan-deck.js";

test("JUAN uses an original complete 80-card color/action deck", () => {
  const cards = deck.makeDeck();
  assert.equal(cards.length, 80);
  assert.equal(new Set(cards.map((card) => card.id)).size, 80);
  assert.deepEqual(deck.COLORS, ["blaze", "tide", "grove", "spark"]);
  assert.equal(cards.filter((card) => card.kind === "number").length, 64);
  assert.equal(cards.filter((card) => card.kind === "pause").length, 4);
  assert.equal(cards.filter((card) => card.kind === "turnabout").length, 4);
  assert.equal(cards.filter((card) => card.kind === "double-draw").length, 4);
  assert.equal(cards.filter((card) => card.kind === "prism").length, 4);
  assert.equal(cards.some((card) => card.value > 7), false);
  assert.equal(deck.cardLong(cards.find((card) => card.id === "blaze-3-a")), "Blaze 3");
  assert.equal(deck.cardLong("prism-2"), "Prism");
});
