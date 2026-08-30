import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import snapRules from "../shared/snap-rules.js";
import { MatchEngine } from "../server/src/games/snap/match-engine.js";

const humans = [
  { seat: 0, name: "Tommy", type: "human" },
  { seat: 1, name: "Alex", type: "human" }
];

function scriptedDeck(...frontIds) {
  const front = new Set(frontIds);
  const cards = standard52.makeDeck();
  const byId = new Map(cards.map((card) => [card.id, card]));
  return frontIds.map((id) => byId.get(id)).concat(cards.filter((card) => !front.has(card.id)));
}

function setup({ deck = standard52.makeDeck(), players = humans, botMistake = () => false } = {}) {
  let now = 0;
  const engine = new MatchEngine({
    shuffleDeck: () => deck.slice(),
    now: () => now,
    randomDelay: () => 300,
    botMistake
  });
  const match = engine.createMatch(players);
  return {
    engine,
    match,
    setNow(value) { now = value; },
    readyAll(at = now) {
      now = at;
      for (const player of match.players) engine.ready(match, player.seat, now);
    },
    advanceTo(value) {
      now = value;
      return engine.advanceTime(match, now);
    }
  };
}

function finishFirstReaction(game) {
  game.readyAll(0);
  game.advanceTo(3_000);
  game.advanceTo(4_500);
}

