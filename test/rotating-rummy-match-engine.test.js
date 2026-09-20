import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/rotating-rummy-deck.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/rotating-rummy/match-engine.js";
import { RotatingRummyRuntime } from "../server/src/games/rotating-rummy/runtime.js";

const identityShuffle = (cards) => cards.slice();
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name) => ({ seat, name, type: "bot", style: "steady" });
const cards = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => cards.get(id);

function engine() {
  return new MatchEngine({ shuffleDeck: identityShuffle, selectRouteDeck: (routeDecks) => routeDecks[0], randomIndex: () => 0 });
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

test("Pass can target a later opponent while intervening players take turns, then expires after one skip", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), human(1, "Two"), human(2, "Three"), human(3, "Four")]);
  setTable(table, {
    hands: [["rr-lock-1", "rr-red-1-a", "rr-red-2-a"], ["rr-blue-1-a", "rr-blue-2-a", "rr-blue-3-a"], ["rr-green-1-a", "rr-green-2-a"], ["rr-yellow-1-a", "rr-yellow-2-a"]],
    stock: ["rr-red-9-a", "rr-blue-9-a", "rr-green-9-a", "rr-yellow-9-a", "rr-red-10-a"],
    turnStage: "play"
  });
  game.discard(table, 0, "rr-lock-1", 2);
  assert.equal(table.activeSeat, 1);
  assert.deepEqual(table.pendingSkipSeats, [2]);
  assert.match(table.lastMoveText, /Three will miss their next turn/);
  assert.deepEqual(JSON.parse(JSON.stringify(table)).pendingSkipSeats, [2]);
  game.drawStock(table, 1);
  game.discard(table, 1, "rr-blue-1-a");
  assert.equal(table.activeSeat, 3);
  assert.deepEqual(table.pendingSkipSeats, []);
  game.drawStock(table, 3);
  game.discard(table, 3, "rr-yellow-1-a");
  assert.equal(table.activeSeat, 0);
  game.drawStock(table, 0);
  game.discard(table, 0, "rr-red-1-a");
  assert.equal(table.activeSeat, 1);
  game.drawStock(table, 1);
  game.discard(table, 1, "rr-blue-2-a");
  assert.equal(table.activeSeat, 2);
});

test("Pass skips the immediately next opponent, including at a two-player table", () => {
  const game = engine();
  const three = matchFor();
  setTable(three, { hands: [["rr-lock-1", "rr-red-1-a"], ["rr-blue-1-a"], ["rr-green-1-a"]], turnStage: "play" });
  game.discard(three, 0, "rr-lock-1", 1);
  assert.equal(three.activeSeat, 2);
  assert.deepEqual(three.pendingSkipSeats, []);

  const two = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(two, { hands: [["rr-lock-1", "rr-red-1-a"], ["rr-blue-1-a"]], turnStage: "play" });
  game.discard(two, 0, "rr-lock-1", 1);
  assert.equal(two.activeSeat, 0);
  assert.deepEqual(two.pendingSkipSeats, []);
});

test("Pass target validation rejects missing, self, and invalid seats without changing the match", () => {
  const game = engine();
  const table = matchFor();
  setTable(table, { hands: [["rr-lock-1", "rr-red-1-a"], ["rr-blue-1-a"], ["rr-green-1-a"]], turnStage: "play" });
  for (const target of [undefined, null, 0, 9, "2"]) {
    const before = structuredClone(table);
    assertGameError(() => game.discard(table, 0, "rr-lock-1", target), "INVALID_PASS_TARGET");
    assert.deepEqual(table, before);
  }
  game.discard(table, 0, "rr-red-1-a");
  assert.equal(table.activeSeat, 1);
  assert.deepEqual(table.pendingSkipSeats, []);
});

test("a Pass on top of discard is unavailable to humans and bots", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), bot(1, "Bot")]);
  setTable(table, { hands: [["rr-red-1-a"], ["rr-blue-1-a", "rr-blue-2-a"]], top: "rr-lock-1", stock: ["rr-red-9-a"], activeSeat: 0 });
  assert.equal(game.viewFor(table, 0).state.actions.drawDiscard, false);
  const before = structuredClone(table);
  assertGameError(() => game.drawDiscard(table, 0), "PASS_DISCARD_BLOCKED");
  assert.deepEqual(table, before);
  table.activeSeat = 1;
  game.runBotTurn(table);
  assert.equal(table.players[1].lastPlay.label, "Drew stock");
  assert.equal(table.discardPile.at(-1).id, "rr-lock-1");
});

