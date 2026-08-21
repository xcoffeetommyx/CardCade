import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/juan-deck.js";

test("JUAN uses the complete 108-card color/action distribution", () => {
  const cards = deck.makeDeck();
  assert.equal(cards.length, 108);
  assert.equal(new Set(cards.map((card) => card.id)).size, 108);
  assert.deepEqual(deck.COLORS, ["blaze", "tide", "grove", "spark"]);
  assert.equal(cards.filter((card) => card.kind === "number").length, 76);
  assert.equal(cards.filter((card) => card.kind === "pause").length, 8);
  assert.equal(cards.filter((card) => card.kind === "turnabout").length, 8);
  assert.equal(cards.filter((card) => card.kind === "double-draw").length, 8);
  assert.equal(cards.filter((card) => card.kind === "prism").length, 4);
  assert.equal(cards.filter((card) => card.kind === "prism-burst").length, 4);
  for (const color of deck.COLORS) {
    assert.equal(cards.filter((card) => card.color === color && card.kind === "number" && card.value === 0).length, 1);
    for (let value = 1; value <= 9; value += 1) {
      assert.equal(cards.filter((card) => card.color === color && card.kind === "number" && card.value === value).length, 2);
    }
  }
  assert.equal(deck.cardLong(cards.find((card) => card.id === "blaze-3-a")), "Blaze 3");
  assert.equal(deck.cardLong("prism-2"), "Prism");
  assert.equal(deck.cardLong("prism-burst-2"), "Prism Burst");
});
