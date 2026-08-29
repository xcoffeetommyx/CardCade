import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import rules from "../shared/thirteen-rules.js";

const {
  RANKS, SUITS, cardValue, shuffle, sortCards, detectCombo, canBeat,
  comboDescription, comboShort, getLegalMoves, SCORE_BY_PLACE, TOTAL_ROUNDS,
  finalStandings, finalWinners
} = rules;

const deck = standard52.makeDeck();
const byId = new Map(deck.map((card) => [card.id, card]));
const cards = (...ids) => ids.map((id) => {
  const card = byId.get(id);
  assert.ok(card, `Unknown fixture card ${id}`);
  return card;
});
const combo = (...ids) => detectCombo(cards(...ids));

test("Thirteen consumes Cardcade's one rules-neutral standard deck", () => {
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
  assert.deepEqual(RANKS, ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]);
  assert.deepEqual(SUITS, ["S", "C", "D", "H"]);
  assert.equal(deck.some((card) => "rankValue" in card), false);
  assert.ok(cardValue(byId.get("2H")) > cardValue(byId.get("AS")));
  assert.deepEqual(SCORE_BY_PLACE, [3, 1, 0, -2]);
  assert.equal(TOTAL_ROUNDS, 4);
});

test("Thirteen shuffles a copy without changing the shared deck", () => {
  const originalIds = deck.map((card) => card.id);
  const shuffled = shuffle(deck, () => 0);
  assert.notEqual(shuffled, deck);
  assert.deepEqual(deck.map((card) => card.id), originalIds);
  assert.deepEqual(shuffled.map((card) => card.id).sort(), originalIds.slice().sort());
  assert.notDeepEqual(shuffled.map((card) => card.id), originalIds);
});

test("Thirteen sorts by rank, suit, and repeated-rank groups", () => {
  const hand = cards("5H", "3D", "5S", "4C", "3S", "5C");
  assert.deepEqual(sortCards(hand, "rank").map((card) => card.id), ["3S", "3D", "4C", "5S", "5C", "5H"]);
  assert.deepEqual(sortCards(hand, "suit").map((card) => card.id), ["3S", "5S", "4C", "5C", "3D", "5H"]);
  assert.deepEqual(sortCards(hand, "combo").map((card) => card.id), ["5S", "5C", "5H", "3S", "3D", "4C"]);
});

test("Thirteen recognizes singles, pairs, triples, and four of a kind", () => {
  assert.equal(combo("3S").type, "single");
  assert.equal(combo("4S", "4H").type, "pair");
  assert.equal(combo("5S", "5C", "5D").type, "triple");
  const four = combo("6S", "6C", "6D", "6H");
  assert.equal(four.type, "four");
  assert.equal(four.bomb, true);
  assert.equal(comboDescription(four), "Four 6s");
  assert.equal(comboShort(four), "Bomb 6");
});

test("Thirteen recognizes straights but excludes 2 and duplicate ranks", () => {
  const straight = combo("3S", "4H", "5C");
  assert.equal(straight.type, "straight");
  assert.equal(straight.count, 3);
  assert.equal(straight.highRank, RANKS.indexOf("5"));
  assert.equal(straight.highSuit, 1);
  assert.equal(combo("QS", "KH", "AC").type, "straight");
  assert.equal(combo("KS", "AH", "2C"), null);
  assert.equal(combo("3S", "3H", "4C"), null);
  assert.equal(combo("3S", "5H", "6C"), null);
});

test("Thirteen recognizes consecutive-pair runs and excludes 2", () => {
  const threePairs = combo("3S", "3H", "4C", "4D", "5S", "5C");
  assert.equal(threePairs.type, "pairSeq");
  assert.equal(threePairs.pairCount, 3);
  assert.equal(threePairs.bomb, true);
  assert.equal(combo("AS", "AH", "2S", "2H", "KS", "KH"), null);
  assert.equal(combo("3S", "3H", "5C", "5D", "6S", "6C"), null);
});

test("Thirteen requires matching shapes and uses rank then suit to beat a pile", () => {
  assert.equal(canBeat(combo("4S"), combo("3H")), true);
  assert.equal(canBeat(combo("4C"), combo("4S")), true);
  assert.equal(canBeat(combo("4S"), combo("4C")), false);
  assert.equal(canBeat(combo("5S", "5C"), combo("4D", "4H")), true);
  assert.equal(canBeat(combo("3S", "4S", "5S"), combo("3H", "4H", "5H")), false);
  assert.equal(canBeat(combo("6S", "7S", "8S", "9S"), combo("3S", "4S", "5S")), false);
  assert.equal(canBeat(combo("3S"), null), true);
});

test("Thirteen preserves the source game's bomb rules for chopping 2s", () => {
  const four = combo("6S", "6C", "6D", "6H");
  const threePairs = combo("3S", "3C", "4S", "4C", "5S", "5C");
  const fourPairs = combo("3S", "3C", "4S", "4C", "5S", "5C", "6S", "6C");
  const fivePairs = combo("3S", "3C", "4S", "4C", "5S", "5C", "6S", "6C", "7S", "7C");
  assert.equal(canBeat(four, combo("2H")), true);
  assert.equal(canBeat(four, combo("2S", "2C")), true);
  assert.equal(canBeat(four, combo("2S", "2C", "2D")), false);
  assert.equal(canBeat(threePairs, combo("2H")), true);
  assert.equal(canBeat(threePairs, combo("2S", "2C")), false);
  assert.equal(canBeat(fourPairs, combo("2S", "2C")), true);
  assert.equal(canBeat(fivePairs, combo("2S", "2C", "2D")), true);
});

test("Thirteen filters legal moves against the pile and opening 3♠ requirement", () => {
  const hand = cards("3S", "3C", "4S", "4C", "5H", "2H");
  const openingMoves = getLegalMoves(hand, null, true);
  assert.ok(openingMoves.length > 0);
  assert.ok(openingMoves.every((move) => move.cards.some((card) => card.id === "3S")));
  const current = combo("4H");
  const responses = getLegalMoves(hand, current, false);
  assert.ok(responses.some((move) => move.type === "single" && move.cards[0].id === "5H"));
  assert.ok(responses.some((move) => move.type === "single" && move.cards[0].id === "2H"));
  assert.ok(responses.every((move) => canBeat(move, current)));
});

test("Thirteen final standings use points, then counts of top-three finishes", () => {
  const players = [
    { name: "A", score: 6, placementHistory: [1, 4, 4, 1] },
    { name: "B", score: 6, placementHistory: [2, 2, 2, 2] },
    { name: "C", score: 4, placementHistory: [1, 1, 4, 4] }
  ];
  assert.deepEqual(finalStandings(players).map((player) => player.name), ["A", "B", "C"]);

  const tied = [
    { name: "X", score: 4, placementHistory: [1, 2, 3, 4] },
    { name: "Y", score: 4, placementHistory: [4, 3, 2, 1] }
  ];
  assert.deepEqual(finalWinners(tied).map((player) => player.name), ["X", "Y"]);
});
