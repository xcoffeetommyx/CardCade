import assert from "node:assert/strict";
import test from "node:test";
import rules from "../shared/thirteen-rules.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/thirteen/match-engine.js";
import { ThirteenRuntime } from "../server/src/games/thirteen/runtime.js";

const { getLegalMoves, TOTAL_ROUNDS, finalStandings, finalWinners } = rules;
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name, style = "steady") => ({ seat, name, type: "bot", style });
const identityShuffle = (deck) => deck.slice();
const fullTable = () => [human(0, "One"), human(1, "Two"), human(2, "Three"), human(3, "Four")];

test("Thirteen deals thirteen shared standard cards to every occupied seat", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch(fullTable());
  assert.equal(match.players.length, 4);
  assert.ok(match.players.every((player) => player.hand.length === 13));
  assert.equal(match.activeSeat, 0);
  assert.equal(match.openingRequired, true);
  assert.equal(match.totalRounds, TOTAL_ROUNDS);
  assert.ok(match.players[0].hand.some((card) => card.id === "3S"));
  assert.ok(match.players.flatMap((player) => player.hand).every((card) => !("rankValue" in card)));
});

test("Thirteen private projections expose only the requesting hand", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch(fullTable());
  const view = engine.viewFor(match, 0, new Map([[0, true], [1, true], [2, true], [3, true]]));
  const serialized = JSON.stringify(view);
  const otherCardIds = match.players[1].hand.map((card) => card.id);
  assert.equal(view.hand.length, 13);
  assert.ok(view.hand.every((card) => card.suit === "S"));
  assert.ok(view.state.players.every((player) => !Object.hasOwn(player, "hand")));
  for (const cardId of otherCardIds) assert.equal(serialized.includes(`"${cardId}"`), false, `Leaked opponent card ${cardId}`);
});

test("Thirteen rejects out-of-turn, unowned, invalid-opening, and open-pile pass actions", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch(fullTable());
  assertGameError(() => engine.play(match, 1, ["3C"]), "NOT_YOUR_TURN");
  assertGameError(() => engine.play(match, 0, ["3C"]), "CARD_NOT_OWNED");
  assertGameError(() => engine.play(match, 0, ["4S"]), "OPENING_CARD_REQUIRED");
  assertGameError(() => engine.pass(match, 0), "CANNOT_PASS_OPEN_PILE");
  engine.play(match, 0, ["3S"]);
  assert.equal(match.openingRequired, false);
  assert.equal(match.activeSeat, 1);
  assert.equal(match.currentLead.cards[0].id, "3S");
});

test("Thirteen resolves bot turns one at a time", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(0, "Host"), human(1, "Guest"), bot(2, "Linh"), bot(3, "Bao")]);
  engine.play(match, 0, ["3S"]);
  engine.play(match, 1, ["3C"]);
  assert.equal(match.players.find((player) => player.seat === match.activeSeat).type, "bot");
  assert.equal(engine.runBotTurn(match), true);
  assert.ok(match.players.find((player) => player.seat === 2).lastPlay);
  assert.equal(match.players.find((player) => player.seat === 3).lastPlay, null);
  engine.runBots(match);
  assert.ok(match.roundOver || match.players.find((player) => player.seat === match.activeSeat).type === "human");
});

test("Thirteen converts a departing human seat to a bot without losing its hand", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch(fullTable());
  assert.equal(engine.replaceWithBot(match, 1), true);
  const replacement = match.players.find((player) => player.seat === 1);
  assert.equal(replacement.type, "bot");
  assert.equal(replacement.style, "steady");
  assert.match(replacement.name, /Two · Bot/);
  assert.equal(replacement.hand.length, 13);
});

test("Thirteen completes a deterministic authoritative round with source scoring", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch(fullTable());
  const actions = playRoundToEnd(engine, match);
  assert.equal(match.roundOver, true);
  assert.equal(match.matchOver, false);
  assert.equal(match.phase, "complete");
  assert.equal(match.placements.length, 4);
  assert.equal(new Set(match.placements).size, 4);
  assert.deepEqual(match.placements.map((seat) => match.players.find((player) => player.seat === seat).score), [3, 1, 0, -2]);
  assert.ok(actions < 500);
});

