import { randomInt } from "node:crypto";
import content from "../../../../shared/finders-makers-content.js";
import { GameError } from "../../game-error.js";

export const NORMAL_BOARD = Object.freeze({ cardCount: 12, rows: 3, columns: 4 });
export const SUDDEN_DEATH_BOARD = Object.freeze({ cardCount: 16, rows: 4, columns: 4 });
export const MAX_COPIES_PER_PIECE = 3;

export function generateBoard({ builds, layout = NORMAL_BOARD, shuffle = secureShuffle, pick = securePick } = {}) {
  const normalizedLayout = normalizeLayout(layout);
  const requiredPieceIds = requiredPiecesFor(builds);
  if (requiredPieceIds.length > normalizedLayout.cardCount) {
    throw new GameError("Those Builds need more Pieces than this board can hold.", "BOARD_TOO_SMALL", 500);
  }

  const counts = new Map();
  const pieceIds = requiredPieceIds.slice();
  for (const pieceId of pieceIds) counts.set(pieceId, (counts.get(pieceId) || 0) + 1);

  while (pieceIds.length < normalizedLayout.cardCount) {
    const candidates = fillCandidates(requiredPieceIds, counts);
    if (!candidates.length) throw new GameError("Finders Makers could not fill the Piece board.", "BOARD_FILL_FAILED", 500);
    const nextPieceId = pick(candidates);
    if (!content.pieceById(nextPieceId)) throw new GameError("Finders Makers selected an unknown Piece.", "INVALID_PIECE", 500);
    pieceIds.push(nextPieceId);
    counts.set(nextPieceId, (counts.get(nextPieceId) || 0) + 1);
  }

  const shuffled = shuffle(pieceIds.slice());
  if (!Array.isArray(shuffled) || shuffled.length !== normalizedLayout.cardCount) {
    throw new GameError("Finders Makers received an invalid board shuffle.", "INVALID_BOARD_SHUFFLE", 500);
  }
  const board = shuffled.map((pieceId, position) => ({ position, pieceId }));
  assertBoardContains(board, requiredPieceIds, normalizedLayout.cardCount);
  return board;
}

export function requiredPiecesFor(builds) {
  if (!Array.isArray(builds) || !builds.length) {
    throw new GameError("Finders Makers needs at least one Build to make a board.", "BUILDS_REQUIRED", 500);
  }
  const pieceIds = [];
  for (const buildLike of builds) {
    const build = resolveBuild(buildLike);
    if (!Array.isArray(build.pieceIds) || build.pieceIds.length !== 3 || new Set(build.pieceIds).size !== 3) {
      throw new GameError(`Build ${build.id || "unknown"} must require exactly three Pieces.`, "INVALID_BUILD", 500);
    }
    for (const pieceId of build.pieceIds) {
      if (!content.pieceById(pieceId)) throw new GameError(`Build ${build.id} has an unknown Piece.`, "INVALID_BUILD", 500);
      if (!pieceIds.includes(pieceId)) pieceIds.push(pieceId);
    }
  }
  return pieceIds;
}

export function boardContainsRequiredPieces(board, builds) {
  const available = new Set((board || []).map((card) => card.pieceId));
  return requiredPiecesFor(builds).every((pieceId) => available.has(pieceId));
}

export function assertBoardContains(board, requiredPieceIds, expectedCardCount) {
  if (!Array.isArray(board) || board.length !== expectedCardCount) {
    throw new GameError(`Finders Makers boards must contain exactly ${expectedCardCount} cards.`, "INVALID_BOARD", 500);
  }
  const positions = board.map((card) => card.position);
  if (new Set(positions).size !== board.length || positions.some((position, index) => position !== index)) {
    throw new GameError("Finders Makers board positions must be unique and sequential.", "INVALID_BOARD", 500);
  }
  const available = new Set(board.map((card) => card.pieceId));
  if (requiredPieceIds.some((pieceId) => !available.has(pieceId))) {
    throw new GameError("Finders Makers generated an unwinnable board.", "UNWINNABLE_BOARD", 500);
  }
  if (board.some((card) => !content.pieceById(card.pieceId))) {
    throw new GameError("Finders Makers boards cannot contain unknown Pieces.", "INVALID_BOARD", 500);
  }
  return true;
}

function fillCandidates(requiredPieceIds, counts) {
  const candidates = [];
  for (const pieceId of requiredPieceIds) {
    if ((counts.get(pieceId) || 0) < MAX_COPIES_PER_PIECE) {
      // Required Pieces receive a modest extra weight. This is intentionally
      // isolated here so balancing can change without touching match rules.
      candidates.push(pieceId, pieceId);
    }
  }
  for (const piece of content.PIECES) {
    if ((counts.get(piece.id) || 0) < MAX_COPIES_PER_PIECE) candidates.push(piece.id);
  }
  return candidates;
}

function resolveBuild(buildLike) {
  const build = typeof buildLike === "string" ? content.buildById(buildLike) : buildLike;
  if (!build) throw new GameError("Finders Makers could not find that Build.", "BUILD_NOT_FOUND", 500);
  return build;
}

function normalizeLayout(layout) {
  const cardCount = Number(layout?.cardCount);
  const rows = Number(layout?.rows);
  const columns = Number(layout?.columns);
  if (!Number.isInteger(cardCount) || !Number.isInteger(rows) || !Number.isInteger(columns) || cardCount !== rows * columns) {
    throw new GameError("Finders Makers has an invalid board layout.", "INVALID_BOARD_LAYOUT", 500);
  }
  return { cardCount, rows, columns };
}

function securePick(items) {
  return items[randomInt(items.length)];
}

function secureShuffle(items) {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}
