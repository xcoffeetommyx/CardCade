import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import blackjack from "../shared/blackjack-rules.js";

const cardsById = new Map(standard52.makeDeck().map((card) => [card.id, card]));
const cards = (...ids) => ids.map((id) => cardsById.get(id));

test("Blackjack values the shared 52-card deck without changing its card objects", () => {
  const deck = standard52.makeDeck();

  assert.equal(blackjack.rankPoints(cardsById.get("AS")), 11);
  assert.equal(blackjack.rankPoints(cardsById.get("10H")), 10);
  assert.equal(blackjack.rankPoints(cardsById.get("QD")), 10);
  assert.equal(blackjack.rankPoints(cardsById.get("7C")), 7);
  assert.equal(deck.every((card) => Object.keys(card).sort().join(",") === "id,rank,suit"), true);
});

test("Blackjack calculates hard, soft, natural, and bust hand values", () => {
  assert.deepEqual(blackjack.handValue(cards("AS", "6H")), {
    total: 17, hardTotal: 7, soft: true, bust: false, blackjack: false, aceCount: 1
  });
  assert.deepEqual(blackjack.handValue(cards("AS", "AC", "9H")), {
    total: 21, hardTotal: 11, soft: true, bust: false, blackjack: false, aceCount: 2
  });
  assert.deepEqual(blackjack.handValue(cards("AS", "AC", "9H", "9D")), {
    total: 20, hardTotal: 20, soft: false, bust: false, blackjack: false, aceCount: 2
  });
  assert.equal(blackjack.handValue(cards("AS", "KH")).blackjack, true);
  assert.equal(blackjack.handLabel(cards("AS", "KH")), "Blackjack");
  assert.equal(blackjack.handValue(cards("KD", "QH", "7S")).bust, true);
});

test("the dealer stands on soft 17 and hits every lower non-bust total", () => {
  assert.equal(blackjack.dealerShouldHit(cards("AS", "6H")), false);
  assert.equal(blackjack.dealerShouldHit(cards("10S", "6H")), true);
  assert.equal(blackjack.dealerShouldHit(cards("10S", "7H")), false);
  assert.equal(blackjack.DEALER_STANDS_ON_SOFT_17, true);
});

test("split, double, and surrender are limited to valid opening decisions", () => {
  assert.equal(blackjack.canSplitHand({ cards: cards("8S", "8H") }), true);
  assert.equal(blackjack.canSplitHand({ cards: cards("JS", "QH") }), true);
  assert.equal(blackjack.canSplitHand({ cards: cards("8S", "9H") }), false);
  assert.equal(blackjack.canSplitHand({ cards: cards("8S", "8H"), handCount: 4 }), false);
  assert.equal(blackjack.canDoubleDown({ cards: cards("5S", "6H") }), true);
  assert.equal(blackjack.canDoubleDown({ cards: cards("5S", "6H"), actionsTaken: 1 }), false);
  assert.equal(blackjack.canSurrender({ cards: cards("10S", "6H") }), true);
  assert.equal(blackjack.canSurrender({ cards: cards("10S", "6H"), isSplitHand: true }), false);
  assert.equal(blackjack.canSurrender({ cards: cards("AS", "KH") }), false);
});

test("insurance is offered only during the initial dealer-Ace decision", () => {
  assert.equal(blackjack.insuranceOffered({ dealerUpcard: cardsById.get("AH") }), true);
  assert.equal(blackjack.insuranceOffered({ dealerUpcard: cardsById.get("KH") }), false);
  assert.equal(blackjack.insuranceOffered({ dealerUpcard: cardsById.get("AH"), insuranceTaken: true }), false);
  assert.equal(blackjack.insuranceOffered({ dealerUpcard: cardsById.get("AH"), phase: "player-turn" }), false);
});

test("settlement uses table points for blackjack, pushes, surrender, doubles, and insurance", () => {
  const natural = blackjack.settleHand({ playerCards: cards("AS", "KH"), dealerCards: cards("10S", "9H") });
  assert.equal(natural.outcome, "blackjack");
  assert.equal(natural.points, 1.5);

  const pushedNaturals = blackjack.settleHand({ playerCards: cards("AS", "KH"), dealerCards: cards("AD", "QC") });
  assert.equal(pushedNaturals.outcome, "push");
  assert.equal(pushedNaturals.points, 0);

  const surrender = blackjack.settleHand({ playerCards: cards("10S", "6H"), dealerCards: cards("9S", "7H"), surrendered: true });
  assert.equal(surrender.outcome, "surrender");
  assert.equal(surrender.points, -0.5);

  const doubledWin = blackjack.settleHand({ playerCards: cards("5S", "6H", "10D"), dealerCards: cards("9S", "7H"), stake: 2, blackjackEligible: false });
  assert.equal(doubledWin.outcome, "win");
  assert.equal(doubledWin.points, 2);

  const insuredDealerBlackjack = blackjack.settleHand({ playerCards: cards("10S", "9H"), dealerCards: cards("AS", "KH"), insuranceTaken: true });
  assert.equal(insuredDealerBlackjack.outcome, "dealer-blackjack");
  assert.equal(insuredDealerBlackjack.main.points, -1);
  assert.equal(insuredDealerBlackjack.insurance.points, 1);
  assert.equal(insuredDealerBlackjack.points, 0);

  const lostInsurance = blackjack.resolveInsurance({ insuranceTaken: true, dealerCards: cards("AS", "9H") });
  assert.deepEqual(lostInsurance, { outcome: "insurance-lose", points: -0.5, stake: 0.5 });
});

test("the baseline CPU strategy makes legal opening choices", () => {
  assert.equal(blackjack.chooseBotAction({ cards: cards("8S", "8H"), dealerUpcard: cardsById.get("10D") }), "split");
  assert.equal(blackjack.chooseBotAction({ cards: cards("5S", "6H"), dealerUpcard: cardsById.get("6D") }), "double");
  assert.equal(blackjack.chooseBotAction({ cards: cards("10S", "6H"), dealerUpcard: cardsById.get("10D") }), "surrender");
  assert.equal(blackjack.chooseBotAction({ cards: cards("10S", "7H"), dealerUpcard: cardsById.get("10D") }), "stand");
  assert.equal(blackjack.chooseBotAction({ cards: cards("5S", "4H"), dealerUpcard: cardsById.get("10D") }), "hit");
});
