import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createCardcadeServer } from "../server/src/app.js";
import { SnapshotStore } from "../server/src/snapshot-store.js";
import { RoomStore } from "../server/src/room-store.js";
import { GameRegistry } from "../server/src/game-registry.js";
import { deckFamilies, games } from "../server/src/game-catalog.js";
import { createExpansionRuntimes } from "../server/src/games/expansion/index.js";
import { ExpansionRuntime } from "../server/src/games/expansion/runtime.js";
import { TrickEngine } from "../server/src/games/expansion/trick-engine.js";
import { turnOpportunity } from "../public/turn-alerts.js";

async function server(t, options = {}) {
  const app = createCardcadeServer({ botTurnDelayMs: 100000, ...options });
  const addr = await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${addr.port}`;
  const post = async (path, body) => { const response = await fetch(`${origin}/cardcade${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  return { app, origin, post };
}
async function connect(t, origin, session) {
  const socket = new WebSocket(origin.replace("http", "ws") + "/cardcade/ws");
  t.after(() => socket.terminate());
  await once(socket, "open");
  const request = async message => { const next = once(socket, "message", { signal: AbortSignal.timeout(3000) }); socket.send(JSON.stringify(message)); return JSON.parse((await next)[0]); };
  const initial = await request({ type: "authenticate", code: session.code, token: session.token });
  return { socket, request, initial };
}

test("Solo starts every expansion game with declared seat counts and mode", async t => {
  const { post } = await server(t);
  for (const [id, botCount] of [["spades", 3], ["hearts", 3], ["juan-fleep", 1], ["solitaire", 0]]) {
    const result = await post(`/api/solo/${id}`, { name: "Tester", botCount, settings: { drawCount: 3 } });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.room.mode, "solo");
    assert.equal(result.body.game.view.state.players.length, botCount + 1);
    assert.equal(result.body.game.view.state.revision, 0);
    if (id === "solitaire") assert.equal(result.body.game.view.state.drawCount, 3);
  }
  const invalid = await post('/api/solo/solitaire', { name: "Tester", settings: { drawCount: 2 } });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.error.code, "INVALID_SETTINGS");
});

test("Solitaire is rejected by multiplayer selection and Hot Seat; Solo joins stay private", async t => {
  const { app, post } = await server(t);
  const multiplayer = await post('/api/rooms', { name: "Host" });
  assert.throws(() => app.rooms.selectGame(multiplayer.body.code, multiplayer.body.token, 'solitaire'), { code: "MODE_NOT_SUPPORTED" });
  assert.equal((await post('/api/hot-seat/solitaire', { players: ["Host"], botCount: 0 })).body.error.code, "MODE_NOT_SUPPORTED");
  const solo = await post('/api/solo/solitaire', { name: "Solo", botCount: 0 });
  assert.throws(() => app.rooms.joinRoom(solo.body.code, { name: "Intruder" }), { code: "MODE_NOT_SUPPORTED" });
});

test("WebSocket Solitaire moves persist and resume with undo after SQLite snapshot restoration", async t => {
  const store = new SnapshotStore();
  const first = await server(t, { snapshotStore: store });
  const { body: session } = await first.post('/api/solo/solitaire', { name: "Tester", botCount: 0, settings: { drawCount: 3 } });
  const connection = await connect(t, first.origin, session);
  const result = await connection.request({ type: "draw", revision: 0 });
  assert.equal(result.type, "game_state"); assert.equal(result.view.state.wasteCount, 3);
  const stale = await connection.request({ type: "draw", revision: 0 });
  assert.equal(stale.error.code, "STALE_ACTION");
  const records = store.loadAll(); const registry = new GameRegistry({ deckFamilies, games });
  const second = await server(t, { registry, roomStore: new RoomStore({ registry, restoredRooms: records.map(s => s.room) }), expansionRuntimes: createExpansionRuntimes({ restoredMatches: records.map(s => s.game) }) });
  const reconnect = await second.post(`/api/rooms/${session.code}/reconnect`, { token: session.token });
  assert.equal(reconnect.body.game.view.state.wasteCount, 3); assert.equal(reconnect.body.room.mode, "solo");
  const resumed = await connect(t, second.origin, session);
  t.after(() => store.close());
  const undo = await resumed.request({ type: "undo", revision: 1 });
  assert.equal(undo.view.state.stockCount, 24); assert.equal(undo.view.state.moves, 0);
});

