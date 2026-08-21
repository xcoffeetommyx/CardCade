import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/juan-deck.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/juan/match-engine.js";

const identityShuffle = (cards) => cards.slice();
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name) => ({ seat, name, type: "bot", style: "steady" });
const catalog = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => catalog.get(id);

function matchFor(players = [human(0, "One"), human(1, "Two"), human(2, "Three")]) {
  return new MatchEngine({ shuffleDeck: identityShuffle }).createMatch(players);
}

function setTable(match, { hands, top = "blaze-3-a", activeSeat = 0, activeColor = null, stock = [] }) {
  match.players.forEach((player, index) => {
    player.hand = hands[index].map(card);
    player.juan = player.hand.length === 1;
    player.lastPlay = null;
  });
  match.stock = stock.map(card);
  match.discardPile = [card(top)];
  match.activeColor = activeColor || card(top).color;
  match.activeSeat = activeSeat;
  match.direction = 1;
  return match;
}

test("JUAN deals six cards and keeps the 80-card deck private", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(0, "One"), human(1, "Two"), human(2, "Three"), human(3, "Four")]);
  assert.ok(match.players.every((player) => player.hand.length === 6));
  assert.equal(match.stock.length, 55);
  assert.equal(match.discardPile.length, 1);
  assert.equal(match.discardPile[0].kind, "number");

  const view = engine.viewFor(match, 0, new Map([[0, true], [1, true], [2, true], [3, true]]));
  const serialized = JSON.stringify(view);
  assert.equal(view.type, "juan_match_state");
  assert.equal(view.hand.length, 6);
  assert.ok(view.state.players.every((player) => !Object.hasOwn(player, "hand")));
  for (const hiddenCard of match.players[1].hand) assert.equal(serialized.includes(`"${hiddenCard.id}"`), false);
});

test("JUAN rejects wrong turns, nonmatching cards, and an uncolored Prism", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["tide-3-a", "grove-7-a", "prism-1"], ["spark-1-a"], ["blaze-2-a"]]
  });
  assertGameError(() => engine.play(match, 1, "spark-1-a"), "NOT_YOUR_TURN");
  assertGameError(() => engine.play(match, 0, "grove-7-a"), "CARD_DOES_NOT_MATCH");
  assertGameError(() => engine.play(match, 0, "prism-1"), "COLOR_REQUIRED");
  engine.play(match, 0, "prism-1", "grove");
  assert.equal(match.activeColor, "grove");
  assert.equal(match.activeSeat, 1);
});

test("JUAN Pause, Turnabout, and Double Draw own their turn effects", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [
      ["blaze-pause", "blaze-turnabout", "blaze-double-draw", "blaze-7-a"],
      ["tide-1-a"],
      ["grove-1-a"]
    ],
    stock: ["spark-2-a", "spark-3-a", "spark-4-a"]
  });

  engine.play(match, 0, "blaze-pause");
  assert.equal(match.activeSeat, 2, "Pause skips the next seat");

  match.activeSeat = 0;
  engine.play(match, 0, "blaze-turnabout");
  assert.equal(match.direction, -1);
  assert.equal(match.activeSeat, 2, "Turnabout changes traversal before finding the next seat");

  match.activeSeat = 0;
  match.direction = 1;
  const before = match.players[1].hand.length;
  engine.play(match, 0, "blaze-double-draw");
  assert.equal(match.players[1].hand.length, before + 2);
  assert.equal(match.activeSeat, 2, "Double Draw also costs the target's turn");
});

test("JUAN recycles the discard stack when a player draws from an empty stock", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["grove-7-a", "grove-6-a"], ["spark-1-a"], ["tide-1-a"]]
  });
  match.discardPile = [card("tide-2-a"), card("spark-2-a"), card("blaze-3-a")];
  engine.draw(match, 0);
  assert.equal(match.players[0].hand.length, 3);
  assert.equal(match.discardPile.length, 1);
  assert.equal(match.discardPile[0].id, "blaze-3-a");
  assert.equal(match.activeSeat, 1);
});

test("JUAN ends when a hand empties and scores every card still held", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor(), {
    hands: [["blaze-7-a"], ["spark-double-draw", "spark-1-a"], ["prism-2"]]
  });
  engine.play(match, 0, "blaze-7-a");
  assert.equal(match.roundOver, true);
  assert.equal(match.matchOver, true);
  assert.equal(match.phase, "complete");
  assert.deepEqual(match.placements, [0, 2, 1]);
  assert.equal(match.players[0].score, 45);
  assert.match(match.lastMoveText, /wins JUAN/);
});

test("JUAN CPUs resolve exactly one turn at a time", () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = setTable(matchFor([human(0, "Host"), bot(1, "Juno"), bot(2, "Pip")]), {
    hands: [["blaze-1-a", "spark-7-a"], ["tide-3-a", "grove-7-a"], ["spark-2-a", "spark-4-a"]],
    activeSeat: 1,
    stock: ["tide-1-a"]
  });
  assert.equal(engine.runBotTurn(match), true);
  assert.ok(match.players[1].lastPlay);
  assert.equal(match.players[2].lastPlay, null);
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
