export const deckFamilies = [
  {
    id: "standard-52",
    name: "Standard playing cards",
    shortName: "52-card deck",
    description: "Four suits, thirteen ranks, and a shared physical-card presentation system.",
    order: 10
  },
  {
    id: "color-action",
    name: "Color & action cards",
    shortName: "Custom shedding deck",
    description: "An original color-shedding family with its own cards, rules, and identity.",
    order: 20
  }
];

export const games = [
  {
    id: "three-seven",
    name: "3s & 7s",
    eyebrow: "Rotating suit strategy",
    description: "Own the high suit across four quick rounds.",
    deckFamilyId: "standard-52",
    genres: ["climbing", "shedding"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 2, max: 4, recommended: 4 },
    supportsBots: true,
    status: "available",
    accent: "coral"
  },
  {
    id: "thirteen",
    name: "Thirteen",
    eyebrow: "Vietnamese climbing game",
    description: "Race to shed thirteen cards across four scored rounds with increasingly strong combinations.",
    deckFamilyId: "standard-52",
    genres: ["climbing", "shedding"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 4, max: 4, recommended: 4 },
    supportsBots: true,
    status: "available",
    accent: "blue"
  },
  {
    id: "blackjack",
    name: "Blackjack",
    eyebrow: "Dealer table strategy",
    description: "Build toward twenty-one, then decide when to press your table points.",
    deckFamilyId: "standard-52",
    genres: ["casino", "comparison"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 1, max: 4, recommended: 4 },
    supportsBots: true,
    status: "available",
    accent: "gold"
  },
  {
    id: "holdem",
    name: "Texas Hold'em",
    eyebrow: "Fixed-limit table poker",
    description: "Build the best five-card hand, protect your table points, and outlast the table.",
    deckFamilyId: "standard-52",
    genres: ["poker", "betting"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 2, max: 4, recommended: 4 },
    supportsBots: true,
    status: "available",
    accent: "violet"
  },
  {
    id: "five-card-draw",
    name: "Five Card Draw",
    eyebrow: "Classic single-draw poker",
    description: "Replace up to five cards, make one final wager, and win with the best private hand.",
    deckFamilyId: "standard-52",
    genres: ["poker", "betting"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 2, max: 4, recommended: 4 },
    supportsBots: true,
    status: "available",
    accent: "violet"
  },
  {
    id: "juan",
    name: "JUAN",
    eyebrow: "One card changes everything",
    description: "Match colors or faces, bend the turn order, and race down to one.",
    deckFamilyId: "color-action",
    genres: ["shedding"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 2, max: 8, recommended: 4 },
    supportsBots: true,
    status: "available",
    accent: "spectrum"
  }
];
