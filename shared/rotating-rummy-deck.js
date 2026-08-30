(function exposeRotatingRummyDeck(root, factory) {
  const deck = factory();
  if (typeof module === "object" && module.exports) module.exports = deck;
  root.CardcadeRotatingRummyDeck = deck;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRotatingRummyDeck() {
  "use strict";

  // Rotating Rummy uses its own physical inventory. Its numeric cards are
  // deliberately black-faced in presentation, while these color lanes remain
  // part of the rules and card identity.
  const COLORS = Object.freeze(["red", "blue", "green", "yellow"]);
  const COLOR_NAME = Object.freeze({
    red: "Red",
    blue: "Blue",
    green: "Green",
    yellow: "Yellow"
  });
  const COLOR_HEX = Object.freeze({
    red: "#ef5d62",
    blue: "#4c9cff",
    green: "#55c878",
    yellow: "#f5ca4d"
  });
  const RANKS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1));
  const KINDS = Object.freeze(["number", "glitch", "lock"]);
  const ACTION_FACE = Object.freeze({
    glitch: Object.freeze({ short: "GLITCH", symbol: "✦", name: "Glitch" }),
    lock: Object.freeze({ short: "LOCK", symbol: "Ⅱ", name: "Lock" })
  });

  function makeDeck() {
    const cards = [];
    for (const color of COLORS) {
      for (const value of RANKS) {
        for (const copy of ["a", "b"]) {
          cards.push(card({ id: `rr-${color}-${value}-${copy}`, color, kind: "number", value, copy }));
        }
      }
    }
    // A balanced 6/6 special-card split gives Rotating Rummy its own deck
    // identity while keeping Glitches and Locks equally visible in a match.
    for (let copy = 1; copy <= 6; copy += 1) {
      cards.push(card({ id: `rr-glitch-${copy}`, color: null, kind: "glitch", value: null, copy: String(copy) }));
      cards.push(card({ id: `rr-lock-${copy}`, color: null, kind: "lock", value: null, copy: String(copy) }));
    }
    return cards;
  }

  function cardLabel(cardOrId) {
    const cardValue = normalizeCard(cardOrId);
    return cardValue.kind === "number"
      ? `${COLOR_NAME[cardValue.color] || "Unknown"} ${cardValue.value}`
      : ACTION_FACE[cardValue.kind]?.name || "Unknown card";
  }

  function cardLong(cardOrId) {
    const cardValue = normalizeCard(cardOrId);
    if (cardValue.kind === "number") {
      return `${COLOR_NAME[cardValue.color] || "Unknown"} ${cardValue.value}`;
    }
    if (cardValue.kind === "glitch") return "Glitch wildcard";
    if (cardValue.kind === "lock") return "Lock skip card";
    return "Unknown card";
  }

  function normalizeCard(cardOrId) {
    if (cardOrId && typeof cardOrId === "object") return cardOrId;
    const id = String(cardOrId || "");
    const special = id.match(/^rr-(glitch|lock)-(\d+)$/);
    if (special) {
      return { id, color: null, kind: special[1], value: null, copy: special[2] };
    }
    const numbered = id.match(/^rr-(red|blue|green|yellow)-(\d+)-([ab])$/);
    if (numbered) {
      return {
        id,
        color: numbered[1],
        kind: "number",
        value: Number(numbered[2]),
        copy: numbered[3]
      };
    }
    return { id, color: null, kind: "unknown", value: null, copy: "" };
  }

  function card(value) {
    return Object.freeze(value);
  }

  return Object.freeze({
    COLORS,
    COLOR_NAME,
    COLOR_HEX,
    RANKS,
    KINDS,
    ACTION_FACE,
    makeDeck,
    cardLabel,
    cardLong,
    normalizeCard
  });
});
