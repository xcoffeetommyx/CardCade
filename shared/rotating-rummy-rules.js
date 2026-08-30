(function exposeRotatingRummyRules(root, factory) {
  const rules = factory(
    root.CardcadeRotatingRummyDeck || (typeof require === "function" ? require("./rotating-rummy-deck.js") : null),
    root.CardcadeRotatingRummyRoutes || (typeof require === "function" ? require("./rotating-rummy-routes.js") : null)
  );
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.RotatingRummyRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRotatingRummyRules(deck, routes) {
  "use strict";

  if (!deck || !routes) throw new Error("Rotating Rummy rules require the shared deck and Routes.");

  const COLOR_INDEX = new Map(deck.COLORS.map((color, index) => [color, index]));
  const KIND_ORDER = Object.freeze({ number: 0, glitch: 1, lock: 2 });

  function sortCards(cards, mode = "rank") {
    return cards.slice().sort((left, right) => {
      const leftColor = left.color == null ? deck.COLORS.length : COLOR_INDEX.get(left.color);
      const rightColor = right.color == null ? deck.COLORS.length : COLOR_INDEX.get(right.color);
      const leftKind = KIND_ORDER[left.kind] ?? 99;
      const rightKind = KIND_ORDER[right.kind] ?? 99;
      const leftValue = left.kind === "number" ? left.value : 99;
      const rightValue = right.kind === "number" ? right.value : 99;
      if (mode === "color") {
        return leftColor - rightColor || leftKind - rightKind || leftValue - rightValue || left.id.localeCompare(right.id);
      }
      return leftKind - rightKind || leftValue - rightValue || leftColor - rightColor || left.id.localeCompare(right.id);
    });
  }

  function cardPoints(card) {
    if (card?.kind === "number") return Number(card.value) || 0;
    if (card?.kind === "glitch") return 20;
    if (card?.kind === "lock") return 15;
    return 0;
  }

  function routeCardCount(routeValue) {
    return routes.routeCardCount(routeValue);
  }

  function evaluateRoute(cards, routeValue) {
    if (!Array.isArray(cards) || !routeValue?.requirements) return { ok: false, reason: "Route unavailable", groups: [] };
    const requiredCount = routeCardCount(routeValue);
    if (cards.length !== requiredCount) {
      return { ok: false, reason: `This Route needs ${requiredCount} cards`, groups: [] };
    }
    if (new Set(cards.map((card) => card?.id)).size !== cards.length) {
      return { ok: false, reason: "A card can only fill one Route group", groups: [] };
    }
    if (cards.some((card) => !isRouteCard(card))) {
      return { ok: false, reason: "Pass cards cannot be used in a Route", groups: [] };
    }

    const solution = solveRequirements(cards, routeValue.requirements);
    return solution
      ? { ok: true, reason: routeValue.name, groups: solution }
      : { ok: false, reason: "Those cards do not complete this Route", groups: [] };
  }

  function findRouteCompletion(hand, routeValue) {
    if (!Array.isArray(hand) || !routeValue) return null;
    const count = routeCardCount(routeValue);
    if (!Number.isInteger(count) || count <= 0 || hand.length < count) return null;
    const candidates = chooseCards(hand, count);
    const matches = [];
    for (const candidate of candidates) {
      const evaluation = evaluateRoute(candidate, routeValue);
      if (evaluation.ok) matches.push({ cards: candidate, ...evaluation });
    }
    matches.sort((left, right) => {
      const leftWilds = left.cards.filter((card) => card.kind === "glitch").length;
      const rightWilds = right.cards.filter((card) => card.kind === "glitch").length;
      const leftPoints = left.cards.reduce((total, card) => total + cardPoints(card), 0);
      const rightPoints = right.cards.reduce((total, card) => total + cardPoints(card), 0);
      return leftWilds - rightWilds || leftPoints - rightPoints || idsKey(left.cards).localeCompare(idsKey(right.cards));
    });
    return matches[0] || null;
  }

  function isRouteCard(card) {
    return card?.kind === "number" || card?.kind === "glitch";
  }

  function solveRequirements(cards, requirements, requirementIndex = 0) {
    if (requirementIndex >= requirements.length) return cards.length === 0 ? [] : null;
    const requirement = requirements[requirementIndex];
    const groups = chooseCards(cards, Number(requirement.size));
    for (const group of groups) {
      if (!matchesRequirement(group, requirement)) continue;
      const used = new Set(group.map((card) => card.id));
      const remainder = cards.filter((card) => !used.has(card.id));
      const tail = solveRequirements(remainder, requirements, requirementIndex + 1);
      if (tail) return [group, ...tail];
    }
    return null;
  }

  function matchesRequirement(cards, requirement) {
    if (!Array.isArray(cards) || cards.length !== Number(requirement?.size) || cards.some((card) => !isRouteCard(card))) return false;
    return matchesRoutePattern(cards, requirement);
  }

  // A completed Route group can accept extra compatible cards during the
  // round. This is deliberately stricter than a fresh Route: Spectrum is a
  // complete four-lane pattern and cannot grow, while the other patterns can
  // extend only if the whole enlarged group still follows its rule.
  function canExtendRequirement(cards, requirement) {
    if (!Array.isArray(cards)
      || cards.length <= Number(requirement?.size)
      || cards.some((card) => !isRouteCard(card))) return false;
    if (requirement.type === "spectrum") return false;
    return matchesRoutePattern(cards, requirement);
  }

  function matchesRoutePattern(cards, requirement) {
    switch (requirement.type) {
      case "set": return matchesSet(cards);
      case "run": return matchesRun(cards);
      case "color": return matchesColor(cards);
      case "parity": return matchesParity(cards);
      case "spectrum": return matchesSpectrum(cards);
      case "mirror": return matchesMirror(cards);
      case "step": return matchesStep(cards, Number(requirement.step) || 2);
      case "color-run": return matchesColor(cards) && matchesRun(cards);
      case "pair-run": return matchesPairRun(cards);
      default: return false;
    }
  }

  function matchesSet(cards) {
    const values = numberValues(cards);
    return new Set(values).size <= 1;
  }

  function matchesRun(cards) {
    const values = numberValues(cards);
    if (new Set(values).size !== values.length) return false;
    const size = cards.length;
    return possibleStarts(size, 1).some((start) => values.every((value) => value >= start && value < start + size));
  }

  function matchesColor(cards) {
    const colors = cards.filter((card) => card.kind === "number").map((card) => card.color);
    return new Set(colors).size <= 1;
  }

  function matchesParity(cards) {
    const values = numberValues(cards);
    return values.length === 0 || values.every((value) => value % 2 === values[0] % 2);
  }

  function matchesSpectrum(cards) {
    const colors = cards.filter((card) => card.kind === "number").map((card) => card.color);
    return new Set(colors).size === colors.length && cards.length <= deck.COLORS.length;
  }

  function matchesMirror(cards) {
    if (cards.length % 2 !== 0) return false;
    const values = numberValues(cards).sort((left, right) => left - right);
    const wilds = cards.length - values.length;
    return mirrorValuesFit(values, wilds);
  }

  function mirrorValuesFit(values, wilds) {
    if (!values.length) return wilds % 2 === 0;
    const [first, ...rest] = values;
    const complement = 13 - first;
    const pairedIndex = rest.indexOf(complement);
    if (pairedIndex >= 0) {
      const paired = rest.slice();
      paired.splice(pairedIndex, 1);
      if (mirrorValuesFit(paired, wilds)) return true;
    }
    return wilds > 0 && mirrorValuesFit(rest, wilds - 1);
  }

  function matchesStep(cards, step) {
    const values = numberValues(cards);
    if (new Set(values).size !== values.length) return false;
    const size = cards.length;
    return possibleStarts(size, step).some((start) => {
      const allowed = new Set(Array.from({ length: size }, (_, index) => start + index * step));
      return values.every((value) => allowed.has(value));
    });
  }

  function matchesPairRun(cards) {
    if (cards.length % 2 !== 0) return false;
    const pairCount = cards.length / 2;
    const values = numberValues(cards);
    return possibleStarts(pairCount, 1).some((start) => {
      const counts = new Map();
      for (const value of values) {
        if (value < start || value >= start + pairCount) return false;
        counts.set(value, (counts.get(value) || 0) + 1);
        if (counts.get(value) > 2) return false;
      }
      return true;
    });
  }

  function possibleStarts(size, step) {
    const maximumStart = deck.RANKS.at(-1) - ((size - 1) * step);
    return Array.from({ length: Math.max(0, maximumStart) }, (_, index) => index + 1);
  }

  function numberValues(cards) {
    return cards.filter((card) => card.kind === "number").map((card) => Number(card.value));
  }

  function chooseCards(cards, count, start = 0, chosen = []) {
    if (count === 0) return [chosen];
    if (!Array.isArray(cards) || cards.length - start < count) return [];
    const choices = [];
    for (let index = start; index <= cards.length - count; index += 1) {
      choices.push(...chooseCards(cards, count - 1, index + 1, [...chosen, cards[index]]));
    }
    return choices;
  }

  function idsKey(cards) {
    return cards.map((card) => card.id).sort().join(",");
  }

  function recommendedDiscard(hand, routeValue) {
    const completed = findRouteCompletion(hand, routeValue);
    const protectedIds = new Set(completed?.cards?.map((card) => card.id) || []);
    return hand.slice().sort((left, right) => {
      const leftProtected = protectedIds.has(left.id);
      const rightProtected = protectedIds.has(right.id);
      if (leftProtected !== rightProtected) return leftProtected ? 1 : -1;
      return cardPoints(right) - cardPoints(left) || right.id.localeCompare(left.id);
    })[0] || null;
  }

  return Object.freeze({
    sortCards,
    cardPoints,
    routeCardCount,
    evaluateRoute,
    findRouteCompletion,
    isRouteCard,
    matchesRequirement,
    canExtendRequirement,
    recommendedDiscard
  });
});
