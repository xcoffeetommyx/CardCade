import assert from "node:assert/strict";
import test from "node:test";
import content from "../shared/finders-makers-content.js";
import { GameError } from "../server/src/game-error.js";
import { NORMAL_BOARD, SUDDEN_DEATH_BOARD } from "../server/src/games/finders-makers/board-generator.js";
import { MatchEngine, NORMAL_ROUNDS } from "../server/src/games/finders-makers/match-engine.js";

const players = [
  { seat: 0, name: "Ada", type: "human" },
  { seat: 1, name: "Bea", type: "human" }
];

function deterministicBoard({ builds, layout }) {
  const required = [...new Set(builds.flatMap((build) => build.pieceIds))];
  const filler = content.PIECES.map((piece) => piece.id);
  const pieceIds = [...required];
  let index = 0;
  while (pieceIds.length < layout.cardCount) {
    pieceIds.push(filler[index % filler.length]);
    index += 1;
  }
  return pieceIds.map((pieceId, position) => ({ position, pieceId }));
}

function engine({ selectBotPosition = (positions) => positions[0] } = {}) {
  return new MatchEngine({
    generatePieceBoard: deterministicBoard,
    selectBuild: (builds) => builds[0],
    selectBotPosition
  });
}

function matchFor(buildIds = ["cake", "sundae"]) {
  return engine().createMatch(players, { buildIds });
}

function putPiecesAtFront(match, pieceIds) {
  const fillers = content.PIECES.map((piece) => piece.id);
  const all = [...pieceIds];
  let index = 0;
  while (all.length < match.layout.cardCount) {
    all.push(fillers[index % fillers.length]);
    index += 1;
  }
  match.board = all.map((pieceId, position) => ({ position, pieceId }));
}

function moveTurnTo(game, match, seat) {
  if (match.activeSeat === seat) return;
  game.search(match, match.activeSeat, match.board.length - 1);
  assert.equal(match.activeSeat, seat);
}

function winRound(game, match, seat) {
  moveTurnTo(game, match, seat);
  const buildId = match.buildIds[String(seat)];
  putPiecesAtFront(match, content.buildById(buildId).pieceIds);
  game.beginBuild(match, seat);
  game.attemptBuild(match, seat, [0, 1, 2]);
}

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}

test("Search preserves the face-down board and reveals a Piece only in the searching player's projection", () => {
  const game = engine();
  const match = matchFor();
  const before = structuredClone(match.board);
  const searchedPieceId = match.board[0].pieceId;

  game.search(match, 0, 0);

  assert.deepEqual(match.board, before, "Search must never collect or alter a Piece");
  assert.equal(match.activeSeat, 1);
  const ownerView = game.viewFor(match, 0, new Map([[0, true], [1, true]]));
  const opponentView = game.viewFor(match, 1, new Map([[0, true], [1, true]]));
  assert.equal(ownerView.privateSearch.piece.id, searchedPieceId);
  assert.equal(opponentView.privateSearch, null);
  assert.equal(opponentView.state.latestSearch.position, 0, "The inspected position is public");
  assert.equal(opponentView.state.board[0].pieceId, undefined, "The board projection must never contain a Piece identity");
  assert.doesNotMatch(JSON.stringify(opponentView), /privateDiscoveries|pieceId/);
});

test("normal-round Builds are private and player-specific while the public state has no objective identities", () => {
  const game = engine();
  const match = game.createMatch(players, { buildIds: ["cake", "sundae"] });
  const firstView = game.viewFor(match, 0);
  const secondView = game.viewFor(match, 1);

  assert.equal(firstView.ownBuild.id, "cake");
  assert.equal(secondView.ownBuild.id, "sundae");
  assert.equal(firstView.state.sharedBuild, null);
  assert.equal(secondView.state.sharedBuild, null);
  assert.doesNotMatch(JSON.stringify(firstView.state), /cake|sundae|buildIds/);
  assert.doesNotMatch(JSON.stringify(secondView.state), /cake|sundae|buildIds/);
});

test("Build validation requires the exact three Pieces, and a failed Build neither wins nor collects cards", () => {
  const game = engine();
  const match = matchFor(["cake", "sundae"]);
  putPiecesAtFront(match, ["plate", "cake", "star"]);

  game.beginBuild(match, 0);
  assertGameError(() => game.attemptBuild(match, 0, [0, 0, 1]), "DUPLICATE_BOARD_POSITION");
  assertGameError(() => game.attemptBuild(match, 0, [0, 1]), "BUILD_CARD_COUNT");
  game.attemptBuild(match, 0, [0, 1, 2]);

  assert.equal(match.players[0].score, 0);
  assert.equal(match.roundWinnerSeat, null);
  assert.equal(match.roundOver, false);
  assert.equal(match.lastBuildAttempt.result, "failed");
  assert.equal(match.activeSeat, 1);
  assert.equal(match.board[0].pieceId, "plate", "Failed attempts leave all Pieces face down and on the board");

  game.search(match, 1, 3);
  putPiecesAtFront(match, ["plate", "cake", "topper"]);
  game.beginBuild(match, 0);
  game.attemptBuild(match, 0, [0, 1, 2]);

  assert.equal(match.players[0].score, 1);
  assert.equal(match.roundWinnerSeat, 0);
  assert.equal(match.roundOver, true);
  assert.equal(match.phase, "round-result");
});

