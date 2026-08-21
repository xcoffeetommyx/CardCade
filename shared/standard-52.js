(function exposeStandard52(root, factory) {
  const standard52 = factory();
  if (typeof module === "object" && module.exports) module.exports = standard52;
  root.CardcadeStandard52 = standard52;
})(typeof globalThis !== "undefined" ? globalThis : this, function createStandard52() {
  "use strict";

  // This is a neutral physical deck description. Games decide rank strength,
  // suit strength, wild behavior, legal combinations, and scoring themselves.
  const RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
  const SUITS = Object.freeze(["S", "C", "D", "H"]);
  const SUIT_SYMBOL = Object.freeze({ S: "♠", C: "♣", D: "♦", H: "♥" });
  const SUIT_NAME = Object.freeze({ S: "Spades", C: "Clubs", D: "Diamonds", H: "Hearts" });

  function makeDeck() {
    return RANKS.flatMap((rank) => SUITS.map((suit) => Object.freeze({ id: `${rank}${suit}`, rank, suit })));
  }

  function cardLabel(cardOrId) {
    const card = normalizeCard(cardOrId);
    return `${card.rank}${SUIT_SYMBOL[card.suit] || ""}`;
  }

  function cardLong(cardOrId) {
    const card = normalizeCard(cardOrId);
    return `${card.rank} of ${SUIT_NAME[card.suit] || card.suit}`;
  }

  function normalizeCard(cardOrId) {
    if (cardOrId && typeof cardOrId === "object") return cardOrId;
    const id = String(cardOrId || "");
    return { id, rank: id.slice(0, -1), suit: id.slice(-1) };
  }

  return Object.freeze({ RANKS, SUITS, SUIT_SYMBOL, SUIT_NAME, makeDeck, cardLabel, cardLong });
});
