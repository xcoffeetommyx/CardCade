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

function soloRoom() {
  return {
    code: "SOLO42",
    gameId: "finders-makers",
    capacity: 2,
    gameSettings: { botCount: 1 },
    players: [
      { seat: 0, name: "Host", role: "host", isYou: true, connected: true }
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

test("the Finders Makers runtime adds a private-memory CPU to a Solo duel", () => {
  const runtime = new FindersMakersRuntime();
  const room = soloRoom();
  runtime.start(room);

  const opening = runtime.view(room);
  assert.equal(opening.state.players.length, 2);
  assert.equal(opening.state.players[1].type, "bot");
  assert.equal(opening.state.players[1].connected, true);

  runtime.act(room, { type: "finders_search", position: 0 });
  assert.equal(opening.state.board[0].pieceId, undefined);
  assert.equal(runtime.runBotTurn(room.code), true);

  const afterBotSearch = runtime.view(room);
  assert.equal(afterBotSearch.state.latestSearch.seat, 1);
  assert.equal(afterBotSearch.state.board[afterBotSearch.state.latestSearch.position].pieceId, undefined);
  assert.equal(afterBotSearch.privateSearch?.position, 0, "the human still sees only their own Search result");
});