test("Thirteen carries running scores into later deals", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const carried = engine.createMatch(fullTable(), { carryScores: new Map([[0, 3], [1, -2], [2, 1], [3, 0]]), round: 2 });
  assert.deepEqual(carried.players.map((player) => player.score), [3, -2, 1, 0]);
  assert.ok(carried.players.every((player) => player.hand.length === 13));
  assert.equal(carried.round, 2);
  assert.equal(carried.roundOver, false);
});

test("Thirteen ends after four scored rounds and publishes the final standings", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const players = fullTable();
  let match = engine.createMatch(players);

  for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
    playRoundToEnd(engine, match);
    if (round === TOTAL_ROUNDS) break;

    const carryScores = new Map(match.players.map((player) => [player.seat, player.score]));
    const carryPlacements = new Map(match.players.map((player) => [player.seat, player.placementHistory]));
    match = engine.createMatch(players, { carryScores, carryPlacements, round: round + 1 });
    assert.equal(match.matchOver, false);
  }

  assert.equal(match.round, TOTAL_ROUNDS);
  assert.equal(match.roundOver, true);
  assert.equal(match.matchOver, true);
  assert.ok(match.players.every((player) => player.placementHistory.length === TOTAL_ROUNDS));
  assert.deepEqual(match.finalStandings, finalStandings(match.players).map((player) => player.seat));
  assert.deepEqual(match.winners, finalWinners(match.players).map((player) => player.seat));
  assert.match(match.lastMoveText, /Thirteen/);

  const view = engine.viewFor(match, 0, new Map([[0, true], [1, true], [2, true], [3, true]]));
  assert.equal(view.state.totalRounds, TOTAL_ROUNDS);
  assert.equal(view.state.matchOver, true);
  assert.deepEqual(view.state.finalStandings, match.finalStandings);

  const runtime = new ThirteenRuntime({
    restoredMatches: [{ gameId: "thirteen", code: "END13", state: match }]
  });
  assertGameError(() => runtime.act({
    code: "END13",
    players: [{ seat: 0, isYou: true, role: "host" }]
  }, { type: "next_round" }), "MATCH_COMPLETE");
  assertGameError(() => engine.createMatch(players, { round: TOTAL_ROUNDS + 1 }), "INVALID_ROUND");
});

test("Thirteen publishes only each seat's already-played cards", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch(fullTable());
  engine.play(match, 0, ["3S"]);
  engine.pass(match, 1);
  const view = engine.viewFor(match, 0, new Map([[0, true], [1, true], [2, true], [3, true]]));
  const seatZero = view.state.players.find((player) => player.seat === 0);
  const seatOne = view.state.players.find((player) => player.seat === 1);
  assert.deepEqual(seatZero.lastPlay.cards.map((card) => card.id), ["3S"]);
  assert.equal(seatZero.lastPlayedCard.id, "3S");
  assert.equal(seatOne.lastPlay.kind, "pass");
  assert.equal(seatOne.lastPlayedCard, null);
  const serialized = JSON.stringify(view);
  for (const card of match.players[1].hand) assert.equal(serialized.includes(`"${card.id}"`), false, `Leaked opponent card ${card.id}`);
  seatZero.lastPlay.cards[0].rank = "TAMPERED";
  assert.equal(match.players[0].lastPlay.cards[0].rank, "3");
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}

function playRoundToEnd(engine, match) {
  let actions = 0;
  while (!match.roundOver && actions < 500) {
    const player = match.players.find((candidate) => candidate.seat === match.activeSeat);
    const moves = getLegalMoves(player.hand, match.currentLead?.combo || null, match.openingRequired);
    if (moves.length) {
      const move = moves.find((candidate) => candidate.count === player.hand.length) || moves[0];
      engine.play(match, player.seat, move.cards.map((card) => card.id));
    } else {
      engine.pass(match, player.seat);
    }
    actions += 1;
  }
  assert.ok(actions < 500, "Thirteen should finish within the action limit");
  return actions;
}
