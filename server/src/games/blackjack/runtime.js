import { GameError } from "../../game-error.js";
import { MatchEngine } from "./match-engine.js";

const BOT_NAMES = ["Cleo", "Rowan", "Sage"];
const BOT_STYLES = ["steady", "patient", "pressure"];

/**
 * Connects Blackjack's rules-only match engine to Cardcade's shared room
 * contract. The room system owns sessions, seats, readiness, and persistence;
 * this runtime only owns the authoritative Blackjack match state.
 */
export class BlackjackRuntime {
  #matches = new Map();
  #engine;

  constructor({ matchEngine = new MatchEngine(), restoredMatches = [] } = {}) {
    this.#engine = matchEngine;
    for (const record of restoredMatches) {
      if (record?.gameId !== "blackjack" || typeof record.code !== "string" || !record.state?.players) continue;
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
    if (room.gameId !== "blackjack") throw new GameError("That room is not configured for Blackjack.", "WRONG_GAME", 409);
    if (this.#matches.has(room.code)) throw new GameError("This Blackjack table has already started.", "MATCH_STARTED", 409);

    const players = room.players.map((player) => ({ seat: player.seat, name: player.name, type: "human" }));
    const occupied = new Set(players.map((player) => player.seat));
    const botCount = Number.isInteger(room.gameSettings?.botCount) ? room.gameSettings.botCount : 0;
    const capacity = Number.isInteger(room.capacity) ? room.capacity : 4;
    for (let index = 0; index < botCount; index += 1) {
      const seat = Array.from({ length: capacity }, (_, candidate) => candidate)
        .find((candidate) => !occupied.has(candidate));
      if (seat === undefined) break;
      occupied.add(seat);
      players.push({
        seat,
        name: BOT_NAMES[index] || `CPU ${index + 1}`,
        type: "bot",
        style: BOT_STYLES[index % BOT_STYLES.length]
      });
    }
    players.sort((left, right) => left.seat - right.seat);

    const match = this.#engine.createMatch(players);
    this.#matches.set(room.code, match);
    return match;
  }

  view(room) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this Blackjack session.", "SEAT_NOT_FOUND", 404);
    const connections = new Map(room.players.map((player) => [player.seat, player.connected]));
    return this.#engine.viewFor(match, viewer.seat, connections);
  }

  act(room, action) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this Blackjack session.", "SEAT_NOT_FOUND", 404);

    switch (action.type) {
      case "blackjack_hit":
        this.#engine.hit(match, viewer.seat);
        break;
      case "blackjack_stand":
        this.#engine.stand(match, viewer.seat);
        break;
      case "blackjack_double":
        this.#engine.double(match, viewer.seat);
        break;
      case "blackjack_split":
        this.#engine.split(match, viewer.seat);
        break;
      case "blackjack_surrender":
        this.#engine.surrender(match, viewer.seat);
        break;
      case "blackjack_insurance":
        this.#engine.insurance(match, viewer.seat, action.take === true);
        break;
      case "next_round":
        this.#nextRound(room.code, match, viewer);
        break;
      default:
        throw new GameError("That Blackjack action is not supported.", "UNKNOWN_GAME_ACTION");
    }
    return this.#requireMatch(room.code);
  }

  runBotTurn(roomCode) {
    return this.#engine.runBotTurn(this.#requireMatch(roomCode));
  }

  replaceHumanWithBot(roomCode, seat) {
    if (!this.#matches.has(roomCode)) return false;
    return this.#engine.replaceWithBot(this.#matches.get(roomCode), seat);
  }

  snapshot(roomCode) {
    return structuredClone(this.#requireMatch(roomCode));
  }

  #nextRound(roomCode, match, viewer) {
    if (!match.roundOver) throw new GameError("Finish the current Blackjack round first.", "ROUND_IN_PROGRESS", 409);
    if (viewer.role !== "host") throw new GameError("Only the host can start the next round.", "HOST_ONLY", 403);
    this.#matches.set(roomCode, this.#engine.nextRound(match));
  }

  #requireMatch(roomCode) {
    const match = this.#matches.get(roomCode);
    if (!match) throw new GameError("No Blackjack table is active in this room.", "MATCH_NOT_ACTIVE", 409);
    return match;
  }
}
