(function exposeHoldemRules(root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.CardcadeHoldemRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHoldemRules() {
  "use strict";

  // Poker consumes CardcadeStandard52's physical cards exactly as they are.
  // This module only owns Texas Hold'em ranking and fixed-limit table rules.
  const STARTING_TABLE_POINTS = 100;
  const SMALL_BLIND = 1;
  const BIG_BLIND = 2;
  const SMALL_BET = 2;
  const BIG_BET = 4;
  const MAX_BETS_PER_STREET = 4;
  const STREETS = Object.freeze(["preflop", "flop", "turn", "river"]);
  const HAND_CATEGORY = Object.freeze({
    "high-card": 0,
    pair: 1,
    "two-pair": 2,
    "three-kind": 3,
    straight: 4,
    flush: 5,
    "full-house": 6,
    "four-kind": 7,
    "straight-flush": 8
  });
  const CATEGORY_LABEL = Object.freeze({
    "high-card": "High card",
    pair: "Pair",
    "two-pair": "Two pair",
    "three-kind": "Three of a kind",
    straight: "Straight",
    flush: "Flush",
    "full-house": "Full house",
    "four-kind": "Four of a kind",
    "straight-flush": "Straight flush"
  });
  const RANK_VALUE = Object.freeze({
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  });

  function rankValue(card) {
    return RANK_VALUE[String(card?.rank || "").toUpperCase()] || 0;
  }

  function streetBetSize(street) {
    return ["turn", "river"].includes(String(street)) ? BIG_BET : SMALL_BET;
  }

  function nextStreet(street) {
    const index = STREETS.indexOf(String(street));
    return index >= 0 && index < STREETS.length - 1 ? STREETS[index + 1] : null;
  }

  function communityCardCount(street) {
    return Object.freeze({ preflop: 0, flop: 3, turn: 4, river: 5 })[String(street)] ?? 0;
  }

  function evaluateFive(cards) {
    if (!Array.isArray(cards) || cards.length !== 5) {
      throw new RangeError("Texas Hold'em hand evaluation requires exactly five cards.");
    }

    const normalized = cards.map((card) => normalizeCard(card));
    const values = normalized.map(rankValue);
    if (values.some((value) => value === 0)) {
      throw new TypeError("Texas Hold'em cards must use standard card ranks.");
    }

    const orderedValues = [...values].sort((left, right) => right - left);
    const counts = countValues(values);
    const groups = [...counts.entries()]
      .map(([value, count]) => ({ value: Number(value), count }))
      .sort((left, right) => right.count - left.count || right.value - left.value);
    const flush = normalized.every((card) => card.suit === normalized[0].suit);
    const straightHigh = findStraightHigh(values);
    let category = "high-card";
    let tiebreakers = orderedValues;

    if (flush && straightHigh) {
      category = "straight-flush";
      tiebreakers = [straightHigh];
    } else if (groups[0].count === 4) {
      category = "four-kind";
      tiebreakers = [groups[0].value, groups[1].value];
    } else if (groups[0].count === 3 && groups[1].count === 2) {
      category = "full-house";
      tiebreakers = [groups[0].value, groups[1].value];
    } else if (flush) {
      category = "flush";
    } else if (straightHigh) {
      category = "straight";
      tiebreakers = [straightHigh];
    } else if (groups[0].count === 3) {
      category = "three-kind";
      tiebreakers = [groups[0].value, ...groups.slice(1).map((group) => group.value)];
    } else if (groups[0].count === 2 && groups[1].count === 2) {
      category = "two-pair";
      tiebreakers = [groups[0].value, groups[1].value, groups[2].value];
    } else if (groups[0].count === 2) {
      category = "pair";
      tiebreakers = [groups[0].value, ...groups.slice(1).map((group) => group.value)];
    }

    return freezeEvaluation({
      category,
      categoryValue: HAND_CATEGORY[category],
      label: CATEGORY_LABEL[category],
      tiebreakers,
      cardIds: normalized.map((card) => card.id)
    });
  }

  function bestHand(cards) {
    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
      throw new RangeError("Texas Hold'em chooses the best five cards from five to seven cards.");
    }

    let best = null;
    forEachCombination(cards, 5, (fiveCards) => {
      const evaluation = evaluateFive(fiveCards);
      if (!best || compareEvaluations(evaluation, best) > 0) best = evaluation;
    });
    return best;
  }

  function compareHands(left, right) {
    return compareEvaluations(asEvaluation(left), asEvaluation(right));
  }

  function compareEvaluations(left, right) {
    if (left.categoryValue !== right.categoryValue) {
      return left.categoryValue > right.categoryValue ? 1 : -1;
    }

    const length = Math.max(left.tiebreakers.length, right.tiebreakers.length);
    for (let index = 0; index < length; index += 1) {
      const leftValue = left.tiebreakers[index] || 0;
      const rightValue = right.tiebreakers[index] || 0;
      if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
    }
    return 0;
  }

  function blindPositions(activeSeats, dealerSeat) {
    const seats = normalizeSeats(activeSeats);
    if (seats.length < 2) {
      throw new RangeError("Texas Hold'em needs at least two active seats.");
    }

    const dealerIndex = Math.max(0, seats.indexOf(dealerSeat));
    const dealer = seats[dealerIndex];
    const at = (offset) => seats[(dealerIndex + offset) % seats.length];
    const headsUp = seats.length === 2;
    const smallBlindSeat = headsUp ? dealer : at(1);
    const bigBlindSeat = headsUp ? at(1) : at(2);

    return Object.freeze({
      dealerSeat: dealer,
      smallBlindSeat,
      bigBlindSeat,
      firstPreflopSeat: headsUp ? dealer : at(3),
      firstPostflopSeat: headsUp ? at(1) : at(1)
    });
  }

  function availableActions({
    street = "preflop",
    currentBet = 0,
    contribution = 0,
    stack = 0,
    betCount = 0,
    canAct = true
  } = {}) {
    const safeCurrentBet = nonNegativeNumber(currentBet);
    const safeContribution = nonNegativeNumber(contribution);
    const safeStack = nonNegativeNumber(stack);
    const toCall = Math.max(0, safeCurrentBet - safeContribution);
    const betSize = streetBetSize(street);
    const capped = Number(betCount) >= MAX_BETS_PER_STREET;
    const mayWager = Boolean(canAct) && safeStack > 0;
    const callAmount = Math.min(toCall, safeStack);
    const betAmount = Math.min(betSize, safeStack);
    const raiseAmount = Math.min(toCall + betSize, safeStack);

    return Object.freeze({
      toCall,
      betSize,
      capped,
      fold: Boolean(canAct),
      check: Boolean(canAct) && toCall === 0,
      call: Boolean(canAct) && toCall > 0 && safeStack > 0,
      bet: mayWager && toCall === 0 && safeCurrentBet === 0,
      raise: mayWager && toCall > 0 && safeStack > toCall && !capped,
      allIn: mayWager && safeStack <= Math.max(toCall, betSize),
      callAmount,
      betAmount,
      raiseAmount
    });
  }

  function buildSidePots(contributions) {
    const entries = (Array.isArray(contributions) ? contributions : [])
      .map((entry) => ({
        seat: entry?.seat,
        amount: nonNegativeNumber(entry?.amount),
        folded: Boolean(entry?.folded)
      }))
      .filter((entry) => entry.amount > 0 && entry.seat !== undefined && entry.seat !== null);
    const levels = [...new Set(entries.map((entry) => entry.amount))].sort((left, right) => left - right);
    let previousLevel = 0;

    return Object.freeze(levels.map((level) => {
      const contributors = entries.filter((entry) => entry.amount >= level);
      const pot = Object.freeze({
        amount: (level - previousLevel) * contributors.length,
        cap: level,
        contributorSeats: Object.freeze(contributors.map((entry) => entry.seat)),
        eligibleSeats: Object.freeze(contributors.filter((entry) => !entry.folded).map((entry) => entry.seat))
      });
      previousLevel = level;
      return pot;
    }));
  }

  function countValues(values) {
    return values.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map());
  }

  function findStraightHigh(values) {
    const unique = [...new Set(values)].sort((left, right) => right - left);
    if (unique.length !== 5) return 0;
    if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) return 5;
    return unique[0] - unique[4] === 4 ? unique[0] : 0;
  }

  function asEvaluation(value) {
    if (Array.isArray(value)) return value.length === 5 ? evaluateFive(value) : bestHand(value);
    if (value && typeof value === "object" && Number.isInteger(value.categoryValue) && Array.isArray(value.tiebreakers)) {
      return value;
    }
    throw new TypeError("Texas Hold'em comparison needs cards or a hand evaluation.");
  }

  function normalizeSeats(activeSeats) {
    const seen = new Set();
    return (Array.isArray(activeSeats) ? activeSeats : []).filter((seat) => {
      if (seat === undefined || seat === null || seen.has(seat)) return false;
      seen.add(seat);
      return true;
    });
  }

  function normalizeCard(card) {
    if (!card || typeof card !== "object") {
      throw new TypeError("Texas Hold'em cards must be objects from the shared deck.");
    }
    return { id: String(card.id || `${card.rank || ""}${card.suit || ""}`), rank: String(card.rank || "").toUpperCase(), suit: String(card.suit || "").toUpperCase() };
  }

  function forEachCombination(items, count, callback, start = 0, chosen = []) {
    if (chosen.length === count) {
      callback(chosen);
      return;
    }
    for (let index = start; index <= items.length - (count - chosen.length); index += 1) {
      forEachCombination(items, count, callback, index + 1, [...chosen, items[index]]);
    }
  }

  function freezeEvaluation({ category, categoryValue, label, tiebreakers, cardIds }) {
    return Object.freeze({
      category,
      categoryValue,
      label,
      tiebreakers: Object.freeze([...tiebreakers]),
      cardIds: Object.freeze([...cardIds])
    });
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  return Object.freeze({
    STARTING_TABLE_POINTS,
    SMALL_BLIND,
    BIG_BLIND,
    SMALL_BET,
    BIG_BET,
    MAX_BETS_PER_STREET,
    STREETS,
    HAND_CATEGORY,
    CATEGORY_LABEL,
    RANK_VALUE,
    rankValue,
    streetBetSize,
    nextStreet,
    communityCardCount,
    evaluateFive,
    bestHand,
    compareHands,
    compareEvaluations,
    blindPositions,
    availableActions,
    buildSidePots
  });
});
