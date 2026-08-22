import { GameError } from "../../game-error.js";
import { MatchEngine } from "./match-engine.js";

const BOT_NAMES = ["Cleo", "Rowan", "Sage"];
const BOT_STYLES = ["steady", "patient", "pressure"];

/**
 * Connects Texas Hold'em's table engine to Cardcade's room contract. Rooms
 * keep their shared seat/session model; this runtime is only the private game
 * state adapter used equally by Solo, multiplayer, and Hot Seat.
 */
export class HoldemRuntime {
  #matches = new Map();
  #engine;

  constructor({ matchEngine = new MatchEngine(), restoredMatches = [] } = {}) {
    this.#engine = matchEngine;
    for (const record of restoredMatches) {
      if (record?.gameId !== "holdem" || typeof record.code !== "string" || !record.state?.players) continue;
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
    if (room.gameId !== "holdem") throw new GameError("That room is not configured for Texas Hold'em.", "WRONG_GAME", 409);
    if (this.#matches.has(room.code)) throw new GameError("This Texas Hold'em table has already started.", "MATCH_STARTED", 409);

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
    if (!viewer) throw new GameError("No private Poker view exists for this session.", "SEAT_NOT_FOUND", 404);
    const connections = new Map(room.players.map((player) => [player.seat, player.connected]));
    return this.#engine.viewFor(match, viewer.seat, connections);
  }

  act(room, action) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No private Poker view exists for this session.", "SEAT_NOT_FOUND", 404);

    switch (action.type) {
      case "holdem_fold":
        this.#engine.fold(match, viewer.seat);
        break;
      case "holdem_check":
        this.#engine.check(match, viewer.seat);
        break;
      case "holdem_call":
        this.#engine.call(match, viewer.seat);
        break;
      case "holdem_bet":
        this.#engine.bet(match, viewer.seat);
        break;
      case "holdem_raise":
        this.#engine.raise(match, viewer.seat);
        break;
      case "holdem_next_hand":
        this.#nextHand(room.code, match, viewer);
        break;
      default:
        throw new GameError("That Texas Hold'em action is not supported.", "UNKNOWN_GAME_ACTION");
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

  #nextHand(roomCode, match, viewer) {
    if (!match.roundOver) throw new GameError("Finish the current Poker hand first.", "ROUND_IN_PROGRESS", 409);
    if (viewer.role !== "host") throw new GameError("Only the host can deal the next Poker hand.", "HOST_ONLY", 403);
    this.#matches.set(roomCode, this.#engine.nextHand(match));
  }

  #requireMatch(roomCode) {
    const match = this.#matches.get(roomCode);
    if (!match) throw new GameError("No Texas Hold'em table is active in this room.", "MATCH_NOT_ACTIVE", 409);
    return match;
  }
}
