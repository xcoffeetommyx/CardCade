import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import holdem from "../shared/holdem-rules.js";

const cardsById = new Map(standard52.makeDeck().map((card) => [card.id, card]));
const cards = (...ids) => ids.map((id) => cardsById.get(id));

test("Texas Hold'em evaluates every five-card hand class using the shared 52-card deck", () => {
  const cases = [
    ["high-card", ["AS", "KD", "9C", "6H", "3S"]],
    ["pair", ["AS", "AH", "KD", "9C", "6H"]],
    ["two-pair", ["AS", "AH", "KD", "KC", "6H"]],
    ["three-kind", ["AS", "AH", "AD", "KC", "6H"]],
    ["straight", ["9S", "8H", "7D", "6C", "5S"]],
    ["flush", ["AS", "JS", "9S", "6S", "3S"]],
    ["full-house", ["AS", "AH", "AD", "KC", "KH"]],
    ["four-kind", ["AS", "AH", "AD", "AC", "KH"]],
    ["straight-flush", ["9S", "8S", "7S", "6S", "5S"]]
  ];

  for (const [category, hand] of cases) {
    assert.equal(holdem.evaluateFive(cards(...hand)).category, category);
  }
  assert.equal(standard52.makeDeck().every((card) => Object.keys(card).sort().join(",") === "id,rank,suit"), true);
});

test("Texas Hold'em recognizes wheel straights and resolves rank kickers", () => {
  const wheel = holdem.evaluateFive(cards("AS", "5H", "4D", "3C", "2S"));
  assert.deepEqual(wheel.tiebreakers, [5]);

  const acePair = holdem.evaluateFive(cards("AS", "AH", "KD", "9C", "6H"));
  const kingPair = holdem.evaluateFive(cards("KS", "KH", "AD", "9C", "6H"));
  assert.equal(holdem.compareHands(acePair, kingPair), 1);
  assert.equal(holdem.compareHands(cards("AS", "KH", "9D", "6C", "3S"), cards("AD", "KC", "9H", "6S", "2D")), 1);
});

test("Texas Hold'em chooses the best five cards from seven", () => {
  const best = holdem.bestHand(cards("AS", "AH", "AD", "KC", "KH", "2D", "3C"));
  assert.equal(best.category, "full-house");
  assert.deepEqual(best.tiebreakers, [14, 13]);
  assert.equal(best.cardIds.length, 5);

  const straightFlush = holdem.bestHand(cards("AS", "KS", "QS", "JS", "10S", "2D", "3C"));
  assert.equal(straightFlush.category, "straight-flush");
  assert.deepEqual(straightFlush.tiebreakers, [14]);
});

test("fixed-limit rules use 100 starting points, 1/2 blinds, two-point early bets, four-point late bets, and a four-bet cap", () => {
  assert.equal(holdem.STARTING_TABLE_POINTS, 100);
  assert.equal(holdem.SMALL_BLIND, 1);
  assert.equal(holdem.BIG_BLIND, 2);
  assert.equal(holdem.streetBetSize("preflop"), 2);
  assert.equal(holdem.streetBetSize("flop"), 2);
  assert.equal(holdem.streetBetSize("turn"), 4);
  assert.equal(holdem.streetBetSize("river"), 4);
  assert.equal(holdem.MAX_BETS_PER_STREET, 4);

  const response = holdem.availableActions({ street: "flop", currentBet: 2, contribution: 0, stack: 20, betCount: 1 });
  assert.equal(response.toCall, 2);
  assert.equal(response.call, true);
  assert.equal(response.raise, true);
  assert.equal(response.raiseAmount, 4);
  assert.equal(holdem.availableActions({ currentBet: 8, contribution: 2, stack: 20, betCount: 4 }).raise, false);
});

test("blind order follows standard heads-up and multi-player fixed-limit conventions", () => {
  assert.deepEqual(holdem.blindPositions([0, 1], 0), {
    dealerSeat: 0,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    firstPreflopSeat: 0,
    firstPostflopSeat: 1
  });
  assert.deepEqual(holdem.blindPositions([0, 1, 2, 3], 1), {
    dealerSeat: 1,
    smallBlindSeat: 2,
    bigBlindSeat: 3,
    firstPreflopSeat: 0,
    firstPostflopSeat: 2
  });
});

test("side-pot layers retain every committed table point and exclude folded players from winning", () => {
  const pots = holdem.buildSidePots([
    { seat: 0, amount: 10 },
    { seat: 1, amount: 20 },
    { seat: 2, amount: 20, folded: true }
  ]);

  assert.deepEqual(pots, [
    { amount: 30, cap: 10, contributorSeats: [0, 1, 2], eligibleSeats: [0, 1] },
    { amount: 20, cap: 20, contributorSeats: [1, 2], eligibleSeats: [1] }
  ]);
  assert.equal(pots.reduce((total, pot) => total + pot.amount, 0), 50);
});
