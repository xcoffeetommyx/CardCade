import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/juan-deck.js";
import hotSeatFlow from "../shared/hot-seat-flow.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine, TOTAL_ROUNDS } from "../server/src/games/juan/match-engine.js";
import { JuanRuntime } from "../server/src/games/juan/runtime.js";

const identityShuffle = (cards) => cards.slice();
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name) => ({ seat, name, type: "bot", style: "steady" });
const catalog = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => catalog.get(id);

function matchFor(players = [human(0, "One"), human(1, "Two"), human(2, "Three")]) {
  return new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 0 }).createMatch(players);
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
  assert.deepEqual(match.lastJuanCall, { id: "1:1", seat: 0, calledAt: match.lastJuanCall.calledAt });
  assert.deepEqual(engine.viewFor(match, 1).state.juanAnnouncement, match.lastJuanCall);

  const declaredWithPlay = setTable(matchFor(), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a"], ["grove-1-a"]]
  });
  engine.play(declaredWithPlay, 0, "blaze-7-a", null, true);
  assert.equal(declaredWithPlay.players[0].juan, true);
  assert.equal(declaredWithPlay.pendingJuan, null);
  assert.equal(declaredWithPlay.lastJuanCall.seat, 0);

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

test("a Prism play that leaves one card exposes the same authoritative Call and Catch JUAN window", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["prism-1", "tide-7-a"], ["tide-1-a"], ["grove-1-a"]],
    stock: ["spark-1-a", "spark-2-a"]
  });

  engine.play(match, 0, "prism-1", "tide");
  assert.deepEqual(match.pendingJuan, { seat: 0 });
  assert.deepEqual(engine.viewFor(match, 0).state.juanCall, { seat: 0 });
  assert.deepEqual(engine.viewFor(match, 1).state.juanCall, { seat: 0 });

  const called = structuredClone(match);
  engine.callJuan(called, 0);
  assert.equal(called.players[0].juan, true);
  assert.equal(called.pendingJuan, null);

  const caught = structuredClone(match);
  engine.catchJuan(caught, 1);
  assert.equal(caught.players[0].hand.length, 3);
  assert.equal(caught.pendingJuan, null);
});

test("JUAN Prism Burst opens a challenge decision instead of drawing cards immediately", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["prism-burst-1", "tide-7-a"], ["tide-1-a"], ["grove-1-a"]],
    stock: ["spark-1-a", "spark-2-a", "spark-3-a", "spark-4-a", "spark-5-a"]
  });
  engine.play(match, 0, "prism-burst-1", "tide");
  assert.equal(match.activeColor, "tide");
  assert.deepEqual(match.pendingJuan, { seat: 0 });
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
  assert.deepEqual(engine.viewFor(match, 0).state.juanCall, { seat: 0 });
  assert.deepEqual(view.state.juanCall, { seat: 0 });
  assert.deepEqual(view.state.prismBurstChallenge, {
    sourceSeat: 0,
    targetSeat: 1,
    priorColor: "blaze",
    chosenColor: "tide"
  });
  assert.equal(JSON.stringify(view).includes("sourceHadPriorColor"), false, "The secret challenge result must stay server-side");

  const called = structuredClone(match);
  engine.callJuan(called, 0);
  assert.equal(called.players[0].juan, true);
  assert.equal(called.pendingJuan, null);
  assert.ok(called.pendingPrismBurst, "calling JUAN does not resolve the separate Burst decision");

  const caught = structuredClone(match);
  engine.catchJuan(caught, 1);
  assert.equal(caught.players[0].hand.length, 3);
  assert.equal(caught.pendingJuan, null);
  assert.ok(caught.pendingPrismBurst, "catching JUAN does not resolve the separate Burst decision");

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
  const next = engine.nextRound(match);
  assert.equal(next.pendingPrismBurst, null);
  assert.equal(next.round, 2);
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

test("JUAN ends a round when a hand empties and scores every card still held", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["blaze-7-a"], ["spark-double-draw", "spark-1-a"], ["prism-2"]]
  });
  engine.play(match, 0, "blaze-7-a");
  assert.equal(match.roundOver, true);
  assert.equal(match.matchOver, false);
  assert.equal(match.phase, "round-complete");
  assert.deepEqual(match.placements, [0, 2, 1]);
  assert.equal(match.roundWinnerSeat, 0);
  assert.equal(match.roundPoints, 45);
  assert.equal(match.players[0].score, 45);
  assert.match(match.lastMoveText, /wins Round 1/);
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

