import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { createCardcadeServer } from "../server/src/app.js";

async function startServer(t) {
  const app = createCardcadeServer();
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  return { app, origin };
}

async function jsonRequest(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  return { response, body: await response.json() };
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message."));
    }, 2_000);
    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    }
    function onMessage(buffer) {
      const message = JSON.parse(buffer.toString("utf8"));
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function openSocket(origin, session, expectedType = "room_state") {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace("http", "ws") + "/ws");
    socket.once("open", () => {
      const stateMessage = nextMessage(socket, (message) => message.type === expectedType);
      socket.send(JSON.stringify({ type: "authenticate", code: session.code, token: session.token }));
      stateMessage.then(() => resolve(socket), reject);
    });
    socket.once("error", reject);
  });
}

test("health, catalog, and launcher are served from one process", async (t) => {
  const { origin } = await startServer(t);
  const health = await fetch(`${origin}/health`);
  assert.deepEqual(await health.json(), { ok: true, service: "cardcade" });

  const catalog = await fetch(`${origin}/api/catalog`);
  const catalogBody = await catalog.json();
  assert.deepEqual(catalogBody.families[0].games.map((game) => game.id), ["three-seven", "thirteen"]);

  const launcher = await fetch(origin);
  assert.equal(launcher.status, 200);
  assert.match(await launcher.text(), /<title>Cardcade<\/title>/);
});

test("HTTP room creation and joining return private sessions", async (t) => {
  const { origin } = await startServer(t);
  const hostResult = await jsonRequest(origin, "/api/rooms", { method: "POST", body: JSON.stringify({ name: "Host" }) });
  assert.equal(hostResult.response.status, 201);
  assert.equal(hostResult.body.room.gameId, null);

  const guestResult = await jsonRequest(origin, `/api/rooms/${hostResult.body.code}/join`, { method: "POST", body: JSON.stringify({ name: "Guest" }) });
  assert.equal(guestResult.response.status, 200);
  assert.notEqual(guestResult.body.token, hostResult.body.token);
  assert.equal(guestResult.body.room.players.length, 2);

  const invalid = await jsonRequest(origin, `/api/rooms/${hostResult.body.code}/reconnect`, { method: "POST", body: JSON.stringify({ token: "invalid" }) });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.error.code, "INVALID_SESSION");
});

test("WebSocket lobby broadcasts host game selection to every player", async (t) => {
  const { origin } = await startServer(t);
  const host = (await jsonRequest(origin, "/api/rooms", { method: "POST", body: JSON.stringify({ name: "Host" }) })).body;
  const guest = (await jsonRequest(origin, `/api/rooms/${host.code}/join`, { method: "POST", body: JSON.stringify({ name: "Guest" }) })).body;
  const hostSocket = await openSocket(origin, host);
  const guestSocket = await openSocket(origin, guest);
  t.after(() => {
    hostSocket.terminate();
    guestSocket.terminate();
  });

  const hostUpdate = nextMessage(hostSocket, (message) => message.type === "room_state" && message.room.gameId === "three-seven");
  const guestUpdate = nextMessage(guestSocket, (message) => message.type === "room_state" && message.room.gameId === "three-seven");
  hostSocket.send(JSON.stringify({ type: "select_game", gameId: "three-seven" }));

  const [hostMessage, guestMessage] = await Promise.all([hostUpdate, guestUpdate]);
  assert.equal(hostMessage.room.players.find((player) => player.isYou).name, "Host");
  assert.equal(guestMessage.room.players.find((player) => player.isYou).name, "Guest");
  assert.equal(guestMessage.room.game.name, "3s & 7s");
});

test("Solo starts a private server-authoritative 3s & 7s match", async (t) => {
  const { origin } = await startServer(t);
  const result = await jsonRequest(origin, "/api/solo/three-seven", {
    method: "POST",
    body: JSON.stringify({ name: "Solo Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "three-seven");
  assert.equal(result.body.game.view.type, "match_state");
  assert.equal(result.body.game.view.hand.length, 7);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.every((player) => !("hand" in player)), true);

  const reconnect = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: result.body.token })
  });
  assert.equal(reconnect.body.game.view.hand.length, 7);

  const socket = await openSocket(origin, result.body, "game_state");
  t.after(() => socket.terminate());
});

test("a host starts 3s & 7s from the global Cardcade lobby", async (t) => {
  const { origin } = await startServer(t);
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "three-seven");
  socket.send(JSON.stringify({ type: "select_game", gameId: "three-seven" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 1);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 1 }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.gameId, "three-seven");
  assert.equal(message.view.hand.length, 7);
  assert.equal(message.view.state.players.length, 2);
});