test("a bot can discard a Pass through the same target validation", () => {
  const game = engine();
  const table = matchFor([human(0, "One"), bot(1, "Bot"), human(2, "Three")]);
  setTable(table, { hands: [["rr-red-1-a"], ["rr-lock-1", "rr-blue-1-a"], ["rr-green-1-a"]], activeSeat: 1, turnStage: "play" });
  game.runBotTurn(table);
  assert.equal(table.discardPile.at(-1).id, "rr-lock-1");
  assert.match(table.lastMoveText, /discarded a Pass/);
  assert.equal(table.activeSeat, 0);
});

test("the Rummy runtime forwards Pass targets and restores pending skips from snapshots", () => {
  const table = matchFor();
  setTable(table, {
    hands: [["rr-lock-1", "rr-red-1-a"], ["rr-blue-1-a", "rr-blue-2-a"], ["rr-green-1-a"]],
    stock: ["rr-red-9-a"],
    turnStage: "play"
  });
  const restore = (state) => new RotatingRummyRuntime({ matchEngine: engine(), restoredMatches: [{ gameId: "rotating-rummy", code: "PASS", state }] });
  const runtime = restore(table);
  const room = { code: "PASS", players: [{ seat: 0, isYou: true }] };
  assertGameError(() => runtime.act(room, { type: "rummy_discard", cardId: "rr-lock-1" }), "INVALID_PASS_TARGET");
  runtime.act(room, { type: "rummy_discard", cardId: "rr-lock-1", targetSeat: 2 });
  const saved = runtime.snapshot("PASS");
  assert.deepEqual(saved.pendingSkipSeats, [2]);
  const resumed = restore(saved);
  const resumedMatch = resumed.snapshot("PASS");
  assert.equal(resumedMatch.activeSeat, 1);
  engine().drawStock(resumedMatch, 1);
  engine().discard(resumedMatch, 1, "rr-blue-1-a");
  assert.equal(resumedMatch.activeSeat, 0);
  assert.deepEqual(resumedMatch.pendingSkipSeats, []);
});

test("Rotating Rummy CPUs expose draw, Route, and discard as separate steps", () => {
  const game = engine();
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, {
    hands: [["rr-red-1-a"], ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a", "rr-red-1-a"]],
    activeSeat: 1,
    turnStage: "draw",
    stock: ["rr-blue-3-a"]
  });
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].lastPlay.kind, "draw");
  assert.equal(table.players[1].routeComplete, false);
  assert.equal(table.activeSeat, 1);
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].routeComplete, true);
  assert.equal(table.players[1].lastPlay.kind, "route");
  assert.equal(table.activeSeat, 1);
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].lastPlay.kind, "discard");
  assert.equal(table.activeSeat, 0);
  assert.equal(game.runBotTurn(table), false);
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
  assert.equal(table.players[1].lastPlay.kind, "route");
  assert.equal(table.roundOver, false);
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].lastPlay.kind, "link");
  assert.equal(table.roundOver, false);
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.roundOver, true);
  assert.equal(table.players[1].routeMeld[0].length, 3);
  assert.equal(table.players[1].hand.length, 0);
});

test("Rotating Rummy CPUs preserve a useful Wild instead of feeding it to the next player", () => {
  const game = engine();
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, {
    hands: [["rr-blue-1-a"], ["rr-glitch-1", "rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-9-a", "rr-red-12-a"]],
    activeSeat: 1,
    turnStage: "play"
  });
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].lastPlayedCard.id, "rr-red-12-a");
  assert.ok(table.players[1].hand.some((entry) => entry.kind === "glitch"));
});

test("Rotating Rummy CPUs take a public Wild when it materially improves Route prospects", () => {
  const game = engine();
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, {
    hands: [["rr-blue-1-a"], ["rr-red-4-a", "rr-blue-5-a", "rr-green-7-a", "rr-yellow-10-a"]],
    top: "rr-glitch-1",
    stock: ["rr-red-12-a"],
    activeSeat: 1,
    turnStage: "draw"
  });
  assert.equal(game.runBotTurn(table), true);
  assert.equal(table.players[1].lastPlay.label, "Took Wild");
  assert.ok(table.players[1].hand.some((entry) => entry.id === "rr-glitch-1"));
});

test("Rotating Rummy randomizes its initial opener and continues its intentional round rotation", () => {
  const game = new MatchEngine({
    shuffleDeck: identityShuffle,
    selectRouteDeck: (routeDecks) => routeDecks[0],
    randomIndex: () => 2
  });
  const match = game.createMatch([human(0, "One"), human(1, "Two"), human(2, "Three")]);
  assert.equal(match.initialOriginSeat, 2);
  assert.equal(match.roundOpeningSeat, 2);
  assert.equal(match.activeSeat, 2);
  match.roundOver = true;
  match.phase = "round-complete";
  const next = game.nextRound(match);
  assert.equal(next.initialOriginSeat, 2);
  assert.equal(next.roundOpeningSeat, 0);
  assert.equal(next.activeSeat, 0);
});

