import test from "node:test";
import assert from "node:assert/strict";
import standard52 from "../shared/standard-52.js";
import trick from "../shared/trick-rules.js";
import fleepDeck from "../shared/juan-fleep-deck.js";
import { TrickEngine } from "../server/src/games/expansion/trick-engine.js";
import { SolitaireEngine } from "../server/src/games/expansion/solitaire-engine.js";
import { FleepEngine } from "../server/src/games/expansion/fleep-engine.js";
import { ExpansionRuntime } from "../server/src/games/expansion/runtime.js";

const humans = n => Array.from({ length: n }, (_, seat) => ({ seat, name: `Player ${seat}`, type: "human" }));
const card = id => ({ ...standard52.makeDeck().find(c => c.id === id), faceUp: true });
function conserve(cards, count) { assert.equal(cards.length, count); assert.equal(new Set(cards.map(c => c.id)).size, count); }

for (const gameId of ["spades", "hearts"]) {
  test(`${gameId}: complete CPU matches preserve cards, scoring, private views, and timed tricks`, () => {
    let now = 0;
    const engine = new TrickEngine(gameId, { now: () => now });
    const m = engine.create(humans(4).map(p => ({ ...p, type: "bot" })));
    let steps = 0;
    while (!m.matchOver && steps++ < 10000) {
      conserve([...m.players.flatMap(p => p.hand), ...m.trick.map(p => p.card), ...m.captured], 52);
      const view = engine.view(m, 0);
      assert.equal(view.hand.length, m.players[0].hand.length);
      assert.ok(view.state.players.every(p => !('hand' in p) && !('pass' in p)));
      if (m.phase === "trick-result") {
        const copy = structuredClone(m);
        assert.equal(engine.step(m), false);
        assert.deepEqual(m, copy);
        now += 1200;
      }
      if (m.roundOver) {
        assert.equal(m.players.reduce((n, p) => n + p.tricks, 0), 13);
        if (gameId === "hearts") assert.equal(m.players.reduce((n, p) => n + p.penalty, 0), 26);
        engine.act(m, 0, { type: "next_round" });
      } else assert.equal(engine.step(m), true);
    }
    assert.equal(m.matchOver, true); assert.ok(m.winners.length);
  });
}

test("Spades requires following suit, restricts leads, and compares trump", () => {
  const hand = [card("2S"), card("AH"), card("3C")];
  assert.deepEqual(trick.legal(hand, [], "spades", false).map(c => c.id), ["AH", "3C"]);
  assert.deepEqual(trick.legal(hand, [{ seat: 2, card: card("KH") }], "spades", true).map(c => c.id), ["AH"]);
  assert.equal(trick.winner([{ seat: 0, card: card("AH") }, { seat: 1, card: card("2S") }, { seat: 2, card: card("KC") }], "S"), 1);
  assert.equal(trick.legal([card("2S")], [], "spades", false).length, 1);
});

test("Spades scores made and failed contracts, nil, and bag rollover independently", () => {
  const teams = [{ id: 0, score: 0, bags: 9 }, { id: 1, score: 0, bags: 0 }];
  const p = [{ team: 0, bid: 0, tricks: 1 }, { team: 0, bid: 4, tricks: 4 }, { team: 1, bid: 5, tricks: 3 }, { team: 1, bid: 0, tricks: 0 }];
  const scores = trick.scoreSpades(p, teams);
  assert.deepEqual(scores.map(t => [t.score, t.bags]), [[-159, 0], [50, 0]]);
  p[1].tricks = 3;
  assert.equal(trick.scoreSpades(p, teams)[0].score, -239, "failed nil trick cannot satisfy partner contract");
});

test("Hearts transfers committed passes together and hides pending selections", () => {
  const engine = new TrickEngine("hearts"); const m = engine.create(humans(4));
  const original = structuredClone(m.players.map(p => p.hand));
  for (let seat = 0; seat < 3; seat++) {
    engine.act(m, seat, { type: "pass_cards", cardIds: original[seat].slice(0, 3).map(c => c.id) });
    assert.deepEqual(m.players.map(p => p.hand), original);
    assert.ok(engine.view(m, 3).state.players.every(p => !('pass' in p)));
  }
  assert.throws(() => engine.act(m, 0, { type: "pass_cards", cardIds: original[0].slice(3, 6).map(c => c.id) }));
  engine.act(m, 3, { type: "pass_cards", cardIds: original[3].slice(0, 3).map(c => c.id) });
  for (let seat = 0; seat < 4; seat++) assert.ok(original[(seat + 3) % 4].slice(0, 3).every(c => m.players[seat].hand.some(v => v.id === c.id)));
  assert.equal(engine.legal(m, m.players.find(p => p.seat === m.activeSeat))[0].id, "2C");
});

