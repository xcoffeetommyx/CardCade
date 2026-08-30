import assert from "node:assert/strict";
import test from "node:test";
import { createCardcadeServer } from "../server/src/app.js";

async function startServer(t, options = {}) {
  const app = createCardcadeServer(options);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(() => app.close());
  return `http://127.0.0.1:${address.port}`;
}

async function request(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

test("Finders Makers starts as a two-human Hot Seat table without exposing hidden Piece identities", async (t) => {
  const origin = await startServer(t);
  const result = await request(origin, "/api/hot-seat/finders-makers", {
    players: ["Ada", "Bea"],
    botCount: 0
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "finders-makers");
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.game.view.state.board.length, 12);
  assert.equal(result.body.game.view.state.board[0].pieceId, undefined);
  assert.equal(result.body.game.view.ownBuild.pieces.length, 3);

  const cpuTable = await request(origin, "/api/hot-seat/finders-makers", {
    players: ["Ada"],
    botCount: 1
  });
  assert.equal(cpuTable.response.status, 201);
  assert.equal(cpuTable.body.game.view.state.players.length, 2);
  assert.equal(cpuTable.body.game.view.state.players[1].type, "bot");
});

test("Finders Makers Solo creates one human and one CPU without exposing board identities", async (t) => {
  const origin = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await request(origin, "/api/solo/finders-makers", {
    name: "Ada",
    botCount: 1
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "finders-makers");
  assert.equal(result.body.game.view.state.players.length, 2);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 1);
  assert.equal(result.body.game.view.ownBuild.pieces.length, 3);
  assert.equal(result.body.game.view.state.board.some((card) => "pieceId" in card), false);
});
