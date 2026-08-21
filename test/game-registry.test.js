import assert from "node:assert/strict";
import test from "node:test";
import { deckFamilies, games } from "../server/src/game-catalog.js";
import { GameRegistry } from "../server/src/game-registry.js";

test("catalog groups games under ordered deck families", () => {
  const registry = new GameRegistry({ deckFamilies, games });
  const catalog = registry.catalog();

  assert.equal(catalog.families[0].id, "standard-52");
  assert.deepEqual(catalog.families[0].games.map((game) => game.id), ["three-seven", "thirteen"]);
  const thirteen = catalog.families[0].games.find((game) => game.id === "thirteen");
  assert.equal(thirteen.status, "available");
  assert.deepEqual(thirteen.players, { min: 4, max: 4, recommended: 4 });
  assert.equal(catalog.families[1].games[0].id, "color-clash");
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
