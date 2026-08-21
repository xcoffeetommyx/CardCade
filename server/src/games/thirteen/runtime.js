import { GameError } from "../../game-error.js";
import { MatchEngine } from "./match-engine.js";

const BOT_NAMES = ["Linh", "Bao", "Mai"];
const BOT_STYLES = ["steady", "pressure", "patient"];

export class ThirteenRuntime {
  #matches = new Map();
  #engine;

  constructor({ matchEngine = new MatchEngine(), restoredMatches = [] } = {}) {
    this.#engine = matchEngine;
    for (const record of restoredMatches) {
      if (record?.gameId !== "thirteen" || typeof record.code !== "string" || !record.state?.players) continue;
      this.#matches.set(record.code, structuredClone(record.state));
    }
  }

  has(roomCode) {
    return this.#matches.has(roomCode);
  }

  start(room) {
    if (room.gameId !== "thirteen") throw new GameError("That room is not configured for Thirteen.", "WRONG_GAME", 409);
    if (this.#matches.has(room.code)) throw new GameError("This Thirteen match has already started.", "MATCH_STARTED", 409);

    const players = room.players.map((player) => ({ seat: player.seat, name: player.name, type: "human" }));
    const occupied = new Set(players.map((player) => player.seat));
    for (let index = 0; index < room.gameSettings.botCount; index += 1) {
      const seat = Array.from({ length: room.capacity }, (_, candidate) => candidate).find((candidate) => !occupied.has(candidate));
      if (seat === undefined) break;
      occupied.add(seat);
      players.push({
        seat,
        name: BOT_NAMES[index] || `CPU ${index + 1}`,
        type: "bot",
        style: BOT_STYLES[index] || "steady"
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
    if (!viewer) throw new GameError("No player view exists for this session.", "SEAT_NOT_FOUND", 404);
    const connections = new Map(room.players.map((player) => [player.seat, player.connected]));
    return this.#engine.viewFor(match, viewer.seat, connections);
  }

  act(room, action) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this session.", "SEAT_NOT_FOUND", 404);

    switch (action.type) {
      case "play":
        this.#engine.play(match, viewer.seat, action.cardIds);
        break;
      case "pass":
        this.#engine.pass(match, viewer.seat);
        break;
      case "next_round":
        this.#nextRound(room.code, match, viewer);
        break;
      default:
        throw new GameError("That Thirteen action is not supported.", "UNKNOWN_GAME_ACTION");
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
    if (!match.roundOver) throw new GameError("The current round is still in progress.", "ROUND_IN_PROGRESS", 409);
    if (viewer.role !== "host") throw new GameError("Only the host can start the next round.", "HOST_ONLY", 403);

    const carryScores = new Map(match.players.map((player) => [player.seat, player.score]));
    const players = match.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      type: player.type,
      style: player.style
    }));
    const nextMatch = this.#engine.createMatch(players, { carryScores, round: match.round + 1 });
    this.#matches.set(roomCode, nextMatch);
    return nextMatch;
  }

  #requireMatch(roomCode) {
    const match = this.#matches.get(roomCode);
    if (!match) throw new GameError("No Thirteen match is active in this room.", "MATCH_NOT_ACTIVE", 409);
    return match;
  }
}
