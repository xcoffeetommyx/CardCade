import assert from "node:assert/strict";
import test from "node:test";
import { deckFamilies, games } from "../server/src/game-catalog.js";
import { GameRegistry } from "../server/src/game-registry.js";
import { RoomStore } from "../server/src/room-store.js";

function setup(options = {}) {
  const registry = new GameRegistry({ deckFamilies, games });
  const store = new RoomStore({ registry, generateCode: () => "ABC234", ...options });
  return { registry, store };
}

test("a room begins before a game is chosen and keeps credentials private", () => {
  const { store } = setup();
  const host = store.createRoom({ name: "Tommy" });

  assert.equal(host.code, "ABC234");
  assert.equal(host.room.gameId, null);
  assert.equal(host.room.phase, "configuring");
  assert.equal(host.room.capacity, 8);
  assert.equal(host.room.players[0].role, "host");
  assert.equal(host.room.players[0].isYou, true);
  assert.equal(typeof host.token, "string");
  assert.ok(host.token.length > 30);
  assert.equal(JSON.stringify(host.room).includes(host.token), false);
  assert.equal(JSON.stringify(host.room).includes("tokenHash"), false);
});

test("guests join by shareable code but only their token authenticates them", () => {
  const { store } = setup();
  const host = store.createRoom({ name: "Host" });
  const guest = store.joinRoom("abc234", { name: "Guest" });

  assert.equal(guest.room.players.length, 2);
  assert.equal(guest.room.players.find((player) => player.name === "Guest").isYou, true);
  assert.equal(guest.room.players.find((player) => player.name === "Host").isYou, false);
  assert.throws(() => store.publicRoom(host.code, "wrong-token"), { code: "INVALID_SESSION" });
  assert.equal(store.publicRoom(host.code, host.token).players[0].isYou, true);
});

test("only the host selects a game and game selection resets readiness", () => {
  const { store } = setup();
  const host = store.createRoom({ name: "Host" });
  const guest = store.joinRoom(host.code, { name: "Guest" });

  assert.throws(() => store.selectGame(host.code, guest.token, "three-seven"), { code: "HOST_ONLY" });
  let room = store.selectGame(host.code, host.token, "three-seven");
  assert.equal(room.gameId, "three-seven");
  assert.equal(room.capacity, 4);

  store.setReady(host.code, host.token, true);
  store.setReady(host.code, guest.token, true);
  room = store.selectGame(host.code, host.token, "thirteen");
  assert.equal(room.players.every((player) => player.ready === false), true);
});

test("CPU count respects the selected game's capacity", () => {
  const { store } = setup();
  const host = store.createRoom({ name: "Host" });
  store.joinRoom(host.code, { name: "Guest" });
  store.selectGame(host.code, host.token, "three-seven");

  const room = store.setBotCount(host.code, host.token, 2);
  assert.equal(room.gameSettings.botCount, 2);
  assert.throws(() => store.setBotCount(host.code, host.token, 3), { code: "TOO_MANY_PLAYERS" });
});

test("migration-ready games explain why the match cannot start", () => {
  const { store } = setup();
  const host = store.createRoom({ name: "Host" });
  store.selectGame(host.code, host.token, "three-seven");
  store.setBotCount(host.code, host.token, 1);
  store.setReady(host.code, host.token, true);

  const room = store.publicRoom(host.code, host.token);
  assert.equal(room.canStart, false);
  assert.match(room.startBlocker, /ready to migrate/i);
});

test("leaving host promotes the oldest remaining guest", () => {
  const { store } = setup();
  const host = store.createRoom({ name: "Host" });
  const guest = store.joinRoom(host.code, { name: "Guest" });

  store.leaveRoom(host.code, host.token);
  const room = store.publicRoom(host.code, guest.token);
  assert.equal(room.players[0].role, "host");
  assert.equal(room.players[0].seat, 0);
});

test("expired rooms are removed", () => {
  let now = 1_000;
  const { store } = setup({ now: () => now, roomTtlMs: 100 });
  const host = store.createRoom({ name: "Host" });
  now += 101;

  assert.equal(store.cleanupExpired(), 1);
  assert.throws(() => store.publicRoom(host.code, host.token), { code: "ROOM_NOT_FOUND" });
});
