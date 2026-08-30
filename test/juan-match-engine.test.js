import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/juan-deck.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/juan/match-engine.js";

const identityShuffle = (cards) => cards.slice();
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name) => ({ seat, name, type: "bot", style: "steady" });
const catalog = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => catalog.get(id);

function matchFor(players = [human(0, "One"), human(1, "Two"), human(2, "Three")]) {
  return new MatchEngine({ shuffleDeck: identityShuffle }).createMatch(players);
}

function setTable(match, { hands, top = "blaze-3-a", activeSeat = 0, activeColor = null, stock = [] }) {
  match.players.forEach((player, index) => {
    player.hand = hands[index].map(card);
    player.juan = false;
    player.lastPlay = null;
    player.lastPlayedCard = null;
  });
  match.stock = stock.map(card);
  match.discardPile = [card(top)];
  match.activeColor = activeColor || card(top).color;
  match.activeSeat = activeSeat;
  match.direction = 1;
  match.pendingJuan = null;
  match.pendingPrismBurst = null;
  return match;
}

test("JUAN deals seven cards and keeps the 108-card deck private", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(0, "One"), human(1, "Two"), human(2, "Three"), human(3, "Four")]);
  assert.ok(match.players.every((player) => player.hand.length === 7));
  assert.equal(match.stock.length, 79);
  assert.equal(match.discardPile.length, 1);
  assert.equal(match.discardPile[0].kind, "number");

  const view = engine.viewFor(match, 0, new Map([[0, true], [1, true], [2, true], [3, true]]));
  const serialized = JSON.stringify(view);
  assert.equal(view.type, "juan_match_state");
  assert.equal(view.hand.length, 7);
  assert.ok(view.state.players.every((player) => !Object.hasOwn(player, "hand")));
  for (const hiddenCard of match.players[1].hand) assert.equal(serialized.includes(`"${hiddenCard.id}"`), false);
});

test("JUAN rejects wrong turns, nonmatching cards, and an uncolored Prism", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["tide-3-a", "grove-7-a", "prism-1"], ["spark-1-a"], ["blaze-2-a"]]
  });
  assertGameError(() => engine.play(match, 1, "spark-1-a"), "NOT_YOUR_TURN");
  assertGameError(() => engine.play(match, 0, "grove-7-a"), "CARD_DOES_NOT_MATCH");
  assertGameError(() => engine.play(match, 0, "prism-1"), "COLOR_REQUIRED");
  engine.play(match, 0, "prism-1", "grove");
  assert.equal(match.activeColor, "grove");
  assert.equal(match.activeSeat, 1);
  const view = engine.viewFor(match, 0);
  assert.equal(view.state.players[0].lastPlayedCard.id, "prism-1");
});

test("JUAN Pause, Turnabout, and Double Draw own their turn effects", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [
      ["blaze-pause", "blaze-turnabout", "blaze-double-draw", "blaze-7-a"],
      ["tide-1-a"],
      ["grove-1-a"]
    ],
    stock: ["spark-2-a", "spark-3-a", "spark-4-a"]
  });

  engine.play(match, 0, "blaze-pause");
  assert.equal(match.activeSeat, 2, "Pause skips the next seat");

  match.activeSeat = 0;
  engine.play(match, 0, "blaze-turnabout");
  assert.equal(match.direction, -1);
  assert.equal(match.activeSeat, 2, "Turnabout changes traversal before finding the next seat");

  match.activeSeat = 0;
  match.direction = 1;
  const before = match.players[1].hand.length;
  engine.play(match, 0, "blaze-double-draw");
  assert.equal(match.players[1].hand.length, before + 2);
  assert.equal(match.activeSeat, 2, "Double Draw also costs the target's turn");
});

