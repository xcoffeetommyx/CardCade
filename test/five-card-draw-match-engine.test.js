import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/five-card-draw/match-engine.js";

const cardsById = new Map(standard52.makeDeck().map((card) => [card.id, card]));
const card = (id) => cardsById.get(id);
const cards = (...ids) => ids.map(card);
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name, style = "steady") => ({ seat, name, type: "bot", style });
const identityShuffle = (deck) => deck.slice();

function engine() {
  return new MatchEngine({ shuffleDeck: identityShuffle });
}

function matchFor(players = [human(0, "One"), human(1, "Two")]) {
  return engine().createMatch(players);
}

function openDrawRound(game, match) {
  game.call(match, 0);
  game.check(match, 1);
  assert.equal(match.phase, "draw");
}

test("Five Card Draw opens a 100-point table with five private cards and 1/2 blinds", () => {
  for (const count of [2, 3, 4]) {
    const match = engine().createMatch(Array.from({ length: count }, (_, seat) => human(seat, `Player ${seat + 1}`)));
    assert.equal(match.players.length, count);
    assert.equal(match.phase, "opening");
    assert.ok(match.players.every((player) => player.hand.length === 5));
    assert.equal(match.players.reduce((total, player) => total + player.stack, 0) + match.pot, count * 100);
    assert.equal(match.pot, 3);
    assert.equal(match.currentBet, 2);
    assert.equal(match.stock.length, 52 - count * 5);
    assert.ok(match.players.flatMap((player) => player.hand).every((candidate) => !Object.hasOwn(candidate, "rankValue")));
  }
});

test("Five Card Draw hides all opponent cards until a showdown", () => {
  const game = engine();
  const match = matchFor();
  const view = game.viewFor(match, 0, new Map([[0, true], [1, true]]));
  const opponentCards = match.players[1].hand.map((candidate) => candidate.id);
  const serialized = JSON.stringify(view);

  assert.equal(view.type, "five_card_draw_match_state");
  assert.equal(view.hand.length, 5);
  assert.equal(view.state.players[1].cardCount, 5);
  assert.equal(view.state.players[1].revealedCards, null);
  for (const cardId of opponentCards) assert.equal(serialized.includes(`\"${cardId}\"`), false, `Leaked ${cardId}`);
});

test("Five Card Draw replaces selected cards, permits standing pat, and enters final betting", () => {
  const game = engine();
  const match = matchFor();
  openDrawRound(game, match);
  assert.equal(match.activeSeat, 1);

  const discarded = match.players[1].hand.slice(0, 2).map((candidate) => candidate.id);
  const stockBefore = match.stock.length;
  game.draw(match, 1, discarded);
  assert.equal(match.players[1].hand.length, 5);
  assert.equal(match.players[1].drawCount, 2);
  assert.equal(match.discardPile.length, 2);
  assert.deepEqual(match.discardPile.map((candidate) => candidate.id), discarded);
  assert.equal(match.stock.length, stockBefore - 2);
  assert.equal(match.activeSeat, 0);

  game.draw(match, 0, []);
  assert.equal(match.players[0].drawCount, 0);
  assert.equal(match.phase, "final");
  assert.equal(match.activeSeat, 1);
  assert.equal(match.currentBet, 0);
});

test("Five Card Draw rejects duplicate and unowned discards", () => {
  const game = engine();
  const match = matchFor();
  openDrawRound(game, match);
  const ownId = match.players[1].hand[0].id;
  const otherId = match.players[0].hand[0].id;

  assertGameError(() => game.draw(match, 1, [ownId, ownId]), "INVALID_DRAW");
  assertGameError(() => game.draw(match, 1, [otherId]), "CARD_NOT_OWNED");
});

test("Five Card Draw enforces the fixed-limit four-bet cap and resolves an uncontested pot", () => {
  const game = engine();
  const match = matchFor();
  openDrawRound(game, match);
  game.draw(match, 1, []);
  game.draw(match, 0, []);
  assert.equal(match.phase, "final");

  game.bet(match, 1);
  game.raise(match, 0);
  game.raise(match, 1);
  game.raise(match, 0);
  assert.equal(match.betCount, 4);
  assert.equal(match.activeSeat, 1);
  assertGameError(() => game.raise(match, 1), "RAISE_NOT_ALLOWED");
  game.fold(match, 1);

  assert.equal(match.roundOver, true);
  assert.equal(match.phase, "complete");
  assert.equal(match.players[0].stack, 114);
  assert.equal(match.players[1].stack, 86);
  assert.equal(match.pot, 32);
});