test("the CPU searches from only its own private map, then commits a Build it has found", () => {
  const game = engine();
  const match = game.createMatch([
    { seat: 0, name: "Ada", type: "human" },
    { seat: 1, name: "Scout", type: "bot" }
  ], { buildIds: ["cake", "sundae"] });
  putPiecesAtFront(match, ["bowl", "ice-cream", "cherry"]);

  // Ada's private discoveries deliberately contain every Piece Scout needs.
  // Scout must still search instead of using another player's hidden map.
  match.privateDiscoveries["0"] = [
    { id: 1, position: 0, pieceId: "bowl" },
    { id: 2, position: 1, pieceId: "ice-cream" },
    { id: 3, position: 2, pieceId: "cherry" }
  ];
  game.search(match, 0, 11);
  assert.equal(match.activeSeat, 1);

  assert.equal(game.runBotTurn(match), true);
  assert.equal(match.turnMode, "choose");
  assert.equal(match.lastBuildAttempt, null);
  assert.equal(match.activeSeat, 0);
  assert.equal(match.privateDiscoveries["1"].length, 1);

  game.search(match, 0, 11);
  match.privateDiscoveries["1"] = [
    { id: 4, position: 0, pieceId: "bowl" },
    { id: 5, position: 1, pieceId: "ice-cream" },
    { id: 6, position: 2, pieceId: "cherry" }
  ];

  assert.equal(game.runBotTurn(match), true, "the CPU first announces its Build attempt");
  assert.equal(match.activeSeat, 1);
  assert.equal(match.turnMode, "build");
  assert.equal(game.runBotTurn(match), true, "the next paced CPU turn commits the known Pieces");
  assert.equal(match.roundWinnerSeat, 1);
  assert.equal(match.players[1].score, 1);
  assert.equal(match.phase, "round-result");
});

test("a departing player becomes a CPU without carrying over their private discoveries", () => {
  const game = engine();
  const match = matchFor(["cake", "sundae"]);
  match.activeSeat = 1;
  match.turnMode = "build";
  match.privateDiscoveries["1"] = [
    { id: 1, position: 0, pieceId: "bowl" },
    { id: 2, position: 1, pieceId: "ice-cream" },
    { id: 3, position: 2, pieceId: "cherry" }
  ];

  assert.equal(game.replaceWithBot(match, 1), true);
  assert.equal(match.players[1].type, "bot");
  assert.deepEqual(match.privateDiscoveries["1"], []);
  assert.equal(match.turnMode, "choose");

  assert.equal(game.runBotTurn(match), true);
  assert.equal(match.lastBuildAttempt, null);
  assert.equal(match.activeSeat, 0);
});

test("four normal rounds at 2–2 transition to a fresh shared Sudden Death board, whose success ends the match", () => {
  const game = engine();
  let match = matchFor(["cake", "sundae"]);
  const winners = [0, 1, 0, 1];

  for (const winner of winners) {
    winRound(game, match, winner);
    if (match.round < NORMAL_ROUNDS) match = game.nextRound(match, { buildIds: ["cake", "sundae"] });
  }

  assert.equal(match.round, 4);
  assert.deepEqual(match.players.map((player) => player.score), [2, 2]);
  assert.equal(match.phase, "sudden-death-intro");
  assert.equal(match.suddenDeath, true);
  assert.equal(match.matchOver, false);

  game.startSuddenDeath(match, { buildId: "pizza" });
  assert.equal(match.phase, "playing");
  assert.equal(match.suddenDeath, true);
  assert.equal(match.board.length, SUDDEN_DEATH_BOARD.cardCount);
  assert.deepEqual(match.layout, SUDDEN_DEATH_BOARD);
  const firstView = game.viewFor(match, 0);
  const secondView = game.viewFor(match, 1);
  assert.equal(firstView.ownBuild, null);
  assert.equal(secondView.ownBuild, null);
  assert.equal(firstView.state.sharedBuild.id, "pizza");
  assert.equal(secondView.state.sharedBuild.id, "pizza");

  const suddenWinner = match.activeSeat;
  putPiecesAtFront(match, ["pan", "pizza", "topping"]);
  game.beginBuild(match, suddenWinner);
  game.attemptBuild(match, suddenWinner, [0, 1, 2]);
  assert.equal(match.matchOver, true);
  assert.equal(match.phase, "complete");
  assert.equal(match.matchWinnerSeat, suddenWinner);
});

test("a non-tied score after Round 4 completes the normal match", () => {
  const game = engine();
  let match = matchFor(["cake", "sundae"]);
  for (const winner of [0, 1, 0, 0]) {
    winRound(game, match, winner);
    if (!match.matchOver) match = game.nextRound(match, { buildIds: ["cake", "sundae"] });
  }
  assert.deepEqual(match.players.map((player) => player.score), [3, 1]);
  assert.equal(match.matchOver, true);
  assert.equal(match.phase, "complete");
  assert.equal(match.matchWinnerSeat, 0);
  assert.equal(match.suddenDeath, false);
  assert.deepEqual(match.layout, NORMAL_BOARD);
});
