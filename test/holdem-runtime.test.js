import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/holdem/match-engine.js";
import { HoldemRuntime } from "../server/src/games/holdem/runtime.js";

const identityShuffle = (deck) => deck.slice();

function room({ code = "HOLDME", botCount = 0, players = [{ seat: 0, name: "Host", role: "host", isYou: true, connected: true }] } = {}) {
  return {
    code,
    gameId: "holdem",
    capacity: 4,
    gameSettings: { botCount },
    players
  };
}

test("Texas Hold'em runtime fills shared room seats with CPUs and protects every private hole hand", () => {
  const runtime = new HoldemRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({ botCount: 3 });
  runtime.start(table);

  const view = runtime.view(table);
  assert.equal(view.type, "holdem_match_state");
  assert.equal(view.hand.length, 2);
  assert.equal(view.state.players.length, 4);
  assert.equal(view.state.players.filter((player) => player.type === "bot").length, 3);

  const snapshot = runtime.snapshot(table.code);
  const otherCardIds = snapshot.players.slice(1).flatMap((player) => player.holeCards.map((card) => card.id));
  const serialized = JSON.stringify(view);
  for (const cardId of otherCardIds) assert.equal(serialized.includes(`\"${cardId}\"`), false, `Leaked ${cardId}`);
});

test("Texas Hold'em runtime maps table actions, snapshots ongoing tables, and restores them", () => {
  const runtime = new HoldemRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({
    players: [
      { seat: 0, name: "Host", role: "host", isYou: true, connected: true },
      { seat: 1, name: "Guest", role: "guest", isYou: false, connected: true }
    ]
  });
  runtime.start(table);
  const before = runtime.view(table);

  assert.equal(before.state.actions.call, true);
  runtime.act(table, { type: "holdem_call" });
  assert.notEqual(runtime.view(table).state.lastMoveText, before.state.lastMoveText);
  assert.throws(() => runtime.act(table, { type: "holdem_unknown" }), (error) => error instanceof GameError && error.code === "UNKNOWN_GAME_ACTION");

  const restored = new HoldemRuntime({
    matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }),
    restoredMatches: [{ gameId: "holdem", code: table.code, state: runtime.snapshot(table.code) }]
  });
  assert.equal(restored.has(table.code), true);
  assert.deepEqual(restored.snapshot(table.code), runtime.snapshot(table.code));
});

test("Texas Hold'em runtime preserves the shared 52-card source for complete tables", () => {
  const runtime = new HoldemRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({ botCount: 1 });
  runtime.start(table);
  const snapshot = runtime.snapshot(table.code);
  const expected = new Set(standard52.makeDeck().map((card) => card.id));
  assert.ok(snapshot.players.flatMap((player) => player.holeCards).every((card) => expected.has(card.id)));
});
