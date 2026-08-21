(function exposeThirteenRules(root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.ThirteenRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createThirteenRules() {
  "use strict";

  // These are Thirteen's strengths, not the physical deck's native order.
  // CardcadeStandard52 remains the one source of card objects and artwork.
  const RANKS = Object.freeze(["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]);
  const SUITS = Object.freeze(["S", "C", "D", "H"]);
  const SUIT_SYMBOL = Object.freeze({ S: "♠", C: "♣", D: "♦", H: "♥" });
  const SUIT_NAME = Object.freeze({ S: "Spades", C: "Clubs", D: "Diamonds", H: "Hearts" });
  const SUIT_VALUE = Object.freeze({ S: 0, C: 1, D: 2, H: 3 });
  const SCORE_BY_PLACE = Object.freeze([3, 1, 0, -2]);

  function rankValue(card) {
    return RANKS.indexOf(card.rank);
  }

  function cardValue(card) {
    return rankValue(card) * 4 + SUIT_VALUE[card.suit];
  }

  function cardLabel(card) {
    return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
  }

  function cardLong(card) {
    return `${card.rank} of ${SUIT_NAME[card.suit]}`;
  }

  function shuffle(deck, random = Math.random) {
    const shuffled = deck.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function sortCards(cards, mode = "rank") {
    const sorted = cards.slice();
    if (mode === "suit") {
      sorted.sort((a, b) => SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit] || rankValue(a) - rankValue(b));
    } else if (mode === "combo") {
      const counts = new Map();
      for (const card of sorted) {
        const value = rankValue(card);
        counts.set(value, (counts.get(value) || 0) + 1);
      }
      sorted.sort((a, b) => {
        const aRank = rankValue(a);
        const bRank = rankValue(b);
        return counts.get(bRank) - counts.get(aRank) || aRank - bRank || SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit];
      });
    } else {
      sorted.sort((a, b) => rankValue(a) - rankValue(b) || SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit]);
    }
    return sorted;
  }

  function groupByRank(cards) {
    const groups = new Map();
    for (const card of cards) {
      const value = rankValue(card);
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(card);
    }
    for (const group of groups.values()) group.sort((a, b) => SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit]);
    return groups;
  }

  function highSuit(cards) {
    return Math.max(...cards.map((card) => SUIT_VALUE[card.suit]));
  }

  function comboStrength(combo) {
    return combo.highRank * 4 + combo.highSuit;
  }

  function detectCombo(cards) {
    if (!cards || !cards.length) return null;
    const sorted = sortCards(cards, "rank");
    const count = sorted.length;
    const ranks = sorted.map(rankValue);
    const rankSet = [...new Set(ranks)];
    const groups = groupByRank(sorted);
    const counts = [...groups.values()].map((group) => group.length).sort((a, b) => b - a);

    if (count === 1) {
      return { type: "single", cards: sorted, count: 1, highRank: ranks[0], highSuit: SUIT_VALUE[sorted[0].suit], label: "Single" };
    }
    if (rankSet.length === 1 && count === 2) {
      return { type: "pair", cards: sorted, count: 2, highRank: rankSet[0], highSuit: highSuit(sorted), label: "Pair" };
    }
    if (rankSet.length === 1 && count === 3) {
      return { type: "triple", cards: sorted, count: 3, highRank: rankSet[0], highSuit: highSuit(sorted), label: "Triple" };
    }
    if (rankSet.length === 1 && count === 4) {
      return { type: "four", cards: sorted, count: 4, highRank: rankSet[0], highSuit: 3, label: "Four of a Kind", bomb: true };
    }
    if (count >= 3 && rankSet.length === count && !ranks.includes(12) && isConsecutive(rankSet)) {
      const highRank = Math.max(...rankSet);
      const highCards = sorted.filter((card) => rankValue(card) === highRank);
      return { type: "straight", cards: sorted, count, highRank, highSuit: highSuit(highCards), label: `${count}-Card Straight` };
    }
    if (count >= 6 && count % 2 === 0 && !rankSet.includes(12) && counts.every((groupCount) => groupCount === 2) && isConsecutive(rankSet)) {
      const highRank = Math.max(...rankSet);
      const highCards = sorted.filter((card) => rankValue(card) === highRank);
      const pairCount = count / 2;
      return { type: "pairSeq", cards: sorted, count, pairCount, highRank, highSuit: highSuit(highCards), label: `${pairCount} Pair Run`, bomb: true };
    }
    return null;
  }

  function isConsecutive(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] !== sorted[index - 1] + 1) return false;
    }
    return true;
  }

  function currentHasTwos(combo) {
    return combo && combo.highRank === 12 && ["single", "pair", "triple"].includes(combo.type);
  }

  function canChop(candidate, current) {
    if (!candidate || !current || !currentHasTwos(current)) return false;
    if (candidate.type === "four") return current.type === "single" || current.type === "pair";
    if (candidate.type === "pairSeq") {
      if (current.type === "single") return candidate.pairCount >= 3;
      if (current.type === "pair") return candidate.pairCount >= 4;
      if (current.type === "triple") return candidate.pairCount >= 5;
    }
    return false;
  }

  function canBeat(candidate, current) {
    if (!candidate) return false;
    if (!current) return true;
    if (canChop(candidate, current)) return true;
    if (candidate.type !== current.type || candidate.count !== current.count) return false;
    return comboStrength(candidate) > comboStrength(current);
  }

  function comboDescription(combo) {
    if (!combo) return "Lead any legal play";
    const high = RANKS[combo.highRank];
    if (combo.type === "single") return `Single ${high}`;
    if (combo.type === "pair") return `Pair of ${high}s`;
    if (combo.type === "triple") return `Triple ${high}s`;
    if (combo.type === "four") return `Four ${high}s`;
    if (combo.type === "straight") return `${combo.count}-card straight to ${high}`;
    if (combo.type === "pairSeq") return `${combo.pairCount} pair run to ${high}`;
    return combo.label;
  }

  function comboShort(combo) {
    if (!combo) return "";
    if (combo.type === "single") return cardLabel(combo.cards[0]);
    if (combo.type === "pair") return `Pair ${RANKS[combo.highRank]}`;
    if (combo.type === "triple") return `Triple ${RANKS[combo.highRank]}`;
    if (combo.type === "four") return `Bomb ${RANKS[combo.highRank]}`;
    if (combo.type === "straight") return `Run ×${combo.count}`;
    if (combo.type === "pairSeq") return `Pair Run ×${combo.pairCount}`;
    return combo.label;
  }

  function getAllCombos(hand) {
    const combos = [];
    const maxMask = 1 << hand.length;
    for (let mask = 1; mask < maxMask; mask += 1) {
      const cards = [];
      for (let index = 0; index < hand.length; index += 1) {
        if (mask & (1 << index)) cards.push(hand[index]);
      }
      const combo = detectCombo(cards);
      if (combo) combos.push(combo);
    }
    return combos;
  }

  function getLegalMoves(hand, currentCombo, require3S = false) {
    const seen = new Set();
    return getAllCombos(hand).filter((combo) => {
      const key = combo.cards.map((card) => card.id).sort().join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      if (require3S && !combo.cards.some((card) => card.id === "3S")) return false;
      return canBeat(combo, currentCombo);
    });
  }

  function isBombCombo(combo) {
    return combo && (combo.type === "four" || combo.type === "pairSeq");
  }

  function isTwoCombo(combo) {
    return combo && combo.highRank === 12 && ["single", "pair", "triple"].includes(combo.type);
  }

  function moveCost(combo, player) {
    let cost = comboStrength(combo);
    if (combo.type === "four") cost += 380;
    if (combo.type === "pairSeq" && combo.pairCount >= 3) cost += 160;
    if (combo.highRank === 12) cost += 170;
    if (combo.count >= 3) cost -= player.hand.length <= 6 ? combo.count * 24 : combo.count * 8;
    if (player.style === "pressure") cost -= combo.count * 10;
    if (player.style === "patient" && (combo.type === "four" || combo.highRank === 12)) cost += 80;
    return cost;
  }

  return Object.freeze({
    RANKS, SUITS, SUIT_SYMBOL, SUIT_NAME, SUIT_VALUE, SCORE_BY_PLACE,
    rankValue, cardValue, cardLabel, cardLong, shuffle, sortCards, comboStrength,
    detectCombo, currentHasTwos, canChop, canBeat, comboDescription, comboShort,
    getAllCombos, getLegalMoves, isBombCombo, isTwoCombo, moveCost
  });
});