for (const gameId of ["spades", "hearts", "juan-fleep"]) test(`${gameId} Hot Seat returns private hands, persists mode, and supports CPU replacement`, async t => {
  const runtimes = createExpansionRuntimes({ botActionDelayMs: 100000 });
  const { app, post } = await server(t, { expansionRuntimes: runtimes });
  const result = await post(`/api/hot-seat/${gameId}`, { players: ["Host", "Guest"], botCount: gameId === "juan-fleep" ? 0 : 2 });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.room.mode, "hot-seat"); assert.equal(result.body.room.gameSettings.sharedDevice, true);
  const privateRoom = app.rooms.publicRoom(result.body.code, result.body.hotSeat.seats[1].token);
  assert.equal(privateRoom.players.find(p => p.isYou).name, "Guest");
  const restored = new RoomStore({ registry: app.registry, restoredRooms: [app.rooms.privateSnapshot(result.body.code)] });
  assert.equal(restored.publicRoom(result.body.code, result.body.hotSeat.seats[1].token).mode, "hot-seat");
  const before = runtimes.get(gameId).snapshot(result.body.code).players[1];
  assert.equal(runtimes.get(gameId).replaceHumanWithBot(result.body.code, 1), true);
  const after = runtimes.get(gameId).snapshot(result.body.code).players[1];
  assert.equal(after.type, "bot"); assert.deepEqual(after.hand, before.hand); assert.equal(after.team, before.team);
});

test("Completed tricks survive restoration and resolve exactly once", () => {
  let now = 0; const engine = new TrickEngine("spades", { now: () => now });
  const room = { code: "TRICKS", gameId: "spades", capacity: 4, gameSettings: { botCount: 0 }, players: Array.from({ length: 4 }, (_, seat) => ({ seat, name: `P${seat}`, role: seat ? "guest" : "host", isYou: !seat })) };
  const runtime = new ExpansionRuntime({ gameId: "spades", engine }); const m = runtime.start(room);
  for (let i = 0; i < 4; i++) engine.act(m, m.activeSeat, { type: "bid", bid: 3 });
  for (let i = 0; i < 4; i++) {
    const p = m.players.find(p => p.seat === m.activeSeat); engine.act(m, p.seat, { type: "play", cardId: engine.legal(m, p)[0].id });
  }
  const restored = new ExpansionRuntime({ gameId: "spades", engine, restoredMatches: [{ code: room.code, gameId: "spades", state: runtime.snapshot(room.code) }] });
  assert.equal(restored.nextActionDelay(room.code), 1200); now = 1200;
  assert.equal(restored.runScheduledStep(room.code), true); assert.equal(restored.runScheduledStep(room.code), false);
  assert.equal(restored.snapshot(room.code).players.reduce((n, p) => n + p.tricks, 0), 1);
});

test("Room mode hydration preserves legacy snapshots and Solitaire does not emit turn alerts", () => {
  const registry = new GameRegistry({ deckFamilies, games }); const rooms = new RoomStore({ registry });
  const session = rooms.createRoom({ name: "Host" }); const record = rooms.privateSnapshot(session.code); delete record.mode;
  for (const sharedDevice of [false, true]) {
    record.gameSettings.sharedDevice = sharedDevice;
    const restored = new RoomStore({ registry, restoredRooms: [record] });
    assert.equal(restored.publicRoom(session.code, session.token).mode, sharedDevice ? "hot-seat" : "multiplayer");
  }
  assert.equal(turnOpportunity({ room: { gameId: "solitaire", code: "TEST" }, view: { state: { activeSeat: 0, players: [{ seat: 0, type: "human" }] } } }), null);
});
