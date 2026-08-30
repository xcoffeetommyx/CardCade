(function exposeRotatingRummyRoutes(root, factory) {
  const routes = factory();
  if (typeof module === "object" && module.exports) module.exports = routes;
  root.CardcadeRotatingRummyRoutes = routes;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRotatingRummyRoutes() {
  "use strict";

  // A Route is a public objective, not a copied phase list. Every match uses
  // one ten-Route deck selected from this forty-Route pool.
  const GROUP_TYPES = Object.freeze([
    "set",
    "run",
    "color",
    "parity",
    "spectrum",
    "mirror",
    "step",
    "color-run",
    "pair-run"
  ]);

  const group = (type, size, extra = {}) => Object.freeze({ type, size, ...extra });
  const route = (id, name, description, requirements) => Object.freeze({
    id,
    name,
    description,
    requirements: Object.freeze(requirements)
  });
  const deck = (id, name, description, routes) => Object.freeze({
    id,
    name,
    description,
    routes: Object.freeze(routes)
  });

  const ROUTE_DECKS = Object.freeze([
    deck("neon-grid", "Neon Grid", "A balanced mix of easy color and number patterns.", [
      route("ng-warm-start", "Warm Start", "A pair (same number) + 3 numbers in order.", [group("set", 2), group("run", 3)]),
      route("ng-signal-stack", "Signal Stack", "4 cards of one color + a pair (same number).", [group("color", 4), group("set", 2)]),
      route("ng-odd-relay", "Odd Relay", "4 odd cards or 4 even cards + 3 of the same number.", [group("parity", 4), group("set", 3)]),
      route("ng-mirror-bridge", "Mirror Bridge", "2 pairs that add to 13 + 3 cards of one color.", [group("mirror", 4), group("color", 3)]),
      route("ng-twin-steps", "Twin Steps", "4 numbers two apart + 3 of the same number.", [group("step", 4, { step: 2 }), group("set", 3)]),
      route("ng-lane-shift", "Lane Shift", "4 same-color numbers in order + 3 of the same number.", [group("color-run", 4), group("set", 3)]),
      route("ng-spectrum-lock", "Spectrum Lock", "1 red, 1 blue, 1 green, 1 yellow + 4 numbers in order.", [group("spectrum", 4), group("run", 4)]),
      route("ng-pulse-pairing", "Pulse Pairing", "2 pairs with consecutive numbers + 4 cards of one color.", [group("pair-run", 4), group("color", 4)]),
      route("ng-crossfade", "Crossfade", "3 of the same number + 5 numbers in order.", [group("set", 3), group("run", 5)]),
      route("ng-finish-line", "Finish Line", "2 pairs that add to 13 + 4 same-color numbers in order.", [group("mirror", 4), group("color-run", 4)])
    ]),
    deck("signal-trail", "Signal Trail", "Routes built from color and number patterns.", [
      route("st-open-signal", "Open Signal", "3 cards of one color + 3 numbers in order.", [group("color", 3), group("run", 3)]),
      route("st-even-tempo", "Even Tempo", "5 odd cards or 5 even cards + a pair (same number).", [group("parity", 5), group("set", 2)]),
      route("st-pixel-pairing", "Pixel Pairing", "2 pairs with consecutive numbers + 3 of the same number.", [group("pair-run", 4), group("set", 3)]),
      route("st-four-lanes", "Four Lanes", "1 red, 1 blue, 1 green, 1 yellow + 3 of the same number.", [group("spectrum", 4), group("set", 3)]),
      route("st-dual-gradient", "Dual Gradient", "4 cards of one color + 4 numbers two apart.", [group("color", 4), group("step", 4, { step: 2 })]),
      route("st-mirror-pulse", "Mirror Pulse", "2 pairs that add to 13 + 4 numbers in order.", [group("mirror", 4), group("run", 4)]),
      route("st-same-lane", "Same Lane", "5 same-color numbers in order + 3 of the same number.", [group("color-run", 5), group("set", 3)]),
      route("st-chain-link", "Chain Link", "2 separate groups of 4 numbers in order.", [group("run", 4), group("run", 4)]),
      route("st-bright-stack", "Bright Stack", "4 of the same number + 4 cards of one color.", [group("set", 4), group("color", 4)]),
      route("st-overclock", "Overclock", "3 pairs with consecutive numbers + 3 odd cards or 3 even cards.", [group("pair-run", 6), group("parity", 3)])
    ]),
    deck("arcade-loop", "Arcade Loop", "Routes with a little more pattern matching.", [
      route("al-blue-screen", "Blue Screen", "A pair (same number) + 4 cards of one color.", [group("set", 2), group("color", 4)]),
      route("al-linked-digits", "Linked Digits", "3 numbers two apart + 3 of the same number.", [group("step", 3, { step: 2 }), group("set", 3)]),
      route("al-shift-pattern", "Shift Pattern", "4 odd cards or 4 even cards + 3 numbers in order.", [group("parity", 4), group("run", 3)]),
      route("al-lane-relay", "Lane Relay", "1 red, 1 blue, 1 green, 1 yellow + 3 numbers in order.", [group("spectrum", 4), group("run", 3)]),
      route("al-pair-pulse", "Pair Pulse", "2 pairs with consecutive numbers + 3 numbers two apart.", [group("pair-run", 4), group("step", 3, { step: 2 })]),
      route("al-crossover", "Crossover", "2 pairs that add to 13 + 3 of the same number.", [group("mirror", 4), group("set", 3)]),
      route("al-wide-signal", "Wide Signal", "5 numbers in order + 3 cards of one color.", [group("run", 5), group("color", 3)]),
      route("al-pixel-rail", "Pixel Rail", "4 same-color numbers in order + 4 odd cards or 4 even cards.", [group("color-run", 4), group("parity", 4)]),
      route("al-quad-link", "Quad Link", "4 of the same number + 4 numbers two apart.", [group("set", 4), group("step", 4, { step: 2 })]),
      route("al-afterimage", "Afterimage", "2 pairs that add to 13 + 3 of the same number + a pair.", [group("mirror", 4), group("set", 3), group("set", 2)])
    ]),
    deck("night-shift", "Night Shift", "Routes that combine easy and trickier number patterns.", [
      route("ns-soft-launch", "Soft Launch", "3 numbers in order + 3 cards of one color.", [group("run", 3), group("color", 3)]),
      route("ns-true-colors", "True Colors", "1 red, 1 blue, 1 green, 1 yellow + a pair (same number).", [group("spectrum", 4), group("set", 2)]),
      route("ns-rising-edge", "Rising Edge", "4 numbers two apart + 3 numbers in order.", [group("step", 4, { step: 2 }), group("run", 3)]),
      route("ns-echo-match", "Echo Match", "2 pairs that add to 13 + a pair (same number).", [group("mirror", 4), group("set", 2)]),
      route("ns-bright-parity", "Bright Parity", "5 odd cards or 5 even cards + 3 cards of one color.", [group("parity", 5), group("color", 3)]),
      route("ns-parallel-lines", "Parallel Lines", "4 same-color numbers in order + a separate 4-number run.", [group("color-run", 4), group("run", 4)]),
      route("ns-data-cluster", "Data Cluster", "2 groups of 3 matching numbers + 2 cards of one color.", [group("set", 3), group("set", 3), group("color", 2)]),
      route("ns-loopback", "Loopback", "3 pairs with consecutive numbers + a pair (same number).", [group("pair-run", 6), group("set", 2)]),
      route("ns-night-circuit", "Night Circuit", "2 pairs that add to 13 + 4 odd cards or 4 even cards.", [group("mirror", 4), group("parity", 4)]),
      route("ns-full-route", "Full Route", "5 numbers in order + 4 of the same number.", [group("run", 5), group("set", 4)])
    ])
  ]);

  function routeDeckById(id) {
    return ROUTE_DECKS.find((candidate) => candidate.id === id) || null;
  }

  function routeFor(deckId, routeIndex) {
    const routeDeck = routeDeckById(deckId);
    const index = Number(routeIndex);
    if (!routeDeck || !Number.isInteger(index) || index < 0 || index >= routeDeck.routes.length) return null;
    return routeDeck.routes[index];
  }

  function routeCardCount(routeValue) {
    if (!routeValue?.requirements) return 0;
    return routeValue.requirements.reduce((total, requirement) => total + Number(requirement.size || 0), 0);
  }

  return Object.freeze({ GROUP_TYPES, ROUTE_DECKS, routeDeckById, routeFor, routeCardCount });
});
