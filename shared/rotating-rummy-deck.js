(function exposeRotatingRummyDeck(root, factory) {
  const deck = factory();
  if (typeof module === "object" && module.exports) module.exports = deck;
  root.CardcadeRotatingRummyDeck = deck;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRotatingRummyDeck() {
  "use strict";

  // Rotating Rummy uses its own physical inventory. Its default skin is
  // black-faced, while the color lanes remain part of every card's rules and
  // identity regardless of the selected card skin.
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
    glitch: Object.freeze({ short: "WILD", symbol: "✦", name: "Wild" }),
    lock: Object.freeze({ short: "PASS", symbol: "Ⅱ", name: "Pass" })
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
    // Eight Wilds and four Pass cards keep the 108-card deck aligned with the
    // original Route rules while preserving the familiar color-card balance.
    for (let copy = 1; copy <= 8; copy += 1) {
      cards.push(card({ id: `rr-glitch-${copy}`, color: null, kind: "glitch", value: null, copy: String(copy) }));
    }
    for (let copy = 1; copy <= 4; copy += 1) {
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
    if (cardValue.kind === "glitch") return "Wild card";
    if (cardValue.kind === "lock") return "Pass card";
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
