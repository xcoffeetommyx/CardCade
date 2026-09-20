(function (root, factory) {
  const deck = factory();
  if (typeof module === "object" && module.exports) module.exports = deck;
  root.CardcadeFleepDeck = deck;
})(globalThis, function () {
  const COLORS = { light: ["blaze", "tide", "grove", "spark"], dark: ["orchid", "lagoon", "ember", "dusk"] };
  const NAMES = { blaze: "Blaze", tide: "Tide", grove: "Grove", spark: "Spark", orchid: "Orchid", lagoon: "Lagoon", ember: "Ember", dusk: "Dusk" };
  const ACTIONS = { "draw-one": "Draw One", "draw-five": "Draw Five", turnabout: "Turnabout", pause: "Pause", "pause-all": "Pause All", fleep: "FLEEP", prism: "Wild", "wild-two": "Wild Draw Two", "wild-color": "Wild Draw Color" };
  const MARKS = { "draw-one": "+1", "draw-five": "+5", turnabout: "↺", pause: "Ⅱ", "pause-all": "ALL", fleep: "⇄", prism: "■", "wild-two": "+2", "wild-color": "+?" };
  function inventory(side) {
    const cards = [];
    for (const color of COLORS[side]) {
      for (let value = 1; value <= 9; value++) for (let i = 0; i < 2; i++) cards.push({ color, kind: "number", value, side });
      for (const kind of [side === "light" ? "draw-one" : "draw-five", "turnabout", side === "light" ? "pause" : "pause-all", "fleep"])
        for (let i = 0; i < 2; i++) cards.push({ color, kind, value: null, side });
    }
    for (let i = 0; i < 4; i++) for (const kind of ["prism", side === "light" ? "wild-two" : "wild-color"]) cards.push({ color: null, kind, value: null, side });
    return cards;
  }
  function label(c) { return `${c.color ? NAMES[c.color] + " " : ""}${c.kind === "number" ? c.value : ACTIONS[c.kind]}`; }
  function points(c) { return c.kind === "number" ? c.value : ({ "draw-one": 10, "draw-five": 20, turnabout: 20, pause: 20, "pause-all": 30, fleep: 20, prism: 40, "wild-two": 50, "wild-color": 60 })[c.kind]; }
  function canPlay(c, top, color) { return !c.color || c.color === color || c.kind === top.kind && (c.kind !== "number" || c.value === top.value); }
  return { COLORS, NAMES, ACTIONS, MARKS, inventory, label, points, canPlay };
});
