(function exposeBlackjackRules(root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.CardcadeBlackjackRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBlackjackRules() {
  "use strict";

  // These describe Blackjack only. CardcadeStandard52 remains the single
  // source of physical cards, suits, artwork, and card identifiers.
  const BLACKJACK_TOTAL = 21;
  const DEALER_STANDS_ON_SOFT_17 = true;
  const BASE_TABLE_POINTS = 1;
  const INSURANCE_STAKE_RATIO = 0.5;
  const BLACKJACK_PAYOUT = 1.5;
  const SURRENDER_LOSS_RATIO = 0.5;
  const MAX_SPLIT_HANDS = 4;
  const PLAYER_PHASE = "player-turn";

  function rankPoints(card) {
    const rank = String(card?.rank || "").toUpperCase();
    if (rank === "A") return 11;
    if (["10", "J", "Q", "K"].includes(rank)) return 10;
    const numeric = Number(rank);
    return Number.isInteger(numeric) && numeric >= 2 && numeric <= 9 ? numeric : 0;
  }

  function handValue(cards) {
    const hand = Array.isArray(cards) ? cards : [];
    let hardTotal = 0;
    let aceCount = 0;

    for (const card of hand) {
      if (String(card?.rank || "").toUpperCase() === "A") {
        aceCount += 1;
        hardTotal += 1;
      } else {
        hardTotal += rankPoints(card);
      }
    }

    const soft = aceCount > 0 && hardTotal + 10 <= BLACKJACK_TOTAL;
    const total = hardTotal + (soft ? 10 : 0);
    const blackjack = hand.length === 2 && total === BLACKJACK_TOTAL;
    return Object.freeze({
      total,
      hardTotal,
      soft,
      bust: total > BLACKJACK_TOTAL,
      blackjack,
      aceCount
    });
  }

  function handLabel(cards) {
    const value = handValue(cards);
    if (value.blackjack) return "Blackjack";
    if (value.bust) return `Bust · ${value.total}`;
    return value.soft ? `Soft ${value.total}` : String(value.total);
  }

  function isBlackjack(cards) {
    return handValue(cards).blackjack;
  }

  function dealerShouldHit(cards) {
    const value = handValue(cards);
    // Cardcade's table rule is stand on all 17s, including soft 17.
    return !value.bust && value.total < 17;
  }

  function canDoubleDown({ cards, phase = PLAYER_PHASE, actionsTaken = 0 } = {}) {
    const value = handValue(cards);
    return phase === PLAYER_PHASE
      && Array.isArray(cards)
      && cards.length === 2
      && actionsTaken === 0
      && !value.blackjack
      && !value.bust;
  }

  function canSurrender({ cards, phase = PLAYER_PHASE, actionsTaken = 0, isSplitHand = false } = {}) {
    const value = handValue(cards);
    return phase === PLAYER_PHASE
      && Array.isArray(cards)
      && cards.length === 2
      && actionsTaken === 0
      && !isSplitHand
      && !value.blackjack
      && !value.bust;
  }

  function splitValue(card) {
    return rankPoints(card);
  }

  function canSplitHand({
    cards,
    phase = PLAYER_PHASE,
    handCount = 1,
    maxSplitHands = MAX_SPLIT_HANDS
  } = {}) {
    if (phase !== PLAYER_PHASE || !Array.isArray(cards) || cards.length !== 2) return false;
    if (!Number.isInteger(handCount) || handCount < 1 || handCount >= maxSplitHands) return false;
    const [left, right] = cards;
    const leftValue = splitValue(left);
    const rightValue = splitValue(right);
    // Cardcade follows the common table convention that any two ten-value
    // cards may be split, not only identical face ranks.
    return leftValue > 0 && leftValue === rightValue;
  }

  function insuranceOffered({ dealerUpcard, phase = "insurance", insuranceTaken = false } = {}) {
    return !insuranceTaken
      && ["insurance", "initial-decision"].includes(phase)
      && String(dealerUpcard?.rank || "").toUpperCase() === "A";
  }

  function availableActions({
    cards,
    dealerUpcard,
    phase = PLAYER_PHASE,
    actionsTaken = 0,
    isSplitHand = false,
    handCount = 1,
    maxSplitHands = MAX_SPLIT_HANDS,
    insuranceTaken = false
  } = {}) {
    const value = handValue(cards);
    const active = phase === PLAYER_PHASE && !value.bust && !value.blackjack;
    return Object.freeze({
      hit: active && value.total < BLACKJACK_TOTAL,
      stand: active,
      double: canDoubleDown({ cards, phase, actionsTaken }),
      split: canSplitHand({ cards, phase, handCount, maxSplitHands }),
      surrender: canSurrender({ cards, phase, actionsTaken, isSplitHand }),
      insurance: insuranceOffered({ dealerUpcard, phase, insuranceTaken })
    });
  }

  function resolveMainHand({
    playerCards,
    dealerCards,
    stake = BASE_TABLE_POINTS,
    surrendered = false,
    blackjackEligible = true
  } = {}) {
    const player = handValue(playerCards);
    const dealer = handValue(dealerCards);
    const safeStake = positiveStake(stake);

    if (surrendered) return settlement("surrender", -safeStake * SURRENDER_LOSS_RATIO, player, dealer);
    if (player.bust) return settlement("bust", -safeStake, player, dealer);
    if (blackjackEligible && player.blackjack && dealer.blackjack) return settlement("push", 0, player, dealer);
    if (blackjackEligible && player.blackjack) return settlement("blackjack", safeStake * BLACKJACK_PAYOUT, player, dealer);
    if (dealer.blackjack) return settlement("dealer-blackjack", -safeStake, player, dealer);
    if (dealer.bust) return settlement("win", safeStake, player, dealer);
    if (player.total > dealer.total) return settlement("win", safeStake, player, dealer);
    if (player.total < dealer.total) return settlement("lose", -safeStake, player, dealer);
    return settlement("push", 0, player, dealer);
  }

  function resolveInsurance({ insuranceTaken = false, dealerCards, stake = BASE_TABLE_POINTS } = {}) {
    const safeStake = positiveStake(stake);
    const insuranceStake = safeStake * INSURANCE_STAKE_RATIO;
    if (!insuranceTaken) return Object.freeze({ outcome: "none", points: 0, stake: 0 });
    if (isBlackjack(dealerCards)) {
      // Insurance pays 2:1 on its half-point side stake, exactly offsetting a
      // one-point main-hand loss against a dealer Blackjack.
      return Object.freeze({ outcome: "insurance-win", points: insuranceStake * 2, stake: insuranceStake });
    }
    return Object.freeze({ outcome: "insurance-lose", points: -insuranceStake, stake: insuranceStake });
  }

  function settleHand({
    playerCards,
    dealerCards,
    stake = BASE_TABLE_POINTS,
    surrendered = false,
    blackjackEligible = true,
    insuranceTaken = false
  } = {}) {
    const main = resolveMainHand({ playerCards, dealerCards, stake, surrendered, blackjackEligible });
    const insurance = resolveInsurance({ insuranceTaken, dealerCards, stake });
    return Object.freeze({
      outcome: main.outcome,
      points: normalizePoints(main.points + insurance.points),
      main,
      insurance,
      player: main.player,
      dealer: main.dealer
    });
  }

  function chooseBotAction({
    cards,
    dealerUpcard,
    actionsTaken = 0,
    isSplitHand = false,
    handCount = 1,
    maxSplitHands = MAX_SPLIT_HANDS
  } = {}) {
    const value = handValue(cards);
    const actions = availableActions({
      cards,
      dealerUpcard,
      actionsTaken,
      isSplitHand,
      handCount,
      maxSplitHands
    });
    const dealerValue = rankPoints(dealerUpcard);
    const splitPairValue = Array.isArray(cards) && cards.length === 2 ? splitValue(cards[0]) : 0;

    if (actions.split && [8, 11].includes(splitPairValue)) return "split";
    if (actions.surrender && value.total === 16 && dealerValue >= 9) return "surrender";
    if (actions.double && [10, 11].includes(value.total)) return "double";
    if (value.total >= 17 || (value.total >= 13 && dealerValue >= 2 && dealerValue <= 6)) return "stand";
    return actions.hit ? "hit" : "stand";
  }

  function settlement(outcome, points, player, dealer) {
    return Object.freeze({ outcome, points: normalizePoints(points), player, dealer });
  }

  function positiveStake(stake) {
    const value = Number(stake);
    return Number.isFinite(value) && value > 0 ? value : BASE_TABLE_POINTS;
  }

  function normalizePoints(points) {
    return Math.round(Number(points) * 2) / 2;
  }

  return Object.freeze({
    BLACKJACK_TOTAL,
    DEALER_STANDS_ON_SOFT_17,
    BASE_TABLE_POINTS,
    INSURANCE_STAKE_RATIO,
    BLACKJACK_PAYOUT,
    SURRENDER_LOSS_RATIO,
    MAX_SPLIT_HANDS,
    PLAYER_PHASE,
    rankPoints,
    handValue,
    handLabel,
    isBlackjack,
    dealerShouldHit,
    canDoubleDown,
    canSurrender,
    splitValue,
    canSplitHand,
    insuranceOffered,
    availableActions,
    resolveMainHand,
    resolveInsurance,
    settleHand,
    chooseBotAction
  });
});