test("Snap deals one complete unique Standard 52 deck as evenly as possible", () => {
  for (const playerCount of [2, 3, 4]) {
    const players = Array.from({ length: playerCount }, (_, seat) => ({ seat, name: `P${seat}`, type: "human" }));
    const { match } = setup({ players });
    const piles = match.players.flatMap((player) => player.drawPile);
    const counts = match.players.map((player) => player.drawPile.length);
    assert.equal(piles.length, 52);
    assert.equal(new Set(piles.map((card) => card.id)).size, 52);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});

test("private projections hide every upcoming card throughout Ready and countdown", () => {
  const game = setup();
  let view = game.engine.viewFor(game.match, 0);
  assert.equal(JSON.stringify(view).includes("drawPile"), false);
  assert.equal(JSON.stringify(view).includes('"id":"AS"'), false);
  assert.deepEqual(view.state.players.map((player) => player.drawCount), [26, 26]);

  game.engine.ready(game.match, 0, 0);
  assert.equal(game.match.phase, snapRules.PHASES.WAITING_FOR_READY);
  game.engine.ready(game.match, 0, 0);
  game.engine.ready(game.match, 1, 0);
  view = game.engine.viewFor(game.match, 0);
  assert.equal(view.state.phase, snapRules.PHASES.COUNTDOWN);
  assert.equal(view.state.countdownEndsAt, 3_000);
  assert.equal(view.state.currentCard, null);
});

test("all players READY before a server-owned three-second reveal", () => {
  const game = setup();
  game.engine.ready(game.match, 0, 0);
  assert.equal(game.match.phase, snapRules.PHASES.WAITING_FOR_READY);
  assert.throws(() => game.engine.snap(game.match, 0, "snap-1", 0), { code: "SNAP_NOT_AVAILABLE" });
  game.engine.ready(game.match, 1, 0);
  assert.equal(game.match.phase, snapRules.PHASES.COUNTDOWN);
  assert.equal(game.advanceTo(2_999), false);
  assert.equal(game.match.centerPile.length, 0);
  assert.equal(game.advanceTo(3_000), true);
  assert.equal(game.match.phase, snapRules.PHASES.REACTION);
  assert.equal(game.match.centerPile[0].id, "AS");
  assert.equal(game.match.reactionId, "snap-1");
});

test("matching compares only the immediately adjacent ranks and ignores suit", () => {
  assert.equal(snapRules.ranksMatch({ rank: "7", suit: "S" }, { rank: "7", suit: "H" }), true);
  assert.equal(snapRules.ranksMatch({ rank: "7", suit: "S" }, { rank: "8", suit: "S" }), false);
  assert.equal(snapRules.ranksMatch(null, { rank: "A", suit: "C" }), false);

  const game = setup({ deck: scriptedDeck("AS", "AC", "2D", "3H") });
  finishFirstReaction(game);
  game.readyAll(4_500);
  game.advanceTo(7_500);
  assert.equal(game.match.isMatch, true);
  assert.deepEqual(game.match.centerPile.slice(-2).map((card) => card.id), ["AS", "AC"]);
});

test("the first valid server SNAP wins the center pile exactly once", () => {
  const game = setup({ deck: scriptedDeck("AS", "AC", "2D", "3H") });
  finishFirstReaction(game);
  game.readyAll(4_500);
  game.advanceTo(7_500);
  const reactionId = game.match.reactionId;
  game.engine.snap(game.match, 1, reactionId, 7_700);
  assert.equal(game.match.players[1].capturedCount, 2);
  assert.equal(game.match.centerPile.length, 0);
  assert.equal(game.match.phase, snapRules.PHASES.WAITING_FOR_READY);
  assert.throws(() => game.engine.snap(game.match, 0, reactionId, 7_701), { code: "SNAP_NOT_AVAILABLE" });
  assert.equal(game.match.players.reduce((total, player) => total + player.capturedCount, 0), 2);
});

test("failed SNAP is idempotent per player and gives each offender one pending skip", () => {
  const game = setup({ deck: scriptedDeck("AS", "2C", "3D", "4H") });
  finishFirstReaction(game);
  game.readyAll(4_500);
  game.advanceTo(7_500);
  const reactionId = game.match.reactionId;
  game.engine.snap(game.match, 0, reactionId, 7_600);
  game.engine.snap(game.match, 0, reactionId, 7_601);
  game.engine.snap(game.match, 1, reactionId, 7_602);
  assert.deepEqual(game.match.failedSnapSeats, [0, 1]);
  assert.equal(game.match.players.every((player) => player.skipNextReveal), true);
  game.advanceTo(9_000);
  assert.equal(game.engine.viewFor(game.match, 0).state.actions.ready, true);
});

test("a failed SNAP skips only the offender's next contribution without removing reaction eligibility", () => {
  const game = setup({ deck: scriptedDeck("AS", "2C", "3D", "4H", "5S", "6C") });
  finishFirstReaction(game);
  game.readyAll(4_500);
  game.advanceTo(7_500); // Seat 1 reveals 2C.
  game.engine.snap(game.match, 0, game.match.reactionId, 7_600);
  game.advanceTo(9_000);
  game.readyAll(9_000);
  assert.deepEqual(game.match.lastSkippedSeats, [0]);
  assert.equal(game.match.pendingRevealSeat, 1);
  assert.equal(game.match.players[0].skipNextReveal, false);
  game.advanceTo(12_000);
  assert.equal(game.match.lastRevealSeat, 1);
  assert.equal(game.engine.viewFor(game.match, 0).state.actions.snap, true);
});

test("reaction timeouts advance automatically and stale reaction IDs are rejected", () => {
  const game = setup({ deck: scriptedDeck("AS", "2C", "3D", "4H") });
  game.readyAll(0);
  game.advanceTo(3_000);
  const staleId = game.match.reactionId;
  assert.equal(game.advanceTo(4_499), false);
  assert.equal(game.match.phase, snapRules.PHASES.REACTION);
  assert.equal(game.advanceTo(4_500), true);
  assert.equal(game.match.phase, snapRules.PHASES.WAITING_FOR_READY);
  game.readyAll(4_500);
  game.advanceTo(7_500);
  assert.throws(() => game.engine.snap(game.match, 0, staleId, 7_600), { code: "STALE_REACTION" });
});

test("the last reaction resolves before scoring, leaves neutral center cards, and supports ties", () => {
  const game = setup();
  game.match.players[0].drawPile = [{ id: "AS", rank: "A", suit: "S" }];
  game.match.players[1].drawPile = [];
  game.match.players[0].capturedCount = 4;
  game.match.players[1].capturedCount = 4;
  game.readyAll(0);
  game.advanceTo(3_000);
  assert.equal(game.match.phase, snapRules.PHASES.REACTION);
  assert.deepEqual(game.match.winners, []);
  game.advanceTo(4_500);
  assert.equal(game.match.phase, snapRules.PHASES.FINISHED);
  assert.deepEqual(game.match.winners, [0, 1]);
  assert.equal(game.match.centerPile.length, 1);
});

test("bots ready and react through the same delayed authoritative actions", () => {
  const game = setup({
    deck: scriptedDeck("AS", "AC", "2D", "3H"),
    players: [humans[0], { seat: 1, name: "Flash", type: "bot", style: "steady" }]
  });
  assert.equal(game.advanceTo(299), false);
  game.advanceTo(300);
  assert.equal(game.match.players[1].ready, true);
  game.engine.ready(game.match, 0, 300);
  game.advanceTo(3_300);
  game.advanceTo(4_800);
  game.engine.ready(game.match, 0, 4_800);
  game.advanceTo(5_100);
  game.advanceTo(8_100);
  assert.equal(game.match.isMatch, true);
  assert.equal(game.match.players[1].capturedCount, 0);
  game.advanceTo(8_399);
  assert.equal(game.match.players[1].capturedCount, 0);
  game.advanceTo(8_400);
  assert.equal(game.match.players[1].capturedCount, 2);
});
