import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/rotating-rummy-deck.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/rotating-rummy/match-engine.js";

const identityShuffle = (cards) => cards.slice();
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name) => ({ seat, name, type: "bot", style: "steady" });
const cards = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => cards.get(id);

function engine() {
  return new MatchEngine({ shuffleDeck: identityShuffle, selectRouteDeck: (routeDecks) => routeDecks[0] });
}

function matchFor(players = [human(0, "One"), human(1, "Two"), human(2, "Three")]) {
  return engine().createMatch(players);
}

function setTable(match, { hands, top = "rr-red-3-a", stock = ["rr-blue-9-a"], activeSeat = 0, turnStage = "draw" }) {
  match.players.forEach((player, index) => {
    player.hand = hands[index].map(card);
    player.routeComplete = false;
    player.completedThisRound = false;
    player.routeMeld = [];
    player.lastPlay = null;
    player.lastPlayedCard = null;
  });
  match.stock = stock.map(card);
  match.discardPile = [card(top)];
  match.activeSeat = activeSeat;
  match.turnStage = turnStage;
  match.roundOver = false;
  match.matchOver = false;
  return match;
}

test("Rotating Rummy deals ten cards, exposes its Route Deck, and keeps other hands private", () => {
  const match = engine().createMatch([human(0, "One"), human(1, "Two"), human(2, "Three"), human(3, "Four")]);
  assert.ok(match.players.every((player) => player.hand.length === 10));
  assert.equal(match.stock.length, 67);
  assert.equal(match.discardPile[0].kind, "number");
  assert.equal(match.routeDeckId, "neon-grid");

  const view = engine().viewFor(match, 0, new Map([[0, true], [1, true], [2, true], [3, true]]));
  assert.equal(view.type, "rotating_rummy_match_state");
  assert.equal(view.hand.length, 10);
  assert.equal(view.state.routeDeck.routes.length, 10);
  assert.equal(view.state.yourRoute.number, 1);
  const serialized = JSON.stringify(view);
  for (const hiddenCard of match.players[1].hand) assert.equal(serialized.includes(`\"${hiddenCard.id}\"`), false);
});

test("A turn draws first, completes a valid Route, then discards to end the round", () => {
  const table = matchFor([human(0, "One"), human(1, "Two")]);
  const game = engine();
  setTable(table, {
    hands: [
      ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"],
      ["rr-yellow-12-a"]
    ],
    stock: ["rr-red-1-a"]
  });
  assertGameError(() => game.completeRoute(table, 0, ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"]), "WRONG_TURN_STAGE");
  game.drawStock(table, 0);
  game.completeRoute(table, 0, ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"]);
  assert.equal(table.players[0].routeComplete, true);
  assert.equal(table.players[0].routeMeld.flat().length, 5);
  game.discard(table, 0, "rr-red-1-a");
  assert.equal(table.roundOver, true);
  assert.equal(table.players[0].routeIndex, 1);
  assert.equal(table.players[1].routeIndex, 0, "unfinished Routes repeat next round");
  assert.equal(table.players[0].score, 12);
  assert.match(table.lastMoveText, /cleared Route 1/);
});

test("Players may discard before completing a Route but cannot go out early", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(table, {
    hands: [["rr-red-1-a", "rr-blue-2-a"], ["rr-yellow-12-a"]],
    turnStage: "play"
  });
  assert.doesNotThrow(() => game.discard(table, 0, "rr-red-1-a"));
  assert.equal(table.roundOver, false);
  assert.equal(table.players[0].hand.length, 1);

  const finalCard = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(finalCard, {
    hands: [["rr-red-1-a"], ["rr-yellow-12-a"]],
    turnStage: "play"
  });
  assertGameError(() => game.discard(finalCard, 0, "rr-red-1-a"), "ROUTE_REQUIRED");
});

test("Completed Routes accept compatible Links before the final discard", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(table, {
    hands: [["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a", "rr-green-4-a", "rr-red-1-a"], ["rr-yellow-12-a"]],
    turnStage: "play"
  });
  assertGameError(() => game.link(table, 0, 0, 0, ["rr-green-4-a"]), "ROUTE_NOT_COMPLETE");

  game.completeRoute(table, 0, ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"]);
  game.link(table, 0, 0, 0, ["rr-green-4-a"]);
  assert.equal(table.players[0].routeMeld[0].length, 3);
  assert.equal(table.players[0].hand.length, 1);
  game.discard(table, 0, "rr-red-1-a");
  assert.equal(table.roundOver, true);
});

test("Players can extend their own completed run during the same turn", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(table, {
    hands: [["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a", "rr-blue-9-a", "rr-red-1-a"], ["rr-yellow-12-a"]],
    turnStage: "play"
  });

  game.completeRoute(table, 0, ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"]);
  assert.equal(table.turnStage, "play");
  assert.equal(table.activeSeat, 0);

  game.link(table, 0, 0, 1, ["rr-blue-9-a"]);
  assert.deepEqual(table.players[0].routeMeld[1].map((entry) => entry.value), [6, 7, 8, 9]);
  assert.equal(table.players[0].hand.length, 1);
  game.discard(table, 0, "rr-red-1-a");
  assert.equal(table.roundOver, true);
});

test("next rounds retain player Route progress and use the same Route Deck", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(table, {
    hands: [
      ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a", "rr-red-1-a"],
      ["rr-yellow-12-a"]
    ],
    turnStage: "play"
  });
  game.completeRoute(table, 0, ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"]);
  game.discard(table, 0, "rr-red-1-a");
  const next = game.nextRound(table);
  assert.equal(next.round, 2);
  assert.equal(next.routeDeckId, "neon-grid");
  assert.equal(next.players[0].routeIndex, 1);
  assert.equal(next.players[1].routeIndex, 0);
  assert.equal(next.players[0].score, 12);
});

test("Locks skip the next seat after a discard", () => {
  const game = engine();
  const table = matchFor();
  setTable(table, {
    hands: [["rr-lock-1", "rr-red-1-a"], ["rr-blue-1-a"], ["rr-green-1-a"]],
    turnStage: "play"
  });
  game.discard(table, 0, "rr-lock-1");
  assert.equal(table.activeSeat, 2);
  assert.match(table.lastMoveText, /Two loses the turn/);
});

test("Rotating Rummy CPUs resolve a whole draw, route, and discard turn", () => {
  const game = engine();
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, {
    hands: [["rr-red-1-a"], ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a", "rr-red-1-a"]],
    activeSeat: 1,
    turnStage: "draw",
    stock: ["rr-blue-3-a"]
  });
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].routeComplete, true);
  assert.equal(table.activeSeat, 0);
});

test("Rotating Rummy CPUs link compatible cards so short Routes can still go out", () => {
  const game = engine();
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, {
    hands: [["rr-red-1-a"], ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a", "rr-green-4-a", "rr-red-1-b"]],
    activeSeat: 1,
    turnStage: "play"
  });
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.roundOver, true);
  assert.equal(table.players[1].routeMeld[0].length, 3);
  assert.equal(table.players[1].hand.length, 0);
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
