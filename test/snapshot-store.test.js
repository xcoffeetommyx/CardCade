import assert from "node:assert/strict";
import test from "node:test";
import { deckFamilies, games } from "../server/src/game-catalog.js";
import { GameRegistry } from "../server/src/game-registry.js";
import { ThreeSevenRuntime } from "../server/src/games/three-seven/runtime.js";
import { RoomStore } from "../server/src/room-store.js";
import { SnapshotStore } from "../server/src/snapshot-store.js";

test("restores a private room session and in-progress ThreeSeven hands", () => {
  const snapshots = new SnapshotStore();
  const registry = new GameRegistry({ deckFamilies, games });
  const rooms = new RoomStore({ registry, generateCode: () => "SAVE77" });
  const runtime = new ThreeSevenRuntime();
  const host = rooms.createRoom({ name: "Host" });
  rooms.selectGame(host.code, host.token, "three-seven");
  rooms.setBotCount(host.code, host.token, 3);
  rooms.setReady(host.code, host.token, true);
  runtime.start(rooms.publicRoom(host.code, host.token));
  rooms.markPlaying(host.code, host.token);
  snapshots.save({
    code: host.code,
    room: rooms.privateSnapshot(host.code),
    game: { gameId: "three-seven", code: host.code, state: runtime.snapshot(host.code) }
  });

  const [stored] = snapshots.loadAll();
  assert.equal(JSON.stringify(stored).includes(host.token), false, "raw reconnect tokens are never persisted");

  const restoredRooms = new RoomStore({ registry, restoredRooms: [stored.room] });
  const restoredRuntime = new ThreeSevenRuntime({ restoredMatches: [stored.game] });
  const session = restoredRooms.reconnect(host.code, host.token);
  const view = restoredRuntime.view(session.room);

  assert.equal(session.room.phase, "playing");
  assert.equal(session.room.players[0].connected, true);
  assert.equal(view.hand.length, 7);
  assert.equal(view.state.players.length, 4);
  assert.equal(view.state.players.every((player) => !("hand" in player)), true);
  snapshots.close();
});

test("deleting a room also deletes its durable snapshot", () => {
  const snapshots = new SnapshotStore();
  snapshots.save({ code: "DELETE", room: { code: "DELETE" }, game: null });
  assert.equal(snapshots.loadAll().length, 1);
  snapshots.delete("DELETE");
  assert.equal(snapshots.loadAll().length, 0);
  snapshots.close();
});
