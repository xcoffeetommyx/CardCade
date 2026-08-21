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
    status: "migration-ready",
    accent: "coral"
  },
  {
    id: "thirteen",
    name: "Thirteen",
    eyebrow: "Vietnamese climbing game",
    description: "Race to shed thirteen cards with increasingly strong combinations.",
    deckFamilyId: "standard-52",
    genres: ["climbing", "shedding"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 2, max: 4, recommended: 4 },
    supportsBots: true,
    status: "migration-ready",
    accent: "blue"
  },
  {
    id: "color-clash",
    name: "Color Clash",
    eyebrow: "Original shedding game",
    description: "A future original game built around colors, actions, and quick reversals.",
    deckFamilyId: "color-action",
    genres: ["shedding"],
    modes: ["solo", "multiplayer", "hot-seat"],
    players: { min: 2, max: 8, recommended: 4 },
    supportsBots: true,
    status: "planned",
    accent: "violet"
  }
];
