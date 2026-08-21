(function exposeJuanRules(root, factory) {
  const rules = factory(root.CardcadeJuanDeck || (typeof require === "function" ? require("./juan-deck.js") : null));
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.JuanRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createJuanRules(deck) {
  "use strict";

  if (!deck) throw new Error("JUAN rules require the shared JUAN deck.");
  const COLOR_INDEX = new Map(deck.COLORS.map((color, index) => [color, index]));
  const KIND_ORDER = Object.freeze({ number: 0, pause: 1, turnabout: 2, "double-draw": 3, prism: 4, "prism-burst": 5 });

  function faceKey(card) {
    return card.kind === "number" ? `number:${card.value}` : card.kind;
  }

  function canPlay(card, topCard, activeColor) {
    if (!card || !topCard) return false;
    if (card.kind === "prism" || card.kind === "prism-burst") return true;
    if (card.color === activeColor) return true;
    return faceKey(card) === faceKey(topCard);
  }

  function getLegalCards(hand, topCard, activeColor) {
    return hand.filter((card) => canPlay(card, topCard, activeColor));
  }

  function sortCards(cards, mode = "color") {
    return cards.slice().sort((left, right) => {
      const leftColor = left.color == null ? deck.COLORS.length : COLOR_INDEX.get(left.color);
      const rightColor = right.color == null ? deck.COLORS.length : COLOR_INDEX.get(right.color);
      const leftKind = KIND_ORDER[left.kind] ?? 99;
      const rightKind = KIND_ORDER[right.kind] ?? 99;
      const leftValue = left.kind === "number" ? left.value : 99;
      const rightValue = right.kind === "number" ? right.value : 99;
      if (mode === "face") {
        return leftKind - rightKind || leftValue - rightValue || leftColor - rightColor || left.id.localeCompare(right.id);
      }
      return leftColor - rightColor || leftKind - rightKind || leftValue - rightValue || left.id.localeCompare(right.id);
    });
  }

  function chooseColor(hand) {
    const counts = new Map(deck.COLORS.map((color) => [color, 0]));
    for (const card of hand) {
      if (card.color) counts.set(card.color, (counts.get(card.color) || 0) + 1);
    }
    return deck.COLORS.slice().sort((left, right) => counts.get(right) - counts.get(left) || COLOR_INDEX.get(left) - COLOR_INDEX.get(right))[0];
  }

  function cardPoints(card) {
    if (card.kind === "number") return card.value + 1;
    if (card.kind === "pause") return 12;
    if (card.kind === "turnabout") return 14;
    if (card.kind === "double-draw") return 18;
    if (card.kind === "prism") return 25;
    if (card.kind === "prism-burst") return 35;
    return 0;
  }

  function moveCost(card, hand = []) {
    const leavesOne = hand.length === 2 ? -50 : 0;
    const preservesPrism = card.kind === "prism" || card.kind === "prism-burst" ? 20 : 0;
    return cardPoints(card) + preservesPrism + leavesOne;
  }

  return Object.freeze({ faceKey, canPlay, getLegalCards, sortCards, chooseColor, cardPoints, moveCost });
});
