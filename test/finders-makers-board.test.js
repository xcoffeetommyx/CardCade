import assert from "node:assert/strict";
import test from "node:test";
import content from "../shared/finders-makers-content.js";
import {
  MAX_COPIES_PER_PIECE,
  NORMAL_BOARD,
  SUDDEN_DEATH_BOARD,
  boardContainsRequiredPieces,
  generateBoard,
  requiredPiecesFor
} from "../server/src/games/finders-makers/board-generator.js";

const identityShuffle = (items) => items.slice();
const firstItem = (items) => items[0];

test("the MVP content defines eight data-driven Builds with exactly three valid Pieces", () => {
  assert.equal(content.BUILDS.length, 8);
  assert.equal(content.PIECES.length, 24);
  assert.equal(content.validateContent(), true);
  for (const build of content.BUILDS) {
    assert.equal(build.pieceIds.length, 3);
    assert.equal(new Set(build.pieceIds).size, 3);
    assert.ok(build.pieceIds.every((pieceId) => content.pieceById(pieceId)));
  }
});

test("normal board generation produces twelve cards containing both player Builds", () => {
  const builds = [content.buildById("cake"), content.buildById("sundae")];
  const board = generateBoard({ builds, layout: NORMAL_BOARD, shuffle: identityShuffle, pick: firstItem });

  assert.equal(board.length, 12);
  assert.deepEqual(board.map((card) => card.position), Array.from({ length: 12 }, (_, index) => index));
  assert.equal(boardContainsRequiredPieces(board, builds), true);
  assert.ok(board.every((card) => content.pieceById(card.pieceId)));
  const counts = new Map();
  for (const card of board) counts.set(card.pieceId, (counts.get(card.pieceId) || 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= MAX_COPIES_PER_PIECE));
});

test("Sudden Death board generation produces sixteen cards containing the shared Build", () => {
  const builds = [content.buildById("pizza")];
  const board = generateBoard({ builds, layout: SUDDEN_DEATH_BOARD, shuffle: identityShuffle, pick: firstItem });

  assert.equal(board.length, 16);
  assert.equal(boardContainsRequiredPieces(board, builds), true);
  assert.deepEqual(requiredPiecesFor(builds), ["pan", "pizza", "topping"]);
});
