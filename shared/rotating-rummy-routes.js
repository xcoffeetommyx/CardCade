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
    deck("neon-grid", "Neon Grid", "Balanced routes for a bright city circuit.", [
      route("ng-warm-start", "Warm Start", "A matching pair and a three-digit run.", [group("set", 2), group("run", 3)]),
      route("ng-signal-stack", "Signal Stack", "Four cards in one color lane and a matching pair.", [group("color", 4), group("set", 2)]),
      route("ng-odd-relay", "Odd Relay", "Four cards sharing parity and a three-card set.", [group("parity", 4), group("set", 3)]),
      route("ng-mirror-bridge", "Mirror Bridge", "Two mirrored value pairs and three cards in one color lane.", [group("mirror", 4), group("color", 3)]),
      route("ng-twin-steps", "Twin Steps", "A four-card step-two pattern and a three-card set.", [group("step", 4, { step: 2 }), group("set", 3)]),
      route("ng-lane-shift", "Lane Shift", "A four-digit single-color run and a three-card set.", [group("color-run", 4), group("set", 3)]),
      route("ng-spectrum-lock", "Spectrum Lock", "One card from every color lane and a four-digit run.", [group("spectrum", 4), group("run", 4)]),
      route("ng-pulse-pairing", "Pulse Pairing", "Two consecutive pairs plus four cards in one color lane.", [group("pair-run", 4), group("color", 4)]),
      route("ng-crossfade", "Crossfade", "A three-card set and a five-digit run.", [group("set", 3), group("run", 5)]),
      route("ng-finish-line", "Finish Line", "Two mirrored value pairs and a four-digit single-color run.", [group("mirror", 4), group("color-run", 4)])
    ]),
    deck("signal-trail", "Signal Trail", "Routes that reward shifting between lanes and patterns.", [
      route("st-open-signal", "Open Signal", "Three cards in one color lane and a three-digit run.", [group("color", 3), group("run", 3)]),
      route("st-even-tempo", "Even Tempo", "Five cards sharing parity and a matching pair.", [group("parity", 5), group("set", 2)]),
      route("st-pixel-pairing", "Pixel Pairing", "Two consecutive pairs and a three-card set.", [group("pair-run", 4), group("set", 3)]),
      route("st-four-lanes", "Four Lanes", "One card from every color lane and a three-card set.", [group("spectrum", 4), group("set", 3)]),
      route("st-dual-gradient", "Dual Gradient", "Four cards in one color lane and a four-card step-two pattern.", [group("color", 4), group("step", 4, { step: 2 })]),
      route("st-mirror-pulse", "Mirror Pulse", "Two mirrored value pairs and a four-digit run.", [group("mirror", 4), group("run", 4)]),
      route("st-same-lane", "Same Lane", "A five-digit single-color run and a three-card set.", [group("color-run", 5), group("set", 3)]),
      route("st-chain-link", "Chain Link", "Two separate four-digit runs.", [group("run", 4), group("run", 4)]),
      route("st-bright-stack", "Bright Stack", "A four-card set and four cards in one color lane.", [group("set", 4), group("color", 4)]),
      route("st-overclock", "Overclock", "Three consecutive pairs and three cards sharing parity.", [group("pair-run", 6), group("parity", 3)])
    ]),
    deck("arcade-loop", "Arcade Loop", "Pattern-forward routes with a little more puzzle solving.", [
      route("al-blue-screen", "Blue Screen", "A matching pair and four cards in one color lane.", [group("set", 2), group("color", 4)]),
      route("al-linked-digits", "Linked Digits", "A three-card step-two pattern and a three-card set.", [group("step", 3, { step: 2 }), group("set", 3)]),
      route("al-shift-pattern", "Shift Pattern", "Four cards sharing parity and a three-digit run.", [group("parity", 4), group("run", 3)]),
      route("al-lane-relay", "Lane Relay", "One card from every color lane and a three-digit run.", [group("spectrum", 4), group("run", 3)]),
      route("al-pair-pulse", "Pair Pulse", "Two consecutive pairs and a three-card step-two pattern.", [group("pair-run", 4), group("step", 3, { step: 2 })]),
      route("al-crossover", "Crossover", "Two mirrored value pairs and a three-card set.", [group("mirror", 4), group("set", 3)]),
      route("al-wide-signal", "Wide Signal", "A five-digit run and three cards in one color lane.", [group("run", 5), group("color", 3)]),
      route("al-pixel-rail", "Pixel Rail", "A four-digit single-color run and four cards sharing parity.", [group("color-run", 4), group("parity", 4)]),
      route("al-quad-link", "Quad Link", "A four-card set and a four-card step-two pattern.", [group("set", 4), group("step", 4, { step: 2 })]),
      route("al-afterimage", "Afterimage", "Two mirrored value pairs, a three-card set, and a matching pair.", [group("mirror", 4), group("set", 3), group("set", 2)])
    ]),
    deck("night-shift", "Night Shift", "Late-table routes that mix clean runs with unusual value signals.", [
      route("ns-soft-launch", "Soft Launch", "A three-digit run and three cards in one color lane.", [group("run", 3), group("color", 3)]),
      route("ns-true-colors", "True Colors", "One card from every color lane and a matching pair.", [group("spectrum", 4), group("set", 2)]),
      route("ns-rising-edge", "Rising Edge", "A four-card step-two pattern and a three-digit run.", [group("step", 4, { step: 2 }), group("run", 3)]),
      route("ns-echo-match", "Echo Match", "Two mirrored value pairs and a matching pair.", [group("mirror", 4), group("set", 2)]),
      route("ns-bright-parity", "Bright Parity", "Five cards sharing parity and three cards in one color lane.", [group("parity", 5), group("color", 3)]),
      route("ns-parallel-lines", "Parallel Lines", "A four-digit single-color run and a separate four-digit run.", [group("color-run", 4), group("run", 4)]),
      route("ns-data-cluster", "Data Cluster", "Two three-card sets and a matching color pair.", [group("set", 3), group("set", 3), group("color", 2)]),
      route("ns-loopback", "Loopback", "Three consecutive pairs and a matching pair.", [group("pair-run", 6), group("set", 2)]),
      route("ns-night-circuit", "Night Circuit", "Two mirrored value pairs and four cards sharing parity.", [group("mirror", 4), group("parity", 4)]),
      route("ns-full-route", "Full Route", "A five-digit run and a four-card set.", [group("run", 5), group("set", 4)])
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