test("Hearts first trick allows penalty only when forced; queen does not break hearts", () => {
  const engine = new TrickEngine("hearts"); const m = engine.create(humans(4));
  m.phase = "playing"; m.activeSeat = 0; m.trick = [{ seat: 1, card: card("2C") }];
  m.players[0].hand = [card("QS"), card("AH"), card("3D")];
  assert.deepEqual(engine.legal(m, m.players[0]).map(c => c.id), ["3D"]);
  m.players[0].hand = [card("QS"), card("AH")];
  assert.equal(engine.legal(m, m.players[0]).length, 2);
  engine.act(m, 0, { type: "play", cardId: "QS" }); assert.equal(m.broken, false);
});

test("Hearts moon adds 26 to opponents and supports tied lowest-score winners", () => {
  const engine = new TrickEngine("hearts"); const m = engine.create(humans(4));
  m.players.forEach(p => { p.score = p.seat === 3 ? 90 : 0; p.penalty = p.seat === 0 ? 26 : 0; });
  m.trick = [{ seat: 1, card: card("2C") }]; m.trickWinner = 1; m.trickNumber = 13;
  engine.resolve(m);
  assert.deepEqual(m.players.map(p => p.score), [0, 26, 26, 116]); assert.deepEqual(m.winners, [0]);
});

for (const drawCount of [1, 3]) test(`Solitaire draw-${drawCount} recycling and undo preserve exact card order`, () => {
  const engine = new SolitaireEngine({ shuffleDeck: cards => cards });
  const m = engine.create(humans(1), { drawCount }); const initial = structuredClone(m.stock);
  const view = engine.view(m);
  assert.equal(view.state.tableau.flat().filter(c => !c.faceUp).length, 21);
  assert.ok(view.state.tableau.flat().filter(c => !c.faceUp).every(c => !c.id && !c.rank));
  assert.ok(!('stock' in view.state) && !('original' in view.state) && !('history' in view.state));
  engine.act(m, 0, { type: "draw" }); assert.equal(m.waste.length, drawCount);
  engine.act(m, 0, { type: "undo" }); assert.deepEqual(m.stock, initial); assert.equal(m.moves, 0);
  while (m.stock.length) engine.act(m, 0, { type: "draw" });
  engine.act(m, 0, { type: "draw" }); assert.deepEqual(m.stock, initial);
  conserve([...m.stock, ...m.waste, ...m.tableau.flat(), ...m.foundations.flat()], 52);
  engine.act(m, 0, { type: "restart" }); assert.deepEqual(m.stock, initial); assert.equal(m.history.length, 0);
});

test("Solitaire validates runs, empty kings, exposure, and reversible foundation moves", () => {
  const engine = new SolitaireEngine(); const m = engine.create(humans(1));
  m.tableau = [[{ ...card("2C"), faceUp: false }, card("KH"), card("QC")], [], [card("KS")], [], [], [], []];
  const from = { pile: "tableau", column: 0, index: 1 }, to = { pile: "tableau", column: 1 };
  assert.equal(engine.canMove(m, from, to), true);
  assert.equal(engine.canMove(m, { ...from, index: 2 }, to), false);
  engine.act(m, 0, { type: "move", from, to }); assert.equal(m.tableau[0][0].faceUp, true);
  engine.act(m, 0, { type: "undo" }); assert.equal(m.tableau[0][0].faceUp, false);
  m.waste = [card("AH")]; engine.act(m, 0, { type: "move", from: { pile: "waste" }, to: { pile: "foundations", column: 0 } });
  m.tableau[2] = [card("2C")];
  engine.act(m, 0, { type: "move", from: { pile: "foundations", column: 0 }, to: { pile: "tableau", column: 2 } });
  assert.equal(m.tableau[2].at(-1).id, "AH");
});

test("Solitaire auto-finish uses legal moves and undo restores the whole operation", () => {
  const engine = new SolitaireEngine(); const m = engine.create(humans(1));
  m.stock = []; m.waste = []; m.foundations = [[], [], [], []];
  m.tableau = standard52.SUITS.map(suit => standard52.RANKS.slice().reverse().map(rank => card(rank + suit))).concat([[], [], []]);
  assert.equal(engine.view(m).state.actions.autoFinish, true);
  engine.act(m, 0, { type: "auto_finish" }); assert.equal(m.matchOver, true); conserve(m.foundations.flat(), 52);
  engine.act(m, 0, { type: "undo" }); assert.equal(m.matchOver, false); assert.equal(m.tableau.flat().length, 52);
});

