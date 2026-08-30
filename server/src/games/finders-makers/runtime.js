import { GameError } from "../../game-error.js";
import { MatchEngine } from "./match-engine.js";

export class FindersMakersRuntime {
  #matches = new Map();
  #engine;

  constructor({ matchEngine = new MatchEngine(), restoredMatches = [] } = {}) {
    this.#engine = matchEngine;
    for (const record of restoredMatches) {
      if (record?.gameId !== "finders-makers" || typeof record.code !== "string" || !record.state?.players) continue;
      this.#matches.set(record.code, structuredClone(record.state));
    }
  }

  has(roomCode) {
    return this.#matches.has(roomCode);
  }

  remove(roomCode) {
    return this.#matches.delete(roomCode);
  }

  start(room) {
    if (room.gameId !== "finders-makers") {
      throw new GameError("That room is not configured for Finders Makers.", "WRONG_GAME", 409);
    }
    if (this.#matches.has(room.code)) {
      throw new GameError("This Finders Makers match has already started.", "MATCH_STARTED", 409);
    }
    const players = room.players.map((player) => ({ seat: player.seat, name: player.name, type: "human" }));
    const match = this.#engine.createMatch(players);
    this.#matches.set(room.code, match);
    return match;
  }

  view(room) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this Finders Makers session.", "SEAT_NOT_FOUND", 404);
    const connections = new Map(room.players.map((player) => [player.seat, player.connected]));
    return this.#engine.viewFor(match, viewer.seat, connections);
  }

  act(room, action) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this Finders Makers session.", "SEAT_NOT_FOUND", 404);

    switch (action.type) {
      case "finders_search":
        this.#engine.search(match, viewer.seat, action.position);
        break;
      case "finders_begin_build":
        this.#engine.beginBuild(match, viewer.seat);
        break;
      case "finders_cancel_build":
        this.#engine.cancelBuild(match, viewer.seat);
        break;
      case "finders_attempt_build":
        this.#engine.attemptBuild(match, viewer.seat, action.positions);
        break;
      case "finders_next_round":
        this.#requireHost(viewer);
        this.#matches.set(room.code, this.#engine.nextRound(match));
        break;
      case "finders_start_sudden_death":
        this.#requireHost(viewer);
        this.#engine.startSuddenDeath(match);
        break;
      default:
        throw new GameError("That Finders Makers action is not supported.", "UNKNOWN_GAME_ACTION");
    }
    return this.#requireMatch(room.code);
  }

  runBotTurn() {
    return false;
  }

  replaceHumanWithBot() {
    // This MVP intentionally has no bot policy for private-memory play.
    return false;
  }

  snapshot(roomCode) {
    return structuredClone(this.#requireMatch(roomCode));
  }

  #requireHost(viewer) {
    if (viewer.role !== "host") throw new GameError("Only the host can continue this Finders Makers match.", "HOST_ONLY", 403);
  }

  #requireMatch(roomCode) {
    const match = this.#matches.get(roomCode);
    if (!match) throw new GameError("No Finders Makers match is active in this room.", "MATCH_NOT_ACTIVE", 409);
    return match;
  }
}