test("JUAN requires a player to call JUAN and lets another player catch a missed call", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a"], ["grove-1-a"]],
    stock: ["spark-2-a", "spark-3-a"]
  });

  engine.play(match, 0, "blaze-7-a");
  assert.equal(match.players[0].hand.length, 1);
  assert.equal(match.players[0].juan, false);
  assert.deepEqual(match.pendingJuan, { seat: 0 });
  assert.equal(match.activeSeat, 1);
  const pendingView = engine.viewFor(match, 1);
  assert.deepEqual(pendingView.state.juanCall, { seat: 0 });

  engine.callJuan(match, 0);
  assert.equal(match.players[0].juan, true);
  assert.equal(match.pendingJuan, null);
  assert.match(match.lastMoveText, /called JUAN/);

  const declaredWithPlay = setTable(matchFor(), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a"], ["grove-1-a"]]
  });
  engine.play(declaredWithPlay, 0, "blaze-7-a", null, true);
  assert.equal(declaredWithPlay.players[0].juan, true);
  assert.equal(declaredWithPlay.pendingJuan, null);

  const caughtMatch = setTable(matchFor(), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a"], ["grove-1-a"]],
    stock: ["spark-2-a", "spark-3-a"]
  });
  engine.play(caughtMatch, 0, "blaze-7-a");
  engine.catchJuan(caughtMatch, 1);
  assert.equal(caughtMatch.players[0].hand.length, 3);
  assert.equal(caughtMatch.players[0].juan, false);
  assert.equal(caughtMatch.pendingJuan, null);
  assert.equal(caughtMatch.activeSeat, 1, "Catching JUAN does not consume the current player's turn");
  assert.match(caughtMatch.lastMoveText, /caught One without JUAN/);
});

test("JUAN automatically draws two when its call is missed before the next action", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a"], ["grove-1-a"]],
    stock: ["tide-2-a", "tide-3-a", "tide-4-a"]
  });

  engine.play(match, 0, "blaze-7-a");
  engine.draw(match, 1);
  assert.equal(match.pendingJuan, null);
  assert.equal(match.players[0].hand.length, 3);
  assert.match(match.lastMoveText, /One missed JUAN and draws 2/);
  assertGameError(() => engine.catchJuan(match, 2), "JUAN_CATCH_NOT_AVAILABLE");
});

test("JUAN Prism Burst opens a challenge decision instead of drawing cards immediately", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["prism-burst-1", "tide-7-a"], ["tide-1-a"], ["grove-1-a"]],
    stock: ["spark-1-a", "spark-2-a", "spark-3-a", "spark-4-a", "spark-5-a"]
  });
  engine.play(match, 0, "prism-burst-1", "tide");
  assert.equal(match.activeColor, "tide");
  assert.equal(match.players[1].hand.length, 1);
  assert.equal(match.activeSeat, 1);
  assert.deepEqual(match.pendingPrismBurst, {
    sourceSeat: 0,
    targetSeat: 1,
    priorColor: "blaze",
    chosenColor: "tide",
    sourceHadPriorColor: false
  });
  assertGameError(() => engine.draw(match, 1), "PRISM_BURST_RESPONSE_REQUIRED");
  const view = engine.viewFor(match, 1);
  assert.deepEqual(view.state.prismBurstChallenge, {
    sourceSeat: 0,
    targetSeat: 1,
    priorColor: "blaze",
    chosenColor: "tide"
  });
  assert.equal(JSON.stringify(view).includes("sourceHadPriorColor"), false, "The secret challenge result must stay server-side");

  engine.acceptPrismBurst(match, 1);
  assert.equal(match.players[1].hand.length, 5);
  assert.equal(match.pendingPrismBurst, null);
  assert.equal(match.activeSeat, 2);
});

test("a successful Prism Burst challenge makes the player who used it illegally draw four and restores the target turn", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["prism-burst-1", "blaze-7-a", "tide-7-a"], ["spark-1-a"], ["grove-1-a"]],
    stock: ["spark-2-a", "spark-3-a", "spark-4-a", "spark-5-a"]
  });

  engine.play(match, 0, "prism-burst-1", "tide");
  engine.challengePrismBurst(match, 1);
  assert.equal(match.players[0].hand.length, 6);
  assert.equal(match.players[1].hand.length, 1);
  assert.equal(match.pendingPrismBurst, null);
  assert.equal(match.activeSeat, 1, "The challenged player gets their turn back");
  assert.match(match.lastMoveText, /won the Prism Burst challenge/);
});