test("Five Card Draw showdown evaluates exactly the private five-card hands and rotates the dealer", () => {
  const game = engine();
  const match = matchFor();
  setFinalCheckdown(match, {
    playerCards: [["AS", "AH", "KD", "QC", "2S"], ["KS", "KH", "QD", "JC", "3S"]],
    contributions: [10, 10],
    activeSeat: 0
  });
  game.check(match, 0);
  game.check(match, 1);

  assert.equal(match.roundOver, true);
  assert.equal(match.showdown.revealed, true);
  assert.equal(match.showdown.evaluations.find((entry) => entry.seat === 0).hand.category, "pair");
  assert.equal(match.players[0].stack, 110);
  assert.equal(match.players[1].stack, 90);
  const view = game.viewFor(match, 0, new Map([[0, true], [1, true]]));
  assert.equal(view.state.players[1].revealedCards.length, 5);

  game.nextHand(match);
  assert.equal(match.round, 2);
  assert.equal(match.dealerSeat, 1);
  assert.equal(match.phase, "opening");
  assert.equal(match.players[0].hand.length, 5);
});

test("Five Card Draw pays a main pot and side pot correctly when a short stack is all in", () => {
  const game = engine();
  const match = matchFor([human(0, "Ace"), human(1, "King"), human(2, "Queen")]);
  setFinalCheckdown(match, {
    playerCards: [
      ["AS", "AH", "KD", "QC", "2S"],
      ["KS", "KH", "QD", "JC", "3S"],
      ["QS", "QH", "JD", "10C", "4S"]
    ],
    contributions: [10, 20, 20],
    stacks: [0, 80, 80],
    allInSeats: [0],
    activeSeat: 1
  });
  game.check(match, 1);
  game.check(match, 2);

  assert.deepEqual(match.showdown.pots.map((pot) => ({ amount: pot.amount, winnerSeats: pot.winnerSeats })), [
    { amount: 30, winnerSeats: [0] },
    { amount: 20, winnerSeats: [1] }
  ]);
  assert.equal(match.players[0].stack, 30);
  assert.equal(match.players[1].stack, 100);
  assert.equal(match.players[2].stack, 80);
});

test("Five Card Draw CPUs take legal betting and draw turns, and disconnected humans can be replaced", () => {
  const game = engine();
  const match = matchFor([human(0, "Host"), bot(1, "Cleo")]);
  game.call(match, 0);
  assert.equal(match.activeSeat, 1);
  assert.equal(game.runBotTurn(match), true);
  assert.equal(match.phase, "draw");
  assert.equal(match.activeSeat, 1);
  assert.equal(game.runBotTurn(match), true);
  assert.equal(match.players[1].hasDrawn, true);
  assert.equal(match.activeSeat, 0);
  assert.equal(game.replaceWithBot(match, 0), true);
  assert.equal(match.players[0].type, "bot");
  assert.equal(match.players[0].hand.length, 5);
});

function setFinalCheckdown(match, { playerCards, contributions, stacks = null, allInSeats = [], activeSeat }) {
  match.phase = "final";
  match.roundOver = false;
  match.matchOver = false;
  match.activeSeat = activeSeat;
  match.stock = cards("3S", "4S", "5S");
  match.discardPile = [];
  match.currentBet = 0;
  match.betCount = 0;
  match.raiseLocked = false;
  match.pot = contributions.reduce((total, amount) => total + amount, 0);
  match.players.forEach((player, index) => {
    player.stack = stacks ? stacks[index] : 100 - contributions[index];
    player.eliminated = false;
    player.hand = cards(...playerCards[index]);
    player.folded = false;
    player.allIn = allInSeats.includes(player.seat);
    player.contributionRound = 0;
    player.contributionHand = contributions[index];
    player.actedThisStreet = false;
    player.hasDrawn = true;
    player.drawCount = 0;
    player.lastAction = null;
    player.payout = 0;
  });
  match.showdown = null;
  return match;
}

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
