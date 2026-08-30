import assert from "node:assert/strict";
import test from "node:test";
import deck from "../shared/rotating-rummy-deck.js";
import routes from "../shared/rotating-rummy-routes.js";
import rules from "../shared/rotating-rummy-rules.js";

test("Rotating Rummy uses a complete 108-card number, Wild, and Pass deck", () => {
  const cards = deck.makeDeck();
  assert.equal(cards.length, 108);
  assert.equal(new Set(cards.map((card) => card.id)).size, 108);
  assert.deepEqual(deck.COLORS, ["red", "blue", "green", "yellow"]);
  assert.equal(cards.filter((card) => card.kind === "number").length, 96);
  assert.equal(cards.filter((card) => card.kind === "glitch").length, 8);
  assert.equal(cards.filter((card) => card.kind === "lock").length, 4);
  for (const color of deck.COLORS) {
    for (const value of deck.RANKS) {
      assert.equal(cards.filter((card) => card.kind === "number" && card.color === color && card.value === value).length, 2);
    }
  }
  assert.equal(deck.cardLong("rr-red-2-a"), "Red 2");
  assert.equal(deck.cardLong("rr-green-5-b"), "Green 5");
  assert.equal(deck.cardLong("rr-glitch-2"), "Wild card");
  assert.equal(deck.cardLong("rr-lock-2"), "Pass card");
});

test("Rotating Rummy supplies four original ten-Route decks", () => {
  assert.equal(routes.ROUTE_DECKS.length, 4);
  assert.equal(routes.ROUTE_DECKS.reduce((total, routeDeck) => total + routeDeck.routes.length, 0), 40);
  for (const routeDeck of routes.ROUTE_DECKS) {
    assert.equal(routeDeck.routes.length, 10);
    for (const route of routeDeck.routes) {
      assert.ok(route.name.length > 0);
      assert.ok(route.description.length > 0);
      assert.ok(routes.routeCardCount(route) >= 5);
      assert.ok(routes.routeCardCount(route) <= 9, "a Route leaves a card available for the required discard");
    }
  }
});

test("Route descriptions use casual player language instead of rule-engine jargon", () => {
  const descriptions = routes.ROUTE_DECKS.flatMap((routeDeck) => routeDeck.routes.map((route) => route.description)).join(" ");
  assert.doesNotMatch(descriptions, /\bparity\b|\bspectrum\b|\bmirrored\b|\bstep-two\b|\bcolor lane\b|\bset\b/i);
  assert.match(descriptions, /odd cards or .* even cards/i);
  assert.match(descriptions, /pairs that add to 13/i);
  assert.match(descriptions, /numbers two apart/i);
});

test("every Route has a legal card construction and at least one Linkable group", () => {
  for (const routeDeck of routes.ROUTE_DECKS) {
    for (const route of routeDeck.routes) {
      let available = deck.makeDeck();
      const selection = [];
      for (const requirement of route.requirements) {
        const built = buildRequirement(requirement, available);
        assert.ok(built, `${route.id} should construct ${requirement.type}`);
        selection.push(...built.cards);
        available = built.remaining;
      }
      assert.equal(rules.evaluateRoute(selection, route).ok, true, `${route.id} should be completable`);
      assert.ok(route.requirements.some((requirement) => requirement.type !== "spectrum"), `${route.id} should leave a Route group that can accept Links`);
    }
  }
});

function buildRequirement(requirement, available) {
  const size = Number(requirement.size);
  const number = (predicate) => (card) => card.kind === "number" && predicate(card);
  const repeated = (predicate) => Array.from({ length: size }, () => predicate);
  const sequential = (start, step = 1) => Array.from({ length: size }, (_, index) => number((card) => card.value === start + (index * step)));
  const byColor = (color) => number((card) => card.color === color);

  switch (requirement.type) {
    case "set":
      for (const value of deck.RANKS) {
        const built = takeMatching(available, repeated(number((card) => card.value === value)));
        if (built) return built;
      }
      return null;
    case "run":
      for (let start = 1; start <= 13 - size; start += 1) {
        const built = takeMatching(available, sequential(start));
        if (built) return built;
      }
      return null;
    case "color":
      for (const color of deck.COLORS) {
        const built = takeMatching(available, repeated(byColor(color)));
        if (built) return built;
      }
      return null;
    case "parity":
      for (const parity of [0, 1]) {
        const built = takeMatching(available, repeated(number((card) => card.value % 2 === parity)));
        if (built) return built;
      }
      return null;
    case "spectrum":
      return takeMatching(available, deck.COLORS.map((color) => byColor(color)));
    case "mirror": {
      const predicates = [];
      for (let value = 1; value <= size / 2; value += 1) {
        predicates.push(number((card) => card.value === value), number((card) => card.value === 13 - value));
      }
      return takeMatching(available, predicates);
    }
    case "step":
      for (let start = 1; start <= 13 - ((size - 1) * (requirement.step || 2)); start += 1) {
        const built = takeMatching(available, sequential(start, requirement.step || 2));
        if (built) return built;
      }
      return null;
    case "color-run":
      for (const color of deck.COLORS) {
        for (let start = 1; start <= 13 - size; start += 1) {
          const built = takeMatching(available, Array.from({ length: size }, (_, index) => number((card) => card.color === color && card.value === start + index)));
          if (built) return built;
        }
      }
      return null;
    case "pair-run": {
      const pairCount = size / 2;
      for (let start = 1; start <= 13 - pairCount; start += 1) {
        const predicates = [];
        for (let value = start; value < start + pairCount; value += 1) {
          predicates.push(number((card) => card.value === value), number((card) => card.value === value));
        }
        const built = takeMatching(available, predicates);
        if (built) return built;
      }
      return null;
    }
    default:
      return null;
  }
}

function takeMatching(available, predicates) {
  const remaining = available.slice();
  const cards = [];
  for (const predicate of predicates) {
    const index = remaining.findIndex(predicate);
    if (index < 0) return null;
    cards.push(remaining.splice(index, 1)[0]);
  }
  return { cards, remaining };
}
