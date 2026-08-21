import { assert } from "./errors.js";

const validStatuses = new Set(["available", "migration-ready", "planned"]);
const validModes = new Set(["solo", "multiplayer", "hot-seat"]);

function copy(value) {
  return structuredClone(value);
}

function validateFamily(family) {
  assert(family && typeof family === "object", "INVALID_DECK_FAMILY", "Deck families must be objects.");
  assert(typeof family.id === "string" && family.id.length > 0, "INVALID_DECK_FAMILY", "Deck families need an id.");
  assert(typeof family.name === "string" && family.name.length > 0, "INVALID_DECK_FAMILY", "Deck families need a name.");
}

function validateGame(game, familyIds) {
  assert(game && typeof game === "object", "INVALID_GAME", "Games must be objects.");
  assert(typeof game.id === "string" && game.id.length > 0, "INVALID_GAME", "Games need an id.");
  assert(typeof game.name === "string" && game.name.length > 0, "INVALID_GAME", "Games need a name.");
  assert(familyIds.has(game.deckFamilyId), "INVALID_GAME", `Game ${game.id} references an unknown deck family.`);
  assert(validStatuses.has(game.status), "INVALID_GAME", `Game ${game.id} has an invalid status.`);
  assert(Array.isArray(game.modes) && game.modes.length > 0, "INVALID_GAME", `Game ${game.id} needs at least one mode.`);
  assert(game.modes.every((mode) => validModes.has(mode)), "INVALID_GAME", `Game ${game.id} has an invalid mode.`);
  assert(Number.isInteger(game.players?.min) && game.players.min >= 1, "INVALID_GAME", `Game ${game.id} has an invalid minimum player count.`);
  assert(Number.isInteger(game.players?.max) && game.players.max >= game.players.min, "INVALID_GAME", `Game ${game.id} has an invalid maximum player count.`);
}

export class GameRegistry {
  #families = new Map();
  #games = new Map();

  constructor({ deckFamilies = [], games = [] } = {}) {
    for (const family of deckFamilies) {
      validateFamily(family);
      assert(!this.#families.has(family.id), "DUPLICATE_DECK_FAMILY", `Duplicate deck family: ${family.id}`);
      this.#families.set(family.id, copy(family));
    }

    const familyIds = new Set(this.#families.keys());
    for (const game of games) {
      validateGame(game, familyIds);
      assert(!this.#games.has(game.id), "DUPLICATE_GAME", `Duplicate game: ${game.id}`);
      this.#games.set(game.id, copy(game));
    }
  }

  getGame(gameId) {
    const game = this.#games.get(gameId);
    assert(game, "GAME_NOT_FOUND", "That game is not in this Cardcade library.", 404);
    return copy(game);
  }

  catalog({ mode } = {}) {
    const families = [...this.#families.values()]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((family) => ({
        ...copy(family),
        games: [...this.#games.values()]
          .filter((game) => game.deckFamilyId === family.id && (!mode || game.modes.includes(mode)))
          .map(copy)
      }))
      .filter((family) => family.games.length > 0);

    return { families };
  }
}
