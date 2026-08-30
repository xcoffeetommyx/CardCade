import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { createCardcadeServer } from "../server/src/app.js";
import { MatchEngine } from "../server/src/games/snap/match-engine.js";
import { SnapRuntime } from "../server/src/games/snap/runtime.js";

async function startServer(t) {
  const engine = new MatchEngine({
    shuffleDeck: (deck) => deck,
    countdownMs: 100,
    reactionWindowMs: 100,
    randomDelay: () => 20,
    botMistake: () => false
  });
  const app = createCardcadeServer({ snapRuntime: new SnapRuntime({ matchEngine: engine }) });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(() => app.close());
  return `http://127.0.0.1:${address.port}`;
}

async function post(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Snap WebSocket state."));
    }, 2_000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onMessage = (buffer) => {
      const message = JSON.parse(buffer.toString("utf8"));
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (error) => { cleanup(); reject(error); };
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

async function openSocket(origin, session) {
  const socket = new WebSocket(origin.replace("http", "ws") + "/ws");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const initial = nextMessage(socket, (message) => message.type === "room_state");
  socket.send(JSON.stringify({ type: "authenticate", code: session.code, token: session.token }));
  await initial;
  return socket;
}

test("the shared WebSocket pipeline owns Snap READY, countdown, reveal, and preloaded-reaction rejection", async (t) => {
  const origin = await startServer(t);
  const host = await post(origin, "/api/rooms", { name: "Host" });
  const guest = await post(origin, `/api/rooms/${host.code}/join`, { name: "Guest" });
  const hostSocket = await openSocket(origin, host);
  const guestSocket = await openSocket(origin, guest);
  t.after(() => { hostSocket.terminate(); guestSocket.terminate(); });

  let hostUpdate = nextMessage(hostSocket, (message) => message.type === "room_state" && message.room.gameId === "snap");
  let guestUpdate = nextMessage(guestSocket, (message) => message.type === "room_state" && message.room.gameId === "snap");
  hostSocket.send(JSON.stringify({ type: "select_game", gameId: "snap" }));
  await Promise.all([hostUpdate, guestUpdate]);

  hostUpdate = nextMessage(hostSocket, (message) => message.type === "room_state" && message.room.players.find((player) => player.isYou)?.ready);
  hostSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await hostUpdate;
  guestUpdate = nextMessage(guestSocket, (message) => message.type === "room_state" && message.room.canStart);
  guestSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await guestUpdate;

  const started = nextMessage(hostSocket, (message) => message.type === "game_state" && message.gameId === "snap");
  hostSocket.send(JSON.stringify({ type: "start_game" }));
  const initial = await started;
  assert.equal(initial.view.state.phase, "waiting-for-ready");
  assert.equal(JSON.stringify(initial.view).includes("drawPile"), false);
  assert.equal(initial.view.state.currentCard.id, "AS");
  assert.equal(initial.view.state.centerCount, 1);

  hostUpdate = nextMessage(hostSocket, (message) => message.type === "game_state" && message.view.state.players.find((player) => player.seat === 0)?.ready);
  hostSocket.send(JSON.stringify({ type: "snap_ready" }));
  await hostUpdate;
  const countdown = nextMessage(hostSocket, (message) => message.type === "game_state" && message.view.state.phase === "countdown");
  const revealed = nextMessage(hostSocket, (message) => message.type === "game_state" && message.view.state.phase === "reaction");
  guestSocket.send(JSON.stringify({ type: "snap_ready" }));
  const countdownState = await countdown;
  assert.equal(countdownState.view.state.currentCard.id, "AS");
  assert.ok(countdownState.view.state.countdownEndsAt > Date.now());

  const rejected = nextMessage(hostSocket, (message) => message.type === "error" && message.error.code === "SNAP_NOT_AVAILABLE");
  hostSocket.send(JSON.stringify({ type: "snap_react", reactionId: "snap-1" }));
  await rejected;

  const revealState = await revealed;
  assert.equal(revealState.view.state.previousCard.id, "AS");
  assert.equal(revealState.view.state.currentCard.id, "AC");
  assert.equal(revealState.view.state.reactionId, "snap-1");
  assert.equal(revealState.view.state.actions.snap, true);
});

test("Solo Snap starts with a human-paced CPU while Hot Seat is deliberately unavailable", async (t) => {
  const origin = await startServer(t);
  const solo = await post(origin, "/api/solo/snap", { name: "Tommy", botCount: 1 });
  assert.equal(solo.room.gameId, "snap");
  assert.equal(solo.room.phase, "playing");
  assert.equal(solo.game.view.type, "snap_match_state");
  assert.equal(solo.game.view.state.players.length, 2);
  assert.equal(solo.game.view.state.players.filter((player) => player.type === "bot").length, 1);
  assert.equal(solo.game.view.state.phase, "waiting-for-ready");

  const response = await fetch(`${origin}/api/hot-seat/snap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players: ["Tommy", "Alex"] })
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "MODE_NOT_SUPPORTED");
});
