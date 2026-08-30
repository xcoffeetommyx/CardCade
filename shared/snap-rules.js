(function exposeSnapRules(root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.CardcadeSnapRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSnapRules() {
  "use strict";

  const PHASES = Object.freeze({
    WAITING_FOR_READY: "waiting-for-ready",
    COUNTDOWN: "countdown",
    REACTION: "reaction",
    FINISHED: "finished"
  });

  function ranksMatch(first, second) {
    return Boolean(first && second && first.rank === second.rank);
  }

  function matchType(centerPile) {
    if (!Array.isArray(centerPile)) return null;
    const currentCard = centerPile.at(-1);
    const previousCard = centerPile.at(-2);
    const twoBackCard = centerPile.at(-3);
    if (ranksMatch(currentCard, previousCard)) return "direct";
    if (ranksMatch(currentCard, twoBackCard)) return "sandwich";
    return null;
  }

  return Object.freeze({ PHASES, ranksMatch, matchType });
});