test("FLEEP has 112 faces per side and opaque unique physical pairings", () => {
  for (const side of ["light", "dark"]) {
    const faces = fleepDeck.inventory(side); assert.equal(faces.length, 112);
    assert.equal(faces.filter(c => c.kind === "number").length, 72);
    assert.equal(faces.filter(c => c.kind === "fleep").length, 8);
    assert.ok(faces.filter(c => c.kind === "number").every(c => c.value >= 1 && c.value <= 9));
  }
  const engine = new FleepEngine(); const m = engine.create(humans(4));
  const cards = [...m.stock, ...m.discard, ...m.players.flatMap(p => p.hand)]; conserve(cards, 112);
  assert.ok(cards.every(c => c.light && c.dark && !c.id.includes(c.light.color)));
  const view = engine.view(m, 0);
  assert.ok(view.hand.every(c => !c.light && !c.dark));
  assert.ok(view.state.players[1].outward.every(c => c.side !== m.side));
  assert.deepEqual(view.state.players[0].outward, []);
  assert.ok(!('stock' in view.state));
});

function fleepFixture(side = "light") {
  const engine = new FleepEngine(); const m = engine.create(humans(2));
  m.drawEvents = []; m.drawSequence = 0; m.colorChoice = null; m.colorSequence = 0;
  m.side = side; m.phase = "playing"; m.activeSeat = 0; m.call = null; m.pending = null; m.drawnId = null;
  m.activeColor = fleepDeck.COLORS[side][0]; m.direction = 1;
  const make = (id, kind, color = m.activeColor, value = null) => ({ id, [side]: { kind, color, value, side }, [side === "light" ? "dark" : "light"]: { kind: "number", value: 3, color: fleepDeck.COLORS[side === "light" ? "dark" : "light"][0], side: side === "light" ? "dark" : "light" } });
  m.discard = [make("bottom", "number", m.activeColor, 5), make("top", "number", m.activeColor, 6)];
  m.stock = Array.from({ length: 12 }, (_, i) => make(`stock${i}`, "number", fleepDeck.COLORS[side][i % 4], 2));
  m.players[0].hand = [make("action", "fleep"), make("left", "number", fleepDeck.COLORS[side][1], 9)];
  m.players[1].hand = [make("target", "number", m.activeColor, 1)];
  return { engine, m, make };
}

test("FLEEP reverses both piles, changes all active faces, and preserves IDs", () => {
  const { engine, m } = fleepFixture(); const before = m.stock.map(c => c.id);
  engine.act(m, 0, { type: "play", cardId: "action", declareJuan: true });
  assert.equal(m.side, "dark"); assert.deepEqual(m.stock.map(c => c.id), before.reverse());
  assert.deepEqual(m.discard.map(c => c.id), ["action", "top", "bottom"]);
  assert.equal(engine.view(m, 0).state.topCard.id, "bottom");
});

for (const [side, kind, count] of [["light", "draw-one", 1], ["dark", "draw-five", 5]]) test(`FLEEP ${kind} resolves last-card penalty before active-side scoring`, () => {
  const { engine, m, make } = fleepFixture(side); m.players[0].hand = [make("action", kind)];
  engine.act(m, 0, { type: "play", cardId: "action" });
  assert.equal(m.players[1].hand.length, count + 1); assert.equal(m.roundOver, true);
  assert.equal(m.players[0].score, m.players[1].hand.reduce((n, c) => n + fleepDeck.points(c[side]), 0));
});

for (const kind of ["wild-two", "wild-color"]) for (const guilty of [false, true]) test(`FLEEP ${kind} challenge ${guilty ? 'succeeds' : 'fails'} without broadcasting evidence`, () => {
  const side = kind === "wild-two" ? "light" : "dark";
  const { engine, m, make } = fleepFixture(side);
  m.players[0].hand = [make("action", kind, null), make("left", "number", fleepDeck.COLORS[side][guilty ? 0 : 1], 9)];
  engine.act(m, 0, { type: "play", cardId: "action", chosenColor: fleepDeck.COLORS[side][2], declareJuan: true });
  assert.ok(!('evidence' in engine.view(m, 1).state.pending) && !('illegal' in engine.view(m, 1).state.pending));
  engine.act(m, 1, { type: "challenge" });
  assert.equal(m.phase, "challenge-review"); assert.equal(m.activeSeat, 1);
  assert.ok(engine.view(m, 1).challengeHand?.length); assert.equal(engine.view(m, 0).challengeHand, null);
  const resumed = structuredClone(m);
  engine.act(resumed, 1, { type: "acknowledge_challenge" }); assert.equal(resumed.activeSeat, guilty ? 1 : 0);
  assert.equal(engine.view(resumed, 1).challengeHand, null);
  if (guilty) assert.ok(m.players[0].hand.length > 1); else assert.ok(m.players[1].hand.length >= 4);
});

