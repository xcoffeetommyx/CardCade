import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/rotating-rummy-deck.js";
import routes from "../shared/rotating-rummy-routes.js";
import rules from "../shared/rotating-rummy-rules.js";

const cards = new Map(deck.makeDeck().map((card) => [card.id, card]));
const card = (id) => cards.get(id);
const route = (deckId, index) => routes.routeDeckById(deckId).routes[index];

test("Routes accept Glitches as wildcards while preserving each group's identity", () => {
  const warmStart = route("neon-grid", 0);
  const selection = ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-glitch-1"].map(card);
  const evaluation = rules.evaluateRoute(selection, warmStart);
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.groups.length, 2);
  assert.equal(rules.findRouteCompletion([...selection, card("rr-red-12-a")], warmStart).cards.length, 5);
});

test("a matching pair plus four cards in one color lane completes Signal Stack", () => {
  const signalStack = route("neon-grid", 1);
  const selection = [
    "rr-red-10-a",
    "rr-red-10-b",
    "rr-yellow-1-a",
    "rr-yellow-4-a",
    "rr-yellow-7-a",
    "rr-yellow-12-a"
  ].map(card);

  const evaluation = rules.evaluateRoute(selection, signalStack);
  assert.equal(evaluation.ok, true);
  assert.deepEqual(evaluation.groups.map((group) => group.length).sort((left, right) => left - right), [2, 4]);
});

test("Locks cannot be laid into a Route and Route selections cannot reuse cards", () => {
  const warmStart = route("neon-grid", 0);
  const locked = ["rr-red-4-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-7-a", "rr-lock-1"].map(card);
  assert.equal(rules.evaluateRoute(locked, warmStart).ok, false);
  assert.equal(rules.evaluateRoute([card("rr-red-4-a"), card("rr-red-4-a"), card("rr-green-6-a"), card("rr-yellow-7-a"), card("rr-red-8-a")], warmStart).ok, false);
});

test("Route evaluator covers spectrum, mirror, step-two, and pair-run patterns", () => {
  assert.equal(rules.evaluateRoute(
    ["rr-red-1-a", "rr-blue-2-a", "rr-green-3-a", "rr-yellow-4-a", "rr-red-9-a", "rr-blue-9-a", "rr-green-9-a"].map(card),
    route("signal-trail", 3)
  ).ok, true);
  assert.equal(rules.matchesRequirement(["rr-red-2-a", "rr-blue-11-a", "rr-green-5-a", "rr-yellow-8-a"].map(card), { type: "mirror", size: 4 }), true);
  assert.equal(rules.matchesRequirement(["rr-red-2-a", "rr-blue-4-a", "rr-green-6-a", "rr-yellow-8-a"].map(card), { type: "step", size: 4, step: 2 }), true);
  assert.equal(rules.matchesRequirement(["rr-red-4-a", "rr-blue-4-a", "rr-green-5-a", "rr-yellow-5-a"].map(card), { type: "pair-run", size: 4 }), true);
});

test("Links extend compatible completed Route groups without changing fixed Spectrums", () => {
  assert.equal(rules.canExtendRequirement(
    ["rr-red-4-a", "rr-blue-4-a", "rr-green-4-a"].map(card),
    { type: "set", size: 2 }
  ), true);
  assert.equal(rules.canExtendRequirement(
    ["rr-red-6-a", "rr-blue-7-a", "rr-green-8-a", "rr-yellow-9-a"].map(card),
    { type: "run", size: 3 }
  ), true);
  assert.equal(rules.canExtendRequirement(
    ["rr-red-1-a", "rr-blue-2-a", "rr-green-3-a", "rr-yellow-4-a", "rr-red-5-a"].map(card),
    { type: "spectrum", size: 4 }
  ), false);
  assert.equal(rules.canExtendRequirement(
    ["rr-red-4-a", "rr-blue-4-a"].map(card), { type: "set", size: 2 }), false);
});

test("Rotating Rummy sorting and card points are isolated from the other deck families", () => {
  const hand = [card("rr-lock-1"), card("rr-blue-5-a"), card("rr-red-2-a"), card("rr-glitch-1")];
  assert.deepEqual(rules.sortCards(hand, "rank").map((entry) => entry.id), ["rr-red-2-a", "rr-blue-5-a", "rr-glitch-1", "rr-lock-1"]);
  assert.deepEqual(rules.sortCards(hand, "color").map((entry) => entry.id), ["rr-red-2-a", "rr-blue-5-a", "rr-glitch-1", "rr-lock-1"]);
  assert.equal(rules.cardPoints(card("rr-green-5-a")), 5);
  assert.equal(rules.cardPoints(card("rr-glitch-1")), 20);
  assert.equal(rules.cardPoints(card("rr-lock-1")), 15);
});