test("JUAN CPUs expose a counter window before calling and announce a successful call", () => {
  let now = 10_000;
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, now: () => now, botJuanCallDelayMs: 2_600 });
  const makeMatch = () => setTable(engine.createMatch([bot(0, "Juno"), human(1, "Host")]), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a", "grove-1-a"]],
    activeSeat: 0,
    stock: ["spark-2-a", "spark-3-a"]
  });

  const caught = makeMatch();
  assert.equal(engine.runBotTurn(caught), true);
  assert.equal(caught.players[0].juan, false);
  assert.equal(caught.pendingJuan.seat, 0);
  assert.equal(caught.pendingJuan.botCallAt, 12_600);
  assert.equal(caught.activeSeat, 1);
  assert.equal(engine.runBotTurn(caught), false, "the bot cannot call before its public deadline");
  engine.catchJuan(caught, 1);
  assert.equal(caught.players[0].hand.length, 3);
  assert.equal(caught.pendingJuan, null);

  const called = makeMatch();
  engine.runBotTurn(called);
  assert.equal(engine.nextBotActionDelay(called), 2_600);
  now = 12_599;
  assert.equal(engine.runBotTurn(called), false);
  assert.equal(engine.nextBotActionDelay(called), 1);
  now = 12_600;
  assert.equal(engine.runBotTurn(called), true);
  assert.equal(called.players[0].juan, true);
  assert.equal(called.pendingJuan, null);
  assert.deepEqual(called.lastJuanCall, { id: "1:1", seat: 0, calledAt: 12_600 });
  assert.match(called.lastMoveText, /Juno called JUAN!/);
});

test("JUAN runtime schedules a saved CPU call deadline even during a human turn", () => {
  let now = 2_000;
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, now: () => now, botJuanCallDelayMs: 2_600 });
  const match = setTable(engine.createMatch([bot(0, "Juno"), human(1, "Host")]), {
    hands: [["blaze-7-a", "tide-1-a"], ["spark-1-a", "grove-1-a"]], activeSeat: 0
  });
  engine.runBotTurn(match);
  const runtime = new JuanRuntime({ matchEngine: engine, restoredMatches: [{ gameId: "juan", code: "CALL", state: match }] });
  assert.equal(runtime.nextActionDelay("CALL"), 2_600);
  now = 4_600;
  assert.equal(runtime.runScheduledStep("CALL"), true);
  assert.equal(runtime.snapshot("CALL").lastJuanCall.seat, 0);
  assert.equal(runtime.nextActionDelay("CALL"), null);
});

test("JUAN randomizes its initial opener once and rotates that origin through later rounds", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 2 });
  let match = engine.createMatch([human(0, "One"), human(1, "Two"), human(2, "Three"), human(3, "Four")]);
  assert.equal(match.initialOriginSeat, 2);
  assert.equal(match.roundOpeningSeat, 2);
  assert.equal(match.activeSeat, 2);

  for (const expectedSeat of [3, 0, 1]) {
    setTable(match, {
      hands: [["blaze-1-a"], ["spark-1-a"], ["grove-1-a"], ["tide-1-a"]],
      activeSeat: match.roundOpeningSeat
    });
    const winner = match.players.find((player) => player.seat === match.activeSeat);
    winner.hand = [card("blaze-7-a")];
    match.activeColor = "blaze";
    engine.play(match, winner.seat, "blaze-7-a");
    match = engine.nextRound(match);
    assert.equal(match.initialOriginSeat, 2);
    assert.equal(match.roundOpeningSeat, expectedSeat);
    assert.equal(match.activeSeat, expectedSeat);
  }
  assert.equal(match.round, TOTAL_ROUNDS);
});

test("JUAN carries and accumulates scores through four rounds and deliberately supports a tied match", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 0 });
  let match = engine.createMatch([human(0, "One"), human(1, "Two")]);
  const rounds = [
    { winnerSeat: 0, loserCard: "spark-1-a", score: [2, 0] },
    { winnerSeat: 1, loserCard: "spark-2-a", score: [2, 3] },
    { winnerSeat: 0, loserCard: "spark-3-a", score: [6, 3] },
    { winnerSeat: 1, loserCard: "spark-2-b", score: [6, 6] }
  ];

  for (const [index, expected] of rounds.entries()) {
    const hands = match.players.map((player) => player.seat === expected.winnerSeat ? ["blaze-7-a"] : [expected.loserCard]);
    setTable(match, { hands, activeSeat: expected.winnerSeat });
    engine.play(match, expected.winnerSeat, "blaze-7-a");
    assert.deepEqual(match.players.map((player) => player.score), expected.score);
    assert.equal(match.roundOver, true);
    assert.equal(match.matchOver, index === TOTAL_ROUNDS - 1);
    if (index < TOTAL_ROUNDS - 1) match = engine.nextRound(match);
  }

  assert.equal(match.round, TOTAL_ROUNDS);
  assert.equal(match.phase, "complete");
  assert.equal(match.winnerSeat, null);
  assert.deepEqual(match.winnerSeats, [0, 1]);
  assert.deepEqual(match.winners, [0, 1]);
  assert.match(match.lastMoveText, /share the JUAN win/);
  assertGameError(() => engine.nextRound(match), "MATCH_COMPLETE");
});

