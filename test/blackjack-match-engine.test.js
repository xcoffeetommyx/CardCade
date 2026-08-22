import assert from "node:assert/strict";
import test from "node:test";
import standard52 from "../shared/standard-52.js";
import { GameError } from "../server/src/game-error.js";
import { MatchEngine } from "../server/src/games/blackjack/match-engine.js";

const catalog = new Map(standard52.makeDeck().map((card) => [card.id, card]));
const card = (id) => catalog.get(id);
const cards = (...ids) => ids.map(card);
const human = (seat, name) => ({ seat, name, type: "human" });
const bot = (seat, name, style = "steady") => ({ seat, name, type: "bot", style });
const identityShuffle = (deck) => deck.slice();

function engine() {
  return new MatchEngine({ shuffleDeck: identityShuffle });
}

function matchFor(players = [human(0, "One"), human(1, "Two")]) {
  return engine().createMatch(players);
}

function setTable(match, {
  hands,
  dealer = ["10S", "7H"],
  stock = [],
  activeSeat = 0,
  activeHandIndex = 0,
  phase = "player-turn"
} = {}) {
  match.players.forEach((player, index) => {
    player.hands = hands[index].map((ids, handIndex) => ({
      cards: cards(...ids),
      wager: 1,
      actionsTaken: 0,
      isSplitHand: handIndex > 0,
      blackjackEligible: handIndex === 0,
      doubled: false,
      surrendered: false,
      complete: false,
      finishReason: null,
      outcome: null,
      points: 0
    }));
    player.insurance = { decisionMade: false, taken: false, outcome: null, points: 0 };
    player.lastAction = null;
  });
  match.dealer = { cards: cards(...dealer), revealed: false, peeked: true };
  match.stock = cards(...stock);
  match.phase = phase;
  match.activeSeat = activeSeat;
  match.activeHandIndex = activeHandIndex;
  match.roundOver = false;
  match.lastMoveText = "Test table";
  match.log = [];
  return match;
}

test("Blackjack deals the shared 52-card deck to one through four player tables", () => {
  for (const count of [1, 2, 3, 4]) {
    const match = engine().createMatch(Array.from({ length: count }, (_, seat) => human(seat, `Player ${seat + 1}`)));
    assert.equal(match.players.length, count);
    assert.ok(match.players.every((player) => player.hands.length === 1 && player.hands[0].cards.length === 2));
    assert.equal(match.dealer.cards.length, 2);
    assert.equal(match.stock.length, 52 - (count * 2) - 2);
    assert.ok(match.players.flatMap((player) => player.hands.flatMap((hand) => hand.cards)).every((candidate) => !("rankValue" in candidate)));
  }
});

test("Blackjack private views hide dealer hole cards and every opponent hand", () => {
  const match = matchFor();
  const view = engine().viewFor(match, 0, new Map([[0, true], [1, true]]));
  const serialized = JSON.stringify(view);
  const hiddenDealer = match.dealer.cards[1].id;
  const hiddenOpponent = match.players[1].hands[0].cards.map((candidate) => candidate.id);

  assert.equal(view.type, "blackjack_match_state");
  assert.equal(view.hands[0].cards.length, 2);
  assert.equal(view.state.dealer.cards.length, 1);
  assert.equal(serialized.includes(`"${hiddenDealer}"`), false);
  for (const cardId of hiddenOpponent) assert.equal(serialized.includes(`"${cardId}"`), false, `Leaked ${cardId}`);
});

test("Blackjack supports hit, stand, and a dealer turn that settles table points", () => {
  const game = engine();
  const match = setTable(matchFor(), {
    hands: [[ ["5S", "6H"] ], [ ["10D", "8C"] ]],
    dealer: ["10S", "7H"],
    stock: ["10C"]
  });

  game.hit(match, 0);
  assert.equal(match.players[0].hands[0].cards.at(-1).id, "10C");
  assert.equal(match.phase, "player-turn");
  assert.equal(match.activeSeat, 1);
  game.stand(match, 1);
  assert.equal(match.phase, "dealer-turn");
  game.runDealerTurn(match);
  assert.equal(match.roundOver, true);
  assert.equal(match.players[0].hands[0].outcome, "win");
  assert.equal(match.players[0].score, 1);
  assert.equal(match.players[1].hands[0].outcome, "win");
});

test("Blackjack dealer keeps each drawn card and settles after reaching the stand total", () => {
  const game = engine();
  const match = setTable(matchFor([human(0, "One")]), {
    hands: [[ ["10S", "6H"] ]],
    dealer: ["5D", "6C"],
    stock: ["4H", "2S"]
  });

  game.stand(match, 0);
  assert.equal(match.phase, "dealer-turn");

  game.runDealerTurn(match);
  assert.deepEqual(match.dealer.cards.map((candidate) => candidate.id), ["5D", "6C", "2S"]);
  assert.equal(match.roundOver, false);

  game.runDealerTurn(match);
  assert.deepEqual(match.dealer.cards.map((candidate) => candidate.id), ["5D", "6C", "2S", "4H"]);
  assert.equal(match.roundOver, true);
  assert.equal(match.phase, "complete");
  assert.equal(match.dealer.cards.length, 4);
});

