import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import draw from "../shared/five-card-draw-rules.js";

const cardsById = new Map(standard52.makeDeck().map((card) => [card.id, card]));
const cards = (...ids) => ids.map((id) => cardsById.get(id));

test("Five Card Draw shares the agreed fixed-limit table points without sharing Hold'em phases", () => {
  assert.equal(draw.STARTING_TABLE_POINTS, 100);
  assert.equal(draw.SMALL_BLIND, 1);
  assert.equal(draw.BIG_BLIND, 2);
  assert.equal(draw.streetBetSize(draw.OPENING_BETTING_PHASE), 2);
  assert.equal(draw.streetBetSize(draw.FINAL_BETTING_PHASE), 4);
  assert.equal(draw.MAX_BETS_PER_STREET, 4);
  assert.equal(draw.nextPhase(draw.OPENING_BETTING_PHASE), draw.DRAW_PHASE);
  assert.equal(draw.nextPhase(draw.DRAW_PHASE), draw.FINAL_BETTING_PHASE);
});

test("Five Card Draw evaluates exactly five shared standard cards and compares them as Poker hands", () => {
  const pair = draw.evaluateHand(cards("AS", "AH", "KD", "9C", "6H"));
  const twoPair = draw.evaluateHand(cards("KS", "KH", "QD", "QC", "2H"));

  assert.equal(pair.category, "pair");
  assert.equal(twoPair.category, "two-pair");
  assert.equal(draw.compareHands(twoPair, pair), 1);
  assert.equal(standard52.makeDeck().every((card) => Object.keys(card).sort().join(",") === "id,rank,suit"), true);
});

test("Five Card Draw constrains the draw and fixed-limit actions independently", () => {
  assert.equal(draw.isValidDrawCount(0), true);
  assert.equal(draw.isValidDrawCount(5), true);
  assert.equal(draw.isValidDrawCount(6), false);

  const opening = draw.availableActions({
    phase: draw.OPENING_BETTING_PHASE,
    currentBet: 2,
    contribution: 0,
    stack: 20,
    betCount: 1
  });
  assert.equal(opening.callAmount, 2);
  assert.equal(opening.raiseAmount, 4);
  assert.equal(opening.raise, true);

  const final = draw.availableActions({
    phase: draw.FINAL_BETTING_PHASE,
    currentBet: 4,
    contribution: 0,
    stack: 20,
    betCount: 4
  });
  assert.equal(final.betSize, 4);
  assert.equal(final.raise, false);
  assert.equal(draw.availableActions({ phase: draw.DRAW_PHASE, canAct: true }).check, false);
});