test("JUAN awards the match to the highest cumulative score, not merely the Round 4 winner", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 0 });
  const match = engine.createMatch([human(0, "One"), human(1, "Two")], {
    round: TOTAL_ROUNDS,
    carryScores: new Map([[0, 10], [1, 4]]),
    initialOriginSeat: 0
  });
  setTable(match, { hands: [["spark-1-a"], ["blaze-7-a"]], activeSeat: 1 });
  engine.play(match, 1, "blaze-7-a");
  assert.deepEqual(match.players.map((player) => player.score), [10, 6]);
  assert.equal(match.roundWinnerSeat, 1);
  assert.equal(match.winnerSeat, 0);
  assert.deepEqual(match.winnerSeats, [0]);
  assert.deepEqual(match.finalStandings, [0, 1]);
});

test("a JUAN next round resets all round-local state while preserving identity, CPU ownership, score, and Hot Seat flow", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 0 });
  const match = engine.createMatch([human(0, "Host"), bot(1, "Juno"), human(2, "Guest")]);
  setTable(match, {
    hands: [["blaze-7-a"], ["spark-1-a"], ["grove-1-a"]],
    activeSeat: 0
  });
  match.direction = -1;
  match.drawnCardId = "blaze-7-a";
  match.drawnSeat = 0;
  match.pendingJuan = { seat: 2 };
  match.players[2].juan = true;
  match.lastJuanCall = { id: "1:9", seat: 2, calledAt: 123 };
  engine.play(match, 0, "blaze-7-a");
  assert.equal(match.pendingJuan, null);
  const next = engine.nextRound(match);

  assert.equal(next.round, 2);
  assert.equal(next.direction, 1);
  assert.equal(next.drawnCardId, null);
  assert.equal(next.drawnSeat, null);
  assert.equal(next.pendingJuan, null);
  assert.equal(next.pendingPrismBurst, null);
  assert.equal(next.lastJuanCall, null);
  assert.ok(next.players.every((player) => player.juan === false));
  assert.deepEqual(next.placements, []);
  assert.equal(next.players[1].type, "bot");
  assert.equal(next.players[0].score, match.players[0].score);
  assert.equal(next.players[0].name, "Host");
  assert.equal(next.activeSeat, 1);

  assert.equal(engine.runBotTurn(next), true);
  assert.equal(hotSeatFlow.requiredSeat(next, [
    { seat: 0, role: "host" },
    { seat: 2, role: "guest" }
  ]), next.activeSeat === 2 ? 2 : null);
});

test("JUAN snapshots restore unchanged during, between, and after rounds, including established order and scores", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 1 });
  const during = engine.createMatch([human(0, "Host"), human(1, "Guest")]);
  during.players[0].score = 8;
  const restore = (code, state) => new JuanRuntime({
    matchEngine: new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 0 }),
    restoredMatches: [{ gameId: "juan", code, state }]
  });
  assert.deepEqual(restore("DURING", during).snapshot("DURING"), during);

  setTable(during, { hands: [["blaze-7-a"], ["spark-1-a"]], activeSeat: 0 });
  engine.play(during, 0, "blaze-7-a");
  const between = restore("BETWEEN", during);
  assert.deepEqual(between.snapshot("BETWEEN"), during);
  assert.equal(between.snapshot("BETWEEN").matchOver, false);

  const final = engine.createMatch([human(0, "Host"), human(1, "Guest")], {
    round: TOTAL_ROUNDS,
    carryScores: new Map([[0, 8], [1, 2]]),
    initialOriginSeat: 1
  });
  setTable(final, { hands: [["blaze-7-a"], ["spark-1-a"]], activeSeat: 0 });
  engine.play(final, 0, "blaze-7-a");
  assert.deepEqual(restore("FINAL", final).snapshot("FINAL"), final);
  assert.equal(final.matchOver, true);
});

test("only the JUAN host can advance a completed round", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle, randomIndex: () => 0 });
  const match = engine.createMatch([human(0, "Host"), human(1, "Guest")]);
  setTable(match, { hands: [["blaze-7-a"], ["spark-1-a"]], activeSeat: 0 });
  engine.play(match, 0, "blaze-7-a");
  const runtime = new JuanRuntime({ restoredMatches: [{ gameId: "juan", code: "ROUND", state: match }], matchEngine: engine });
  const roomFor = (seat, role) => ({ code: "ROUND", players: [{ seat, role, isYou: true, connected: true }] });
  assertGameError(() => runtime.act(roomFor(1, "guest"), { type: "next_round" }), "HOST_ONLY");
  runtime.act(roomFor(0, "host"), { type: "next_round" });
  assert.equal(runtime.snapshot("ROUND").round, 2);
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