const warmStart = ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-red-8-a"];
const finishLine = ["rr-red-1-a", "rr-blue-12-a", "rr-yellow-2-a", "rr-green-11-a", "rr-red-5-a", "rr-red-6-a", "rr-red-7-a", "rr-red-8-a"];

test("The final Route completion advances everyone without a discard or score bonus", () => {
  const game = engine();
  const table = matchFor();
  setTable(table, { hands: [[...warmStart, "rr-red-2-a"], ["rr-green-1-a"], ["rr-blue-1-a"]], turnStage: "play" });
  table.players[1].routeComplete = true;
  table.players[2].routeComplete = true;
  table.players[0].score = 23;
  game.completeRoute(table, 0, warmStart);
  assert.equal(table.roundOver, true);
  assert.equal(table.roundEndReason, "all-routes-complete");
  assert.equal(table.roundWinnerSeat, null);
  assert.equal(table.activeSeat, null);
  assert.equal(table.turnStage, "complete");
  assert.equal(table.players[0].hand.length, 1);
  assert.deepEqual(table.players.map((player) => player.score), [23, 0, 0]);
  assert.ok(table.players.every((player) => player.routeIndex === 1 && player.completedThisRound));
  assertGameError(() => game.discard(table, 0, "rr-red-2-a"), "MATCH_NOT_ACTIVE");
  assert.ok(Object.values(game.viewFor(table, 0).state.actions).every((allowed) => !allowed));
  const next = game.nextRound(table);
  assert.equal(next.round, 2);
  assert.equal(next.activeSeat, 1);
  assert.equal(next.roundEndReason, null);
  assert.ok(next.players.every((player) => player.routeIndex === 1 && !player.routeComplete && player.hand.length === 10));
});

test("The last outstanding Route may use the player's entire hand", () => {
  const table = matchFor([human(0, "One"), human(1, "Two")]);
  setTable(table, { hands: [warmStart, ["rr-green-1-a"]], turnStage: "play" });
  assertGameError(() => engine().completeRoute(table, 0, warmStart), "DISCARD_REQUIRED");
  table.players[1].routeComplete = true;
  engine().completeRoute(table, 0, warmStart);
  assert.equal(table.roundOver, true);
  assert.equal(table.players[0].hand.length, 0);
});

test("A CPU stops immediately when it completes the final outstanding Route", () => {
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, { hands: [["rr-yellow-12-a"], [...warmStart, "rr-green-4-a", "rr-red-1-b"]], activeSeat: 1, turnStage: "play" });
  table.players[0].routeComplete = true;
  assert.equal(engine().runBotTurn(table), true);
  assert.equal(table.roundOver, true);
  assert.equal(table.players[1].lastPlay.kind, "route");
  assert.equal(table.players[1].hand.length, 2);
  assert.equal(engine().runBotTurn(table), false);
});

test("Shared Route finishes settle Route 10, including ties and uneven progress", () => {
  for (const otherRouteIndex of [0, 9]) {
    const table = matchFor([human(0, "One"), human(1, "Two")]);
    setTable(table, { hands: [[...finishLine, "rr-green-1-a"], ["rr-yellow-12-a"]], turnStage: "play" });
    table.players[0].routeIndex = 9;
    table.players[1].routeIndex = otherRouteIndex;
    table.players[1].routeComplete = true;
    engine().completeRoute(table, 0, finishLine);
    assert.equal(table.matchOver, true);
    assert.equal(table.phase, "complete");
    assert.deepEqual(table.winnerSeats, otherRouteIndex === 9 ? [0, 1] : [0]);
    assert.equal(table.winnerSeat, otherRouteIndex === 9 ? null : 0);
    assertGameError(() => engine().nextRound(table), "MATCH_COMPLETE");
  }
});

test("Rummy schedules readable steps and resumes a saved mid-turn without drawing twice", () => {
  const table = matchFor([human(0, "Host"), bot(1, "Byte")]);
  setTable(table, { hands: [["rr-yellow-12-a"], [...warmStart, "rr-red-1-a"]], activeSeat: 1 });
  const restore = (state) => new RotatingRummyRuntime({ matchEngine: engine(), restoredMatches: [{ gameId: "rotating-rummy", code: "PACE", state }] });
  const runtime = restore(table);
  assert.equal(runtime.nextActionDelay("PACE"), 1_600);
  runtime.runScheduledStep("PACE");
  const drawn = runtime.snapshot("PACE");
  assert.equal(drawn.turnStage, "play");
  const restored = restore(drawn);
  restored.runScheduledStep("PACE");
  assert.equal(restored.snapshot("PACE").players[1].lastPlay.kind, "route");
  assert.equal(restored.snapshot("PACE").stock.length, drawn.stock.length);
  while (restored.nextActionDelay("PACE") !== null) restored.runScheduledStep("PACE");
  assert.equal(restored.snapshot("PACE").activeSeat, 0);
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
