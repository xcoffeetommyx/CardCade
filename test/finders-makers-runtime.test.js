import assert from "node:assert/strict";
import test from "node:test";
import { GameError } from "../server/src/game-error.js";
import { FindersMakersRuntime } from "../server/src/games/finders-makers/runtime.js";

function roomFor(viewerSeat = 0) {
  return {
    code: "FIND42",
    gameId: "finders-makers",
    players: [
      { seat: 0, name: "Host", role: "host", isYou: viewerSeat === 0, connected: true },
      { seat: 1, name: "Guest", role: "guest", isYou: viewerSeat === 1, connected: true }
    ]
  };
}

test("the Finders Makers runtime maps private game actions and preserves host-only round progression", () => {
  const runtime = new FindersMakersRuntime();
  const hostRoom = roomFor(0);
  runtime.start(hostRoom);

  const opening = runtime.view(hostRoom);
  assert.equal(opening.type, "finders_makers_match_state");
  assert.equal(opening.state.board.length, 12);
  assert.equal(opening.ownBuild.pieces.length, 3);

  runtime.act(hostRoom, { type: "finders_search", position: 0 });
  const hostView = runtime.view(hostRoom);
  const guestView = runtime.view(roomFor(1));
  assert.ok(hostView.privateSearch?.piece?.id);
  assert.equal(guestView.privateSearch, null);
  assert.equal(guestView.state.board[0].pieceId, undefined);

  assert.throws(
    () => runtime.act(roomFor(1), { type: "finders_next_round" }),
    (error) => error instanceof GameError && error.code === "HOST_ONLY"
  );
});
