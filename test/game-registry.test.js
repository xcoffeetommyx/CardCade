import assert from "node:assert/strict";
import test from "node:test";
import { deckFamilies, games } from "../server/src/game-catalog.js";
import { GameRegistry } from "../server/src/game-registry.js";

test("catalog groups games under ordered deck families", () => {
  const registry = new GameRegistry({ deckFamilies, games });
  const catalog = registry.catalog();

  assert.equal(catalog.families[0].id, "standard-52");
  assert.deepEqual(catalog.families[0].games.map((game) => game.id), ["three-seven", "thirteen", "blackjack", "holdem", "five-card-draw"]);
  const thirteen = catalog.families[0].games.find((game) => game.id === "thirteen");
  assert.equal(thirteen.status, "available");
  assert.deepEqual(thirteen.players, { min: 4, max: 4, recommended: 4 });
  const blackjack = catalog.families[0].games.find((game) => game.id === "blackjack");
  assert.equal(blackjack.status, "available");
  assert.deepEqual(blackjack.players, { min: 1, max: 4, recommended: 4 });
  const holdem = catalog.families[0].games.find((game) => game.id === "holdem");
  assert.equal(holdem.status, "available");
  assert.deepEqual(holdem.players, { min: 2, max: 4, recommended: 4 });
  const fiveCardDraw = catalog.families[0].games.find((game) => game.id === "five-card-draw");
  assert.equal(fiveCardDraw.status, "available");
  assert.deepEqual(fiveCardDraw.players, { min: 2, max: 4, recommended: 4 });
  assert.equal(catalog.families[1].games[0].id, "juan");
  assert.equal(catalog.families[1].games[0].status, "available");
  assert.deepEqual(catalog.families[1].games[0].players, { min: 2, max: 8, recommended: 4 });
  assert.equal(catalog.families[2].id, "rotating-rummy");
  assert.equal(catalog.families[2].games[0].id, "rotating-rummy");
  assert.equal(catalog.families[2].games[0].status, "available");
  assert.deepEqual(catalog.families[2].games[0].players, { min: 2, max: 4, recommended: 4 });
  assert.equal(catalog.families[3].id, "finders-makers");
  assert.equal(catalog.families[3].games[0].id, "finders-makers");
  assert.equal(catalog.families[3].games[0].status, "available");
  assert.deepEqual(catalog.families[3].games[0].players, { min: 2, max: 2, recommended: 2 });
  assert.deepEqual(catalog.families[3].games[0].modes, ["solo", "multiplayer", "hot-seat"]);
  assert.equal(catalog.families[3].games[0].supportsBots, true);
});

test("catalog can be filtered by game mode and returns defensive copies", () => {
  const registry = new GameRegistry({
    deckFamilies: [{ id: "deck", name: "Deck" }],
    games: [{
      id: "solo-only",
      name: "Solo only",
      deckFamilyId: "deck",
      modes: ["solo"],
      players: { min: 1, max: 1 },
      supportsBots: false,
      status: "available"
    }]
  });

  assert.equal(registry.catalog({ mode: "multiplayer" }).families.length, 0);
  const game = registry.getGame("solo-only");
  game.name = "Changed";
  assert.equal(registry.getGame("solo-only").name, "Solo only");
});

test("registry rejects duplicate ids and games with unknown families", () => {
  assert.throws(
    () => new GameRegistry({ deckFamilies: [{ id: "x", name: "X" }, { id: "x", name: "Again" }] }),
    { code: "DUPLICATE_DECK_FAMILY" }
  );
  assert.throws(
    () => new GameRegistry({
      deckFamilies: [],
      games: [{ id: "bad", name: "Bad", deckFamilyId: "missing", modes: ["solo"], players: { min: 1, max: 1 }, status: "planned" }]
    }),
    { code: "INVALID_GAME" }
  );
});
