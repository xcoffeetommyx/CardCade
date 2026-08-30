import assert from "node:assert/strict";
import test from "node:test";
import { MatchEngine } from "../server/src/games/snap/match-engine.js";
import { SnapRuntime } from "../server/src/games/snap/runtime.js";

function roomFor(seat, { botCount = 0 } = {}) {
  return {
    code: "SNAP42",
    gameId: "snap",
    capacity: 4,
    gameSettings: { botCount },
    players: [
      { seat: 0, name: "Tommy", type: "human", isYou: seat === 0, connected: true },
      { seat: 1, name: "Alex", type: "human", isYou: seat === 1, connected: true }
    ]
  };
}

test("Snap runtime fills CPU seats, maps actions, and exposes no hidden pile identities", () => {
  let now = 0;
  const engine = new MatchEngine({ now: () => now, shuffleDeck: (deck) => deck, randomDelay: () => 300, botMistake: () => false });
  const runtime = new SnapRuntime({ matchEngine: engine });
  const room = roomFor(0, { botCount: 1 });
  room.players.pop();
  runtime.start(room);

  const initial = runtime.view(room);
  assert.equal(initial.type, "snap_match_state");
  assert.equal(initial.state.players.length, 2);
  assert.equal(initial.state.players.filter((player) => player.type === "bot").length, 1);
  assert.equal(JSON.stringify(initial).includes("drawPile"), false);
  assert.equal(initial.state.players.reduce((total, player) => total + player.drawCount, 0), 51);
  assert.equal(initial.state.currentCard.id, "AS");

  runtime.act(room, { type: "snap_ready" });
  now = 300;
  assert.equal(runtime.runScheduledStep(room.code), true);
  assert.equal(runtime.view(room).state.phase, "countdown");
  assert.equal(runtime.nextActionDelay(room.code), 3_000);
});

test("Snap snapshots restore countdown and reaction sequencing without another reveal", () => {
  let now = 0;
  const engine = new MatchEngine({ now: () => now, shuffleDeck: (deck) => deck, randomDelay: () => 300, botMistake: () => false });
  const runtime = new SnapRuntime({ matchEngine: engine });
  const hostRoom = roomFor(0);
  runtime.start(hostRoom);
  runtime.act(hostRoom, { type: "snap_ready" });
  runtime.act(roomFor(1), { type: "snap_ready" });
  now = 3_000;
  runtime.runScheduledStep(hostRoom.code);
  const snapshot = runtime.snapshot(hostRoom.code);
  assert.equal(snapshot.revealSequence, 1);

  const restored = new SnapRuntime({
    matchEngine: engine,
    restoredMatches: [{ gameId: "snap", code: hostRoom.code, state: snapshot }]
  });
  const view = restored.view(hostRoom);
  assert.equal(view.state.reactionId, "snap-1");
  assert.equal(view.state.revealSequence, 1);
  assert.equal(view.state.currentCard.id, "AC");
  assert.equal(restored.snapshot(hostRoom.code).centerPile.length, 2);
});

test("disconnect replacement preserves the seat and schedules human-paced bot behavior", () => {
  let now = 10;
  const engine = new MatchEngine({ now: () => now, shuffleDeck: (deck) => deck, randomDelay: () => 300, botMistake: () => false });
  const runtime = new SnapRuntime({ matchEngine: engine });
  const room = roomFor(0);
  runtime.start(room);
  assert.equal(runtime.replaceHumanWithBot(room.code, 1), true);
  const snapshot = runtime.snapshot(room.code);
  assert.equal(snapshot.players[1].type, "bot");
  assert.equal(snapshot.players[1].drawPile.length, 26);
  assert.equal(snapshot.players[1].botReadyAt, 310);
});
