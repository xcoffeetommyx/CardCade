import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/blackjack/match-engine.js";
import { BlackjackRuntime } from "../server/src/games/blackjack/runtime.js";

const identityShuffle = (deck) => deck.slice();

function scriptedShuffle(deck) {
  const topToBottom = ["10S", "10D", "6H", "7C"];
  const scripted = new Set(topToBottom);
  return [...deck.filter((card) => !scripted.has(card.id)), ...topToBottom.slice().reverse().map((id) => standard52.makeDeck().find((card) => card.id === id))];
}

function room({ code = "BLACKJACK", botCount = 0, players = [{ seat: 0, name: "Host", role: "host", isYou: true, connected: true }] } = {}) {
  return {
    code,
    gameId: "blackjack",
    capacity: 4,
    gameSettings: { botCount },
    players
  };
}

test("Blackjack runtime fills shared room seats with CPUs and protects every private hand", () => {
  const runtime = new BlackjackRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({ botCount: 3 });
  runtime.start(table);

  const view = runtime.view(table);
  assert.equal(view.type, "blackjack_match_state");
  assert.equal(view.hands.length, 1);
  assert.equal(view.hands[0].cards.length, 2);
  assert.equal(view.state.players.length, 4);
  assert.equal(view.state.players.filter((player) => player.type === "bot").length, 3);

  const snapshot = runtime.snapshot(table.code);
  const otherCardIds = snapshot.players.slice(1).flatMap((player) => player.hands.flatMap((hand) => hand.cards.map((card) => card.id)));
  const serialized = JSON.stringify(view);
  for (const cardId of otherCardIds) assert.equal(serialized.includes(`\"${cardId}\"`), false, `Leaked ${cardId}`);
});

test("Blackjack runtime maps room actions, persists snapshots, and restores tables", () => {
  const runtime = new BlackjackRuntime({ matchEngine: new MatchEngine({ shuffleDeck: scriptedShuffle }) });
  const table = room();
  runtime.start(table);
  const before = runtime.view(table);

  assert.equal(before.state.actions.stand, true);
  runtime.act(table, { type: "blackjack_stand" });
  assert.notEqual(runtime.view(table).state.lastMoveText, before.state.lastMoveText);
  assert.throws(() => runtime.act(table, { type: "blackjack_unknown" }), (error) => error instanceof GameError && error.code === "UNKNOWN_GAME_ACTION");

  const restored = new BlackjackRuntime({
    matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }),
    restoredMatches: [{ gameId: "blackjack", code: table.code, state: runtime.snapshot(table.code) }]
  });
  assert.equal(restored.has(table.code), true);
  assert.deepEqual(restored.snapshot(table.code), runtime.snapshot(table.code));
});
