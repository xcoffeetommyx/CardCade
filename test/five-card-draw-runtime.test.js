import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/five-card-draw/match-engine.js";
import { FiveCardDrawRuntime } from "../server/src/games/five-card-draw/runtime.js";

const identityShuffle = (deck) => deck.slice();

function room({ code = "DRAW77", botCount = 0, players = [{ seat: 0, name: "Host", role: "host", isYou: true, connected: true }] } = {}) {
  return {
    code,
    gameId: "five-card-draw",
    capacity: 4,
    gameSettings: { botCount },
    players
  };
}

test("Five Card Draw runtime fills shared room seats with CPUs and protects every private hand", () => {
  const runtime = new FiveCardDrawRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({ botCount: 3 });
  runtime.start(table);

  const view = runtime.view(table);
  assert.equal(view.type, "five_card_draw_match_state");
  assert.equal(view.hand.length, 5);
  assert.equal(view.state.players.length, 4);
  assert.equal(view.state.players.filter((player) => player.type === "bot").length, 3);

  const snapshot = runtime.snapshot(table.code);
  const otherCardIds = snapshot.players.slice(1).flatMap((player) => player.hand.map((card) => card.id));
  const serialized = JSON.stringify(view);
  for (const cardId of otherCardIds) assert.equal(serialized.includes(`\"${cardId}\"`), false, `Leaked ${cardId}`);
});

test("Five Card Draw runtime maps betting and draw actions, persists snapshots, and restores tables", () => {
  const runtime = new FiveCardDrawRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({ botCount: 1 });
  runtime.start(table);
  const before = runtime.view(table);

  assert.equal(before.state.actions.call, true);
  runtime.act(table, { type: "five_card_draw_call" });
  assert.equal(runtime.runBotTurn(table.code), true);
  assert.equal(runtime.runBotTurn(table.code), true);
  const drawView = runtime.view(table);
  assert.equal(drawView.state.phase, "draw");
  assert.equal(drawView.state.actions.draw, true);
  runtime.act(table, { type: "five_card_draw_draw", cardIds: [] });
  assert.equal(runtime.view(table).state.phase, "final");
  assert.throws(() => runtime.act(table, { type: "five_card_draw_unknown" }), (error) => error instanceof GameError && error.code === "UNKNOWN_GAME_ACTION");

  const restored = new FiveCardDrawRuntime({
    matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }),
    restoredMatches: [{ gameId: "five-card-draw", code: table.code, state: runtime.snapshot(table.code) }]
  });
  assert.equal(restored.has(table.code), true);
  assert.deepEqual(restored.snapshot(table.code), runtime.snapshot(table.code));
});

test("Five Card Draw runtime only deals cards from Cardcade's shared standard deck", () => {
  const runtime = new FiveCardDrawRuntime({ matchEngine: new MatchEngine({ shuffleDeck: identityShuffle }) });
  const table = room({ botCount: 1 });
  runtime.start(table);
  const snapshot = runtime.snapshot(table.code);
  const expected = new Set(standard52.makeDeck().map((card) => card.id));
  assert.ok(snapshot.players.flatMap((player) => player.hand).every((card) => expected.has(card.id)));
});
