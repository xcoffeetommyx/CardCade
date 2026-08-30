import { randomInt } from "node:crypto";
import content from "../../../../shared/finders-makers-content.js";
import { GameError } from "../../game-error.js";
import { NORMAL_BOARD, SUDDEN_DEATH_BOARD, assertBoardContains, generateBoard, requiredPiecesFor } from "./board-generator.js";

export const NORMAL_ROUNDS = 4;
const PLAYER_COUNT = 2;

export class MatchEngine {
  constructor({
    generatePieceBoard = generateBoard,
    selectBuild = secureBuildChoice
  } = {}) {
    this.generatePieceBoard = generatePieceBoard;
    this.selectBuild = selectBuild;
  }

  createMatch(roomPlayers, { buildIds = null } = {}) {
    const players = createPlayers(roomPlayers);
    return this.#createNormalRound(players, { round: 1, buildIds });
  }

  search(match, seat, position) {
    const player = requireActivePlayer(match, seat, "choose");
    const card = cardAt(match, position);
    const discovery = {
      id: (match.searchCounter || 0) + 1,
      position: card.position,
      pieceId: card.pieceId
    };
    match.searchCounter = discovery.id;
    match.privateDiscoveries[String(player.seat)].push(discovery);
    match.latestSearch = { seat: player.seat, position: card.position, id: discovery.id };
    match.lastBuildAttempt = null;
    match.lastMoveText = `${player.name} searched a face-down Piece.`;
    match.log.unshift(match.lastMoveText);
    advanceTurn(match, player.seat);
    return match;
  }

  beginBuild(match, seat) {
    const player = requireActivePlayer(match, seat, "choose");
    match.turnMode = "build";
    match.lastBuildAttempt = null;
    match.lastMoveText = `${player.name} is committing to a Build attempt.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  cancelBuild(match, seat) {
    const player = requireActivePlayer(match, seat, "build");
    match.turnMode = "choose";
    match.lastMoveText = `${player.name} stepped back from the Build attempt.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  attemptBuild(match, seat, positions) {
    const player = requireActivePlayer(match, seat, "build");
    const selectedCards = cardsAt(match, positions);
    const build = buildForPlayer(match, player.seat);
    const selectedPieceIds = selectedCards.map((card) => card.pieceId);
    const success = samePieces(selectedPieceIds, build.pieceIds);
    match.lastBuildAttempt = {
      seat: player.seat,
      positions: selectedCards.map((card) => card.position),
      result: success ? "success" : "failed"
    };

    if (success) {
      if (match.suddenDeath) finishSuddenDeath(match, player);
      else finishNormalRound(match, player);
      return match;
    }

    match.turnMode = "choose";
    match.lastMoveText = `${player.name}'s Build attempt did not fit.`;
    match.log.unshift(match.lastMoveText);
    advanceTurn(match, player.seat);
    return match;
  }

  nextRound(match, { buildIds = null } = {}) {
    if (!match?.roundOver || match.phase !== "round-result" || match.suddenDeath) {
      throw new GameError("Finish the current normal round before dealing a new one.", "ROUND_IN_PROGRESS", 409);
    }
    if (match.matchOver || match.round >= NORMAL_ROUNDS) {
      throw new GameError("This Finders Makers match is complete.", "MATCH_COMPLETE", 409);
    }
    return this.#createNormalRound(match.players, { round: match.round + 1, buildIds });
  }

  startSuddenDeath(match, { buildId = null } = {}) {
    if (!match || match.phase !== "sudden-death-intro" || !match.suddenDeath || match.matchOver) {
      throw new GameError("Sudden Death is not ready to start.", "SUDDEN_DEATH_NOT_READY", 409);
    }
    const selectedBuild = buildId ? requireBuild(buildId) : this.selectBuild(content.BUILDS);
    const sharedBuild = requireBuild(selectedBuild?.id);
    const board = generatedBoard(this.generatePieceBoard, [sharedBuild], SUDDEN_DEATH_BOARD);
    resetForRound(match, {
      board,
      layout: SUDDEN_DEATH_BOARD,
      activeSeat: openingSeat(match.players, match.round),
      sharedBuildId: sharedBuild.id,
      buildIds: null,
      suddenDeath: true,
      phase: "playing"
    });
    match.lastMoveText = `Sudden Death: both players must build ${sharedBuild.name}.`;
    match.log = [match.lastMoveText];
    return match;
  }

  runBotTurn() {
    return false;
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = requirePlayer(match, seat);
    const ownBuild = match.suddenDeath ? null : content.projectBuild(buildForPlayer(match, viewer.seat));
    const sharedBuild = match.suddenDeath && match.sharedBuildId
      ? content.projectBuild(requireBuild(match.sharedBuildId))
      : null;
    const discoveries = match.privateDiscoveries[String(viewer.seat)] || [];
    const latestDiscovery = discoveries.at(-1) || null;

    return {
      type: "finders_makers_match_state",
      state: {
        phase: match.phase,
        round: match.round,
        normalRounds: NORMAL_ROUNDS,
        suddenDeath: match.suddenDeath,
        activeSeat: match.activeSeat,
        turnMode: match.turnMode,
        grid: { ...match.layout },
        // Deliberately omit pieceId. Board identities never leave the
        // authoritative match state through this public projection.
        board: match.board.map((card) => ({ position: card.position })),
        players: match.players.map((player) => ({
          seat: player.seat,
          name: player.name,
          avatar: player.avatar,
          score: player.score,
          type: player.type,
          connected: connections.get(player.seat) === true
        })),
        latestSearch: match.latestSearch ? { ...match.latestSearch } : null,
        lastBuildAttempt: match.lastBuildAttempt ? {
          seat: match.lastBuildAttempt.seat,
          positions: [...match.lastBuildAttempt.positions],
          result: match.lastBuildAttempt.result
        } : null,
        roundWinnerSeat: match.roundWinnerSeat,
        matchWinnerSeat: match.matchWinnerSeat,
        roundOver: match.roundOver,
        matchOver: match.matchOver,
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 12),
        sharedBuild
      },
      ownBuild,
      // This is the only location a searched Piece identity is projected.
      // It belongs solely to the viewing player's own most recent Search.
      privateSearch: latestDiscovery ? {
        id: latestDiscovery.id,
        position: latestDiscovery.position,
        piece: content.projectPiece(latestDiscovery.pieceId)
      } : null
    };
  }

