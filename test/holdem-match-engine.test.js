import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/holdem/match-engine.js";

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

test("Texas Hold'em opens a 100-point table with shared-card hole hands and 1/2 blinds", () => {
  for (const count of [2, 3, 4]) {
    const match = engine().createMatch(Array.from({ length: count }, (_, seat) => human(seat, `Player ${seat + 1}`)));
    assert.equal(match.players.length, count);
    assert.equal(match.phase, "preflop");
    assert.ok(match.players.every((player) => player.holeCards.length === 2));
    assert.equal(match.players.reduce((total, player) => total + player.stack, 0) + match.pot, count * 100);
    assert.equal(match.pot, 3);
    assert.equal(match.currentBet, 2);
    assert.equal(match.stock.length, 52 - count * 2);
    assert.ok(match.players.flatMap((player) => player.holeCards).every((candidate) => !("rankValue" in candidate)));
  }
});

test("Texas Hold'em hides all opponent hole cards until an actual showdown", () => {
  const game = engine();
  const match = matchFor();
  const view = game.viewFor(match, 0, new Map([[0, true], [1, true]]));
  const opponentCards = match.players[1].holeCards.map((candidate) => candidate.id);
  const serialized = JSON.stringify(view);

  assert.equal(view.type, "holdem_match_state");
  assert.equal(view.hand.length, 2);
  assert.equal(view.state.players[1].revealedCards, null);
  for (const cardId of opponentCards) assert.equal(serialized.includes(`\"${cardId}\"`), false, `Leaked ${cardId}`);
});

test("heads-up preflop call and big-blind check advance to the flop without changing stacks incorrectly", () => {
  const game = engine();
  const match = matchFor();
  assert.equal(match.activeSeat, 0);
  game.call(match, 0);
  assert.equal(match.activeSeat, 1);
  game.check(match, 1);

  assert.equal(match.phase, "flop");
  assert.equal(match.communityCards.length, 3);
  assert.equal(match.activeSeat, 1);
  assert.equal(match.pot, 4);
  assert.deepEqual(match.players.map((player) => player.stack), [98, 98]);
});

test("fixed-limit actions enforce the betting cap and resolve an uncontested pot", () => {
  const game = engine();
  const match = matchFor();
  game.call(match, 0);
  game.check(match, 1);
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
  assert.equal(match.players[0].stack, 108);
  assert.equal(match.players[1].stack, 92);
  assert.equal(match.pot, 18);
});

test("Poker showdown distributes table points, exposes live hands, and rotates the dealer into the next hand", () => {
  const game = engine();
  const match = matchFor();
  setRiverCheckdown(match, {
    playerCards: [["AS", "AD"], ["KS", "KD"]],
    board: ["AH", "KH", "7D", "5C", "2S"],
    contributions: [10, 10],
    activeSeat: 0
  });
  game.check(match, 0);
  game.check(match, 1);

  assert.equal(match.roundOver, true);
  assert.equal(match.showdown.revealed, true);
  assert.equal(match.players[0].stack, 110);
  assert.equal(match.players[1].stack, 90);
  const view = game.viewFor(match, 0, new Map([[0, true], [1, true]]));
  assert.equal(view.state.players[1].revealedCards.length, 2);

  game.nextHand(match);
  assert.equal(match.round, 2);
  assert.equal(match.dealerSeat, 1);
  assert.equal(match.phase, "preflop");
  assert.equal(match.players[0].holeCards.length, 2);
});

test("Poker rotates the dealer past an eliminated button seat", () => {
  const game = engine();
  const match = matchFor([human(0, "One"), human(1, "Two"), human(2, "Three")]);
  match.roundOver = true;
  match.matchOver = false;
  match.dealerSeat = 1;
  match.players[1].stack = 0;
  match.players[1].eliminated = true;

  game.nextHand(match);

  assert.equal(match.dealerSeat, 2);
  assert.equal(match.phase, "preflop");
});

test("Poker pays a main pot and side pot correctly when a short stack is all in", () => {
  const game = engine();
  const match = matchFor([human(0, "Ace"), human(1, "King"), human(2, "Queen")]);
  setRiverCheckdown(match, {
    playerCards: [["AS", "AD"], ["KS", "KD"], ["QS", "QD"]],
    board: ["AH", "KH", "7D", "5C", "2S"],
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

test("Poker CPUs take one legal fixed-limit action at a time and disconnected humans can be replaced", () => {
  const game = engine();
  const match = matchFor([human(0, "Host"), bot(1, "Cleo")]);
  match.activeSeat = 1;
  assert.equal(game.runBotTurn(match), true);
  assert.ok(["preflop", "flop", "turn", "river", "complete"].includes(match.phase));
  assert.ok(match.players[1].lastAction);
  assert.equal(game.replaceWithBot(match, 0), true);
  assert.equal(match.players[0].type, "bot");
  assert.equal(match.players[0].holeCards.length, 2);
});

function setRiverCheckdown(match, { playerCards, board, contributions, stacks = null, allInSeats = [], activeSeat }) {
  match.phase = "river";
  match.roundOver = false;
  match.matchOver = false;
  match.activeSeat = activeSeat;
  match.communityCards = cards(...board);
  match.burnedCards = [];
  match.stock = cards("3S", "4S", "5S");
  match.currentBet = 0;
  match.betCount = 0;
  match.pot = contributions.reduce((total, amount) => total + amount, 0);
  match.players.forEach((player, index) => {
    player.stack = stacks ? stacks[index] : 100 - contributions[index];
    player.eliminated = false;
    player.holeCards = cards(...playerCards[index]);
    player.folded = false;
    player.allIn = allInSeats.includes(player.seat);
    player.contributionRound = 0;
    player.contributionHand = contributions[index];
    player.actedThisStreet = false;
    player.lastAction = null;
    player.payout = 0;
  });
  match.showdown = null;
  return match;
}

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