test("a failed Prism Burst challenge draws six and skips the challenged player", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["prism-burst-1", "tide-7-a", "grove-7-a"], ["spark-1-a"], ["grove-1-a"]],
    stock: ["spark-2-a", "spark-3-a", "spark-4-a", "spark-5-a", "tide-2-a", "tide-3-a"]
  });

  engine.play(match, 0, "prism-burst-1", "tide");
  engine.challengePrismBurst(match, 1);
  assert.equal(match.players[1].hand.length, 7);
  assert.equal(match.pendingPrismBurst, null);
  assert.equal(match.activeSeat, 2);
  assert.match(match.lastMoveText, /lost the Prism Burst challenge/);
});

test("JUAN does not end a Prism Burst finish until the target resolves its challenge", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["prism-burst-1"], ["spark-1-a"], ["grove-1-a"]],
    stock: ["spark-2-a", "spark-3-a", "spark-4-a", "spark-5-a"]
  });

  engine.play(match, 0, "prism-burst-1", "tide");
  assert.equal(match.roundOver, false);
  engine.acceptPrismBurst(match, 1);
  assert.equal(match.roundOver, true);
  assert.equal(match.placements[0], 0);
});

test("JUAN recycles the discard stack when a player draws from an empty stock", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["grove-7-a", "grove-6-a"], ["spark-1-a"], ["tide-1-a"]]
  });
  match.discardPile = [card("tide-2-a"), card("spark-2-a"), card("blaze-3-a")];
  engine.draw(match, 0);
  assert.equal(match.players[0].hand.length, 3);
  assert.equal(match.discardPile.length, 1);
  assert.equal(match.discardPile[0].id, "blaze-3-a");
  assert.equal(match.activeSeat, 1);
});

test("JUAN lets a player play only a playable card they just drew, or keep it", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["blaze-8-a"], ["spark-1-a"], ["grove-1-a"]],
    top: "blaze-7-a",
    stock: ["tide-7-a"]
  });

  engine.draw(match, 0);
  assert.equal(match.activeSeat, 0);
  assert.equal(match.drawnCardId, "tide-7-a");
  assertGameError(() => engine.play(match, 0, "blaze-8-a"), "DRAWN_CARD_ONLY");

  engine.endTurn(match, 0);
  assert.equal(match.activeSeat, 1);
  assert.equal(match.drawnCardId, null);
  assert.match(match.lastMoveText, /kept the drawn card/);
});

test("JUAN automatically ends a turn after drawing a card that cannot play", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["grove-8-a"], ["spark-1-a"], ["grove-1-a"]],
    top: "blaze-7-a",
    stock: ["tide-2-a"]
  });

  engine.draw(match, 0);
  assert.equal(match.activeSeat, 1);
  assert.equal(match.drawnCardId, null);
});

test("JUAN ends when a hand empties and scores every card still held", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["blaze-7-a"], ["spark-double-draw", "spark-1-a"], ["prism-2"]]
  });
  engine.play(match, 0, "blaze-7-a");
  assert.equal(match.roundOver, true);
  assert.equal(match.matchOver, true);
  assert.equal(match.phase, "complete");
  assert.deepEqual(match.placements, [0, 2, 1]);
  assert.equal(match.players[0].score, 45);
  assert.match(match.lastMoveText, /wins JUAN/);
});

test("JUAN CPUs resolve exactly one turn at a time", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor([human(0, "Host"), bot(1, "Juno"), bot(2, "Pip")]), {
    hands: [["blaze-1-a", "spark-7-a"], ["tide-3-a", "grove-7-a"], ["spark-2-a", "spark-4-a"]],
    activeSeat: 1,
    stock: ["tide-1-a"]
  });
  assert.equal(engine.runBotTurn(match), true);
  assert.ok(match.players[1].lastPlay);
  assert.equal(match.players[2].lastPlay, null);
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