test("FLEEP skip-all returns play, flip-to-wild requests color, and exhausted color draws terminate", () => {
  const { engine, m, make } = fleepFixture("dark");
  m.players[0].hand[0] = make("action", "pause-all");
  engine.act(m, 0, { type: "play", cardId: "action", declareJuan: true }); assert.equal(m.activeSeat, 0);
  const fixture = fleepFixture(); fixture.m.discard[0].dark = { color: null, kind: "prism", value: null, side: "dark" };
  fixture.engine.act(fixture.m, 0, { type: "play", cardId: "action", declareJuan: true });
  assert.equal(fixture.m.phase, "choose-color");
  fixture.engine.act(fixture.m, 1, { type: "choose_color", color: "dusk" }); assert.equal(fixture.m.activeColor, "dusk");
  m.stock = []; m.discard = [m.discard.at(-1)];
  assert.equal(engine.drawCards(m, 1, 0, "lagoon"), 0);
});

test("FLEEP CPU call timer stops scheduling when only humans have an unresolved call", () => {
  let now = 0; const engine = new FleepEngine({ now: () => now }); const m = engine.create(humans(2));
  m.call = { seat: 0, at: 2600 }; m.players[0].hand = m.players[0].hand.slice(0, 1);
  assert.equal(engine.delay(m, 1100), 2600); now = 2600;
  assert.equal(engine.step(m), true); assert.equal(engine.delay(m, 1100), null);
  engine.act(m, 0, { type: "juan_call" }); assert.equal(m.call, null);
});

test("Expansion runtime rejects stale and illegal actions atomically and restores snapshots", () => {
  const room = { code: "TESTAA", gameId: "solitaire", players: [{ ...humans(1)[0], isYou: true, role: "host" }], capacity: 1, gameSettings: { botCount: 0, drawCount: 3 } };
  const runtime = new ExpansionRuntime({ gameId: "solitaire", engine: new SolitaireEngine() }); runtime.start(room);
  const before = runtime.snapshot(room.code);
  assert.throws(() => runtime.act(room, { type: "draw", revision: 99 }), { code: "STALE_ACTION" });
  assert.throws(() => runtime.act(room, { type: "move", from: { pile: "waste" }, to: { pile: "foundations", column: 0 }, revision: 0 }));
  assert.deepEqual(runtime.snapshot(room.code), before);
  runtime.act(room, { type: "draw", revision: 0 });
  const restored = new ExpansionRuntime({ gameId: "solitaire", engine: new SolitaireEngine(), restoredMatches: [{ code: room.code, gameId: "solitaire", state: runtime.snapshot(room.code) }] });
  assert.deepEqual(restored.view(room), runtime.view(room));
  restored.act(room, { type: "undo", revision: 1 }); assert.deepEqual(restored.snapshot(room.code).stock, before.stock);
});

test("FLEEP CPU simulations finish four rounds and preserve 112 paired cards", () => {
  let now = 0; const engine = new FleepEngine({ now: () => now });
  for (let game = 0; game < 5; game++) {
    const m = engine.create(humans(game % 3 + 2).map(p => ({ ...p, type: "bot" })));
    const pairs = new Map([...m.stock, ...m.discard, ...m.players.flatMap(p => p.hand)].map(c => [c.id, JSON.stringify(c)]));
    let steps = 0;
    while (!m.matchOver && steps++ < 10000) {
      const cards = [...m.stock, ...m.discard, ...m.players.flatMap(p => p.hand)]; conserve(cards, 112);
      assert.ok(cards.every(c => JSON.stringify(c) === pairs.get(c.id)));
      if (m.roundOver) engine.act(m, 0, { type: "next_round" });
      else { now += 3000; assert.equal(engine.step(m), true); }
    }
    assert.equal(m.matchOver, true); assert.equal(m.round, 4); assert.ok(m.winners.length);
  }
});