  #createNormalRound(players, { round, buildIds }) {
    const normalizedPlayers = players.map((player) => ({ ...player }));
    const builds = selectNormalBuilds(buildIds, this.selectBuild);
    const board = generatedBoard(this.generatePieceBoard, builds, NORMAL_BOARD);
    const match = {
      round,
      normalRounds: NORMAL_ROUNDS,
      phase: "playing",
      suddenDeath: false,
      layout: { ...NORMAL_BOARD },
      board,
      buildIds: Object.fromEntries(normalizedPlayers.map((player, index) => [player.seat, builds[index].id])),
      sharedBuildId: null,
      players: normalizedPlayers,
      activeSeat: openingSeat(normalizedPlayers, round),
      turnMode: "choose",
      privateDiscoveries: privateDiscoveryMap(normalizedPlayers),
      searchCounter: 0,
      latestSearch: null,
      lastBuildAttempt: null,
      roundWinnerSeat: null,
      matchWinnerSeat: null,
      roundOver: false,
      matchOver: false,
      lastMoveText: `Round ${round}: ${playerAt(normalizedPlayers, openingSeat(normalizedPlayers, round)).name} searches first.`,
      log: []
    };
    match.log.push(match.lastMoveText);
    return match;
  }
}

function createPlayers(roomPlayers) {
  if (!Array.isArray(roomPlayers) || roomPlayers.length !== PLAYER_COUNT) {
    throw new GameError("Finders Makers requires exactly two players.", "INVALID_PLAYER_COUNT");
  }
  const seats = new Set();
  const players = roomPlayers
    .slice()
    .sort((left, right) => Number(left.seat) - Number(right.seat))
    .map((player) => {
      const seat = Number(player.seat);
      if (!Number.isInteger(seat) || seats.has(seat)) throw new GameError("Finders Makers needs two distinct seats.", "INVALID_PLAYER_COUNT");
      seats.add(seat);
      return {
        seat,
        name: String(player.name || `Player ${seat + 1}`),
        avatar: initialsForName(player.name, `P${seat + 1}`),
        type: player.type === "bot" ? "bot" : "human",
        score: Number.isInteger(player.score) ? player.score : 0
      };
    });
  return players;
}

function selectNormalBuilds(buildIds, selectBuild) {
  if (buildIds !== null && buildIds !== undefined) {
    if (!Array.isArray(buildIds) || buildIds.length !== PLAYER_COUNT || new Set(buildIds).size !== PLAYER_COUNT) {
      throw new GameError("Normal Finders Makers rounds need two distinct Builds.", "INVALID_BUILD_SELECTION", 500);
    }
    return buildIds.map(requireBuild);
  }
  const first = selectBuild(content.BUILDS);
  const second = selectBuild(content.BUILDS.filter((build) => build.id !== first.id));
  if (!first || !second || first.id === second.id) throw new GameError("Finders Makers could not select two Builds.", "BUILD_SELECTION_FAILED", 500);
  return [first, second];
}

function requireBuild(buildId) {
  const build = content.buildById(buildId);
  if (!build) throw new GameError("That Finders Makers Build does not exist.", "BUILD_NOT_FOUND", 404);
  if (build.pieceIds.length !== 3) throw new GameError("Finders Makers Builds must use exactly three Pieces.", "INVALID_BUILD", 500);
  return build;
}

function buildForPlayer(match, seat) {
  const buildId = match.suddenDeath ? match.sharedBuildId : match.buildIds?.[String(seat)];
  return requireBuild(buildId);
}