test("Blackjack split hands use separate wagers and split Aces automatically stand", () => {
  const game = engine();
  const match = setTable(matchFor([human(0, "One")]), {
    hands: [[ ["8S", "8H"] ]],
    dealer: ["10S", "7H"],
    stock: ["2C", "3D"]
  });

  game.split(match, 0);
  assert.equal(match.players[0].hands.length, 2);
  assert.deepEqual(match.players[0].hands.map((hand) => hand.cards.map((candidate) => candidate.id)), [["8S", "3D"], ["8H", "2C"]]);
  assert.ok(match.players[0].hands.every((hand) => hand.isSplitHand && hand.blackjackEligible === false));
  assert.equal(match.activeHandIndex, 0);

  const aces = setTable(matchFor([human(0, "One")]), {
    hands: [[ ["AS", "AH"] ]],
    dealer: ["10S", "7H"],
    stock: ["2C", "3D"]
  });
  game.split(aces, 0);
  assert.ok(aces.players[0].hands.every((hand) => hand.complete && hand.finishReason === "split-aces"));
  assert.equal(aces.phase, "dealer-turn");
});

test("Blackjack double down, late surrender, and insurance settle against table points", () => {
  const game = engine();
  const doubled = setTable(matchFor([human(0, "One")]), {
    hands: [[ ["5S", "6H"] ]],
    dealer: ["10S", "7H"],
    stock: ["10C"]
  });
  game.double(doubled, 0);
  assert.equal(doubled.players[0].hands[0].wager, 2);
  game.runDealerTurn(doubled);
  assert.equal(doubled.players[0].score, 2);

  const surrendered = setTable(matchFor([human(0, "One")]), {
    hands: [[ ["10S", "6H"] ]],
    dealer: ["10D", "7H"]
  });
  game.surrender(surrendered, 0);
  game.runDealerTurn(surrendered);
  assert.equal(surrendered.players[0].hands[0].outcome, "surrender");
  assert.equal(surrendered.players[0].score, -0.5);

  const insured = setTable(matchFor([human(0, "One"), human(1, "Two")]), {
    hands: [[ ["10S", "9H"] ], [ ["9S", "8H"] ]],
    dealer: ["AS", "KH"],
    phase: "insurance",
    activeSeat: 0,
    activeHandIndex: null
  });
  insured.dealer.peeked = false;
  game.insurance(insured, 0, true);
  game.insurance(insured, 1, false);
  assert.equal(insured.phase, "dealer-turn");
  game.runDealerTurn(insured);
  assert.equal(insured.players[0].insurance.points, 1);
  assert.equal(insured.players[0].score, 0);
  assert.equal(insured.players[1].score, -1);
});

test("Blackjack rejects invalid turns and actions outside their legal windows", () => {
  const game = engine();
  const match = setTable(matchFor(), {
    hands: [[ ["5S", "6H"] ], [ ["10D", "8C"] ]],
    dealer: ["10S", "7H"],
    stock: ["2C"]
  });
  assertGameError(() => game.hit(match, 1), "NOT_YOUR_TURN");
  assertGameError(() => game.split(match, 0), "SPLIT_NOT_ALLOWED");
  game.hit(match, 0);
  assertGameError(() => game.double(match, 0), "DOUBLE_NOT_ALLOWED");
});

test("Blackjack CPU turns advance one decision at a time and human replacement preserves hands", () => {
  const game = engine();
  const match = setTable(matchFor([human(0, "Host"), bot(1, "Linh")]), {
    hands: [[ ["10S", "7H"] ], [ ["5S", "4H"] ]],
    dealer: ["10D", "6C"],
    stock: ["2S", "7C"],
    activeSeat: 1
  });
  assert.equal(game.runBotTurn(match), true);
  assert.equal(match.players[1].hands[0].cards.length, 3);
  assert.equal(match.players[0].lastAction, null);
  assert.equal(game.replaceWithBot(match, 0), true);
  assert.equal(match.players[0].type, "bot");
  assert.equal(match.players[0].hands[0].cards.length, 2);
});

test("Blackjack carries table-point scores into a fresh shuffled round", () => {
  const game = engine();
  const match = matchFor([human(0, "One")]);
  match.roundOver = true;
  match.phase = "complete";
  match.players[0].score = 3.5;
  const next = game.nextRound(match);
  assert.equal(next.round, 2);
  assert.equal(next.players[0].score, 3.5);
  assert.equal(next.players[0].hands[0].cards.length, 2);
});

function assertGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}
