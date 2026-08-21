(function exposeJuanDeck(root, factory) {
  const deck = factory();
  if (typeof module === "object" && module.exports) module.exports = deck;
  root.CardcadeJuanDeck = deck;
})(typeof globalThis !== "undefined" ? globalThis : this, function createJuanDeck() {
  "use strict";

  // JUAN's deck is a physical inventory only. The rules module decides what
  // matches, what actions do, and how a round is scored.
  const COLORS = Object.freeze(["blaze", "tide", "grove", "spark"]);
  const COLOR_NAME = Object.freeze({
    blaze: "Blaze",
    tide: "Tide",
    grove: "Grove",
    spark: "Spark"
  });
  const COLOR_HEX = Object.freeze({
    blaze: "#ef4d54",
    tide: "#2d7dd2",
    grove: "#43b66b",
    spark: "#f2bf3d"
  });
  const KINDS = Object.freeze(["number", "pause", "turnabout", "double-draw", "prism", "prism-burst"]);
  const ACTION_FACE = Object.freeze({
    pause: Object.freeze({ short: "II", symbol: "Ⅱ", name: "Pause" }),
    turnabout: Object.freeze({ short: "TURN", symbol: "↻", name: "Turnabout" }),
    "double-draw": Object.freeze({ short: "+2", symbol: "+2", name: "Double Draw" }),
    prism: Object.freeze({ short: "PRISM", symbol: "✦", name: "Prism" }),
    "prism-burst": Object.freeze({ short: "+4", symbol: "+4", name: "Prism Burst" })
  });

  function makeDeck() {
    const cards = [];
    for (const color of COLORS) {
      for (let value = 0; value <= 9; value += 1) {
        for (const copy of value === 0 ? ["a"] : ["a", "b"]) {
          cards.push(card({ id: `${color}-${value}-${copy}`, color, kind: "number", value, copy }));
        }
      }
      for (const kind of ["pause", "turnabout", "double-draw"]) {
        for (const copy of ["a", "b"]) {
          const id = copy === "a" ? `${color}-${kind}` : `${color}-${kind}-b`;
          cards.push(card({ id, color, kind, value: null, copy }));
        }
      }
    }
    for (let copy = 1; copy <= 4; copy += 1) {
      cards.push(card({ id: `prism-${copy}`, color: null, kind: "prism", value: null, copy: String(copy) }));
      cards.push(card({ id: `prism-burst-${copy}`, color: null, kind: "prism-burst", value: null, copy: String(copy) }));
    }
    return cards;
  }

  function cardLabel(cardOrId) {
    const cardValue = normalizeCard(cardOrId);
    const face = cardValue.kind === "number" ? String(cardValue.value) : ACTION_FACE[cardValue.kind]?.short || "?";
    return cardValue.color ? `${COLOR_NAME[cardValue.color]} ${face}` : face;
  }

  function cardLong(cardOrId) {
    const cardValue = normalizeCard(cardOrId);
    const face = cardValue.kind === "number" ? String(cardValue.value) : ACTION_FACE[cardValue.kind]?.name || cardValue.kind;
    return cardValue.color ? `${COLOR_NAME[cardValue.color]} ${face}` : face;
  }

  function normalizeCard(cardOrId) {
    if (cardOrId && typeof cardOrId === "object") return cardOrId;
    const id = String(cardOrId || "");
    if (id.startsWith("prism-burst-")) return { id, color: null, kind: "prism-burst", value: null, copy: id.slice(12) };
    if (id.startsWith("prism-")) return { id, color: null, kind: "prism", value: null, copy: id.slice(6) };
    for (const color of COLORS) {
      if (!id.startsWith(`${color}-`)) continue;
      const rest = id.slice(color.length + 1);
      const numberMatch = rest.match(/^(\d+)-([a-z])$/);
      if (numberMatch) return { id, color, kind: "number", value: Number(numberMatch[1]), copy: numberMatch[2] };
      const actionMatch = rest.match(/^(pause|turnabout|double-draw)(?:-([ab]))?$/);
      if (actionMatch) return { id, color, kind: actionMatch[1], value: null, copy: actionMatch[2] || "a" };
      return { id, color, kind: rest, value: null, copy: "a" };
    }
    return { id, color: null, kind: "unknown", value: null, copy: "" };
  }

  function card(value) {
    return Object.freeze(value);
  }

  return Object.freeze({ COLORS, COLOR_NAME, COLOR_HEX, KINDS, ACTION_FACE, makeDeck, cardLabel, cardLong, normalizeCard });
});