function resetForRound(match, { board, layout, activeSeat, sharedBuildId, buildIds, suddenDeath, phase }) {
  match.phase = phase;
  match.suddenDeath = suddenDeath;
  match.layout = { ...layout };
  match.board = board;
  match.buildIds = buildIds;
  match.sharedBuildId = sharedBuildId;
  match.activeSeat = activeSeat;
  match.turnMode = "choose";
  match.privateDiscoveries = privateDiscoveryMap(match.players);
  match.searchCounter = 0;
  match.latestSearch = null;
  match.lastBuildAttempt = null;
  match.roundWinnerSeat = null;
  match.roundOver = false;
  match.matchOver = false;
  match.matchWinnerSeat = null;
}

function finishNormalRound(match, winner) {
  winner.score += 1;
  match.roundWinnerSeat = winner.seat;
  match.roundOver = true;
  match.activeSeat = null;
  match.turnMode = "complete";
  match.lastMoveText = `${winner.name} built ${buildForPlayer(match, winner.seat).name} and wins Round ${match.round}.`;
  match.log.unshift(match.lastMoveText);

  if (match.round < NORMAL_ROUNDS) {
    match.phase = "round-result";
    return;
  }

  const [first, second] = match.players;
  if (first.score === second.score) {
    match.phase = "sudden-death-intro";
    match.suddenDeath = true;
    match.lastMoveText = "The match is tied 2–2. Sudden Death decides it.";
    match.log.unshift(match.lastMoveText);
    return;
  }

  const champion = first.score > second.score ? first : second;
  match.phase = "complete";
  match.matchOver = true;
  match.matchWinnerSeat = champion.seat;
  match.lastMoveText = `${champion.name} wins the match ${champion.score}–${champion === first ? second.score : first.score}.`;
  match.log.unshift(match.lastMoveText);
}

function finishSuddenDeath(match, winner) {
  match.roundWinnerSeat = winner.seat;
  match.matchWinnerSeat = winner.seat;
  match.roundOver = true;
  match.matchOver = true;
  match.activeSeat = null;
  match.turnMode = "complete";
  match.phase = "complete";
  match.lastMoveText = `${winner.name} found the shared Build and wins Sudden Death!`;
  match.log.unshift(match.lastMoveText);
}

function requireActivePlayer(match, seat, expectedMode) {
  if (!match || match.phase !== "playing" || match.roundOver || match.matchOver) {
    throw new GameError("This Finders Makers round is not accepting moves.", "ROUND_NOT_PLAYING", 409);
  }
  const player = requirePlayer(match, seat);
  if (match.activeSeat !== player.seat) throw new GameError("It is not your Finders Makers turn.", "NOT_YOUR_TURN", 409);
  if (match.turnMode !== expectedMode) {
    const message = expectedMode === "build" ? "Start a Build attempt before selecting Pieces." : "Finish or cancel your Build attempt first.";
    throw new GameError(message, "WRONG_TURN_MODE", 409);
  }
  return player;
}

function requirePlayer(match, seat) {
  const player = playerAt(match?.players, Number(seat));
  if (!player) throw new GameError("That Finders Makers player is not in this match.", "SEAT_NOT_FOUND", 404);
  return player;
}

function playerAt(players, seat) {
  return (players || []).find((player) => player.seat === Number(seat)) || null;
}

function cardAt(match, position) {
  const normalized = Number(position);
  if (!Number.isInteger(normalized)) throw new GameError("Choose a Piece card on the board.", "INVALID_BOARD_POSITION", 409);
  const card = match.board.find((candidate) => candidate.position === normalized);
  if (!card) throw new GameError("That Piece card is not on this board.", "INVALID_BOARD_POSITION", 404);
  return card;
}

function cardsAt(match, positions) {
  if (!Array.isArray(positions) || positions.length !== 3) {
    throw new GameError("A Build attempt must select exactly three Piece cards.", "BUILD_CARD_COUNT", 409);
  }
  const normalized = positions.map(Number);
  if (normalized.some((position) => !Number.isInteger(position)) || new Set(normalized).size !== 3) {
    throw new GameError("Choose three different Piece cards for the Build.", "DUPLICATE_BOARD_POSITION", 409);
  }
  return normalized.map((position) => cardAt(match, position));
}

function samePieces(selectedPieceIds, requiredPieceIds) {
  return selectedPieceIds.slice().sort().join("|") === requiredPieceIds.slice().sort().join("|");
}

function generatedBoard(generatePieceBoard, builds, layout) {
  const board = generatePieceBoard({ builds, layout });
  assertBoardContains(board, requiredPiecesFor(builds), layout.cardCount);
  return board;
}

function advanceTurn(match, fromSeat) {
  const index = match.players.findIndex((player) => player.seat === fromSeat);
  match.activeSeat = match.players[(index + 1) % match.players.length].seat;
}

function openingSeat(players, round) {
  return players[(Math.max(1, Number(round) || 1) - 1) % players.length].seat;
}

function privateDiscoveryMap(players) {
  return Object.fromEntries(players.map((player) => [player.seat, []]));
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}

function secureBuildChoice(builds) {
  if (!Array.isArray(builds) || !builds.length) throw new GameError("Finders Makers has no available Builds.", "BUILD_SELECTION_FAILED", 500);
  return builds[randomInt(builds.length)];
}