test("FLEEP explains a seven-card Draw Color and a subsequent two-card penalty exactly once", () => {
  const { engine, m, make } = fleepFixture("dark");
  m.players[1].hand = Array.from({ length: 4 }, (_, i) => make(`held${i}`, "number", "lagoon", 3));
  m.players[0].hand = [make("action", "wild-color", null), make("spare", "number", "lagoon", 3)];
  m.stock = [make("stop", "number", "dusk", 1), ...Array.from({ length: 6 }, (_, i) => make(`draw${i}`, "number", "ember", 2))];
  engine.act(m, 0, { type: "play", cardId: "action", chosenColor: "dusk", declareJuan: true });
  engine.act(m, 1, { type: "accept" });
  assert.equal(m.players[1].hand.length, 11);
  assert.equal(m.drawEvents.at(-1).count, 7);
  assert.match(m.drawEvents.at(-1).reason, /draw through Dusk/);
  assert.equal(m.drawEvents.at(-1).handCount, 11);
  const saved = structuredClone(m);
  assert.throws(() => engine.act(m, 1, { type: "accept" }));
  assert.deepEqual(m.drawEvents, saved.drawEvents);
  // Follow with a light-side draw Wild; each physical penalty has one event.
  m.side = "light"; m.activeColor = "blaze"; m.activeSeat = 0;
  const wild = { id: "two", light: { kind: "wild-two", color: null, side: "light" }, dark: { kind: "number", color: "dusk", value: 1, side: "dark" } };
  m.players[0].hand.push(wild);
  engine.act(m, 0, { type: "play", cardId: "two", chosenColor: "tide", declareJuan: true });
  engine.act(m, 1, { type: "accept" });
  assert.equal(m.players[1].hand.length, 13);
  assert.equal(m.drawEvents.at(-1).count, 2);
  const view = engine.view(m, 1);
  assert.equal(view.state.drawEvents.length, 2);
  assert.ok(view.state.drawEvents.every(e => !('cards' in e)));
});

test("FLEEP clears Call JUAN after drawing and ignores stale restored calls", () => {
  const { engine, m } = fleepFixture();
  m.players[1].hand = m.players[1].hand.slice(0, 1); m.call = { seat: 1, at: 0 };
  engine.drawCards(m, 1, 5, null, "Draw Five");
  assert.equal(m.call, null); assert.equal(m.players[1].hand.length, 6);
  m.call = { seat: 1, at: 0 }; // Old snapshot with a now-invalid call.
  engine.missedCall(m);
  assert.equal(m.players[1].hand.length, 6); assert.equal(m.call, null);
  assert.equal(m.drawEvents.length, 1);
});

test("FLEEP failed color challenge separately accounts for its extra two cards", () => {
  const { engine, m, make } = fleepFixture("dark");
  m.players[0].hand = [make("action", "wild-color", null), make("left", "number", "lagoon", 9)];
  engine.act(m, 0, { type: "play", cardId: "action", chosenColor: "dusk", declareJuan: true });
  const before = m.players[1].hand.length;
  engine.act(m, 1, { type: "challenge" });
  const events = m.drawEvents.filter(e => e.seat === 1);
  assert.equal(events.length, 2); assert.equal(events[1].count, 2);
  assert.match(events[1].reason, /Failed challenge/);
  assert.equal(m.players[1].hand.length - before, events.reduce((sum, e) => sum + e.count, 0));
  const restored = structuredClone(m); const counts = restored.players.map(p => p.hand.length);
  engine.act(restored, 1, { type: "acknowledge_challenge" });
  assert.deepEqual(restored.players.map(p => p.hand.length), counts);
  assert.deepEqual(restored.drawEvents, m.drawEvents);
});

test("FLEEP publishes a stable color reveal event for dark Wilds and flipped Wild choices", () => {
  const { engine, m, make } = fleepFixture("dark");
  m.players[0].hand[0] = make("action", "prism", null);
  engine.act(m, 0, { type: "play", cardId: "action", chosenColor: "orchid", declareJuan: true });
  assert.equal(m.colorChoice.color, "orchid"); assert.equal(m.colorChoice.seat, 0);
  const reveal = structuredClone(m.colorChoice);
  engine.act(m, 1, { type: "draw" }); assert.deepEqual(m.colorChoice, reveal);
  m.phase = "choose-color"; m.activeSeat = 1;
  engine.act(m, 1, { type: "choose_color", color: "dusk" });
  assert.notEqual(m.colorChoice.id, reveal.id); assert.equal(m.colorChoice.color, "dusk");
  assert.deepEqual(engine.view(m, 0).state.colorChoice, m.colorChoice);
});
