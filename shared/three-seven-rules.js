(function exposeThreeSevenRules(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  root.ThreeSevenRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createThreeSevenRules() {
  'use strict';

  const RANKS = Object.freeze(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
  const SUITS = Object.freeze(['S', 'C', 'D', 'H']);
  const SUIT_SYMBOL = Object.freeze({ S: '♠', C: '♣', D: '♦', H: '♥' });
  const SUIT_NAME = Object.freeze({ S: 'Spades', C: 'Clubs', D: 'Diamonds', H: 'Hearts' });
  const SUIT_ORDERS = Object.freeze([
    Object.freeze(['S', 'C', 'D', 'H']),
    Object.freeze(['H', 'S', 'C', 'D']),
    Object.freeze(['D', 'H', 'S', 'C']),
    Object.freeze(['C', 'D', 'H', 'S'])
  ]);
  const ROUND_STARTERS = Object.freeze(['7S', '7H', '7D', '7C']);
  const SCORE_BY_PLACE = Object.freeze([4, 3, 2, 1]);
  const TOTAL_ROUNDS = 4;
  const STARTING_HAND_SIZE = 7;

  function normalizeRound(round = 1) {
    const value = Number(round);
    return Number.isInteger(value) && value >= 1 && value <= TOTAL_ROUNDS ? value : 1;
  }

  function suitOrder(round = 1) {
    return SUIT_ORDERS[normalizeRound(round) - 1];
  }

  function suitValue(suit, round = 1) {
    return suitOrder(round).indexOf(suit);
  }

  function roundStarterCard(round = 1) {
    return ROUND_STARTERS[normalizeRound(round) - 1];
  }

  function cardValue(card, round = 1) {
    return card.rankValue * 4 + suitValue(card.suit, round);
  }

  function cardLabel(card) {
    return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
  }

  function cardLong(card) {
    return `${card.rank} of ${SUIT_NAME[card.suit]}`;
  }

  function makeDeck() {
    const deck = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        deck.push({ id: `${rank}${suit}`, rank, suit, rankValue: RANKS.indexOf(rank) });
      }
    }
    return deck;
  }

  function shuffle(deck, random = Math.random) {
    const shuffled = deck.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function sortCards(cards, mode = 'rank', round = 1) {
    const sorted = cards.slice();
    if (mode === 'suit') {
      sorted.sort((a, b) =>
        suitValue(a.suit, round) - suitValue(b.suit, round) || a.rankValue - b.rankValue
      );
    } else if (mode === 'combo') {
      const counts = new Map();
      for (const card of sorted) counts.set(card.rankValue, (counts.get(card.rankValue) || 0) + 1);
      sorted.sort((a, b) =>
        counts.get(b.rankValue) - counts.get(a.rankValue) ||
        a.rankValue - b.rankValue ||
        suitValue(a.suit, round) - suitValue(b.suit, round)
      );
    } else {
      sorted.sort((a, b) =>
        a.rankValue - b.rankValue || suitValue(a.suit, round) - suitValue(b.suit, round)
      );
    }
    return sorted;
  }

  function groupByRank(cards, round = 1) {
    const groups = new Map();
    for (const card of cards) {
      if (!groups.has(card.rankValue)) groups.set(card.rankValue, []);
      groups.get(card.rankValue).push(card);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => suitValue(a.suit, round) - suitValue(b.suit, round));
    }
    return groups;
  }

  function highSuit(cards, round = 1) {
    return Math.max(...cards.map(card => suitValue(card.suit, round)));
  }

  function comboStrength(combo) {
    return combo.highRank * 4 + combo.highSuit;
  }

  function detectCombo(cards, round = 1) {
    if (!Array.isArray(cards) || !cards.length) return null;
    const normalizedRound = normalizeRound(round);
    const sorted = sortCards(cards, 'rank', normalizedRound);
    const ranks = sorted.map(card => card.rankValue);
    const uniqueRanks = [...new Set(ranks)];

    if (sorted.length === 1) {
      return {
        type: 'single', cards: sorted, count: 1,
        highRank: sorted[0].rankValue,
        highSuit: suitValue(sorted[0].suit, normalizedRound),
        label: 'Single', round: normalizedRound
      };
    }

    if (sorted.length === 2 && uniqueRanks.length === 1) {
      return {
        type: 'pair', cards: sorted, count: 2,
        highRank: uniqueRanks[0],
        highSuit: highSuit(sorted, normalizedRound),
        label: 'Pair', round: normalizedRound
      };
    }

    if (sorted.length === 3 && uniqueRanks.length === 1) {
      return {
        type: 'triple', cards: sorted, count: 3,
        highRank: uniqueRanks[0],
        highSuit: highSuit(sorted, normalizedRound),
        label: 'Triple', round: normalizedRound
      };
    }

    if (sorted.length === 4 && uniqueRanks.length === 1) {
      return {
        type: 'four', cards: sorted, count: 4,
        highRank: uniqueRanks[0],
        highSuit: highSuit(sorted, normalizedRound),
        label: 'Four of a Kind', bomb: true, round: normalizedRound
      };
    }

    if (
      sorted.length === 3 &&
      uniqueRanks.length === 3 &&
      uniqueRanks[1] === uniqueRanks[0] + 1 &&
      uniqueRanks[2] === uniqueRanks[1] + 1
    ) {
      const highRank = uniqueRanks[2];
      const highCard = sorted.find(card => card.rankValue === highRank);
      return {
        type: 'straight', cards: sorted, count: 3,
        highRank,
        highSuit: suitValue(highCard.suit, normalizedRound),
        label: '3-Card Straight', round: normalizedRound
      };
    }

    return null;
  }

  function canBeat(candidate, current) {
    if (!candidate) return false;
    if (!current) return true;

    // Four of a kind is a bomb: it can interrupt any ordinary combination.
    // Once a bomb is on the pile, only a strictly higher-ranked bomb can win.
    if (candidate.type === 'four') {
      return current.type !== 'four' || candidate.highRank > current.highRank;
    }
    if (current.type === 'four') return false;

    if (candidate.type !== current.type || candidate.count !== current.count) return false;
    return comboStrength(candidate) > comboStrength(current);
  }

  function comboDescription(combo) {
    if (!combo) return 'Lead a single, pair, triple, four of a kind, or 3-card straight';
    const high = RANKS[combo.highRank];
    if (combo.type === 'single') return `Single ${high}`;
    if (combo.type === 'pair') return `Pair of ${high}s`;
    if (combo.type === 'triple') return `Triple ${high}s`;
    if (combo.type === 'four') return `Four ${high}s (Bomb)`;
    if (combo.type === 'straight') return `3-card straight to ${high}`;
    return combo.label;
  }

  function comboShort(combo) {
    if (!combo) return '';
    if (combo.type === 'single') return cardLabel(combo.cards[0]);
    if (combo.type === 'pair') return `Pair ${RANKS[combo.highRank]}`;
    if (combo.type === 'triple') return `Triple ${RANKS[combo.highRank]}`;
    if (combo.type === 'four') return `Bomb ${RANKS[combo.highRank]}`;
    if (combo.type === 'straight') return `Straight to ${RANKS[combo.highRank]}`;
    return combo.label;
  }

  function choosePairs(cards) {
    const pairs = [];
    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        pairs.push([cards[left], cards[right]]);
      }
    }
    return pairs;
  }

  function getAllCombos(hand, round = 1) {
    const combos = hand.map(card => detectCombo([card], round));
    const groups = groupByRank(hand, round);

    for (const cards of groups.values()) {
      for (const pair of choosePairs(cards)) combos.push(detectCombo(pair, round));
      if (cards.length >= 3) {
        for (let first = 0; first < cards.length - 2; first += 1) {
          for (let second = first + 1; second < cards.length - 1; second += 1) {
            for (let third = second + 1; third < cards.length; third += 1) {
              combos.push(detectCombo([cards[first], cards[second], cards[third]], round));
            }
          }
        }
      }
      if (cards.length === 4) combos.push(detectCombo(cards, round));
    }

    for (let lowRank = 0; lowRank <= RANKS.length - 3; lowRank += 1) {
      const low = groups.get(lowRank) || [];
      const middle = groups.get(lowRank + 1) || [];
      const high = groups.get(lowRank + 2) || [];
      for (const lowCard of low) {
        for (const middleCard of middle) {
          for (const highCard of high) {
            combos.push(detectCombo([lowCard, middleCard, highCard], round));
          }
        }
      }
    }
    return combos.filter(Boolean);
  }

  function getLegalMoves(hand, currentCombo, openingCardId = null, round = 1) {
    return getAllCombos(hand, round).filter(combo =>
      (!openingCardId || combo.cards.some(card => card.id === openingCardId)) &&
      canBeat(combo, currentCombo)
    );
  }

  function moveCost(combo, player) {
    const remaining = player.hand.length - combo.count;
    let cost = comboStrength(combo) - combo.count * 15;
    if (combo.type === 'straight') cost -= 18;
    if (combo.type === 'triple') cost -= 14;
    if (combo.type === 'pair') cost -= 8;
    if (combo.type === 'four' && remaining > 0) cost += 180;
    if (remaining === 0) cost -= 10000;
    if (remaining === 1) cost -= 180;
    if (player.style === 'pressure') cost -= combo.count * 8;
    if (player.style === 'patient' && combo.highRank >= 10 && remaining > 2) cost += 45;
    return cost;
  }

  function compareFinalPlayers(left, right) {
    if (right.score !== left.score) return right.score - left.score;
    for (let place = 1; place <= 3; place += 1) {
      const leftCount = (left.placementHistory || []).filter(value => value === place).length;
      const rightCount = (right.placementHistory || []).filter(value => value === place).length;
      if (rightCount !== leftCount) return rightCount - leftCount;
    }
    return 0;
  }

  function finalStandings(players) {
    return players.slice().sort(compareFinalPlayers);
  }

  function finalWinners(players) {
    const standings = finalStandings(players);
    if (!standings.length) return [];
    return standings.filter(player => compareFinalPlayers(player, standings[0]) === 0);
  }

  function guaranteedWinnerAfterRound(players) {
    if (!Array.isArray(players) || players.length < 2 || players.length > SCORE_BY_PLACE.length) {
      return null;
    }
    const indexes = players.map((_, index) => index);
    let guaranteedIndex = null;
    for (const placement of permutations(indexes)) {
      const projected = players.map((player, index) => ({
        ...player,
        mercyIndex: index,
        placementHistory: (player.placementHistory || []).slice()
      }));
      placement.forEach((playerIndex, placeIndex) => {
        projected[playerIndex].score += SCORE_BY_PLACE[placeIndex] || 0;
        projected[playerIndex].placementHistory.push(placeIndex + 1);
      });
      const winners = finalWinners(projected);
      if (winners.length !== 1) return null;
      if (guaranteedIndex === null) guaranteedIndex = winners[0].mercyIndex;
      else if (guaranteedIndex !== winners[0].mercyIndex) return null;
    }
    return guaranteedIndex === null ? null : players[guaranteedIndex];
  }

  function permutations(values) {
    if (values.length <= 1) return [values.slice()];
    const results = [];
    values.forEach((value, index) => {
      const rest = values.slice(0, index).concat(values.slice(index + 1));
      for (const suffix of permutations(rest)) results.push([value, ...suffix]);
    });
    return results;
  }

  return Object.freeze({
    RANKS, SUITS, SUIT_SYMBOL, SUIT_NAME, SUIT_ORDERS, ROUND_STARTERS,
    SCORE_BY_PLACE, TOTAL_ROUNDS, STARTING_HAND_SIZE, normalizeRound, suitOrder, suitValue,
    roundStarterCard, cardValue, cardLabel, cardLong, makeDeck, shuffle,
    sortCards, comboStrength, detectCombo, canBeat, comboDescription,
    comboShort, getAllCombos, getLegalMoves, moveCost, compareFinalPlayers,
    finalStandings, finalWinners, guaranteedWinnerAfterRound
  });
});
