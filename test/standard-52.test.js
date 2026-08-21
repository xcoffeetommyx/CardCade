import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";

test("shared standard deck is complete, unique, and rules-neutral", () => {
  const deck = standard52.makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
  assert.equal(deck.every((card) => Object.keys(card).sort().join(",") === "id,rank,suit"), true);
  assert.equal(deck.some((card) => "rankValue" in card), false);
  assert.equal(standard52.cardLabel("QH"), "Q♥");
  assert.equal(standard52.cardLong({ rank: "A", suit: "S" }), "A of Spades");
});
