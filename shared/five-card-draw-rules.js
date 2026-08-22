(function exposeFiveCardDrawRules(root, factory) {
  const poker = typeof module === "object" && module.exports
    ? require("./holdem-rules.js")
    : root.CardcadeHoldemRules;
  const rules = factory(poker);
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.CardcadeFiveCardDrawRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFiveCardDrawRules(poker) {
  "use strict";

  if (!poker) throw new Error("Five Card Draw requires Cardcade's shared Poker rules.");

  // Five Card Draw owns its hand flow and drawing rules. It deliberately
  // reuses only the standard Poker hand evaluator and agreed table stakes.
  const STARTING_TABLE_POINTS = poker.STARTING_TABLE_POINTS;
  const SMALL_BLIND = poker.SMALL_BLIND;
  const BIG_BLIND = poker.BIG_BLIND;
  const SMALL_BET = poker.SMALL_BET;
  const BIG_BET = poker.BIG_BET;
  const MAX_BETS_PER_STREET = poker.MAX_BETS_PER_STREET;
  const OPENING_BETTING_PHASE = "opening";
  const DRAW_PHASE = "draw";
  const FINAL_BETTING_PHASE = "final";
  const BETTING_PHASES = Object.freeze([OPENING_BETTING_PHASE, FINAL_BETTING_PHASE]);
  const MAX_DRAW_CARDS = 5;

  function streetBetSize(phase) {
    return String(phase) === FINAL_BETTING_PHASE ? BIG_BET : SMALL_BET;
  }

  function nextPhase(phase) {
    const current = String(phase);
    if (current === OPENING_BETTING_PHASE) return DRAW_PHASE;
    if (current === DRAW_PHASE) return FINAL_BETTING_PHASE;
    return null;
  }

  function availableActions({
    phase = OPENING_BETTING_PHASE,
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
    const betSize = streetBetSize(phase);
    const capped = Number(betCount) >= MAX_BETS_PER_STREET;
    const betting = BETTING_PHASES.includes(String(phase));
    const mayWager = Boolean(canAct) && betting && safeStack > 0;

    return Object.freeze({
      toCall,
      betSize,
      capped,
      fold: Boolean(canAct) && betting,
      check: Boolean(canAct) && betting && toCall === 0,
      call: Boolean(canAct) && betting && toCall > 0 && safeStack > 0,
      bet: mayWager && toCall === 0 && safeCurrentBet === 0,
      raise: mayWager && toCall > 0 && safeStack > toCall && !capped,
      callAmount: Math.min(toCall, safeStack),
      betAmount: Math.min(betSize, safeStack),
      raiseAmount: Math.min(toCall + betSize, safeStack)
    });
  }

  function isValidDrawCount(count) {
    return Number.isInteger(count) && count >= 0 && count <= MAX_DRAW_CARDS;
  }

  function evaluateHand(cards) {
    return poker.evaluateFive(cards);
  }

  function compareHands(left, right) {
    return poker.compareHands(left, right);
  }

  function blindPositions(activeSeats, dealerSeat) {
    return poker.blindPositions(activeSeats, dealerSeat);
  }

  function buildSidePots(contributions) {
    return poker.buildSidePots(contributions);
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
    OPENING_BETTING_PHASE,
    DRAW_PHASE,
    FINAL_BETTING_PHASE,
    BETTING_PHASES,
    MAX_DRAW_CARDS,
    streetBetSize,
    nextPhase,
    availableActions,
    isValidDrawCount,
    evaluateHand,
    compareHands,
    blindPositions,
    buildSidePots
  });
});
